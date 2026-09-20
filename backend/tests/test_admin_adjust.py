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
