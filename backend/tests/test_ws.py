import json

from .helpers import make_raid

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return r.json()["token"]

def test_ws_receives_slot_events(client):
    from fastapi.testclient import TestClient
    token = _admin(client)
    ah = {"Authorization": f"Bearer {token}"}
    rid = make_raid(client, ah)["id"]

    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        # 管理员锁定时会产生 raid:locked 事件
        client.post(f"/api/raids/{rid}/lock", headers=ah)
        data = ws.receive_json()
        assert data["type"] == "raid:locked"

def test_ws_rejects_bad_token(client):
    from starlette.websockets import WebSocketDisconnect
    import pytest
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/raids/1?token=bad"):
            pass
    assert exc_info.value.code == 4401
