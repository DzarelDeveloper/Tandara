from fastapi import APIRouter, Depends, HTTPException
from datetime import date
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..database import get_db
from ..main import Attendance, AttendanceSession, ManualIn, Patch, ScanIn, Student, attendance_out, audit, broadcast, localnow, require, user_dep
router=APIRouter(tags=['Attendance'])
def fail(c,m):raise HTTPException(c,{'success':False,'message':m,'errors':{},'code':'REQUEST_ERROR'})
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
@router.post('/api/attendance/manual')
async def manual(body:ManualIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 a=take(db,body.student_id,body.mode,'MANUAL',u,notes=body.reason);audit(db,u,'MANUAL_ATTENDANCE','Attendance',a.id,body.reason);db.commit();await broadcast('ATTENDANCE_SUCCESS',{'student_id':a.student_id,'student_name':a.student.full_name,'mode':body.mode,'confidence':None});return {'success':True,'data':attendance_out(a)}
@router.post('/api/attendance/scan')
async def scan(body:ScanIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 sess=db.get(AttendanceSession,body.session_id)
 if not sess or sess.status!='ACTIVE':fail(422,'Sesi absensi tidak aktif.')
 a=take(db,body.student_id,sess.mode,'FACE',u,body.confidence_score);audit(db,u,'SCAN','Attendance',a.id,'Absensi wajah');db.commit();await broadcast('ATTENDANCE_SUCCESS',{'student_id':a.student_id,'student_name':a.student.full_name,'mode':sess.mode,'confidence':body.confidence_score});return {'success':True,'data':attendance_out(a)}
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
 a.status=body.status;a.notes=body.notes;a.check_in_time=body.check_in_time or a.check_in_time;a.check_out_time=body.check_out_time or a.check_out_time;a.updated_by=u.id;audit(db,u,'CORRECT','Attendance',a.id,body.notes);db.commit();await broadcast('ATTENDANCE_CORRECTED',{'attendance_id':a.id,'student_id':a.student_id,'status':a.status});return {'success':True,'data':attendance_out(a)}
@router.get('/api/attendance/summary')
def summary(db:Session=Depends(get_db),u=Depends(user_dep)):return {'success':True,'data':{'today':db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date==localnow().date())) or 0,'students':db.scalar(select(func.count()).select_from(Student).where(Student.is_active==True)) or 0}}
