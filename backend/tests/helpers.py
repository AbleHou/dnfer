def _chunk(cname: bytes, payload: bytes) -> bytes:
    # 与 test_images.py 的构造器保持一致：真实 PNG chunk 含 4 字节 CRC
    return len(payload).to_bytes(4, "big") + cname + payload + b"\x00\x00\x00\x00"


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"payload"

APNG_BYTES = (b"\x89PNG\r\n\x1a\n"
              + _chunk(b"IHDR", (1).to_bytes(4, "big") + (1).to_bytes(4, "big") + b"\x08\x06\x00\x00\x00")
              + _chunk(b"acTL", (1).to_bytes(4, "big") + (1).to_bytes(4, "big"))
              + _chunk(b"IDAT", b""))


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

def signup(client, rid, headers):
    r = client.post(f"/api/raids/{rid}/signup", headers=headers)
    assert r.status_code == 200
