from .helpers import make_raid, register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def test_public_requires_token(client):
    assert client.get("/api/public/raids").status_code == 401
    assert client.get("/api/public/raids", headers={"Authorization": "Bearer wrong"}).status_code == 401

def test_public_list_and_wave(client):
    ah = _admin(client)
    rid = make_raid(client, ah, name="巴卡尔")["id"]
    # 填一个角色
    h, _ = register_user(client, "p1", "甲")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 1}).json()["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h, json={"character_id": cid})

    auth = {"Authorization": "Bearer change-me-bot-token"}
    r = client.get("/api/public/raids", headers=auth)
    assert r.status_code == 200
    assert r.json()[0]["name"] == "巴卡尔"
    r = client.get(f"/api/public/raids/{rid}/waves/1", headers=auth)
    assert r.status_code == 200
    filled = [s for s in r.json()["slots"] if s["character_name"]]
    assert filled[0]["owner_nickname"] == "甲"
    assert filled[0]["character_name"] == "剑魂"
