import asyncio
from collections import defaultdict

from fastapi import WebSocket

router = None  # Task 6 替换为 APIRouter 并注册端点

class ConnectionManager:
    """每个攻坚一个房间，向房间内所有 WS 广播事件。
    记录每个 ws 所属 loop，跨 loop 用 run_coroutine_threadsafe 发送（TestClient 场景）。"""
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
