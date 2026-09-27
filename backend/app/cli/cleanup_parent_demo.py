"""Idempotent cleanup for the known local Parent hardware-validation data."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models import AuditLog, Guardian, GuardianAccount, GuardianStudent, Student, User
from ..services.usernames import generate_unique_username


ALLOWED_ENVIRONMENTS = {'development', 'demo', 'local'}
KNOWN_GUARDIAN_NAME = 'Bapa Dzarel'
LEGACY_USERNAME = 'parent.hardware'
KNOWN_TEST_NIS = 'HW-VALIDATION-001'


@dataclass(frozen=True)
class CleanupResult:
    guardian_id: int
    user_id: int
    old_username: str
    new_username: str
    username_changed: bool
    student_unlinked: bool


def cleanup_parent_development_data(db: Session) -> CleanupResult:
    guardian = db.scalar(select(Guardian).where(Guardian.full_name == KNOWN_GUARDIAN_NAME))
    if not guardian:
        raise RuntimeError(f'Guardian development yang dikenal tidak ditemukan: {KNOWN_GUARDIAN_NAME}.')
    account = db.scalar(select(GuardianAccount).where(GuardianAccount.guardian_id == guardian.id))
    user = db.get(User, account.user_id) if account else None
    if not user or user.role != 'PARENT':
        raise RuntimeError('Akun PARENT development yang terhubung tidak ditemukan.')

    old_username = user.username
    username_changed = False
    if user.username == LEGACY_USERNAME or (user.username.startswith('bapadzarel.') and len(user.username) == len('bapadzarel.') + 4):
        user.username = generate_unique_username(guardian.full_name, db, exclude_user_id=user.id)
        username_changed = True
        db.add(AuditLog(user_id=None, action='DEVELOPMENT_USERNAME_MIGRATION', entity_type='User', entity_id=str(user.id), description='Memigrasikan username akun Parent development ke format berbasis nama.'))
    elif not user.username.startswith('bapadzarel'):
        raise RuntimeError(f'Cleanup ditolak: username tidak cocok dengan identity development yang dikenal ({user.username}).')

    test_student = db.scalar(select(Student).where(Student.nis == KNOWN_TEST_NIS))
    student_unlinked = False
    if test_student:
        if test_student.is_active:
            raise RuntimeError('Cleanup ditolak: student hardware validation masih aktif.')
        link = db.scalar(select(GuardianStudent).where(GuardianStudent.guardian_id == guardian.id, GuardianStudent.student_id == test_student.id))
        if link:
            db.delete(link)
            student_unlinked = True
            if test_student.guardian_id == guardian.id:
                replacement = db.scalar(select(GuardianStudent).where(GuardianStudent.student_id == test_student.id, GuardianStudent.guardian_id != guardian.id))
                test_student.guardian_id = replacement.guardian_id if replacement else None
            db.add(AuditLog(user_id=None, action='DEVELOPMENT_LINK_CLEANUP', entity_type='GuardianStudent', entity_id=str(link.id), description='Melepas hubungan Parent dengan student hardware validation nonaktif tanpa menghapus histori.'))

    db.commit()
    return CleanupResult(guardian.id, user.id, old_username, user.username, username_changed, student_unlinked)


def main() -> None:
    if settings.app_env.strip().lower() not in ALLOWED_ENVIRONMENTS:
        raise SystemExit('Cleanup ditolak: APP_ENV harus development, demo, atau local.')
    with SessionLocal() as db:
        result = cleanup_parent_development_data(db)
    print(f'Guardian ID {result.guardian_id}, User ID {result.user_id}.')
    print(f'Username: {result.old_username} -> {result.new_username}.' if result.username_changed else f'Username sudah sesuai: {result.new_username}.')
    print('Relasi student hardware validation dilepas.' if result.student_unlinked else 'Relasi student hardware validation sudah bersih.')


if __name__ == '__main__':
    main()
