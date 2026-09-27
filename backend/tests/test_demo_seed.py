from sqlalchemy import select

from app.cli.seed_demo import seed_demo_users
from app.database import SessionLocal
from app.main import pwd
from app.models import User


def test_demo_seed_is_idempotent_and_preserves_existing_password(client):
    db = SessionLocal()
    created, skipped = seed_demo_users(db)
    assert created == ['admin', 'guru']
    assert skipped == []

    admin = db.scalar(select(User).where(User.username == 'admin'))
    guru = db.scalar(select(User).where(User.username == 'guru'))
    assert admin is not None and admin.role == 'ADMIN_IT' and admin.is_active
    assert guru is not None and guru.role == 'GURU_PIKET' and guru.is_active
    assert admin.password_hash != 'Admin123!'
    assert guru.password_hash != 'Guru123!'
    assert pwd.verify(admin.password_hash, 'Admin123!')
    assert pwd.verify(guru.password_hash, 'Guru123!')

    original_admin_hash = admin.password_hash
    created_again, skipped_again = seed_demo_users(db)
    db.refresh(admin)
    assert created_again == []
    assert skipped_again == ['admin', 'guru']
    assert admin.password_hash == original_admin_hash
    assert db.query(User).filter(User.username.in_(['admin', 'guru'])).count() == 2
    db.close()
