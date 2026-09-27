from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Guardian, GuardianAccount, GuardianStudent, Notification, Student, User
from .parent_realtime import parent_connections


EVENT_TYPES = {
    'ATTENDANCE_CHECK_IN': 'STUDENT_CHECK_IN',
    'ATTENDANCE_CHECK_OUT': 'STUDENT_CHECK_OUT',
    'ATTENDANCE_LATE': 'STUDENT_CHECK_IN',
    'ATTENDANCE_CORRECTED': 'ATTENDANCE_CORRECTED',
    'LEAVE_APPROVED': 'LEAVE_APPROVED',
    'LEAVE_REJECTED': 'LEAVE_REJECTED',
}


class NotificationService:
    def recipient_user_ids(self, db: Session, student_id: int) -> list[int]:
        query = (
            select(User.id)
            .join(GuardianAccount, GuardianAccount.user_id == User.id)
            .join(Guardian, Guardian.id == GuardianAccount.guardian_id)
            .join(GuardianStudent, GuardianStudent.guardian_id == GuardianAccount.guardian_id)
            .where(
                GuardianStudent.student_id == student_id,
                User.role == 'PARENT',
                User.is_active.is_(True),
                Guardian.is_active.is_(True),
            )
            .distinct()
        )
        return list(db.scalars(query).all())

    def create_for_student(
        self, db: Session, *, student: Student, notification_type: str,
        title: str, message: str, payload: dict | None = None,
    ) -> list[Notification]:
        return self.create_for_users(
            db, recipient_user_ids=self.recipient_user_ids(db, student.id), student=student,
            notification_type=notification_type, title=title, message=message, payload=payload,
        )

    def create_for_users(
        self, db: Session, *, recipient_user_ids: list[int], student: Student,
        notification_type: str, title: str, message: str, payload: dict | None = None,
    ) -> list[Notification]:
        rows = [Notification(
            recipient_user_id=user_id,
            student_id=student.id,
            type=notification_type,
            title=title,
            message=message,
            payload_json=payload or {},
        ) for user_id in recipient_user_ids]
        db.add_all(rows)
        if rows:
            db.flush()
        return rows

    def create_for_user(
        self, db: Session, *, recipient_user_id: int, student: Student,
        notification_type: str, title: str, message: str, payload: dict | None = None,
    ) -> Notification:
        return self.create_for_users(
            db, recipient_user_ids=[recipient_user_id], student=student,
            notification_type=notification_type, title=title, message=message, payload=payload,
        )[0]

    def attendance_transition(self, db: Session, attendance, mode: str) -> list[Notification]:
        timestamp = attendance.check_in_time if mode == 'CHECK_IN' else attendance.check_out_time
        formatted_time = timestamp.strftime('%H:%M') if timestamp else ''
        if mode == 'CHECK_IN':
            notification_type = 'ATTENDANCE_LATE' if attendance.status == 'LATE' else 'ATTENDANCE_CHECK_IN'
            title = 'Terlambat tiba' if attendance.status == 'LATE' else 'Tiba di sekolah'
            message = f'{attendance.student.full_name} telah melakukan presensi masuk pukul {formatted_time}.'
        else:
            notification_type = 'ATTENDANCE_CHECK_OUT'
            title = 'Pulang dari sekolah'
            message = f'{attendance.student.full_name} telah melakukan presensi pulang pukul {formatted_time}.'
        return self.create_for_student(
            db, student=attendance.student, notification_type=notification_type,
            title=title, message=message,
            payload={'attendance_id': attendance.id, 'status': attendance.status, 'mode': mode},
        )

    def serialize(self, row: Notification) -> dict:
        student = row.student
        return {
            'id': row.id,
            'type': row.type,
            'title': row.title,
            'message': row.message,
            'student': {'id': student.id, 'full_name': student.full_name} if student else None,
            'payload': row.payload_json or {},
            'is_read': row.is_read,
            'read_at': row.read_at.isoformat() if row.read_at else None,
            'created_at': row.created_at.isoformat(),
        }

    async def publish(self, rows: list[Notification]) -> None:
        for row in rows:
            await parent_connections.publish(row.recipient_user_id, {
                'type': EVENT_TYPES.get(row.type, row.type),
                'notification': self.serialize(row),
            })

    def unread_count(self, db: Session, user_id: int) -> int:
        return db.scalar(select(func.count()).select_from(Notification).where(
            Notification.recipient_user_id == user_id, Notification.is_read.is_(False),
        )) or 0

    def mark_read(self, db: Session, row: Notification, now: datetime) -> bool:
        if row.is_read:
            return False
        row.is_read = True
        row.read_at = now
        return True


notification_service = NotificationService()
