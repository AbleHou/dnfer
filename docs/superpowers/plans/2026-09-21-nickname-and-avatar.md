# 昵称规则与 S3 头像 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 昵称注册/修改时强制「唯一 + 仅中文/字母/数字」，接入 S3 公开读桶支持用户上传头像，顶栏「头像+昵称」点击弹出个人信息面板（改昵称/换头像），排表页占位格显示 owner 头像。

**Architecture:** 后端在 pydantic schema 加昵称 pattern、注册与 `PUT /api/me/profile` 查重；新增 `POST /api/me/avatar` 经 boto3 上传到 S3 公开读桶并把公开 URL 存 `users.avatar`；`UserOut`/`SlotOut` 透出头像。前端新增可复用 `UserAvatar` 组件（有图显示图、无图显示「首字符+哈希底色」占位）、`ProfilePanel` 个人信息弹窗、昵称校验工具，顶栏与排表占位格接入头像。

**Tech Stack:** FastAPI + SQLAlchemy + SQLite + boto3（后端）；Vue 3 + TypeScript + Pinia + Naive UI + Vitest（前端）。TDD：先写失败测试，跑失败，实现，跑通过，提交。

**测试命令：**
- 后端（需在 backend 目录，`.venv` 虚拟环境）：
  - 单文件：`.venv/bin/python -m pytest tests/test_xxx.py -v`
  - 全量：`.venv/bin/python -m pytest`
- 前端（需在 frontend 目录）：`npm test`（vitest run）；构建 `npm run build`（vue-tsc + vite）

---

## 任务总览（文件结构）

| 任务 | 文件 | 责任 |
|---|---|---|
| 1 | `backend/app/schemas.py`、`backend/app/routers/auth.py`、`backend/tests/test_auth.py` | 昵称字符规则 + 注册查重 |
| 2 | `backend/app/models.py`、`backend/app/migrations.py`、`backend/app/db.py`、`backend/tests/test_migrations.py` | `users.avatar` 列 + 幂等迁移 |
| 3 | `backend/app/config.py`、`backend/requirements.txt`、`backend/app/s3.py`、`.env.example` | S3 配置 + 上传模块 |
| 4 | `backend/app/routers/auth.py`、`backend/app/schemas.py`、`backend/tests/test_profile.py`（新建） | 改昵称接口 + 头像上传接口 + `UserOut.avatar` |
| 5 | `backend/app/routers/raids.py`、`backend/app/schemas.py`、`backend/tests/test_raids.py` | `SlotOut.owner_avatar` |
| 6 | `frontend/src/types.ts`、`frontend/src/utils/nickname.ts`、`frontend/src/lib/avatar.ts`、`frontend/src/api/client.ts`、`frontend/src/stores/auth.ts` + 各 spec | 类型 + 工具 + upload + store |
| 7 | `frontend/src/components/UserAvatar.vue` + spec | 可复用头像组件（图/占位） |
| 8 | `frontend/src/App.vue`、`frontend/src/components/ProfilePanel.vue` + spec | 顶栏头像昵称入口 + 个人信息面板 |
| 9 | `frontend/src/views/RegisterView.vue`、`frontend/src/components/SlotCell.vue`、`frontend/src/components/SlotCell.spec.ts` | 注册校验 + 排表格 owner 头像 |
| 10 | — | 全量验证（后端 pytest + 前端 vitest + 构建）+ CHANGELOG |

**S3 运行期前置（实现者确认）：** 测试与开发默认「未配置 S3」→ 上传接口返回 503，正常路径不阻塞；上线时在 `.env` 填 `DNFER_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET/REGION/PUBLIC_BASE`。

---

### Task 1: 昵称字符规则 + 注册查重（后端）

**Files:**
- Modify: `backend/app/schemas.py`（`RegisterIn.nickname`）
- Modify: `backend/app/routers/auth.py`（`register`）
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_auth.py` 追加：

```python
def test_register_rejects_duplicate_nickname(client, admin_headers):
    code = client.post("/api/admin/codes", headers=admin_headers,
                       json={"single_use": True}).json()["code"]
    r = client.post("/api/auth/register", json={
        "username": "p_dup_1", "password": "secret1", "nickname": "撞名", "code": code})
    assert r.status_code == 200
    code2 = client.post("/api/admin/codes", headers=admin_headers,
                        json={"single_use": True}).json()["code"]
    r = client.post("/api/auth/register", json={
        "username": "p_dup_2", "password": "secret1", "nickname": "撞名", "code": code2})
    assert r.status_code == 400

def test_register_rejects_invalid_nickname(client, admin_headers):
    code = client.post("/api/admin/codes", headers=admin_headers,
                       json={"single_use": True}).json()["code"]
    for bad in ("带空格 昵称", "带@符号", "带-横线", "带.句点"):
        r = client.post("/api/auth/register", json={
            "username": "p_inv", "password": "secret1", "nickname": bad, "code": code})
        assert r.status_code == 422, bad
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_auth.py::test_register_rejects_duplicate_nickname tests/test_auth.py::test_register_rejects_invalid_nickname -v`
Expected: FAIL（重复昵称当前可注册成功；非法字符当前返回 200）

- [ ] **Step 3: 最小实现**

`backend/app/schemas.py`，`RegisterIn.nickname` 加 pattern：

```python
class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    nickname: str = Field(min_length=1, max_length=64,
                          pattern="^[\u4e00-\u9fa5A-Za-z0-9]+$")
    code: str
```

`backend/app/routers/auth.py` 的 `register`，在用户名查重之后加昵称查重：

```python
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "用户名已存在")
    if db.query(User).filter(User.nickname == body.nickname).first():
        raise HTTPException(400, "昵称已存在")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_auth.py -v`
Expected: 全部 PASS（含既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/auth.py backend/tests/test_auth.py
git commit -m "[fix] 昵称注册强制唯一且仅中文/字母/数字"
```

---

### Task 2: `users.avatar` 列 + 幂等迁移（后端）

**Files:**
- Modify: `backend/app/models.py`（`User`）
- Modify: `backend/app/migrations.py`（新增 `migrate_avatars`）
- Modify: `backend/app/db.py`（`init_db` 调用）
- Test: `backend/tests/test_migrations.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_migrations.py` 追加：

```python
def test_migrate_avatars_adds_column():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE users (
            id INTEGER PRIMARY KEY, username VARCHAR(64) UNIQUE,
            password_hash VARCHAR(128), nickname VARCHAR(64),
            is_admin BOOLEAN, created_at DATETIME)"""))
    from app.migrations import migrate_avatars
    migrate_avatars(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(users)")).all()}
        assert "avatar" in cols
    migrate_avatars(engine)  # 幂等：再次运行不报错
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_migrations.py::test_migrate_avatars_adds_column -v`
Expected: FAIL（ImportError: cannot import name 'migrate_avatars'）

- [ ] **Step 3: 最小实现**

`backend/app/models.py`，`User` 加列：

```python
    nickname: Mapped[str] = mapped_column(String(64))
    avatar: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
```

`backend/app/migrations.py` 新增：

```python
def migrate_avatars(engine: Engine) -> None:
    """为存量库补建 users.avatar 列（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).all()}
        if "avatar" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar VARCHAR(256)"))
```

`backend/app/db.py` 的 `init_db`：

```python
    from .migrations import migrate_avatars, migrate_dungeons, migrate_jobs
    migrate_dungeons(engine)
    migrate_jobs(engine)
    migrate_avatars(engine)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "[fet] users 表新增 avatar 列（幂等迁移）"
```

---

### Task 3: S3 配置 + 上传模块（后端）

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/requirements.txt`
- Create: `backend/app/s3.py`
- Modify: `.env.example`

- [ ] **Step 1: 写失败测试（占位：无接口可测，先建模块）**

本任务先实现纯配置与上传函数，测试在 Task 4 通过 monkeypatch 覆盖。Step 1 改先写一个针对 `s3.s3_configured` 的配置判定测试，放到 `backend/tests/test_profile.py`（该文件 Task 4 复用）：

```python
import app.s3 as s3mod

def test_s3_configured_false_by_default(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "s3_endpoint", "")
    monkeypatch.setattr(settings, "s3_access_key", "")
    monkeypatch.setattr(settings, "s3_secret_key", "")
    monkeypatch.setattr(settings, "s3_bucket", "")
    monkeypatch.setattr(settings, "s3_public_base", "")
    assert s3mod.s3_configured() is False
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_profile.py -v`
Expected: FAIL（ImportError: cannot import name 's3' / module has no attribute）

- [ ] **Step 3: 最小实现**

`backend/app/config.py` 的 `Settings` 加字段：

```python
    # S3 头像存储（公开读桶）
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = ""
    s3_region: str = ""
    s3_public_base: str = ""
```

`backend/requirements.txt` 追加：

```
boto3==1.37.10
python-multipart==0.0.20
```

`backend/app/s3.py`（新建，boto3 延迟导入避免未安装时破坏其他模块）：

```python
"""S3 兼容公开读桶：头像上传/删除。boto3 延迟导入，未配置/未安装不影响其余功能。"""
from uuid import uuid4

from .config import settings

_client = None

def _get_client():
    global _client
    if _client is None:
        import boto3
        _client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region or None,
        )
    return _client

def s3_configured() -> bool:
    return bool(settings.s3_endpoint and settings.s3_access_key
                and settings.s3_secret_key and settings.s3_bucket
                and settings.s3_public_base)

def upload_avatar(user_id: int, ext: str, data: bytes, content_type: str) -> str:
    key = f"avatars/{user_id}/{uuid4().hex}.{ext}"
    _get_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data,
                             ContentType=content_type, ACL="public-read")
    return f"{settings.s3_public_base.rstrip('/')}/{key}"

def delete_avatar(url: str) -> None:
    """best-effort 删除旧头像对象；URL 不在公开前缀下或删除失败均忽略。"""
    base = settings.s3_public_base.rstrip("/")
    if not url.startswith(base + "/"):
        return
    key = url[len(base) + 1:]
    try:
        _get_client().delete_object(Bucket=settings.s3_bucket, Key=key)
    except Exception:
        pass
```

`.env.example` 追加：

```
# S3 头像存储（公开读桶；留空则头像上传不可用，返回 503）
DNFER_S3_ENDPOINT=
DNFER_S3_ACCESS_KEY=
DNFER_S3_SECRET_KEY=
DNFER_S3_BUCKET=
DNFER_S3_REGION=
DNFER_S3_PUBLIC_BASE=
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_profile.py::test_s3_configured_false_by_default -v`
Expected: PASS（若 `.venv` 未装新依赖需先 `pip install -r requirements.txt`）

- [ ] **Step 5: 提交**

```bash
git add backend/app/config.py backend/requirements.txt backend/app/s3.py .env.example
git commit -m "[fet] S3 公开读桶配置与头像上传/删除模块（boto3）"
```

---

### Task 4: 改昵称 + 上传头像接口（后端）

**Files:**
- Modify: `backend/app/schemas.py`（`ProfileUpdate`、`UserOut.avatar`）
- Modify: `backend/app/routers/auth.py`（`PUT /api/me/profile`、`POST /api/me/avatar`）
- Test: `backend/tests/test_profile.py`（新建）

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_profile.py`（保留 Task 3 的 `test_s3_configured_false_by_default`），追加：

```python
from .helpers import register_user

def _upload(client, h, filename="a.png", data=b"fakepng", content_type="image/png"):
    return client.post("/api/me/avatar", headers=h,
                       files={"file": (filename, data, content_type)})

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

def test_avatar_upload_rejects_oversize(client):
    h, _ = register_user(client, "prof7", "阿大")
    big = b"x" * (2 * 1024 * 1024 + 1)
    assert _upload(client, h, data=big).status_code == 400

def test_avatar_unconfigured(client):
    h, _ = register_user(client, "prof8", "阿存")
    # 默认未配置 S3（conftest 环境无 env）
    assert _upload(client, h).status_code == 503
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_profile.py -v`
Expected: FAIL（`/api/me/profile` 404、`/api/me/avatar` 404 或 import 错误）

- [ ] **Step 3: 最小实现**

`backend/app/schemas.py`：

```python
class ProfileUpdate(BaseModel):
    nickname: str = Field(min_length=1, max_length=64,
                          pattern="^[\u4e00-\u9fa5A-Za-z0-9]+$")
```

`UserOut` 加字段：

```python
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    nickname: str
    avatar: str | None = None
    is_admin: bool
```

`backend/app/routers/auth.py` 顶部 import 补全：

```python
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from ..schemas import (CodeCreate, CodeOut, LoginIn, PlayerCharacters,
                       ProfileUpdate, RegisterIn, UserOut)
from .. import s3
```

`auth.py` 追加两个端点（放在 `me` 之后）：

```python
_AVATAR_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_MAX_AVATAR_BYTES = 2 * 1024 * 1024

@router.put("/me/profile", response_model=UserOut)
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    dup = db.query(User).filter(User.nickname == body.nickname,
                                User.id != user.id).first()
    if dup:
        raise HTTPException(400, "昵称已存在")
    user.nickname = body.nickname
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)

@router.post("/me/avatar", response_model=UserOut)
def upload_avatar(file: UploadFile = File(...),
                  user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    # 先做文件级校验（400），再判存储可用性（503）：
    # 未配置 S3 时非法文件仍应返回 400（测试依赖此顺序）
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "仅支持图片文件")
    data = file.file.read()
    if len(data) > _MAX_AVATAR_BYTES:
        raise HTTPException(400, "图片不能超过 2MB")
    if not s3.s3_configured():
        raise HTTPException(503, "头像存储未配置")
    ext = _AVATAR_EXT.get(file.content_type, "bin")
    try:
        url = s3.upload_avatar(user.id, ext, data,
                               file.content_type or "application/octet-stream")
    except Exception:
        raise HTTPException(503, "头像存储暂不可用")
    if user.avatar:
        s3.delete_avatar(user.avatar)
    user.avatar = url
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_profile.py tests/test_auth.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/auth.py backend/tests/test_profile.py
git commit -m "[fet] 改昵称 PUT /api/me/profile + 头像上传 POST /api/me/avatar（S3）"
```

---

### Task 5: `SlotOut.owner_avatar`（后端）

**Files:**
- Modify: `backend/app/schemas.py`（`SlotOut`）
- Modify: `backend/app/routers/raids.py`（`_slot_out`）
- Test: `backend/tests/test_raids.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_raids.py` 追加（沿用该文件既有 `_fill`/helper 风格；若已有「fill 后断言 owner_nickname」的用例，在其后补断言亦可）：

```python
def test_slot_out_includes_owner_avatar(client, admin_headers):
    from .helpers import make_raid, register_user
    h, u = register_user(client, "av1", "阿甲")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "job_name": "weapon_master", "fame": 1}).json()["id"]
    rid = make_raid(client, admin_headers)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=admin_headers) \
        .json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid})
    slot2 = client.get(f"/api/raids/{rid}", headers=admin_headers) \
        .json()["waves"][0]["slots"][0]
    assert slot2["owner_avatar"] is None  # 未上传头像时为 null
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raids.py::test_slot_out_includes_owner_avatar -v`
Expected: FAIL（KeyError: 'owner_avatar'）

- [ ] **Step 3: 最小实现**

`backend/app/schemas.py`，`SlotOut` 加字段：

```python
    owner_id: int | None
    owner_nickname: str | None
    owner_avatar: str | None
    duty: str | None
```

`backend/app/routers/raids.py`，`_slot_out` 加：

```python
        owner_id=c.owner.id if c else None,
        owner_nickname=c.owner.nickname if c else None,
        owner_avatar=c.owner.avatar if c else None,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raids.py tests/test_public.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/raids.py backend/tests/test_raids.py
git commit -m "[fet] SlotOut 透出 owner_avatar"
```

---

### Task 6: 前端类型 + 工具 + upload + store

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/utils/nickname.ts` + `frontend/src/utils/nickname.spec.ts`
- Create: `frontend/src/lib/avatar.ts` + `frontend/src/lib/avatar.spec.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/stores/auth.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/utils/nickname.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { validateNickname } from './nickname'

describe('validateNickname', () => {
  it('合法昵称返回 null', () => {
    expect(validateNickname('剑魂无敌')).toBeNull()
    expect(validateNickname('Able233')).toBeNull()
    expect(validateNickname('a')).toBeNull()
  })
  it('非法字符返回错误文案', () => {
    expect(validateNickname('带空格 名')).not.toBeNull()
    expect(validateNickname('带@号')).not.toBeNull()
    expect(validateNickname('带-横线')).not.toBeNull()
  })
  it('空与超长返回错误文案', () => {
    expect(validateNickname('')).not.toBeNull()
    expect(validateNickname('x'.repeat(65))).not.toBeNull()
  })
})
```

`frontend/src/lib/avatar.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { avatarBackground, avatarFallbackChar } from './avatar'

describe('avatar', () => {
  it('哈希底色确定性', () => {
    expect(avatarBackground('剑魂无敌')).toBe(avatarBackground('剑魂无敌'))
  })
  it('首字符兜底', () => {
    expect(avatarFallbackChar('剑魂无敌')).toBe('剑')
    expect(avatarFallbackChar('  ')).toBe('?')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npm test`
Expected: FAIL（找不到 `./nickname` / `./avatar` 模块）

- [ ] **Step 3: 最小实现**

`frontend/src/types.ts`：

```ts
export interface User { id: number; username: string; nickname: string; is_admin: boolean; avatar: string | null }
```

`Slot` 加 `owner_avatar: string | null`（`owner_nickname` 之后）。

`frontend/src/utils/nickname.ts`（新建）：

```ts
export const NICKNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9]{1,64}$/

export function validateNickname(nickname: string): string | null {
  if (!nickname) return '昵称不能为空'
  if (nickname.length > 64) return '昵称不能超过 64 个字符'
  if (!NICKNAME_RE.test(nickname)) return '昵称仅支持中文、字母和数字'
  return null
}
```

`frontend/src/lib/avatar.ts`（新建）：

```ts
const PALETTE = ['#2f6fbf', '#3f9e6a', '#c0703f', '#7a5fc0', '#c04f6a', '#3a9ba8', '#b08a2f']

export function avatarBackground(nickname: string): string {
  let h = 0
  for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function avatarFallbackChar(nickname: string): string {
  return nickname.trim().charAt(0) || '?'
}
```

`frontend/src/api/client.ts`，把 `request` 改为支持 FormData，并加 `upload`：

```ts
async function request<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method, headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  })
  // 登录接口 401 不触发全局跳转（原逻辑保留）
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
  upload: <T>(url: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<T>('POST', url, form, true)
  },
  getJobs: () => request<JobCategory[]>('GET', '/api/jobs'),
}
```

`frontend/src/stores/auth.ts` 加 action：

```ts
    updateProfile(user: User) { this.user = user },
```

- [ ] **Step 4: 跑测试确认通过 + 修复既有 fixture**

Run: `cd /Users/able/toys/dnfer/frontend && npm test`
Expected: 新 spec PASS；既有 spec 可能因 `User.avatar`/`Slot.owner_avatar` 必填而 TS 报错，**修复**：

- `frontend/src/views/RaidListView.spec.ts`：6 处 `auth.user = { id, username, nickname, is_admin }` 补 `avatar: null`
- `frontend/src/components/SlotCell.spec.ts`：`occupied()` / `empty()` 两个 fixture 补 `owner_avatar: null`（`owner_nickname` 之后）
- `frontend/src/stores/raid.spec.ts`：`makeRaid()` 的 `Array.from` slot 字面量 + 5 处 `slot:` 事件字面量补 `owner_avatar: null`
- `frontend/src/composables/useSlotMove.spec.ts`：`makeSlot()` 返回的 Slot 补 `owner_avatar: null`
- `frontend/src/lib/damage.spec.ts`：`slot()` helper 返回的 Slot 补 `owner_avatar: null`

（这些 spec 的 Slot 字面量都被 `tsconfig.json` 纳入 vue-tsc 类型检查，漏改会在 Task 8-10 的 `npm run build` 阶段报错。）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/types.ts frontend/src/utils/nickname.ts frontend/src/utils/nickname.spec.ts frontend/src/lib/avatar.ts frontend/src/lib/avatar.spec.ts frontend/src/api/client.ts frontend/src/stores/auth.ts frontend/src/views/RaidListView.spec.ts frontend/src/components/SlotCell.spec.ts
git commit -m "[fet] 前端类型/工具/api upload/auth store 就绪"
```

---

### Task 7: UserAvatar 组件

**Files:**
- Create: `frontend/src/components/UserAvatar.vue`
- Test: `frontend/src/components/UserAvatar.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/UserAvatar.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatar from './UserAvatar.vue'

describe('UserAvatar', () => {
  it('有 avatar 时渲染 img', () => {
    const w = mount(UserAvatar, { props: { nickname: '阿甲', avatar: 'https://cdn/x.png', size: 28 } })
    expect(w.find('img').attributes('src')).toBe('https://cdn/x.png')
    expect(w.find('.user-avatar-fallback').exists()).toBe(false)
  })
  it('无 avatar 时渲染首字符兜底', () => {
    const w = mount(UserAvatar, { props: { nickname: '阿乙', avatar: null, size: 28 } })
    expect(w.find('.user-avatar-fallback').text()).toBe('阿')
    expect(w.find('img').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npm test`
Expected: FAIL（找不到 `./UserAvatar.vue`）

- [ ] **Step 3: 最小实现**

`frontend/src/components/UserAvatar.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { avatarBackground, avatarFallbackChar } from '../lib/avatar'

const props = defineProps<{ nickname: string; avatar: string | null; size?: number }>()
const size = computed(() => props.size ?? 28)
const fallback = computed(() => avatarFallbackChar(props.nickname))
const bg = computed(() => avatarBackground(props.nickname))
</script>

<template>
  <span class="user-avatar" :style="{
    width: size + 'px', height: size + 'px',
    background: bg, fontSize: Math.max(10, Math.round(size / 2)) + 'px',
  }">
    <img v-if="avatar" :src="avatar" :alt="nickname">
    <span v-else class="user-avatar-fallback">{{ fallback }}</span>
  </span>
</template>

<style scoped>
.user-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden; flex-shrink: 0;
  color: #fff; line-height: 1; user-select: none;
}
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm test`
Expected: UserAvatar spec PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/UserAvatar.vue frontend/src/components/UserAvatar.spec.ts
git commit -m "[fet] 可复用 UserAvatar 组件（图/首字符+哈希底色占位）"
```

---

### Task 8: 顶栏入口 + 个人信息面板

**Files:**
- Modify: `frontend/src/App.vue`
- Create: `frontend/src/components/ProfilePanel.vue` + `frontend/src/components/ProfilePanel.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/ProfilePanel.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ProfilePanel from './ProfilePanel.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { put: vi.fn(), upload: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 1, username: 'a', nickname: '阿甲', is_admin: false, avatar: null },
                         updateProfile: vi.fn() }),
}))
vi.mock('../lib/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }))
vi.mock('./UserAvatar.vue', () => ({ default: { props: ['nickname', 'avatar', 'size'], template: '<span />' } }))

beforeEach(() => vi.clearAllMocks())

describe('ProfilePanel', () => {
  it('非法昵称不调接口并显示错误', async () => {
    apiMock.put.mockResolvedValue({ id: 1, username: 'a', nickname: '阿甲', is_admin: false, avatar: null })
    const w = mount(ProfilePanel, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    const input = w.find('input[type="text"]')
    await input.setValue('带空格 名')
    await w.find('button.save-nickname').trigger('click')
    await flushPromises()
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(w.text()).toContain('昵称仅支持中文、字母和数字')
  })

  it('合法昵称保存后调用 PUT /api/me/profile', async () => {
    apiMock.put.mockResolvedValue({ id: 1, username: 'a', nickname: '新名', is_admin: false, avatar: null })
    const w = mount(ProfilePanel, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('input[type="text"]').setValue('新名')
    await w.find('button.save-nickname').trigger('click')
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/me/profile', { nickname: '新名' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npm test`
Expected: FAIL（找不到 `./ProfilePanel.vue`）

- [ ] **Step 3: 最小实现**

`frontend/src/components/ProfilePanel.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NModal, NInput } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { validateNickname } from '../utils/nickname'
import { notifyError, notifySuccess } from '../lib/notify'
import UserAvatar from './UserAvatar.vue'
import type { User } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const auth = useAuthStore()
const nickname = ref(auth.user?.nickname ?? '')
const nicknameError = ref('')
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function saveNickname() {
  const err = validateNickname(nickname.value)
  nicknameError.value = err ?? ''
  if (err || !auth.user) return
  saving.value = true
  try {
    const user = await api.put<User>('/api/me/profile', { nickname: nickname.value })
    auth.updateProfile(user)
    notifySuccess('昵称已更新')
  } catch (e: any) { nicknameError.value = e.message }
  finally { saving.value = false }
}

async function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const user = await api.upload<User>('/api/me/avatar', f)
    auth.updateProfile(user)
    notifySuccess('头像已更新')
  } catch (e: any) { notifyError(e.message) }
  finally { if (fileInput.value) fileInput.value.value = '' }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="个人信息" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div v-if="auth.user" style="display:flex;flex-direction:column;gap:14px;align-items:center">
      <button class="dnf-btn" style="padding:4px;border-radius:50%" title="点击更换头像"
              @click="fileInput?.click()">
        <UserAvatar :nickname="auth.user.nickname" :avatar="auth.user.avatar" :size="72" />
      </button>
      <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileChange">
      <div style="width:100%">
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">账号（登录用）</div>
        <div style="color:var(--dnf-text)">{{ auth.user.username }}</div>
      </div>
      <div style="width:100%">
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">昵称</div>
        <n-input v-model:value="nickname" type="text" placeholder="昵称（中文/字母/数字）"
                 @keyup.enter="saveNickname" />
        <p v-if="nicknameError" class="form-error" style="margin:4px 0 0">{{ nicknameError }}</p>
      </div>
      <button class="dnf-btn dnf-btn-primary save-nickname" style="width:100%"
              :disabled="saving" @click="saveNickname">保存昵称</button>
    </div>
  </n-modal>
</template>
```

`frontend/src/App.vue` 改动：

- import `UserAvatar`、`ProfilePanel`；新增 `profileOpen` ref
- 顶栏右侧替换：

```vue
      <span class="nav-right">
        <button class="nav-user" title="个人信息" @click="profileOpen = true">
          <UserAvatar v-if="auth.user" :nickname="auth.user.nickname"
                      :avatar="auth.user.avatar" :size="26" />
          <span class="nav-username">{{ auth.user?.nickname }}</span>
        </button>
        <a href="#" class="nav-exit" @click.prevent="logout">退出</a>
        <n-dropdown :options="menuOptions" @select="onMenuSelect">
          <button class="hamburger" aria-label="菜单">☰</button>
        </n-dropdown>
      </span>
      <ProfilePanel :open="profileOpen" @close="profileOpen = false" />
```

- script 顶部补：

```ts
const profileOpen = ref(false)
```

（注意 `App.vue` 现用 `computed`，需把 `ref` 加进 vue import。）

- `frontend/src/styles/dnf.css` 补 `.nav-user` 样式（与 `.nav-right` 对齐、flex 居中、去掉按钮默认样式）：

```css
.nav-user { display:inline-flex; align-items:center; gap:6px; background:none; border:none;
  color:var(--dnf-text); cursor:pointer; padding:2px 6px; border-radius:6px; }
.nav-user:hover { background:var(--dnf-panel-inner); }
```

（若仓库已有 `.nav-username` 间距样式，保留即可。）

- [ ] **Step 4: 跑测试确认通过 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npm test && npm run build`
Expected: ProfilePanel spec PASS；构建（vue-tsc）无类型错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/App.vue frontend/src/components/ProfilePanel.vue frontend/src/components/ProfilePanel.spec.ts frontend/src/styles/dnf.css
git commit -m "[fet] 顶栏头像+昵称入口 + 个人信息面板（换头像/改昵称）"
```

---

### Task 9: 注册页校验 + 排表格 owner 头像

**Files:**
- Modify: `frontend/src/views/RegisterView.vue`
- Modify: `frontend/src/components/SlotCell.vue`

- [ ] **Step 1: 写失败测试**

无新增 spec；依赖 Task 6 已建的 `validateNickname` 单测 + 构建期类型检查。本任务用「构建 + 手动验证」代替单测（`RegisterView`/`SlotCell` 渲染逻辑已被既有 spec 覆盖，仅在模板内接入组件）。

- [ ] **Step 2: 实现**

`frontend/src/views/RegisterView.vue`：

- import：`import { validateNickname } from '../utils/nickname'`
- 加状态：`const nicknameError = ref('')`
- `submit()` 开头加：

```ts
  nicknameError.value = validateNickname(nickname.value) ?? ''
  if (nicknameError.value) return
```

- 昵称输入框（**已有**，`RegisterView.vue` 第 34 行）更新 placeholder，并**在它之后**加错误提示（不新增第二个输入框）：

```vue
        <div style="margin:10px 0"><n-input v-model:value="nickname" placeholder="群昵称（中文/字母/数字）" /></div>
        <p v-if="nicknameError" class="form-error" style="margin:-6px 0 6px">{{ nicknameError }}</p>
```

`frontend/src/components/SlotCell.vue`：

- import：`import UserAvatar from './UserAvatar.vue'`
- owner 昵称行前加头像：

```vue
        <UserAvatar v-if="slot.owner_nickname" :nickname="slot.owner_nickname"
                    :avatar="slot.owner_avatar" :size="20" />
        <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
```

- [ ] **Step 3: 跑测试确认通过 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npm test && npm run build`
Expected: 全部 PASS；构建无类型错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/RegisterView.vue frontend/src/components/SlotCell.vue
git commit -m "[fet] 注册页昵称前端校验 + 排表格 owner 头像"
```

---

### Task 10: 全量验证 + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 后端全量测试**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest`
Expected: 全部 PASS

- [ ] **Step 2: 前端全量测试 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npm test && npm run build`
Expected: 全部 PASS；构建无错误

- [ ] **Step 3: 更新 CHANGELOG**

`CHANGELOG.md` 顶部按仓库既有格式新增版本条目，简述：
- 昵称：注册/修改强制唯一，仅中文/字母/数字
- 头像：S3 公开读桶上传，顶栏与排表占位格展示，个人信息面板改昵称/换头像
- 上线前置：`.env` 配置 `DNFER_S3_*`

- [ ] **Step 4: 提交**

```bash
git add CHANGELOG.md
git commit -m "[docs] CHANGELOG 记录昵称规则与 S3 头像版本"
```

---

## 不做的事（YAGNI）

- 不做私有桶 + 预签名 URL
- 不做服务端图片压缩/裁剪（不加 Pillow）
- 不改密码、不加邮箱/手机等资料字段
- 不迁移/清理存量非法昵称
- 不推昵称/头像变更 WS 事件（已打开排表页刷新后同步）
