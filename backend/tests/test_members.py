from .helpers import register_user

def test_character_crud(client):
    h, _ = register_user(client, "player1", "阿伟")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 21000,
        "simulated_damage": 680000, "sustained_dps": 420000})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["sustained_dps"] == 420000

    r = client.get("/api/me/characters", headers=h)
    assert len(r.json()) == 1

    r = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂·改", "class_type": "输出", "fame": 22000,
        "simulated_damage": 700000, "sustained_dps": 430000})
    assert r.status_code == 200
    assert r.json()["name"] == "剑魂·改"

    r = client.delete(f"/api/me/characters/{cid}", headers=h)
    assert r.status_code == 200
    assert client.get("/api/me/characters", headers=h).json() == []

def test_cannot_touch_others_characters(client):
    h1, _ = register_user(client, "p1", "甲")
    h2, _ = register_user(client, "p2", "乙")
    cid = client.post("/api/me/characters", headers=h1, json={
        "name": "奶", "class_type": "辅助", "fame": 10000, "buff_amount": 9800}).json()["id"]
    assert client.put(f"/api/me/characters/{cid}", headers=h2, json={
        "name": "x", "class_type": "辅助", "fame": 1}).status_code == 404
    assert client.delete(f"/api/me/characters/{cid}", headers=h2).status_code == 404
