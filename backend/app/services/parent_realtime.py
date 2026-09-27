import logging
from collections import defaultdict

from fastapi import WebSocket


logger = logging.getLogger(__name__)


class ParentConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self.connections.get(user_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self.connections.pop(user_id, None)

    async def publish(self, user_id: int, event: dict) -> None:
        for websocket in list(self.connections.get(user_id, ())):
            try:
                await websocket.send_json(event)
            except Exception:
                logger.warning('Removing unavailable Parent WebSocket for user_id=%s', user_id)
                self.disconnect(user_id, websocket)


parent_connections = ParentConnectionManager()
