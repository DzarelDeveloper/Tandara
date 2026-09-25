import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import settings
from ..database import SessionLocal
from ..main import clients
from ..models import User


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
