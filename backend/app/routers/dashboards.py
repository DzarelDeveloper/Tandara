from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import (
    Attendance,
    AttendanceSession,
    ClassRoom,
    LeaveRequest,
    Student,
    User,
    attendance_out,
    localnow,
    require,
)

router = APIRouter(tags=['Dashboards'])


@router.get('/api/dashboard/admin')
def admin_dashboard(db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    today = localnow().date()
    return {'success': True, 'data': {
      'activeStudents': db.scalar(select(func.count()).select_from(Student).where(Student.is_active == True)) or 0,
      'activeClasses': db.scalar(select(func.count()).select_from(ClassRoom).where(ClassRoom.is_active == True)) or 0,
      'activeDutyTeachers': db.scalar(select(func.count()).select_from(User).where(User.role == 'GURU_PIKET', User.is_active == True)) or 0,
      'facesRegistered': db.scalar(select(func.count()).select_from(Student).where(Student.is_active == True, Student.face_enrollment_status == 'REGISTERED')) or 0,
      'facesUnregistered': db.scalar(select(func.count()).select_from(Student).where(Student.is_active == True, Student.face_enrollment_status != 'REGISTERED')) or 0,
      'presentToday': db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date == today, Attendance.status.in_(['PRESENT', 'LATE']))) or 0,
      'lateToday': db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date == today, Attendance.status == 'LATE')) or 0,
      'pendingLeaves': db.scalar(select(func.count()).select_from(LeaveRequest).where(LeaveRequest.status == 'PENDING')) or 0,
      'activeSessions': db.scalar(select(func.count()).select_from(AttendanceSession).where(AttendanceSession.status == 'ACTIVE')) or 0,
    }}


@router.get('/api/dashboard/teacher')
def teacher_dashboard(db: Session = Depends(get_db), u=Depends(require('ADMIN_IT', 'GURU_PIKET'))):
    today = localnow().date(); students = db.scalar(select(func.count()).select_from(Student).where(Student.is_active == True)) or 0
    records = db.scalars(select(Attendance).where(Attendance.attendance_date == today).order_by(Attendance.updated_at.desc()).limit(10)).all()
    active = db.scalar(select(AttendanceSession).where(AttendanceSession.status == 'ACTIVE').order_by(AttendanceSession.opened_at.desc()))
    present = sum(r.status in ('PRESENT', 'LATE') for r in records)
    return {'success': True, 'data': {'session': None if not active else {'id': str(active.id), 'mode': active.mode, 'cameraSource': active.camera_source, 'status': active.status}, 'presentToday': db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date == today, Attendance.status.in_(['PRESENT', 'LATE']))) or 0, 'lateToday': db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date == today, Attendance.status == 'LATE')) or 0, 'excusedToday': db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date == today, Attendance.status.in_(['SICK', 'EXCUSED']))) or 0, 'notPresent': max(0, students - (db.scalar(select(func.count()).select_from(Attendance).where(Attendance.attendance_date == today)) or 0)), 'recentAttendance': [attendance_out(x) for x in records], 'faceEngine': 'NOT_CONFIGURED'}}
