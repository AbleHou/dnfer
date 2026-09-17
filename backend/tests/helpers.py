def register_user(client, username, nickname):
    admin = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    ah = {"Authorization": f"Bearer {admin.json()['token']}"}
    code = client.post("/api/admin/codes", json={"single_use": True}, headers=ah).json()["code"]
    r = client.post("/api/auth/register", json={
        "username": username, "password": "secret1", "nickname": nickname, "code": code})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]

def make_dungeon(client, ah, name="副本", size=12, description=""):
    r = client.post("/api/dungeons", headers=ah,
                    json={"name": name, "size": size, "description": description})
    assert r.status_code == 200
    return r.json()

def make_raid(client, ah, dungeon_id=None, name="x", size=12, starts_at="2026-09-20T14:00:00"):
    if dungeon_id is None:
        dungeon_id = make_dungeon(client, ah, size=size)["id"]
    r = client.post("/api/raids", headers=ah,
                    json={"name": name, "dungeon_id": dungeon_id, "starts_at": starts_at})
    assert r.status_code == 200
    return r.json()
