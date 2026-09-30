from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Attendance, LeaveRequest, User, Guardian, GuardianAccount
from ..main import LeaveIn, audit, localnow, require
from ..services.notifications import notification_service
router = APIRouter(tags=['Leave Requests'])
def fail(code,msg): raise HTTPException(code,{'success':False,'message':msg,'errors':{},'code':'REQUEST_ERROR'})

class LeaveApproveIn(BaseModel):
    notes: str | None = Field(default=None)
    review_note: str | None = Field(default=None)


def _submitter_display_name(db: Session, submitter_id: int | None) -> str:
    if submitter_id is None:
        return 'Tidak tersedia'
    user = db.get(User, submitter_id)
    if user is None:
        return 'Tidak tersedia'
    if user.role == 'PARENT':
        account = db.scalar(select(GuardianAccount).where(GuardianAccount.user_id == user.id))
        if account is not None:
            guardian = db.get(Guardian, account.guardian_id)
            if guardian is not None and guardian.full_name:
                return guardian.full_name
    return user.full_name or 'Tidak tersedia'


@router.post('/api/leave-requests')
def leave(body:LeaveIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 x=LeaveRequest(**body.model_dump(),submitted_by=u.id);db.add(x);db.flush();audit(db,u,'CREATE','LeaveRequest',x.id,'Membuat izin');db.commit();return {'success':True,'data':{'id':str(x.id)}}

@router.get('/api/leave-requests')
def leaves(db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
    rows = db.scalars(select(LeaveRequest)).all()
    out = []
    for x in rows:
        student = x.student
        classroom = student.classroom if student is not None else None
        out.append({
            'id': str(x.id),
            'studentId': str(x.student_id),
            'studentName': student.full_name if student is not None else None,
            'nis': student.nis if student is not None else None,
            'className': classroom.name if classroom is not None else None,
            'parentName': _submitter_display_name(db, x.submitted_by),
            'parentId': str(x.submitted_by) if x.submitted_by is not None else None,
            'leaveType': x.leave_type,
            'startDate': x.leave_date.isoformat(),
            'endDate': x.leave_date.isoformat(),
            'reason': x.reason,
            'status': x.status,
            'reviewerNote': x.review_note,
            'reviewedBy': str(x.reviewed_by) if x.reviewed_by is not None else None,
            'reviewedAt': x.reviewed_at.isoformat() if x.reviewed_at is not None else None,
            'createdAt': x.created_at.isoformat(),
        })
    return {'success': True, 'data': out}

@router.post('/api/leave-requests/{id}/approve')
async def approve(id:int,body:LeaveApproveIn | None = None,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
	x=db.get(LeaveRequest,id)
	if not x or x.status!='PENDING':fail(404,'Izin pending tidak ditemukan.')
	note_in = (body.notes if body is not None else None) or (body.review_note if body is not None else None)
	x.status='APPROVED';x.reviewed_by=u.id;x.reviewed_at=localnow()
	if note_in and len(note_in.strip())>0:
	    x.review_note = note_in.strip()
	a=db.scalar(select(Attendance).where(Attendance.student_id==x.student_id,Attendance.attendance_date==x.leave_date)) or Attendance(student_id=x.student_id,attendance_date=x.leave_date,created_by=u.id);db.add(a);a.status='SICK' if x.leave_type=='SICK' else 'EXCUSED';a.notes=x.reason
	submitter=db.get(User,x.submitted_by)
	notifications=[notification_service.create_for_user(db,recipient_user_id=submitter.id,student=x.student,notification_type='LEAVE_APPROVED',title='Pengajuan izin disetujui',message=f'Pengajuan izin {x.student.full_name} telah disetujui.',payload={'leave_request_id':x.id,'status':'APPROVED'})] if submitter and submitter.role=='PARENT' else []
	audit(db,u,'APPROVE','LeaveRequest',id,x.review_note or 'Izin disetujui');db.commit();await notification_service.publish(notifications);return {'success':True}

@router.post('/api/leave-requests/{id}/reject')
async def reject(id:int,body:dict,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
	x=db.get(LeaveRequest,id);reason=body.get('rejectionReason')
	if not x or x.status!='PENDING':fail(404,'Izin pending tidak ditemukan.')
	if not reason or len(reason)<3:fail(422,'Alasan penolakan wajib diisi.')
	x.status='REJECTED';x.reviewed_by=u.id;x.reviewed_at=localnow();x.review_note=reason
	submitter=db.get(User,x.submitted_by)
	notifications=[notification_service.create_for_user(db,recipient_user_id=submitter.id,student=x.student,notification_type='LEAVE_REJECTED',title='Pengajuan izin ditolak',message=f'Pengajuan izin {x.student.full_name} ditolak.',payload={'leave_request_id':x.id,'status':'REJECTED'})] if submitter and submitter.role=='PARENT' else []
	audit(db,u,'REJECT','LeaveRequest',id,reason);db.commit();await notification_service.publish(notifications);return {'success':True}
