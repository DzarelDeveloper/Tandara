from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..main import Attendance, LeaveIn, LeaveRequest, User, audit, localnow, require
from ..services.notifications import notification_service
router = APIRouter(tags=['Leave Requests'])
def fail(code,msg): raise HTTPException(code,{'success':False,'message':msg,'errors':{},'code':'REQUEST_ERROR'})
@router.post('/api/leave-requests')
def leave(body:LeaveIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 x=LeaveRequest(**body.model_dump(),submitted_by=u.id);db.add(x);db.flush();audit(db,u,'CREATE','LeaveRequest',x.id,'Membuat izin');db.commit();return {'success':True,'data':{'id':str(x.id)}}
@router.get('/api/leave-requests')
def leaves(db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))): return {'success':True,'data':[{'id':str(x.id),'studentId':str(x.student_id),'studentName':x.student.full_name,'leaveType':x.leave_type,'startDate':x.leave_date.isoformat(),'endDate':x.leave_date.isoformat(),'reason':x.reason,'status':x.status,'createdAt':x.created_at.isoformat()} for x in db.scalars(select(LeaveRequest)).all()]}
@router.post('/api/leave-requests/{id}/approve')
async def approve(id:int,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
	x=db.get(LeaveRequest,id)
	if not x or x.status!='PENDING':fail(404,'Izin pending tidak ditemukan.')
	x.status='APPROVED';x.reviewed_by=u.id;x.reviewed_at=localnow();a=db.scalar(select(Attendance).where(Attendance.student_id==x.student_id,Attendance.attendance_date==x.leave_date)) or Attendance(student_id=x.student_id,attendance_date=x.leave_date,created_by=u.id);db.add(a);a.status='SICK' if x.leave_type=='SICK' else 'EXCUSED';a.notes=x.reason
	submitter=db.get(User,x.submitted_by)
	notifications=[notification_service.create_for_user(db,recipient_user_id=submitter.id,student=x.student,notification_type='LEAVE_APPROVED',title='Pengajuan izin disetujui',message=f'Pengajuan izin {x.student.full_name} telah disetujui.',payload={'leave_request_id':x.id,'status':'APPROVED'})] if submitter and submitter.role=='PARENT' else []
	audit(db,u,'APPROVE','LeaveRequest',id,'Izin disetujui');db.commit();await notification_service.publish(notifications);return {'success':True}
@router.post('/api/leave-requests/{id}/reject')
async def reject(id:int,body:dict,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
	x=db.get(LeaveRequest,id);reason=body.get('rejectionReason')
	if not x or x.status!='PENDING':fail(404,'Izin pending tidak ditemukan.')
	if not reason or len(reason)<3:fail(422,'Alasan penolakan wajib diisi.')
	x.status='REJECTED';x.reviewed_by=u.id;x.reviewed_at=localnow();x.review_note=reason
	submitter=db.get(User,x.submitted_by)
	notifications=[notification_service.create_for_user(db,recipient_user_id=submitter.id,student=x.student,notification_type='LEAVE_REJECTED',title='Pengajuan izin ditolak',message=f'Pengajuan izin {x.student.full_name} ditolak.',payload={'leave_request_id':x.id,'status':'REJECTED'})] if submitter and submitter.role=='PARENT' else []
	audit(db,u,'REJECT','LeaveRequest',id,reason);db.commit();await notification_service.publish(notifications);return {'success':True}
