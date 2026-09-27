from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..main import Attendance, LeaveRequest, audit, error, localnow, require
from ..models import GuardianStudent, Notification
from ..services.notifications import notification_service
from ..services.parent_access import get_parent_guardian, get_parent_student, get_parent_student_ids


router = APIRouter(prefix='/api/parent', tags=['Parent'])


class ParentLeaveCreate(BaseModel):
    student_id: int
    leave_date: date
    leave_type: str = Field(min_length=2, max_length=20)
    reason: str = Field(min_length=3, max_length=1000)


def student_summary(student) -> dict:
    return {
        'id': student.id,
        'nis': student.nis,
        'full_name': student.full_name,
        'class': student.classroom.name,
        'grade': student.classroom.grade,
        'major': student.classroom.major,
        'face_enrollment_status': student.face_enrollment_status,
    }


def attendance_summary(row) -> dict:
    return {
        'id': row.id if row else None,
        'date': row.attendance_date.isoformat() if row else localnow().date().isoformat(),
        'status': row.status if row else None,
        'check_in_at': row.check_in_time.isoformat() if row and row.check_in_time else None,
        'check_out_at': row.check_out_time.isoformat() if row and row.check_out_time else None,
        'check_in_method': row.check_in_method if row else None,
        'check_out_method': row.check_out_method if row else None,
    }


@router.get('/dashboard')
def parent_dashboard(db: Session = Depends(get_db), user=Depends(require('PARENT'))):
    student_ids = get_parent_student_ids(user, db)
    students = [get_parent_student(user, student_id, db) for student_id in student_ids]
    today_rows = db.scalars(select(Attendance).where(
        Attendance.student_id.in_(student_ids), Attendance.attendance_date == localnow().date(),
    )).all() if student_ids else []
    by_student = {row.student_id: row for row in today_rows}
    return {'success': True, 'data': {
        'students': [
            {'student': student_summary(student), 'today': attendance_summary(by_student.get(student.id))}
            for student in students
        ],
        'unread_notifications': notification_service.unread_count(db, user.id),
    }}


@router.get('/students/{student_id}/attendance/today')
def parent_attendance_today(student_id: int, db: Session = Depends(get_db), user=Depends(require('PARENT'))):
    student = get_parent_student(user, student_id, db)
    row = db.scalar(select(Attendance).where(
        Attendance.student_id == student.id, Attendance.attendance_date == localnow().date(),
    ))
    return {'success': True, 'data': {'student': student_summary(student), **attendance_summary(row)}}


@router.get('/students/{student_id}/attendance')
def parent_attendance_history(
    student_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user=Depends(require('PARENT')),
):
    student = get_parent_student(user, student_id, db)
    if date_from and date_to and date_from > date_to:
        error(422, 'Rentang tanggal tidak valid.', 'INVALID_DATE_RANGE')
    filters = [Attendance.student_id == student.id]
    if date_from:
        filters.append(Attendance.attendance_date >= date_from)
    if date_to:
        filters.append(Attendance.attendance_date <= date_to)
    if status:
        filters.append(Attendance.status == status)
    total = db.scalar(select(func.count()).select_from(Attendance).where(*filters)) or 0
    rows = db.scalars(
        select(Attendance).where(*filters).order_by(Attendance.attendance_date.desc(), Attendance.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {'success': True, 'data': {
        'items': [attendance_summary(row) for row in rows],
        'page': page, 'page_size': page_size, 'total': total,
    }}


@router.get('/notifications', tags=['Parent Notifications'])
def parent_notifications(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    unread_only: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require('PARENT')),
):
    get_parent_guardian(user, db)
    filters = [Notification.recipient_user_id == user.id]
    if unread_only:
        filters.append(Notification.is_read.is_(False))
    total = db.scalar(select(func.count()).select_from(Notification).where(*filters)) or 0
    rows = db.scalars(
        select(Notification).options(joinedload(Notification.student)).where(*filters)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {'success': True, 'data': {
        'items': [notification_service.serialize(row) for row in rows],
        'page': page, 'page_size': page_size, 'total': total,
    }}


@router.get('/notifications/unread-count', tags=['Parent Notifications'])
def parent_unread_count(db: Session = Depends(get_db), user=Depends(require('PARENT'))):
    get_parent_guardian(user, db)
    return {'success': True, 'data': {'count': notification_service.unread_count(db, user.id)}}


@router.patch('/notifications/read-all', tags=['Parent Notifications'])
def parent_read_all(db: Session = Depends(get_db), user=Depends(require('PARENT'))):
    get_parent_guardian(user, db)
    now = localnow()
    result = db.execute(update(Notification).where(
        Notification.recipient_user_id == user.id, Notification.is_read.is_(False),
    ).values(is_read=True, read_at=now))
    db.commit()
    return {'success': True, 'data': {'updated': result.rowcount}}


@router.patch('/notifications/{notification_id}/read', tags=['Parent Notifications'])
def parent_read_notification(notification_id: int, db: Session = Depends(get_db), user=Depends(require('PARENT'))):
    get_parent_guardian(user, db)
    row = db.scalar(select(Notification).options(joinedload(Notification.student)).where(
        Notification.id == notification_id, Notification.recipient_user_id == user.id,
    ))
    if not row:
        error(404, 'Notifikasi tidak ditemukan.', 'NOTIFICATION_NOT_FOUND')
    notification_service.mark_read(db, row, localnow())
    db.commit()
    return {'success': True, 'data': notification_service.serialize(row)}


@router.get('/leave-requests')
def parent_leave_requests(db: Session = Depends(get_db), user=Depends(require('PARENT'))):
    student_ids = get_parent_student_ids(user, db, active_only=False)
    rows = db.scalars(select(LeaveRequest).where(
        LeaveRequest.submitted_by == user.id, LeaveRequest.student_id.in_(student_ids),
    ).order_by(LeaveRequest.created_at.desc())).all() if student_ids else []
    return {'success': True, 'data': [{
        'id': row.id, 'student_id': row.student_id, 'student_name': row.student.full_name,
        'leave_date': row.leave_date.isoformat(), 'leave_type': row.leave_type,
        'reason': row.reason, 'status': row.status,
        'created_at': row.created_at.isoformat(),
    } for row in rows]}


@router.post('/leave-requests', status_code=201)
def parent_create_leave(body: ParentLeaveCreate, db: Session = Depends(get_db), user=Depends(require('PARENT'))):
    student = get_parent_student(user, body.student_id, db)
    row = LeaveRequest(
        student_id=student.id, leave_date=body.leave_date, leave_type=body.leave_type.upper(),
        reason=body.reason.strip(), submitted_by=user.id,
    )
    db.add(row); db.flush()
    audit(db, user, 'PARENT_LEAVE_REQUEST_CREATED', 'LeaveRequest', row.id, 'Orang tua membuat pengajuan izin')
    db.commit(); db.refresh(row)
    return {'success': True, 'data': {'id': row.id, 'status': row.status}}
