from types import SimpleNamespace

import app.s3 as s3mod
from .helpers import register_user

def _upload(client, h, filename="a.png", data=b"fakepng", content_type="image/png"):
    return client.post("/api/me/avatar", headers=h,
                       files={"file": (filename, data, content_type)})

def test_s3_configured_false_by_default(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "s3_endpoint", "")
    monkeypatch.setattr(settings, "s3_access_key", "")
    monkeypatch.setattr(settings, "s3_secret_key", "")
    monkeypatch.setattr(settings, "s3_bucket", "")
    monkeypatch.setattr(settings, "s3_public_base", "")
    assert s3mod.s3_configured() is False

def test_update_profile_success(client):
    h, u = register_user(client, "prof1", "原名")
    r = client.put("/api/me/profile", headers=h, json={"nickname": "新名"})
    assert r.status_code == 200
    assert r.json()["nickname"] == "新名"
    assert client.get("/api/auth/me", headers=h).json()["nickname"] == "新名"

def test_update_profile_duplicate_and_self(client):
    h1, _ = register_user(client, "prof2", "甲甲")
    h2, u2 = register_user(client, "prof3", "乙乙")
    # 改成他人昵称 → 400
    assert client.put("/api/me/profile", headers=h2,
                      json={"nickname": "甲甲"}).status_code == 400
    # 改回自己当前昵称 → 200（查重排除自己）
    assert client.put("/api/me/profile", headers=h2,
                      json={"nickname": "乙乙"}).status_code == 200

def test_update_profile_invalid_chars(client):
    h, _ = register_user(client, "prof4", "名")
    for bad in ("带空格 名", "带@号", "带-线"):
        assert client.put("/api/me/profile", headers=h,
                          json={"nickname": bad}).status_code == 422

def test_avatar_upload_success(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    monkeypatch.setattr("app.s3.upload_avatar",
                        lambda uid, ext, data, ct: "https://cdn.example.com/avatars/1/abc.png")
    h, _ = register_user(client, "prof5", "阿图")
    r = _upload(client, h)
    assert r.status_code == 200
    assert r.json()["avatar"] == "https://cdn.example.com/avatars/1/abc.png"
    assert client.get("/api/auth/me", headers=h).json()["avatar"] == \
        "https://cdn.example.com/avatars/1/abc.png"

def test_avatar_upload_rejects_non_image(client):
    h, _ = register_user(client, "prof6", "阿文")
    assert _upload(client, h, content_type="text/plain").status_code == 400

def test_avatar_upload_rejects_unwhitelisted_image(client):
    # 仅白名单 png/jpg/webp；svg/gif/bmp 等一律拒绝（避免任意 image/* 被存成 .bin）
    h, _ = register_user(client, "prof9", "阿限")
    for ct in ("image/svg+xml", "image/gif", "image/bmp", "image/avif"):
        assert _upload(client, h, content_type=ct).status_code == 400, ct

def test_avatar_upload_rejects_oversize(client):
    h, _ = register_user(client, "prof7", "阿大")
    big = b"x" * (2 * 1024 * 1024 + 1)
    assert _upload(client, h, data=big).status_code == 400

def test_avatar_unconfigured(client):
    h, _ = register_user(client, "prof8", "阿存")
    # 默认未配置 S3（conftest 环境无 env）
    assert _upload(client, h).status_code == 503

# —— 代码质量审查补充：s3 模块 URL 拼接 / 删除逻辑的直接单测 ——

def test_upload_avatar_url_and_acl(monkeypatch):
    from app.config import settings
    calls = {}
    def fake_client():
        return SimpleNamespace(put_object=lambda **kw: calls.update(kw))
    monkeypatch.setattr("app.s3._get_client", fake_client)
    monkeypatch.setattr(settings, "s3_public_base", "https://cdn.example.com/")
    monkeypatch.setattr(settings, "s3_bucket", "bucket")
    url = s3mod.upload_avatar(1, "png", b"x", "image/png")
    assert url.startswith("https://cdn.example.com/avatars/1/")
    assert url.endswith(".png")
    assert calls["ACL"] == "public-read"
    assert calls["Bucket"] == "bucket"
    assert calls["ContentType"] == "image/png"

def test_delete_avatar_prefix_guard(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "s3_public_base", "https://cdn.example.com")
    monkeypatch.setattr(settings, "s3_bucket", "bucket")
    deleted = []
    monkeypatch.setattr("app.s3._get_client",
                        lambda: SimpleNamespace(delete_object=lambda **kw: deleted.append(kw)))
    s3mod.delete_avatar("https://other.com/avatars/1/x.png")  # 前缀外 → 不调 client
    assert deleted == []
    s3mod.delete_avatar("https://cdn.example.com/avatars/1/x.png")
    assert deleted and deleted[0]["Key"] == "avatars/1/x.png"
    # 删除抛异常 → 吞掉不抛出
    def boom(**kw): raise RuntimeError("boom")
    monkeypatch.setattr("app.s3._get_client", lambda: SimpleNamespace(delete_object=boom))
    s3mod.delete_avatar("https://cdn.example.com/avatars/2/y.png")
