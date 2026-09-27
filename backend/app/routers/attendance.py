import logging
import time
from threading import Lock

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from datetime import date
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from ..main import Attendance, AttendanceSession, ManualIn, Patch, Student, attendance_out, audit, broadcast, localnow, require, user_dep
from ..services.face_recognition import face_recognition_service
from ..services.notifications import notification_service
router=APIRouter(tags=['Attendance'])
logger = logging.getLogger(__name__)
_scan_cooldowns: dict[tuple[int, int, str], float] = {}
_scan_lock = Lock()


def fail(c,m,code='REQUEST_ERROR'):raise HTTPException(c,{'success':False,'message':m,'errors':{},'code':code})
def take(db,student_id,mode,method,user,confidence=None,notes=None):
 s=db.get(Student,student_id)
 if not s or not s.is_active:fail(404,'Siswa aktif tidak ditemukan.')
 a=db.scalar(select(Attendance).where(Attendance.student_id==student_id,Attendance.attendance_date==localnow().date()))
 if mode=='CHECK_IN':
  if a and a.check_in_time:fail(409,'Siswa sudah melakukan check-in.')
  if not a:a=Attendance(student_id=student_id,attendance_date=localnow().date(),status='PRESENT',created_by=user.id);db.add(a)
  a.check_in_time=localnow();a.check_in_method=method
 elif mode=='CHECK_OUT':
  if not a or not a.check_in_time:fail(422,'Check-out ditolak karena siswa belum check-in.')
  if a.check_out_time:fail(409,'Siswa sudah melakukan check-out.')
  a.check_out_time=localnow();a.check_out_method=method
 else:fail(422,'Mode absensi tidak valid.')
 a.confidence_score=confidence or a.confidence_score;a.notes=notes or a.notes;a.updated_by=user.id;db.flush();return a


async def publish_parent_notifications(rows):
 try:
  await notification_service.publish(rows)
 except Exception:
  logger.exception('Attendance persisted but Parent realtime delivery failed')


@router.post('/api/attendance/manual')
async def manual(body:ManualIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 a=take(db,body.student_id,body.mode,'MANUAL',u,notes=body.reason);notifications=notification_service.attendance_transition(db,a,body.mode);audit(db,u,'MANUAL_ATTENDANCE','Attendance',a.id,body.reason);db.commit();await publish_parent_notifications(notifications);await broadcast('ATTENDANCE_SUCCESS',{'student_id':a.student_id,'student_name':a.student.full_name,'mode':body.mode,'confidence':None});return {'success':True,'data':attendance_out(a)}
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

  result = face_recognition_service.recognize_image(content, db)
  if result.status != 'RECOGNIZED' or result.student_id is None:
    logger.info('Face scan rejected status=%s total_ms=%.2f', result.status, result.timings_ms.get('total', 0.0))
    messages = {
      'UNKNOWN_FACE': 'Wajah tidak dikenali.',
      'AMBIGUOUS_FACE': 'Identitas wajah belum cukup meyakinkan.',
      'FACE_NOT_DETECTED': 'Wajah belum terdeteksi.',
      'MULTIPLE_FACES': 'Pastikan hanya satu orang di depan kamera.',
      'FACE_TOO_BLURRY': 'Gambar terlalu buram.',
      'FACE_TOO_DARK': 'Pencahayaan terlalu gelap.',
      'FACE_TOO_BRIGHT': 'Pencahayaan terlalu terang.',
      'FACE_TOO_SMALL': 'Dekatkan wajah ke kamera.',
      'FACE_OUT_OF_FRAME': 'Posisikan wajah sepenuhnya di dalam frame.',
      'NO_ENROLLED_FACES': 'Belum ada wajah siswa yang terdaftar.',
      'ENGINE_NOT_READY': 'Mesin pengenalan wajah belum siap.',
      'INVALID_IMAGE': 'File gambar tidak valid.',
    }
    status_code = 503 if result.status in ('ENGINE_NOT_READY', 'NO_ENROLLED_FACES') else 422
    fail(status_code, messages.get(result.status, 'Pengenalan wajah gagal.'), result.status)

  key = (result.student_id, session.id, session.mode)
  with _scan_lock:
    now = time.monotonic()
    cooldown = max(0, settings.face_scan_cooldown_seconds)
    _scan_cooldowns.update({k: v for k, v in list(_scan_cooldowns.items()) if now - v < max(cooldown, 60)})
    if key in _scan_cooldowns and now - _scan_cooldowns[key] < cooldown:
      fail(409, 'Wajah baru saja dipindai.', 'DUPLICATE_SCAN')
    try:
      attendance_record = take(db, result.student_id, session.mode, 'FACE', u)
      notifications = notification_service.attendance_transition(db, attendance_record, session.mode)
      audit(db, u, 'SCAN', 'Attendance', attendance_record.id, 'Absensi wajah')
      db.commit()
    except HTTPException as exc:
      db.rollback()
      if exc.status_code == 409:
        fail(409, 'Wajah sudah dipindai untuk mode sesi ini.', 'DUPLICATE_SCAN')
      raise
    except Exception:
      db.rollback()
      raise
    _scan_cooldowns[key] = time.monotonic()

  data = attendance_out(attendance_record)
  data.update({'mode': session.mode, 'method': 'FACE', 'similarity': result.similarity, 'faceBox': result.face_box, 'recordedAt': localnow().isoformat()})
  event = {
    'student_id': attendance_record.student_id,
    'student_name': attendance_record.student.full_name,
    'nis': attendance_record.student.nis,
    'class_name': attendance_record.student.classroom.name,
    'mode': session.mode,
    'confidence': None,
    'similarity': result.similarity,
    'method': 'FACE',
  }
  try:
    await broadcast('ATTENDANCE_SUCCESS', event)
  except Exception:
    logger.exception('Attendance committed but scan broadcast failed for student_id=%s', attendance_record.student_id)
  await publish_parent_notifications(notifications)
  logger.info(
    'Face scan recorded student_id=%s mode=%s index_ms=%.2f detection_ms=%.2f embedding_ms=%.2f matching_ms=%.2f total_ms=%.2f',
    attendance_record.student_id,
    session.mode,
    result.timings_ms.get('index', 0.0),
    result.timings_ms.get('detection', 0.0),
    result.timings_ms.get('embedding', 0.0),
    result.timings_ms.get('matching', 0.0),
    result.timings_ms.get('total', 0.0),
  )
  return {'success': True, 'data': data}
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
