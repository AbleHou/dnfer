from .helpers import make_raid, register_user, signup


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _mkchar(client, h, name="C", job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]


def _slot_of(client, rid, h):
    return client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]


def test_close_snapshot_freezes_character_attrs(client):
    """关闭后改角色属性 → 详情仍显示关闭时快照值。"""
    ah = _admin(client)
    h, _ = register_user(client, "rc1", "甲")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    slot = _slot_of(client, rid, h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    r = client.post(f"/api/raids/{rid}/close", headers=ah)
    assert r.status_code == 200
    assert r.json()["closed"] is True
    assert any(s["character_id"] == cid for s in r.json()["waves"][0]["slots"])
    # 关闭后改角色属性
    assert client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "改名后", "job_name": "weapon_master", "fame": 99999}).status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert detail["closed"] is True
    filled = next(s for s in detail["waves"][0]["slots"] if s["character_id"] == cid)
    assert filled["character_name"] == "C"
    assert filled["fame"] == 1


def test_close_irreversible(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 400


def test_close_frees_character_references(client):
    """关闭清 live 占位/报名行 → 角色可删除（无死锁）。"""
    ah = _admin(client)
    h, _ = register_user(client, "rc2", "乙")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    slot = _slot_of(client, rid, h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    # 详情（快照）仍含报名与占位；但 live 行已清 → 角色可删
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) >= 1
    assert client.delete(f"/api/me/characters/{cid}", headers=h).status_code == 200


def test_close_broadcasts_raid_closed(client):
    """关闭广播 raid:closed（WS 连接用 admin token，对齐 test_ws.py 模式）。"""
    from .test_ws import _admin as ws_admin
    token = ws_admin(client)
    ah = {"Authorization": f"Bearer {token}"}
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        client.post(f"/api/raids/{rid}/close", headers=ah)
        assert ws.receive_json()["type"] == "raid:closed"
