from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import User, audit, error, pwd, require


class UserIn(BaseModel):
    full_name: str = Field(min_length=2)
    username: str = Field(min_length=3)
    password: str = Field(min_length=8)
    role: str = 'GURU_PIKET'
    is_active: bool = True

    @field_validator('full_name', 'username', mode='before')
    @classmethod
    def trim_identity(cls, value):
        return value.strip() if isinstance(value, str) else value


router = APIRouter()


@router.get('/api/users')
def users(db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    return {'success': True, 'data': [{'id': str(x.id), 'username': x.username, 'displayName': x.full_name, 'role': x.role, 'isActive': x.is_active, 'createdAt': x.created_at.isoformat(), 'lastLogin': x.last_login_at.isoformat() if x.last_login_at else None} for x in db.scalars(select(User)).all()]}


@router.post('/api/users')
def create_user(body: UserIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    if body.role not in ('GURU_PIKET', 'ADMIN_IT'):
        error(422, 'Role tidak valid.')
    x = User(full_name=body.full_name, username=body.username, password_hash=pwd.hash(body.password), role=body.role, is_active=body.is_active); db.add(x)
    try:
        db.flush()
    except IntegrityError:
        db.rollback(); error(409, 'Username sudah digunakan.', 'USERNAME_EXISTS')
    audit(db, u, 'CREATE', 'User', x.id, f'Membuat akun {x.username}'); db.commit(); return {'success': True, 'data': {'id': str(x.id), 'username': x.username, 'displayName': x.full_name, 'role': x.role, 'isActive': x.is_active, 'createdAt': x.created_at.isoformat()}}


@router.patch('/api/users/{id}/status')
def user_status(id: int, active: bool, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    x = db.get(User, id)
    if not x:
        error(404, 'User tidak ditemukan.', 'NOT_FOUND')
    x.is_active = active; audit(db, u, 'STATUS_CHANGE', 'User', id, 'Status user diubah'); db.commit(); return {'success': True}
