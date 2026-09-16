def register_user(client, username, nickname):
    admin = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    ah = {"Authorization": f"Bearer {admin.json()['token']}"}
    code = client.post("/api/admin/codes", json={"single_use": True}, headers=ah).json()["code"]
    r = client.post("/api/auth/register", json={
        "username": username, "password": "secret1", "nickname": nickname, "code": code})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]
