# 职业体系重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 角色职业从「手选 输出/辅助」重构为「按职业树选具体职业」，`class_type` 由后端按 5 个辅助职业推导；角色管理与攻坚排表显示职业图标；存量角色数据清空重来。

**Architecture:** 后端新增 `jobs.py` 模块（加载仓库根 `职业信息.json`、`SUPPORT_JOBS` 推导、职业树），`Character` 新增必填 `job_name`，`class_type` 在写库时推导；新增 `GET /api/jobs` 下发带 `class_type` 的职业树；`images/adventure` 挂载为 `/images`。前端 `MyCharactersView` 用「大类图标网格 → 子职业图标网格」选职业，列表/排表显示子职业图标，输入区按子职业 `class_type` 切换。

**Tech Stack:** Python FastAPI + SQLAlchemy + SQLite；Vue 3 + TypeScript + Pinia + Vitest。

**规格参考:** `docs/superpowers/specs/2026-09-17-job-system-design.md`

---

## 文件结构

后端：

- `backend/app/config.py` — Settings 增 `job_data_path`、`images_dir`
- `backend/app/jobs.py` — 新模块（加载 JSON、`SUPPORT_JOBS`、`class_type_for`、`job_meta`、`job_tree`）
- `backend/app/schemas.py` — `CharacterIn/Out`、`SlotOut` 调整；新增 `JobChild/JobCategory`
- `backend/app/routers/jobs.py` — 新路由 `GET /api/jobs`
- `backend/app/routers/members.py` — 校验 `job_name`、推导 `class_type`、显式构造 `CharacterOut`
- `backend/app/routers/raids.py` — `_slot_out` 增 `job_name`/`job_title`
- `backend/app/models.py` — `Character` 增 `job_name`
- `backend/app/main.py` — 注册 jobs 路由、挂载 `/images`
- `backend/app/migrations.py` — 新增 `migrate_jobs`
- `backend/app/db.py` — `init_db` 调用 `migrate_jobs`
- `backend/tests/test_jobs.py` — 新测试
- `backend/tests/test_members.py` — 更新 + 新测试
- `backend/tests/test_raids.py` — `class_type`→`job_name` 机械替换 + slot job 字段断言
- `backend/tests/test_public.py` — `class_type`→`job_name` 一处
- `backend/tests/test_migrations.py` — 新增 `migrate_jobs` 测试

前端：

- `frontend/src/types.ts` — Character/Slot 增字段；新增 `JobChild/JobCategory`
- `frontend/src/lib/job.ts` — 新工具（`jobIcon`/`categoryIcon`/`ICON_FALLBACK`）
- `frontend/src/lib/job.spec.ts` — 新测试
- `frontend/src/api/client.ts` — 增 `getJobs()`
- `frontend/src/stores/raid.ts` — `slot:removed` 清空 job 字段
- `frontend/src/stores/raid.spec.ts` — 夹具补 `job_name`/`job_title`
- `frontend/src/views/MyCharactersView.vue` — 职业选择器 + 列表图标
- `frontend/src/views/MyCharactersView.spec.ts` — 新测试
- `frontend/src/components/CharacterPickerModal.vue` — 子职业图标 + 职业名
- `frontend/src/components/SlotCell.vue` — 子职业小图标 + 职业名
- `frontend/vite.config.ts` — `/images` 代理

部署：

- `Dockerfile` — 复制 `images/` 与 `职业信息.json`，设置 env

运行测试：

- 后端：`cd backend && ./.venv/bin/python -m pytest`
- 前端：`cd frontend && npm run test`；类型检查：`npm run build`

提交信息沿用仓库风格：`[fet]` 功能、`[fix]` 修复、`docs:` 文档。

> **既有测试的 `class_type`→`job_name` 机械替换映射**（Task 2 用到，全局替换）：
> - `"class_type": "输出"` → `"job_name": "weapon_master"`（剑魂，输出）
> - `"class_type": "辅助"` → `"job_name": "crusader_male"`（男圣骑士，辅助）

---

## Task 1: 后端职业数据模块 + `/api/jobs` 接口

**Files:**
- Modify: `backend/app/config.py`
- Create: `backend/app/jobs.py`
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/jobs.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_jobs.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_jobs.py`：

```python
from .helpers import register_user

def test_class_type_for_support_jobs():
    from app.jobs import class_type_for
    for j in ["crusader_male", "crusader_female", "paramedic", "enchantress", "muse"]:
        assert class_type_for(j) == "辅助"

def test_class_type_for_output_jobs():
    from app.jobs import class_type_for
    for j in ["weapon_master", "berserker", "elementalist"]:
        assert class_type_for(j) == "输出"

def test_jobs_endpoint_requires_login(client):
    assert client.get("/api/jobs").status_code == 401

def test_jobs_endpoint_tree(client):
    h, _ = register_user(client, "p1", "甲")
    r = client.get("/api/jobs", headers=h)
    assert r.status_code == 200
    tree = r.json()
    assert len(tree) > 0
    by_name = {c["name"]: c for cat in tree for c in cat["children"]}
    assert "empty" not in by_name
    assert by_name["enchantress"]["class_type"] == "辅助"
    assert by_name["enchantress"]["title"] == "知源·小魔女"
    assert by_name["weapon_master"]["class_type"] == "输出"
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_jobs.py -v`
Expected: FAIL（ModuleNotFoundError: app.jobs / 无 /api/jobs 路由）

- [ ] **Step 3: Settings 增配置**

`backend/app/config.py` 的 `Settings` 类末尾追加：

```python
    job_data_path: str = "../职业信息.json"
    images_dir: str = "../images/adventure"
```

- [ ] **Step 4: 新增 jobs 模块**

创建 `backend/app/jobs.py`：

```python
import json
from functools import lru_cache
from pathlib import Path

from .config import settings

SUPPORT_JOBS = frozenset({"crusader_male", "crusader_female", "paramedic",
                          "enchantress", "muse"})

@lru_cache(maxsize=1)
def _load() -> list[dict]:
    path = Path(settings.job_data_path)
    if not path.exists():
        raise FileNotFoundError(f"职业数据文件不存在: {path}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def class_type_for(job_name: str) -> str:
    return "辅助" if job_name in SUPPORT_JOBS else "输出"

def job_meta(job_name: str) -> dict | None:
    for cat in _load():
        for c in cat.get("children", []):
            if c.get("name") == job_name:
                return {"title": c.get("title", ""), "parent_name": cat.get("name", "")}
    return None

def job_tree() -> list[dict]:
    out = []
    for cat in _load():
        children = [c for c in cat.get("children", []) if c.get("name") != "empty"]
        if not children:
            continue
        out.append({
            "id": cat["id"], "name": cat["name"], "title": cat.get("title", ""),
            "children": [
                {"id": c.get("id"), "name": c["name"], "title": c.get("title", ""),
                 "class_type": class_type_for(c["name"])}
                for c in children
            ],
        })
    return out
```

> 说明：`../职业信息.json` 相对 cwd 解析。dev 下按 README 在 `backend/` 启动 uvicorn/pytest，即指向仓库根 `职业信息.json`；Docker 里用 env 覆盖（Task 7）。

- [ ] **Step 5: 新增 schema**

`backend/app/schemas.py` 末尾追加：

```python
class JobChild(BaseModel):
    id: int
    name: str
    title: str
    class_type: str

class JobCategory(BaseModel):
    id: int
    name: str
    title: str
    children: list[JobChild]
```

- [ ] **Step 6: 新增 jobs 路由**

创建 `backend/app/routers/jobs.py`：

```python
from fastapi import APIRouter, Depends

from .. import jobs as job_data
from ..auth import get_current_user
from ..models import User
from ..schemas import JobCategory

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

@router.get("", response_model=list[JobCategory])
def list_jobs(user: User = Depends(get_current_user)):
    return job_data.job_tree()
```

- [ ] **Step 7: 注册路由**

`backend/app/main.py`：`from .routers import auth, dungeons, jobs, members, public, raids`（在 import 列表加 `jobs`），并追加 `app.include_router(jobs.router)`。

- [ ] **Step 8: 运行测试验证通过**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_jobs.py -v`
Expected: 4 passed

- [ ] **Step 9: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/config.py backend/app/jobs.py \
  backend/app/schemas.py backend/app/routers/jobs.py backend/app/main.py backend/tests/test_jobs.py
git commit -m "[fet] 职业数据模块与 /api/jobs 接口"
```

---

## Task 2: Character 模型/schema + members/raids 路由改造 + 既有测试迁移

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/members.py`
- Modify: `backend/app/routers/raids.py`
- Modify: `backend/tests/test_members.py`
- Modify: `backend/tests/test_raids.py`
- Modify: `backend/tests/test_public.py`

- [ ] **Step 1: 写失败测试（新契约）**

在 `backend/tests/test_members.py` 追加：

```python
def test_support_job_derives_class_type(client):
    h, _ = register_user(client, "p9", "奶爸")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "小魔女", "job_name": "enchantress", "fame": 20000, "buff_amount": 9500})
    assert r.status_code == 200
    body = r.json()
    assert body["class_type"] == "辅助"
    assert body["job_title"] == "知源·小魔女"
    assert body["parent_name"] == "mage_female"

def test_invalid_job_name_rejected(client):
    h, _ = register_user(client, "p10", "乱来")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "x", "job_name": "not_a_job", "fame": 1})
    assert r.status_code == 400
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_members.py -v`
Expected: FAIL（422 无 job_name 字段 / class_type 已删除 / 400 未实现）

- [ ] **Step 3: Character 模型增 job_name**

`backend/app/models.py` 的 `Character` 类，`class_type` 行之前新增：

```python
    job_name: Mapped[str] = mapped_column(String(64))  # 具体职业（职业信息.json 的 children.name）
```

（`class_type` 列保留，写入时由 job 推导。）

- [ ] **Step 4: 修改 schema**

`backend/app/schemas.py` 中 `CharacterIn` / `CharacterOut` 改为：

```python
class CharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    job_name: str = Field(min_length=1, max_length=64)
    fame: int = Field(default=0, ge=0)
    simulated_damage: int | None = None
    sustained_dps: int | None = None
    buff_amount: int | None = None

class CharacterOut(BaseModel):
    id: int
    name: str
    job_name: str
    job_title: str
    parent_name: str
    class_type: str
    fame: int
    simulated_damage: int | None
    sustained_dps: int | None
    buff_amount: int | None
```

> 注：`CharacterOut` 删除 `model_config = ConfigDict(from_attributes=True)`——`job_title`/`parent_name` 非 ORM 属性，改为在 members 路由显式构造。

`SlotOut` 增加两字段（`character_id` 为空时同为 `None`）：

```python
    job_name: str | None
    job_title: str | None
```

- [ ] **Step 5: 改造 members 路由**

`backend/app/routers/members.py` 整体替换为：

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs as job_data
from ..auth import get_current_user
from ..db import get_db
from ..models import Character, Slot, User
from ..schemas import CharacterIn, CharacterOut

router = APIRouter(prefix="/api/me/characters", tags=["members"])

def _character_out(c: Character) -> CharacterOut:
    meta = job_data.job_meta(c.job_name) or {"title": "", "parent_name": ""}
    return CharacterOut(id=c.id, name=c.name, job_name=c.job_name,
                        job_title=meta["title"], parent_name=meta["parent_name"],
                        class_type=c.class_type, fame=c.fame,
                        simulated_damage=c.simulated_damage,
                        sustained_dps=c.sustained_dps, buff_amount=c.buff_amount)

def _validate_job(body) -> None:
    if job_data.job_meta(body.job_name) is None:
        raise HTTPException(400, "职业不存在")

@router.get("", response_model=list[CharacterOut])
def list_characters(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chars = db.scalars(
        select(Character).where(Character.user_id == user.id).order_by(Character.id)
    ).all()
    return [_character_out(c) for c in chars]

@router.post("", response_model=CharacterOut)
def create_character(body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    _validate_job(body)
    c = Character(user_id=user.id, name=body.name, job_name=body.job_name,
                  class_type=job_data.class_type_for(body.job_name), fame=body.fame,
                  simulated_damage=body.simulated_damage,
                  sustained_dps=body.sustained_dps, buff_amount=body.buff_amount)
    db.add(c)
    db.commit()
    db.refresh(c)
    return _character_out(c)

def _own_character(db: Session, cid: int, user: User) -> Character:
    c = db.get(Character, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "角色不存在")
    return c

@router.put("/{cid}", response_model=CharacterOut)
def update_character(cid: int, body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    _validate_job(body)
    c.name = body.name
    c.job_name = body.job_name
    c.class_type = job_data.class_type_for(body.job_name)
    c.fame = body.fame
    c.simulated_damage = body.simulated_damage
    c.sustained_dps = body.sustained_dps
    c.buff_amount = body.buff_amount
    db.commit()
    db.refresh(c)
    return _character_out(c)

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

- [ ] **Step 6: 改造 raids `_slot_out`**

`backend/app/routers/raids.py`：顶部加 `from .. import jobs as job_data`；`_slot_out` 改为：

```python
def _slot_out(slot: Slot) -> SlotOut:
    c = slot.character
    meta = job_data.job_meta(c.job_name) if c else None
    return SlotOut(
        id=slot.id, squad_index=slot.squad_index, row_index=slot.row_index,
        character_id=slot.character_id,
        character_name=c.name if c else None,
        character_class=c.class_type if c else None,
        job_name=c.job_name if c else None,
        job_title=(meta or {}).get("title") if c else None,
        fame=c.fame if c else None,
        simulated_damage=c.simulated_damage if c else None,
        sustained_dps=c.sustained_dps if c else None,
        buff_amount=c.buff_amount if c else None,
        owner_id=c.owner.id if c else None,
        owner_nickname=c.owner.nickname if c else None,
        duty=slot.duty, version=slot.version,
    )
```

- [ ] **Step 7: 迁移既有测试的 `class_type`→`job_name`**

按「文件结构」一节末尾的映射，对以下文件**全局替换**所有 `client.post("/api/me/characters", ...)` 请求体中的 `"class_type": "输出"` → `"job_name": "weapon_master"`、`"class_type": "辅助"` → `"job_name": "crusader_male"`：

- `backend/tests/test_raids.py`（全部输出/辅助角色创建处，含 `test_full_squad_composition_error` 的列表推导、`test_main_healer_limit` 两处辅助）
- `backend/tests/test_public.py`（`test_public_list_and_wave` 一处）

`test_members.py` 的 `test_cannot_touch_others_characters` 同样按映射全局替换；`test_character_crud` **不用**机械替换，直接用下面整段替换整个函数（顺带校验新响应字段）：

```python
def test_character_crud(client):
    h, _ = register_user(client, "player1", "阿伟")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 21000,
        "simulated_damage": 680000, "sustained_dps": 420000})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["class_type"] == "输出"
    assert r.json()["job_title"] == "极诣·剑魂"
    assert r.json()["parent_name"] == "swordman_male"
    assert r.json()["sustained_dps"] == 420000

    r = client.get("/api/me/characters", headers=h)
    assert len(r.json()) == 1
    assert r.json()[0]["job_title"] == "极诣·剑魂"

    r = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂·改", "job_name": "weapon_master", "fame": 22000,
        "simulated_damage": 700000, "sustained_dps": 430000})
    assert r.status_code == 200
    assert r.json()["name"] == "剑魂·改"

    r = client.delete(f"/api/me/characters/{cid}", headers=h)
    assert r.status_code == 200
    assert client.get("/api/me/characters", headers=h).json() == []
```

`test_raids.py` 的 `test_member_fill_remove_duty` 补 slot job 字段断言（fill 成功后）：

```python
    assert r.json()["slot"]["job_name"] == "weapon_master"
    assert r.json()["slot"]["job_title"] == "极诣·剑魂"
```

- [ ] **Step 8: 运行全部后端测试验证通过**

Run: `cd backend && ./.venv/bin/python -m pytest`
Expected: 全部通过（test_jobs 4 + test_members 4 + test_raids/test_public 等；`test_smoke` 的 import 校验照常）

- [ ] **Step 9: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/models.py backend/app/schemas.py \
  backend/app/routers/members.py backend/app/routers/raids.py \
  backend/tests/test_members.py backend/tests/test_raids.py backend/tests/test_public.py
git commit -m "[fet] 角色职业字段与 class_type 推导"
```

---

## Task 3: 数据迁移 `migrate_jobs`

**Files:**
- Modify: `backend/app/migrations.py`
- Modify: `backend/app/db.py`
- Modify: `backend/tests/test_migrations.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_migrations.py` 末尾追加：

```python
def test_migrate_jobs_wipes_legacy_characters():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE characters (
            id INTEGER PRIMARY KEY, user_id INTEGER, name VARCHAR(64),
            class_type VARCHAR(8), fame INTEGER, simulated_damage INTEGER,
            sustained_dps INTEGER, buff_amount INTEGER)"""))
        conn.execute(text("""CREATE TABLE slots (
            id INTEGER PRIMARY KEY, wave_id INTEGER, squad_index INTEGER,
            row_index INTEGER, character_id INTEGER, duty VARCHAR(16), version INTEGER,
            updated_by INTEGER, updated_at DATETIME)"""))
        conn.execute(text("""INSERT INTO characters (user_id, name, class_type, fame)
            VALUES (1, '剑魂', '输出', 10000)"""))
        conn.execute(text("""INSERT INTO slots (wave_id, squad_index, row_index,
            character_id, duty, version) VALUES (1, 0, 0, 1, '主C', 0)"""))
    from app.migrations import migrate_jobs
    migrate_jobs(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(characters)")).all()}
        assert "job_name" in cols
        assert conn.execute(text("SELECT COUNT(*) FROM characters")).scalar() == 0
        slot = conn.execute(text("SELECT character_id, duty FROM slots")).fetchone()
        assert slot[0] is None and slot[1] is None
    migrate_jobs(engine)  # 幂等：再次运行不报错、不重复清空
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: FAIL（migrate_jobs 未定义）

- [ ] **Step 3: 实现 migrate_jobs**

`backend/app/migrations.py` 末尾追加（import 已有 `Engine, text`）：

```python
def migrate_jobs(engine: Engine) -> None:
    """为存量库补建 characters.job_name，并清空存量角色与占位（幂等）。

    清空仅发生在「本次新增 job_name 列」时（存量库首次迁移）：
    必须先清 slots 占位再删 characters——SQLite 已启用 PRAGMA foreign_keys=ON，
    Slot.character_id 外键无 ON DELETE 动作，先删角色会触发外键约束错误。
    """
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(characters)")).all()}
        if "job_name" not in cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN job_name VARCHAR(64)"))
            conn.execute(text("UPDATE slots SET character_id = NULL, duty = NULL, "
                              "version = version + 1, updated_by = NULL, updated_at = NULL"))
            conn.execute(text("DELETE FROM characters"))
```

`backend/app/db.py` 的 `init_db` 改为：

```python
def init_db() -> None:
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    from .migrations import migrate_dungeons, migrate_jobs
    migrate_dungeons(engine)
    migrate_jobs(engine)
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: PASS（新旧两个迁移测试）

> 注意：测试的 `TestClient(app)` lifespan 会触发 `init_db`，对**真实库** `backend/data/dnfer.db` 执行一次 `migrate_jobs`——首次运行即加列并清空存量角色（正是「清空重来」决策，一次性；之后幂等不再清）。

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/migrations.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "[fet] 存量角色清空迁移（幂等）"
```

---

## Task 4: 前端类型 + 职业工具 + api client + store

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/lib/job.ts`
- Create: `frontend/src/lib/job.spec.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/stores/raid.ts`
- Modify: `frontend/src/stores/raid.spec.ts`

- [ ] **Step 1: 写失败测试（工具函数）**

创建 `frontend/src/lib/job.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { jobIcon, categoryIcon, ICON_FALLBACK } from './job'

describe('job icon helpers', () => {
  it('builds child and category icon urls', () => {
    expect(jobIcon('weapon_master')).toBe('/images/jobs/weapon_master.png')
    expect(categoryIcon('swordman_male')).toBe('/images/sub/swordman_male.png')
  })
  it('exposes a fallback placeholder', () => {
    expect(ICON_FALLBACK).toBe('/images/jobs/empty.png')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npm run test`
Expected: FAIL（ModuleNotFoundError: ./job）

- [ ] **Step 3: 更新类型**

`frontend/src/types.ts`：

```ts
export interface Character { id: number; name: string; job_name: string; job_title: string;
  parent_name: string; class_type: ClassType; fame: number;
  simulated_damage: number | null; sustained_dps: number | null; buff_amount: number | null }
export interface Slot { id: number; squad_index: number; row_index: number;
  character_id: number | null; character_name: string | null;
  character_class: ClassType | null; job_name: string | null; job_title: string | null;
  fame: number | null; simulated_damage: number | null; sustained_dps: number | null;
  buff_amount: number | null; owner_id: number | null; owner_nickname: string | null;
  duty: Duty | null; version: number }
export interface JobChild { id: number; name: string; title: string; class_type: ClassType }
export interface JobCategory { id: number; name: string; title: string; children: JobChild[] }
```

- [ ] **Step 4: 实现职业工具**

创建 `frontend/src/lib/job.ts`：

```ts
export function jobIcon(jobName: string): string { return `/images/jobs/${jobName}.png` }
export function categoryIcon(parentName: string): string { return `/images/sub/${parentName}.png` }
export const ICON_FALLBACK = '/images/jobs/empty.png'
```

- [ ] **Step 5: api client 增 getJobs**

`frontend/src/api/client.ts` 顶部加 `import type { JobCategory } from '../types'`，`api` 对象末尾加：

```ts
  getJobs: () => request<JobCategory[]>('GET', '/api/jobs'),
```

- [ ] **Step 6: 更新 store 与夹具**

`frontend/src/stores/raid.ts` 的 `slot:removed` 分支，在 `slot.character_class = null;` 之后加：

```ts
        slot.job_name = null; slot.job_title = null;
```

`frontend/src/stores/raid.spec.ts`：
- `makeRaid()` 的 slot 夹具对象加 `job_name: null, job_title: null,`（在 `character_class: null,` 之后）。
- 各 `slot:filled` / `slot:duty_changed` 事件里的 slot 对象加 `job_name: 'weapon_master', job_title: '极诣·剑魂',`。

- [ ] **Step 7: 运行测试与类型检查验证通过**

Run: `cd frontend && npm run test && npm run build`
Expected: PASS；`vue-tsc` 无类型错误（store 与夹具已补字段）

- [ ] **Step 8: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/types.ts frontend/src/lib/job.ts \
  frontend/src/lib/job.spec.ts frontend/src/api/client.ts \
  frontend/src/stores/raid.ts frontend/src/stores/raid.spec.ts
git commit -m "[fet] 前端职业类型与图标工具"
```

---

## Task 5: MyCharactersView 职业选择器 + 列表图标

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`
- Create: `frontend/src/views/MyCharactersView.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/views/MyCharactersView.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MyCharactersView from './MyCharactersView.vue'
import type { JobCategory } from '../types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), getJobs: vi.fn() },
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}))

const tree: JobCategory[] = [
  { id: 0, name: 'swordman_male', title: '鬼剑士(男)', children: [
    { id: 0, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' },
  ]},
  { id: 8, name: 'priest_male', title: '圣职者(男)', children: [
    { id: 0, name: 'crusader_male', title: '神启·圣骑士', class_type: '辅助' },
  ]},
]

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/me/characters') return []
    return []
  })
  apiMock.getJobs.mockResolvedValue(tree)
})

describe('MyCharactersView job picker', () => {
  it('selecting an output job shows damage inputs and submits job_name', async () => {
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    await wrapper.find('button').trigger('click')          // 添加角色
    await wrapper.find('button[data-cat="swordman_male"]').trigger('click')
    await wrapper.find('button[data-job="weapon_master"]').trigger('click')
    expect(wrapper.text()).toContain('模拟伤害')
    expect(wrapper.text()).not.toContain('增益量')
    await wrapper.find('#char-name').setValue('剑魂')
    await wrapper.find('#char-damage').setValue(680000)
    await wrapper.find('button[data-act="save"]').trigger('click')
    await flushPromises()
    const [url, body] = apiMock.post.mock.calls[0]
    expect(url).toBe('/api/me/characters')
    expect(body.job_name).toBe('weapon_master')
    expect('class_type' in body).toBe(false)
  })

  it('selecting a support job shows buff input', async () => {
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await wrapper.find('button[data-cat="priest_male"]').trigger('click')
    await wrapper.find('button[data-job="crusader_male"]').trigger('click')
    expect(wrapper.text()).toContain('增益量')
    expect(wrapper.text()).not.toContain('模拟伤害')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npm run test`
Expected: FAIL（组件无 data-cat/data-job 结构 / 无 getJobs）

- [ ] **Step 3: 改造 script**

`frontend/src/views/MyCharactersView.vue` script 部分：

- import 改为：

```ts
import { onMounted, ref, computed, watch } from 'vue'
import { api } from '../api/client'
import { categoryIcon, jobIcon, ICON_FALLBACK } from '../lib/job'
import type { Character, JobCategory, JobChild } from '../types'
```

- **删除**旧 `watch(() => form.value.class_type, ...)` 与旧 `isDps` computed（两者引用已移除的 `form.class_type`，不删会编译报错）。
- 状态：`form` 去掉 `class_type`，新增：

```ts
const categories = ref<JobCategory[]>([])
const selectedCat = ref<JobCategory | null>(null)
const selectedJob = ref<JobChild | null>(null)
const isSupport = computed(() => selectedJob.value?.class_type === '辅助')
```

- `load()` 增加 `categories.value = await api.getJobs()`；`onMounted(load)` 不变。
- 新增：

```ts
function onIconError(e: Event) { (e.target as HTMLImageElement).src = ICON_FALLBACK }
function onPickCategory(cat: JobCategory) { selectedCat.value = cat; selectedJob.value = null }

watch(selectedJob, (j) => {
  if (j?.class_type === '输出') form.value.buff_amount = null
  else if (j?.class_type === '辅助') {
    form.value.simulated_damage = null; form.value.sustained_dps = null
  }
})
```

- `startCreate` / `startEdit` / `save` 改为：

```ts
function startCreate() {
  editing.value = null; showForm.value = true
  form.value = { name: '', fame: null, simulated_damage: null, sustained_dps: null, buff_amount: null }
  selectedCat.value = null; selectedJob.value = null
}
function startEdit(c: Character) {
  editing.value = c; showForm.value = true
  form.value = { name: c.name, fame: c.fame, simulated_damage: c.simulated_damage,
    sustained_dps: c.sustained_dps, buff_amount: c.buff_amount }
  selectedCat.value = categories.value.find(cat => cat.name === c.parent_name) ?? null
  selectedJob.value = selectedCat.value?.children.find(ch => ch.name === c.job_name) ?? null
}
async function save() {
  if (!selectedJob.value) { error.value = '请选择职业'; return }
  saving.value = true; error.value = ''
  try {
    const payload = { name: form.value.name, job_name: selectedJob.value.name,
      fame: Number(form.value.fame) || 0,
      simulated_damage: form.value.simulated_damage,
      sustained_dps: form.value.sustained_dps, buff_amount: form.value.buff_amount }
    if (editing.value) await api.put(`/api/me/characters/${editing.value.id}`, payload)
    else await api.post('/api/me/characters', payload)
    editing.value = null; showForm.value = false; await load()
  } catch (e: any) { error.value = e.message }
  finally { saving.value = false }
}
```

- `remove` 不变；输入区显示改用新 computed `isSupport`（`isDps` 已删除，见上）。

- [ ] **Step 4: 改造 template**

- 列表每行（原 `{{ c.class_type }} · 名望` 那行）改为显示子职业图标 + 职业名：

```html
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:32px;height:32px">
        <div>
          <b>{{ c.name }}</b>
          <span style="color:#666;font-size:12px">{{ c.job_title }} · {{ c.class_type }} · 名望 {{ c.fame }}</span>
          <div style="color:#999;font-size:12px">
            {{ c.class_type === '输出'
              ? `模拟 ${fmtDps(c.simulated_damage)} · 秒伤 ${fmtDps(c.sustained_dps)}`
              : `增益 ${fmtBuff(c.buff_amount)}` }}
          </div>
        </div>
      </div>
```

（外层 `div v-for` 由 `display:flex;align-items:center;gap:12px` 不变，原先的 `<div style="flex:1">` 换成上面的结构。）

- 表单：把原「职业」`<select v-model="form.class_type">` 整块替换为职业选择器（加在角色名与名望之间）：

```html
      <div style="margin:8px 0">
        <label style="width:80px;flex-shrink:0">职业：</label>
        <div style="flex:1">
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button v-for="cat in categories" :key="cat.name" type="button" :data-cat="cat.name"
                    @click="onPickCategory(cat)"
                    :style="selectedCat?.name === cat.name ? 'outline:2px solid #1976d2' : ''">
              <img :src="categoryIcon(cat.name)" @error="onIconError" style="width:36px;height:36px">
              <span style="display:block;font-size:11px">{{ cat.title }}</span>
            </button>
          </div>
          <div v-if="selectedCat" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
            <button v-for="child in selectedCat.children" :key="child.name" type="button"
                    :data-job="child.name" @click="selectedJob = child"
                    :style="selectedJob?.name === child.name ? 'outline:2px solid #1976d2' : ''">
              <img :src="jobIcon(child.name)" @error="onIconError" style="width:36px;height:36px">
              <span style="display:block;font-size:11px">{{ child.title }}</span>
            </button>
          </div>
          <p v-if="selectedJob" style="color:#666;font-size:12px;margin:4px 0 0">
            已选：{{ selectedJob.title }}（{{ selectedJob.class_type }}职业）
          </p>
        </div>
      </div>
```

- 输入区条件由 `isDps` 改为 `isSupport`（`v-if="!isSupport"` 显示模拟/秒伤，`v-else` 显示增益量），其余表单字段（名望/输入框）不变。
- 保存按钮加上 `data-act="save"` 供测试定位：`<button :disabled="saving" data-act="save" @click="save">{{ saving ? '保存中…' : '保存' }}</button>`（测试 `wrapper.find('button[data-act="save"]')` 依赖它）。

- [ ] **Step 5: 运行测试与类型检查验证通过**

Run: `cd frontend && npm run test && npm run build`
Expected: 全通过；`vue-tsc` 无类型错误

- [ ] **Step 6: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/views/MyCharactersView.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "[fet] 角色管理职业选择器与职业图标"
```

---

## Task 6: 攻坚排表图标（CharacterPickerModal + SlotCell）

**Files:**
- Modify: `frontend/src/components/CharacterPickerModal.vue`
- Modify: `frontend/src/components/SlotCell.vue`

- [ ] **Step 1: CharacterPickerModal 显示子职业图标**

`frontend/src/components/CharacterPickerModal.vue` script 加：

```ts
import { jobIcon, ICON_FALLBACK } from '../lib/job'
function onIconError(e: Event) { (e.target as HTMLImageElement).src = ICON_FALLBACK }
```

template 每行角色（`<b>{{ c.name }}</b>` 那行）改为：

```html
        <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:28px;height:28px;margin-right:8px">
        <b>{{ c.name }}</b>
        <span style="color:#666;font-size:12px">{{ c.job_title }} · {{ c.class_type }} · 名望 {{ c.fame }}</span>
```

（该行外层无 flex 样式，`<img>` 内联排列即可，无需改外层。）

- [ ] **Step 2: SlotCell 显示子职业图标**

`frontend/src/components/SlotCell.vue` script 加：

```ts
import { jobIcon, ICON_FALLBACK } from '../lib/job'
function onIconError(e: Event) { (e.target as HTMLImageElement).src = ICON_FALLBACK }
```

template 占位格的角色信息块（`<div style="color:#333">` 内，`（{{ slot.character_name }}）` 之后）加：

```html
        <img v-if="slot.job_name" :src="jobIcon(slot.job_name)" @error="onIconError"
             style="width:20px;height:20px;margin-left:6px;vertical-align:middle">
        <span v-if="slot.job_title" style="color:#888;font-size:12px;margin-left:6px">{{ slot.job_title }}</span>
```

- [ ] **Step 3: 类型检查验证**

Run: `cd frontend && npm run build`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/components/CharacterPickerModal.vue frontend/src/components/SlotCell.vue
git commit -m "[fet] 攻坚选角与排表格子显示职业图标"
```

---

## Task 7: 部署与代理配置

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `backend/app/main.py`
- Modify: `Dockerfile`

- [ ] **Step 1: Vite 代理 /images**

`frontend/vite.config.ts` 的 `server.proxy` 加：

```ts
      '/images': 'http://localhost:8000',
```

- [ ] **Step 2: 后端挂载 /images**

`backend/app/main.py`，在 SPA 静态挂载（`try: app.mount("/", ...)`）**之前**加：

```python
try:
    app.mount("/images", StaticFiles(directory=settings.images_dir), name="images")
except RuntimeError:
    logger.warning("职业图标目录 %s 不存在，跳过挂载", settings.images_dir)
```

（`StaticFiles` 已 import，`settings` 已 import。）

- [ ] **Step 3: Dockerfile 复制资源**

`Dockerfile` 在 `COPY backend/ .` 之后追加：

```dockerfile
COPY 职业信息.json ./
COPY images/ ./images/
```

`ENV` 块追加：

```dockerfile
ENV DNFER_JOB_DATA_PATH=/app/职业信息.json
ENV DNFER_IMAGES_DIR=/app/images/adventure
```

- [ ] **Step 4: 验证**

Run: `cd backend && ./.venv/bin/python -c "from app.main import app; print('ok')"`
Expected: 打印 ok（/images 挂载成功；`images/adventure` 目录存在）

Run: `cd frontend && npm run build`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/vite.config.ts backend/app/main.py Dockerfile
git commit -m "[fet] /images 静态托管与 Docker 资源复制"
```

---

## 最终验证

- [ ] 后端：`cd backend && ./.venv/bin/python -m pytest` — 全部通过
- [ ] 前端：`cd frontend && npm run test && npm run build` — 全部通过、无类型错误
- [ ] 手动冒烟（dev）：启动后端 + 前端 → 角色管理添加角色：先选大类（图标网格）→ 选子职业（图标网格）→ 输出显示模拟/秒伤输入、辅助显示增益量 → 列表出现职业图标与职业名 → 攻坚排表选角色弹窗与格子显示职业图标
- [ ] 手动冒烟（缺图）：选「帝国骑士·破浪者」→ 图标回退显示占位图 `empty.png`（不裂图）
- [ ] 存量库迁移：启动后端 → `backend/data/dnfer.db` 首次运行加 `job_name` 列并清空角色表（一次性），再次启动不重复清空
