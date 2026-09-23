from .helpers import make_raid, register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_bot_signup_requires_token(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/public/raids/{rid}/signup",
                       json={"account": "x"}).status_code == 401
    assert client.post(f"/api/public/raids/{rid}/signup",
                       headers={"Authorization": "Bearer wrong"},
                       json={"account": "x"}).status_code == 401


def test_bot_signup_by_account(client):
    ah = _admin(client)
    h, u = register_user(client, "sig1", "甲")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                    json={"account": "sig1"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["user"]["id"] == u["id"]
    assert body["raid"]["id"] == rid
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert any(s["user"]["id"] == u["id"] for s in detail["signups"])


def test_bot_signup_by_nickname(client):
    ah = _admin(client)
    h, u = register_user(client, "sig2", "乙")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                    json={"nickname": "乙"})
    assert r.status_code == 200
    assert r.json()["user"]["id"] == u["id"]


def test_bot_signup_duplicate(client):
    ah = _admin(client)
    h, u = register_user(client, "sig3", "丙")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN, json={"account": "sig3"})
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN, json={"account": "sig3"})
    assert r.status_code == 400
    assert r.json()["detail"] == "该用户已报名"


def test_bot_signup_locked(client):
    ah = _admin(client)
    h, u = register_user(client, "sig4", "丁")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN, json={"account": "sig4"})
    assert r.status_code == 400
    assert r.json()["detail"] == "攻坚已锁定，无法报名"


def test_bot_signup_creator_blocked(client):
    ah = _admin(client)
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    admin_id = login.json()["user"]["id"]
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                    json={"account": "admin"})
    assert r.status_code == 400
    assert r.json()["detail"] == "团长无需报名"


def test_bot_signup_user_not_found(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                    json={"account": "nobody"})
    assert r.status_code == 404
    assert r.json()["detail"] == "账号或昵称不存在"


def test_bot_signup_body_requires_exactly_one(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                       json={}).status_code == 422
    assert client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                       json={"account": "a", "nickname": "b"}).status_code == 422


def test_bot_signup_raid_404(client):
    assert client.post("/api/public/raids/99999/signup", headers=TOKEN,
                       json={"account": "x"}).status_code == 404


def test_bot_signup_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h, u = register_user(client, "sigws1", "甲")
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                           json={"account": "sigws1"}).status_code == 200
        ev = ws.receive_json()
        assert ev["type"] == "raid:signup"
        assert ev["user"]["id"] == u["id"]
        assert ev["created_at"]
