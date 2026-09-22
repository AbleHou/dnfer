from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Dungeon, Raid, RaidSignup, User

from .helpers import make_raid, register_user


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_raid_signup_model_roundtrip_unique_cascade(db):
    admin = db.query(User).filter(User.username == "admin").one()
    d = Dungeon(name="副本", size=12)
    db.add(d)
    db.flush()
    r = Raid(name="x", dungeon_id=d.id, size=12, locked=False,
             starts_at=_now(), created_by=admin.id)
    db.add(r)
    db.flush()
    u = User(username="u1", password_hash="x", nickname="甲", is_admin=False)
    db.add(u)
    db.flush()

    db.add(RaidSignup(raid_id=r.id, user_id=u.id))
    db.commit()
    assert db.query(RaidSignup).count() == 1

    # 同 raid+user 唯一
    db.add(RaidSignup(raid_id=r.id, user_id=u.id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # 删团级联清 signups（Raid.signups cascade="all, delete-orphan"）
    r = db.get(Raid, r.id)
    db.delete(r)
    db.commit()
    assert db.query(RaidSignup).count() == 0


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _mkchar(client, h, name="C", job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]


def test_signup_success_and_detail(client):
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    ah = {"Authorization": f"Bearer {login.json()['token']}"}
    admin_id = login.json()["user"]["id"]
    rid = make_raid(client, ah)["id"]
    h, u = register_user(client, "sig1", "甲")
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    # 列表字段
    item = [x for x in client.get("/api/raids", headers=h).json() if x["id"] == rid][0]
    assert item["signup_count"] == 1
    assert item["my_signed_up"] is True
    # 详情：团长（创建者=管理员）在首位（created_at=None），报名者在后
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert detail["signups"][0]["created_at"] is None
    assert detail["signups"][0]["user"]["id"] == admin_id
    assert detail["signups"][1]["user"]["id"] == u["id"]
    assert detail["signups"][1]["created_at"] is not None


def test_signup_creator_blocked(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signup", headers=ah)
    assert r.status_code == 400
    assert r.json()["detail"] == "团长无需报名"


def test_signup_locked_blocked(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    h, _ = register_user(client, "sig2", "乙")
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "攻坚已锁定，无法报名"


def test_signup_duplicate_blocked(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    h, _ = register_user(client, "sig3", "丙")
    client.post(f"/api/raids/{rid}/signup", headers=h)
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "你已报名"


def test_self_cancel_removes_placements(client):
    ah = _admin(client)
    h, _ = register_user(client, "sig4", "丁")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    r = client.delete(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert len(detail["signups"]) == 1  # 仅剩团长固定行
    assert all(s["character_id"] is None for s in detail["waves"][0]["slots"])


def test_self_cancel_locked_blocked(client):
    ah = _admin(client)
    h, _ = register_user(client, "sig5", "戊")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.delete(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "攻坚已锁定，无法取消报名"


def test_admin_cancel_other_removes_placements(client):
    ah = _admin(client)
    h, u = register_user(client, "sig6", "己")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid})
    # 锁定后管理员仍可取消
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.delete(f"/api/raids/{rid}/signups/{u['id']}", headers=ah)
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) == 1
    assert all(s["character_id"] is None for s in detail["waves"][0]["slots"])


def test_admin_cancel_not_signed_up_400(client):
    ah = _admin(client)
    h, u = register_user(client, "sig7", "庚")
    rid = make_raid(client, ah)["id"]
    r = client.delete(f"/api/raids/{rid}/signups/{u['id']}", headers=ah)
    assert r.status_code == 400
    assert r.json()["detail"] == "该用户尚未报名"


def test_delete_raid_with_signups(client):
    ah = _admin(client)
    h, _ = register_user(client, "sig8", "辛")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    assert client.delete(f"/api/raids/{rid}", headers=ah).status_code == 200


def test_signup_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    rid = make_raid(client, ah)["id"]
    h, u = register_user(client, "sigws1", "甲")
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert client.post(f"/api/raids/{rid}/signup", headers=h).status_code == 200
        ev = ws.receive_json()
        assert ev["type"] == "raid:signup"
        assert ev["user"]["id"] == u["id"]
        assert ev["created_at"]


def test_cancel_ws_broadcast_slot_and_signup(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h, _ = register_user(client, "sigws2", "乙")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid})
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert client.delete(f"/api/raids/{rid}/signup", headers=h).status_code == 200
        types = [ws.receive_json()["type"] for _ in range(2)]
        assert types == ["slot:removed", "raid:signup_removed"]


def test_fill_requires_signup_for_regular_user(client):
    ah = _admin(client)
    h, _ = register_user(client, "sigf1", "甲")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 403
    assert r.json()["detail"] == "请先报名再占位"
    # 报名后可占位
    client.post(f"/api/raids/{rid}/signup", headers=h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200


def test_fill_admin_placing_unregistered_user_blocked(client):
    ah = _admin(client)
    h, u = register_user(client, "sigf2", "乙")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                    json={"character_id": cid})
    assert r.status_code == 403
    assert r.json()["detail"] == "该用户未报名，无法排表"
    # 该用户报名后管理员可放
    client.post(f"/api/raids/{rid}/signup", headers=h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": cid}).status_code == 200


def test_fill_creator_always_participates(client):
    ah = _admin(client)
    cid = _mkchar(client, ah, "团长C")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    # 团长（管理员、未报名）可放自己角色
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": cid}).status_code == 200
