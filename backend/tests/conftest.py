import os
from sqlalchemy.pool import StaticPool
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# 测试环境自洽：env 变量优先于 .env 文件（pydantic-settings 优先级），
# 强制 api_token 用默认值、清空 S3 配置——避免测试读到开发者 .env 的真实凭据（含误传真实 OSS）。
os.environ["DNFER_API_TOKEN"] = "change-me-bot-token"
for _k in ("DNFER_S3_ENDPOINT", "DNFER_S3_ACCESS_KEY", "DNFER_S3_SECRET_KEY",
           "DNFER_S3_BUCKET", "DNFER_S3_REGION", "DNFER_S3_PUBLIC_BASE"):
    os.environ[_k] = ""

from app.auth import hash_password
from app.db import Base, get_db
from app.main import app
from app.models import User

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

@event.listens_for(engine, "connect")
def _set_sqlite_fk(dbapi_connection, _):  # pragma: no cover
    dbapi_connection.execute("PRAGMA foreign_keys=ON")

@pytest.fixture()
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSession()
    # 测试库内直接种入管理员（lifespan 的 bootstrap 跑在真实引擎上，不覆盖测试库）
    if not session.query(User).filter(User.username == "admin").first():
        session.add(User(username="admin",
                         password_hash=hash_password("admin123"),
                         nickname="群主", is_admin=True))
        session.commit()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture()
def client(db):
    def override_get_db():
        yield db
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture()
def admin_headers(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {resp.json()['token']}"}
