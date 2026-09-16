def test_admin_bootstrapped_and_login(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["token"]
    assert data["user"]["is_admin"] is True

def test_register_with_code_and_login(client, admin_headers):
    r = client.post("/api/admin/codes", headers=admin_headers, json={"single_use": True})
    code = r.json()["code"]
    r = client.post("/api/auth/register", json={
        "username": "player1", "password": "secret1",
        "nickname": "阿伟", "code": code,
    })
    assert r.status_code == 200
    # code single-use
    r = client.post("/api/auth/register", json={
        "username": "player2", "password": "secret1",
        "nickname": "小明", "code": code,
    })
    assert r.status_code == 400
    # login works
    r = client.post("/api/auth/login", json={"username": "player1", "password": "secret1"})
    assert r.status_code == 200

def test_register_rejects_bad_code(client):
    r = client.post("/api/auth/register", json={
        "username": "xx", "password": "secret1", "nickname": "x", "code": "NOPE",
    })
    assert r.status_code == 400

def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code == 401

def test_admin_only_codes(client, admin_headers):
    r = client.post("/api/admin/codes", json={"single_use": True})
    assert r.status_code == 401
    r = client.get("/api/admin/codes", headers=admin_headers)
    assert r.status_code == 200

def test_multi_use_code_allows_multiple_registrations(client, admin_headers):
    r = client.post("/api/admin/codes", headers=admin_headers, json={"single_use": False})
    code = r.json()["code"]
    for i in range(2):
        r = client.post("/api/auth/register", json={
            "username": f"player_mu_{i}", "password": "secret1",
            "nickname": f"n{i}", "code": code})
        assert r.status_code == 200

def test_admin_endpoint_forbids_member(client, admin_headers):
    code = client.post("/api/admin/codes", headers=admin_headers,
                       json={"single_use": True}).json()["code"]
    r = client.post("/api/auth/register", json={
        "username": "member1", "password": "secret1", "nickname": "成员甲", "code": code})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.post("/api/admin/codes", headers=h, json={"single_use": True}).status_code == 403
    assert client.get("/api/admin/users", headers=h).status_code == 403
