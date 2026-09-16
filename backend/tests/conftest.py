from sqlalchemy.pool import StaticPool
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
