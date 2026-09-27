"""One-time, transactional migration for legacy Parent usernames."""

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Guardian, GuardianAccount, User
from ..services.usernames import generate_unique_username


LEGACY_USERNAME_PATTERN = re.compile(r'^(?:parent\.|guardian\.|ortu\.|wali\.)|\.[a-z0-9]{4}$')


@dataclass(frozen=True)
class ParentUsernameRow:
    user_id: int
    guardian_id: int
    full_name: str
    username: str
    is_active: bool


@dataclass(frozen=True)
class UsernameMigration:
    user_id: int
    guardian_id: int
    full_name: str
    old_username: str
    new_username: str


def parent_username_rows(db: Session) -> list[ParentUsernameRow]:
    rows = db.execute(
        select(User.id, Guardian.id, Guardian.full_name, User.username, User.is_active)
        .join(GuardianAccount, GuardianAccount.user_id == User.id)
        .join(Guardian, Guardian.id == GuardianAccount.guardian_id)
        .where(User.role == 'PARENT')
        .order_by(User.id)
    ).all()
    return [ParentUsernameRow(*row) for row in rows]


def _migrate_username(user: User, guardian: Guardian, db: Session) -> str:
    user.username = generate_unique_username(guardian.full_name, db, exclude_user_id=user.id)
    db.flush()
    return user.username


def migrate_parent_usernames(db: Session) -> list[UsernameMigration]:
    migrations: list[UsernameMigration] = []
    for row in parent_username_rows(db):
        if not LEGACY_USERNAME_PATTERN.search(row.username):
            continue
        user = db.get(User, row.user_id)
        guardian = db.get(Guardian, row.guardian_id)
        if user is None or guardian is None:
            raise RuntimeError(f'Relasi Parent tidak lengkap untuk User {row.user_id}.')
        old_username = user.username
        new_username = _migrate_username(user, guardian, db)
        migrations.append(UsernameMigration(user.id, guardian.id, guardian.full_name, old_username, new_username))
    return migrations


def main() -> None:
    with SessionLocal() as db:
        before = parent_username_rows(db)
        print(f'Parent accounts inspected: {len(before)}')
        print('BEFORE:')
        for row in before:
            print(f'User ID {row.user_id} | Guardian ID {row.guardian_id} | {row.full_name} | {row.username} | is_active={row.is_active}')
        try:
            migrations = migrate_parent_usernames(db)
            db.commit()
        except Exception:
            db.rollback()
            raise
        print(f'Migrated: {len(migrations)}')
        for migration in migrations:
            print(f'User ID {migration.user_id} | Guardian ID {migration.guardian_id} | {migration.old_username} -> {migration.new_username}')


if __name__ == '__main__':
    main()
