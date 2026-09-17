# 副本管理 + 攻坚发起时间 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加副本预设管理（名称/人数/描述），发起攻坚时只能从预设选副本（规模锁定），并新增必填的发起时间字段。

**Architecture:** 后端新增 `Dungeon` 实体与管理员 CRUD 路由；`Raid` 的 `dungeon` 自由文本替换为 `dungeon_id` FK + 序列化时关联读取 `dungeon_name`，新增 `starts_at`；创建攻坚时规模从副本拷贝且不可变。前端 AdminView 增加副本管理区块，RaidListView 改造创建表单，列表/详情展示副本与时间。

**Tech Stack:** Python FastAPI + SQLAlchemy + SQLite；Vue 3 + TypeScript + Pinia + Vitest。

**规格参考:** `docs/superpowers/specs/2026-09-17-dungeon-management-design.md`

---

## 文件结构

后端：

- `backend/app/models.py` — 新增 `Dungeon`；`Raid` 移除 `dungeon`，新增 `dungeon_id` FK、`starts_at`
- `backend/app/schemas.py` — `DungeonIn/DungeonOut`；`RaidCreate/RaidUpdate/RaidListItem/RaidDetail` 调整
- `backend/app/services/raid_builder.py` — `create_raid` 改为按副本带入规模
- `backend/app/routers/dungeons.py` — 新路由（副本 CRUD）
- `backend/app/routers/raids.py` — 创建/编辑/列表/详情调整
- `backend/app/routers/public.py` — 公共列表字段调整
- `backend/app/main.py` — 注册 dungeons 路由
- `backend/app/migrations.py` — 幂等迁移脚本（存量库补列 + 回填）
- `backend/tests/helpers.py` — 新增 `make_dungeon` / `make_raid`
- `backend/tests/test_dungeons.py` — 新测试（Task 2 补回删除约束用例）
- `backend/tests/test_raids.py` — 更新到新契约
- `backend/tests/test_public.py` — 更新到新契约
- `backend/tests/test_ws.py` — 更新到新契约
- `backend/tests/test_migrations.py` — 新测试

前端：

- `frontend/src/types.ts` — `Raid`/`RaidListItem` 调整；新增 `Dungeon`
- `frontend/src/utils/datetime.ts` — 新增 `formatDateTime`
- `frontend/src/utils/datetime.spec.ts` — 新测试
- `frontend/src/views/AdminView.vue` — 新增副本管理区块
- `frontend/src/views/RaidListView.vue` — 创建表单改造 + 列表展示
- `frontend/src/views/RaidListView.spec.ts` — 新测试（选副本带入规模）
- `frontend/src/views/RaidDetailView.vue` — 头部展示
- `frontend/src/stores/raid.spec.ts` — 更新 `makeRaid()` 夹具

运行测试：

- 后端：`cd backend && ./.venv/bin/python -m pytest`
- 前端：`cd frontend && npm run test`；类型检查：`npm run build`

提交信息沿用仓库风格：`[fet]` 功能、`[fix]` 修复、`docs:` 文档。

---

## Task 1: 后端副本 CRUD

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/dungeons.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_dungeons.py`
- （`backend/tests/helpers.py` 在 Task 2 才新增辅助函数，本 Task 不动）

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_dungeons.py`：

```python
from .helpers import register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def test_dungeon_crud(client):
    ah = _admin(client)
    r = client.post("/api/dungeons", headers=ah,
                    json={"name": "巴卡尔", "size": 12, "description": "团本"})
    assert r.status_code == 200
    did = r.json()["id"]
    items = client.get("/api/dungeons", headers=ah).json()
    assert items[0]["name"] == "巴卡尔" and items[0]["size"] == 12
    r = client.put(f"/api/dungeons/{did}", headers=ah,
                   json={"name": "巴卡尔-困难", "size": 12, "description": ""})
    assert r.status_code == 200 and r.json()["name"] == "巴卡尔-困难"
    assert client.delete(f"/api/dungeons/{did}", headers=ah).status_code == 200

def test_dungeon_member_forbidden(client):
    h, _ = register_user(client, "p1", "甲")
    assert client.get("/api/dungeons", headers=h).status_code == 403
    assert client.post("/api/dungeons", headers=h,
                       json={"name": "x", "size": 12}).status_code == 403

def test_dungeon_size_validation(client):
    ah = _admin(client)
    assert client.post("/api/dungeons", headers=ah,
                       json={"name": "x", "size": 10}).status_code == 400

def test_dungeon_dup_name(client):
    ah = _admin(client)
    client.post("/api/dungeons", headers=ah, json={"name": "巴卡尔", "size": 12})
    assert client.post("/api/dungeons", headers=ah,
                       json={"name": "巴卡尔", "size": 12}).status_code == 400

# 注意：删除被引用副本（400）的测试放在 Task 2 —— 它依赖攻坚新契约（dungeon_id/starts_at）
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_dungeons.py -v`
Expected: FAIL（404 No route / 无 /api/dungeons 路由）

- [ ] **Step 3: 新增 Dungeon 模型 + 改造 Raid 模型**

`backend/app/models.py`：import 加 `Text`；在 `Character` 之后新增：

```python
class Dungeon(Base):
    __tablename__ = "dungeons"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    size: Mapped[int] = mapped_column(Integer, default=12)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
```

`Raid` 类同步改造（**移除** `dungeon: Mapped[str]` 文本列，**新增** `dungeon_id` FK、`starts_at`，并显式声明 `dungeon` relationship —— 后续 `raid.dungeon.name` 靠它关联读取）：

```python
class Raid(Base):
    __tablename__ = "raids"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    dungeon_id: Mapped[int] = mapped_column(ForeignKey("dungeons.id"), index=True)
    size: Mapped[int] = mapped_column(Integer, default=12)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    dungeon: Mapped[Dungeon] = relationship()
    waves: Mapped[list["Wave"]] = relationship(back_populates="raid",
                                               order_by="Wave.index", cascade="all, delete-orphan")
```

> 说明：本 Task 改完 Raid 模型后，既有 `test_raids.py` / `test_public.py` / `test_ws.py` 会暂时不兼容（仍发旧的 `{name, size}`），属预期；Task 2 一并修复。

- [ ] **Step 4: 新增 schema**

`backend/app/schemas.py` 新增：

```python
class DungeonIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    size: int = 12
    description: str = Field(default="", max_length=2000)

class DungeonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    size: int
    description: str
    created_at: datetime
```

- [ ] **Step 5: 新增 dungeons 路由**

创建 `backend/app/routers/dungeons.py`：

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..db import get_db
from ..models import Dungeon, Raid
from ..schemas import DungeonIn, DungeonOut
from ..services.raid_builder import validate_size

router = APIRouter(prefix="/api/dungeons", tags=["dungeons"])

@router.get("", response_model=list[DungeonOut])
def list_dungeons(admin=Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(Dungeon).order_by(Dungeon.created_at.asc()).all()

@router.post("", response_model=DungeonOut)
def create_dungeon(body: DungeonIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    try:
        validate_size(body.size)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if db.query(Dungeon).filter(Dungeon.name == body.name).first():
        raise HTTPException(400, "副本名已存在")
    d = Dungeon(name=body.name, size=body.size, description=body.description)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d

@router.put("/{did}", response_model=DungeonOut)
def update_dungeon(did: int, body: DungeonIn, admin=Depends(require_admin),
                   db: Session = Depends(get_db)):
    d = db.get(Dungeon, did)
    if d is None:
        raise HTTPException(404, "副本不存在")
    try:
        validate_size(body.size)
    except ValueError as e:
        raise HTTPException(400, str(e))
    dup = db.query(Dungeon).filter(Dungeon.name == body.name, Dungeon.id != did).first()
    if dup:
        raise HTTPException(400, "副本名已存在")
    d.name = body.name
    d.size = body.size
    d.description = body.description
    db.commit()
    db.refresh(d)
    return d

@router.delete("/{did}")
def delete_dungeon(did: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    d = db.get(Dungeon, did)
    if d is None:
        raise HTTPException(404, "副本不存在")
    if db.query(Raid).filter(Raid.dungeon_id == did).first():
        raise HTTPException(400, "该副本已有攻坚记录，无法删除")
    db.delete(d)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 6: 注册路由**

`backend/app/main.py`：`from .routers import auth, dungeons, members, public, raids`；`app.include_router(dungeons.router)`。

- [ ] **Step 7: 运行测试验证通过**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_dungeons.py -v`
Expected: 4 passed（crud / member_forbidden / size_validation / dup_name）

- [ ] **Step 8: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/models.py backend/app/schemas.py \
  backend/app/routers/dungeons.py backend/app/main.py backend/tests/test_dungeons.py
git commit -m "[fet] 副本预设实体与管理路由"
```

---

## Task 2: 攻坚接入副本与发起时间（后端）

**Files:**
- Modify: `backend/app/services/raid_builder.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/raids.py`
- Modify: `backend/app/routers/public.py`
- Modify: `backend/tests/helpers.py`
- Modify: `backend/tests/test_raids.py`
- Modify: `backend/tests/test_public.py`
- Modify: `backend/tests/test_ws.py`
- Modify: `backend/tests/test_dungeons.py`（补回删除被引用副本的测试）

- [ ] **Step 1: 测试辅助函数**

`backend/tests/helpers.py` 追加：

```python
def make_dungeon(client, ah, name="副本", size=12, description=""):
    r = client.post("/api/dungeons", headers=ah,
                    json={"name": name, "size": size, "description": description})
    assert r.status_code == 200
    return r.json()

def make_raid(client, ah, dungeon_id=None, name="x", size=12, starts_at="2026-09-20T14:00:00"):
    if dungeon_id is None:
        dungeon_id = make_dungeon(client, ah, size=size)["id"]
    r = client.post("/api/raids", headers=ah,
                    json={"name": name, "dungeon_id": dungeon_id, "starts_at": starts_at})
    assert r.status_code == 200
    return r.json()
```

- [ ] **Step 2: 写失败测试（新契约）**

在 `backend/tests/test_raids.py` 顶部改为使用 helpers，并把所有 `client.post("/api/raids", headers=ah, json={"name": ..., "size": ...})` 替换为 `make_raid(client, ah, ...)`。逐个函数替换：

| 原调用 | 替换 |
|---|---|
| `client.post("/api/raids", headers=h, json={"name": "巴卡尔", "size": 12})`（成员 403） | 先把 `ah = _admin(client)` 与 `did = make_dungeon(client, ah)["id"]` 提到成员调用**之前**，再 `client.post("/api/raids", headers=h, json={"name": "x", "dungeon_id": did, "starts_at": "2026-09-20T14:00:00"})` |
| `client.post("/api/raids", headers=ah, json={"name": "x", "size": 12})` | `make_raid(client, ah)["id"]` |
| `client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]` | `make_raid(client, ah)["id"]` |

> 注：原 `test_create_raid_only_admin` 中 `ah = _admin(client)` 声明在成员 403 分支之后，替换时必须上移。

`test_raids.py` 中用到 raid id 的测试：`test_create_raid_only_admin`（成员 403 分支 + 管理员创建分支）、`test_lock_unlock`、`test_member_fill_remove_duty`、`test_cannot_fill_others_characters`、`test_character_unique_across_waves`、`test_one_character_per_player_per_wave`、`test_fill_replace_moves_conflicting_slot`、`test_fill_replace_moves_same_character`、`test_main_healer_limit`、`test_full_squad_composition_error`、`test_locked_raid_only_admin_edits`、`test_wave_add_and_delete_rules`、`test_delete_character_in_use_blocked`。

`test_create_raid_rejects_bad_size` 删除（非法规模校验已由 `test_dungeon_size_validation` 覆盖，见 Task 1）。

`test_public.py` 的 `test_public_list_and_wave` 中 `rid = client.post("/api/raids", headers=ah, json={"name": "巴卡尔", "size": 12})` 改为 `rid = make_raid(client, ah, name="巴卡尔")["id"]`（import 处改为 `from .helpers import make_raid, register_user`）。

`test_ws.py`：文件目前**没有**任何 `from .helpers import ...` 行，需在文件顶部**新增**一行 `from .helpers import make_raid`；其中创建攻坚的 `client.post("/api/raids", headers=ah, json={"name": ..., "size": ...})` 调用替换为 `make_raid(client, ah, ...)["id"]`。

`backend/tests/test_dungeons.py` 补回依赖新契约的删除约束测试，且文件顶部 import 改为 `from .helpers import make_dungeon, make_raid, register_user`：

```python
def test_dungeon_delete_blocked_if_used(client):
    ah = _admin(client)
    did = client.post("/api/dungeons", headers=ah,
                      json={"name": "巴卡尔", "size": 12}).json()["id"]
    client.post("/api/raids", headers=ah, json={
        "name": "x", "dungeon_id": did, "starts_at": "2026-09-20T14:00:00"})
    assert client.delete(f"/api/dungeons/{did}", headers=ah).status_code == 400
```

再追加新契约测试：

```python
def test_create_raid_size_from_dungeon(client):
    ah = _admin(client)
    d = make_dungeon(client, ah, name="16人本", size=16)
    r = client.post("/api/raids", headers=ah, json={
        "name": "x", "dungeon_id": d["id"], "starts_at": "2026-09-20T14:00:00"})
    assert r.status_code == 200
    assert r.json()["size"] == 16
    assert r.json()["dungeon_name"] == "16人本"
    assert r.json()["starts_at"] == "2026-09-20T14:00:00"

def test_create_raid_name_defaults_to_dungeon(client):
    ah = _admin(client)
    d = make_dungeon(client, ah, name="巴卡尔")
    r = client.post("/api/raids", headers=ah, json={
        "dungeon_id": d["id"], "starts_at": "2026-09-20T14:00:00"})
    assert r.status_code == 200 and r.json()["name"] == "巴卡尔"

def test_create_raid_requires_starts_at(client):
    ah = _admin(client)
    d = make_dungeon(client, ah)
    assert client.post("/api/raids", headers=ah,
                       json={"name": "x", "dungeon_id": d["id"]}).status_code == 422

def test_create_raid_unknown_dungeon(client):
    ah = _admin(client)
    assert client.post("/api/raids", headers=ah, json={
        "name": "x", "dungeon_id": 999,
        "starts_at": "2026-09-20T14:00:00"}).status_code == 404

def test_update_raid_name_starts_at_only(client):
    ah = _admin(client)
    d = make_dungeon(client, ah, size=12)
    rid = make_raid(client, ah, dungeon_id=d["id"])["id"]
    r = client.put(f"/api/raids/{rid}", headers=ah, json={
        "name": "改名", "starts_at": "2026-09-21T10:30:00"})
    assert r.status_code == 200
    assert r.json()["name"] == "改名"
    assert r.json()["starts_at"] == "2026-09-21T10:30:00"
    assert r.json()["size"] == 12
```

- [ ] **Step 3: 运行测试验证失败**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_raids.py tests/test_public.py -v`
Expected: FAIL（422 缺 dungeon_id/starts_at，或旧字段不存在）

- [ ] **Step 4: 修改 schema**

`backend/app/schemas.py` 的 Raid 相关改为：

```python
class RaidCreate(BaseModel):
    name: str | None = None
    dungeon_id: int
    starts_at: datetime

class RaidUpdate(BaseModel):
    name: str | None = None
    starts_at: datetime | None = None

class RaidListItem(BaseModel):
    id: int
    name: str
    dungeon_id: int
    dungeon_name: str
    size: int
    locked: bool
    starts_at: datetime
    wave_count: int

class RaidDetail(BaseModel):
    id: int
    name: str
    dungeon_id: int
    dungeon_name: str
    size: int
    locked: bool
    starts_at: datetime
    waves: list[WaveOut]
```

- [ ] **Step 5: 修改 raid_builder**

`backend/app/services/raid_builder.py`：

```python
def create_raid(db: Session, name: str, dungeon: Dungeon, starts_at: datetime,
                created_by: int) -> Raid:
    raid = Raid(name=name, dungeon_id=dungeon.id, size=dungeon.size,
                starts_at=starts_at, created_by=created_by)
    db.add(raid)
    db.flush()
    create_wave(db, raid)
    return raid
```

import 增加 `from datetime import datetime` 与 `from ..models import Dungeon, Raid, Slot, Wave`（Dungeon 加入）。

- [ ] **Step 6: 修改 raids 路由**

`backend/app/routers/raids.py`：

- import 增加 `Dungeon`。
- `_detail` 返回增加 `dungeon_id=raid.dungeon_id, dungeon_name=raid.dungeon.name, starts_at=raid.starts_at`，移除 `dungeon=raid.dungeon`。
- `list_raids` 的 `RaidListItem(...)` 同样改为 `dungeon_id=r.dungeon_id, dungeon_name=r.dungeon.name, starts_at=r.starts_at`。
- `create_raid`：

```python
@router.post("")
def create_raid(body: RaidCreate, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    dungeon = db.get(Dungeon, body.dungeon_id)
    if dungeon is None:
        raise HTTPException(404, "副本不存在")
    name = body.name or dungeon.name
    raid = _build_raid(db, name, dungeon, body.starts_at, admin.id)
    db.commit()
    return _detail(db, raid)
```

- `update_raid`：删掉 `body.dungeon` 分支，改为 `if body.starts_at is not None: raid.starts_at = body.starts_at`；`name` 分支保留。

- [ ] **Step 7: 修改公共路由**

`backend/app/routers/public.py` 的 `RaidListItem(...)` 改为：

```python
RaidListItem(id=r.id, name=r.name, dungeon_id=r.dungeon_id,
             dungeon_name=r.dungeon.name, size=r.size, locked=r.locked,
             starts_at=r.starts_at, wave_count=len(r.waves))
```

- [ ] **Step 8: 运行全部后端测试验证通过**

Run: `cd backend && ./.venv/bin/python -m pytest`
Expected: 全部通过（含既有 test_auth/test_members/test_ws/test_smoke、Task 1 的 test_dungeons.py 含补回的删除约束测试）

- [ ] **Step 9: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/schemas.py backend/app/services/raid_builder.py \
  backend/app/routers/raids.py backend/app/routers/public.py backend/tests/helpers.py \
  backend/tests/test_raids.py backend/tests/test_public.py backend/tests/test_ws.py \
  backend/tests/test_dungeons.py
git commit -m "[fet] 攻坚从副本预设带入规模并必填发起时间"
```

---

## Task 3: 数据迁移脚本

**Files:**
- Create: `backend/app/migrations.py`
- Create: `backend/tests/test_migrations.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_migrations.py`：

```python
from sqlalchemy import create_engine, text

from app.migrations import migrate_dungeons

def test_migrate_legacy_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE raids (
            id INTEGER PRIMARY KEY, name VARCHAR(128), dungeon VARCHAR(64),
            size INTEGER, locked BOOLEAN, created_by INTEGER, created_at DATETIME)"""))
        conn.execute(text("""INSERT INTO raids (name, dungeon, size, locked, created_by, created_at)
            VALUES ('攻坚1', '巴卡尔', 12, 0, 1, '2026-09-01 10:00:00')"""))
        conn.execute(text("""INSERT INTO raids (name, dungeon, size, locked, created_by, created_at)
            VALUES ('攻坚2', '', 12, 0, 1, '2026-09-02 10:00:00')"""))
    migrate_dungeons(engine)
    with engine.begin() as conn:
        rows = conn.execute(text(
            "SELECT name, dungeon_id, starts_at FROM raids ORDER BY id")).all()
        assert rows[0].dungeon_id is not None and rows[0].starts_at is not None
        assert rows[1].dungeon_id is not None
        names = [r[0] for r in conn.execute(text("SELECT name FROM dungeons")).all()]
        assert "巴卡尔" in names and "未指定" in names
    migrate_dungeons(engine)  # 幂等
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: FAIL（ModuleNotFoundError: app.migrations）

- [ ] **Step 3: 实现迁移函数**

创建 `backend/app/migrations.py`：

```python
from datetime import datetime

from sqlalchemy import Engine, text


def migrate_dungeons(engine: Engine) -> None:
    """为存量库补建副本预设与 raids.dungeon_id / starts_at（幂等）。

    说明：规格 §6 提及重建 raids 表；此处改用 ALTER ADD COLUMN + 应用层强制必填，
    避免外键约束（waves.raid_id）下重建表的复杂度，功能等价。
    """
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)  # 创建 dungeons 表（若缺）
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(raids)")).all()}
        if "dungeon_id" not in cols:
            conn.execute(text("ALTER TABLE raids ADD COLUMN dungeon_id INTEGER REFERENCES dungeons(id)"))
        if "starts_at" not in cols:
            conn.execute(text("ALTER TABLE raids ADD COLUMN starts_at DATETIME"))
        # 仅存量库才有 dungeon 文本列；新库（无该列）直接跳过回填，保证「无存量库仅建表、不报错」
        if "dungeon" in cols:
            names = [row[0] for row in conn.execute(text(
                "SELECT DISTINCT dungeon FROM raids WHERE dungeon IS NOT NULL AND dungeon <> ''")).all()]
            if conn.execute(text(
                    "SELECT COUNT(*) FROM raids WHERE dungeon IS NULL OR dungeon = ''")).scalar():
                names.append("未指定")
            for n in names:
                if not conn.execute(text("SELECT id FROM dungeons WHERE name = :n"),
                                    {"n": n}).scalar():
                    conn.execute(
                        text("INSERT INTO dungeons (name, size, description, created_at)"
                             " VALUES (:n, 12, '', :t)"),
                        {"n": n, "t": datetime.now()})
            conn.execute(text("""
                UPDATE raids SET dungeon_id = (
                    SELECT d.id FROM dungeons d
                    WHERE d.name = CASE WHEN raids.dungeon IS NULL OR raids.dungeon = ''
                                        THEN '未指定' ELSE raids.dungeon END
                ) WHERE dungeon_id IS NULL"""))
        conn.execute(text("UPDATE raids SET starts_at = created_at WHERE starts_at IS NULL"))


if __name__ == "__main__":
    from .db import engine
    migrate_dungeons(engine)
    print("dungeons 迁移完成")
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/migrations.py backend/tests/test_migrations.py
git commit -m "[fet] 存量库副本迁移脚本（幂等）"
```

---

## Task 4: 前端类型与时间工具

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/utils/datetime.ts`
- Create: `frontend/src/utils/datetime.spec.ts`
- Modify: `frontend/src/stores/raid.spec.ts`
- Modify: `frontend/src/views/RaidListView.vue`（仅 `dungeon`→`dungeon_name` 一行展示替换）
- Modify: `frontend/src/views/RaidDetailView.vue`（仅 `dungeon`→`dungeon_name` 一行展示替换）

- [ ] **Step 1: 写失败测试（工具函数）**

创建 `frontend/src/utils/datetime.ts` 同目录的 `frontend/src/utils/datetime.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { formatDateTime } from './datetime'

describe('formatDateTime', () => {
  it('formats iso to 月日 时分', () => {
    expect(formatDateTime('2026-09-20T14:00:00')).toBe('9月20日 14:00')
  })
  it('falls back to raw string on invalid input', () => {
    expect(formatDateTime('nope')).toBe('nope')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npm run test`
Expected: FAIL（ModuleNotFoundError: ./datetime）

- [ ] **Step 3: 实现工具函数**

创建 `frontend/src/utils/datetime.ts`：

```ts
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}月${dd}日 ${hh}:${mi}`
}
```

- [ ] **Step 4: 更新类型**

`frontend/src/types.ts`：

```ts
export interface Dungeon { id: number; name: string; size: number; description: string; created_at: string }
export interface Raid { id: number; name: string; dungeon_id: number; dungeon_name: string;
  size: number; locked: boolean; starts_at: string; waves: Wave[] }
export interface RaidListItem { id: number; name: string; dungeon_id: number; dungeon_name: string;
  size: number; locked: boolean; starts_at: string; wave_count: number }
```

- [ ] **Step 5: 更新测试夹具**

`frontend/src/stores/raid.spec.ts` 的 `makeRaid()` 中 `dungeon: ''` 替换为 `dungeon_id: 1, dungeon_name: '副本', starts_at: '2026-09-20T14:00:00'`。

- [ ] **Step 6: 同步两个视图的 `dungeon` 引用（否则 `npm run build` 类型检查不过）**

`frontend/src/views/RaidListView.vue` 第 50 行左右：`<span v-if="r.dungeon" style="color:#666">{{ r.dungeon }}</span>` 改为 `<span v-if="r.dungeon_name" style="color:#666">{{ r.dungeon_name }}</span>`。

`frontend/src/views/RaidDetailView.vue` 第 83 行左右：`<span v-if="store.raid.dungeon" style="color:#666">{{ store.raid.dungeon }}</span>` 改为 `<span v-if="store.raid.dungeon_name" style="color:#666">{{ store.raid.dungeon_name }}</span>`。

> 这两处仅做属性改名，不引入 `formatDateTime`（留在 Task 6/7 处理）。Task 6/7 中对应步骤会注明「已在本 Task 完成」。

- [ ] **Step 7: 运行测试与类型检查验证通过**

Run: `cd frontend && npm run test && npm run build`
Expected: PASS；类型检查无错误（RaidListView/RaidDetailView 的 dungeon 引用已随类型同步替换）

- [ ] **Step 8: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/types.ts frontend/src/utils/datetime.ts \
  frontend/src/utils/datetime.spec.ts frontend/src/stores/raid.spec.ts \
  frontend/src/views/RaidListView.vue frontend/src/views/RaidDetailView.vue
git commit -m "[fet] 前端副本类型与发起时间格式化工具"
```

---

## Task 5: AdminView 副本管理界面

**Files:**
- Modify: `frontend/src/views/AdminView.vue`

- [ ] **Step 1: script 增加副本状态**

`frontend/src/views/AdminView.vue` script 部分：

- import 加 `Dungeon` 类型。
- 新增状态：`const dungeons = ref<Dungeon[]>([])`、`const dgName = ref('')`、`const dgSize = ref(12)`、`const dgDesc = ref('')`、`const editingId = ref<number | null>(null)`、`const dgError = ref('')`、`const dgBusy = ref(false)`。
- `load()` 增加 `dungeons.value = await api.get<Dungeon[]>('/api/dungeons')`。
- 新增函数：

```ts
async function saveDungeon() {
  dgBusy.value = true; dgError.value = ''
  try {
    if (editingId.value) {
      await api.put(`/api/dungeons/${editingId.value}`,
        { name: dgName.value, size: dgSize.value, description: dgDesc.value })
    } else {
      await api.post('/api/dungeons',
        { name: dgName.value, size: dgSize.value, description: dgDesc.value })
    }
    editingId.value = null; dgName.value = ''; dgSize.value = 12; dgDesc.value = ''
    await load()
  } catch (e: any) { dgError.value = e.message }
  finally { dgBusy.value = false }
}

function editDungeon(d: Dungeon) {
  editingId.value = d.id; dgName.value = d.name; dgSize.value = d.size; dgDesc.value = d.description
}

async function delDungeon(d: Dungeon) {
  if (!confirm(`确认删除副本「${d.name}」？`)) return
  try { await api.del(`/api/dungeons/${d.id}`); await load() }
  catch (e: any) { alert(e.message) }
}
```

- [ ] **Step 2: template 增加副本区块**

在「成员」section 之后新增：

```html
<section style="margin:16px 0">
  <h3>副本管理</h3>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <input v-model="dgName" placeholder="副本名称" />
    <select v-model.number="dgSize">
      <option v-for="s in [4,8,12,16,20]" :key="s" :value="s">{{ s }} 人</option>
    </select>
    <input v-model="dgDesc" placeholder="描述（可选）" />
    <button :disabled="dgBusy" @click="saveDungeon">{{ editingId ? '保存' : '新增' }}</button>
  </div>
  <p v-if="dgError" style="color:#c62828">{{ dgError }}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:12px">
    <tr><th style="text-align:left">副本</th><th>人数</th><th style="text-align:left">描述</th><th></th></tr>
    <tr v-for="d in dungeons" :key="d.id">
      <td>{{ d.name }}</td><td>{{ d.size }}</td><td>{{ d.description }}</td>
      <td style="white-space:nowrap">
        <button @click="editDungeon(d)">编辑</button>
        <button @click="delDungeon(d)">删除</button>
      </td>
    </tr>
  </table>
</section>
```

- [ ] **Step 3: 类型检查验证**

Run: `cd frontend && npm run build`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/views/AdminView.vue
git commit -m "[fet] 管理面板副本管理区块"
```

---

## Task 6: RaidListView 创建表单与列表展示

**Files:**
- Modify: `frontend/src/views/RaidListView.vue`
- Create: `frontend/src/views/RaidListView.spec.ts`

- [ ] **Step 1: 写失败测试（选副本带入规模）**

创建 `frontend/src/views/RaidListView.spec.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RaidListView from './RaidListView.vue'
import { useAuthStore } from '../stores/auth'
import type { Dungeon, RaidListItem } from '../types'

// @vitest-environment jsdom

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}))

const dungeons: Dungeon[] = [{ id: 7, name: '巴卡尔', size: 16, description: '', created_at: '' }]

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/raids') return [] as RaidListItem[]
    if (url === '/api/dungeons') return dungeons
    return []
  })
})

describe('RaidListView create form', () => {
  it('selecting a dungeon auto-fills name and shows locked size', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true }

    const wrapper = mount(RaidListView, {
      global: { plugins: [pinia], stubs: ['router-link'] },
    })
    await flushPromises()
    await wrapper.find('button').trigger('click')        // 展开创建表单
    await wrapper.find('select').setValue(7)             // 选择副本
    const inputs = wrapper.findAll('input')
    // 表单输入顺序为 [starts_at(datetime-local), name]，name 是第 2 个（自动填入副本名）
    expect((inputs[1].element as HTMLInputElement).value).toBe('巴卡尔')
    expect(wrapper.text()).toContain('规模锁定：16 人')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npm run test`
Expected: FAIL（旧组件无 dungeons select / 不满足断言）

- [ ] **Step 3: 改造 script**

`frontend/src/views/RaidListView.vue` script：

- import 增加 `Dungeon` 类型与 `formatDateTime`。
- `dungeon`/`size` ref 替换为：

```ts
const dungeonId = ref<number | null>(null)
const startsAt = ref('')
const dungeons = ref<Dungeon[]>([])
const sizeLocked = ref<number | null>(null)
```

- `load()` 增加 `dungeons.value = await api.get<Dungeon[]>('/api/dungeons')`。
- 替换 `create()` 与新增 `onDungeonChange()`：

```ts
async function load() {
  raids.value = await api.get<RaidListItem[]>('/api/raids')
  dungeons.value = await api.get<Dungeon[]>('/api/dungeons')
}

function onDungeonChange() {
  const d = dungeons.value.find(x => x.id === dungeonId.value)
  sizeLocked.value = d ? d.size : null
  if (d && !name.value) name.value = d.name
}

async function create() {
  if (!dungeonId.value || !startsAt.value) {
    error.value = '请选择副本并填写发起时间'; return
  }
  creating.value = true; error.value = ''
  try {
    await api.post('/api/raids', {
      name: name.value || undefined,
      dungeon_id: dungeonId.value,
      starts_at: startsAt.value,
    })
    showCreate.value = false; name.value = ''; dungeonId.value = null
    startsAt.value = ''; sizeLocked.value = null
    await load()
  } catch (e: any) { error.value = e.message }
  finally { creating.value = false }
}
```

- [ ] **Step 4: 改造 template**

创建表单（`v-if="showCreate"` div 内）替换为：

```html
<div style="margin:6px 0">
  <select v-model.number="dungeonId" @change="onDungeonChange">
    <option :value="null" disabled>选择副本</option>
    <option v-for="d in dungeons" :key="d.id" :value="d.id">{{ d.name }}（{{ d.size }} 人）</option>
  </select>
  <span v-if="sizeLocked" style="margin-left:8px;color:#666">规模锁定：{{ sizeLocked }} 人</span>
</div>
<div style="margin:6px 0">
  <input v-model="startsAt" type="datetime-local" placeholder="发起时间" />
</div>
<div style="margin:6px 0">
  <input v-model="name" placeholder="攻坚名称（默认副本名）" />
</div>
```

列表项展示：`dungeon` → `dungeon_name` 的替换已在 Task 4 完成，此处**仅**在 `{{ r.size }} 人 · {{ r.wave_count }} 波` 后追加发起时间：

```html
<span style="color:#999">{{ r.size }} 人 · {{ r.wave_count }} 波 · {{ formatDateTime(r.starts_at) }}</span>
```

- [ ] **Step 5: 运行测试与类型检查验证通过**

Run: `cd frontend && npm run test && npm run build`
Expected: 全通过；无类型错误

- [ ] **Step 6: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/views/RaidListView.vue frontend/src/views/RaidListView.spec.ts
git commit -m "[fet] 攻坚列表创建表单选副本并填发起时间"
```

---

## Task 7: RaidDetailView 头部展示

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`

- [ ] **Step 1: script 引入工具**

`frontend/src/views/RaidDetailView.vue`：`import { formatDateTime } from '../utils/datetime'`。

- [ ] **Step 2: template 更新头部**

`dungeon` → `dungeon_name` 的替换已在 Task 4 完成，此处**仅**把 `{{ store.raid.size }} 人` 改为 `{{ store.raid.size }} 人 · {{ formatDateTime(store.raid.starts_at) }}`。

- [ ] **Step 3: 类型检查验证**

Run: `cd frontend && npm run build`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/views/RaidDetailView.vue
git commit -m "[fet] 攻坚详情展示副本与发起时间"
```

---

## 最终验证

- [ ] 后端：`cd backend && ./.venv/bin/python -m pytest` — 全部通过
- [ ] 前端：`cd frontend && npm run test && npm run build` — 全部通过、无类型错误
- [ ] 迁移脚本冒烟：`cd backend && ./.venv/bin/python -m app.migrations` — 打印「dungeons 迁移完成」（无存量库时仅建表，不报错）
- [ ] 手动冒烟：启动后端 + 前端，管理员新增副本 → 发起攻坚选择副本（人数锁定）→ 填时间 → 列表/详情显示副本名、规模、时间
