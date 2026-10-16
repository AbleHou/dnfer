from .helpers import make_raid, register_user, signup

TOKEN = {"Authorization": "Bearer change-me-bot-token"}


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_public_raid_detail_requires_token(client):
    assert client.get("/api/public/raids/1").status_code == 401
    assert client.get("/api/public/raids/1",
                      headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_public_raid_detail(client):
    ah = _admin(client)
    rid = make_raid(client, ah, name="巴卡尔", size=12)["id"]
    h, _ = register_user(client, "p1", "甲")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1}).json()["id"]
    signup(client, rid, h)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid, "duty": "主C"})

    r = client.get(f"/api/public/raids/{rid}", headers=TOKEN)
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "巴卡尔"
    assert body["dungeon_name"] == "副本"          # make_dungeon 默认名
    assert body["size"] == 12
    assert body["locked"] is False
    assert len(body["waves"]) == 1                 # make_raid 自带 1 个波次
    slots = body["waves"][0]["slots"]
    assert len(slots) == 12                        # 12 人 = 3 队 × 4 格
    filled = [s for s in slots if s["character_name"]]
    assert filled[0]["owner_nickname"] == "甲"
    assert filled[0]["character_name"] == "剑魂"
    assert filled[0]["duty"] == "主C"
    assert filled[0]["job_title"]                  # weapon_master → 极诣·剑魂
    empty = [s for s in slots if not s["character_name"]]
    assert empty and empty[0]["character_name"] is None


def test_public_raid_detail_404(client):
    r = client.get("/api/public/raids/999999", headers=TOKEN)
    assert r.status_code == 404
    assert r.json()["detail"] == "攻坚不存在"


def test_public_closed_raid_serves_snapshot(client):
    """closed 攻坚的公开详情/列表/波次均由快照提供。"""
    ah = _admin(client)
    h, _ = register_user(client, "prc1", "甲")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "job_name": "weapon_master", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    s = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    # 公开详情 → closed=True 且含波/报名（快照）
    d = client.get(f"/api/public/raids/{rid}", headers=TOKEN).json()
    assert d["closed"] is True and len(d["waves"]) >= 1 and len(d["signups"]) >= 1
    # 公开列表 → closed=True、wave_count 来自快照
    item = next(r for r in client.get("/api/public/raids", headers=TOKEN).json()
                if r["id"] == rid)
    assert item["closed"] is True and item["wave_count"] >= 1
    # 公开波次 → 由快照重建，不 404
    r = client.get(f"/api/public/raids/{rid}/waves/{d['waves'][0]['index']}",
                   headers=TOKEN)
    assert r.status_code == 200
