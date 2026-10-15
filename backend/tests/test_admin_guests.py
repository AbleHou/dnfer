from app.models import AdventureParty, Character, RaidSignup, User
from .helpers import make_raid, register_user


def _char(**kw):
    base = {"name": "剑魂", "job_name": "weapon_master", "fame": 100}
    base.update(kw)
    return base


def test_create_guest_user(client, admin_headers, db):
    r = client.post("/api/admin/users", headers=admin_headers, json={
        "nickname": "来客甲", "characters": [_char()]})
    assert r.status_code == 200
    data = r.json()
    u = data["user"]
    assert u["is_guest"] is True
    assert u["username"].startswith("guest_")
    assert u["character_count"] == 1
    assert len(data["characters"]) == 1
    assert data["default_party_name"] == "来客甲的冒险团"
    # 角色挂默认团
    assert data["characters"][0]["adventure_party_id"] == data["default_party_id"]
    # 随机密码不可知（断言非明文 + 用猜测密码无法登录）
    row = db.query(User).filter(User.id == u["id"]).one()
    assert row.password_hash != "hunter2"
    assert client.post("/api/auth/login",
                       json={"username": u["username"], "password": "guess123"}).status_code == 401
    assert row.is_guest is True


def test_create_guest_specified_username(client, admin_headers):
    r = client.post("/api/admin/users", headers=admin_headers,
                    json={"nickname": "来客乙", "username": "myguest1"})
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "myguest1"


def test_create_guest_nickname_duplicate(client, admin_headers):
    assert client.post("/api/admin/users", headers=admin_headers,
                       json={"nickname": "撞名"}).status_code == 200
    r = client.post("/api/admin/users", headers=admin_headers, json={"nickname": "撞名"})
    assert r.status_code == 400 and r.json()["detail"] == "昵称已存在"


def test_create_guest_username_duplicate(client, admin_headers):
    client.post("/api/admin/users", headers=admin_headers,
                json={"nickname": "客丙", "username": "dup_x"})
    r = client.post("/api/admin/users", headers=admin_headers,
                    json={"nickname": "客丁", "username": "dup_x"})
    assert r.status_code == 400 and r.json()["detail"] == "用户名已存在"


def test_create_guest_bad_job(client, admin_headers):
    r = client.post("/api/admin/users", headers=admin_headers, json={
        "nickname": "客戊", "characters": [{"name": "x", "job_name": "nope", "fame": 1}]})
    assert r.status_code == 400 and r.json()["detail"] == "职业不存在"


def test_create_guest_requires_auth(client):
    # 未带 token：get_current_user 抛 401（require_admin 的 403 仅对已登录非管理员触发）
    r = client.post("/api/admin/users", json={"nickname": "普通来客"})
    assert r.status_code == 401


def test_create_guest_non_admin_forbidden(client):
    h, _ = register_user(client, "mynormal", "普通丙")
    r = client.post("/api/admin/users", headers=h, json={"nickname": "普通来客"})
    assert r.status_code == 403


def test_create_guest_banned_admin_blocked(client, admin_headers, db):
    admin = db.query(User).filter(User.username == "admin").one()
    admin.is_banned = True
    db.commit()
    r = client.post("/api/admin/users", headers=admin_headers, json={"nickname": "客己"})
    assert r.status_code == 403 and r.json()["detail"] == "你已被封禁，无法创建用户"


def _mk_guest(client, admin_headers, nickname="转正甲"):
    return client.post("/api/admin/users", headers=admin_headers,
                       json={"nickname": nickname}).json()["user"]


def test_convert_guest(client, admin_headers):
    g = _mk_guest(client, admin_headers)
    r = client.post(f"/api/admin/users/{g['id']}/convert", headers=admin_headers,
                    json={"username": "realuser1", "password": "mypass99"})
    assert r.status_code == 200
    assert r.json()["is_guest"] is False
    assert r.json()["username"] == "realuser1"
    assert r.json()["nickname"] == "转正甲"  # 昵称不变
    # 转正后可用新凭据登录
    assert client.post("/api/auth/login",
                       json={"username": "realuser1", "password": "mypass99"}).status_code == 200
    # 冒险团名不变
    parties = client.get(f"/api/admin/users/{g['id']}/adventure-parties",
                         headers=admin_headers).json()
    assert parties[0]["name"] == "转正甲的冒险团"


def test_convert_non_guest_rejected(client, admin_headers):
    _, u = register_user(client, "normal1", "普通甲")
    r = client.post(f"/api/admin/users/{u['id']}/convert", headers=admin_headers,
                    json={"username": "xy", "password": "secret1"})
    assert r.status_code == 400 and r.json()["detail"] == "该用户不是临时用户"


def test_convert_username_duplicate(client, admin_headers):
    _, u = register_user(client, "taken1", "占用甲")
    g = _mk_guest(client, admin_headers, "转正乙")
    r = client.post(f"/api/admin/users/{g['id']}/convert", headers=admin_headers,
                    json={"username": "taken1", "password": "mypass99"})
    assert r.status_code == 400 and r.json()["detail"] == "用户名已存在"
    # 转正被拒后仍保持 guest 状态
    g2 = client.get("/api/admin/users", headers=admin_headers).json()
    assert next(x for x in g2 if x["id"] == g["id"])["is_guest"] is True
