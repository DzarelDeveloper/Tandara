import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import settings
from ..main import clients


router = APIRouter()


@router.websocket('/ws/attendance')
async def websocket(ws: WebSocket):
    token = ws.query_params.get('token')
    try:
        jwt.decode(token or '', settings.secret_key, algorithms=['HS256'])
    except Exception:
        await ws.close(code=1008); return
    await ws.accept(); clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)
