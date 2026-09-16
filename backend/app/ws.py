import asyncio
from collections import defaultdict

import jwt
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Raid, User

router = APIRouter()

class ConnectionManager:
    """每个攻坚一个房间，向房间内所有 WS 广播事件。

    生产环境单 uvicorn 单事件循环，广播即直接 await；
    TestClient 下 HTTP 与 WS 跑在不同事件循环，故记录每个 ws 所属 loop，
    用 run_coroutine_threadsafe 跨 loop 发送，保证可测试。
    """
    def __init__(self) -> None:
        self.rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self._loops: dict[WebSocket, asyncio.AbstractEventLoop] = {}

    async def connect(self, raid_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms[raid_id].add(ws)
        self._loops[ws] = asyncio.get_running_loop()

    async def disconnect(self, raid_id: int, ws: WebSocket) -> None:
        self.rooms.get(raid_id, set()).discard(ws)
        self._loops.pop(ws, None)

    async def broadcast(self, raid_id: int, event: dict) -> None:
        stale = []
        current_loop = asyncio.get_running_loop()
        for ws in list(self.rooms.get(raid_id, set())):
            try:
                loop = self._loops.get(ws)
                if loop is None or loop is current_loop:
                    await ws.send_json(event)
                else:
                    future = asyncio.run_coroutine_threadsafe(ws.send_json(event), loop)
                    await asyncio.wrap_future(future)
            except Exception:
                stale.append(ws)
        for ws in stale:
            await self.disconnect(raid_id, ws)

manager = ConnectionManager()

def _auth_ws(ws: WebSocket, db: Session) -> User | None:
    token = ws.query_params.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return db.get(User, int(payload["sub"]))

@router.websocket("/ws/raids/{raid_id}")
async def ws_endpoint(ws: WebSocket, raid_id: int, db: Session = Depends(get_db)):
    user = _auth_ws(ws, db)
    if user is None:
        await ws.close(code=4401)
        return
    if db.get(Raid, raid_id) is None:
        await ws.close(code=4404)
        return
    await manager.connect(raid_id, ws)
    try:
        while True:
            await ws.receive_text()  # 仅维持连接，客户端不发消息
    except WebSocketDisconnect:
        await manager.disconnect(raid_id, ws)
    except Exception:
        await manager.disconnect(raid_id, ws)
