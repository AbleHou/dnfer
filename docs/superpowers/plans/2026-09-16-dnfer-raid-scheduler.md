# DNfer 攻坚排表系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 DNF 游戏群的成员管理 + 攻坚队排表 Web 应用（Vue3 + FastAPI + SQLite，WebSocket 实时同步，群机器人 Token API）。

**Architecture:** 单体 FastAPI 服务提供 REST + WebSocket + 托管前端静态文件。排表状态以服务器为权威，变更写库后经 WebSocket 广播增量事件；前端乐观更新、按版本号合并。SQLite 单文件持久化，Docker Compose 单容器部署。

**Tech Stack:** 后端 Python 3.12 / FastAPI / SQLAlchemy 2 / Pydantic v2 / bcrypt / PyJWT / pytest。前端 Vue 3 / TypeScript / Vite / Pinia / Vue Router / Vitest。

**Spec:** `docs/superpowers/specs/2026-09-16-dnfer-raid-scheduler-design.md`

---

## 项目结构（最终形态）

```
dnfer/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── docs/
│   └── superpowers/...          # spec + plan
├── backend/
│   ├── pyproject.toml
│   ├── pytest.ini
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # 应用入口、路由注册、CORS、静态托管、初始化管理员
│   │   ├── config.py            # 环境变量（pydantic-settings）
│   │   ├── db.py                # SQLite 引擎 + Session 依赖
│   │   ├── models.py            # SQLAlchemy 模型
│   │   ├── schemas.py           # Pydantic 请求/响应
│   │   ├── auth.py              # 密码哈希、JWT、get_current_user/require_admin/require_api_token
│   │   ├── ws.py                # ConnectionManager + WS 端点
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── raid_validator.py  # 职责/小队规则纯函数
│   │   │   └── raid_builder.py    # 创建 raid/wave/slot 结构、读取详情组装
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth.py
│   │       ├── members.py
│   │       ├── raids.py
│   │       └── public.py
│   └── tests/
│       ├── conftest.py          # 内存 sqlite + TestClient + fixtures
│       ├── test_raid_validator.py
│       ├── test_auth.py
│       ├── test_members.py
│       ├── test_raids.py
│       ├── test_public.py
│       └── test_ws.py
└── frontend/
    ├── package.json
    ├── vite.config.ts           # dev 代理到 :8000
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.ts
        ├── App.vue
        ├── router/index.ts
        ├── api/client.ts        # fetch 封装（带 JWT）
        ├── api/ws.ts            # WebSocket 客户端
        ├── stores/auth.ts
        ├── stores/raid.ts       # 排表状态 + 乐观更新 + WS 事件合并
        ├── types.ts
        ├── lib/duty.ts          # 职责选项/默认职责
        ├── lib/colors.ts        # 小队颜色
        ├── views/
        │   ├── LoginView.vue
        │   ├── RegisterView.vue
        │   ├── RaidListView.vue
        │   ├── RaidDetailView.vue
        │   ├── MyCharactersView.vue
        │   └── AdminView.vue
        └── components/
            ├── SlotCell.vue
            ├── WaveSection.vue
            ├── CharacterPickerModal.vue
            └── DutySelect.vue
```

---

## Task 1: 后端脚手架 + 数据模型 + 数据库

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/pytest.ini`
- Create: `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/db.py`, `backend/app/models.py`, `backend/app/schemas.py`
- Create: `backend/tests/__init__.py`, `backend/tests/conftest.py`

- [ ] **Step 1: 创建后端工程文件**

`backend/pyproject.toml`:

```toml
[project]
name = "dnfer-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy>=2.0",
    "pydantic-settings>=2.4",
    "bcrypt>=4.1",
    "PyJWT>=2.9",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "httpx>=0.27"]

[tool.pytest.ini_options]
pythonpath = ["."]
```

`backend/pytest.ini`:

```ini
[pytest]
pythonpath = .
```

- [ ] **Step 2: 配置与数据库连接**

`backend/app/config.py`:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/dnfer.db"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60 * 24 * 7
    admin_username: str = "admin"
    admin_password: str = "admin123"
    admin_nickname: str = "群主"
    api_token: str = "change-me-bot-token"
    code_expire_days: int | None = 7

    model_config = {"env_file": ".env", "env_prefix": "DNFER_"}

settings = Settings()
```

`backend/app/db.py`:

```python
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

if settings.database_url.startswith("sqlite"):
    Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})

if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _):  # pragma: no cover
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db() -> None:
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
```

- [ ] **Step 3: 数据模型**

`backend/app/models.py`:

```python
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

def _now() -> datetime:
    # SQLite 的 DateTime 列存 naive；统一用 naive UTC 避免 aware/naive 比较报错
    return datetime.now(timezone.utc).replace(tzinfo=None)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    nickname: Mapped[str] = mapped_column(String(64))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    characters: Mapped[list["Character"]] = relationship(back_populates="owner")

class RegistrationCode(Base):
    __tablename__ = "registration_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    used_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    single_use: Mapped[bool] = mapped_column(Boolean, default=True)

class Character(Base):
    __tablename__ = "characters"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    class_type: Mapped[str] = mapped_column(String(8))  # "输出" | "辅助"
    fame: Mapped[int] = mapped_column(Integer, default=0)
    simulated_damage: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 输出
    sustained_dps: Mapped[int | None] = mapped_column(Integer, nullable=True)      # 输出
    buff_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)        # 辅助
    owner: Mapped[User] = relationship(back_populates="characters")

class Raid(Base):
    __tablename__ = "raids"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    dungeon: Mapped[str] = mapped_column(String(64), default="")
    size: Mapped[int] = mapped_column(Integer, default=12)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    waves: Mapped[list["Wave"]] = relationship(back_populates="raid",
                                               order_by="Wave.index", cascade="all, delete-orphan")

class Wave(Base):
    __tablename__ = "waves"
    __table_args__ = (UniqueConstraint("raid_id", "index"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    raid: Mapped[Raid] = relationship(back_populates="waves")
    slots: Mapped[list["Slot"]] = relationship(back_populates="wave",
                                               cascade="all, delete-orphan")

class Slot(Base):
    __tablename__ = "slots"
    __table_args__ = (UniqueConstraint("wave_id", "squad_index", "row_index"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    wave_id: Mapped[int] = mapped_column(ForeignKey("waves.id"), index=True)
    squad_index: Mapped[int] = mapped_column(Integer)
    row_index: Mapped[int] = mapped_column(Integer)
    character_id: Mapped[int | None] = mapped_column(ForeignKey("characters.id"), nullable=True)
    duty: Mapped[str | None] = mapped_column(String(16), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    wave: Mapped[Wave] = relationship(back_populates="slots")
    character: Mapped[Character | None] = relationship()
```

- [ ] **Step 4: Pydantic 模式**

`backend/app/schemas.py`:

```python
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class CharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    class_type: str  # "输出" | "辅助"
    fame: int = 0
    simulated_damage: int | None = None
    sustained_dps: int | None = None
    buff_amount: int | None = None

class CharacterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    class_type: str
    fame: int
    simulated_damage: int | None
    sustained_dps: int | None
    buff_amount: int | None

class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    nickname: str = Field(min_length=1, max_length=64)
    code: str

class LoginIn(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    nickname: str
    is_admin: bool

class CodeCreate(BaseModel):
    single_use: bool = True
    expire_days: int | None = None

class CodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    used_by: int | None
    used_at: datetime | None
    expires_at: datetime | None
    single_use: bool

class RaidCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    dungeon: str = Field(default="", max_length=64)
    size: int = 12

class RaidUpdate(BaseModel):
    name: str | None = None
    dungeon: str | None = None

class RaidListItem(BaseModel):
    id: int
    name: str
    dungeon: str
    size: int
    locked: bool
    wave_count: int

class SlotOut(BaseModel):
    id: int
    squad_index: int
    row_index: int
    character_id: int | None
    character_name: str | None
    character_class: str | None
    fame: int | None
    simulated_damage: int | None
    sustained_dps: int | None
    buff_amount: int | None
    owner_id: int | None
    owner_nickname: str | None
    duty: str | None
    version: int

class WaveOut(BaseModel):
    id: int
    index: int
    slots: list[SlotOut]

class RaidDetail(BaseModel):
    id: int
    name: str
    dungeon: str
    size: int
    locked: bool
    waves: list[WaveOut]

class FillIn(BaseModel):
    character_id: int
    duty: str | None = None  # 可选；缺省按职业默认（主C/主奶）

class DutyIn(BaseModel):
    duty: str

class SlotMutationResult(BaseModel):
    slot: SlotOut
    warnings: list[str] = []

class FillResponse(BaseModel):
    slot: SlotOut
    warnings: list[str] = []
```

- [ ] **Step 5: 测试脚手架**

`backend/tests/conftest.py` 先放占位（含静态导入），Task 2 提供 `app.main` 后补全为最终版（见 Step 6）。

```python
# 占位：Task 2 后替换为 Step 6 完整版
```

- [ ] **Step 6: 完整 conftest（在 Task 2 提供 main 后生效）**

`backend/tests/conftest.py`（最终版）：

```python
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
```

- [ ] **Step 7: 冒烟测试确认**

创建 `backend/tests/test_smoke.py`：

```python
def test_imports():
    from app.config import settings  # noqa: F401
    from app import models  # noqa: F401
    from app import schemas  # noqa: F401
    assert True
```

Run: `cd backend && pip install -e ".[dev]" && pytest tests/test_smoke.py -v`
Expected: PASS（1 passed）

- [ ] **Step 8: Commit**

```bash
git init
echo -e ".venv/\n__pycache__/\n*.pyc\n.env\nbackend/data/\n.superpowers/" >> .gitignore
git add backend/ .gitignore
git commit -m "feat: scaffold backend with models, config, db"
```

---

## Task 2: 认证 — 注册码、JWT、管理员初始化

**Files:**
- Create: `backend/app/auth.py`, `backend/app/routers/__init__.py`, `backend/app/routers/auth.py`, `backend/app/main.py`
- Modify: `backend/tests/conftest.py`（完整版，见 Task 1 Step 6）
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_auth.py`：

```python
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_auth.py -v`
Expected: FAIL（app 不存在/接口 404）

- [ ] **Step 3: 认证核心**

`backend/app/auth.py`:

```python
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import RegistrationCode, User

_bearer = HTTPBearer(auto_error=False)

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

def create_access_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.secret_key, algorithm="HS256")

def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                     db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise HTTPException(401, "未登录")
    try:
        payload = jwt.decode(creds.credentials, settings.secret_key, algorithms=["HS256"])
        user_id = int(payload.get("sub", ""))
    except (jwt.PyJWTError, TypeError, ValueError):
        raise HTTPException(401, "登录已过期，请重新登录")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(401, "用户不存在")
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "需要管理员权限")
    return user

def require_api_token(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "缺少 API Token")
    token = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, settings.api_token):
        raise HTTPException(401, "API Token 无效")

def make_code(db: Session, admin: User, single_use: bool, expire_days: int | None) -> RegistrationCode:
    code = secrets.token_hex(6)
    expires = None
    if expire_days:
        expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=expire_days)
    rc = RegistrationCode(code=code, created_by=admin.id, single_use=single_use, expires_at=expires)
    db.add(rc)
    return rc

def consume_code(db: Session, code: str) -> RegistrationCode:
    rc = db.query(RegistrationCode).filter(RegistrationCode.code == code).first()
    if rc is None:
        raise HTTPException(400, "注册码无效")
    if rc.used_by is not None:
        raise HTTPException(400, "注册码已被使用")
    if rc.expires_at and rc.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(400, "注册码已过期")
    return rc
```

- [ ] **Step 4: 认证路由**

`backend/app/routers/auth.py`:

```python
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import (consume_code, create_access_token, get_current_user,
                    hash_password, make_code, require_admin, verify_password)
from ..config import settings
from ..db import get_db
from ..models import RegistrationCode, User
from ..schemas import CodeCreate, CodeOut, LoginIn, RegisterIn, UserOut

router = APIRouter(prefix="/api", tags=["auth"])

@router.post("/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "用户名已存在")
    rc = consume_code(db, body.code)
    user = User(username=body.username, password_hash=hash_password(body.password),
                nickname=body.nickname, is_admin=False)
    db.add(user)
    db.flush()
    if rc.single_use:
        rc.used_by = user.id
        rc.used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"token": create_access_token(user.id), "user": UserOut.model_validate(user)}

@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "用户名或密码错误")
    return {"token": create_access_token(user.id), "user": UserOut.model_validate(user)}

@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)

@router.post("/admin/codes", response_model=CodeOut)
def create_code(body: CodeCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rc = make_code(db, admin, body.single_use, body.expire_days)
    db.commit()
    db.refresh(rc)
    return rc

@router.get("/admin/codes", response_model=list[CodeOut])
def list_codes(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(RegistrationCode).order_by(RegistrationCode.id.desc()).limit(100).all()

@router.get("/admin/users", response_model=list[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(User).all()
```

- [ ] **Step 5: 应用入口（含管理员初始化）**

> **渐进式注册**：本 Task 的 `main.py` 只注册 `auth` 路由；`members`/`raids`/`public`/`ws` 路由由后续 Task 各自的「注册路由」步骤追加。否则 `conftest` 导入 `app.main` 时因找不到尚未创建的路由模块而 `ImportError`，导致本 Task 测试无法收集。

`backend/app/main.py`（本 Task 版本）：

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .auth import hash_password
from .config import settings
from .db import SessionLocal, init_db
from .models import User
from .routers import auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    if not db.query(User).filter(User.username == settings.admin_username).first():
        db.add(User(username=settings.admin_username,
                    password_hash=hash_password(settings.admin_password),
                    nickname=settings.admin_nickname, is_admin=True))
        db.commit()
    db.close()
    yield

app = FastAPI(title="DNfer", lifespan=lifespan)

app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(auth.router)

FRONTEND_DIST = "../frontend/dist"
try:
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
except RuntimeError:
    pass  # 前端未构建时忽略
```

- [ ] **Step 6: 补齐 conftest 完整版**

将 Task 1 Step 6 的最终版 `conftest.py` 写入。运行测试。

- [ ] **Step 7: 运行测试确认通过**

Run: `cd backend && pytest tests/test_auth.py -v`
Expected: PASS（全部通过）

- [ ] **Step 8: Commit**

```bash
git add backend/app backend/tests
git commit -m "feat: auth with registration codes, JWT, admin bootstrap"
```

---

## Task 3: 角色管理（成员 CRUD）

**Files:**
- Create: `backend/app/routers/members.py`
- Test: `backend/tests/test_members.py`

- [ ] **Step 1: 写失败测试**

> 为简化，测试通过 admin 创建注册码 + 注册，再取 token。使用辅助函数：

`backend/tests/helpers.py`：

```python
def register_user(client, username, nickname):
    admin = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    ah = {"Authorization": f"Bearer {admin.json()['token']}"}
    code = client.post("/api/admin/codes", json={"single_use": True}, headers=ah).json()["code"]
    r = client.post("/api/auth/register", json={
        "username": username, "password": "secret1", "nickname": nickname, "code": code})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]
```

`backend/tests/test_members.py`：

```python
from .helpers import register_user

def test_character_crud(client):
    h, _ = register_user(client, "player1", "阿伟")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 21000,
        "simulated_damage": 680000, "sustained_dps": 420000})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["sustained_dps"] == 420000

    r = client.get("/api/me/characters", headers=h)
    assert len(r.json()) == 1

    r = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂·改", "class_type": "输出", "fame": 22000,
        "simulated_damage": 700000, "sustained_dps": 430000})
    assert r.status_code == 200
    assert r.json()["name"] == "剑魂·改"

    r = client.delete(f"/api/me/characters/{cid}", headers=h)
    assert r.status_code == 200
    assert client.get("/api/me/characters", headers=h).json() == []

def test_cannot_touch_others_characters(client):
    h1, _ = register_user(client, "p1", "甲")
    h2, _ = register_user(client, "p2", "乙")
    cid = client.post("/api/me/characters", headers=h1, json={
        "name": "奶", "class_type": "辅助", "fame": 10000, "buff_amount": 9800}).json()["id"]
    assert client.put(f"/api/me/characters/{cid}", headers=h2, json={
        "name": "x", "class_type": "辅助", "fame": 1}).status_code == 404
    assert client.delete(f"/api/me/characters/{cid}", headers=h2).status_code == 404
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && pytest tests/test_members.py -v`
Expected: FAIL（404）

- [ ] **Step 3: 实现路由**

`backend/app/routers/members.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import Character, Slot, User
from ..schemas import CharacterIn, CharacterOut

router = APIRouter(prefix="/api/me/characters", tags=["members"])

@router.get("", response_model=list[CharacterOut])
def list_characters(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Character).where(Character.user_id == user.id)).all()

@router.post("", response_model=CharacterOut)
def create_character(body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = Character(user_id=user.id, **body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

def _own_character(db: Session, cid: int, user: User) -> Character:
    c = db.get(Character, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "角色不存在")
    return c

@router.put("/{cid}", response_model=CharacterOut)
def update_character(cid: int, body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c

@router.delete("/{cid}")
def delete_character(cid: int, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    in_use = db.query(Slot).filter(Slot.character_id == cid).first()
    if in_use:
        raise HTTPException(400, "该角色正在攻坚中，请先撤下")
    db.delete(c)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 4: 注册路由到 main.py**

修改 `backend/app/main.py`：`from .routers import auth` 改为 `from .routers import auth, members`，并在 `app.include_router(auth.router)` 后加 `app.include_router(members.router)`。

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && pytest tests/test_members.py -v`
Expected: PASS

> 说明：`test_delete_character_in_use_blocked` 依赖 Task 4 的攻坚接口，已从 `test_members.py` 移入 `test_raids.py`（见 Task 4 Step 4），本 Task 不含该用例。

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/members.py backend/app/main.py backend/tests/test_members.py backend/tests/helpers.py
git commit -m "feat: member character CRUD with ownership checks"
```

---

## Task 4: 攻坚 / 波次 / 格子 + 校验规则

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/raid_validator.py`, `backend/app/services/raid_builder.py`, `backend/app/routers/raids.py`
- Test: `backend/tests/test_raid_validator.py`, `backend/tests/test_raids.py`

- [ ] **Step 1: 校验规则纯函数（先写测试）**

`backend/tests/test_raid_validator.py`：

```python
from app.services.raid_validator import (check_composition, default_duty,
                                         duty_options, duty_valid_for_class)

def test_duty_options_and_defaults():
    assert set(duty_options("输出")) == {"主C", "辅C", "划水"}
    assert set(duty_options("辅助")) == {"主奶", "太阳奶", "划水"}
    assert default_duty("输出") == "主C"
    assert default_duty("辅助") == "主奶"

def test_duty_valid_for_class():
    assert duty_valid_for_class("主C", "输出")
    assert not duty_valid_for_class("主奶", "输出")
    assert not duty_valid_for_class("主C", "辅助")

def test_composition_valid_full_squad():
    occupied = [("主C", "输出"), ("辅C", "输出"), ("主奶", "辅助"), ("太阳奶", "辅助")]
    assert check_composition(occupied, is_full=True) == []

def test_composition_missing_healer_warns_partial_but_errors_full():
    occupied = [("主C", "输出"), ("辅C", "输出"), ("辅C", "输出"), ("辅C", "输出")]
    warnings = check_composition(occupied, is_full=False)
    assert "缺少辅助" in warnings
    errors = check_composition(occupied, is_full=True)
    assert "缺少辅助" in errors

def test_composition_exempt_with_划水():
    occupied = [("主C", "输出"), ("划水", "输出"), ("划水", "辅助"), ("划水", "辅助")]
    assert check_composition(occupied, is_full=True) == []

def test_composition_missing_mainc():
    occupied = [("辅C", "输出"), ("太阳奶", "辅助"), ("辅C", "输出"), ("太阳奶", "辅助")]
    assert "缺少主C" in check_composition(occupied, is_full=True)

def test_squad_main_healer_limit_is_invariant():
    occupied = [("主奶", "辅助"), ("主奶", "辅助")]
    assert "至多一名主奶" in check_composition(occupied, is_full=False)
```

`backend/app/services/raid_validator.py`:

```python
DUTY_BY_CLASS = {
    "输出": ["主C", "辅C", "划水"],
    "辅助": ["主奶", "太阳奶", "划水"],
}
VALID_DUTIES = {"主C", "辅C", "主奶", "太阳奶", "划水"}

def duty_options(class_type: str) -> list[str]:
    return list(DUTY_BY_CLASS[class_type])

def default_duty(class_type: str) -> str:
    return "主C" if class_type == "输出" else "主奶"

def duty_valid_for_class(duty: str, class_type: str) -> bool:
    return duty in DUTY_BY_CLASS[class_type]

def check_composition(occupied, is_full: bool) -> list[str]:
    """occupied: list[(duty, class_type)] 仅已占位成员。
    返回问题列表；is_full=True 时这些问题视为硬错误，否则为警告。
    小队内任一划水成员则免除组成要求。"""
    issues: list[str] = []
    main_healers = [d for d, _ in occupied if d == "主奶"]
    if len(main_healers) > 1:
        issues.append("至多一名主奶")
    if any(d == "划水" for d, _ in occupied):
        return issues  # 有划水，免除组成要求
    has_dps = any(ct == "输出" for _, ct in occupied)
    has_supp = any(ct == "辅助" for _, ct in occupied)
    has_mainc = any(d == "主C" for d, _ in occupied)
    if not has_dps:
        issues.append("缺少输出")
    if not has_supp:
        issues.append("缺少辅助")
    if not has_mainc:
        issues.append("缺少主C")
    return issues
```

- [ ] **Step 2: 运行校验测试**

Run: `cd backend && pytest tests/test_raid_validator.py -v`
Expected: PASS

- [ ] **Step 3: 攻坚构建辅助**

`backend/app/services/raid_builder.py`:

```python
from sqlalchemy.orm import Session

from ..models import Raid, Slot, Wave

LEGAL_SIZES = {4, 8, 12, 16, 20}
SQUAD_PALETTE = ["红", "黄", "绿", "蓝", "紫"]

def validate_size(size: int) -> None:
    if size not in LEGAL_SIZES:
        raise ValueError("规模必须是 4/8/12/16/20")

def create_raid(db: Session, name: str, dungeon: str, size: int, created_by: int) -> Raid:
    validate_size(size)
    raid = Raid(name=name, dungeon=dungeon, size=size, created_by=created_by)
    db.add(raid)
    db.flush()
    create_wave(db, raid)
    return raid

def create_wave(db: Session, raid: Raid) -> Wave:
    max_index = db.query(Wave.index).filter(Wave.raid_id == raid.id).order_by(Wave.index.desc()).first()
    index = (max_index[0] + 1) if max_index else 1
    wave = Wave(raid_id=raid.id, index=index)
    db.add(wave)
    db.flush()
    squads = raid.size // 4
    for sq in range(squads):
        for row in range(4):
            db.add(Slot(wave_id=wave.id, squad_index=sq, row_index=row))
    db.flush()
    return wave

def squad_color(squad_index: int, palette: list[str] | None = None) -> str:
    return (palette or SQUAD_PALETTE)[squad_index % len(palette or SQUAD_PALETTE)]
```

- [ ] **Step 4: 攻坚/波次/格子路由（先写测试）**

`backend/tests/test_raids.py`：

```python
from .helpers import register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def test_create_raid_only_admin(client):
    h, _ = register_user(client, "p1", "甲")
    r = client.post("/api/raids", headers=h, json={"name": "巴卡尔", "size": 12})
    assert r.status_code == 403
    ah = _admin(client)
    r = client.post("/api/raids", headers=ah, json={"name": "巴卡尔", "size": 12})
    assert r.status_code == 200
    rid = r.json()["id"]
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert detail["size"] == 12
    assert len(detail["waves"]) == 1
    assert len(detail["waves"][0]["slots"]) == 12
    assert {s["squad_index"] for s in detail["waves"][0]["slots"]} == {0, 1, 2}

def test_create_raid_rejects_bad_size(client):
    ah = _admin(client)
    assert client.post("/api/raids", headers=ah, json={"name": "x", "size": 10}).status_code == 400

def test_lock_unlock(client):
    ah = _admin(client)
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    assert client.post(f"/api/raids/{rid}/lock", headers=ah).status_code == 200
    assert client.get(f"/api/raids/{rid}", headers=ah).json()["locked"] is True
    assert client.post(f"/api/raids/{rid}/unlock", headers=ah).status_code == 200

def test_member_fill_remove_duty(client):
    ah = _admin(client)
    h, user = register_user(client, "p2", "乙")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 20000,
        "simulated_damage": 600000, "sustained_dps": 400000}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    slots = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
    slot0 = slots[0]

    # fill -> duty default 主C
    r = client.post(f"/api/raids/{rid}/slots/{slot0['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 200
    assert r.json()["slot"]["duty"] == "主C"
    assert r.json()["slot"]["owner_nickname"] == "乙"
    assert r.json()["slot"]["character_name"] == "剑魂"

    # change duty
    r = client.put(f"/api/raids/{rid}/slots/{slot0['id']}/duty", headers=h, json={"duty": "辅C"})
    assert r.status_code == 200
    assert r.json()["slot"]["duty"] == "辅C"

    # remove
    assert client.delete(f"/api/raids/{rid}/slots/{slot0['id']}", headers=h).status_code == 200

def test_cannot_fill_others_characters(client):
    ah = _admin(client)
    h1, _ = register_user(client, "p3", "丙")
    h2, _ = register_user(client, "p4", "丁")
    cid = client.post("/api/me/characters", headers=h1, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h2).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h2,
                    json={"character_id": cid})
    assert r.status_code == 400

def test_character_unique_across_waves(client):
    ah = _admin(client)
    h, _ = register_user(client, "p5", "戊")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    client.post(f"/api/raids/{rid}/waves", headers=h, json={})  # add wave 2
    w1, w2 = [w for w in client.get(f"/api/raids/{rid}", headers=h).json()["waves"]
              if w["index"] in (1, 2)]
    s1 = w1["slots"][0]
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    r = client.post(f"/api/raids/{rid}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 400

def test_main_healer_limit(client):
    ah = _admin(client)
    h, _ = register_user(client, "p6", "己")
    c1 = client.post("/api/me/characters", headers=h, json={
        "name": "奶1", "class_type": "辅助", "fame": 1, "buff_amount": 9000}).json()["id"]
    c2 = client.post("/api/me/characters", headers=h, json={
        "name": "奶2", "class_type": "辅助", "fame": 1, "buff_amount": 8000}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    slots = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
    s0, s1 = slots[0], slots[1]
    # c1 默认主奶，占位成功
    assert client.post(f"/api/raids/{rid}/slots/{s0['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200
    # c2 默认主奶 → 超限 400
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c2}).status_code == 400
    # 指定太阳奶可占位
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c2, "duty": "太阳奶"}).status_code == 200
    # 之后想改成主奶 → 400
    assert client.put(f"/api/raids/{rid}/slots/{s1['id']}/duty", headers=h,
                      json={"duty": "主奶"}).status_code == 400

def test_full_squad_composition_error(client):
    ah = _admin(client)
    h, _ = register_user(client, "p6b", "己b")
    ids = [client.post("/api/me/characters", headers=h, json={
        "name": f"C{i}", "class_type": "输出", "fame": 1}).json()["id"]
        for i in range(4)]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    squad0 = [s for s in client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
              if s["squad_index"] == 0]
    for i in range(3):
        assert client.post(f"/api/raids/{rid}/slots/{squad0[i]['id']}/fill", headers=h,
                           json={"character_id": ids[i]}).status_code == 200
    # 第 4 个输出占满小队 → 缺少辅助，硬错误 400
    assert client.post(f"/api/raids/{rid}/slots/{squad0[3]['id']}/fill", headers=h,
                       json={"character_id": ids[3]}).status_code == 400

def test_locked_raid_only_admin_edits(client):
    ah = _admin(client)
    h, _ = register_user(client, "p7", "庚")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 403

def test_wave_add_and_delete_rules(client):
    ah = _admin(client)
    h, user = register_user(client, "p8", "辛")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    # add wave 2
    r = client.post(f"/api/raids/{rid}/waves", headers=h, json={})
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    w2 = next(w for w in detail["waves"] if w["index"] == 2)
    assert len(w2["slots"]) == 12
    # member cannot delete wave 2 if it has someone else's character
    # (only own chars) -> fill own char then can delete
    s = w2["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=h, json={"character_id": cid})
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=h).status_code == 200
    # cannot delete last wave
    assert client.delete(f"/api/raids/{rid}/waves/1", headers=h).status_code == 400

def test_delete_character_in_use_blocked(client):
    h, _ = register_user(client, "p9", "壬")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 10000}).json()["id"]
    ah = _admin(client)
    rid = client.post("/api/raids", headers=ah, json={"name": "巴卡尔", "size": 12}).json()["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h, json={"character_id": cid})
    r = client.delete(f"/api/me/characters/{cid}", headers=h)
    assert r.status_code == 400
```

- [ ] **Step 5: 创建 ws 模块（连接管理器，端点由 Task 6 补充）**

> 攻坚路由需要 `from ..ws import manager` 广播事件，因此**本 Task 先创建 `ws.py` 的连接管理器部分**；WS 端点与路由注册在 Task 6 追加。

`backend/app/ws.py`（本 Task 版本，仅管理器）：

```python
import asyncio
from collections import defaultdict

from fastapi import WebSocket

router = None  # Task 6 替换为 APIRouter 并注册端点

class ConnectionManager:
    """每个攻坚一个房间，向房间内所有 WS 广播事件。
    记录每个 ws 所属 loop，跨 loop 用 run_coroutine_threadsafe 发送（TestClient 场景）。"""
    def __init__(self) -> None:
        self.rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self._loops: dict[WebSocket, asyncio.AbstractEventLoop] = {}

    async def connect(self, raid_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms[raid_id].add(ws)
        self._loops[ws] = asyncio.get_running_loop()

    async def disconnect(self, raid_id: int, ws: WebSocket) -> None:
        self.rooms.get(raid_id, set()).discard(ws)
        self._loops.pop(ws, None)

    async def broadcast(self, raid_id: int, event: dict) -> None:
        stale = []
        current_loop = asyncio.get_running_loop()
        for ws in list(self.rooms.get(raid_id, set())):
            try:
                loop = self._loops.get(ws)
                if loop is None or loop is current_loop:
                    await ws.send_json(event)
                else:
                    future = asyncio.run_coroutine_threadsafe(ws.send_json(event), loop)
                    await asyncio.wrap_future(future)
            except Exception:
                stale.append(ws)
        for ws in stale:
            await self.disconnect(raid_id, ws)

manager = ConnectionManager()
```

- [ ] **Step 6: 攻坚路由实现**

`backend/app/routers/raids.py`:

```python
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_admin
from ..db import get_db
from ..models import Character, Raid, Slot, User, Wave
from ..schemas import (DutyIn, FillIn, FillResponse, RaidCreate, RaidDetail,
                       RaidListItem, RaidUpdate, SlotMutationResult, SlotOut,
                       WaveOut)
from ..services.raid_builder import create_raid as _build_raid, create_wave
from ..services.raid_validator import (check_composition, default_duty,
                                       duty_valid_for_class)
from ..ws import manager

def _now() -> datetime:
    # 与 models._now 一致：SQLite DateTime 存 naive，统一 naive UTC
    return datetime.now(timezone.utc).replace(tzinfo=None)

router = APIRouter(prefix="/api/raids", tags=["raids"])

def _raid_or_404(db: Session, rid: int) -> Raid:
    r = db.get(Raid, rid)
    if r is None:
        raise HTTPException(404, "攻坚不存在")
    return r

def _slot_out(slot: Slot) -> SlotOut:
    c = slot.character
    return SlotOut(
        id=slot.id, squad_index=slot.squad_index, row_index=slot.row_index,
        character_id=slot.character_id,
        character_name=c.name if c else None,
        character_class=c.class_type if c else None,
        fame=c.fame if c else None,
        simulated_damage=c.simulated_damage if c else None,
        sustained_dps=c.sustained_dps if c else None,
        buff_amount=c.buff_amount if c else None,
        owner_id=c.owner.id if c else None,
        owner_nickname=c.owner.nickname if c else None,
        duty=slot.duty, version=slot.version,
    )

def _detail(db: Session, raid: Raid) -> RaidDetail:
    waves = []
    for w in raid.waves:
        waves.append(WaveOut(id=w.id, index=w.index,
                             slots=[_slot_out(s) for s in w.slots]))
    return RaidDetail(id=raid.id, name=raid.name, dungeon=raid.dungeon,
                      size=raid.size, locked=raid.locked, waves=waves)

def _squad_occupied(db: Session, wave: Wave, squad_index: int) -> list[tuple[str, str]]:
    return [(s.duty, s.character.class_type) for s in wave.slots
            if s.squad_index == squad_index and s.character_id is not None]

def _validate_squad(db: Session, wave: Wave, squad_index: int) -> tuple[list[str], list[str]]:
    """返回 (hard_errors, warnings)。
    hard_errors：主奶超限（恒为硬性）+ 满员(4/4)且无划水时的组成问题 → 400。
    warnings：未满员时的组成问题 → 仅提示。"""
    occupied = _squad_occupied(db, wave, squad_index)
    filled = len(occupied)
    issues = check_composition(occupied, is_full=False)
    hard = [i for i in issues if i.startswith("至多")]  # 主奶不变量
    comp = [i for i in issues if not i.startswith("至多")]
    if filled == 4 and not any(d == "划水" for d, _ in occupied):
        hard = hard + comp
        warnings: list[str] = []
    else:
        warnings = comp
    return hard, warnings

def _raise_if_hard(db: Session, wave: Wave, squad_index: int) -> list[str]:
    """校验当前小队状态，存在硬错误则 400，否则返回警告。"""
    hard, warnings = _validate_squad(db, wave, squad_index)
    if hard:
        raise HTTPException(400, "；".join(hard))
    return warnings

@router.get("", response_model=list[RaidListItem])
def list_raids(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = []
    for r in db.query(Raid).order_by(Raid.created_at.desc()).all():
        items.append(RaidListItem(id=r.id, name=r.name, dungeon=r.dungeon, size=r.size,
                                  locked=r.locked, wave_count=len(r.waves)))
    return items

@router.post("")
def create_raid(body: RaidCreate, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    try:
        raid = _build_raid(db, body.name, body.dungeon, body.size, admin.id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return _detail(db, raid)

@router.get("/{rid}", response_model=RaidDetail)
def get_raid(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, _raid_or_404(db, rid))

@router.put("/{rid}")
def update_raid(rid: int, body: RaidUpdate, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if body.name is not None:
        raid.name = body.name
    if body.dungeon is not None:
        raid.dungeon = body.dungeon
    db.commit()
    return _detail(db, raid)

@router.post("/{rid}/lock")
async def lock_raid(rid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    raid.locked = True
    db.commit()
    await manager.broadcast(rid, {"type": "raid:locked"})
    return {"ok": True}

@router.post("/{rid}/unlock")
async def unlock_raid(rid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    raid.locked = False
    db.commit()
    await manager.broadcast(rid, {"type": "raid:unlocked"})
    return {"ok": True}

def _can_edit(user: User, raid: Raid) -> bool:
    return user.is_admin or not raid.locked

@router.post("/{rid}/waves")
async def add_wave(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if not _can_edit(user, raid):
        raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
    wave = create_wave(db, raid)
    db.commit()
    await manager.broadcast(rid, {"type": "wave:added", "index": wave.index})
    return _detail(db, raid)

@router.delete("/{rid}/waves/{index}")
async def delete_wave(rid: int, index: int, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    wave = db.query(Wave).filter(Wave.raid_id == rid, Wave.index == index).first()
    if wave is None:
        raise HTTPException(404, "波次不存在")
    if len(raid.waves) <= 1:
        raise HTTPException(400, "至少保留一个波次")
    if not user.is_admin:
        if raid.locked:
            raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
        filled = [s for s in wave.slots if s.character_id is not None]
        if any(s.updated_by != user.id for s in filled):
            raise HTTPException(403, "该波次包含他人角色，无权删除")
    db.delete(wave)
    db.commit()
    await manager.broadcast(rid, {"type": "wave:removed", "index": index})
    return {"ok": True}

@router.post("/{rid}/slots/{slot_id}/fill", response_model=FillResponse)
async def fill_slot(rid: int, slot_id: int, body: FillIn,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if not _can_edit(user, raid):
        raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
    slot = db.get(Slot, slot_id)
    if slot is None or slot.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if slot.character_id is not None:
        raise HTTPException(400, "该格已有人占位")
    char = db.get(Character, body.character_id)
    if char is None:
        raise HTTPException(404, "角色不存在")
    if not user.is_admin and char.user_id != user.id:
        raise HTTPException(400, "只能使用自己的角色")
    dup = db.query(Slot).filter(Slot.character_id == char.id,
                                Slot.id != slot.id).first()
    if dup:
        raise HTTPException(400, "该角色已在其他格子中")
    duty = body.duty or default_duty(char.class_type)
    if not duty_valid_for_class(duty, char.class_type):
        raise HTTPException(400, "职责与职业不匹配")
    slot.character_id = char.id
    slot.duty = duty
    # 先在校验器上校验（读取的是 session 内存态，未 commit 也生效）；违规则回滚并 400
    try:
        warnings = _raise_if_hard(db, slot.wave, slot.squad_index)
    except HTTPException:
        db.rollback()
        raise
    slot.version += 1
    slot.updated_by = user.id
    slot.updated_at = _now()
    db.commit()
    db.refresh(slot)
    await manager.broadcast(rid, {"type": "slot:filled", "slot": _slot_out(slot).model_dump()})
    return FillResponse(slot=_slot_out(slot), warnings=warnings)

@router.delete("/{rid}/slots/{slot_id}", response_model=SlotMutationResult)
async def remove_slot(rid: int, slot_id: int, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    slot = db.get(Slot, slot_id)
    if slot is None or slot.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if slot.character_id is None:
        raise HTTPException(400, "该格为空")
    if not user.is_admin:
        if raid.locked:
            raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
        if slot.updated_by != user.id:
            raise HTTPException(403, "只能操作自己的格子")
    slot.character_id = None
    slot.duty = None
    slot.version += 1
    slot.updated_by = None
    slot.updated_at = None
    db.commit()
    db.refresh(slot)
    await manager.broadcast(rid, {"type": "slot:removed", "slot_id": slot_id})
    return SlotMutationResult(slot=_slot_out(slot), warnings=[])

@router.put("/{rid}/slots/{slot_id}/duty", response_model=SlotMutationResult)
async def change_duty(rid: int, slot_id: int, body: DutyIn,
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    slot = db.get(Slot, slot_id)
    if slot is None or slot.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if slot.character_id is None:
        raise HTTPException(400, "该格为空")
    if not user.is_admin:
        if raid.locked:
            raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
        if slot.updated_by != user.id:
            raise HTTPException(403, "只能操作自己的格子")
    char = db.get(Character, slot.character_id)
    if not duty_valid_for_class(body.duty, char.class_type):
        raise HTTPException(400, "职责与职业不匹配")
    slot.duty = body.duty
    # 先校验再 commit：主奶超限 / 满员组成规则 → 400 并回滚
    try:
        warnings = _raise_if_hard(db, slot.wave, slot.squad_index)
    except HTTPException:
        db.rollback()
        raise
    slot.version += 1
    slot.updated_at = _now()
    db.commit()
    db.refresh(slot)
    await manager.broadcast(rid, {"type": "slot:duty_changed",
                                  "slot": _slot_out(slot).model_dump()})
    return SlotMutationResult(slot=_slot_out(slot), warnings=warnings)
```

> 说明：硬校验（主奶超限 + 满员组成规则）在 `_raise_if_hard` 中于 **commit 之前**执行并读取 session 内存态，违规即 `db.rollback()` + 400；未满员时的组成问题作为 warnings 返回。`remove_slot` 只清空格子不会破坏组成规则，无需硬校验。

- [ ] **Step 7: 注册路由到 main.py**

修改 `backend/app/main.py`：`from .routers import auth, members` 改为 `from .routers import auth, members, raids`，并在 `app.include_router(members.router)` 之后、**静态挂载之前**插入 `app.include_router(raids.router)`（与其它 include_router 形成连续块，不要追加到文件末尾挂载之后）。

- [ ] **Step 8: 运行测试确认通过**

Run: `cd backend && pytest tests/test_raid_validator.py tests/test_raids.py tests/test_members.py -v`
Expected: PASS（含从 Task 3 移入的 `test_delete_character_in_use_blocked`）

- [ ] **Step 9: Commit**

```bash
git add backend/app/ws.py backend/app/services backend/app/routers/raids.py backend/app/main.py backend/tests/test_raid_validator.py backend/tests/test_raids.py
git commit -m "feat: raids, waves, slots with validation rules"
```

---

## Task 5: 公共 API（机器人）

**Files:**
- Create: `backend/app/routers/public.py`
- Test: `backend/tests/test_public.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_public.py`：

```python
from .helpers import register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def test_public_requires_token(client):
    assert client.get("/api/public/raids").status_code == 401
    assert client.get("/api/public/raids", headers={"Authorization": "Bearer wrong"}).status_code == 401

def test_public_list_and_wave(client):
    ah = _admin(client)
    rid = client.post("/api/raids", headers=ah, json={"name": "巴卡尔", "size": 12}).json()["id"]
    # 填一个角色
    h, _ = register_user(client, "p1", "甲")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 1}).json()["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h, json={"character_id": cid})

    auth = {"Authorization": "Bearer change-me-bot-token"}
    r = client.get("/api/public/raids", headers=auth)
    assert r.status_code == 200
    assert r.json()[0]["name"] == "巴卡尔"
    r = client.get(f"/api/public/raids/{rid}/waves/1", headers=auth)
    assert r.status_code == 200
    filled = [s for s in r.json()["slots"] if s["character_name"]]
    assert filled[0]["owner_nickname"] == "甲"
    assert filled[0]["character_name"] == "剑魂"
```

> 注：`api_token` 默认值是 `"change-me-bot-token"`（config 中设置），测试直接使用该值。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && pytest tests/test_public.py -v`
Expected: FAIL（404）

- [ ] **Step 3: 实现**

`backend/app/routers/public.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_api_token
from ..db import get_db
from ..models import Raid, Wave
from ..schemas import RaidListItem
from ..routers.raids import _detail

router = APIRouter(prefix="/api/public", tags=["public"],
                   dependencies=[Depends(require_api_token)])

@router.get("/raids", response_model=list[RaidListItem])
def public_raids(db: Session = Depends(get_db)):
    return [RaidListItem(id=r.id, name=r.name, dungeon=r.dungeon, size=r.size,
                         locked=r.locked, wave_count=len(r.waves))
            for r in db.query(Raid).order_by(Raid.created_at.desc()).all()]

@router.get("/raids/{rid}/waves/{index}")
def public_wave(rid: int, index: int, db: Session = Depends(get_db)):
    raid = db.get(Raid, rid)
    if raid is None:
        raise HTTPException(404, "攻坚不存在")
    wave = db.query(Wave).filter(Wave.raid_id == rid, Wave.index == index).first()
    if wave is None:
        raise HTTPException(404, "波次不存在")
    detail = _detail(db, raid)
    for w in detail.waves:
        if w.index == index:
            return w
    raise HTTPException(404, "波次不存在")
```

- [ ] **Step 4: 注册路由到 main.py**

修改 `backend/app/main.py`：`from .routers import auth, members, raids` 改为 `from .routers import auth, members, public, raids`，并在 `app.include_router(raids.router)` 之后、**静态挂载之前**插入 `app.include_router(public.router)`（与其它 include_router 形成连续块，不要追加到文件末尾挂载之后）。

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && pytest tests/test_public.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/public.py backend/app/main.py backend/tests/test_public.py
git commit -m "feat: public bot API with token auth"
```

---

## Task 6: WebSocket 实时同步

**Files:**
- Create: `backend/app/ws.py`
- Test: `backend/tests/test_ws.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_ws.py`：

```python
import json

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return r.json()["token"]

def test_ws_receives_slot_events(client):
    from fastapi.testclient import TestClient
    token = _admin(client)
    ah = {"Authorization": f"Bearer {token}"}
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]

    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        # 管理员锁定时会产生 raid:locked 事件
        client.post(f"/api/raids/{rid}/lock", headers=ah)
        data = ws.receive_json()
        assert data["type"] == "raid:locked"

def test_ws_rejects_bad_token(client):
    from starlette.websockets import WebSocketDisconnect
    import pytest
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/raids/1?token=bad"):
            pass
    assert exc_info.value.code == 4401
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && pytest tests/test_ws.py -v`
Expected: FAIL（WS 端点不存在）

- [ ] **Step 3: 实现（扩展 Task 4 创建的 ws.py）**

> `backend/app/ws.py` 在 Task 4 已含 `ConnectionManager` + `manager`。本 Task 将顶部的占位 `router = None` 替换为真正的 `APIRouter` 与 WS 端点，并补齐 imports。文件最终形态：

`backend/app/ws.py`（最终版，Task 4 基础上增补）：

```python
import asyncio
from collections import defaultdict

import jwt
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Raid, User

router = APIRouter()

class ConnectionManager:
    """每个攻坚一个房间，向房间内所有 WS 广播事件。

    生产环境单 uvicorn 单事件循环，广播即直接 await；
    TestClient 下 HTTP 与 WS 跑在不同事件循环，故记录每个 ws 所属 loop，
    用 run_coroutine_threadsafe 跨 loop 发送，保证可测试。
    """
    def __init__(self) -> None:
        self.rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self._loops: dict[WebSocket, asyncio.AbstractEventLoop] = {}

    async def connect(self, raid_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms[raid_id].add(ws)
        self._loops[ws] = asyncio.get_running_loop()

    async def disconnect(self, raid_id: int, ws: WebSocket) -> None:
        self.rooms.get(raid_id, set()).discard(ws)
        self._loops.pop(ws, None)

    async def broadcast(self, raid_id: int, event: dict) -> None:
        stale = []
        current_loop = asyncio.get_running_loop()
        for ws in list(self.rooms.get(raid_id, set())):
            try:
                loop = self._loops.get(ws)
                if loop is None or loop is current_loop:
                    await ws.send_json(event)
                else:
                    future = asyncio.run_coroutine_threadsafe(ws.send_json(event), loop)
                    await asyncio.wrap_future(future)
            except Exception:
                stale.append(ws)
        for ws in stale:
            await self.disconnect(raid_id, ws)

manager = ConnectionManager()

def _auth_ws(ws: WebSocket, db: Session) -> User | None:
    token = ws.query_params.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return db.get(User, int(payload["sub"]))

@router.websocket("/ws/raids/{raid_id}")
async def ws_endpoint(ws: WebSocket, raid_id: int, db: Session = Depends(get_db)):
    user = _auth_ws(ws, db)
    if user is None:
        await ws.close(code=4401)
        return
    if db.get(Raid, raid_id) is None:
        await ws.close(code=4404)
        return
    await manager.connect(raid_id, ws)
    try:
        while True:
            await ws.receive_text()  # 仅维持连接，客户端不发消息
    except WebSocketDisconnect:
        await manager.disconnect(raid_id, ws)
    except Exception:
        await manager.disconnect(raid_id, ws)
```

> 说明：WS 端点通过 `Depends(get_db)` 取 session，与 REST 一致，因此测试中 `get_db` 的覆盖对 WS 同样生效。
>
> `test_ws_rejects_bad_token` 断言 close 码 4401：若你安装的 Starlette 版本对「accept 前 close」返回 HTTP 403 而非 WS close，可改为先 `await ws.accept()` 再 `await ws.close(code=4401)`，并相应调整测试为 `receive_text()` 抛 `WebSocketDisconnect(4401)`。以实测为准。

- [ ] **Step 4: 注册路由到 main.py**

修改 `backend/app/main.py`：`from .routers import auth, members, public, raids` 后追加 `from .ws import router as ws_router`，并在 `app.include_router(public.router)` 之后、**静态挂载 `app.mount("/", StaticFiles(...))` 之前**加 `app.include_router(ws_router)`。

> **关键**：`app.mount("/", ...)` 是兜底路由，会遮蔽其后注册的一切路由。WS 端点必须排在静态挂载**之前**注册，否则生产环境（静态目录存在时）WS 握手会被吞掉。所有 REST 路由已排在挂载之前，ws_router 也须如此。

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && pytest tests/test_ws.py -v`
Expected: PASS

- [ ] **Step 6: 全量后端测试回归**

Run: `cd backend && pytest -v`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/ws.py backend/app/main.py backend/tests/test_ws.py
git commit -m "feat: websocket raid channels with auth"
```

---

## Task 7: 前端脚手架 + 认证页

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.ts`, `frontend/src/App.vue`, `frontend/src/types.ts`, `frontend/src/api/client.ts`, `frontend/src/stores/auth.ts`, `frontend/src/router/index.ts`, `frontend/src/views/LoginView.vue`, `frontend/src/views/RegisterView.vue`

- [ ] **Step 1: 工程文件**

`frontend/package.json`:

```json
{
  "name": "dnfer-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "vue": "^3.4",
    "vue-router": "^4.4",
    "pinia": "^2.2"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0",
    "typescript": "^5.5",
    "vite": "^5.4",
    "vue-tsc": "^2.1",
    "vitest": "^2.1",
    "@vue/test-utils": "^2.4",
    "jsdom": "^25.0"
  }
}
```

`frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
```

`frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

> 说明：`noEmit: true` 必要——否则 `vue-tsc -b` 会把编译产物 `.js` 写进 `src/`，而 vite 解析时 `.js` 优先于 `.ts`，会遮蔽真实源码。

`frontend/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DNfer 攻坚排表</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 类型与 API 客户端**

`frontend/src/types.ts`:

```ts
export type ClassType = '输出' | '辅助'
export type Duty = '主C' | '辅C' | '主奶' | '太阳奶' | '划水'

export interface User { id: number; username: string; nickname: string; is_admin: boolean }
export interface Character { id: number; name: string; class_type: ClassType; fame: number;
  simulated_damage: number | null; sustained_dps: number | null; buff_amount: number | null }
export interface Slot { id: number; squad_index: number; row_index: number;
  character_id: number | null; character_name: string | null; character_class: ClassType | null;
  fame: number | null; simulated_damage: number | null; sustained_dps: number | null;
  buff_amount: number | null; owner_id: number | null; owner_nickname: string | null;
  duty: Duty | null; version: number }
export interface Wave { id: number; index: number; slots: Slot[] }
export interface Raid { id: number; name: string; dungeon: string; size: number; locked: boolean; waves: Wave[] }
export interface RaidListItem { id: number; name: string; dungeon: string; size: number; locked: boolean; wave_count: number }
export interface CodeItem { id: number; code: string; used_by: number | null; used_at: string | null;
  expires_at: string | null; single_use: boolean }
```

`frontend/src/api/client.ts`:

```ts
const TOKEN_KEY = 'dnfer_token'

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  // 登录接口的 401 表示「账号或密码错误」，不应触发全局跳转（否则页面刷新丢失错误提示）
  if (res.status === 401 && !url.includes('/auth/')) {
    clearToken(); window.location.href = '/login'; throw new ApiError(401, '未登录')
  }
  if (!res.ok) {
    let msg = '请求失败'
    try {
      const detail = (await res.json()).detail
      msg = typeof detail === 'string' ? detail : '请求参数有误'
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}
```

- [ ] **Step 3: 认证 store 与路由**

`frontend/src/stores/auth.ts`:

```ts
import { defineStore } from 'pinia'
import { api } from '../api/client'
import { clearToken, getToken, setToken } from '../api/client'
import type { User } from '../types'

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null as User | null, loaded: false }),
  getters: { isAdmin: (s) => s.user?.is_admin ?? false },
  actions: {
    async login(username: string, password: string) {
      const r = await api.post<{ token: string; user: User }>('/api/auth/login', { username, password })
      setToken(r.token); this.user = r.user; this.loaded = true
    },
    async register(body: { username: string; password: string; nickname: string; code: string }) {
      const r = await api.post<{ token: string; user: User }>('/api/auth/register', body)
      setToken(r.token); this.user = r.user; this.loaded = true
    },
    async load() {
      if (!getToken()) { this.loaded = true; return }
      try { this.user = await api.get<User>('/api/auth/me') } catch { clearToken(); this.user = null }
      this.loaded = true
    },
    logout() { clearToken(); this.user = null; window.location.href = '/login' },
  },
})
```

`frontend/src/router/index.ts`:

```ts
import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api/client'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/LoginView.vue') },
    { path: '/register', component: () => import('../views/RegisterView.vue') },
    { path: '/', component: () => import('../views/RaidListView.vue') },
    { path: '/raids/:id', component: () => import('../views/RaidDetailView.vue') },
    { path: '/characters', component: () => import('../views/MyCharactersView.vue') },
    { path: '/admin', component: () => import('../views/AdminView.vue') },
  ],
})

router.beforeEach(async (to) => {
  if (to.path === '/login' || to.path === '/register') return true
  if (!getToken()) return '/login'
  const auth = useAuthStore()
  if (!auth.loaded) await auth.load()
  if (!auth.user) return '/login'
  return true
})

export default router
```

- [ ] **Step 4: 登录/注册页**

`frontend/src/views/LoginView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true; error.value = ''
  try { await auth.login(username.value, password.value); router.push('/') }
  catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div style="max-width:320px;margin:80px auto">
    <h2>登录</h2>
    <form @submit.prevent="submit">
      <div style="margin:8px 0"><input v-model="username" placeholder="用户名" /></div>
      <div style="margin:8px 0"><input v-model="password" type="password" placeholder="密码" /></div>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="loading">{{ loading ? '登录中…' : '登录' }}</button>
    </form>
    <p style="margin-top:12px">还没有账号？<router-link to="/register">凭注册码注册</router-link></p>
  </div>
</template>
```

`frontend/src/views/RegisterView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const nickname = ref('')
const code = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true; error.value = ''
  try {
    await auth.register({ username: username.value, password: password.value,
                          nickname: nickname.value, code: code.value })
    router.push('/')
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div style="max-width:320px;margin:80px auto">
    <h2>注册</h2>
    <form @submit.prevent="submit">
      <div style="margin:8px 0"><input v-model="username" placeholder="用户名（登录用）" /></div>
      <div style="margin:8px 0"><input v-model="password" type="password" placeholder="密码（≥6位）" /></div>
      <div style="margin:8px 0"><input v-model="nickname" placeholder="群昵称" /></div>
      <div style="margin:8px 0"><input v-model="code" placeholder="注册码" /></div>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="loading">{{ loading ? '注册中…' : '注册' }}</button>
    </form>
    <p style="margin-top:12px">已有账号？<router-link to="/login">登录</router-link></p>
  </div>
</template>
```

`frontend/src/main.ts`:

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).mount('#app')
```

`frontend/src/App.vue`:

```vue
<script setup lang="ts">
import { useAuthStore } from './stores/auth'
const auth = useAuthStore()
</script>

<template>
  <nav v-if="auth.user" style="display:flex;gap:16px;padding:12px;border-bottom:1px solid #eee">
    <router-link to="/">攻坚列表</router-link>
    <router-link to="/characters">我的角色</router-link>
    <router-link v-if="auth.isAdmin" to="/admin">管理</router-link>
    <span style="margin-left:auto">{{ auth.user.nickname }}</span>
    <a href="#" @click.prevent="auth.logout">退出</a>
  </nav>
  <router-view />
</template>
```

- [ ] **Step 5: 启动与冒烟**

Run: `cd frontend && npm install && npm run dev`
Expected: 打开 http://localhost:5173 → 跳转 /login；用 admin/admin123 登录成功并跳转 `/`。

> 说明：`/`（攻坚列表）、`/raids/:id`、`/characters`、`/admin` 视图要到 Task 8~11 才实现；本 Task 结束时访问 `/` 会因动态 import 失败而报错，属预期，仅验证「登录→拿到 token→路由跳转」链路即可。

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat: frontend scaffold, auth pages, routing"
```

---

## Task 8: 攻坚列表页 + 创建攻坚

**Files:**
- Create: `frontend/src/views/RaidListView.vue`

- [ ] **Step 1: 攻坚列表视图**

`frontend/src/views/RaidListView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import type { RaidListItem } from '../types'

const auth = useAuthStore()
const raids = ref<RaidListItem[]>([])
const showCreate = ref(false)
const name = ref('')
const dungeon = ref('')
const size = ref(12)

async function load() { raids.value = await api.get<RaidListItem[]>('/api/raids') }
onMounted(load)

async function create() {
  await api.post('/api/raids', { name: name.value, dungeon: dungeon.value, size: size.value })
  showCreate.value = false; name.value = ''; dungeon.value = ''
  await load()
}
</script>

<template>
  <div style="max-width:800px;margin:24px auto">
    <div style="display:flex;align-items:center;gap:12px">
      <h2>攻坚列表</h2>
      <button v-if="auth.isAdmin" @click="showCreate = !showCreate">＋ 发起攻坚</button>
    </div>

    <div v-if="showCreate" style="border:1px solid #ddd;padding:16px;margin:12px 0">
      <input v-model="name" placeholder="攻坚名称" style="margin-right:8px" />
      <input v-model="dungeon" placeholder="副本（可选）" style="margin-right:8px" />
      <select v-model.number="size">
        <option v-for="s in [4,8,12,16,20]" :key="s" :value="s">{{ s }} 人</option>
      </select>
      <button @click="create">创建</button>
    </div>

    <div v-for="r in raids" :key="r.id" style="border:1px solid #eee;padding:12px;margin:8px 0;
         display:flex;align-items:center;gap:12px">
      <router-link :to="`/raids/${r.id}`" style="font-weight:bold">{{ r.name }}</router-link>
      <span v-if="r.dungeon" style="color:#666">{{ r.dungeon }}</span>
      <span style="color:#999">{{ r.size }} 人 · {{ r.wave_count }} 波</span>
      <span :style="{color: r.locked ? '#c62828' : '#2e7d32'}">{{ r.locked ? '已锁定' : '未锁定' }}</span>
    </div>
    <p v-if="!raids.length" style="color:#999">还没有攻坚，管理员可点击「＋ 发起攻坚」</p>
  </div>
</template>
```

- [ ] **Step 2: 运行验证**

Run: `cd frontend && npm run dev` → 登录 admin → 创建「测试攻坚 12 人」→ 列表出现。
Expected: 创建成功显示一行。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/RaidListView.vue
git commit -m "feat: raid list and create raid"
```

---

## Task 9: 攻坚排表页（网格 + 波次 + 交互 + WS 同步）

**Files:**
- Create: `frontend/src/api/ws.ts`, `frontend/src/stores/raid.ts`, `frontend/src/views/RaidDetailView.vue`, `frontend/src/lib/duty.ts`, `frontend/src/lib/colors.ts`, `frontend/src/components/SlotCell.vue`, `frontend/src/components/WaveSection.vue`, `frontend/src/components/CharacterPickerModal.vue`, `frontend/src/components/DutySelect.vue`
- Test: `frontend/src/stores/raid.spec.ts`

- [ ] **Step 1: 排表 store（先写测试）**

`frontend/src/stores/raid.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRaidStore, applyEvent } from './raid'
import type { Raid } from '../types'

function makeRaid(): Raid {
  return {
    id: 1, name: 'x', dungeon: '', size: 12, locked: false,
    waves: [{ id: 1, index: 1, slots: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, squad_index: Math.floor(i / 4), row_index: i % 4,
      character_id: null, character_name: null, character_class: null, fame: null,
      simulated_damage: null, sustained_dps: null, buff_amount: null,
      owner_id: null, owner_nickname: null, duty: null, version: 0 })) }],
  }
}

describe('raid store', () => {
  it('applies slot:filled event by id', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    applyEvent(store, { type: 'slot:filled', slot: {
      id: 1, squad_index: 0, row_index: 0, character_id: 9, character_name: '剑魂',
      character_class: '输出', fame: 1, simulated_damage: 2, sustained_dps: 3, buff_amount: null,
      owner_id: 9, owner_nickname: '甲', duty: '主C', version: 1 } })
    expect(store.raid!.waves[0].slots[0].character_name).toBe('剑魂')
  })

  it('applies wave:added', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    // wave:added 仅带 index，客户端拉快照刷新（简单策略）
    applyEvent(store, { type: 'wave:added', index: 2 })
    // 简单策略：置 needRefresh 标志
    expect(store.needRefresh).toBe(true)
  })

  it('replaces slot on version conflict by applying server payload', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    applyEvent(store, { type: 'slot:removed', slot_id: 1 })
    expect(store.raid!.waves[0].slots[0].character_id).toBeNull()
  })
})
```

`frontend/src/stores/raid.ts`：

```ts
import { defineStore } from 'pinia'
import { api } from '../api/client'
import type { Raid, Slot } from '../types'

export type WsEvent =
  | { type: 'slot:filled'; slot: Slot }
  | { type: 'slot:removed'; slot_id: number }
  | { type: 'slot:duty_changed'; slot: Slot }
  | { type: 'wave:added'; index: number }
  | { type: 'wave:removed'; index: number }
  | { type: 'raid:locked' }
  | { type: 'raid:unlocked' }

export const useRaidStore = defineStore('raid', {
  state: () => ({ raid: null as Raid | null, needRefresh: false }),
  actions: {
    async load(id: number) {
      this.raid = await api.get<Raid>(`/api/raids/${id}`)
      this.needRefresh = false
    },
    patch(p: Partial<Raid>) { if (this.raid) Object.assign(this.raid, p) },
  },
})

function findSlot(raid: Raid, slotId: number): Slot | undefined {
  for (const w of raid.waves) { const s = w.slots.find(s => s.id === slotId); if (s) return s }
  return undefined
}

export function applyEvent(store: ReturnType<typeof useRaidStore>, ev: WsEvent) {
  const raid = store.raid
  if (!raid) return
  switch (ev.type) {
    case 'slot:filled':
    case 'slot:duty_changed': {
      const slot = findSlot(raid, ev.slot.id)
      if (slot && slot.version <= ev.slot.version) Object.assign(slot, ev.slot)
      break
    }
    case 'slot:removed': {
      const slot = findSlot(raid, ev.slot_id)
      if (slot) { slot.character_id = null; slot.character_name = null; slot.character_class = null;
        slot.fame = null; slot.simulated_damage = null; slot.sustained_dps = null; slot.buff_amount = null;
        slot.owner_id = null; slot.owner_nickname = null; slot.duty = null }
      break
    }
    case 'raid:locked': raid.locked = true; break
    case 'raid:unlocked': raid.locked = false; break
    case 'wave:added':
    case 'wave:removed':
      store.needRefresh = true; break
  }
}
```

- [ ] **Step 2: WS 客户端**

`frontend/src/api/ws.ts`：

```ts
import { getToken } from './client'
import type { WsEvent } from '../stores/raid'

export interface RaidWsCallbacks {
  onEvent: (ev: WsEvent) => void
  onRefresh: () => void   // wave 增删 → 全量刷新
  onReconnect: () => void // 断线重连成功 → 重新拉快照兜底
}

export function connectRaidWs(raidId: number, cb: RaidWsCallbacks): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let timer: number | undefined
  let reconnected = false

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws/raids/${raidId}?token=${getToken()}`)
    ws.onmessage = (m) => {
      const ev = JSON.parse(m.data)
      if (ev.type === 'wave:added' || ev.type === 'wave:removed') cb.onRefresh()
      else cb.onEvent(ev)
    }
    ws.onopen = () => { if (reconnected) cb.onReconnect() }
    ws.onclose = () => {
      if (closed) return
      reconnected = true
      timer = window.setTimeout(connect, 2000)  // 自动重连
    }
  }
  connect()
  return () => { closed = true; if (timer) clearTimeout(timer); ws?.close() }
}
```

- [ ] **Step 3: 组件**

`frontend/src/components/DutySelect.vue`：

```vue
<script setup lang="ts">
import { dutyOptions } from '../lib/duty'
import type { ClassType, Duty } from '../types'
const props = defineProps<{ classType: ClassType; modelValue: Duty | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Duty): void }>()
const options = dutyOptions(props.classType)
</script>
<template>
  <select :value="modelValue ?? ''" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as Duty)">
    <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
  </select>
</template>
```

`frontend/src/lib/duty.ts`：

```ts
import type { ClassType, Duty } from '../types'
const DUTY_BY_CLASS: Record<ClassType, Duty[]> = {
  '输出': ['主C', '辅C', '划水'],
  '辅助': ['主奶', '太阳奶', '划水'],
}
export function dutyOptions(c: ClassType): Duty[] { return DUTY_BY_CLASS[c] }
export function defaultDuty(c: ClassType): Duty { return c === '输出' ? '主C' : '主奶' }
```

`frontend/src/components/SlotCell.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Slot } from '../types'
import DutySelect from './DutySelect.vue'

const props = defineProps<{
  slot: Slot
  color: string
  editable: boolean      // 是管理员或自己占的格
  pickable: boolean      // 空格且可占
}>()
const emit = defineEmits<{
  (e: 'pick', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'remove', slot: Slot): void
}>()

const bg = computed(() => props.color)
const occupied = computed(() => props.slot.character_id != null)
const attrs = computed(() => {
  const s = props.slot
  if (s.character_class === '输出') return `模拟 ${fmt(s.simulated_damage)} · 秒伤 ${fmt(s.sustained_dps)}`
  if (s.character_class === '辅助') return `增益 ${fmt(s.buff_amount)}`
  return ''
})
function fmt(n: number | null): string { return n ? String(Math.round(n / 10000)) + 'w' : '-' }
</script>

<template>
  <td :style="{ background: bg, border: '1px solid #ddd', padding: '8px', height: '60px',
                verticalAlign: 'middle', textAlign: occupied ? 'left' : 'center' }">
    <template v-if="occupied">
      <div style="color:#333">
        <b>{{ slot.owner_nickname }}</b>
        <span style="color:#777;font-size:12px">（{{ slot.character_name }}）</span>
        <DutySelect v-if="editable" :class-type="slot.character_class!"
                    :model-value="slot.duty" @update:model-value="(d) => emit('duty', slot, d)" />
        <span v-else style="background:#eee;border-radius:3px;padding:1px 5px;font-size:11px">{{ slot.duty }}</span>
      </div>
      <div style="color:#666;font-size:12px;margin-top:2px">
        {{ attrs }}
        <a v-if="editable" href="#" style="margin-left:8px;color:#c62828"
           @click.prevent="emit('remove', slot)">撤下</a>
      </div>
    </template>
    <button v-else-if="pickable" style="border:none;background:transparent;color:#888;cursor:pointer"
            @click="emit('pick', slot)">＋ 点击占位</button>
    <span v-else style="color:#ddd">—</span>
  </td>
</template>
```

`frontend/src/components/WaveSection.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Wave } from '../types'
import SlotCell from './SlotCell.vue'
import { SQUAD_COLORS, SQUAD_LIGHT, SQUAD_NAMES } from '../lib/colors'

const props = defineProps<{
  wave: Wave
  editable: boolean
  isAdmin: boolean
  canDelete: boolean
  currentUserId: number | null
}>()
const emit = defineEmits<{
  (e: 'pick', slot: any): void
  (e: 'duty', slot: any, duty: string): void
  (e: 'remove', slot: any): void
  (e: 'deleteWave', index: number): void
}>()

const squads = computed(() => {
  const n = Math.max(...props.wave.slots.map(s => s.squad_index)) + 1
  return Array.from({ length: n }, (_, sq) => props.wave.slots.filter(s => s.squad_index === sq))
})
const counts = computed(() =>
  squads.value.map(group => ({ filled: group.filter(s => s.character_id != null).length, total: group.length })))
</script>

<template>
  <div style="margin:24px 0">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <b>第 {{ wave.index }} 波</b>
      <span style="color:#888;font-size:12px">
        {{ squads.map((g, i) => `${SQUAD_NAMES[i]} ${counts[i].filled}/${counts[i].total}`).join(' · ') }}
      </span>
      <a v-if="canDelete" href="#" style="color:#c62828;font-size:12px"
         @click.prevent="emit('deleteWave', wave.index)">删除本波</a>
    </div>
    <table style="border-collapse:collapse;width:100%;min-width:600px">
      <thead>
        <tr>
          <th v-for="(g, i) in squads" :key="i"
              :style="{ background: SQUAD_COLORS[i], color: '#fff', padding: '8px', border: '1px solid #ddd' }">
            {{ SQUAD_NAMES[i] }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in 4" :key="row">
          <SlotCell v-for="(g, i) in squads" :key="g[0].id"
                    :slot="g[row - 1]" :color="SQUAD_LIGHT[i]"
                    :editable="editable && (isAdmin || g[row-1].owner_id === currentUserId)"
                    :pickable="editable && g[row-1].character_id == null"
                    @pick="emit('pick', $event)" @duty="(s, d) => emit('duty', s, d)"
                    @remove="emit('remove', $event)" />
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

`frontend/src/lib/colors.ts`：

```ts
export const SQUAD_COLORS = ['#ef5350', '#fbc02d', '#43a047', '#1e88e5', '#8e24aa']
export const SQUAD_LIGHT = ['#fdecea', '#fef9e7', '#eaf6ec', '#e3f2fd', '#f3e5f5']
export const SQUAD_NAMES = ['红队', '黄队', '绿队', '蓝队', '紫队']
```

- [ ] **Step 4: 排表页视图 + 角色选择弹窗**

`frontend/src/components/CharacterPickerModal.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '../api/client'
import { defaultDuty, dutyOptions } from '../lib/duty'
import type { Character, Duty } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', c: Character, duty: Duty): void }>()
const characters = ref<Character[]>([])
const selected = ref<Character | null>(null)
const duty = ref<Duty>('主C')
onMounted(async () => { characters.value = await api.get<Character[]>('/api/me/characters') })

function choose(c: Character) {
  selected.value = c
  duty.value = defaultDuty(c.class_type)
}
function confirm() { if (selected.value) emit('select', selected.value, duty.value) }
const options = computed(() => selected.value ? dutyOptions(selected.value.class_type) : [])
</script>

<template>
  <div v-if="open" style="position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"
       @click.self="emit('close')">
    <div style="background:#fff;border-radius:8px;padding:20px;min-width:360px">
      <h3>选择角色</h3>
      <div v-for="c in characters" :key="c.id"
           style="border:1px solid #eee;padding:10px;margin:6px 0;cursor:pointer"
           :style="selected?.id === c.id ? 'outline:2px solid #1976d2' : ''"
           @click="choose(c)">
        <b>{{ c.name }}</b>
        <span style="color:#666;font-size:12px">{{ c.class_type }} · 名望 {{ c.fame }}</span>
        <div style="color:#999;font-size:12px">
          {{ c.class_type === '输出' ? `模拟 ${c.simulated_damage} · 秒伤 ${c.sustained_dps}` : `增益 ${c.buff_amount}` }}
        </div>
      </div>
      <p v-if="!characters.length" style="color:#999">还没有角色，去「我的角色」添加</p>
      <div v-if="selected" style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <span>职责：</span>
        <select v-model="duty">
          <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
        </select>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button @click="emit('close')">关闭</button>
        <button v-if="selected" @click="confirm">确定</button>
      </div>
    </div>
  </div>
</template>
```

`frontend/src/views/RaidDetailView.vue`：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useRaidStore, applyEvent } from '../stores/raid'
import { connectRaidWs } from '../api/ws'
import WaveSection from '../components/WaveSection.vue'
import CharacterPickerModal from '../components/CharacterPickerModal.vue'
import type { Character, Duty, Slot } from '../types'

const route = useRoute()
const auth = useAuthStore()
const store = useRaidStore()
const rid = Number(route.params.id)

const pickSlot = ref<Slot | null>(null)
const notice = ref('')
let disconnect: (() => void) | null = null

const editable = computed(() => !store.raid?.locked || auth.isAdmin)

async function load() { await store.load(rid) }

onMounted(() => {
  // 先建 WS 订阅，再拉快照（快照为最终一致性基准）；断线重连后再拉一次
  disconnect = connectRaidWs(rid, {
    onEvent: (ev) => applyEvent(store, ev),       // slot/锁定事件增量合并
    onRefresh: async () => { await load() },      // wave 增删触发全量刷新
    onReconnect: async () => { await load() },    // 重连后快照兜底
  })
  void load()
})
onBeforeUnmount(() => disconnect?.())

async function onPick(slot: Slot) { pickSlot.value = slot }
async function onSelectCharacter(c: Character, duty: Duty) {
  if (!pickSlot.value) return
  try {
    const r = await api.post<{ slot: Slot; warnings: string[] }>(
      `/api/raids/${rid}/slots/${pickSlot.value.id}/fill`, { character_id: c.id, duty })
    notice.value = r.warnings.length ? r.warnings.join('；') : ''
    setTimeout(() => (notice.value = ''), 5000)
  } catch (e: any) { alert(e.message) }
  pickSlot.value = null
  await load()
}
async function onDuty(slot: Slot, duty: string) {
  try { await api.put(`/api/raids/${rid}/slots/${slot.id}/duty`, { duty }) }
  catch (e: any) { alert(e.message); await load() }
}
async function onRemove(slot: Slot) {
  try { await api.del(`/api/raids/${rid}/slots/${slot.id}`) }
  catch (e: any) { alert(e.message) }
  await load()
}
async function onAddWave() {
  try { await api.post(`/api/raids/${rid}/waves`) } catch (e: any) { alert(e.message) }
  await load()
}
async function onToggleLock() {
  const act = store.raid?.locked ? 'unlock' : 'lock'
  try { await api.post(`/api/raids/${rid}/${act}`) } catch (e: any) { alert(e.message) }
  await load()
}
async function onDeleteWave(index: number) {
  if (!confirm(`确认删除第 ${index} 波？`)) return
  try { await api.del(`/api/raids/${rid}/waves/${index}`) } catch (e: any) { alert(e.message) }
  await load()
}
</script>

<template>
  <div v-if="store.raid" style="max-width:900px;margin:24px auto">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <h2 style="margin:0">{{ store.raid.name }}</h2>
      <span v-if="store.raid.dungeon" style="color:#666">{{ store.raid.dungeon }}</span>
      <span style="color:#999">{{ store.raid.size }} 人</span>
      <span :style="{color: store.raid.locked ? '#c62828' : '#2e7d32'}">
        {{ store.raid.locked ? '已锁定' : '未锁定' }}
      </span>
      <span style="margin-left:auto;display:flex;gap:8px">
        <button v-if="auth.isAdmin" @click="onToggleLock">{{ store.raid.locked ? '解锁' : '锁定' }}</button>
        <button v-if="editable" @click="onAddWave">＋ 添加一波</button>
      </span>
    </div>

    <p v-if="notice" style="color:#e65100;background:#fff3e0;padding:8px;border-radius:4px">{{ notice }}</p>

    <WaveSection v-for="w in store.raid.waves" :key="w.id"
                 :wave="w" :editable="editable" :is-admin="auth.isAdmin"
                 :can-delete="auth.isAdmin || (store.raid.waves.length > 1)"
                 :current-user-id="auth.user?.id ?? null"
                 @pick="onPick" @duty="onDuty" @remove="onRemove"
                 @delete-wave="onDeleteWave" />

    <CharacterPickerModal :open="pickSlot != null" @close="pickSlot = null"
                          @select="onSelectCharacter" />
  </div>
</template>
```

> 说明：排表页使用「事件驱动 + 变更后拉取最新快照」的稳妥策略——WS 事件用于即时刷新展示，`wave:added/removed` 触发全量刷新；填写/撤下/职责变更在本地成功后也重新拉快照保证一致。后续可优化为纯增量合并（store 已支持）。

- [ ] **Step 5: 前端测试**

`frontend/src/stores/raid.spec.ts` 已在上文 Step 1 提供。运行：

Run: `cd frontend && npm run test`
Expected: PASS

- [ ] **Step 6: 手动验证**

Run: `cd backend && uvicorn app.main:app --port 8000`（另一终端） + `cd frontend && npm run dev`
Expected: 两个浏览器窗口登录不同账号同时打开排表页，一方占位另一方实时看到。

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: raid detail grid with realtime sync"
```

---

## Task 10: 我的角色管理页

**Files:**
- Create: `frontend/src/views/MyCharactersView.vue`

- [ ] **Step 1: 实现角色 CRUD 页面**

`frontend/src/views/MyCharactersView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { api } from '../api/client'
import type { Character, ClassType } from '../types'

const list = ref<Character[]>([])
const showForm = ref(false)
const editing = ref<Character | null>(null)
const form = ref({ name: '', class_type: '输出' as ClassType, fame: 0,
  simulated_damage: null as number | null, sustained_dps: null as number | null,
  buff_amount: null as number | null })

async function load() { list.value = await api.get<Character[]>('/api/me/characters') }
onMounted(load)

function startCreate() { editing.value = null; showForm.value = true; form.value = { name: '', class_type: '输出', fame: 0,
  simulated_damage: null, sustained_dps: null, buff_amount: null } }
function startEdit(c: Character) {
  editing.value = c; showForm.value = true
  form.value = { name: c.name, class_type: c.class_type, fame: c.fame,
    simulated_damage: c.simulated_damage, sustained_dps: c.sustained_dps, buff_amount: c.buff_amount }
}
async function save() {
  if (editing.value) await api.put(`/api/me/characters/${editing.value.id}`, form.value)
  else await api.post('/api/me/characters', form.value)
  editing.value = null; showForm.value = false; await load()
}
async function remove(c: Character) {
  if (!confirm(`删除角色 ${c.name}？`)) return
  try { await api.del(`/api/me/characters/${c.id}`); await load() }
  catch (e: any) { alert(e.message) }
}
const isDps = computed(() => form.value.class_type === '输出')
</script>

<template>
  <div style="max-width:600px;margin:24px auto">
    <div style="display:flex;align-items:center;gap:12px">
      <h2>我的角色</h2>
      <button @click="startCreate">＋ 添加角色</button>
    </div>

    <div v-for="c in list" :key="c.id" style="border:1px solid #eee;padding:10px;margin:8px 0;
         display:flex;align-items:center;gap:12px">
      <div style="flex:1">
        <b>{{ c.name }}</b>
        <span style="color:#666;font-size:12px">{{ c.class_type }} · 名望 {{ c.fame }}</span>
        <div style="color:#999;font-size:12px">
          {{ c.class_type === '输出'
            ? `模拟 ${c.simulated_damage ?? '-'} · 秒伤 ${c.sustained_dps ?? '-'}`
            : `增益 ${c.buff_amount ?? '-'}` }}
        </div>
      </div>
      <button @click="startEdit(c)">编辑</button>
      <button @click="remove(c)" style="color:#c62828">删除</button>
    </div>
    <p v-if="!list.length" style="color:#999">还没有角色</p>

    <div v-if="showForm" style="border:1px solid #ddd;padding:16px;margin:12px 0">
      <h3>{{ editing ? '编辑角色' : '添加角色' }}</h3>
      <div><input v-model="form.name" placeholder="角色名" /></div>
      <div>
        <select v-model="form.class_type">
          <option value="输出">输出</option>
          <option value="辅助">辅助</option>
        </select>
        <input v-model.number="form.fame" type="number" placeholder="名望值" />
      </div>
      <template v-if="isDps">
        <div><input v-model.number="form.simulated_damage" type="number" placeholder="模拟伤害" /></div>
        <div><input v-model.number="form.sustained_dps" type="number" placeholder="秒伤" /></div>
      </template>
      <template v-else>
        <div><input v-model.number="form.buff_amount" type="number" placeholder="增益量" /></div>
      </template>
      <button @click="save">保存</button>
      <button @click="showForm = false">取消</button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 运行验证**

Run: `cd frontend && npm run dev` → 登录 → 「我的角色」→ 添加输出/辅助角色 → 列表显示对应属性字段。
Expected: CRUD 正常。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/MyCharactersView.vue
git commit -m "feat: my characters page"
```

---

## Task 11: 管理面板

**Files:**
- Create: `frontend/src/views/AdminView.vue`

- [ ] **Step 1: 注册码 + 用户管理**

`frontend/src/views/AdminView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import type { CodeItem, User } from '../types'

const codes = ref<CodeItem[]>([])
const users = ref<User[]>([])
const singleUse = ref(true)
const expireDays = ref(7)

async function load() {
  codes.value = await api.get<CodeItem[]>('/api/admin/codes')
  users.value = await api.get<User[]>('/api/admin/users')
}
onMounted(load)

async function genCode() {
  await api.post('/api/admin/codes', { single_use: singleUse.value, expire_days: expireDays.value || null })
  await load()
}
</script>

<template>
  <div style="max-width:700px;margin:24px auto">
    <h2>管理面板</h2>
    <section style="margin:16px 0">
      <h3>生成注册码</h3>
      <label><input type="checkbox" v-model="singleUse" /> 一次性</label>
      <input v-model.number="expireDays" type="number" min="0" placeholder="有效期(天,0=不限)" />
      <button @click="genCode">生成</button>
      <table style="width:100%;border-collapse:collapse;margin-top:12px">
        <tr><th style="text-align:left">注册码</th><th>状态</th><th>过期</th></tr>
        <tr v-for="c in codes" :key="c.id">
          <td><code>{{ c.code }}</code></td>
          <td>{{ c.used_by ? '已使用' : '未使用' }}</td>
          <td>{{ c.expires_at ? new Date(c.expires_at).toLocaleString() : '不限' }}</td>
        </tr>
      </table>
    </section>
    <section>
      <h3>成员</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="text-align:left">群昵称</th><th>用户名</th><th>角色</th></tr>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.nickname }}</td>
          <td>{{ u.username }}</td>
          <td>{{ u.is_admin ? '管理员' : '成员' }}</td>
        </tr>
      </table>
    </section>
  </div>
</template>
```

- [ ] **Step 2: 运行验证**

Run: `cd frontend && npm run dev` → admin → 管理 → 生成注册码 → 复制到注册页注册新用户。
Expected: 注册码出现并可用；用户列表显示新成员。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/AdminView.vue
git commit -m "feat: admin panel for codes and users"
```

---

## Task 12: Docker 部署 + 收尾

**Files:**
- Create: `backend/Dockerfile`, `frontend/Dockerfile`（或单 `Dockerfile` 多阶段）、`docker-compose.yml`, `.env.example`, `backend/requirements.txt`（导出锁定依赖）

- [ ] **Step 1: 多阶段 Dockerfile + Compose**

`Dockerfile`（根目录）：

```dockerfile
# 前端构建
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci   # 有 lockfile，用 npm ci 保证可复现
COPY frontend/ .
RUN npm run build

# 后端 + 静态托管
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=frontend /app/frontend/dist ./static
ENV DNFER_STATIC_DIR=/app/static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`backend/requirements.txt`（**锁定版本**，供 Docker 使用；用 `pip freeze` 从已验证的 venv 导出关键依赖的准确版本）：

```
fastapi==0.141.0
uvicorn[standard]==0.40.0
sqlalchemy==2.0.54
pydantic-settings==2.13.0
bcrypt==5.0.0
PyJWT==2.14.0
```

> **注意**：`main.py` 中静态目录改为从配置读 `settings.static_dir`（默认 `../frontend/dist`），Docker 环境变量 `DNFER_STATIC_DIR=/app/static` 覆盖。

`config.py` 增加字段：

```python
static_dir: str = "../frontend/dist"
```

`main.py` 静态挂载改为 **SPA 兜底**（history 模式深链如 `/raids/5` 刷新时返回 `index.html`，否则 StaticFiles `html=True` 对任意未匹配路径返回 404）：

```python
from pathlib import Path

from starlette.responses import FileResponse

class SpaStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 404:
            index_path = Path(self.directory) / "index.html"
            if index_path.exists():
                return FileResponse(index_path)
        return response

try:
    app.mount("/", SpaStaticFiles(directory=settings.static_dir, html=True), name="static")
except RuntimeError:
    pass
```

> 说明：SPA 兜底只作用于静态挂载内 404 的路径；`/api/*` 与 `/ws/*` 由排在挂载之前的 API/WS 路由处理，不受影响。

`docker-compose.yml`：

```yaml
services:
  dnfer:
    build: .
    ports:
      - "8000:8000"
    environment:
      DNFER_SECRET_KEY: ${DNFER_SECRET_KEY:?DNFER_SECRET_KEY 必须设置}
      DNFER_ADMIN_USERNAME: ${DNFER_ADMIN_USERNAME:-admin}
      DNFER_ADMIN_PASSWORD: ${DNFER_ADMIN_PASSWORD:?DNFER_ADMIN_PASSWORD 必须设置}
      DNFER_ADMIN_NICKNAME: ${DNFER_ADMIN_NICKNAME:-群主}
      DNFER_API_TOKEN: ${DNFER_API_TOKEN:?DNFER_API_TOKEN 必须设置}
      DNFER_DATABASE_URL: sqlite:////data/dnfer.db
    volumes:
      - dnfer-data:/data
    restart: unless-stopped

volumes:
  dnfer-data:
```

`.env.example`：

```
DNFER_SECRET_KEY=please-change-me
DNFER_ADMIN_PASSWORD=please-change-me
DNFER_API_TOKEN=please-change-me-bot-token
DNFER_ADMIN_USERNAME=admin
DNFER_ADMIN_NICKNAME=群主
```

- [ ] **Step 2: 本地全量验证**

Run（后端）: `cd backend && pytest -v`
Run（前端）: `cd frontend && npm run test && npm run build`
Expected: 后端测试全绿；前端测试通过、构建成功。

- [ ] **Step 3: Docker 构建与启动**

Run: `docker compose up -d --build`
Expected: http://localhost:8000 打开前端；admin 可登录；两个窗口排表实时同步。

- [ ] **Step 4: 机器人生成（可选）**

验证公共 API：

```bash
curl -H "Authorization: Bearer $DNFER_API_TOKEN" http://localhost:8000/api/public/raids
curl -H "Authorization: Bearer $DNFER_API_TOKEN" http://localhost:8000/api/public/raids/1/waves/1
```

Expected: 返回 JSON 攻坚列表与第 1 波配置。

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example backend/requirements.txt
git commit -m "feat: docker deployment with static frontend hosting"
```

---

## 验收清单

- [ ] 管理员初始化后可用 admin 登录；生成一次性注册码；新用户凭码注册
- [ ] 成员增删改查自己的多个角色（输出含模拟伤害+秒伤，辅助含增益量）
- [ ] 管理员创建攻坚（规模 12 默认，合法 {4,8,12,16,20}），初始 1 波
- [ ] 排表页纵向堆叠波次表格，红黄绿明亮配色，12 格恒定
- [ ] 成员点空格选角色占位；职责下拉按职业过滤，默认主C/主奶
- [ ] 校验：角色全攻坚唯一、每队至多 1 主奶、满员小队组成规则硬校验、未满员警告
- [ ] 非锁定成员可加波、删除仅含自己角色的波（至少保留 1 波）
- [ ] 管理员可锁定/解锁、编辑任意格子、删任意波
- [ ] 两窗口实时同步（WS）；断线自动重连
- [ ] 机器人 API 用 Token 查询攻坚列表与单波配置
- [ ] Docker 一键部署，SQLite 数据持久化
