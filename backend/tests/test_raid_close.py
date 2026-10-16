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


def _closed_raid(client, ah):
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    return rid


def test_all_write_endpoints_rejected_when_closed(client):
    """关闭后全部写端点 400「攻坚已关闭，无法操作」。"""
    ah = _admin(client)
    h, u = register_user(client, "rc4", "丁")
    cid = _mkchar(client, h)
    rid = _closed_raid(client, ah)
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    wave = detail["waves"][0]
    slot = wave["slots"][0]
    checks = [
        ("post", f"/api/raids/{rid}/slots/{slot['id']}/fill", {"character_id": cid}),
        ("delete", f"/api/raids/{rid}/slots/{slot['id']}", None),
        ("put", f"/api/raids/{rid}/slots/{slot['id']}/duty", {"duty": "主C"}),
        ("post", f"/api/raids/{rid}/waves", {}),
        ("delete", f"/api/raids/{rid}/waves/{wave['index']}", None),
        ("post", f"/api/raids/{rid}/waves/{wave['index']}/parallel", {"target_index": wave["index"]}),
        ("delete", f"/api/raids/{rid}/waves/{wave['index']}/parallel", None),
        ("post", f"/api/raids/{rid}/lock", None),
        ("post", f"/api/raids/{rid}/unlock", None),
        ("put", f"/api/raids/{rid}/slack-rules", {"criteria": [], "exchange": []}),
        ("put", f"/api/raids/{rid}", {"name": "改名"}),
        ("post", f"/api/raids/{rid}/signup", None),
        ("post", f"/api/raids/{rid}/signup/characters/{cid}", None),
        ("delete", f"/api/raids/{rid}/signup/characters/{cid}", None),
        ("delete", f"/api/raids/{rid}/signup", None),
        ("delete", f"/api/raids/{rid}/signups/{u['id']}", None),
        ("post", f"/api/raids/{rid}/signups", {"user_id": u["id"]}),
    ]
    for method, url, body in checks:
        r = getattr(client, method)(url, headers=ah, json=body) if body is not None \
            else getattr(client, method)(url, headers=ah)
        assert r.status_code == 400, f"{method} {url} -> {r.status_code} {r.text}"
        assert r.json()["detail"] == "攻坚已关闭，无法操作"


def test_move_slot_rejected_when_closed(client):
    """关闭后 move_slot 400「攻坚已关闭，无法操作」。"""
    ah = _admin(client)
    rid = _closed_raid(client, ah)
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    slots = detail["waves"][0]["slots"]
    source, target = slots[0]["id"], slots[1]["id"]
    r = client.post(f"/api/raids/{rid}/slots/{source}/move", headers=ah,
                    json={"target_slot_id": target})
    assert r.status_code == 400
    assert r.json()["detail"] == "攻坚已关闭，无法操作"


def test_bot_signup_cancel_rejected_when_closed(client):
    """关闭后 bot 报名/取消 400「攻坚已关闭，无法操作」。"""
    ah = _admin(client)
    h, u = register_user(client, "rcbot", "戊")
    _mkchar(client, h)
    rid = _closed_raid(client, ah)
    bot = {"Authorization": "Bearer change-me-bot-token"}
    for url in (f"/api/public/raids/{rid}/signup",
                f"/api/public/raids/{rid}/signup/cancel"):
        r = client.post(url, headers=bot, json={"account": "rcbot"})
        assert r.status_code == 400, f"{url} -> {r.status_code} {r.text}"
        assert r.json()["detail"] == "攻坚已关闭，无法操作"


def test_banned_admin_cannot_close(client, admin_headers, db):
    """封禁管理员调 close → 403「你已被封禁，无法操作」。"""
    from app.models import User
    admin = db.query(User).filter(User.username == "admin").one()
    rid = make_raid(client, admin_headers)["id"]
    admin.is_banned = True
    db.commit()
    r = client.post(f"/api/raids/{rid}/close", headers=admin_headers)
    assert r.status_code == 403
    assert r.json()["detail"] == "你已被封禁，无法操作"


def test_closed_raid_list_counts_from_snapshot(client):
    """列表页对 closed 攻坚的 wave/signup/my_signed_up 从快照推导。"""
    ah = _admin(client)
    h, u = register_user(client, "rc5", "戊")
    _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    item = next(r for r in client.get("/api/raids", headers=ah).json() if r["id"] == rid)
    assert item["closed"] is True
    assert item["wave_count"] >= 1        # 来自快照（live 波已删）
    assert item["signup_count"] >= 1      # 非团长报名行数（来自快照）
    # 已报名用户视角 my_signed_up
    item_mine = next(r for r in client.get("/api/raids", headers=h).json() if r["id"] == rid)
    assert item_mine["my_signed_up"] is True
    # 非参与者视角
    h3, _ = register_user(client, "rc6", "己")
    item_other = next(r for r in client.get("/api/raids", headers=h3).json() if r["id"] == rid)
    assert item_other["my_signed_up"] is False


def test_closed_raid_still_deletable(client):
    """closed 攻坚仍可删除。"""
    ah = _admin(client)
    rid = _closed_raid(client, ah)
    assert client.delete(f"/api/raids/{rid}", headers=ah).status_code == 200


def test_create_raid_unaffected_by_closed(client):
    """存在 closed 攻坚时，创建攻坚不受影响。"""
    from .helpers import make_dungeon
    ah = _admin(client)
    _closed_raid(client, ah)
    did = make_dungeon(client, ah, name="副本2", size=8)["id"]
    r = client.post("/api/raids", headers=ah,
                    json={"name": "新团", "dungeon_id": did,
                          "starts_at": "2026-10-01T12:00:00"})
    assert r.status_code == 200
    assert r.json()["closed"] is False
