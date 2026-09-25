from datetime import datetime, timedelta

import jwt
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import User
from ..main import audit, error, localnow, pwd, user_dep


class Login(BaseModel):
    username: str
    password: str


def token(user):
    return jwt.encode({'sub': str(user.id), 'role': user.role, 'exp': datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)}, settings.secret_key, algorithm='HS256')


router = APIRouter()


@router.post('/api/auth/login')
def login(body: Login, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.username == body.username.strip()))
    if not u or not u.is_active:
        error(401, 'Username atau password tidak sesuai.', 'INVALID_CREDENTIALS')
    try:
        pwd.verify(u.password_hash, body.password)
    except VerifyMismatchError:
        error(401, 'Username atau password tidak sesuai.', 'INVALID_CREDENTIALS')
    u.last_login_at = localnow(); audit(db, u, 'LOGIN', 'User', u.id, 'Pengguna login'); db.commit()
    return {'success': True, 'data': {'access_token': token(u), 'token_type': 'bearer', 'user': {'id': str(u.id), 'username': u.username, 'displayName': u.full_name, 'role': u.role, 'isActive': u.is_active}}}


@router.post('/api/auth/logout')
def logout(u=Depends(user_dep), db: Session = Depends(get_db)):
    audit(db, u, 'LOGOUT', 'User', u.id, 'Pengguna logout'); db.commit(); return {'success': True, 'message': 'Logout berhasil'}


@router.get('/api/auth/me')
def me(u=Depends(user_dep)):
    return {'success': True, 'data': {'id': str(u.id), 'username': u.username, 'displayName': u.full_name, 'role': u.role, 'isActive': u.is_active}}
