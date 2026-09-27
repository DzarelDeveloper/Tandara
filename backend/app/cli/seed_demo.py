"""Idempotent development/demo users for local hardware validation."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import Base, SessionLocal, engine
from ..main import pwd
from ..models import User


DEMO_USERS = (
    {
        'full_name': 'Administrator Tandara',
        'username': 'admin',
        'password': 'Admin123!',
        'role': 'ADMIN_IT',
    },
    {
        'full_name': 'Guru Piket',
        'username': 'guru',
        'password': 'Guru123!',
        'role': 'GURU_PIKET',
    },
)
ALLOWED_ENVIRONMENTS = {'development', 'demo', 'local'}


def seed_demo_users(db: Session) -> tuple[list[str], list[str]]:
    created: list[str] = []
    skipped: list[str] = []
    for item in DEMO_USERS:
        existing = db.scalar(select(User).where(User.username == item['username']))
        if existing:
            skipped.append(item['username'])
            continue
        db.add(User(
            full_name=item['full_name'],
            username=item['username'],
            password_hash=pwd.hash(item['password']),
            role=item['role'],
            is_active=True,
        ))
        created.append(item['username'])
    db.commit()
    return created, skipped


def main() -> None:
    environment = settings.app_env.strip().lower()
    if environment not in ALLOWED_ENVIRONMENTS:
        raise SystemExit('Seed demo ditolak: APP_ENV harus development, demo, atau local.')
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        created, skipped = seed_demo_users(db)
    if created:
        print(f'Akun demo dibuat: {", ".join(created)}.')
    if skipped:
        print(f'Akun existing dilewati tanpa perubahan: {", ".join(skipped)}.')
    if not created and not skipped:
        print('Tidak ada akun demo untuk diproses.')


if __name__ == '__main__':
    main()
