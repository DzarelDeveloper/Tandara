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
