"""MVP route extension. Run with: uvicorn app.full:app --reload"""
from datetime import date, datetime
from fastapi import Depends, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse
import jwt
from .config import settings
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session
from .main import app, get_db, user_dep, require, localnow, audit, AttendanceSession, Attendance, LeaveRequest, Student, User, ClassRoom, Guardian, attendance_out, clients, broadcast, Patch, AuditLog
from pydantic import BaseModel, Field

class SessionIn(BaseModel): mode:str; camera_source:str='0'
class ManualIn(BaseModel): student_id:int; mode:str; reason:str=Field(min_length=3)
class ScanIn(BaseModel): session_id:int; student_id:int; confidence_score:float=Field(ge=0,le=1)
class LeaveIn(BaseModel): student_id:int; leave_date:date; leave_type:str; reason:str=Field(min_length=3)
def fail(code,msg): raise HTTPException(code,{'success':False,'message':msg,'errors':{},'code':'REQUEST_ERROR'})
def import_result(rows, db):
    required={'nis','nama','kelas','jurusan','nama_wali','nomor_wali'}
    if not rows or not required.issubset(rows[0]):
        return None, {'total_rows':len(rows),'valid_rows':0,'invalid_rows':len(rows),'rows':[],'header_error':'Kolom wajib: nis,nama,kelas,jurusan,nama_wali,nomor_wali'}
    seen=set(); details=[]
    for number,row in enumerate(rows,2):
        errors=[];nis=row['nis'].strip()
        if not nis: errors.append({'field':'nis','message':'NIS wajib diisi'})
        elif nis in seen: errors.append({'field':'nis','message':'NIS duplikat dalam file'})
        elif db.scalar(select(Student.id).where(Student.nis==nis)): errors.append({'field':'nis','message':'NIS sudah terdaftar'})
        seen.add(nis)
        if not db.scalar(select(ClassRoom.id).where(ClassRoom.name==row['kelas'].strip(),ClassRoom.major==row['jurusan'].strip())):errors.append({'field':'kelas','message':'Kelas atau jurusan tidak ditemukan'})
        if not row['nomor_wali'].strip().startswith(('0','62','+62')):errors.append({'field':'nomor_wali','message':'Nomor telepon Indonesia tidak valid'})
        details.append({'row_number':number,'valid':not errors,'errors':errors,'data':row})
    return details, {'total_rows':len(rows),'valid_rows':sum(x['valid'] for x in details),'invalid_rows':sum(not x['valid'] for x in details),'rows':details}
def take(db, student_id, mode, method, user, confidence=None, notes=None):
    s=db.get(Student,student_id)
    if not s or not s.is_active: fail(404,'Siswa aktif tidak ditemukan.')
    a=db.scalar(select(Attendance).where(Attendance.student_id==student_id,Attendance.attendance_date==localnow().date()))
    if mode=='CHECK_IN':
        if a and a.check_in_time: fail(409,'Siswa sudah melakukan check-in.')
        if not a: a=Attendance(student_id=student_id,attendance_date=localnow().date(),status='PRESENT',created_by=user.id); db.add(a)
        a.check_in_time=localnow();a.check_in_method=method
    elif mode=='CHECK_OUT':
        if not a or not a.check_in_time: fail(422,'Check-out ditolak karena siswa belum check-in.')
        if a.check_out_time: fail(409,'Siswa sudah melakukan check-out.')
        a.check_out_time=localnow();a.check_out_method=method
    else: fail(422,'Mode absensi tidak valid.')
    a.confidence_score=confidence or a.confidence_score;a.notes=notes or a.notes;a.updated_by=user.id;db.flush();return a
@app.post('/api/attendance-sessions/open')
async def open_session(body:SessionIn,db:Session=Depends(get_db),u:User=Depends(require('ADMIN_IT','GURU_PIKET'))):
    if body.mode not in ('CHECK_IN','CHECK_OUT'):fail(422,'Mode harus CHECK_IN atau CHECK_OUT.')
    if db.scalar(select(AttendanceSession).where(AttendanceSession.status=='ACTIVE',AttendanceSession.mode==body.mode,AttendanceSession.camera_source==body.camera_source)):fail(409,'Sesi aktif untuk mode dan kamera ini sudah ada.')
    x=AttendanceSession(mode=body.mode,camera_source=body.camera_source,opened_by=u.id);db.add(x);db.flush();audit(db,u,'OPEN','AttendanceSession',x.id,'Membuka sesi');db.commit();await broadcast('SESSION_OPENED',{'session_id':x.id,'mode':x.mode});return {'success':True,'data':{'id':str(x.id),'mode':x.mode,'status':x.status}}
@app.get('/api/attendance-sessions/active')
def active_session(db:Session=Depends(get_db),u=Depends(user_dep)):
    x=db.scalar(select(AttendanceSession).where(AttendanceSession.status=='ACTIVE').order_by(AttendanceSession.opened_at.desc()))
    return {'success':True,'data':None if not x else {'id':str(x.id),'mode':x.mode,'status':x.status,'cameraSource':x.camera_source,'openedAt':x.opened_at.isoformat()}}
@app.post('/api/attendance-sessions/{id}/close')
async def close_session(id:int,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    x=db.get(AttendanceSession,id)
    if not x or x.status!='ACTIVE':fail(404,'Sesi aktif tidak ditemukan.')
    x.status='CLOSED';x.closed_at=localnow();audit(db,u,'CLOSE','AttendanceSession',id,'Menutup sesi');db.commit();await broadcast('SESSION_CLOSED',{'session_id':id});return {'success':True}
@app.post('/api/attendance/manual')
async def manual(body:ManualIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    a=take(db,body.student_id,body.mode,'MANUAL',u,notes=body.reason);audit(db,u,'MANUAL_ATTENDANCE','Attendance',a.id,body.reason);db.commit();await broadcast('ATTENDANCE_SUCCESS',{'student_id':a.student_id,'student_name':a.student.full_name,'mode':body.mode,'confidence':None});return {'success':True,'data':attendance_out(a)}
@app.post('/api/attendance/scan')
async def scan(body:ScanIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    sess=db.get(AttendanceSession,body.session_id)
    if not sess or sess.status!='ACTIVE':fail(422,'Sesi absensi tidak aktif.')
    a=take(db,body.student_id,sess.mode,'FACE',u,body.confidence_score);audit(db,u,'SCAN','Attendance',a.id,'Absensi wajah');db.commit();await broadcast('ATTENDANCE_SUCCESS',{'student_id':a.student_id,'student_name':a.student.full_name,'mode':sess.mode,'confidence':body.confidence_score});return {'success':True,'data':attendance_out(a)}
@app.get('/api/attendance')
def attendance(today:bool=False, date_from:date|None=None, date_to:date|None=None, status:str|None=None, db:Session=Depends(get_db),u=Depends(user_dep)):
    query=select(Attendance).order_by(Attendance.attendance_date.desc())
    if today: query=query.where(Attendance.attendance_date==localnow().date())
    if date_from: query=query.where(Attendance.attendance_date>=date_from)
    if date_to: query=query.where(Attendance.attendance_date<=date_to)
    if status: query=query.where(Attendance.status==status)
    return {'success':True,'data':[attendance_out(a) for a in db.scalars(query).all()]}
@app.patch('/api/attendance/{id}/correction')
async def correct_attendance(id:int,body:Patch,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    a=db.get(Attendance,id)
    if not a: fail(404,'Rekam presensi tidak ditemukan.')
    if not body.status or not body.notes: fail(422,'Status dan alasan koreksi wajib diisi.')
    if body.status not in ('PRESENT','LATE','SICK','EXCUSED','UNEXCUSED'): fail(422,'Status presensi tidak valid.')
    a.status=body.status;a.notes=body.notes;a.check_in_time=body.check_in_time or a.check_in_time;a.check_out_time=body.check_out_time or a.check_out_time;a.updated_by=u.id
    audit(db,u,'CORRECT','Attendance',a.id,body.notes);db.commit();await broadcast('ATTENDANCE_CORRECTED',{'attendance_id':a.id,'student_id':a.student_id,'status':a.status})
    return {'success':True,'data':attendance_out(a)}
@app.get('/api/attendance/summary')
def summary(db:Session=Depends(get_db),u=Depends(user_dep)): return {'success':True,'data':{'today':db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==localnow().date())) or 0,'students':db.scalar(select(func.count()).select_from(Student).where(Student.is_active==True)) or 0}}
@app.get('/api/dashboard/admin')
def admin_dashboard(db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    today=localnow().date()
    return {'success':True,'data':{
      'activeStudents':db.scalar(select(func.count()).select_from(Student).where(Student.is_active==True)) or 0,
      'activeClasses':db.scalar(select(func.count()).select_from(ClassRoom).where(ClassRoom.is_active==True)) or 0,
      'activeDutyTeachers':db.scalar(select(func.count()).select_from(User).where(User.role=='GURU_PIKET',User.is_active==True)) or 0,
      'facesRegistered':db.scalar(select(func.count()).select_from(Student).where(Student.is_active==True,Student.face_enrollment_status=='REGISTERED')) or 0,
      'facesUnregistered':db.scalar(select(func.count()).select_from(Student).where(Student.is_active==True,Student.face_enrollment_status!='REGISTERED')) or 0,
      'presentToday':db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==today,Attendance.status.in_(['PRESENT','LATE']))) or 0,
      'lateToday':db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==today,Attendance.status=='LATE')) or 0,
      'pendingLeaves':db.scalar(select(func.count()).select_from(LeaveRequest).where(LeaveRequest.status=='PENDING')) or 0,
      'activeSessions':db.scalar(select(func.count()).select_from(AttendanceSession).where(AttendanceSession.status=='ACTIVE')) or 0,
    }}
@app.get('/api/dashboard/teacher')
def teacher_dashboard(db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    today=localnow().date(); students=db.scalar(select(func.count()).select_from(Student).where(Student.is_active==True)) or 0
    records=db.scalars(select(Attendance).where(Attendance.attendance_date==today).order_by(Attendance.updated_at.desc()).limit(10)).all()
    active=db.scalar(select(AttendanceSession).where(AttendanceSession.status=='ACTIVE').order_by(AttendanceSession.opened_at.desc()))
    present=sum(r.status in ('PRESENT','LATE') for r in records)
    return {'success':True,'data':{'session':None if not active else {'id':str(active.id),'mode':active.mode,'cameraSource':active.camera_source,'status':active.status},'presentToday':db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==today,Attendance.status.in_(['PRESENT','LATE']))) or 0,'lateToday':db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==today,Attendance.status=='LATE')) or 0,'excusedToday':db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==today,Attendance.status.in_(['SICK','EXCUSED']))) or 0,'notPresent':max(0,students-(db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==today)) or 0)),'recentAttendance':[attendance_out(x) for x in records],'faceEngine':'NOT_CONFIGURED'}}
@app.get('/api/reports/attendance.csv')
def attendance_csv(date_from:date|None=None,date_to:date|None=None,class_id:int|None=None,student_id:int|None=None,status:str|None=None,db:Session=Depends(get_db),u=Depends(user_dep)):
    q=select(Attendance).join(Student).order_by(Attendance.attendance_date.desc())
    if date_from:q=q.where(Attendance.attendance_date>=date_from)
    if date_to:q=q.where(Attendance.attendance_date<=date_to)
    if class_id:q=q.where(Student.class_id==class_id)
    if student_id:q=q.where(Attendance.student_id==student_id)
    if status:q=q.where(Attendance.status==status)
    out=io.StringIO();writer=csv.writer(out);writer.writerow(['Tanggal','NIS','Nama','Kelas','Jam Masuk','Jam Pulang','Status','Metode Masuk','Metode Pulang','Catatan'])
    for a in db.scalars(q):writer.writerow([a.attendance_date,a.student.nis,a.student.full_name,a.student.classroom.name,a.check_in_time.isoformat() if a.check_in_time else '',a.check_out_time.isoformat() if a.check_out_time else '',a.status,a.check_in_method or '',a.check_out_method or '',a.notes or ''])
    filename=f'tandara-laporan-{localnow().date().isoformat()}.csv'
    return StreamingResponse(iter([out.getvalue()]),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':f'attachment; filename="{filename}"'})
@app.get('/api/students/import-template.csv')
def import_template(u=Depends(require('ADMIN_IT'))):
    return StreamingResponse(iter(['nis,nama,kelas,jurusan,nama_wali,nomor_wali\n']),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="tandara-template-siswa.csv"'})
@app.post('/api/students/import/preview')
async def import_preview(file:UploadFile=File(...),db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    if not file.filename or not file.filename.lower().endswith('.csv'):fail(415,'File harus CSV.')
    raw=await file.read()
    if len(raw)>settings.max_upload_mb*1024*1024:fail(413,'Ukuran file melebihi batas.')
    try: rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    except UnicodeDecodeError:fail(422,'CSV harus UTF-8.')
    _, result=import_result(rows,db)
    if 'header_error' in result:error(422,result['header_error'],'IMPORT_HEADER_ERROR')
    return {'success':True,'data':result}
@app.post('/api/students/import')
async def import_students(file:UploadFile=File(...),db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    if not file.filename or not file.filename.lower().endswith('.csv'):fail(415,'File harus CSV.')
    raw=await file.read()
    if len(raw)>settings.max_upload_mb*1024*1024:fail(413,'Ukuran file melebihi batas.')
    try: rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    except UnicodeDecodeError:fail(422,'CSV harus UTF-8.')
    details,result=import_result(rows,db)
    if details is None:error(422,result['header_error'],'IMPORT_HEADER_ERROR')
    if result['invalid_rows']:raise HTTPException(422,{'success':False,'message':'Validasi impor gagal.','errors':result,'code':'IMPORT_VALIDATION_ERROR'})
    prepared=[]
    for n,row in enumerate(rows,2):
      nis=row['nis'].strip(); classroom=db.scalar(select(ClassRoom).where(ClassRoom.name==row['kelas'].strip(),ClassRoom.major==row['jurusan'].strip()))
      prepared.append((nis,row,classroom))
    try:
      for nis,row,classroom in prepared:
        guardian=Guardian(full_name=row['nama_wali'].strip(),phone_number=row['nomor_wali'].strip());db.add(guardian);db.flush()
        db.add(Student(nis=nis,full_name=row['nama'].strip(),class_id=classroom.id,guardian_id=guardian.id))
      audit(db,u,'IMPORT','Student',None,f'Mengimpor {len(prepared)} siswa');db.commit()
    except Exception:
      db.rollback();raise
    return {'success':True,'data':{'importedCount':len(prepared)}}
@app.post('/api/leave-requests')
def leave(body:LeaveIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    x=LeaveRequest(**body.model_dump(),submitted_by=u.id);db.add(x);db.flush();audit(db,u,'CREATE','LeaveRequest',x.id,'Membuat izin');db.commit();return {'success':True,'data':{'id':str(x.id)}}
@app.get('/api/leave-requests')
def leaves(db:Session=Depends(get_db),u=Depends(user_dep)): return {'success':True,'data':[{'id':str(x.id),'studentId':str(x.student_id),'studentName':x.student.full_name,'leaveType':x.leave_type,'startDate':x.leave_date.isoformat(),'endDate':x.leave_date.isoformat(),'reason':x.reason,'status':x.status,'createdAt':x.created_at.isoformat()} for x in db.scalars(select(LeaveRequest)).all()]}
@app.post('/api/leave-requests/{id}/approve')
def approve(id:int,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    x=db.get(LeaveRequest,id)
    if not x or x.status!='PENDING':fail(404,'Izin pending tidak ditemukan.')
    x.status='APPROVED';x.reviewed_by=u.id;x.reviewed_at=localnow();a=db.scalar(select(Attendance).where(Attendance.student_id==x.student_id,Attendance.attendance_date==x.leave_date)) or Attendance(student_id=x.student_id,attendance_date=x.leave_date,created_by=u.id);db.add(a);a.status='SICK' if x.leave_type=='SICK' else 'EXCUSED';a.notes=x.reason;audit(db,u,'APPROVE','LeaveRequest',id,'Izin disetujui');db.commit();return {'success':True}
@app.post('/api/leave-requests/{id}/reject')
def reject(id:int,body:dict,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    x=db.get(LeaveRequest,id)
    reason=body.get('rejectionReason')
    if not x or x.status!='PENDING':fail(404,'Izin pending tidak ditemukan.')
    if not reason or len(reason)<3:fail(422,'Alasan penolakan wajib diisi.')
    x.status='REJECTED';x.reviewed_by=u.id;x.reviewed_at=localnow();x.review_note=reason;audit(db,u,'REJECT','LeaveRequest',id,reason);db.commit();return {'success':True}
@app.get('/api/audit-logs')
def audit_logs(db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    rows=db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc())).all()
    return {'success':True,'data':[{'id':str(x.id),'timestamp':x.created_at.isoformat(),'userId':str(x.user_id or ''),'username':'','action':x.action,'entity':x.entity_type,'entityId':x.entity_id,'details':x.description} for x in rows]}
@app.websocket('/ws/attendance')
async def websocket(ws:WebSocket):
    token=ws.query_params.get('token')
    try: jwt.decode(token or '',settings.secret_key,algorithms=['HS256'])
    except Exception:
        await ws.close(code=1008);return
    await ws.accept();clients.add(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: clients.discard(ws)
