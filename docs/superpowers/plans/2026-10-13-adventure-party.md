# 冒险团（多账号角色归属）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「冒险团」概念，让玩家把角色按游戏账号分组：每人一个初始团「{昵称}的冒险团」，可增改删团、角色归属团（默认第一个团），编队池按「用户组→团内小节」划分、用户管理展示团字段。

**Architecture:** 方案 A（spec §2/§3/§4）：新表 `adventure_parties`（user_id + 团名唯一）+ `characters.adventure_party_id` 外键（nullable 列，应用层保证非空）。`character_out()` 统一补团字段（raid/bot/admin 全部序列化路径自动携带）。新增 `services/parties.py`（ensure_default_party/list/create/rename/delete/resolve）+ `/api/me/adventure-parties` CRUD + admin 读团端点；前端改 CharacterForm 下拉、MyCharactersView 团管理、RosterPool 团小节、AdminUsersView 团列。

**Tech Stack:** FastAPI + SQLAlchemy 2 + SQLite（backend）；Vue 3 `<script setup>` + Vitest + vue-tsc（frontend）。迁移走 `migrations.py` 幂等 ALTER + `init_db()` 挂载。

**前置约定（务必遵守）**
- 提交直接到 main，不做 worktree。提交信息 `[feat]/[fix]/[test]/[docs]` + 中文，`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- 测试命令：后端 `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest <file> -v`；前端 `cd /Users/able/toys/dnfer/frontend && npx vitest run <file>`；前端类型/构建 `cd /Users/able/toys/dnfer/frontend && npm run build`（= vue-tsc -b && vite build）。
- 规范文档：`docs/superpowers/specs/2026-10-13-adventure-party-design.md`（实现以本计划为准，歧义时回看 spec）。
- SQLAlchemy 2.0：用 `db.get(Model, id)`，勿用 `db.query(...).get(...)`。

---

### Task 1: 数据模型 + schemas + character_out 序列化

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/characters.py`

- [ ] **Step 1: 写失败测试**（纯 service 级用例，直接驱动 `character_out`，不依赖端点；追加到 `backend/tests/test_members.py`，import 放文件头部）

```python
def test_character_out_includes_adventure_party(db):
    from app.models import AdventureParty
    from app.services.characters import character_out
    u = User(username="s1", password_hash="x", nickname="阿伟", is_admin=False)
    db.add(u); db.flush()
    p = AdventureParty(user_id=u.id, name="阿伟的冒险团")
    db.add(p); db.flush()
    c = Character(user_id=u.id, name="剑魂", job_name="weapon_master",
                  class_type="输出", adventure_party_id=p.id)
    db.add(c); db.flush()
    out = character_out(c)
    assert out.adventure_party_id == p.id
    assert out.adventure_party_name == "阿伟的冒险团"
```
（端点级「角色归团/缺省第一团」断言在 Task 5 覆盖，此处只驱动序列化；`User`/`Character` 已在 test_members.py 导入或用 `from app.models import ...`。）

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_members.py -v`
Expected: 新增用例因字段不存在失败（`TypeError` 或 KeyError）。

- [ ] **Step 3: 加模型 `AdventureParty`**（`models.py`）

```python
class AdventureParty(Base):
    __tablename__ = "adventure_parties"
    __table_args__ = (UniqueConstraint("user_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    owner: Mapped[User] = relationship(back_populates="adventure_parties")
    characters: Mapped[list["Character"]] = relationship(back_populates="adventure_party")
```
`User` 加关系 `adventure_parties: Mapped[list["AdventureParty"]] = relationship(back_populates="owner")`。
`Character` 加列与关系：
```python
adventure_party_id: Mapped[int | None] = mapped_column(
    ForeignKey("adventure_parties.id"), nullable=True, index=True)
adventure_party: Mapped["AdventureParty | None"] = relationship(back_populates="characters")
```

- [ ] **Step 4: 加 schemas**（`schemas.py`）

```python
class AdventurePartyIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)

class AdventurePartyOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    character_count: int = 0
```
`CharacterIn` 加 `adventure_party_id: int | None = None`；`CharacterOut` 加 `adventure_party_id: int | None = None`、`adventure_party_name: str | None = None`（带默认值防中间态 500）。

- [ ] **Step 5: `character_out` 补字段**（`services/characters.py`）

```python
def character_out(c: Character) -> CharacterOut:
    meta = job_data.job_meta(c.job_name) or {"title": "", "parent_name": ""}
    party = c.adventure_party
    return CharacterOut(id=c.id, name=c.name, job_name=c.job_name,
                        job_title=meta["title"], parent_name=meta["parent_name"],
                        class_type=c.class_type, fame=c.fame,
                        simulated_damage=c.simulated_damage,
                        sustained_dps=c.sustained_dps, buff_amount=c.buff_amount,
                        sun_buff=c.sun_buff,
                        adventure_party_id=c.adventure_party_id,
                        adventure_party_name=party.name if party else None)
```

- [ ] **Step 6: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_members.py tests/test_bot_characters.py tests/test_admin_management.py tests/test_public.py -v`
Expected: 全 PASS（旧用例为字段级断言，不受加字段影响）。

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/services/characters.py backend/tests/test_members.py
git commit -m "[feat] 冒险团数据模型 + 角色序列化携带团字段"
```

---

### Task 2: 冒险团 service（services/parties.py）+ 单元测试

**Files:**
- Create: `backend/app/services/parties.py`
- Test: `backend/tests/test_adventure_parties.py`

- [ ] **Step 1: 写失败测试**（`test_adventure_parties.py`，用现有 `db`/`client` fixture；service 函数直接调 db fixture）

```python
import pytest
from fastapi import HTTPException
from app.models import Character, User
from app.services.parties import (create_party, delete_party, ensure_default_party,
                                  list_parties, rename_party, resolve_party)

def _user(db):
    u = User(username="p1", password_hash="x", nickname="阿伟", is_admin=False)
    db.add(u); db.commit(); db.refresh(u)
    return u

def test_ensure_default_party_creates_for_partyless_user(db):
    u = _user(db)
    p = ensure_default_party(db, u)
    assert p.name == "阿伟的冒险团"
    assert ensure_default_party(db, u).id == p.id  # 再次调用返回同一团

def test_create_party_unique_per_user(db):
    u = _user(db)
    create_party(db, u, "奶爸团"); db.commit()
    with pytest.raises(HTTPException):
        create_party(db, u, "奶爸团")  # 重名

def test_delete_party_blocks_nonempty_and_last(db):
    u = _user(db)
    p1 = ensure_default_party(db, u); db.commit()
    db.add(Character(user_id=u.id, name="剑魂", job_name="weapon_master",
                     class_type="输出", adventure_party_id=p1.id)); db.commit()
    with pytest.raises(HTTPException):  # 有角色
        delete_party(db, u, p1.id)
    p2 = create_party(db, u, "二号团"); db.commit()
    with pytest.raises(HTTPException):  # 非空仍拦截
        delete_party(db, u, p1.id)
    # p2 空团且非最后（p1 还在）→ 可删
    delete_party(db, u, p2.id); db.commit()
    assert list_parties(db, u) == [p1]  # 只剩 p1

def test_resolve_party_checks_ownership(db):
    u1, u2 = _user(db), User(username="p2", password_hash="x", nickname="乙", is_admin=False)
    db.add(u2); db.commit()
    p1 = ensure_default_party(db, u1); db.commit()
    with pytest.raises(HTTPException):
        resolve_party(db, u2, p1.id)  # 非本人团
    assert resolve_party(db, u1, p1.id).id == p1.id
    assert resolve_party(db, u1, None).id == p1.id  # None → 默认团
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_adventure_parties.py -v`
Expected: FAIL（module not found / import error）。

- [ ] **Step 3: 实现 service**

```python
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import AdventureParty, Character
from ..schemas import AdventurePartyOut


def list_parties(db: Session, user) -> list[AdventureParty]:
    return (db.query(AdventureParty)
            .filter(AdventureParty.user_id == user.id)
            .order_by(AdventureParty.id).all())


def ensure_default_party(db: Session, user) -> AdventureParty:
    party = (db.query(AdventureParty)
             .filter(AdventureParty.user_id == user.id)
             .order_by(AdventureParty.id).first())
    if party is None:
        party = AdventureParty(user_id=user.id, name=f"{user.nickname}的冒险团")
        db.add(party)
        db.flush()
    return party


def _own_party(db: Session, pid: int, user) -> AdventureParty:
    p = db.get(AdventureParty, pid)
    if p is None or p.user_id != user.id:
        raise HTTPException(404, "冒险团不存在")
    return p


def create_party(db: Session, user, name: str) -> AdventureParty:
    name = name.strip()
    if not name:
        raise HTTPException(400, "团名不能为空")
    if (db.query(AdventureParty)
            .filter(AdventureParty.user_id == user.id,
                    AdventureParty.name == name).first()):
        raise HTTPException(400, "冒险团已存在")
    p = AdventureParty(user_id=user.id, name=name)
    db.add(p)
    return p


def rename_party(db: Session, user, pid: int, name: str) -> AdventureParty:
    p = _own_party(db, pid, user)
    name = name.strip()
    if not name:
        raise HTTPException(400, "团名不能为空")
    if (db.query(AdventureParty)
            .filter(AdventureParty.user_id == user.id,
                    AdventureParty.name == name,
                    AdventureParty.id != pid).first()):
        raise HTTPException(400, "冒险团已存在")
    p.name = name
    return p


def delete_party(db: Session, user, pid: int) -> None:
    p = _own_party(db, pid, user)
    if (db.query(Character)
            .filter(Character.adventure_party_id == pid).first()):
        raise HTTPException(400, "请先转移或删除该团角色")
    if (db.query(AdventureParty)
            .filter(AdventureParty.user_id == user.id).count() <= 1):
        raise HTTPException(400, "至少保留一个冒险团")
    db.delete(p)


def resolve_party(db: Session, owner, party_id: int | None) -> AdventureParty:
    if party_id is None:
        return ensure_default_party(db, owner)
    p = db.get(AdventureParty, party_id)
    if p is None or p.user_id != owner.id:
        raise HTTPException(400, "冒险团不存在")
    return p


def party_out(p: AdventureParty, character_count: int = 0) -> AdventurePartyOut:
    return AdventurePartyOut(id=p.id, name=p.name, created_at=p.created_at,
                             character_count=character_count)


def parties_out(db: Session, user) -> list[AdventurePartyOut]:
    parties = list_parties(db, user)
    ids = [p.id for p in parties]
    counts: dict[int, int] = {}
    if ids:
        counts = dict(db.query(Character.adventure_party_id, func.count(Character.id))
                      .filter(Character.adventure_party_id.in_(ids))
                      .group_by(Character.adventure_party_id).all())
    return [party_out(p, counts.get(p.id, 0)) for p in parties]
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_adventure_parties.py -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/parties.py backend/tests/test_adventure_parties.py
git commit -m "[feat] 冒险团 service（默认团/增改删/归属校验）"
```

---

### Task 3: 迁移 migrate_adventure_parties + init_db 挂载

**Files:**
- Modify: `backend/app/migrations.py`
- Modify: `backend/app/db.py`
- Test: `backend/tests/test_migrations.py`

- [ ] **Step 1: 写失败测试**（追加到 `test_migrations.py`）

```python
def test_migrate_adventure_parties_backfills():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE users (
            id INTEGER PRIMARY KEY, username VARCHAR(64) UNIQUE,
            password_hash VARCHAR(128), nickname VARCHAR(64),
            is_admin BOOLEAN, created_at DATETIME)"""))
        conn.execute(text("""INSERT INTO users (username, password_hash, nickname, is_admin, created_at)
            VALUES ('u1', 'x', '张三', 0, '2026-09-01 10:00:00'),
                   ('u2', 'x', '李四', 0, '2026-09-01 10:00:00')"""))
        conn.execute(text("""CREATE TABLE characters (
            id INTEGER PRIMARY KEY, user_id INTEGER, name VARCHAR(64),
            job_name VARCHAR(64), class_type VARCHAR(8), fame INTEGER,
            simulated_damage INTEGER, sustained_dps INTEGER, buff_amount INTEGER,
            sun_buff INTEGER)"""))
        conn.execute(text("""INSERT INTO characters (user_id, name, job_name, class_type, fame)
            VALUES (1, '剑魂', 'weapon_master', '输出', 1), (1, '奶', 'crusader_male', '辅助', 1)"""))
    from app.migrations import migrate_adventure_parties
    migrate_adventure_parties(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(characters)")).all()}
        assert "adventure_party_id" in cols
        idxs = {r[1] for r in conn.execute(text("PRAGMA index_list(characters)")).all()}
        assert "ix_characters_adventure_party_id" in idxs
        rows = conn.execute(text(
            "SELECT ap.name, c.name, c.adventure_party_id FROM adventure_parties ap"
            " JOIN characters c ON c.adventure_party_id = ap.id ORDER BY c.id")).all()
        assert [r[0] for r in rows] == ["张三的冒险团", "张三的冒险团"]
        assert [r[1] for r in rows] == ["剑魂", "奶"]
        # u2 无角色也建团
        names = {r[0] for r in conn.execute(text("SELECT name FROM adventure_parties")).all()}
        assert "李四的冒险团" in names
    migrate_adventure_parties(engine)  # 幂等：不报错、不重复建团
    with engine.begin() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM adventure_parties")).scalar() == 2
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: FAIL（`migrate_adventure_parties` 不存在）。

- [ ] **Step 3: 实现迁移**（`migrations.py` 追加）

```python
def migrate_adventure_parties(engine: Engine) -> None:
    """为存量库补建冒险团：characters.adventure_party_id 列 + 每用户初始团回填（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)  # 建 adventure_parties 表（若缺）
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(characters)")).all()}
        if "adventure_party_id" not in cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN"
                              " adventure_party_id INTEGER REFERENCES adventure_parties(id)"))
        idxs = {row[1] for row in conn.execute(text("PRAGMA index_list(characters)")).all()}
        if "ix_characters_adventure_party_id" not in idxs:
            conn.execute(text("CREATE INDEX ix_characters_adventure_party_id"
                              " ON characters (adventure_party_id)"))
        for uid, nickname in conn.execute(text("SELECT id, nickname FROM users")).all():
            row = conn.execute(
                text("SELECT id FROM adventure_parties WHERE user_id = :uid ORDER BY id LIMIT 1"),
                {"uid": uid}).first()
            if row is None:
                party_id = conn.execute(
                    text("INSERT INTO adventure_parties (user_id, name, created_at)"
                         " VALUES (:uid, :name, :t)"),
                    {"uid": uid, "name": f"{nickname}的冒险团",
                     "t": datetime.now()}).lastrowid
            else:
                party_id = row[0]
            conn.execute(
                text("UPDATE characters SET adventure_party_id = :pid"
                     " WHERE user_id = :uid AND adventure_party_id IS NULL"),
                {"pid": party_id, "uid": uid})
```

- [ ] **Step 4: init_db 挂载**（`db.py`）

在 import 列表加 `migrate_adventure_parties`，并追加调用：
```python
    migrate_waves_group(engine)
    migrate_adventure_parties(engine)
```

- [ ] **Step 5: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add backend/app/migrations.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "[feat] 冒险团迁移：存量角色回填初始团"
```

---

### Task 4: 注册即建初始冒险团 + 成员冒险团 CRUD 路由 + main.py 注册

> 为什么合并：CRUD/角色归属测试都依赖「注册即有初始团」（`GET /api/me/adventure-parties` 返回 1 个团）；而注册建团又依赖 parties 路由可查。两者必须在同一任务落地，避免任务序死锁。Task 5 起即可放心用 `register_user` 后直接取 `[0]` 团。

**Files:**
- Create: `backend/app/routers/parties.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/routers/bot.py`
- Test: `backend/tests/test_adventure_parties.py`, `backend/tests/test_auth.py`, `backend/tests/test_bot_register.py`

- [ ] **Step 1: 写失败测试**

`test_adventure_parties.py` 追加 CRUD + 归属用例：
```python
def test_parties_api_crud(client):
    h, _ = register_user(client, "party2", "阿伟")
    # 初始团
    r = client.get("/api/me/adventure-parties", headers=h)
    assert r.status_code == 200 and len(r.json()) == 1
    assert r.json()[0]["name"] == "阿伟的冒险团"
    pid = r.json()[0]["id"]
    # 创建第二个团
    r = client.post("/api/me/adventure-parties", headers=h, json={"name": "奶爸团"})
    assert r.status_code == 200 and r.json()["name"] == "奶爸团"
    assert r.json()["character_count"] == 0
    pid2 = r.json()["id"]
    # 重名 400
    assert client.post("/api/me/adventure-parties", headers=h,
                       json={"name": "奶爸团"}).status_code == 400
    # 改名
    r = client.put(f"/api/me/adventure-parties/{pid2}", headers=h, json={"name": "奶妈团"})
    assert r.status_code == 200 and r.json()["name"] == "奶妈团"
    # 删除：空团且非最后 → 成功；删到只剩一个 → 400
    assert client.delete(f"/api/me/adventure-parties/{pid2}", headers=h).status_code == 200
    assert client.delete(f"/api/me/adventure-parties/{pid}", headers=h).status_code == 400

def test_parties_api_ownership(client):
    h1, _ = register_user(client, "p3", "甲")
    h2, _ = register_user(client, "p4", "乙")
    pid = client.get("/api/me/adventure-parties", headers=h1).json()[0]["id"]
    assert client.put(f"/api/me/adventure-parties/{pid}", headers=h2,
                      json={"name": "x"}).status_code == 404
    assert client.delete(f"/api/me/adventure-parties/{pid}", headers=h2).status_code == 404
```
`test_auth.py` 追加：
```python
def test_register_creates_initial_party(client):
    admin = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    ah = {"Authorization": f"Bearer {admin.json()['token']}"}
    code = client.post("/api/admin/codes", json={"single_use": True}, headers=ah).json()["code"]
    r = client.post("/api/auth/register", json={
        "username": "newbie", "password": "secret1", "nickname": "萌新", "code": code})
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    parties = client.get("/api/me/adventure-parties", headers=h).json()
    assert len(parties) == 1 and parties[0]["name"] == "萌新的冒险团"
```
`test_bot_register.py` 追加：
```python
def test_bot_register_creates_initial_party(client):
    r = client.post("/api/public/register", json={"identifier": "12345678"},
                    headers={"Authorization": "Bearer change-me-bot-token"})
    assert r.status_code == 200
    h = client.post("/api/auth/login", json={"username": "12345678", "password": "12345678"})
    token = h.json()["token"]
    parties = client.get("/api/me/adventure-parties",
                         headers={"Authorization": f"Bearer {token}"}).json()
    assert len(parties) == 1 and parties[0]["name"] == "12345678的冒险团"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_adventure_parties.py tests/test_auth.py tests/test_bot_register.py -v`
Expected: 新增用例 FAIL（404 route / parties 为空）。

- [ ] **Step 3: 实现注册即建团**（`auth.py` + `bot.py`）

`auth.py` register：`from ..models import User` 改 `from ..models import AdventureParty, User`；`db.flush()` 后加：
```python
    db.add(AdventureParty(user_id=user.id, name=f"{body.nickname}的冒险团"))
```
`bot.py` register：`from ..models import AdventureParty, Character, RaidSignup, User`；`db.add(user)` 后、commit 前：
```python
    db.add(user)
    db.flush()
    db.add(AdventureParty(user_id=user.id, name=f"{identifier}的冒险团"))
```
（原 `db.add(user)` 后紧跟 `try: db.commit()`；改为 flush + add party 后再 commit。`test_bot_register.py` 既有用例若断言注册后数据，一般不受影响——只多建一条 party 行。）

- [ ] **Step 4: 实现路由 + main.py 注册**

`routers/parties.py`：
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas import AdventurePartyIn, AdventurePartyOut
from ..services.parties import (create_party, delete_party, parties_out,
                                party_out, rename_party)

router = APIRouter(prefix="/api/me/adventure-parties", tags=["members"])


@router.get("", response_model=list[AdventurePartyOut])
def list_my_parties(user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    return parties_out(db, user)


@router.post("", response_model=AdventurePartyOut)
def create_my_party(body: AdventurePartyIn,
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    p = create_party(db, user, body.name)
    db.commit()
    db.refresh(p)
    return party_out(p)


@router.put("/{pid}", response_model=AdventurePartyOut)
def rename_my_party(pid: int, body: AdventurePartyIn,
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    p = rename_party(db, user, pid, body.name)
    db.commit()
    db.refresh(p)
    return party_out(p)


@router.delete("/{pid}")
def delete_my_party(pid: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    delete_party(db, user, pid)
    db.commit()
    return {"ok": True}
```
`main.py`：`from .routers import admin, auth, bot, dungeons, jobs, members, parties, public, raids, votes` 加 `parties`；在 `app.include_router(members.router)` 后加 `app.include_router(parties.router)`。

- [ ] **Step 5: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_adventure_parties.py tests/test_auth.py tests/test_bot_register.py -v`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/parties.py backend/app/main.py backend/app/routers/auth.py backend/app/routers/bot.py backend/tests/test_adventure_parties.py backend/tests/test_auth.py backend/tests/test_bot_register.py
git commit -m "[feat] 注册即建初始冒险团 + 成员冒险团 CRUD 端点"
```

---

### Task 5: 成员角色创建/编辑支持冒险团

**Files:**
- Modify: `backend/app/routers/members.py`
- Test: `backend/tests/test_members.py`

- [ ] **Step 1: 写失败测试**（追加到 `test_members.py`）

```python
def test_character_create_defaults_to_first_party(client):
    h, _ = register_user(client, "p20", "阿伟")
    parties = client.get("/api/me/adventure-parties", headers=h).json()
    pid = parties[0]["id"]
    r = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1})
    assert r.json()["adventure_party_id"] == pid
    assert r.json()["adventure_party_name"] == "阿伟的冒险团"

def test_character_create_with_explicit_party(client):
    h, _ = register_user(client, "p21", "阿伟")
    pid2 = client.post("/api/me/adventure-parties", headers=h,
                       json={"name": "二号团"}).json()["id"]
    r = client.post("/api/me/characters", headers=h, json={
        "name": "奶", "job_name": "crusader_male", "fame": 1,
        "adventure_party_id": pid2})
    assert r.status_code == 200
    assert r.json()["adventure_party_id"] == pid2
    assert r.json()["adventure_party_name"] == "二号团"

def test_character_rejects_others_party(client):
    h1, _ = register_user(client, "p22", "甲")
    h2, _ = register_user(client, "p23", "乙")
    pid1 = client.get("/api/me/adventure-parties", headers=h1).json()[0]["id"]
    assert client.post("/api/me/characters", headers=h2, json={
        "name": "x", "job_name": "weapon_master", "fame": 1,
        "adventure_party_id": pid1}).status_code == 400

def test_character_edit_changes_party(client):
    h, _ = register_user(client, "p24", "阿伟")
    pid1 = client.get("/api/me/adventure-parties", headers=h).json()[0]["id"]
    pid2 = client.post("/api/me/adventure-parties", headers=h,
                       json={"name": "二号团"}).json()["id"]
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1}).json()["id"]
    r = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "adventure_party_id": pid2})
    assert r.status_code == 200 and r.json()["adventure_party_id"] == pid2
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_members.py -v`
Expected: 新增用例 FAIL（`adventure_party_id` 为 null 或 400 不对）。

- [ ] **Step 3: 实现**（`members.py` create/update）

```python
from ..services.parties import resolve_party
```
create：
```python
    c = Character(user_id=user.id)
    apply_character_payload(c, body)
    c.adventure_party_id = resolve_party(db, user, body.adventure_party_id).id
    db.add(c)
```
update：`apply_character_payload(c, body)` 后加 `c.adventure_party_id = resolve_party(db, user, body.adventure_party_id).id`。

> **编辑语义**：编辑请求未带 `adventure_party_id`（None）时 `resolve_party` 会归到第一个团——这是 spec §3.5 的既定行为（CharacterForm 在 Task 10 之后总会提交该字段，故真实 UI 不会误触发）。实现时**不要**自作主张改成「编辑缺省保留原团」。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_members.py -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/members.py backend/tests/test_members.py
git commit -m "[feat] 成员角色创建/编辑指定冒险团（缺省第一团）"
```

---

### Task 6: 机器人建角色默认归第一个团

**Files:**
- Modify: `backend/app/routers/bot.py`
- Test: `backend/tests/test_bot_characters.py`

- [ ] **Step 1: 写失败测试**（追加到 `test_bot_characters.py`）

```python
def test_bot_created_character_defaults_to_first_party(client):
    r = client.post("/api/public/register", json={"identifier": "87654321"},
                    headers={"Authorization": "Bearer change-me-bot-token"})
    assert r.status_code == 200
    r = client.post("/api/public/characters", json={
        "nickname": "87654321",
        "characters": [{"name": "剑魂", "job_name": "weapon_master"}]},
        headers={"Authorization": "Bearer change-me-bot-token"})
    assert r.status_code == 200
    body = r.json()
    assert body["results"][0]["ok"] is True
    c = body["results"][0]["character"]
    assert c["adventure_party_id"] is not None
    assert c["adventure_party_name"] == "87654321的冒险团"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_bot_characters.py -v`
Expected: 新增用例 FAIL（`adventure_party_id` 为 null）。

- [ ] **Step 3: 实现**（`bot.py` upsert_characters 创建分支）

`from ..services.parties import ensure_default_party`；`c = Character(...)` 构造加参数：
```python
            c = Character(user_id=user.id, name=item.name, job_name=job,
                          class_type=job_data.class_type_for(job),
                          fame=item.fame if item.fame is not None else DEFAULT_FAME,
                          simulated_damage=item.simulated_damage,
                          sustained_dps=item.sustained_dps, buff_amount=item.buff_amount,
                          sun_buff=item.sun_buff,
                          adventure_party_id=ensure_default_party(db, user).id)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_bot_characters.py -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/bot.py backend/tests/test_bot_characters.py
git commit -m "[feat] 机器人建角色默认归第一冒险团"
```

---

### Task 7: admin 端点（读用户团 + 建角色指定团）

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_management.py`

- [ ] **Step 1: 写失败测试**（追加到 `test_admin_management.py`；先看该文件现有 fixture/helper 复用）

```python
def test_admin_lists_user_parties_and_creates_char_with_party(client, admin_headers):
    r = client.post("/api/auth/register", json={
        "username": "victim", "password": "secret1", "nickname": "受害人",
        "code": client.post("/api/admin/codes", json={"single_use": True},
                            headers=admin_headers).json()["code"]})
    assert r.status_code == 200
    uid = r.json()["user"]["id"]
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    pid = client.get("/api/me/adventure-parties", headers=h).json()[0]["id"]
    # admin 读用户团
    parties = client.get(f"/api/admin/users/{uid}/adventure-parties", headers=admin_headers)
    assert parties.status_code == 200 and parties.json()[0]["id"] == pid
    # admin 建角色指定团
    r = client.post(f"/api/admin/users/{uid}/characters", headers=admin_headers, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "adventure_party_id": pid})
    assert r.status_code == 200 and r.json()["adventure_party_id"] == pid
    # 建角色缺省团 → 第一个团
    r = client.post(f"/api/admin/users/{uid}/characters", headers=admin_headers, json={
        "name": "奶", "job_name": "crusader_male", "fame": 1})
    assert r.json()["adventure_party_id"] == pid

def test_admin_character_query_has_party(client, admin_headers):
    # 复用上例或新造：给用户建角色后，query 结果带 adventure_party_name
    r = client.post("/api/auth/register", json={
        "username": "victim2", "password": "secret1", "nickname": "受害人二",
        "code": client.post("/api/admin/codes", json={"single_use": True},
                            headers=admin_headers).json()["code"]})
    uid = r.json()["user"]["id"]
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1})
    q = client.get("/api/admin/characters/query?keyword=剑魂", headers=admin_headers).json()
    assert q["total"] >= 1
    row = q["items"][0]
    assert row["adventure_party_name"] == "受害人二的冒险团"
    assert row["adventure_party_id"] is not None
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_admin_management.py -v`
Expected: 新增用例 FAIL（404 route / 字段缺失）。

- [ ] **Step 3: 实现**（`admin.py`）

导入补 `AdventurePartyOut`、`from ..services.parties import parties_out, resolve_party`。
新增端点：
```python
@router.get("/users/{uid}/adventure-parties", response_model=list[AdventurePartyOut])
def list_user_adventure_parties(uid: int, admin: User = Depends(require_admin),
                                db: Session = Depends(get_db)):
    target = _user_or_404(db, uid)
    return parties_out(db, target)
```
`create_user_character` / `update_user_character`：`apply_character_payload(c, body)` 后加 `c.adventure_party_id = resolve_party(db, _user_or_404(db, uid), body.adventure_party_id).id`（update 已有 `_user_character_or_404`，owner 即目标用户，直接 `resolve_party(db, target, ...)`；可复用 `_user_or_404`）。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_admin_management.py -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_management.py
git commit -m "[feat] admin 读用户冒险团 + 建角色指定团"
```

---

### Task 8: 后端全量回归

**Files:**（无新增）

- [ ] **Step 1: 跑全量后端测试**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest -q`
Expected: 全 PASS。若有失败，修复后重跑。

- [ ] **Step 2: Commit（如有修复）**

```bash
git add -A
git commit -m "[fix] 冒险团后端回归修复"
```

---

### Task 9: 前端 types.ts + 全部 Character 字面量 fixture 补字段

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: 所有因 `Character` 新增字段而编译失败的 spec/组件 fixture（vue-tsc 为准）

- [ ] **Step 1: 加类型**（`types.ts`）

```ts
export interface AdventureParty { id: number; name: string; created_at: string; character_count: number }
```
`Character` 加两字段（末尾）：
```ts
  sun_buff: number | null;
  adventure_party_id: number | null; adventure_party_name: string | null }
```

- [ ] **Step 2: 运行构建暴露失败点**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: vue-tsc 报多个文件手写 `Character` 字面量缺字段。已知候选（含但不限于）：
`src/components/RosterPool.spec.ts`、`src/views/RosterView.spec.ts`、`src/views/RaidDetailView.spec.ts`、`src/views/AdminUsersView.spec.ts`、`src/views/MyCharactersView.spec.ts`、`src/components/RosterGrid.spec.ts`、`src/components/RosterSlot.spec.ts`、`src/components/SlotCell.spec.ts`、`src/components/SignupModal.spec.ts`、`src/components/CharacterPickerModal.spec.ts`、`src/components/MemberCharactersModal.spec.ts`、`src/components/AdminUserCharactersModal.spec.ts`、`src/components/CharacterForm.spec.ts`、`src/stores/raid.spec.ts`、`src/lib/*.spec.ts`。

- [ ] **Step 3: 逐个补齐两字段**

对每个手写 `Character` 字面量加：
```ts
adventure_party_id: <id 或 null>, adventure_party_name: '<名' 或 null>
```
`AdminCharacterRow` 字面量（AdminUsersView.spec）同样补。`lib/` 纯函数 spec 里若传 Partial 数据不受影响，以 vue-tsc 报错为准。

- [ ] **Step 4: 重新构建通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 构建 PASS。

- [ ] **Step 5: 跑现有前端测试确认无回归**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run`
Expected: 全 PASS（此步只加字段不改逻辑，测试应仍绿）。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "[ref] Character 类型补冒险团字段并修全部 fixture"
```

---

### Task 10: CharacterForm 冒险团下拉

**Files:**
- Modify: `frontend/src/components/CharacterForm.vue`
- Modify: `frontend/src/components/CharacterForm.spec.ts`

- [ ] **Step 1: 写失败测试**（在 `CharacterForm.spec.ts` 补；先看该文件现有 mount 方式）

关键断言：
- 加载 `/api/me/adventure-parties` 后下拉渲染团名，创建态默认选中第一个团；
- 编辑态回填 `editing.adventure_party_id`；
- 保存 payload 含 `adventure_party_id`；
- baseUrl 形如 `/api/admin/users/{uid}/characters` 时请求 `/api/admin/users/{uid}/adventure-parties`。

示例（按该文件既有 mock 风格）：
```ts
it('冒险团下拉默认第一个团并在保存时提交', async () => {
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/me/adventure-parties') return [
      { id: 1, name: '甲的冒险团', created_at: '', character_count: 0 },
      { id: 2, name: '奶爸团', created_at: '', character_count: 0 },
    ]
    return []
  })
  // 挂载 → 打开表单 → 断言下拉值 → 保存
  expect((select.element as HTMLSelectElement).value).toBe('1')
  ...点击保存...
  expect(apiMock.post.mock.calls[0][1].adventure_party_id).toBe(1)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/CharacterForm.spec.ts`
Expected: 新增用例 FAIL（无下拉元素）。

- [ ] **Step 3: 实现**（`CharacterForm.vue`）

- 导入 `onMounted`、`AdventureParty` 类型。
- `form` 加 `adventure_party_id: props.editing?.adventure_party_id ?? null as number | null`。
- 新 state（**注意 `?? []`**：既有 `CharacterForm.spec.ts` 只 `vi.clearAllMocks()` 未 stub parties 接口，`api.get` resolve 为 `undefined`，不防护会在 `parties.value.length` 抛 TypeError 破坏旧用例）：
```ts
const parties = ref<AdventureParty[]>([])
const partiesBase = computed(() => {
  const m = props.baseUrl?.match(/\/api\/admin\/users\/(\d+)/)
  return m ? `/api/admin/users/${m[1]}/adventure-parties` : '/api/me/adventure-parties'
})
onMounted(async () => {
  try { parties.value = (await api.get<AdventureParty[]>(partiesBase.value)) ?? [] }
  catch { parties.value = [] }
  if (!props.editing && form.value.adventure_party_id == null && parties.value.length) {
    form.value.adventure_party_id = parties.value[0].id
  }
})
```
- 模板：角色名下加一行（`selectedJob` 下方或名望行上方）：
```html
<div style="display:flex;align-items:center;gap:8px;margin:8px 0">
  <label for="char-party" class="form-label">冒险团：</label>
  <select id="char-party" v-model.number="form.adventure_party_id" class="dnf-select"
          style="flex:1" data-act="adventure-party">
    <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }}</option>
  </select>
</div>
```
- `save()` payload 加 `adventure_party_id: form.adventure_party_id`。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/CharacterForm.spec.ts`
Expected: PASS（含旧用例——旧 mock 未 stub parties 时 `api.get` 返回空数组/未实现需兜底 `try/catch`，见 Step 3）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CharacterForm.vue frontend/src/components/CharacterForm.spec.ts
git commit -m "[feat] 角色表单冒险团下拉（默认第一团/编辑回填）"
```

---

### Task 11: MyCharactersView 冒险团管理 + AdventurePartyModal

**Files:**
- Create: `frontend/src/components/AdventurePartyModal.vue`
- Create: `frontend/src/components/AdventurePartyModal.spec.ts`
- Modify: `frontend/src/views/MyCharactersView.vue`
- Modify: `frontend/src/views/MyCharactersView.spec.ts`

- [ ] **Step 1: 写失败测试**（`AdventurePartyModal.spec.ts`，mock api + naive NModal stub 参照 AdminUserCharactersModal.spec）

关键断言：
- 打开时 GET `/api/me/adventure-parties`，列表显示团名 + 角色数；
- 创建：输入 + 点 `data-act="party-create"` → POST，刷新列表；
- 改名：点 `data-act="party-rename-{id}"` 出输入框，保存 `data-act="party-rename-save"` → PUT；
- 删除：`character_count>0` 或 `parties.length<=1` 时按钮禁用；可删时点击 → confirm → DELETE。

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/AdventurePartyModal.spec.ts`
Expected: FAIL（文件不存在）。

- [ ] **Step 3: 实现 `AdventurePartyModal.vue`**

参照 `AdminUserCharactersModal.vue` 用 `n-modal`。props：`{ open: boolean }`；emits：`close`、`changed`（增删改后触发，父组件刷新角色列表）。
- 打开时 `load()`：`api.get<AdventureParty[]>('/api/me/adventure-parties')`。
- 列表：每行 `.party-row`（`data-party-id`）= 团名 + `（N 角色）` + 「改名」`data-act="party-rename-{id}"` + 「删除」`data-act="party-delete-{id}"`。
- 改名态：行内输入 `data-act="party-rename-input"` + 「保存」`data-act="party-rename-save"`（PUT `/api/me/adventure-parties/{id}`）。
- 创建区：输入 `data-act="party-create-input"` + 「创建」`data-act="party-create"`（POST）。
- 删除：`confirmDialog` + DELETE；按钮 `:disabled="p.character_count > 0 || parties.length <= 1"`；后端 400 也会兜底（notifyError）。
- 增删改成功后重新 `load()` 并 `emit('changed')`。

- [ ] **Step 4: 实现 MyCharactersView 接入**

- 导入 `AdventurePartyModal`；`const partyModalOpen = ref(false)`。
- 页头按钮区（**放在「添加角色」按钮之后**，避免破坏既有 `wrapper.find('button')` 语义）：
```html
<button class="dnf-btn dnf-btn-sm" data-act="manage-parties"
        @click="partyModalOpen = true">冒险团管理</button>
```
- 角色卡片副标题追加团名（`MyCharactersView.vue` 中 `{{ jobGenderTitle(...) }} · {{ c.class_type }} · 名望 {{ c.fame }}` 后加 ` · {{ c.adventure_party_name }}`，`adventure_party_name` 为 null 时显示占位或不显示——用 `c.adventure_party_name ?? ''` 时注意别出现「· 名望 1 ·」尾缀，简单处理：`<template v-if="c.adventure_party_name"> · {{ c.adventure_party_name }}</template>`）。
- 模板末尾：
```html
<AdventurePartyModal :open="partyModalOpen"
                     @close="partyModalOpen = false"
                     @changed="load" />
```

- [ ] **Step 5: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/MyCharactersView.spec.ts src/components/AdventurePartyModal.spec.ts`
Expected: PASS（既有 MyCharactersView 用例若因 `wrapper.find('button')` 语义变化失败，检查按钮顺序保持「添加角色」为第一个 button）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AdventurePartyModal.vue frontend/src/components/AdventurePartyModal.spec.ts frontend/src/views/MyCharactersView.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "[feat] 我的角色页冒险团管理弹窗 + 卡片团名"
```

---

### Task 12: RosterPool 按冒险团分小节

**Files:**
- Modify: `frontend/src/components/RosterPool.vue`
- Modify: `frontend/src/components/RosterPool.spec.ts`

- [ ] **Step 1: 更新 fixture 并写失败测试**（`RosterPool.spec.ts`）

给 `c1..c4` 补 `adventure_party_id/adventure_party_name`，例如：
```ts
const c1: Character = { ..., adventure_party_id: 100, adventure_party_name: '甲团' }
const c2: Character = { ..., adventure_party_id: 100, adventure_party_name: '甲团' }
const c3: Character = { ..., adventure_party_id: 200, adventure_party_name: '乙团' }
const c4: Character = { ...c1, id: 13, name: '弱剑', adventure_party_id: 100, adventure_party_name: '甲团' }
```
新增用例：
```ts
it('用户组下按冒险团分小节，小节头显示团名与角色数', () => {
  const w = mountPool()
  const user1 = w.find('[data-test="pool-user"]')
  expect(user1.text()).toContain('甲团')
  expect(w.find('[data-party-id="100"]').text()).toContain('甲团')
  expect(w.findAll('[data-test="pool-party"]').length).toBe(2)  // 甲团(用户1) + 乙团(用户2)
})
it('团小节可折叠：收起后该团角色不渲染', async () => {
  const w = mountPool()
  await w.find('[data-party-id="100"]').trigger('click')
  expect(w.find('[data-act="pool-char-10"]').exists()).toBe(false)
  expect(w.find('[data-act="pool-char-11"]').exists()).toBe(false)
  expect(w.find('[data-act="pool-char-12"]').exists()).toBe(true)  // 乙团仍在
})
it('同用户多团：角色按团分开渲染', () => {
  const w = mountPool({ signups: [{ user: u1, created_at: null,
    characters: [c1, c2, { ...c1, id: 20, name: '小号', adventure_party_id: 300, adventure_party_name: '小号团' }] }] })
  expect(w.findAll('[data-test="pool-party"]').length).toBe(2)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: 新增用例 FAIL（无 `data-party-id`）。

- [ ] **Step 3: 实现 `RosterPool.vue`**

- `groups` computed 改为两层：
```ts
interface PoolParty { id: number | null; name: string; chars: Character[] }
interface PoolUser { user: User; parties: PoolParty[] }

function groupByParty(chars: Character[]): PoolParty[] {
  const map = new Map<number | null, Character[]>()
  for (const c of chars) {
    const k = c.adventure_party_id
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(c)
  }
  return [...map.entries()].sort((a, b) => (a[0] ?? Infinity) - (b[0] ?? Infinity))
    .map(([id, list]) => ({ id, name: id == null ? '未分组' : (list[0].adventure_party_name ?? '冒险团'),
                            chars: sortByPower(list) }))
}
const groups = computed(() => props.signups
  .filter(s => s.characters.length > 0)
  .map(s => ({ user: s.user, parties: groupByParty(s.characters) })))
```
- 折叠态：保留 `collapsed`（用户组）；新增 `collapsedParty = ref<Set<number>>(new Set())` + `toggleParty(pid)`。**两个 Set 独立**（团 id 与用户 id 可撞号）。
- 模板：`.pool-user` 组内 `v-if="!collapsed.has(g.user.id)"` 下：
```html
<div v-for="p in g.parties" :key="p.id ?? '__u'" class="pool-party" data-test="pool-party">
  <div class="pool-party-head" :data-party-id="p.id ?? '__u'" @click="toggleParty(p.id ?? -1)">
    <span style="color:var(--dnf-text-muted);width:12px;display:inline-block">
      {{ collapsedParty.has(p.id ?? -1) ? '▸' : '▾' }}
    </span>{{ p.name }}<span style="color:var(--dnf-text-faint);font-size:12px">（{{ p.chars.length }}）</span>
  </div>
  <div v-if="!collapsedParty.has(p.id ?? -1)">
    <div v-for="c in p.chars" :key="c.id" class="pool-char" ...existing 渲染...>
  </div>
</div>
```
- `toggleParty(pid: number)`：`collapsedParty` 内 toggle（无团角色用哨兵 `-1`）。
- **角色行 `.pool-char` 的现有标记/属性必须原样保留**（`data-act="pool-char-{id}"`、`blocked/holding/slack` 类、`划水`/`推荐→队色` 角标、图标与战力文本）——只改外层嵌套结构，不动行内逻辑。

- [ ] **Step 4: 运行确认通过（含既有 15 例回归）**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: 全 PASS。若既有用例（如「组内按战力降序」用 `.pool-user.findAll('.pool-char')`）仍成立——角色仍在 `.pool-user` 内。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RosterPool.vue frontend/src/components/RosterPool.spec.ts
git commit -m "[feat] 编队角色池按冒险团分小节（可折叠）"
```

---

### Task 13: AdminUsersView 角色查询表加冒险团列

**Files:**
- Modify: `frontend/src/views/AdminUsersView.vue`
- Modify: `frontend/src/views/AdminUsersView.spec.ts`

- [ ] **Step 1: 写失败测试**（`AdminUsersView.spec.ts` 补；query fixture 补 `adventure_party_id/adventure_party_name`）

```ts
it('角色查询表显示冒险团列', async () => {
  apiMock.get.mockResolvedValueOnce({ items: [{
    id: 9, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出' as const, fame: 100,
    simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    owner_id: 2, owner_nickname: '阿甲', owner_username: 'a', owner_is_banned: false,
    adventure_party_id: 1, adventure_party_name: '阿甲的冒险团',
  }], total: 1 })
  const wrapper = mount(AdminUsersView, { global: { stubs: { AdminNav: true, AdminUserCharactersModal: true } } })
  await flushPromises()
  expect(wrapper.text()).toContain('冒险团')          // 表头
  expect(wrapper.text()).toContain('阿甲的冒险团')    // 行值
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: 新增用例 FAIL（无「冒险团」文本）。

- [ ] **Step 3: 实现**（`AdminUsersView.vue`）

表头 `<th scope="col">归属玩家</th>` 前加 `<th scope="col">冒险团</th>`；行对应 `</td>`（归属玩家单元格前）加 `<td>{{ c.adventure_party_name ?? '—' }}</td>`。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/AdminUsersView.vue frontend/src/views/AdminUsersView.spec.ts
git commit -m "[feat] 用户管理角色查询表显示冒险团列"
```

---

### Task 14: 前端全量构建 + 测试回归

**Files:**（无新增）

- [ ] **Step 1: 全量构建**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: PASS（vue-tsc + vite）。

- [ ] **Step 2: 全量测试**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run`
Expected: 全 PASS。若有失败（如 RosterView.spec 依赖 RosterPool 结构、SignupModal 等），修复。

- [ ] **Step 3: 后端全量测试再确认**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest -q`
Expected: 全 PASS。

- [ ] **Step 4: Commit（如有修复）**

```bash
git add -A
git commit -m "[fix] 冒险团前端回归修复"
```

---

## 验收清单（对照 spec）

- [ ] 注册（web/QQ）即建「{昵称}的冒险团」；存量库迁移回填初始团并挂存量角色（幂等）。
- [ ] 成员可 GET/POST/PUT/DELETE 自己的冒险团；删除拦截（有角色 400 / 只剩一个 400）。
- [ ] 角色创建/编辑可指定团（默认第一个团）；他人团 400；bot 建角色归第一团。
- [ ] admin 可读用户团、建角色指定团；角色查询表显示冒险团列。
- [ ] `character_out` 全路径带 `adventure_party_id/adventure_party_name`。
- [ ] 编队角色池「用户组 → 团小节（可折叠，团名+计数）」；用户组折叠/搜索不受影响。
- [ ] 前端构建（vue-tsc）与前后端测试全绿。
