import app.s3 as s3mod

def test_s3_configured_false_by_default(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "s3_endpoint", "")
    monkeypatch.setattr(settings, "s3_access_key", "")
    monkeypatch.setattr(settings, "s3_secret_key", "")
    monkeypatch.setattr(settings, "s3_bucket", "")
    monkeypatch.setattr(settings, "s3_public_base", "")
    assert s3mod.s3_configured() is False
