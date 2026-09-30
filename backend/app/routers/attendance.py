import logging
import time
from threading import Lock

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from datetime import date, time as datetime_time
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, model_validator
from ..config import settings
from ..database import get_db
from ..main import Attendance, AttendanceSession, ManualIn, Patch, Student, attendance_out, audit, broadcast, localnow, require, user_dep
from ..models import AttendanceSchedule
from ..services.attendance_schedule import get_schedule, recalculate_today
from ..services.face_recognition import face_recognition_service
from ..services.notifications import notification_service
router=APIRouter(tags=['Attendance'])
logger = logging.getLogger(__name__)
_scan_cooldowns: dict[tuple[int, int, str], float] = {}
_scan_lock = Lock()


class AttendanceScheduleIn(BaseModel):
  checkInDeadline: str = Field(pattern=r'^\d{2}:\d{2}$')
  checkOutStart: str = Field(pattern=r'^\d{2}:\d{2}$')

  @model_validator(mode='after')
  def validate_times(self):
    try:
      check_in = datetime_time.fromisoformat(self.checkInDeadline)
      check_out = datetime_time.fromisoformat(self.checkOutStart)
    except ValueError as exc:
      raise ValueError('Waktu harus menggunakan format HH:MM yang valid.') from exc
    if check_out <= check_in:
      raise ValueError('Jam pulang harus setelah batas masuk.')
    return self


def fail(c,m,code='REQUEST_ERROR',telemetry=None,data=None):
 detail={'success':False,'message':m,'errors':{},'code':code}
 if settings.app_env!='production' and telemetry:detail['telemetry']=telemetry
 if data is not None:detail['data']=data
 raise HTTPException(c,detail)
def take(db,student_id,mode,method,user,confidence=None,notes=None):
 s=db.get(Student,student_id)
 if not s or not s.is_active:fail(404,'Siswa aktif tidak ditemukan.')
 schedule=get_schedule(db)
 now=localnow()
 a=db.scalar(select(Attendance).where(Attendance.student_id==student_id,Attendance.attendance_date==localnow().date()))
 if mode=='CHECK_IN':
  if a and a.check_in_time:fail(409,'Siswa sudah melakukan check-in.')
  if not a:a=Attendance(student_id=student_id,attendance_date=now.date(),status='PRESENT',created_by=user.id);db.add(a)
  a.check_in_time=now;a.check_in_method=method
  a.status='LATE' if now.time()>datetime_time.fromisoformat(schedule['checkInDeadline']) else 'PRESENT'
 elif mode=='CHECK_OUT':
  if not a or not a.check_in_time:fail(422,'Check-out ditolak karena siswa belum check-in.')
  if a.check_out_time:fail(409,'Siswa sudah melakukan check-out.')
  if now.time()<datetime_time.fromisoformat(schedule['checkOutStart']):fail(422,f"Presensi pulang belum dibuka. Mulai pukul {schedule['checkOutStart']}.",'CHECK_OUT_TOO_EARLY')
  a.check_out_time=now;a.check_out_method=method
 else:fail(422,'Mode absensi tidak valid.')
 a.confidence_score=confidence or a.confidence_score;a.notes=notes or a.notes;a.updated_by=user.id;db.flush();return a


@router.get('/api/attendance/settings')
def attendance_settings(db:Session=Depends(get_db),u=Depends(user_dep)):
 return {'success':True,'data':get_schedule(db)}


@router.put('/api/attendance/settings')
async def update_attendance_settings(body:AttendanceScheduleIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 row=db.get(AttendanceSchedule,1)
 if row is None:
  row=AttendanceSchedule(id=1,check_in_deadline=body.checkInDeadline,check_out_start=body.checkOutStart,updated_by=u.id)
  db.add(row)
 else:
  row.check_in_deadline=body.checkInDeadline
  row.check_out_start=body.checkOutStart
  row.updated_by=u.id
 db.flush()
 updated_count=recalculate_today(db,today=localnow().date(),deadline=body.checkInDeadline,user_id=u.id)
 db.commit()
 schedule={**get_schedule(db),'updatedCount':updated_count}
 await broadcast('ATTENDANCE_SCHEDULE_UPDATED',schedule)
 return {'success':True,'data':schedule}


async def publish_parent_notifications(rows):
 try:
  await notification_service.publish(rows)
 except Exception:
  logger.exception('Attendance persisted but Parent realtime delivery failed')


@router.post('/api/attendance/manual')
async def manual(body:ManualIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 a=take(db,body.student_id,body.mode,'MANUAL',u,notes=body.reason);notifications=notification_service.attendance_transition(db,a,body.mode);audit(db,u,'MANUAL_ATTENDANCE','Attendance',a.id,body.reason);db.commit();await publish_parent_notifications(notifications);await broadcast('ATTENDANCE_SUCCESS',{'attendance_id':a.id,'recorded_at':localnow().isoformat(),'status':a.status,'student_id':a.student_id,'student_name':a.student.full_name,'nis':a.student.nis,'class_name':a.student.classroom.name,'mode':body.mode,'confidence':None});return {'success':True,'data':attendance_out(a)}
@router.post('/api/attendance/scan')
async def scan(session_id: int = Form(...), image: UploadFile = File(...), db: Session = Depends(get_db), u=Depends(require('ADMIN_IT', 'GURU_PIKET'))):
  session = db.get(AttendanceSession, session_id)
  if not session or session.status != 'ACTIVE' or session.session_date.date() != localnow().date():
    fail(422, 'Sesi absensi tidak aktif.', 'SESSION_NOT_ACTIVE')
  if session.mode not in ('CHECK_IN', 'CHECK_OUT'):
    fail(422, 'Mode sesi absensi tidak valid.', 'INVALID_SESSION_MODE')
  if not image.content_type or not image.content_type.startswith('image/'):
    fail(422, 'File harus berupa gambar.', 'INVALID_IMAGE')
  content = await image.read(settings.max_upload_mb * 1024 * 1024 + 1)
  if not content or len(content) > settings.max_upload_mb * 1024 * 1024:
    fail(413 if content else 422, 'Ukuran gambar tidak valid.', 'IMAGE_TOO_LARGE' if content else 'INVALID_IMAGE')

  results = face_recognition_service.recognize_image_many(content, db, session_id=session.id)
  if len(results) == 1 and (results[0].status != 'RECOGNIZED' or results[0].student_id is None):
    result = results[0]
    logger.info('Face scan rejected status=%s total_ms=%.2f', result.status, result.timings_ms.get('total', 0.0))
    messages = {
      'UNKNOWN_FACE': 'Wajah tidak dikenali.',
      'AMBIGUOUS_FACE': 'Identitas belum yakin. Mencoba kembali...',
      'FACE_NOT_DETECTED': 'Wajah belum terdeteksi.',
      'MULTIPLE_FACES': 'Pastikan hanya satu orang di depan kamera.',
      'FACE_TOO_BLURRY': 'Wajah kurang jelas. Tahan posisi sebentar.',
      'FACE_BAD_POSE': 'Hadapkan wajah langsung ke kamera.',
      'FACE_LOW_CONFIDENCE': 'Posisikan wajah lebih jelas di depan kamera.',
      'FACE_TOO_DARK': 'Pencahayaan terlalu gelap.',
      'FACE_TOO_BRIGHT': 'Pencahayaan terlalu terang.',
      'FACE_TOO_SMALL': 'Wajah terlalu kecil. Mendekat sedikit ke kamera.',
      'FACE_OUT_OF_FRAME': 'Posisikan seluruh wajah di dalam frame.',
      'NO_ENROLLED_FACES': 'Belum ada wajah siswa yang terdaftar.',
      'ENGINE_NOT_READY': 'Mesin pengenalan wajah belum siap.',
      'INVALID_IMAGE': 'File gambar tidak valid.',
    }
    status_code = 503 if result.status in ('ENGINE_NOT_READY', 'NO_ENROLLED_FACES') else 422
    tracker = face_recognition_service._trackers.get(session.id)
    track = tracker.get_track(result.track_id) if tracker and result.track_id is not None else None
    face_state = track.state if track else result.track_state
    liveness_state = track.liveness_state if track else result.liveness_state
    face_payload = {
      'trackId': result.track_id,
      'faceBox': result.face_box,
      'recognitionStatus': result.status,
      'trackState': face_state,
      'state': face_state,
      'livenessState': liveness_state,
      'liveness': liveness_state,
      'evidenceCount': track.evidence_count if track else result.evidence_count,
      'status': result.status,
      'similarity': result.similarity,
      'quality': result.telemetry.get('quality_status'),
      'attendanceStatus': 'NOT_RECORDED',
      'message': messages.get(result.status, 'Pengenalan wajah gagal.'),
      'errorCode': result.status,
    }
    fail(status_code, messages.get(result.status, 'Pengenalan wajah gagal.'), result.status,
         telemetry=result.telemetry,
         data={'livenessMode': 'PASSIVE' if settings.face_liveness_enabled else 'MANUAL_ONLY',
               'faces': [face_payload], 'attendances': []})

  faces_payload = []
  attendance_records = []
  legacy_result = None

  for result in results:
    face_payload = {
      'trackId': result.track_id,
      'status': result.status,
      'recognitionStatus': result.status,
      'faceBox': result.face_box,
      'similarity': result.similarity,
      'trackState': result.track_state,
      'state': result.track_state,
      'livenessState': result.liveness_state,
      'liveness': result.liveness_state,
      'evidenceCount': result.evidence_count,
      'quality': result.telemetry.get('quality_status'),
      'attendanceStatus': 'NOT_RECORDED',
    }
    tracker = face_recognition_service._trackers.get(session.id)
    track = tracker.get_track(result.track_id) if tracker and result.track_id is not None else None
    if track is not None:
      face_payload.update({
        'trackState': track.state,
        'state': track.state,
        'livenessState': track.liveness_state,
        'liveness': track.liveness_state,
        'evidenceCount': track.evidence_count,
      })
    if settings.app_env != 'production' and result.telemetry:
      face_payload['telemetry'] = result.telemetry

    if result.status != 'RECOGNIZED' or result.student_id is None:
      faces_payload.append(face_payload)
      continue

    identity_verified = bool(
      track
      and track.verified_student_id == result.student_id
      and track.state in ('VERIFIED', 'ATTENDED')
    )
    if not identity_verified:
      face_payload.update({
        'status': 'VERIFYING',
        'trackState': 'VERIFYING' if not track or track.state == 'TRACKING' else track.state,
        'state': 'VERIFYING' if not track or track.state == 'TRACKING' else track.state,
        'attendanceStatus': 'NOT_RECORDED',
        'errorCode': 'IDENTITY_NOT_VERIFIED',
        'message': 'Identitas masih diverifikasi.',
      })
      faces_payload.append(face_payload)
      continue

    live_state = track.liveness_state
    if not settings.face_liveness_enabled or live_state != 'LIVE':
      face_payload.update({
        'status': live_state if settings.face_liveness_enabled else 'MANUAL_ONLY',
        'livenessState': live_state,
        'liveness': live_state,
        'attendanceStatus': 'NOT_RECORDED',
        'errorCode': 'LIVENESS_DISABLED' if not settings.face_liveness_enabled else live_state,
        'message': 'Presensi otomatis nonaktif; minta petugas memverifikasi.' if not settings.face_liveness_enabled else 'Menunggu verifikasi liveness.',
      })
      faces_payload.append(face_payload)
      continue

    student = db.get(Student, result.student_id)
    if not student or not student.is_active:
      face_payload.update({'status': 'STUDENT_INACTIVE', 'attendanceStatus': 'NOT_RECORDED'})
      faces_payload.append(face_payload)
      continue
    face_payload['studentName'] = student.full_name

    key = (result.student_id, session.id, session.mode)
    with _scan_lock:
      now = time.monotonic()
      cooldown = max(0, settings.face_scan_cooldown_seconds)
      _scan_cooldowns.update({k: v for k, v in list(_scan_cooldowns.items()) if now - v < max(cooldown, 60)})
      tracker = face_recognition_service._trackers.get(session.id)
      track = tracker.get_track(result.track_id) if tracker and result.track_id is not None else None
      duplicate = bool(track and track.attendance_attempted) or (key in _scan_cooldowns and now - _scan_cooldowns[key] < cooldown)
      attendance_record = None
      notifications = []
      if not duplicate:
        try:
          attendance_record = take(db, result.student_id, session.mode, 'FACE', u)
          notifications = notification_service.attendance_transition(db, attendance_record, session.mode)
          audit(db, u, 'SCAN', 'Attendance', attendance_record.id, 'Absensi wajah')
          db.commit()
          _scan_cooldowns[key] = time.monotonic()
        except HTTPException as exc:
          db.rollback()
          if exc.status_code == 409:
            duplicate = True
          elif exc.detail.get('code') == 'CHECK_OUT_TOO_EARLY':
            face_payload.update({
              'status': 'CHECK_OUT_TOO_EARLY',
              'attendanceStatus': 'NOT_RECORDED',
              'errorCode': 'CHECK_OUT_TOO_EARLY',
              'message': exc.detail['message'],
              'trackState': track.state,
              'state': track.state,
            })
          else:
            face_payload.update({'status': 'ATTENDANCE_ERROR', 'attendanceStatus': 'NOT_RECORDED'})
        except Exception:
          db.rollback()
          logger.exception('Attendance transaction failed for student_id=%s', result.student_id)
          face_payload.update({'status': 'ATTENDANCE_ERROR', 'attendanceStatus': 'NOT_RECORDED'})
      if (duplicate or attendance_record is not None) and result.track_id is not None:
        face_recognition_service.mark_attendance_attempted(session.id, result.track_id)
        if track and track.state == 'ATTENDED':
          face_payload.update({'trackState': 'ATTENDED', 'state': 'ATTENDED'})

    if duplicate:
      face_payload.update({'status': 'DUPLICATE_SCAN', 'attendanceStatus': 'ALREADY_RECORDED'})
      faces_payload.append(face_payload)
      continue
    if attendance_record is None:
      faces_payload.append(face_payload)
      continue

    data = attendance_out(attendance_record)
    data.update({'mode': session.mode, 'method': 'FACE', 'similarity': result.similarity, 'faceBox': result.face_box, 'recordedAt': localnow().isoformat()})
    if settings.app_env != 'production' and result.telemetry:
      data['telemetry'] = result.telemetry
    face_payload.update({
      'attendanceStatus': 'RECORDED',
      'studentId': str(attendance_record.student_id),
      'studentName': attendance_record.student.full_name,
      'nis': attendance_record.student.nis,
      'className': attendance_record.student.classroom.name,
      'attendance': data,
    })
    faces_payload.append(face_payload)
    attendance_records.append(data)
    if legacy_result is None:
      legacy_result = data

    event = {
      'student_id': attendance_record.student_id,
      'student_name': attendance_record.student.full_name,
      'nis': attendance_record.student.nis,
      'class_name': attendance_record.student.classroom.name,
      'mode': session.mode,
      'confidence': None,
      'similarity': result.similarity,
      'method': 'FACE',
      'track_id': result.track_id,
      'session_id': session.id,
      'attendance_id': attendance_record.id,
      'recorded_at': data['recordedAt'],
      'status': attendance_record.status,
    }
    try:
      await broadcast('ATTENDANCE_SUCCESS', event)
    except Exception:
      logger.exception('Attendance committed but scan broadcast failed for student_id=%s', attendance_record.student_id)
    await publish_parent_notifications(notifications)

  if legacy_result is not None:
    response_data = {**legacy_result, 'faces': faces_payload, 'attendances': attendance_records}
  else:
    response_data = {'faces': faces_payload, 'attendances': attendance_records}
  response_data['livenessMode'] = 'PASSIVE' if settings.face_liveness_enabled else 'MANUAL_ONLY'
  return {'success': True, 'data': response_data}
@router.get('/api/attendance')
def attendance(today:bool=False,date_from:date|None=None,date_to:date|None=None,status:str|None=None,db:Session=Depends(get_db),u=Depends(user_dep)):
 q=select(Attendance).order_by(Attendance.attendance_date.desc())
 if today:q=q.where(Attendance.attendance_date==localnow().date())
 if date_from:q=q.where(Attendance.attendance_date>=date_from)
 if date_to:q=q.where(Attendance.attendance_date<=date_to)
 if status:q=q.where(Attendance.status==status)
 return {'success':True,'data':[attendance_out(a) for a in db.scalars(q).all()]}
@router.patch('/api/attendance/{id}/correction')
async def correct_attendance(id:int,body:Patch,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 a=db.get(Attendance,id)
 if not a:fail(404,'Rekam presensi tidak ditemukan.')
 if not body.status or not body.notes:fail(422,'Status dan alasan koreksi wajib diisi.')
 if body.status not in ('PRESENT','LATE','SICK','EXCUSED','UNEXCUSED'):fail(422,'Status presensi tidak valid.')
 before=(a.status,a.check_in_time,a.check_out_time);a.status=body.status;a.notes=body.notes;a.check_in_time=body.check_in_time or a.check_in_time;a.check_out_time=body.check_out_time or a.check_out_time;a.updated_by=u.id
 notifications=[]
 if before!=(a.status,a.check_in_time,a.check_out_time):notifications=notification_service.create_for_student(db,student=a.student,notification_type='ATTENDANCE_CORRECTED',title='Data presensi diperbarui',message=f'Data presensi {a.student.full_name} telah diperbarui oleh petugas.',payload={'attendance_id':a.id,'status':a.status})
 audit(db,u,'CORRECT','Attendance',a.id,body.notes);db.commit();await publish_parent_notifications(notifications);await broadcast('ATTENDANCE_CORRECTED',{'attendance_id':a.id,'student_id':a.student_id,'status':a.status});return {'success':True,'data':attendance_out(a)}
@router.get('/api/attendance/summary')
def summary(db:Session=Depends(get_db),u=Depends(user_dep)):return {'success':True,'data':{'today':db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==localnow().date())) or 0,'students':db.scalar(select(func.count()).select_from(Student).where(Student.is_active==True)) or 0}}
