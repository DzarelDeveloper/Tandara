"""Non-destructive Windows/local demo database initialization."""

from pathlib import Path

from ..config import settings
from ..database import Base, SessionLocal, engine
from .seed_demo import ALLOWED_ENVIRONMENTS, seed_demo_users


def main() -> None:
    if settings.app_env.strip().lower() not in ALLOWED_ENVIRONMENTS:
        raise SystemExit('Inisialisasi demo ditolak: APP_ENV harus development, demo, atau local.')
    if settings.database_url.startswith('sqlite:///'):
        database_path = Path(settings.database_url.removeprefix('sqlite:///'))
        if not database_path.is_absolute():
            database_path = Path.cwd() / database_path
        database_path.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        created, skipped = seed_demo_users(db)
    print(f'Database demo siap. Akun dibuat: {len(created)}; akun existing dipertahankan: {len(skipped)}.')


if __name__ == '__main__':
    main()
