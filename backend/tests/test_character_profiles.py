from .helpers import APNG_BYTES, PNG_BYTES, register_user

def _create_char(client, h, name="角色", job_name="weapon_master"):
    r = client.post("/api/me/characters", headers=h,
                    json={"name": name, "job_name": job_name, "fame": 1})
    assert r.status_code == 200
    return r.json()

def test_profile_upload_success(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    calls = []
    monkeypatch.setattr("app.s3.upload_profile",
                        lambda uid, cid, ext, data, ct: calls.append((uid, cid)) or
                        "https://cdn.example.com/profiles/%s/%s/abc.png" % (uid, cid))
    monkeypatch.setattr("app.s3.delete_profile", lambda url: calls.append(("del", url)))
    h, u = register_user(client, "pf1", "阿p")
    char = _create_char(client, h)
    r = client.post(f"/api/me/characters/{char['id']}/profile", headers=h,
                    files={"file": ("a.png", PNG_BYTES, "image/png")})
    assert r.status_code == 200
    assert r.json()["profile"] == f"https://cdn.example.com/profiles/{u['id']}/{char['id']}/abc.png"
    assert calls[0] == (u["id"], char["id"])

def test_profile_upload_replaces_old_and_deletes(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    monkeypatch.setattr("app.s3.upload_profile",
                        lambda uid, cid, ext, data, ct: "https://cdn.example.com/profiles/%s/%s/new.png" % (uid, cid))
    deleted = []
    monkeypatch.setattr("app.s3.delete_profile", lambda url: deleted.append(url))
    h, u = register_user(client, "pf2", "阿换")
    char = _create_char(client, h)
    client.post(f"/api/me/characters/{char['id']}/profile", headers=h,
                files={"file": ("a.png", PNG_BYTES, "image/png")})
    deleted.clear()
    client.post(f"/api/me/characters/{char['id']}/profile", headers=h,
                files={"file": ("b.png", PNG_BYTES, "image/png")})
    assert len(deleted) == 1 and "profiles/" in deleted[0]  # 旧对象被删

def test_profile_upload_validation(client):
    h, u = register_user(client, "pf3", "阿限")
    char = _create_char(client, h)
    url = f"/api/me/characters/{char['id']}/profile"
    assert client.post(url, headers=h, files={"file": ("a.svg", b"x", "image/svg+xml")}).status_code == 400
    assert client.post(url, headers=h, files={"file": ("a.png", b"x" * (10 * 1024 * 1024 + 1), "image/png")}).status_code == 400
    # 内容与声称格式不符：magic 校验拦截（未配置 S3 也先 400）
    assert client.post(url, headers=h, files={"file": ("a.png", b"x", "image/png")}).status_code == 400
    # 合法 PNG 但 S3 未配置 → 503
    assert client.post(url, headers=h, files={"file": ("a.png", PNG_BYTES, "image/png")}).status_code == 503

def test_profile_upload_not_own_404(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    h1, u1 = register_user(client, "pf4", "阿甲")
    h2, u2 = register_user(client, "pf5", "阿乙")
    char = _create_char(client, h1)
    assert client.post(f"/api/me/characters/{char['id']}/profile", headers=h2,
                       files={"file": ("a.png", b"x", "image/png")}).status_code == 404

def test_profile_restore_default(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    monkeypatch.setattr("app.s3.upload_profile",
                        lambda uid, cid, ext, data, ct: "https://cdn.example.com/profiles/%s/%s/abc.png" % (uid, cid))
    deleted = []
    monkeypatch.setattr("app.s3.delete_profile", lambda url: deleted.append(url))
    h, u = register_user(client, "pf6", "阿恢")
    char = _create_char(client, h)
    client.post(f"/api/me/characters/{char['id']}/profile", headers=h,
                files={"file": ("a.png", PNG_BYTES, "image/png")})
    r = client.delete(f"/api/me/characters/{char['id']}/profile", headers=h)
    assert r.status_code == 200
    assert r.json()["profile"] is None
    assert len(deleted) == 1

def test_profile_restore_not_own_404(client, monkeypatch):
    h1, u1 = register_user(client, "pf7", "阿丙")
    h2, u2 = register_user(client, "pf8", "阿丁")
    char = _create_char(client, h1)
    assert client.delete(f"/api/me/characters/{char['id']}/profile", headers=h2).status_code == 404

def test_profile_upload_apng(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    captured = []
    monkeypatch.setattr("app.s3.upload_profile",
                        lambda uid, cid, ext, data, ct: captured.append((ext, ct)) or
                        "https://cdn.example.com/profiles/%s/%s/a.png" % (uid, cid))
    h, u = register_user(client, "pf9", "阿动")
    char = _create_char(client, h)
    url = f"/api/me/characters/{char['id']}/profile"
    for ct in ("image/apng", "image/png"):
        r = client.post(url, headers=h, files={"file": ("a.apng", APNG_BYTES, ct)})
        assert r.status_code == 200, ct
    # 两种声称类型都归一化存储为 image/png
    assert captured == [("png", "image/png"), ("png", "image/png")]
