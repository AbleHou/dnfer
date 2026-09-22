from .helpers import register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}


def test_requires_token(client):
    assert client.post("/api/public/register",
                       json={"identifier": "872557240"}).status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.post("/api/public/register", json={"identifier": "872557240"},
                       headers=bad).status_code == 401


def test_register_success(client):
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "872557240"})
    assert r.status_code == 200
    assert r.json() == {"account": "872557240", "nickname": "872557240"}
    # 可用 QQ 号作为账号密码登录
    login = client.post("/api/auth/login", json={
        "username": "872557240", "password": "872557240"})
    assert login.status_code == 200
    assert login.json()["user"]["is_admin"] is False
    # 注册后即可按账号录入角色
    add = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "872557240", "characters": [{"name": "剑魂"}]})
    assert add.status_code == 200
    assert add.json()["results"][0]["ok"] is True


def test_register_non_numeric(client):
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "abc"})
    assert r.status_code == 400
    assert r.json()["detail"] == "QQ号仅支持 6-64 位纯数字"


def test_register_too_short(client):
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "12345"})
    assert r.status_code == 400
    assert r.json()["detail"] == "QQ号仅支持 6-64 位纯数字"


def test_register_duplicate_username(client):
    register_user(client, "872557240", "别的昵称")  # 占用 username
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "872557240"})
    assert r.status_code == 400
    assert r.json()["detail"] == "用户名已存在"


def test_register_duplicate_nickname(client):
    register_user(client, "someone_else", "872557240")  # 占用 nickname
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "872557240"})
    assert r.status_code == 400
    assert r.json()["detail"] == "昵称已存在"


def test_register_round_trip_empty_characters(client):
    client.post("/api/public/register", headers=TOKEN,
                json={"identifier": "872557240"})
    r = client.get("/api/public/characters", params={"account": "872557240"},
                   headers=TOKEN)
    assert r.status_code == 200
    assert r.json()["characters"] == []
