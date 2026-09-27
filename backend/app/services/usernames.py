"""Human-readable usernames for newly-created Parent accounts."""

import re
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import User


def username_base(full_name: str) -> str:
    normalized = unicodedata.normalize('NFKD', full_name).encode('ascii', 'ignore').decode('ascii')
    base = re.sub(r'[^a-z0-9]', '', normalized.lower())
    return base or 'pengguna'


def generate_unique_username(full_name: str, db: Session, exclude_user_id: int | None = None) -> str:
    base = username_base(full_name)[:60]
    suffix = 1
    while True:
        suffix_text = '' if suffix == 1 else str(suffix)
        candidate = f'{base[:60 - len(suffix_text)]}{suffix_text}'
        query = select(User.id).where(func.lower(User.username) == candidate.lower())
        if exclude_user_id is not None:
            query = query.where(User.id != exclude_user_id)
        if db.scalar(query) is None:
            return candidate
        suffix += 1
