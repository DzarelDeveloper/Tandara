import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from ..config import settings
from ..database import SessionLocal
from ..main import clients
from ..models import Guardian, GuardianAccount, User
from ..services.parent_realtime import parent_connections


router = APIRouter()


@router.websocket('/ws/attendance')
async def websocket(ws: WebSocket):
    token = ws.query_params.get('token')
    try:
        payload = jwt.decode(token or '', settings.secret_key, algorithms=['HS256'])
        db = SessionLocal()
        user = db.get(User, int(payload['sub']))
        db.close()
        if not user or not user.is_active:
            raise ValueError('inactive user')
    except Exception:
        await ws.close(code=1008); return
    await ws.accept(); clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)


@router.websocket('/ws/parent')
async def parent_websocket(ws: WebSocket):
    token = ws.query_params.get('token')
    db = SessionLocal()
    try:
        payload = jwt.decode(token or '', settings.secret_key, algorithms=['HS256'])
        user = db.get(User, int(payload['sub']))
        account = db.scalar(select(GuardianAccount).where(GuardianAccount.user_id == user.id)) if user else None
        guardian = db.get(Guardian, account.guardian_id) if account else None
        if not user or not user.is_active or user.role != 'PARENT' or not guardian or not guardian.is_active:
            raise ValueError('invalid Parent account')
        user_id = user.id
    except Exception:
        await ws.close(code=1008)
        return
    finally:
        db.close()
    await parent_connections.connect(user_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        parent_connections.disconnect(user_id, ws)
