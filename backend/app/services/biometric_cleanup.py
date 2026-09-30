"""Scoped, reversible staging of exclusively owned student face files.

Never follows links or removes shared/unknown paths. Files are staged before SQL
commit and restored on rollback. A post-commit purge failure is reported explicitly.
"""
from contextlib import contextmanager
import logging
from pathlib import Path
import shutil
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from ..models import FaceEnrollment

logger = logging.getLogger(__name__)


def conflict():
    raise HTTPException(409, {'success': False, 'code': 'BIOMETRIC_OWNERSHIP_CONFLICT',
        'message': 'Kepemilikan berkas wajah tidak dapat dipastikan. Nonaktifkan siswa dan hubungi Admin IT.'})


@contextmanager
def staged_biometric_cleanup(db, student_id: int, face_root: Path, pending_root: Path):
    roots = [face_root / str(student_id), pending_root / str(student_id)]
    base = face_root.resolve()
    if face_root.is_symlink() or pending_root.is_symlink():
        conflict()
    for root in roots:
        if root.is_symlink() or not root.resolve().is_relative_to(base):
            conflict()
        if root.exists() and (not root.is_dir() or any(p.is_symlink() or not p.is_file() for p in root.iterdir())):
            conflict()
    for enrollment in db.scalars(select(FaceEnrollment)).all():
        if not enrollment.embedding_path:
            continue
        path = (face_root / enrollment.embedding_path).resolve()
        owned = any(path.is_relative_to(root.resolve()) for root in roots)
        if enrollment.student_id == student_id and not path.is_relative_to(roots[0].resolve()):
            conflict()
        if enrollment.student_id != student_id and owned:
            conflict()
    trash = face_root / '.deleting'
    if trash.is_symlink():
        conflict()
    moved = []
    outcome = {'cleanupPending': False}
    try:
        for root in roots:
            if root.exists():
                trash.mkdir(parents=True, exist_ok=True)
                kind = 'pending' if root.parent == pending_root else 'enrollment'
                target = trash / f'{student_id}-{kind}-{uuid4().hex}'
                root.rename(target)
                moved.append((root, target))
        yield outcome
    except BaseException:
        db.rollback()
        for root, target in reversed(moved):
            target.rename(root)
        raise
    else:
        for _, target in moved:
            try:
                shutil.rmtree(target)
            except OSError:
                outcome['cleanupPending'] = True
                logger.exception('Biometric quarantine purge requires retry for student_id=%s', student_id)
