from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Guardian, GuardianAccount, GuardianStudent, Student, User


def _error(status: int, message: str, code: str) -> None:
    raise HTTPException(status, {'success': False, 'message': message, 'errors': {}, 'code': code})


def get_parent_guardian(user: User, db: Session) -> Guardian:
    if user.role != 'PARENT':
        _error(403, 'Akses khusus akun orang tua.', 'FORBIDDEN')
    account = db.scalar(select(GuardianAccount).where(GuardianAccount.user_id == user.id))
    guardian = db.get(Guardian, account.guardian_id) if account else None
    if not guardian or not guardian.is_active:
        _error(403, 'Profil orang tua tidak aktif atau tidak ditemukan.', 'PARENT_PROFILE_NOT_FOUND')
    return guardian


def get_parent_student_ids(user: User, db: Session, *, active_only: bool = True) -> list[int]:
    guardian = get_parent_guardian(user, db)
    query = (
        select(GuardianStudent.student_id)
        .join(Student, Student.id == GuardianStudent.student_id)
        .where(GuardianStudent.guardian_id == guardian.id)
    )
    if active_only:
        query = query.where(Student.is_active.is_(True))
    return list(db.scalars(query).all())


def get_parent_student(user: User, student_id: int, db: Session, *, active_only: bool = True) -> Student:
    guardian = get_parent_guardian(user, db)
    query = (
        select(Student)
        .join(GuardianStudent, GuardianStudent.student_id == Student.id)
        .where(GuardianStudent.guardian_id == guardian.id, Student.id == student_id)
    )
    if active_only:
        query = query.where(Student.is_active.is_(True))
    student = db.scalar(query)
    if not student:
        _error(404, 'Siswa tidak ditemukan.', 'STUDENT_NOT_FOUND')
    return student
