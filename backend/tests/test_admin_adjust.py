from .helpers import make_raid, register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def _mkchar(client, h, name, job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]

def test_admin_can_replace_occupied_slot(client):
    ah = _admin(client)
    h1, u1 = register_user(client, "rep1", "甲")
    h2, u2 = register_user(client, "rep2", "乙")
    c1 = _mkchar(client, h1, "C1")
    c2 = _mkchar(client, h2, "C2")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = slots[0]
    # 甲先占 sA
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200
    # 管理员用乙的 C2 直接换掉 sA 上的 C1
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=ah,
                    json={"character_id": c2, "replace": True})
    assert r.status_code == 200
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] == c2
    assert by_id[sA["id"]]["owner_nickname"] == "乙"
    # C1 被换下后可另占其他格
    sB = next(s for s in slots if s["id"] != sA["id"])
    assert client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200

def test_non_admin_cannot_fill_occupied_slot(client):
    ah = _admin(client)
    h1, _ = register_user(client, "rep3", "丙")
    h2, _ = register_user(client, "rep4", "丁")
    c1 = _mkchar(client, h1, "C1")
    c2 = _mkchar(client, h2, "C2")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = slots[0]
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h2,
                    json={"character_id": c2})
    assert r.status_code == 400

def test_owner_can_manage_slot_admin_placed(client):
    ah = _admin(client)
    h1, u1 = register_user(client, "own1", "甲")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    # 管理员替甲放置 C1（管理员可用任意角色）
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200
    # 甲本人（非管理员）可改职责、可撤下
    assert client.put(f"/api/raids/{rid}/slots/{slot['id']}/duty", headers=h1,
                      json={"duty": "辅C"}).status_code == 200
    assert client.delete(f"/api/raids/{rid}/slots/{slot['id']}", headers=h1).status_code == 200

def test_non_owner_cannot_manage_others_slot(client):
    ah = _admin(client)
    h1, _ = register_user(client, "own2", "乙")
    h2, _ = register_user(client, "own3", "丙")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h1,
                json={"character_id": c1})
    # 丙无法操作乙的格子（即便该格不是乙放置的也无所谓）
    assert client.delete(f"/api/raids/{rid}/slots/{slot['id']}", headers=h2).status_code == 403

def test_owner_can_delete_wave_with_only_own_chars_admin_placed(client):
    ah = _admin(client)
    h1, _ = register_user(client, "own4", "丁")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    # 加波 2，管理员在波 2 放丁的 C1
    client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    w2 = next(w for w in client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
              if w["index"] == 2)
    s = w2["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200
    # 丁可删除仅含自己角色的波 2
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=h1).status_code == 200
