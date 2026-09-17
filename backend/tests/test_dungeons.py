from .helpers import register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def test_dungeon_crud(client):
    ah = _admin(client)
    r = client.post("/api/dungeons", headers=ah,
                    json={"name": "巴卡尔", "size": 12, "description": "团本"})
    assert r.status_code == 200
    did = r.json()["id"]
    items = client.get("/api/dungeons", headers=ah).json()
    assert items[0]["name"] == "巴卡尔" and items[0]["size"] == 12
    r = client.put(f"/api/dungeons/{did}", headers=ah,
                   json={"name": "巴卡尔-困难", "size": 12, "description": ""})
    assert r.status_code == 200 and r.json()["name"] == "巴卡尔-困难"
    assert client.delete(f"/api/dungeons/{did}", headers=ah).status_code == 200

def test_dungeon_member_forbidden(client):
    h, _ = register_user(client, "p1", "甲")
    assert client.get("/api/dungeons", headers=h).status_code == 403
    assert client.post("/api/dungeons", headers=h,
                       json={"name": "x", "size": 12}).status_code == 403

def test_dungeon_size_validation(client):
    ah = _admin(client)
    assert client.post("/api/dungeons", headers=ah,
                       json={"name": "x", "size": 10}).status_code == 400

def test_dungeon_dup_name(client):
    ah = _admin(client)
    client.post("/api/dungeons", headers=ah, json={"name": "巴卡尔", "size": 12})
    assert client.post("/api/dungeons", headers=ah,
                       json={"name": "巴卡尔", "size": 12}).status_code == 400
