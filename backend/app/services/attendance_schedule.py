from ..config import settings
from datetime import time
from sqlalchemy import select, exists, String
from ..models import AttendanceSchedule, Attendance, AuditLog


def get_schedule(db):
    row = db.get(AttendanceSchedule, 1)
    return {
        'checkInDeadline': row.check_in_deadline if row else '07:00',
        'checkOutStart': row.check_out_start if row else '15:30',
        'timezone': settings.timezone,
    }


def recalculate_today(db, *, today, deadline, user_id=None):
    corrected = exists(select(AuditLog.id).where(
        AuditLog.entity_type == 'Attendance', AuditLog.action == 'CORRECT',
        AuditLog.entity_id == Attendance.id.cast(String),
    ))
    rows = db.scalars(select(Attendance).where(
        Attendance.attendance_date == today, Attendance.check_in_time.is_not(None),
        Attendance.status.in_(['PRESENT', 'LATE']), ~corrected,
    )).all()
    changed = 0
    for row in rows:
        status = 'LATE' if row.check_in_time.time() > time.fromisoformat(deadline) else 'PRESENT'
        if row.status == status:
            continue
        before = row.status
        row.status = status
        if user_id is not None:
            row.updated_by = user_id
        db.add(AuditLog(user_id=user_id, action='RECLASSIFY_SCHEDULE', entity_type='Attendance',
                        entity_id=str(row.id), description=f'Batas masuk {deadline}: {before} -> {status}'))
        changed += 1
    return changed
