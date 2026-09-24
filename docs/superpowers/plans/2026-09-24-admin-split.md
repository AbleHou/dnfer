# 管理功能拆分 + 用户管理增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把管理面板拆成邀请码/用户管理/副本管理三页，用户管理支持搜索、按玩家增改删角色、封禁/解封，并提供跨玩家角色富查询（按职业/输出辅助/关键词/玩家筛选，按名望/模拟/增益/持续输出/角色名排序）。

**Architecture:** 后端新建 `routers/admin.py` 收敛 `/api/admin/*` 端点（自 `auth.py` 迁入），新增角色查询、按玩家角色 CRUD、封禁/解封端点；`User` 加 `is_banned` 列（软封禁），在报名/排位/替报名/机器人报名处做校验。前端把 `AdminView.vue` 拆为三个视图 + `AdminNav.vue` 子导航，用户管理页内嵌角色查询区与按玩家管理角色弹窗（复用 `CharacterForm`，加 `baseUrl` prop）。

**Tech Stack:** FastAPI / SQLAlchemy 2 / SQLite / Pydantic v2 / Vue 3 `<script setup>` / naive-ui / Vitest / vue-tsc

**前提（已定稿）：** 设计规格 `docs/superpowers/specs/2026-09-24-admin-split-design.md`。

**提交到 main，不做 worktree（仓库既定约定）。** 提交信息用 `[feat]/[fix]/[ref]/[test]/[docs]` + 中文，`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。

**测试命令：**
- 后端：`cd backend && .venv/bin/python -m pytest <file> -v`
- 前端单测：`cd frontend && npx vitest run <file>`
- 前端类型/构建：`cd frontend && npm run build`（= vue-tsc -b && vite build）

---

## 文件结构

**后端新增：**
- `backend/app/services/characters.py` —— 共享角色逻辑：`character_out` / `validate_job` / `apply_character_payload` / `delete_character_if_free`
- `backend/app/routers/admin.py` —— `/api/admin/*` 全部端点（codes 迁移 + users 搜索/封禁 + characters 富查询 + 按玩家角色 CRUD）
- `backend/tests/test_admin_management.py` —— 新功能测试

**后端修改：**
- `backend/app/models.py` —— `User.is_banned`
- `backend/app/migrations.py` —— `migrate_users_ban`
- `backend/app/db.py` —— `init_db()` 注册迁移
- `backend/app/schemas.py` —— `UserOut.is_banned`、`AdminUserOut`、`AdminCharacterRow`、`CharacterQueryResult`
- `backend/app/routers/members.py` —— 改用 services 共享逻辑
- `backend/app/routers/auth.py` —— 移除 admin 端点与相关导入
- `backend/app/routers/raids.py` —— `_character_out` 导入改到 services；加封禁校验
- `backend/app/routers/bot.py` —— `_character_out` 导入改到 services；`bot_signup` 加封禁校验
- `backend/app/main.py` —— 注册 `admin.router`
- `backend/tests/test_migrations.py` —— 补 `is_banned` 迁移测试

**前端新增：**
- `frontend/src/components/AdminNav.vue` —— 三个子导航链接
- `frontend/src/components/AdminUserCharactersModal.vue` —— 按玩家管理角色弹窗
- `frontend/src/views/AdminCodesView.vue` —— 邀请码页（自 AdminView 迁出）
- `frontend/src/views/AdminDungeonsView.vue` —— 副本管理页（自 AdminView 迁出）
- `frontend/src/views/AdminUsersView.vue` —— 用户管理页（角色查询 + 用户列表）
- `frontend/src/views/AdminUsersView.spec.ts`、`frontend/src/components/AdminNav.spec.ts`、`frontend/src/components/CharacterForm.spec.ts`

**前端修改：**
- `frontend/src/types.ts` —— `User.is_banned`、`AdminUser`、`AdminCharacterRow` 类型
- `frontend/src/components/CharacterForm.vue` —— 加 `baseUrl` prop
- `frontend/src/router/index.ts` —— 新增 `/admin/codes|users|dungeons` + `/admin` 重定向
- `frontend/src/views/AdminView.vue` —— **删除**

---

### Task 1: 模型 is_banned + 迁移 + 注册

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/migrations.py`
- Modify: `backend/app/db.py:32-38`
- Test: `backend/tests/test_migrations.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_migrations.py` 末尾追加：

```python
def test_migrate_users_ban_adds_column():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE users (
            id INTEGER PRIMARY KEY, username VARCHAR(64) UNIQUE,
            password_hash VARCHAR(128), nickname VARCHAR(64),
            is_admin BOOLEAN, created_at DATETIME)"""))
    from app.migrations import migrate_users_ban
    migrate_users_ban(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(users)")).all()}
        assert "is_banned" in cols
    migrate_users_ban(engine)  # 幂等：再次运行不报错
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py::test_migrate_users_ban_adds_column -v`
Expected: FAIL（`ImportError: cannot import name 'migrate_users_ban'`）

- [ ] **Step 3: 实现**

`models.py` 的 `User` 加列：
```python
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
```

`migrations.py` 追加：
```python
def migrate_users_ban(engine: Engine) -> None:
    """为存量库补建 users.is_banned 列（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).all()}
        if "is_banned" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT 0"))
```

`db.py:init_db()` 末尾追加调用：
```python
    from .migrations import migrate_avatars, migrate_dungeons, migrate_jobs, migrate_users_ban
    migrate_dungeons(engine)
    migrate_jobs(engine)
    migrate_avatars(engine)
    migrate_users_ban(engine)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: 4 个测试全部 PASS（含幂等）

- [ ] **Step 5: 提交**

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "feat: User.is_banned 列 + 幂等迁移（软封禁数据基础）"
```

---

### Task 2: schemas 新增类型

**Files:**
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/test_smoke.py`

- [ ] **Step 1: 改 schema**

`schemas.py`：
- `UserOut` 加 `is_banned: bool = False`（带默认，避免破坏 `RaidSignupOut`/bot/public 复用点）。
- 追加：
```python
class AdminUserOut(UserOut):
    character_count: int

class AdminCharacterRow(CharacterOut):
    owner_id: int
    owner_nickname: str
    owner_username: str
    owner_is_banned: bool

class CharacterQueryResult(BaseModel):
    items: list[AdminCharacterRow]
    total: int
```

- [ ] **Step 2: 回归验证**

Run: `cd backend && .venv/bin/python -m pytest tests/test_smoke.py tests/test_auth.py -v`
Expected: PASS（is_banned 带默认不破坏既有响应）

- [ ] **Step 3: 提交**

```bash
git add backend/app/schemas.py
git commit -m "feat: schema 增加 is_banned/AdminUserOut/AdminCharacterRow/CharacterQueryResult"
```

---

### Task 3: 抽取共享角色逻辑 + members 复用 + 三处导入更新

**Files:**
- Create: `backend/app/services/characters.py`
- Modify: `backend/app/routers/members.py`
- Modify: `backend/app/routers/raids.py:16,515`
- Modify: `backend/app/routers/bot.py:16,77,82,96`
- Modify: `backend/app/routers/auth.py:15,113`
- Test: `backend/tests/test_members.py`、`backend/tests/test_raids.py`、`backend/tests/test_bot_characters.py`

- [ ] **Step 1: 建共享模块**

创建 `backend/app/services/characters.py`：
```python
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .. import jobs as job_data
from ..models import Character, Slot
from ..schemas import CharacterIn, CharacterOut


def character_out(c: Character) -> CharacterOut:
    meta = job_data.job_meta(c.job_name) or {"title": "", "parent_name": ""}
    return CharacterOut(id=c.id, name=c.name, job_name=c.job_name,
                        job_title=meta["title"], parent_name=meta["parent_name"],
                        class_type=c.class_type, fame=c.fame,
                        simulated_damage=c.simulated_damage,
                        sustained_dps=c.sustained_dps, buff_amount=c.buff_amount)


def validate_job(job_name: str) -> None:
    if job_data.job_meta(job_name) is None:
        raise HTTPException(400, "职业不存在")


def apply_character_payload(c: Character, body: CharacterIn) -> None:
    c.name = body.name
    c.job_name = body.job_name
    c.class_type = job_data.class_type_for(body.job_name)
    c.fame = body.fame
    c.simulated_damage = body.simulated_damage
    c.sustained_dps = body.sustained_dps
    c.buff_amount = body.buff_amount


def delete_character_if_free(db: Session, cid: int) -> None:
    in_use = db.query(Slot).filter(Slot.character_id == cid).first()
    if in_use:
        raise HTTPException(400, "该角色正在攻坚中，请先撤下")
```

- [ ] **Step 2: members.py 改用共享逻辑**

`backend/app/routers/members.py`：
- 删除本地 `_character_out` 与 `_validate_job`。
- 顶部导入：
```python
from ..services.characters import (apply_character_payload, character_out,
                                   delete_character_if_free, validate_job)
```
- `list_characters`：`_character_out(c)` → `character_out(c)`。
- `create_character`：删 `_validate_job(body)` 改 `validate_job(body.job_name)`；删内联字段赋值，改为：
```python
    c = Character(user_id=user.id)
    apply_character_payload(c, body)
```
- `update_character`：`_validate_job(body)` → `validate_job(body.job_name)`；删内联赋值改 `apply_character_payload(c, body)`。
- `delete_character`：删内联占用检查改 `delete_character_if_free(db, cid)`。
- 保留 `_own_character`（含 `HTTPException` 导入仍需保留）。
- 重构后 `job_data` 与 `Slot` 不再被 members.py 使用，删除 `from .. import jobs as job_data` 与 `Slot` 导入；最终导入为：
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..db import get_db
from ..models import Character, User
from ..schemas import CharacterIn, CharacterOut
from ..services.characters import (apply_character_payload, character_out,
                                   delete_character_if_free, validate_job)
```

- [ ] **Step 3: 更新 raids.py / bot.py / auth.py 导入**

- `raids.py:16`：`from ..routers.members import _character_out` → `from ..services.characters import character_out`；`raids.py:515` `_character_out(c)` → `character_out(c)`。
- `bot.py:16`：`from .members import _character_out` → `from ..services.characters import character_out`；`bot.py:77,82,96` 三处 `_character_out(` → `character_out(`。
- `auth.py:15`：`from .members import _character_out` → `from ..services.characters import character_out`；`auth.py:113` `_character_out(c)` → `character_out(c)`。

- [ ] **Step 4: 全量后端回归**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS（纯重构，行为不变）

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/characters.py backend/app/routers/members.py backend/app/routers/raids.py backend/app/routers/bot.py backend/app/routers/auth.py
git commit -m "ref: 抽取共享角色逻辑 services/characters.py，members/raids/bot/auth 复用"
```

---

### Task 4: admin.py 迁移既有端点 + main.py 注册

**Files:**
- Create: `backend/app/routers/admin.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/main.py:15,44`
- Test: `backend/tests/test_auth.py`、`backend/tests/helpers.py`（间接）

- [ ] **Step 1: 建 admin.py（迁入部分）**

创建 `backend/app/routers/admin.py`，先放入迁移自 auth.py 的端点：
```python
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import make_code, require_admin
from ..db import get_db
from ..models import Character, RegistrationCode, User
from ..schemas import (CodeCreate, CodeOut, PlayerCharacters, UserOut)
from ..services.characters import character_out

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.post("/codes", response_model=CodeOut)
def create_code(body: CodeCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rc = make_code(db, admin, body.single_use, body.expire_days)
    db.commit()
    db.refresh(rc)
    return rc

@router.get("/codes", response_model=list[CodeOut])
def list_codes(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(RegistrationCode).order_by(RegistrationCode.id.desc()).limit(100).all()

@router.get("/users", response_model=list[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(User).all()

@router.get("/characters", response_model=list[PlayerCharacters])
def list_all_characters(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    result = []
    for u in db.scalars(select(User).order_by(User.nickname)).all():
        chars = db.scalars(select(Character).where(Character.user_id == u.id)
                           .order_by(Character.id)).all()
        if not chars:
            continue
        result.append(PlayerCharacters(user=UserOut.model_validate(u),
                                       characters=[character_out(c) for c in chars]))
    return result
```

- [ ] **Step 2: 从 auth.py 移除 admin 端点**

`auth.py`：
- 删除 `create_code`、`list_codes`、`list_users`、`list_all_characters` 四个函数。
- 删除不再使用的导入：`from .members import _character_out`（→ 上一任务已改为 services，但此处整段移除）、`CodeCreate`、`CodeOut`、`PlayerCharacters`、`Character`、`RegistrationCode`、`make_code`、`require_admin`。
- 保留 `consume_code`、`create_access_token`、`get_current_user`、`hash_password`、`verify_password`。
- 最终 auth.py 导入应为：
```python
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from .. import s3
from ..auth import (consume_code, create_access_token, get_current_user,
                    hash_password, verify_password)
from ..config import settings
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, ProfileUpdate, RegisterIn, UserOut
```

- [ ] **Step 3: main.py 注册**

`main.py` 导入加 `admin`，`app.include_router(admin.router)`（放在 auth 之后）。

- [ ] **Step 4: 回归验证**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py tests/test_smoke.py tests/test_bot_register.py -v`
Expected: PASS（codes/users/characters URL 不变；helpers.py `register_user` 仍可用）

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/admin.py backend/app/routers/auth.py backend/app/main.py
git commit -m "ref: admin 端点迁入 routers/admin.py，auth.py 回归纯认证"
```

---

### Task 5: 用户列表搜索 + AdminUserOut

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: Create `backend/tests/test_admin_management.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_admin_management.py`：
```python
from app.models import Character, User
from app.auth import hash_password
from .helpers import register_user

def _add_char(db, uid, name="剑魂", job="weapon_master", fame=100, class_type="输出"):
    db.add(Character(user_id=uid, name=name, job_name=job, class_type=class_type,
                     fame=fame, simulated_damage=1000, sustained_dps=None, buff_amount=None))
    db.commit()

def test_admin_users_search_and_counts(client, admin_headers, db):
    h, u = register_user(client, "alice", "阿丽")
    _add_char(db, u["id"], fame=100)
    r = client.get("/api/admin/users", headers=admin_headers)
    assert r.status_code == 200
    alice = next(x for x in r.json() if x["username"] == "alice")
    assert alice["character_count"] == 1
    assert alice["is_banned"] is False
    r2 = client.get("/api/admin/users", params={"q": "阿丽"}, headers=admin_headers)
    assert [x["username"] for x in r2.json()] == ["alice"]
    r3 = client.get("/api/admin/users", params={"q": "不存在的人"}, headers=admin_headers)
    assert r3.json() == []
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py::test_admin_users_search_and_counts -v`
Expected: FAIL（`character_count` KeyError / `is_banned` 缺失 / q 未过滤）

- [ ] **Step 3: 实现**

`admin.py`：
- 顶部导入加 `func`、`or_`、`AdminUserOut`。
- 加 helper：
```python
def _counts(db: Session) -> dict[int, int]:
    return dict(db.query(Character.user_id, func.count(Character.id))
                .group_by(Character.user_id).all())
```
- 替换 `list_users`：
```python
@router.get("/users", response_model=list[AdminUserOut])
def list_users(q: str | None = None, admin: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    query = db.query(User)
    if q:
        query = query.filter(or_(User.nickname.contains(q), User.username.contains(q)))
    users = query.order_by(User.nickname).all()
    counts = _counts(db)
    return [AdminUserOut(character_count=counts.get(u.id, 0),
                         **UserOut.model_validate(u).model_dump()) for u in users]
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py -v`
Expected: PASS

- [ ] **Step 5: 回归 + 提交**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -v`（`SignupMemberPicker` 依赖 `/api/admin/users`，响应加字段不破坏）
Expected: PASS

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_management.py
git commit -m "feat: 用户列表支持 q 搜索并返回 character_count/is_banned"
```

---

### Task 6: 角色富查询 /api/admin/characters/query

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_management.py`

- [ ] **Step 1: 写失败测试**

追加到 `backend/tests/test_admin_management.py`：
```python
def test_query_characters_filters_sorts_paginates(client, admin_headers, db):
    _, u1 = register_user(client, "p1", "玩家一")
    _, u2 = register_user(client, "p2", "玩家二")
    _add_char(db, u1["id"], name="剑魂甲", job="weapon_master", fame=100, class_type="输出")
    _add_char(db, u1["id"], name="奶妈乙", job="crusader_female", fame=200, class_type="辅助")
    db.add(Character(user_id=u2["id"], name="剑魂丙", job="weapon_master",
                     class_type="输出", fame=300, simulated_damage=999,
                     sustained_dps=None, buff_amount=None))
    db.commit()

    # 筛选：职业
    r = client.get("/api/admin/characters/query",
                   params={"job_name": "weapon_master"}, headers=admin_headers)
    assert r.status_code == 200
    assert [i["name"] for i in r.json()["items"]] == ["剑魂丙", "剑魂甲"]  # fame desc
    # 筛选：输出/辅助
    r = client.get("/api/admin/characters/query",
                   params={"class_type": "辅助"}, headers=admin_headers)
    assert [i["name"] for i in r.json()["items"]] == ["奶妈乙"]
    # 筛选：角色名关键词
    r = client.get("/api/admin/characters/query",
                   params={"keyword": "剑魂"}, headers=admin_headers)
    assert r.json()["total"] == 2
    # 筛选：归属玩家
    r = client.get("/api/admin/characters/query",
                   params={"owner": "玩家二"}, headers=admin_headers)
    assert [i["name"] for i in r.json()["items"]] == ["剑魂丙"]
    assert r.json()["items"][0]["owner_nickname"] == "玩家二"
    # 排序：增益量 asc（三个角色 buff_amount 均为 NULL → NULLS LAST 均排后，
    # 靠 Character.id 稳定 tie-break，最后一个是 id 最大的剑魂丙）
    r = client.get("/api/admin/characters/query",
                   params={"sort": "buff_amount", "order": "asc"}, headers=admin_headers)
    names = [i["name"] for i in r.json()["items"]]
    assert names[-1] == "剑魂丙"  # buff_amount NULL 排最后
    # 分页
    r = client.get("/api/admin/characters/query",
                   params={"limit": 2, "offset": 1}, headers=admin_headers)
    assert len(r.json()["items"]) == 2
    assert r.json()["total"] == 3
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py::test_query_characters_filters_sorts_paginates -v`
Expected: FAIL（404 无该端点）

- [ ] **Step 3: 实现**

`admin.py` 顶部导入追加：`Query`、`or_`、`AdminCharacterRow`、`CharacterIn`、`CharacterQueryResult`。加常量与端点：
```python
_SORT_COLS = {
    "fame": Character.fame,
    "simulated_damage": Character.simulated_damage,
    "sustained_dps": Character.sustained_dps,
    "buff_amount": Character.buff_amount,
    "name": Character.name,
}

@router.get("/characters/query", response_model=CharacterQueryResult)
def query_characters(
    job_name: str | None = None,
    class_type: str | None = None,
    keyword: str | None = None,
    owner: str | None = None,
    sort: str = "fame",
    order: str = "desc",
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin), db: Session = Depends(get_db),
):
    if sort not in _SORT_COLS or order not in ("asc", "desc"):
        raise HTTPException(400, "排序参数无效")
    if class_type not in (None, "输出", "辅助"):
        raise HTTPException(400, "职业类别无效")
    q = db.query(Character).join(User, Character.user_id == User.id)
    if job_name:
        q = q.filter(Character.job_name == job_name)
    if class_type:
        q = q.filter(Character.class_type == class_type)
    if keyword:
        q = q.filter(Character.name.contains(keyword))
    if owner:
        q = q.filter(or_(User.nickname.contains(owner), User.username.contains(owner)))
    total = q.count()
    col = _SORT_COLS[sort]
    expr = col.asc() if order == "asc" else col.desc()
    if col is not Character.name:
        expr = expr.nulls_last()
    rows = q.order_by(expr, Character.id.asc()).offset(offset).limit(limit).all()
    items = [
        AdminCharacterRow(**character_out(c).model_dump(),
                          owner_id=c.owner.id, owner_nickname=c.owner.nickname,
                          owner_username=c.owner.username, owner_is_banned=c.owner.is_banned)
        for c in rows
    ]
    return CharacterQueryResult(items=items, total=total)
```
（`HTTPException` 已在 services 导入，但 admin.py 本文件需 `from fastapi import ... HTTPException, Query`。）

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_management.py
git commit -m "feat: 角色富查询 /api/admin/characters/query（职业/输出辅助/关键词/玩家筛选 + 5 种排序 + 分页）"
```

---

### Task 7: 按玩家管理角色 CRUD

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_management.py`

- [ ] **Step 1: 写失败测试**

追加：
```python
def test_admin_user_character_crud(client, admin_headers, db):
    _, u = register_user(client, "p9", "玩家九")
    uid = u["id"]
    # list（空）
    assert client.get(f"/api/admin/users/{uid}/characters",
                      headers=admin_headers).json() == []
    # create
    r = client.post(f"/api/admin/users/{uid}/characters", headers=admin_headers,
                    json={"name": "狂战", "job_name": "berserker", "fame": 150,
                          "simulated_damage": 2000, "sustained_dps": 800, "buff_amount": None})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["class_type"] == "输出"
    # update
    r = client.put(f"/api/admin/users/{uid}/characters/{cid}", headers=admin_headers,
                   json={"name": "狂战改", "job_name": "weapon_master", "fame": 160,
                         "simulated_damage": 2100, "sustained_dps": 850, "buff_amount": None})
    assert r.status_code == 200 and r.json()["name"] == "狂战改"
    # 他人 id 下改该角色 -> 404（归属校验）
    _, other = register_user(client, "p10", "玩家十")
    other_uid = other["id"]
    r = client.put(f"/api/admin/users/{other_uid}/characters/{cid}", headers=admin_headers,
                   json={"name": "越权改", "job_name": "berserker", "fame": 999,
                         "simulated_damage": 1, "sustained_dps": 1, "buff_amount": None})
    assert r.status_code == 404
    assert client.get(f"/api/admin/users/{uid}/characters",
                      headers=admin_headers).json()[0]["name"] == "狂战改"  # 未被改动
    # delete
    r = client.delete(f"/api/admin/users/{uid}/characters/{cid}", headers=admin_headers)
    assert r.status_code == 200
    assert client.get(f"/api/admin/users/{uid}/characters", headers=admin_headers).json() == []
    # 用户不存在 404
    assert client.get("/api/admin/users/99999/characters", headers=admin_headers).status_code == 404
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py::test_admin_user_character_crud -v`
Expected: FAIL（404 无该端点）

- [ ] **Step 3: 实现**

`admin.py` 追加导入 `CharacterIn`、`CharacterOut`，及：
```python
def _user_or_404(db: Session, uid: int) -> User:
    u = db.get(User, uid)
    if u is None:
        raise HTTPException(404, "用户不存在")
    return u

def _user_character_or_404(db: Session, uid: int, cid: int) -> Character:
    c = db.get(Character, cid)
    if c is None or c.user_id != uid:
        raise HTTPException(404, "角色不存在")
    return c

@router.get("/users/{uid}/characters", response_model=list[CharacterOut])
def list_user_characters(uid: int, admin: User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    _user_or_404(db, uid)
    chars = db.query(Character).filter(Character.user_id == uid).order_by(Character.id).all()
    return [character_out(c) for c in chars]

@router.post("/users/{uid}/characters", response_model=CharacterOut)
def create_user_character(uid: int, body: CharacterIn, admin: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    _user_or_404(db, uid)
    validate_job(body.job_name)
    c = Character(user_id=uid)
    apply_character_payload(c, body)
    db.add(c)
    db.commit()
    db.refresh(c)
    return character_out(c)

@router.put("/users/{uid}/characters/{cid}", response_model=CharacterOut)
def update_user_character(uid: int, cid: int, body: CharacterIn,
                          admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = _user_character_or_404(db, uid, cid)
    validate_job(body.job_name)
    apply_character_payload(c, body)
    db.commit()
    db.refresh(c)
    return character_out(c)

@router.delete("/users/{uid}/characters/{cid}")
def delete_user_character(uid: int, cid: int, admin: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    c = _user_character_or_404(db, uid, cid)
    delete_character_if_free(db, cid)
    db.delete(c)
    db.commit()
    return {"ok": True}
```
（需从 `..services.characters` 导入 `apply_character_payload`、`delete_character_if_free`、`validate_job`。）

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_management.py
git commit -m "feat: 管理员按玩家增改删角色（users/{uid}/characters）"
```

---

### Task 8: 封禁/解封端点

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_management.py`

- [ ] **Step 1: 写失败测试**

追加：
```python
def test_ban_unban_user(client, admin_headers, db):
    _, u = register_user(client, "ban1", "被禁玩家")
    uid = u["id"]
    r = client.post(f"/api/admin/users/{uid}/ban", headers=admin_headers)
    assert r.status_code == 200 and r.json()["is_banned"] is True
    # 解封
    r = client.post(f"/api/admin/users/{uid}/unban", headers=admin_headers)
    assert r.status_code == 200 and r.json()["is_banned"] is False
    # 不能封禁管理员
    r = client.post("/api/admin/users/1/ban", headers=admin_headers)
    assert r.status_code == 403
    # 用户不存在
    assert client.post("/api/admin/users/99999/ban", headers=admin_headers).status_code == 404
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py::test_ban_unban_user -v`
Expected: FAIL（404 无该端点）

- [ ] **Step 3: 实现**

`admin.py` 追加（`_user_or_404` 已在 Task 7 定义）：
```python
def _admin_user_out(db: Session, target: User) -> AdminUserOut:
    return AdminUserOut(character_count=db.query(Character)
                        .filter(Character.user_id == target.id).count(),
                        **UserOut.model_validate(target).model_dump())

@router.post("/users/{uid}/ban", response_model=AdminUserOut)
def ban_user(uid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = _user_or_404(db, uid)
    if target.is_admin:
        raise HTTPException(403, "不能封禁管理员")
    if target.id == admin.id:
        raise HTTPException(403, "不能封禁自己")
    target.is_banned = True
    db.commit()
    db.refresh(target)
    return _admin_user_out(db, target)

@router.post("/users/{uid}/unban", response_model=AdminUserOut)
def unban_user(uid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = _user_or_404(db, uid)
    target.is_banned = False
    db.commit()
    db.refresh(target)
    return _admin_user_out(db, target)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_management.py
git commit -m "feat: 封禁/解封端点（软封禁，禁封管理员）"
```

---

### Task 9: raids.py 封禁校验

**Files:**
- Modify: `backend/app/routers/raids.py:130,216-234,414,475`
- Test: `backend/tests/test_raid_signup.py`、`backend/tests/test_admin_management.py`

- [ ] **Step 1: 写失败测试**

追加到 `test_admin_management.py`（用 `register_user` + `helpers.make_raid`）：
```python
from .helpers import make_raid

def test_banned_cannot_signup_or_be_placed(client, admin_headers, db):
    h, u = register_user(client, "bannedA", "被封甲")
    _add_char(db, u["id"], name="剑魂", fame=100)
    raid = make_raid(client, admin_headers)
    rid = raid["id"]
    char_id = db.query(Character).filter(Character.user_id == u["id"]).one().id
    # 先封禁 → 自报名被拒
    client.post(f"/api/admin/users/{u['id']}/ban", headers=admin_headers)
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 403
    # 解封后报名成功，再封禁（封禁保留报名）→ 排表被拒
    client.post(f"/api/admin/users/{u['id']}/unban", headers=admin_headers)
    assert client.post(f"/api/raids/{rid}/signup", headers=h).status_code == 200
    client.post(f"/api/admin/users/{u['id']}/ban", headers=admin_headers)
    slot_id = raid["waves"][0]["slots"][0]["id"]
    r = client.post(f"/api/raids/{rid}/slots/{slot_id}/fill", headers=admin_headers,
                    json={"character_id": char_id})
    assert r.status_code == 403
    # 解封后可正常排
    client.post(f"/api/admin/users/{u['id']}/unban", headers=admin_headers)
    r = client.post(f"/api/raids/{rid}/slots/{slot_id}/fill", headers=admin_headers,
                    json={"character_id": char_id})
    assert r.status_code == 200

def test_banned_admin_signup_blocked(client, admin_headers, db):
    h, u = register_user(client, "bannedB", "被封乙")
    raid = make_raid(client, admin_headers)
    client.post(f"/api/admin/users/{u['id']}/ban", headers=admin_headers)
    r = client.post(f"/api/raids/{raid['id']}/signups", headers=admin_headers,
                    json={"user_id": u["id"]})
    assert r.status_code == 403
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py::test_banned_cannot_signup_or_be_placed tests/test_admin_management.py::test_banned_admin_signup_blocked -v`
Expected: FAIL（报名/排表仍成功）

- [ ] **Step 3: 实现**

`raids.py`：
- `create_raid`（130 行函数体开头）：
```python
    if admin.is_banned:
        raise HTTPException(403, "你已被封禁，无法创建攻坚")
```
- `fill_slot`（`char = db.get(Character, body.character_id)` 与 None 检查之后，`_participates` 之前）：
```python
    if char.owner.is_banned:
        raise HTTPException(403, "该用户已被封禁，无法排表")
```
- `signup`（`raid = _raid_or_404(db, rid)` 之后）：
```python
    if user.is_banned:
        raise HTTPException(403, "你已被封禁，无法报名")
```
- `admin_signup`（`target = db.get(User, body.user_id)` 与 None 检查之后）：
```python
    if target.is_banned:
        raise HTTPException(403, "该用户已被封禁")
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py tests/test_raid_signup.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/raids.py backend/tests/test_admin_management.py
git commit -m "feat: 攻坚报名/排位/替报名/新建 增加软封禁校验"
```

---

### Task 10: bot.py bot_signup 封禁校验

**Files:**
- Modify: `backend/app/routers/bot.py:118-135`
- Test: `backend/tests/test_bot_raid_signup.py`

- [ ] **Step 1: 写失败测试**

追加到 `backend/tests/test_bot_raid_signup.py`（先读该文件确认既有 bot signup 测试写法与 `api_token` header 用法）：
```python
def test_bot_signup_banned_user_blocked(client, admin_headers, db):
    from .helpers import register_user, make_raid
    _, u = register_user(client, "botban", "机器人封禁")
    raid = make_raid(client, admin_headers)
    client.post(f"/api/admin/users/{u['id']}/ban", headers=admin_headers)
    r = client.post(f"/api/public/raids/{raid['id']}/signup",
                    headers={"Authorization": "Bearer change-me-bot-token"},
                    json={"nickname": "机器人封禁"})
    assert r.status_code == 403
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_raid_signup.py::test_bot_signup_banned_user_blocked -v`
Expected: FAIL（报名成功）

- [ ] **Step 3: 实现**

`bot.py` 的 `bot_signup` 中 `user = _get_user(db, body.account, body.nickname)` 之后插入：
```python
    if user.is_banned:
        raise HTTPException(403, "该用户已被封禁")
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_raid_signup.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/bot.py backend/tests/test_bot_raid_signup.py
git commit -m "feat: 机器人替玩家报名拒绝已封禁用户"
```

---

### Task 11: 后端全量回归 + 迁移测试补齐

**Files:**
- Test: 全量

- [ ] **Step 1: 全量运行**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS

- [ ] **Step 2: 提交（若有漏网改动）**

```bash
git status
```

---

### Task 12: 前端类型 + 路由 + AdminNav + 删除 AdminView

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/components/AdminNav.vue`
- Modify: `frontend/src/router/index.ts:13`
- Delete: `frontend/src/views/AdminView.vue`
- Test: `frontend/src/components/AdminNav.spec.ts`

- [ ] **Step 1: 写失败测试（AdminNav）**

创建 `frontend/src/components/AdminNav.spec.ts`（参考 `SignupMemberPicker.spec.ts` 的 mock 模式）：
```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import AdminNav from './AdminNav.vue'

describe('AdminNav', () => {
  it('渲染三个子导航链接', () => {
    const wrapper = mount(AdminNav, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    // RouterLinkStub 把 to 作为 prop 消费，不落成 DOM 属性；用 findAllComponents 读 props('to')
    expect(wrapper.findAll('a').map(a => a.text()))
      .toEqual(['邀请码管理', '用户管理', '副本管理'])
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.map(l => l.props('to'))).toEqual(['/admin/codes', '/admin/users', '/admin/dungeons'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/AdminNav.spec.ts`
Expected: FAIL（AdminNav 不存在）

- [ ] **Step 3: 实现 types + AdminNav + 路由**

`types.ts`：
- `User` 加 `is_banned: boolean`。
- 追加：
```ts
export interface AdminUser extends User { character_count: number }
export interface AdminCharacterRow extends Character {
  owner_id: number; owner_nickname: string; owner_username: string; owner_is_banned: boolean
}
export interface CharacterQueryResult { items: AdminCharacterRow[]; total: number }
```

`components/AdminNav.vue`：
```vue
<script setup lang="ts">
const links = [
  { key: 'codes', label: '邀请码管理', to: '/admin/codes' },
  { key: 'users', label: '用户管理', to: '/admin/users' },
  { key: 'dungeons', label: '副本管理', to: '/admin/dungeons' },
]
</script>

<template>
  <nav class="admin-nav">
    <router-link v-for="l in links" :key="l.key" :data-nav="l.key" :to="l.to"
                 class="admin-nav-link" active-class="active">{{ l.label }}</router-link>
  </nav>
</template>

<style scoped>
.admin-nav { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap }
.admin-nav-link { padding:6px 14px; border:1px solid var(--dnf-border,#3a3f4b);
  border-radius:6px; color:var(--dnf-text-muted,#9aa3b2); text-decoration:none; font-size:14px }
.admin-nav-link.active { color:var(--dnf-accent,#ffd54a); border-color:var(--dnf-accent,#ffd54a) }
</style>
```

`router/index.ts`：
```ts
    { path: '/admin', redirect: '/admin/codes' },
    { path: '/admin/codes', component: () => import('../views/AdminCodesView.vue') },
    { path: '/admin/users', component: () => import('../views/AdminUsersView.vue') },
    { path: '/admin/dungeons', component: () => import('../views/AdminDungeonsView.vue') },
```
（替换原 `/admin` 路由；`App.vue`「管理」链接指向 `/admin` 仍有效。）

- [ ] **Step 4: 删除 AdminView.vue 并建三视图骨架**

删除 `frontend/src/views/AdminView.vue`。创建三个视图（骨架，下一步填内容）：
- `AdminCodesView.vue`、`AdminUsersView.vue`、`AdminDungeonsView.vue` 各自 `<template><div class="dnf-page"><AdminNav />…</div></template>` 并 import `AdminNav`。
- 注意：`App.vue` 的 `router-view :key="$route.fullPath"` 会随路径重挂载，三个视图独立 load 即可。

- [ ] **Step 5: 构建验证**

Run: `cd frontend && npm run build`
Expected: 通过（vue-tsc 无类型错误）

Run: `cd frontend && npx vitest run src/components/AdminNav.spec.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/types.ts frontend/src/components/AdminNav.vue frontend/src/components/AdminNav.spec.ts frontend/src/router/index.ts frontend/src/views/AdminView.vue frontend/src/views/AdminCodesView.vue frontend/src/views/AdminUsersView.vue frontend/src/views/AdminDungeonsView.vue
git commit -m "feat: 管理面板拆三页 + AdminNav 子导航 + 路由，删除 AdminView"
```

---

### Task 13: 邀请码页 + 副本页（迁出并补测试）

**Files:**
- Modify: `frontend/src/views/AdminCodesView.vue`
- Modify: `frontend/src/views/AdminDungeonsView.vue`
- Test: Create `frontend/src/views/AdminCodesView.spec.ts`、`frontend/src/views/AdminDungeonsView.spec.ts`

- [ ] **Step 1: 写失败测试**

`AdminCodesView.spec.ts`（mock api + notify；`CodeItem` fixture）：
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminCodesView from './AdminCodesView.vue'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

const codes = [{ id: 1, code: 'abc123', used_by: null, used_at: null, expires_at: null, single_use: true }]

describe('AdminCodesView', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.get.mockResolvedValue(codes) })
  it('加载并生成注册码', async () => {
    const wrapper = mount(AdminCodesView, { global: { stubs: { AdminNav: true } } })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/admin/codes')
    expect(wrapper.text()).toContain('abc123')
    apiMock.post.mockResolvedValue({ id: 2, code: 'xyz', used_by: null, used_at: null, expires_at: null, single_use: true })
    await wrapper.find('[data-act="gen"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/codes', { single_use: true, expire_days: 7 })
  })
})
```

`AdminDungeonsView.spec.ts`（校验 create/delete 调用）：
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminDungeonsView from './AdminDungeonsView.vue'
import { confirmDialog } from '../lib/notify'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))

const dg = [{ id: 1, name: '巴卡尔', size: 12, description: '', created_at: '2026-09-01T00:00:00' }]

describe('AdminDungeonsView', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.get.mockResolvedValue(dg) })
  it('加载、新增、删除副本', async () => {
    const wrapper = mount(AdminDungeonsView, { global: { stubs: { AdminNav: true } } })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/dungeons')
    expect(wrapper.text()).toContain('巴卡尔')
    apiMock.post.mockResolvedValue(dg[0])
    await wrapper.find('[data-act="save"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/dungeons',
      { name: '', size: 12, description: '' })
    await wrapper.find('[data-act="del-1"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/dungeons/1')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/AdminCodesView.spec.ts src/views/AdminDungeonsView.spec.ts`
Expected: FAIL（视图未实现）

- [ ] **Step 3: 实现两个视图**

`AdminCodesView.vue`：把原 `AdminView.vue` 中「生成注册码」段（`codes`/`genCode`/`singleUse`/`expireDays`/`error`/`generating` + table 模板）迁入，顶部放 `<AdminNav />`，按钮加 `data-act="gen"`，模板外层 `<div class="dnf-page"><h2>邀请码管理</h2>…`。

`AdminDungeonsView.vue`：迁入「副本管理」段（`dungeons`/`dgName`/`dgSize`/`dgDesc`/`editingId`/`saveDungeon`/`editDungeon`/`delDungeon`），顶部 `<AdminNav />`，保存按钮加 `data-act="save"`，删除按钮加 `:data-act="'del-'+d.id"`，模板外层 `<h2>副本管理</h2>`。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/AdminCodesView.spec.ts src/views/AdminDungeonsView.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/AdminCodesView.vue frontend/src/views/AdminDungeonsView.vue frontend/src/views/AdminCodesView.spec.ts frontend/src/views/AdminDungeonsView.spec.ts
git commit -m "feat: 邀请码/副本管理独立页（自 AdminView 迁出）+ 测试"
```

---

### Task 14: CharacterForm baseUrl prop

**Files:**
- Modify: `frontend/src/components/CharacterForm.vue`
- Test: Create `frontend/src/components/CharacterForm.spec.ts`

- [ ] **Step 1: 写失败测试**

`CharacterForm.spec.ts`（job categories fixture，校验默认与自定义 baseUrl）：
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CharacterForm from './CharacterForm.vue'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

const categories = [{
  id: 1, name: 'swordman_male', title: '鬼剑士(男)',
  children: [{ id: 11, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' as const }],
}]

// 注意：职业按钮在选中类别后才渲染（v-if="selectedCat"），必须先点类别再点职业
async function fillAndSave(wrapper: any) {
  await wrapper.find('#char-name').setValue('剑魂')
  await wrapper.find('[data-cat="swordman_male"]').trigger('click')
  await wrapper.find('[data-job="weapon_master"]').trigger('click')
  await wrapper.find('#char-fame').setValue(100)
  await wrapper.find('[data-act="save"]').trigger('click')
  await flushPromises()
}

describe('CharacterForm', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('默认走 /api/me/characters', async () => {
    apiMock.post.mockResolvedValue({})
    const wrapper = mount(CharacterForm, { props: { categories, editing: null } })
    await fillAndSave(wrapper)
    expect(apiMock.post).toHaveBeenCalledWith('/api/me/characters', expect.any(Object))
  })
  it('baseUrl 指定时走管理员路径', async () => {
    apiMock.post.mockResolvedValue({})
    const wrapper = mount(CharacterForm,
      { props: { categories, editing: null, baseUrl: '/api/admin/users/7/characters' } })
    await fillAndSave(wrapper)
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/7/characters', expect.any(Object))
  })
  it('编辑时 put 到 baseUrl/{id}', async () => {
    apiMock.put.mockResolvedValue({})
    const editing = { id: 5, name: '旧', job_name: 'weapon_master', job_title: 'x',
      parent_name: 'swordman_male', class_type: '输出' as const, fame: 1,
      simulated_damage: null, sustained_dps: null, buff_amount: null }
    const wrapper = mount(CharacterForm,
      { props: { categories, editing, baseUrl: '/api/admin/users/7/characters' } })
    await fillAndSave(wrapper)
    expect(apiMock.put).toHaveBeenCalledWith('/api/admin/users/7/characters/5', expect.any(Object))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/CharacterForm.spec.ts`
Expected: FAIL（无 baseUrl 支持 → 默认 post 断言失败）

- [ ] **Step 3: 实现**

`CharacterForm.vue`：
- props 加 `baseUrl?: string`（默认 `/api/me/characters`）。
```ts
const props = defineProps<{ categories: JobCategory[]; editing: Character | null; baseUrl?: string }>()
const base = () => props.baseUrl ?? '/api/me/characters'
```
- `save()` 中：
```ts
    if (props.editing) await api.put(`${base()}/${props.editing.id}`, payload)
    else await api.post(base(), payload)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/CharacterForm.spec.ts src/views/MyCharactersView.spec.ts`
Expected: PASS（MyCharactersView 仍用默认 baseUrl）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/CharacterForm.vue frontend/src/components/CharacterForm.spec.ts
git commit -m "feat: CharacterForm 支持 baseUrl prop，供管理员按玩家增改角色复用"
```

---

### Task 15: AdminUserCharactersModal 弹窗

**Files:**
- Create: `frontend/src/components/AdminUserCharactersModal.vue`
- Test: Create `frontend/src/components/AdminUserCharactersModal.spec.ts`

- [ ] **Step 1: 写失败测试**

`AdminUserCharactersModal.spec.ts`：
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminUserCharactersModal from './AdminUserCharactersModal.vue'
import { confirmDialog } from '../lib/notify'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))

const user = { id: 7, username: 'p', nickname: '玩家', is_admin: false, avatar: null, is_banned: false }
const chars = [{ id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: 'swordman_male', class_type: '输出' as const, fame: 100,
  simulated_damage: null, sustained_dps: null, buff_amount: null }]

describe('AdminUserCharactersModal', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.get.mockResolvedValue(chars) })
  it('打开拉取角色并删除', async () => {
    apiMock.del.mockResolvedValue({ ok: true })
    const wrapper = mount(AdminUserCharactersModal, {
      props: { open: true, user },
      global: { stubs: { teleport: true, AdminNav: true, CharacterForm: true } },
    })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/admin/users/7/characters')
    expect(wrapper.text()).toContain('剑魂')
    await wrapper.find('[data-act="del-1"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/admin/users/7/characters/1')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/AdminUserCharactersModal.spec.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

`AdminUserCharactersModal.vue`（参考 `MemberCharactersModal.vue` 的 NModal 结构）：
- props：`open: boolean`、`user: User | null`；emit `close`。
- 打开时 `GET /api/admin/users/{id}/characters` 拉列表。
- 列表行：`CharacterCard` 只读 + 「编辑」`data-act="edit-{id}"`、「删除」`data-act="del-{id}"`。
- 删除：confirmDialog → `DELETE /api/admin/users/{uid}/characters/{cid}` → 重拉。
- 「添加角色」按钮 `data-act="add"` → 显示 `CharacterForm`（`categories` 来自 `api.getJobs()`，`editing=null`，`baseUrl=/api/admin/users/{uid}/characters`）→ `@saved` 重拉并收起。
- 编辑角色 → 显示 `CharacterForm`（`editing=选中角色`，同 baseUrl）。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/AdminUserCharactersModal.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/AdminUserCharactersModal.vue frontend/src/components/AdminUserCharactersModal.spec.ts
git commit -m "feat: 按玩家管理角色弹窗（复用 CharacterForm baseUrl）"
```

---

### Task 16: AdminUsersView（角色查询区 + 用户管理区）

**Files:**
- Modify: `frontend/src/views/AdminUsersView.vue`
- Test: Create `frontend/src/views/AdminUsersView.spec.ts`

- [ ] **Step 1: 写失败测试**

`AdminUsersView.spec.ts`：
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminUsersView from './AdminUsersView.vue'
import { confirmDialog } from '../lib/notify'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), getJobs: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))

const users = [{ id: 2, username: 'a', nickname: '阿甲', is_admin: false, avatar: null,
  is_banned: false, character_count: 1 }]
const query = { items: [{ id: 9, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: 'swordman_male', class_type: '输出' as const, fame: 100,
  simulated_damage: null, sustained_dps: null, buff_amount: null,
  owner_id: 2, owner_nickname: '阿甲', owner_username: 'a', owner_is_banned: false }], total: 1 }
const jobs = [{ id: 1, name: 'swordman_male', title: '鬼剑士(男)',
  children: [{ id: 11, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' as const }] }]

describe('AdminUsersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/api/admin/users') return Promise.resolve(users)
      if (url.startsWith('/api/admin/characters/query')) return Promise.resolve(query)
      return Promise.resolve([])
    })
    apiMock.getJobs.mockResolvedValue(jobs)
  })
  it('角色查询带筛选与排序参数', async () => {
    const wrapper = mount(AdminUsersView, { global: { stubs: { AdminNav: true, AdminUserCharactersModal: true } } })
    await flushPromises()
    await wrapper.find('[data-filter="class_type"]').setValue('辅助')
    await wrapper.find('[data-filter="keyword"]').setValue('剑')
    await wrapper.find('[data-filter="sort"]').setValue('buff_amount')
    await flushPromises()
    const lastCall = apiMock.get.mock.calls.filter((c: any[]) => String(c[0]).includes('/query')).at(-1)
    // URLSearchParams 会把非 ASCII 编码成 %xx，先 decodeURIComponent 再断言
    const url = decodeURIComponent(String(lastCall[0]))
    expect(url).toContain('class_type=辅助')
    expect(url).toContain('keyword=剑')
    expect(url).toContain('sort=buff_amount')
  })
  it('封禁/解封与角色管理入口', async () => {
    apiMock.post.mockResolvedValue({})
    const wrapper = mount(AdminUsersView, { global: { stubs: { AdminNav: true, AdminUserCharactersModal: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('阿甲')
    await wrapper.find('[data-act="ban-2"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/2/ban')
    await wrapper.find('[data-act="manage-2"]').trigger('click')
    expect(wrapper.findComponent({ name: 'AdminUserCharactersModal' }).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: FAIL（视图未实现）

- [ ] **Step 3: 实现**

`AdminUsersView.vue`：
- **角色查询区**：
  - 状态：`queryItems`、`total`、筛选 `jobName/classType/keyword/owner`、排序 `sort/order`。
  - `loadQuery()`：`api.get<CharacterQueryResult>('/api/admin/characters/query?' + new URLSearchParams({...}))`，字段为空不传。
  - 筛选控件：职业类别下拉 `data-filter="class_type"`（全部/输出/辅助）、职业下拉 `data-filter="job"`（`api.getJobs()` 平铺所有 child，label=title）、角色名 `data-filter="keyword"`、归属玩家 `data-filter="owner"`、排序下拉 `data-filter="sort"`（fame/simulated_damage/sustained_dps/buff_amount/name）、升降序按钮 `data-act="toggle-order"`。
  - 结果表：角色名 / 职业(title) / 职业类别 / 名望 / 模拟伤害 / 持续输出 / 增益量（输出列与辅助列按 class_type 显示）/ 归属玩家（点击 `data-act="manage-owner-{owner_id}"` 打开该玩家角色管理弹窗）。下方显示「共 {{total}} 个角色」。
- **用户管理区**：
  - 搜索框 `data-filter="user_q"` → `loadUsers()` 带 `q`。
  - 用户表：昵称 / 用户名 / 管理员 / 角色数 / 封禁状态（`is_banned ? '已封禁' : '正常'`）/ 操作（查看/管理角色 `data-act="manage-{id}"` 打开弹窗、封禁 `data-act="ban-{id}"` 或解封 `data-act="unban-{id}"`，confirmDialog 后 POST）。
- 顶部 `<AdminNav />`；`AdminUserCharactersModal` 挂在底部，`open`/`user` 受控。
- 角色查询结果行点击归属玩家 → 设置 `modalUser` 并 `open=true`。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/AdminUsersView.vue frontend/src/views/AdminUsersView.spec.ts
git commit -m "feat: 用户管理页（角色富查询 + 用户搜索/封禁/按玩家管理角色）"
```

---

### Task 17: 前端构建 + 全量回归

**Files:**
- Test: 全量

- [ ] **Step 1: 构建 + 单测**

Run: `cd frontend && npm run build`
Expected: 通过

Run: `cd frontend && npx vitest run`
Expected: 全部 PASS

- [ ] **Step 2: 后端全量回归**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS

- [ ] **Step 3: 提交（若有漏网）**

```bash
git status
```

---

## 验收清单

- [ ] 三个独立管理页 + 子导航可访问，`/admin` 重定向到邀请码页。
- [ ] 用户管理页角色查询：四类筛选 + 五种排序 + 分页 total 生效。
- [ ] 用户搜索、按玩家增改删角色、封禁/解封生效；封禁后报名/排位/替报名/机器人报名被拒，现有占位保留，解封恢复。
- [ ] `CharacterPickerModal`（分组 `/api/admin/characters`）与 `SignupMemberPicker`（`/api/admin/users`）不受影响。
- [ ] 后端 pytest 与前端 vitest + vue-tsc build 全绿。
