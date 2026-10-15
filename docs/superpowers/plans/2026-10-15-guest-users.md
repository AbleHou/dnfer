# 临时用户（Guest）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员可代建「临时用户」（昵称+角色），无需对方注册即可排表占位与编队；可转正（设账号密码）或删除（清理占位/报名/角色/冒险团）。

**Architecture:** 复用现有 User/Character/RaidSignup 全链路，仅给 `User` 加 `is_guest` 标记 + 3 个 admin 端点（创建/转正/删除），排表占位零改动。前端加两个弹窗（创建/转正）与三个入口（攻坚详情页、编队页、用户管理页）+ 「临时」徽章。

**Tech Stack:** FastAPI + SQLAlchemy 2 + SQLite（后端）；Vue 3 + naive-ui + Vitest（前端）。

---

## 文件结构

**后端：**
- Modify `backend/app/models.py`：`User.is_guest` 列
- Modify `backend/app/migrations.py`：`migrate_users_guest`
- Modify `backend/app/db.py`：`init_db()` 挂载迁移
- Modify `backend/app/schemas.py`：`UserOut.is_guest` + `GuestCreate`/`GuestConvertIn`/`AdminCreateUserOut`
- Modify `backend/app/routers/admin.py`：3 个新端点（创建/转正/删除）
- Create `backend/tests/test_admin_guests.py`；Modify `backend/tests/test_migrations.py`

**前端：**
- Modify `frontend/src/types.ts`：`User.is_guest`
- Create `frontend/src/components/GuestCreateModal.vue` + `.spec.ts`
- Create `frontend/src/components/GuestConvertModal.vue` + `.spec.ts`
- Modify `frontend/src/views/AdminUsersView.vue` + `.spec.ts`
- Modify `frontend/src/views/RaidDetailView.vue` + `.spec.ts`
- Modify `frontend/src/views/RosterView.vue` + `.spec.ts`
- Modify `frontend/src/components/RosterPool.vue`（加 `#toolbar-extra` 插槽）

**测试命令：** 后端 `cd backend && .venv/bin/python -m pytest tests/test_admin_guests.py -v`；前端 `cd frontend && npx vitest run <file>`；类型 `cd frontend && npm run build`（vue-tsc）。

---

## Task 1: 后端 — `User.is_guest` 列 + 迁移 + 挂载

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/migrations.py`
- Modify: `backend/app/db.py`
- Test: `backend/tests/test_migrations.py`

- [ ] **Step 1: 写迁移测试**

在 `backend/tests/test_migrations.py` 末尾追加：

```python
def test_migrate_users_guest_adds_column():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE users (
            id INTEGER PRIMARY KEY, username VARCHAR(64) UNIQUE,
            password_hash VARCHAR(128), nickname VARCHAR(64),
            is_admin BOOLEAN, is_banned BOOLEAN, created_at DATETIME)"""))
    from app.migrations import migrate_users_guest
    migrate_users_guest(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(users)")).all()}
        assert "is_guest" in cols
    migrate_users_guest(engine)  # 幂等：再次运行不报错
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py::test_migrate_users_guest_adds_column -v`
Expected: FAIL（`ImportError: cannot import name 'migrate_users_guest'`）

- [ ] **Step 3: 实现模型列**

`backend/app/models.py` `User` 类（`is_banned` 行后）：

```python
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
```

- [ ] **Step 4: 实现迁移函数**

`backend/app/migrations.py`（`migrate_users_ban` 函数后追加，完全对齐其模式）：

```python
def migrate_users_guest(engine: Engine) -> None:
    """为存量库补建 users.is_guest 列（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).all()}
        if "is_guest" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT 0"))
```

- [ ] **Step 5: 挂载到 init_db**

`backend/app/db.py` `init_db()`：

```python
    from .migrations import (migrate_adventure_parties, migrate_avatars,
                             migrate_characters_sun_buff, migrate_dungeons, migrate_jobs,
                             migrate_users_ban, migrate_users_guest, migrate_waves_group)
```
并在 `migrate_users_ban(engine)` 后加 `migrate_users_guest(engine)`。

- [ ] **Step 6: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: 全部 PASS（含既有迁移测试）

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "[feat] User.is_guest 列 + migrate_users_guest 幂等迁移
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: 后端 — schemas

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: `UserOut` 加 `is_guest`**

`backend/app/schemas.py` `UserOut`（`is_banned` 行后）：

```python
    is_guest: bool = False
```

- [ ] **Step 2: 新增三个 schema**

在 `SignupUserIn` 附近追加：

```python
class GuestCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=64,
                          pattern="^[\u4e00-\u9fa5A-Za-z0-9]+$")
    username: str | None = Field(default=None, min_length=2, max_length=64)
    characters: list[CharacterIn] | None = None

class GuestConvertIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)

class AdminCreateUserOut(BaseModel):
    user: AdminUserOut
    characters: list[CharacterOut]
    default_party_id: int | None = None
    default_party_name: str | None = None
```

注意 `AdminCreateUserOut` 引用 `AdminUserOut`，须定义在 `AdminUserOut` 之后（schemas 底部，`AdminCharacterRow` 附近）。

- [ ] **Step 3: 验证导入无循环/顺序问题**

Run: `cd backend && .venv/bin/python -c "from app.schemas import GuestCreate, GuestConvertIn, AdminCreateUserOut, UserOut; print(UserOut.model_json_schema()['properties']['is_guest'])"`
Expected: 打印 `{'default': False, 'title': 'Is Guest', 'type': 'boolean'}`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas.py
git commit -m "[feat] guest schemas：UserOut.is_guest + GuestCreate/GuestConvertIn/AdminCreateUserOut
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: 后端 — `POST /api/admin/users` 创建临时用户

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_guests.py`（新建）

- [ ] **Step 1: 写失败测试（创建）**

新建 `backend/tests/test_admin_guests.py`：

```python
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
    # 随机密码不可知（断言非明文）
    row = db.query(User).filter(User.id == u["id"]).one()
    assert row.password_hash != "hunter2"
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_guests.py -v`
Expected: 本 Task 用例 FAIL（端点未注册——`POST /users` 与既有 `GET /users` 同路径返回 405；注册/登录相关的 401/403 用例除外）

- [ ] **Step 3: 实现创建端点**

`backend/app/routers/admin.py`：
1. 顶部 import 追加：

```python
import secrets
import uuid

from ..models import AdventureParty, Character, Raid, RaidSignup, RegistrationCode, User
from ..schemas import (..., AdminCreateUserOut, GuestCreate, GuestConvertIn, ...)
```
2. 在 `list_users` 函数后新增：

```python
@router.post("/users", response_model=AdminCreateUserOut)
def create_guest_user(body: GuestCreate, admin: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    if admin.is_banned:
        raise HTTPException(403, "你已被封禁，无法创建用户")
    if db.query(User).filter(User.nickname == body.nickname).first():
        raise HTTPException(400, "昵称已存在")
    username = body.username
    if username is None:
        for _ in range(16):
            candidate = f"guest_{uuid.uuid4().hex[:10]}"
            if db.query(User).filter(User.username == candidate).first() is None:
                username = candidate
                break
        else:
            raise HTTPException(500, "生成用户名失败")
    elif db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "用户名已存在")
    user = User(username=username,
                password_hash=hash_password(secrets.token_urlsafe(24)),
                nickname=body.nickname, is_admin=False, is_guest=True)
    db.add(user)
    db.flush()
    party = AdventureParty(user_id=user.id, name=f"{body.nickname}的冒险团")
    db.add(party)
    db.flush()
    chars: list[Character] = []
    for item in (body.characters or []):
        validate_job(item.job_name)
        c = Character(user_id=user.id)
        apply_character_payload(c, item)
        c.adventure_party_id = party.id
        db.add(c)
        chars.append(c)
    try:
        db.commit()
    except IntegrityError:  # 并发唯一约束兜底（username/nickname）
        db.rollback()
        raise HTTPException(400, "用户名已存在")
    for c in chars:
        db.refresh(c)
    return AdminCreateUserOut(user=_admin_user_out(db, user),
                              characters=[character_out(c) for c in chars],
                              default_party_id=party.id,
                              default_party_name=party.name)
```

（`IntegrityError` 已由 admin.py 现有导入？未导入——在 `from sqlalchemy import ...` 处补 `from sqlalchemy.exc import IntegrityError`。）

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_guests.py -v`
Expected: 本 Task 8 例 PASS（其余用例因端点未实现仍失败属预期）

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_guests.py
git commit -m "[feat] admin POST /users 创建临时用户（自动用户名+默认冒险团+角色）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: 后端 — `POST /api/admin/users/{uid}/convert` 转正

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_guests.py`

- [ ] **Step 1: 写失败测试（转正）**

在 `tests/test_admin_guests.py` 追加：

```python
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_guests.py -v`
Expected: 新增 3 例 FAIL（端点未注册 → 404）

- [ ] **Step 3: 实现转正端点**

`backend/app/routers/admin.py`（`reset_user_password` 后）：

```python
@router.post("/users/{uid}/convert", response_model=AdminUserOut)
def convert_guest_user(uid: int, body: GuestConvertIn,
                       admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = _user_or_404(db, uid)
    if not target.is_guest:
        raise HTTPException(400, "该用户不是临时用户")
    if db.query(User).filter(User.username == body.username,
                             User.id != target.id).first():
        raise HTTPException(400, "用户名已存在")
    target.username = body.username
    target.password_hash = hash_password(body.password)
    target.is_guest = False
    db.commit()
    db.refresh(target)
    return _admin_user_out(db, target)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_guests.py -v`
Expected: 本 Task 3 例 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_guests.py
git commit -m "[feat] admin POST /users/{uid}/convert 临时用户转正（设账号密码+清标记）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 后端 — `DELETE /api/admin/users/{uid}` 删除临时用户

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_guests.py`

- [ ] **Step 1: 写失败测试（删除 + e2e）**

在 `tests/test_admin_guests.py` 追加：

```python
def test_delete_guest_cleans_all(client, admin_headers, db):
    g = client.post("/api/admin/users", headers=admin_headers, json={
        "nickname": "删除甲", "characters": [_char()]}).json()
    uid, cid = g["user"]["id"], g["characters"][0]["id"]
    raid = make_raid(client, admin_headers)
    rid = raid["id"]
    # 代报名 + 占位
    assert client.post(f"/api/raids/{rid}/signups", headers=admin_headers,
                       json={"user_id": uid}).status_code == 200
    slot_id = raid["waves"][0]["slots"][0]["id"]
    assert client.post(f"/api/raids/{rid}/slots/{slot_id}/fill", headers=admin_headers,
                       json={"character_id": cid}).status_code == 200
    r = client.delete(f"/api/admin/users/{uid}", headers=admin_headers)
    assert r.status_code == 200
    assert db.get(User, uid) is None
    assert db.query(Character).filter(Character.user_id == uid).count() == 0
    assert db.query(AdventureParty).filter(AdventureParty.user_id == uid).count() == 0
    assert db.query(RaidSignup).filter(RaidSignup.user_id == uid).count() == 0
    # 占位被撤
    detail = client.get(f"/api/raids/{rid}", headers=admin_headers).json()
    assert detail["waves"][0]["slots"][0]["character_id"] is None


def test_delete_non_guest_rejected(client, admin_headers):
    _, u = register_user(client, "normal2", "普通乙")
    r = client.delete(f"/api/admin/users/{u['id']}", headers=admin_headers)
    assert r.status_code == 400 and r.json()["detail"] == "仅可删除临时用户"


def test_guest_e2e_create_signup_place(client, admin_headers):
    g = client.post("/api/admin/users", headers=admin_headers, json={
        "nickname": "外援", "characters": [_char()]}).json()
    uid, cid = g["user"]["id"], g["characters"][0]["id"]
    raid = make_raid(client, admin_headers)
    rid = raid["id"]
    assert client.post(f"/api/raids/{rid}/signups", headers=admin_headers,
                       json={"user_id": uid}).status_code == 200
    slot_id = raid["waves"][0]["slots"][0]["id"]
    r = client.post(f"/api/raids/{rid}/slots/{slot_id}/fill", headers=admin_headers,
                    json={"character_id": cid})
    assert r.status_code == 200
    assert r.json()["slot"]["owner_nickname"] == "外援"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_guests.py -v`
Expected: 新增 3 例 FAIL（端点未注册 → 404）

- [ ] **Step 3: 实现删除端点**

`backend/app/routers/admin.py`：
1. import 追加 `from ..routers.raids import _remove_signup`
2. 端点（`convert_guest_user` 后）：

```python
@router.delete("/users/{uid}")
async def delete_guest_user(uid: int, admin: User = Depends(require_admin),
                            db: Session = Depends(get_db)):
    target = _user_or_404(db, uid)
    if not target.is_guest:
        raise HTTPException(400, "仅可删除临时用户")
    # 1) 逐 raid 撤占位 + 删报名行（_remove_signup 各自 commit + 广播，对齐 cancel_other）
    raid_ids = [rs.raid_id for rs in db.query(RaidSignup)
                .filter(RaidSignup.user_id == uid).all()]
    for rid in raid_ids:
        raid = db.get(Raid, rid)
        if raid is not None:
            await _remove_signup(db, raid, uid)
    # 2-4) 删角色 → 删冒险团 → 删用户（单事务）
    db.query(Character).filter(Character.user_id == uid).delete()
    db.query(AdventureParty).filter(AdventureParty.user_id == uid).delete()
    db.delete(target)
    db.commit()
    return {"ok": True}
```

注意：该端点是 admin.py 第一个 `async def`（需 `await _remove_signup`）。

- [ ] **Step 4: 运行确认通过（全量 guest 测试）**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_guests.py -v`
Expected: 全部 PASS（14 例：创建 8 + 转正 3 + 删除/e2e 3）

- [ ] **Step 5: 回归相关既有测试**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py tests/test_raid_signup.py -q`
Expected: PASS（`UserOut.is_guest` 默认值不破坏既有断言）

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_guests.py
git commit -m "[feat] admin DELETE /users/{uid} 删除临时用户（撤占位/删报名/删角色/删团）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: 前端 — `User.is_guest` 类型 + 全部 fixture

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/views/AdminUsersView.vue`（`openOwner` 占位 User）
- Modify（fixture 补 `is_guest: false`）：`frontend/src/views/AdminUsersView.spec.ts`、`frontend/src/views/RaidDetailView.spec.ts`、`frontend/src/views/RaidListView.spec.ts`、`frontend/src/views/RosterView.spec.ts`、`frontend/src/stores/raid.spec.ts`、`frontend/src/components/MemberCharactersModal.spec.ts`、`frontend/src/components/RosterPool.spec.ts`、`frontend/src/components/AdminUserCharactersModal.spec.ts`、`frontend/src/components/AdminResetPasswordModal.spec.ts`

- [ ] **Step 1: types.ts 加字段**

`frontend/src/types.ts` 第 4 行：

```typescript
export interface User { id: number; username: string; nickname: string; is_admin: boolean; avatar: string | null; is_banned: boolean; is_guest: boolean }
```

- [ ] **Step 2: 修 AdminUsersView.vue 的占位 User**

`AdminUsersView.vue` `openOwner()`（约 89-92 行）对象补 `is_guest: false`。

- [ ] **Step 3: 全部 User 字面量 fixture 补 `is_guest: false`**

对所有含 `is_banned` 的 User 字面量（见上方 Files 清单）补 `is_guest: false`。用 `npm run build`（vue-tsc）驱赶遗漏。

- [ ] **Step 4: 类型/构建验证**

Run: `cd frontend && npm run build`
Expected: 无类型错误（vue-tsc 通过）

- [ ] **Step 5: 既有前端测试回归**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts src/views/RaidDetailView.spec.ts src/views/RosterView.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/views frontend/src/stores/raid.spec.ts frontend/src/components
git commit -m "[ref] User 类型补必填 is_guest 并修全部字面量 fixture
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: 前端 — `GuestCreateModal` + spec

**Files:**
- Create: `frontend/src/components/GuestCreateModal.vue`
- Create: `frontend/src/components/GuestCreateModal.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/GuestCreateModal.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GuestCreateModal from './GuestCreateModal.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { post: vi.fn(), getJobs: vi.fn() },
  notifyMock: { notifyError: vi.fn(), notifySuccess: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => notifyMock)

const jobs = [{ id: 1, name: 'swordman_male', title: '鬼剑士(男)', children: [
  { id: 11, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' as const }] }]

function mountModal(props: Record<string, unknown> = {}) {
  return mount(GuestCreateModal, {
    props: { open: true, requireCharacter: false, ...props },
    global: { stubs: { teleport: true } },
  })
}

describe('GuestCreateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.getJobs.mockResolvedValue(jobs)
  })
  it('requireCharacter 时无角色不可提交', async () => {
    const w = mountModal({ requireCharacter: true })
    await flushPromises()
    await w.find('[data-field="nickname"]').setValue('来客')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('请至少添加一个角色')
  })
  it('昵称为空不可提交', async () => {
    const w = mountModal()
    await flushPromises()
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('请填写昵称')
  })
  it('创建成功调用 POST 并 emit created', async () => {
    const res = { user: { id: 5, username: 'guest_x', nickname: '来客', is_admin: false, avatar: null, is_banned: false, is_guest: true },
      characters: [{}], default_party_id: 1, default_party_name: '来客的冒险团' }
    apiMock.post.mockResolvedValue(res)
    const w = mountModal()
    await flushPromises()
    await w.find('[data-field="nickname"]').setValue('来客')
    await w.find('[data-act="add-row"]').trigger('click')
    const row = w.find('[data-test="guest-row-0"]')
    await row.find('[data-field="char-name"]').setValue('剑魂')
    await row.find('[data-field="job"]').setValue('weapon_master')
    await flushPromises()
    await row.find('[data-field="fame"]').setValue('100')
    await row.find('[data-field="damage"]').setValue('2000')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    const body = apiMock.post.mock.calls[0][1] as any
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users', expect.anything())
    expect(body.nickname).toBe('来客')
    expect(body.characters[0]).toMatchObject({
      name: '剑魂', job_name: 'weapon_master', fame: 100, simulated_damage: 2000,
    })
    expect(w.emitted('created')).toBeTruthy()
  })
  it('创建失败提示 notifyError', async () => {
    apiMock.post.mockRejectedValue(new Error('昵称已存在'))
    const w = mountModal()
    await flushPromises()
    await w.find('[data-field="nickname"]').setValue('来客')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(notifyMock.notifyError).toHaveBeenCalledWith('昵称已存在')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/GuestCreateModal.spec.ts`
Expected: FAIL（找不到模块）

- [ ] **Step 3: 实现组件**

`frontend/src/components/GuestCreateModal.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { jobGenderTitle } from '../lib/job'
import { notifyError, notifySuccess } from '../lib/notify'
import type { JobCategory, User } from '../types'

const props = defineProps<{ open: boolean; requireCharacter: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'created', user: User, characterCount: number): void }>()

interface Row {
  name: string; job_name: string; fame: number | null
  damage: number | null; dps: number | null; buff: number | null; sun: number | null
}

const nickname = ref('')
const username = ref('')
const rows = ref<Row[]>([])
const categories = ref<JobCategory[]>([])
const flatJobs = computed(() => categories.value.flatMap((c) => c.children))
const error = ref('')
const saving = ref(false)

watch(() => props.open, (o) => {
  if (o) { nickname.value = ''; username.value = ''; rows.value = []; error.value = ''; saving.value = false }
})
onMounted(() => { void api.getJobs().then((j) => { categories.value = j }).catch(() => {}) })

function addRow() {
  rows.value.push({ name: '', job_name: '', fame: null, damage: null, dps: null, buff: null, sun: null })
}
function removeRow(i: number) { rows.value.splice(i, 1) }
function jobOf(name: string) { return flatJobs.value.find((j) => j.name === name) ?? null }

async function submit() {
  if (saving.value) return
  error.value = ''
  if (!nickname.value.trim()) { error.value = '请填写昵称'; return }
  if (props.requireCharacter && rows.value.length === 0) { error.value = '请至少添加一个角色'; return }
  if (rows.value.some((r) => !r.name.trim() || !r.job_name)) { error.value = '角色名与职业不能为空'; return }
  saving.value = true
  try {
    const res = await api.post<{ user: User; characters: unknown[] }>(
      '/api/admin/users', {
        nickname: nickname.value.trim(),
        username: username.value.trim() || undefined,
        characters: rows.value.map((r) => {
          const job = jobOf(r.job_name)!
          return {
            name: r.name.trim(), job_name: job.name, fame: Number(r.fame) || 0,
            simulated_damage: job.class_type === '输出' ? r.damage : null,
            sustained_dps: job.class_type === '输出' ? r.dps : null,
            buff_amount: job.class_type === '辅助' ? r.buff : null,
            sun_buff: job.class_type === '辅助' ? r.sun : null,
          }
        }),
      })
    notifySuccess('临时用户已创建')
    emit('created', res.user, res.characters.length)
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { saving.value = false }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="添加临时选手" style="width:min(520px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="color:var(--dnf-text-muted);font-size:12px">
        临时选手无需注册，由管理员代建账号与角色，可直接排表占位
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">昵称 *</div>
        <input v-model="nickname" class="dnf-input" data-field="nickname" placeholder="对方常用称呼" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">用户名（可选）</div>
        <input v-model="username" class="dnf-input" data-field="username" placeholder="留空则自动生成" />
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="color:var(--dnf-text-muted);font-size:12px">角色</span>
          <button type="button" class="dnf-btn dnf-btn-sm" data-act="add-row" @click="addRow">＋ 添加角色</button>
        </div>
        <div v-for="(r, i) in rows" :key="i" class="guest-row" :data-test="`guest-row-${i}`">
          <input v-model="r.name" class="dnf-input" data-field="char-name" placeholder="角色名" style="flex:1;min-width:90px" />
          <select v-model="r.job_name" class="dnf-select" data-field="job" style="max-width:140px">
            <option value="">选择职业</option>
            <option v-for="j in flatJobs" :key="j.name" :value="j.name">{{ jobGenderTitle(j.name, j.title) }}</option>
          </select>
          <input v-model.number="r.fame" type="number" class="dnf-input" data-field="fame" placeholder="名望" style="width:80px" />
          <template v-if="jobOf(r.job_name)?.class_type === '输出'">
            <input v-model.number="r.damage" type="number" class="dnf-input" data-field="damage" placeholder="模拟伤害(亿)" style="width:100px" />
            <input v-model.number="r.dps" type="number" class="dnf-input" data-field="dps" placeholder="秒伤(亿)" style="width:100px" />
          </template>
          <template v-else-if="jobOf(r.job_name)?.class_type === '辅助'">
            <input v-model.number="r.buff" type="number" class="dnf-input" data-field="buff" placeholder="增益量" style="width:90px" />
            <input v-model.number="r.sun" type="number" class="dnf-input" data-field="sun" placeholder="太阳" style="width:90px" />
          </template>
          <button type="button" class="dnf-btn dnf-btn-sm dnf-btn-danger" data-act="remove-row" @click="removeRow(i)">×</button>
        </div>
        <p v-if="props.requireCharacter && !rows.length" style="color:var(--dnf-text-faint);font-size:12px;margin:4px 0 0">
          排表占位需要至少一个角色
        </p>
      </div>
      <p v-if="error" class="form-error" style="margin:0">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-act="submit" :disabled="saving"
              @click="submit">{{ saving ? '创建中…' : '创建' }}</button>
    </div>
  </n-modal>
</template>

<style scoped>
.guest-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/GuestCreateModal.spec.ts`
Expected: 4 例 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GuestCreateModal.vue frontend/src/components/GuestCreateModal.spec.ts
git commit -m "[feat] GuestCreateModal 创建临时用户弹窗（昵称/用户名/多行角色）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: 前端 — `GuestConvertModal` + spec

**Files:**
- Create: `frontend/src/components/GuestConvertModal.vue`
- Create: `frontend/src/components/GuestConvertModal.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/GuestConvertModal.spec.ts`（镜像 AdminResetPasswordModal.spec）：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GuestConvertModal from './GuestConvertModal.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { post: vi.fn() },
  notifyMock: { notifyError: vi.fn(), notifySuccess: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => notifyMock)

const user = { id: 7, username: 'guest_abc', nickname: '来客', is_admin: false, avatar: null, is_banned: false, is_guest: true }

describe('GuestConvertModal', () => {
  beforeEach(() => vi.clearAllMocks())
  it('用户名为空不可提交', async () => {
    const w = mount(GuestConvertModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="username"]').setValue('')
    await w.find('[data-field="password"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('请填写用户名')
  })
  it('两次密码不一致报错不调接口', async () => {
    const w = mount(GuestConvertModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="username"]').setValue('real1')
    await w.find('[data-field="password"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdefg')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('两次输入的密码不一致')
  })
  it('提交成功调用 POST convert 并 emit close', async () => {
    apiMock.post.mockResolvedValue({})
    const w = mount(GuestConvertModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="username"]').setValue('real1')
    await w.find('[data-field="password"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/7/convert', { username: 'real1', password: 'abcdef' })
    expect(notifyMock.notifySuccess).toHaveBeenCalled()
    expect(w.emitted('close')).toBeTruthy()
  })
  it('提交失败提示 notifyError 不 emit close', async () => {
    apiMock.post.mockRejectedValue(new Error('该用户不是临时用户'))
    const w = mount(GuestConvertModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="username"]').setValue('real1')
    await w.find('[data-field="password"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(notifyMock.notifyError).toHaveBeenCalledWith('该用户不是临时用户')
    expect(w.emitted('close')).toBeFalsy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/GuestConvertModal.spec.ts`
Expected: FAIL（找不到模块）

- [ ] **Step 3: 实现组件**

`frontend/src/components/GuestConvertModal.vue`（镜像 AdminResetPasswordModal + username 字段）：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { validatePassword } from '../utils/password'
import { notifyError, notifySuccess } from '../lib/notify'
import type { User } from '../types'

const props = defineProps<{ open: boolean; user: User | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const username = ref('')
const password = ref('')
const confirmPw = ref('')
const error = ref('')
const saving = ref(false)

watch(() => props.open, (o) => {
  if (o) { username.value = ''; password.value = ''; confirmPw.value = ''; error.value = ''; saving.value = false }
})

async function submit() {
  if (saving.value) return
  if (!props.user) return
  error.value = ''
  if (!username.value.trim()) { error.value = '请填写用户名'; return }
  const err = validatePassword(password.value)
  if (err) { error.value = err; return }
  if (password.value !== confirmPw.value) { error.value = '两次输入的密码不一致'; return }
  saving.value = true
  try {
    await api.post(`/api/admin/users/${props.user.id}/convert`,
                   { username: username.value.trim(), password: password.value })
    notifySuccess('已转正，该用户可自行登录')
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { saving.value = false }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="临时用户转正" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="color:var(--dnf-text-muted);font-size:12px">
        为 {{ props.user?.nickname }}（{{ props.user?.username }}）设置用户名与密码，转正后可自行登录
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">用户名</div>
        <input v-model="username" class="dnf-input" data-field="username" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">密码</div>
        <input v-model="password" type="password" class="dnf-input" data-field="password" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">确认密码</div>
        <input v-model="confirmPw" type="password" class="dnf-input" data-field="confirm-pw"
               @keyup.enter="submit" />
      </div>
      <p v-if="error" class="form-error" style="margin:0">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-act="submit" :disabled="saving"
              @click="submit">{{ saving ? '转正中…' : '确认转正' }}</button>
    </div>
  </n-modal>
</template>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/GuestConvertModal.spec.ts`
Expected: 4 例 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GuestConvertModal.vue frontend/src/components/GuestConvertModal.spec.ts
git commit -m "[feat] GuestConvertModal 临时用户转正弹窗（用户名+密码）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: 前端 — AdminUsersView（徽章/添加/转正/删除）

**Files:**
- Modify: `frontend/src/views/AdminUsersView.vue`
- Test: `frontend/src/views/AdminUsersView.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `AdminUsersView.spec.ts` 追加（users 数组需含一个 guest；先给基础 `users` 加 `is_guest: false`，另加 guest 行）：

```ts
const guestUsers = [{ id: 3, username: 'guest_x', nickname: '外援', is_admin: false, avatar: null,
  is_banned: false, is_guest: true, character_count: 2 }]

it('临时用户显示徽章与转正/删除操作', async () => {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/api/admin/users') return Promise.resolve([...users, ...guestUsers])
    if (url.startsWith('/api/admin/characters/query')) return Promise.resolve(query)
    return Promise.resolve([])
  })
  const wrapper = mount(AdminUsersView, {
    global: { stubs: { AdminNav: true, AdminUserCharactersModal: true, AdminResetPasswordModal: true, GuestCreateModal: true, GuestConvertModal: true } },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('外援')
  expect(wrapper.text()).toContain('临时')
  expect(wrapper.find('[data-act="convert-3"]').exists()).toBe(true)
  expect(wrapper.find('[data-act="delete-guest-3"]').exists()).toBe(true)
})

it('添加临时用户按钮打开创建弹窗', async () => {
  const wrapper = mount(AdminUsersView, {
    global: { stubs: { AdminNav: true, AdminUserCharactersModal: true, AdminResetPasswordModal: true, GuestCreateModal: true, GuestConvertModal: true } },
  })
  await flushPromises()
  await wrapper.find('[data-act="add-guest"]').trigger('click')
  expect(wrapper.findComponent({ name: 'GuestCreateModal' }).exists()).toBe(true)
})

it('删除临时用户调用 DELETE 并刷新', async () => {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/api/admin/users') return Promise.resolve([...users, ...guestUsers])
    if (url.startsWith('/api/admin/characters/query')) return Promise.resolve(query)
    return Promise.resolve([])
  })
  apiMock.del.mockResolvedValue({})
  const wrapper = mount(AdminUsersView, {
    global: { stubs: { AdminNav: true, AdminUserCharactersModal: true, AdminResetPasswordModal: true, GuestCreateModal: true, GuestConvertModal: true } },
  })
  await flushPromises()
  await wrapper.find('[data-act="delete-guest-3"]').trigger('click')
  await flushPromises()
  expect(confirmDialog).toHaveBeenCalled()
  expect(apiMock.del).toHaveBeenCalledWith('/api/admin/users/3')
})

it('转正按钮打开转正弹窗', async () => {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/api/admin/users') return Promise.resolve([...users, ...guestUsers])
    if (url.startsWith('/api/admin/characters/query')) return Promise.resolve(query)
    return Promise.resolve([])
  })
  const wrapper = mount(AdminUsersView, {
    global: { stubs: { AdminNav: true, AdminUserCharactersModal: true, AdminResetPasswordModal: true, GuestCreateModal: true, GuestConvertModal: true } },
  })
  await flushPromises()
  await wrapper.find('[data-act="convert-3"]').trigger('click')
  expect(wrapper.findComponent({ name: 'GuestConvertModal' }).exists()).toBe(true)
})
```

同时给基础 `users` fixture 补 `is_guest: false`（Task 6 已要求）。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: 新增 4 例 FAIL（按钮不存在）

- [ ] **Step 3: 实现视图改动**

`AdminUsersView.vue`：
1. import 追加：

```ts
import GuestCreateModal from '../components/GuestCreateModal.vue'
import GuestConvertModal from '../components/GuestConvertModal.vue'
```

2. script 追加状态与处理：

```ts
const guestOpen = ref(false)
const convertOpen = ref(false)
const convertUser = ref<User | null>(null)
function openConvert(u: AdminUser) { convertUser.value = u; convertOpen.value = true }
async function onDeleteGuest(u: AdminUser) {
  const ok = await confirmDialog({ content: `确认删除临时用户 ${u.nickname}？将撤下其全部占位并删除其角色` })
  if (!ok) return
  try { await api.del(`/api/admin/users/${u.id}`); notifySuccess('已删除'); await loadUsers() }
  catch (e: any) { notifyError(e.message) }
}
function onGuestClose() { guestOpen.value = false; loadUsers() }
function onConvertClose() { convertOpen.value = false; loadUsers() }
```

3. 模板「用户列表」工具行（搜索按钮后）加：

```html
<button class="dnf-btn dnf-btn-sm dnf-btn-primary" data-act="add-guest" @click="guestOpen = true">＋ 添加临时用户</button>
```

4. 昵称单元格加徽章：

```html
<td>{{ u.nickname }}<span v-if="u.is_guest" class="dnf-badge" style="margin-left:6px">临时</span></td>
```

5. 操作单元格（`<template v-if="!u.is_admin">` 前）加 guest 专属操作：

```html
<template v-if="u.is_guest">
  <button class="dnf-btn dnf-btn-sm" :data-act="'convert-' + u.id" @click="openConvert(u)">转正</button>
  <button class="dnf-btn dnf-btn-sm dnf-btn-danger" :data-act="'delete-guest-' + u.id"
          @click="onDeleteGuest(u)">删除</button>
</template>
```

6. 模板底部加弹窗：

```html
<GuestCreateModal v-if="guestOpen" :open="guestOpen" :require-character="false"
                  @close="onGuestClose" @created="onGuestClose" />
<GuestConvertModal v-if="convertOpen" :open="convertOpen" :user="convertUser"
                   @close="onConvertClose" />
```

（`@created="onGuestClose"` 直接复用关闭+刷新即可。）

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: 全部 PASS（含既有 + 新增 4 例）

- [ ] **Step 5: 类型/构建验证**

Run: `cd frontend && npm run build`
Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/AdminUsersView.vue frontend/src/views/AdminUsersView.spec.ts
git commit -m "[feat] AdminUsersView 临时用户：徽章/添加/转正/删除
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: 前端 — RaidDetailView（添加临时选手 + 代报名 + 临时徽章）

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`
- Test: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: 写失败测试**

`RaidDetailView.spec.ts` 的 `mountView` 签名为 `mountView(signups, user: User = admin, snapshot = makeRaid(signups))`，返回 `{ wrapper, auth, store }`。先在其 `mountView` 的 `stubs` 列表加 `GuestCreateModal: { name: 'GuestCreateModal', template: '<div />' }`（仅 `guestOpen` 时渲染，不影响既有用例）。类型 import 若缺 `RaidSignup` 则补。然后追加：

```ts
it('管理员添加临时选手并代报名', async () => {
  apiMock.post.mockResolvedValue({})
  const { wrapper } = await mountView([], admin, makeRaid([]))
  await flushPromises()
  await wrapper.find('[data-test="add-guest"]').trigger('click')
  const guest = { id: 55, username: 'guest_x', nickname: '外援', is_admin: false,
    avatar: null, is_banned: false, is_guest: true }
  wrapper.findComponent({ name: 'GuestCreateModal' }).vm.$emit('created', guest, 1)
  await flushPromises()
  expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/signups', { user_id: 55 })
})

it('已锁定攻坚不显示添加临时选手入口', async () => {
  const snapshot = makeRaid([])
  snapshot.locked = true
  const { wrapper } = await mountView([], admin, snapshot)
  await flushPromises()
  expect(wrapper.find('[data-test="add-guest"]').exists()).toBe(false)
})

it('报名面板临时用户显示临时徽章', async () => {
  const guestSignup: RaidSignup = {
    user: { id: 55, username: 'guest_x', nickname: '外援', is_admin: false,
      avatar: null, is_banned: false, is_guest: true },
    created_at: '2026-10-01T00:00:00', characters: [],
  }
  const { wrapper } = await mountView([guestSignup], admin, makeRaid([guestSignup]))
  await flushPromises()
  // 徽章断言收窄到报名行内，避免被「添加临时选手」按钮自身的“临时”二字误判
  expect(wrapper.find('.signup-group').text()).toContain('外援')
  expect(wrapper.find('.signup-group .dnf-badge').text()).toContain('临时')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: 新增 3 例 FAIL

- [ ] **Step 3: 实现视图改动**

`RaidDetailView.vue`：
1. import 追加 `import GuestCreateModal from '../components/GuestCreateModal.vue'`。
2. script 状态与处理：

```ts
const guestOpen = ref(false)
async function onGuestCreated(u: User, charCount: number) {
  guestOpen.value = false
  if (!store.raid) return
  if (charCount === 0) {
    notifyWarning('已创建临时用户，但未填角色，请先在角色管理添加角色后再代报名')
    return
  }
  try {
    await api.post(`/api/raids/${store.raid.id}/signups`, { user_id: u.id })
    notifySuccess('已代报名')
    await load()
  } catch (e: any) { notifyError(e.message) }
}
```

（`notifyWarning` 已在导入清单中。）

3. 模板「已报名」工具行（`signup-plus` 按钮旁）加：

```html
<button v-if="auth.isAdmin && !store.raid.locked" class="dnf-btn dnf-btn-sm"
        data-test="add-guest" @click="guestOpen = true">添加临时选手</button>
```

4. 报名面板 guest 昵称后加徽章（`.signup-group` 内 `signup-nick` 后）：

```html
<span v-if="s.user.is_guest" class="dnf-badge" style="margin-left:4px">临时</span>
```

5. 模板底部（其他 modal 旁）加：

```html
<GuestCreateModal v-if="guestOpen" :open="guestOpen" :require-character="true"
                  @close="guestOpen = false" @created="onGuestCreated" />
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: 类型/构建验证**

Run: `cd frontend && npm run build`
Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/RaidDetailView.vue frontend/src/views/RaidDetailView.spec.ts
git commit -m "[feat] RaidDetailView 添加临时选手（创建+代报名）+ 报名面板临时徽章
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: 前端 — RosterView（RosterPool 工具栏插槽 + 添加临时选手）

**Files:**
- Modify: `frontend/src/components/RosterPool.vue`
- Modify: `frontend/src/views/RosterView.vue`
- Test: `frontend/src/views/RosterView.spec.ts`

- [ ] **Step 1: 写失败测试**

`RosterView.spec.ts` 的 `mountView` 签名为 `mountView(signups, user: User = admin, snapshot = makeRaid(signups))`，返回 `{ wrapper, auth, store }`（**无 `mountRoster`**）。先在其 `mountView` 的 `stubs` 列表加 `GuestCreateModal: { name: 'GuestCreateModal', template: '<div />' }`（RosterView 用真实 RosterPool，按钮经其 `#toolbar-extra` 插槽渲染；`findComponent({name})` 命中 stub 后 `$emit('created')` 走联动）。然后追加：

```ts
it('编队池工具栏添加临时选手并代报名', async () => {
  apiMock.post.mockResolvedValue({})
  const { wrapper } = await mountView([], admin)
  await flushPromises()
  await wrapper.find('[data-test="add-guest"]').trigger('click')
  const guest = { id: 66, username: 'guest_y', nickname: '编队外援', is_admin: false,
    avatar: null, is_banned: false, is_guest: true }
  wrapper.findComponent({ name: 'GuestCreateModal' }).vm.$emit('created', guest, 1)
  await flushPromises()
  expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/signups', { user_id: 66 })
})

it('非管理员不显示编队添加临时选手入口', async () => {
  const { wrapper } = await mountView([], member)
  await flushPromises()
  expect(wrapper.find('[data-test="add-guest"]').exists()).toBe(false)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts`
Expected: 新增 2 例 FAIL

- [ ] **Step 3: RosterPool 加工具栏插槽 + guest 临时徽章**

`RosterPool.vue`：
1. 工具栏 div（`pool-collapse-all` 按钮后）加：

```html
<slot name="toolbar-extra" />
```

2. `.pool-user-head` 昵称后加临时徽章（spec §4 要求编队池也标「临时」）：

```html
<span style="color:var(--dnf-text-muted,#9aa3b2);width:12px;display:inline-block">
  {{ collapsed.has(g.user.id) ? '▸' : '▾' }}
</span>{{ g.user.nickname }}<span v-if="g.user.is_guest" class="dnf-badge" style="margin-left:6px">临时</span>
```

3. `RosterPool.spec.ts` 的 `u1`/`u2` fixture 补 `is_guest: false`（Task 6），并追加徽章用例：

```ts
it('guest 用户在组头显示临时徽章', () => {
  const w = mountPool({ signups: [{ user: { ...u1, is_guest: true }, created_at: null, characters: [c1, c2] }] })
  expect(w.find('[data-user-id="1"]').text()).toContain('临时')
})
```

- [ ] **Step 4: RosterView 加按钮与联动**

`RosterView.vue`：
1. import 追加 `GuestCreateModal`，类型 import 加 `User`。
2. script 状态与处理（同 RaidDetailView 逻辑）：

```ts
const guestOpen = ref(false)
async function onGuestCreated(u: User, charCount: number) {
  guestOpen.value = false
  if (!store.raid) return
  if (charCount === 0) {
    notifyWarning('已创建临时用户，但未填角色，请先在角色管理添加角色后再代报名')
    return
  }
  try {
    await api.post(`/api/raids/${store.raid.id}/signups`, { user_id: u.id })
    notifySuccess('已代报名')
    await load()
  } catch (e: any) { notifyError(e.message) }
}
```

（`notifyWarning` 已在导入清单；`load()` 已存在。）

3. 模板 `<RosterPool ...>` 标签内加插槽内容（仅管理员且未锁定）：

```html
<RosterPool ...>
  <template #toolbar-extra>
    <button v-if="canEdit && !store.raid.locked" class="dnf-btn dnf-btn-sm"
            data-test="add-guest" @click="guestOpen = true">＋临时</button>
  </template>
</RosterPool>
```

4. 模板底部（`RosterTargetModal` 旁）加：

```html
<GuestCreateModal v-if="guestOpen" :open="guestOpen" :require-character="true"
                  @close="guestOpen = false" @created="onGuestCreated" />
```

- [ ] **Step 5: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts src/components/RosterPool.spec.ts`
Expected: 全部 PASS（RosterPool 既有 10 例不受插槽影响）

- [ ] **Step 6: 类型/构建验证**

Run: `cd frontend && npm run build`
Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/RosterPool.vue frontend/src/views/RosterView.vue frontend/src/views/RosterView.spec.ts
git commit -m "[feat] 编队页添加临时选手（RosterPool 工具栏插槽 + 代报名）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 收尾

- [ ] **全量回归**：后端 `cd backend && .venv/bin/python -m pytest -q`；前端 `cd frontend && npx vitest run` + `npm run build`。全部通过后提交收尾（如有遗漏修改）。
