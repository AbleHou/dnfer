# 并行攻坚（波次并行 / 团号显示）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让攻坚波次支持「并行团」——同一轮次可并行多个团（显示为 `第X波Y团`），并同时把加波/删波/并行操作权限收紧为仅管理员。

**Architecture:** 后端给 `Wave` 加可空 `group_id` 列（同轮并行波共享非空值，NULL=独立波），`index` 保持稳定内部顺序键；`_detail` 计算 `round_index`/`group_index` 显示号并按 (轮次,团号) 排序返回。`WaveOut` 增三字段。新增 `parallelize_wave`/`unparallelize_wave` 两端点（仅管理员），占位约束从「同波」扩为「同轮」（新增 `_validate_one_char_per_round`）。前端 WaveSection 头部按新字段渲染标签 + 并行控件（仅管理员），RaidDetailView 加并行目标弹窗；WS 新事件走 `ws.ts` 的 `onRefresh` 全量刷新路径。

**Tech Stack:** FastAPI + SQLAlchemy 2 + SQLite（backend）、Vue 3 + Pinia + naive-ui + Vitest（frontend）。

**测试命令：** 后端 `cd backend && .venv/bin/python -m pytest <file> -v`；前端 `cd frontend && npx vitest run <file>`；前端类型/构建 `cd frontend && npm run build`。

---

## 文件结构

**后端（backend/app/）：**
- `models.py` — `Wave.group_id` 列（Modify）
- `migrations.py` — `migrate_waves_group`（Modify）
- `db.py` — `init_db()` 注册新迁移（Modify）
- `schemas.py` — `WaveOut` 增字段 + `ParallelIn`（Modify）
- `routers/raids.py` — `_detail` 显示计算、`add_wave`/`delete_wave` 收紧、`parallelize_wave`/`unparallelize_wave`、`_round_wave_ids`/`_validate_one_char_per_round`/`_prune_round`、`fill_slot`/`move_slot` 同轮约束（Modify）

**后端（backend/tests/）：**
- `test_migrations.py` — 迁移用例（Modify）
- `test_raids.py` — 权限收紧改写（Modify）
- `test_admin_adjust.py` — 权限收紧改写（Modify）
- `test_raid_parallel.py` — 并行/显示/占位约束（Create）

**前端（frontend/src/）：**
- `types.ts` — `Wave` 接口（Modify）
- `components/WaveSection.vue` — 标签 + 并行控件（Modify）
- `views/RaidDetailView.vue` — 并行弹窗 + 管理员门控（Modify）
- `api/ws.ts` — onRefresh 路由（Modify）
- `stores/raid.ts` — `WsEvent` 联合类型（Modify）

**前端（frontend/src/ 测试）：**
- `components/WaveSection.spec.ts` — 新建
- `views/RaidDetailView.spec.ts` — 并行弹窗 + 管理员门控（Modify）
- `stores/raid.spec.ts` / `lib/placement.spec.ts` — Wave fixture 涟漪（Modify）

---

## Task 1: 后端迁移 — `Wave.group_id` 列

**Files:**
- Modify: `backend/app/models.py:73-81`（Wave 类）
- Modify: `backend/app/migrations.py`（末尾加函数）
- Modify: `backend/app/db.py:32-41`（init_db 注册）
- Test: `backend/tests/test_migrations.py`

- [ ] **Step 1: 写失败测试**（`test_migrations.py` 末尾追加）

```python
def test_migrate_waves_group_adds_column():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE waves (
            id INTEGER PRIMARY KEY, raid_id INTEGER, index INTEGER)"""))
        conn.execute(text("""INSERT INTO waves (raid_id, index) VALUES (1, 1), (1, 2)"""))
    from app.migrations import migrate_waves_group
    migrate_waves_group(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(waves)")).all()}
        assert "group_id" in cols
        idxs = {r[1] for r in conn.execute(text("PRAGMA index_list(waves)")).all()}
        assert "ix_waves_group_id" in idxs
    migrate_waves_group(engine)  # 幂等：再次运行不报错
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py::test_migrate_waves_group_adds_column -v`
Expected: FAIL（`migrate_waves_group` 不存在 ImportError）

- [ ] **Step 3: 实现迁移**（`migrations.py` 追加；`db.py` 注册）

`migrations.py`：
```python
def migrate_waves_group(engine: Engine) -> None:
    """为存量库补建 waves.group_id 列 + 索引（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(waves)")).all()}
        if "group_id" not in cols:
            conn.execute(text("ALTER TABLE waves ADD COLUMN group_id INTEGER"))
        idxs = {row[1] for row in conn.execute(text("PRAGMA index_list(waves)")).all()}
        if "ix_waves_group_id" not in idxs:
            conn.execute(text("CREATE INDEX ix_waves_group_id ON waves (group_id)"))
```

`db.py` init_db：
```python
from .migrations import (migrate_avatars, migrate_characters_sun_buff,
                         migrate_dungeons, migrate_jobs, migrate_users_ban,
                         migrate_waves_group)
...
    migrate_users_ban(engine)
    migrate_characters_sun_buff(engine)
    migrate_waves_group(engine)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: PASS（含新用例 + 既有迁移用例不受影响）

- [ ] **Step 5: 提交**

```bash
git add backend/app/migrations.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "feat: waves.group_id 列迁移（并行团）"
```

---

## Task 2: 后端权限收紧 — 加波/删波仅管理员

**Files:**
- Modify: `backend/app/routers/raids.py:263-291`（add_wave / delete_wave）
- Test: `backend/tests/test_raids.py`（line 77/107/147 改 `h`→`ah`；`test_wave_add_and_delete_rules` 改写）
- Test: `backend/tests/test_admin_adjust.py`（`test_owner_can_delete_wave_with_only_own_chars_admin_placed` 改写）

- [ ] **Step 1: 改写既有用例（先行，确认红）**

`test_raids.py` 三处「成员加波」setup 改管理员头：
- `:77`（`test_character_unique_across_waves`）：`headers=h` → `headers=ah`
- `:107`（`test_one_character_per_player_per_wave`）：`headers=h` → `headers=ah`
- `:147`（`test_fill_replace_moves_same_character`）：`headers=h` → `headers=ah`

`test_wave_add_and_delete_rules`（`:219-238`）整段替换为：
```python
def test_wave_add_and_delete_rules(client):
    ah = _admin(client)
    h, user = register_user(client, "p8", "辛")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "job_name": "weapon_master", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    # 非管理员加波 → 403（无论锁定与否）
    assert client.post(f"/api/raids/{rid}/waves", headers=h, json={}).status_code == 403
    # 管理员加波 2 → 200
    r = client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    w2 = next(w for w in detail["waves"] if w["index"] == 2)
    assert len(w2["slots"]) == 12
    # 非管理员删波 → 403
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=h).status_code == 403
    # 管理员删波 → 200
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=ah).status_code == 200
    # 不能删最后一波 → 400
    assert client.delete(f"/api/raids/{rid}/waves/1", headers=ah).status_code == 400
```

`test_admin_adjust.py` `test_owner_can_delete_wave_with_only_own_chars_admin_placed`（`:82-96`）改写：删波改为管理员头，并断言成员删 → 403：
```python
def test_delete_wave_admin_only(client):
    ah = _admin(client)
    h1, _ = register_user(client, "own4", "丁")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h1)
    client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    w2 = next(w for w in client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
              if w["index"] == 2)
    s = w2["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200
    # 成员（即使仅含自己角色）删波 → 403
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=h1).status_code == 403
    # 管理员删波 → 200
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=ah).status_code == 200
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raids.py tests/test_admin_adjust.py -v`
Expected: FAIL（`test_wave_add_and_delete_rules` 的「成员加波 → 403」与「成员删波 → 403」断言 200≠403；`test_delete_wave_admin_only` 成员删波 200≠403）

- [ ] **Step 3: 收紧 add_wave / delete_wave**（`raids.py:263-291`）

```python
@router.post("/{rid}/waves")
async def add_wave(rid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    wave = create_wave(db, raid)
    db.commit()
    await manager.broadcast(rid, {"type": "wave:added", "index": wave.index})
    return _detail(db, raid)

@router.delete("/{rid}/waves/{index}")
async def delete_wave(rid: int, index: int, admin: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    wave = db.query(Wave).filter(Wave.raid_id == rid, Wave.index == index).first()
    if wave is None:
        raise HTTPException(404, "波次不存在")
    if len(raid.waves) <= 1:
        raise HTTPException(400, "至少保留一个波次")
    db.delete(wave)
    db.commit()
    await manager.broadcast(rid, {"type": "wave:removed", "index": index})
    return {"ok": True}
```
（删除原 `_can_edit` 校验与非管理员分支；`_can_edit` 仍被 fill_slot/change_duty 使用，保留。）

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raids.py tests/test_admin_adjust.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/raids.py backend/tests/test_raids.py backend/tests/test_admin_adjust.py
git commit -m "feat: 加波/删波权限收紧为仅管理员"
```

---

## Task 3: 后端并行核心 — schemas + 显示计算 + 并行端点

**Files:**
- Modify: `backend/app/schemas.py:167-170`（WaveOut）、`:192` 后加 ParallelIn
- Modify: `backend/app/routers/raids.py`（`_detail` 显示计算、helpers、两个并行端点）
- Test: `backend/tests/test_raid_parallel.py`（Create）

- [ ] **Step 1: schemas**（`schemas.py`）

```python
class WaveOut(BaseModel):
    id: int
    index: int
    group_id: int | None = None
    round_index: int = 1      # 1 起始轮次显示号（带默认避免中间态 500）
    group_index: int = 1      # 1 起始轮内团号
    slots: list[SlotOut]

class ParallelIn(BaseModel):
    target_index: int     # 目标波 index
```

- [ ] **Step 2: 写失败测试**（`tests/test_raid_parallel.py` 新建）

```python
from .helpers import make_raid, register_user, signup

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def _add_wave(client, ah, rid, n):
    for _ in range(n):
        assert client.post(f"/api/raids/{rid}/waves", headers=ah, json={}).status_code == 200

def _waves(client, ah, rid):
    return client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]

def _mkchar(client, h, name):
    return client.post("/api/me/characters", headers=h,
                       json={"name": name, "job_name": "weapon_master", "fame": 1}).json()["id"]

def test_parallelize_two_waves_share_round(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 1)
    assert client.post(f"/api/raids/{rid}/waves/2/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 200
    ws = _waves(client, ah, rid)
    assert [(w["index"], w["round_index"], w["group_index"], w["group_id"] is not None)
            for w in ws] == [(1, 1, 1, True), (2, 1, 2, True)]
    assert ws[0]["group_id"] == ws[1]["group_id"]

def test_parallelize_renumber_with_standalone(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 2)   # w2, w3
    assert client.post(f"/api/raids/{rid}/waves/2/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 200
    ws = _waves(client, ah, rid)
    assert [w["index"] for w in ws] == [1, 2, 3]
    assert [(w["round_index"], w["group_index"]) for w in ws] == [(1, 1), (1, 2), (2, 1)]
    assert ws[2]["group_id"] is None

def test_noncontiguous_round_order(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 3)   # w2, w3, w4
    assert client.post(f"/api/raids/{rid}/waves/2/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 200
    assert client.post(f"/api/raids/{rid}/waves/4/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 200
    ws = _waves(client, ah, rid)
    assert [w["index"] for w in ws] == [1, 2, 4, 3]   # w3 独立夹在中间，仍按轮序排后
    assert [(w["round_index"], w["group_index"]) for w in ws] == [(1, 1), (1, 2), (1, 3), (2, 1)]

def test_parallelize_errors(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/waves/1/parallel",
                       headers=ah, json={"target_index": 99}).status_code == 404
    assert client.post(f"/api/raids/{rid}/waves/1/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 400
    h, _ = register_user(client, "parp", "甲")
    assert client.post(f"/api/raids/{rid}/waves/1/parallel",
                       headers=h, json={"target_index": 1}).status_code == 403

def test_unparallelize_and_single_round_invariant(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 1)
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    # 取消 w2 → 两波都回独立（单波轮恒 group_id=None）
    assert client.delete(f"/api/raids/{rid}/waves/2/parallel", headers=ah).status_code == 200
    ws = _waves(client, ah, rid)
    assert all(w["group_id"] is None for w in ws)
    assert [(w["round_index"], w["group_index"]) for w in ws] == [(1, 1), (2, 1)]
    # 未并行的波取消 → 400
    assert client.delete(f"/api/raids/{rid}/waves/2/parallel", headers=ah).status_code == 400
    # 非管理员取消 → 403
    h, _ = register_user(client, "parq", "乙")
    assert client.delete(f"/api/raids/{rid}/waves/1/parallel", headers=h).status_code == 403

def test_parallelize_exit_prunes_single_round(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 2)   # w2, w3
    # 轮{1,2}：w2‖w1
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    # w1 改投 w3（独立）→ w1 先退出旧轮{1,2}，旧轮只剩 w2 → w2.group_id 归 NULL（单波轮不变量）
    client.post(f"/api/raids/{rid}/waves/1/parallel", headers=ah, json={"target_index": 3})
    ws = _waves(client, ah, rid)
    assert [w["index"] for w in ws] == [1, 3, 2]                     # 轮序 w1,w3 先于独立 w2
    assert [(w["round_index"], w["group_index"]) for w in ws] == [(1, 1), (1, 2), (2, 1)]
    assert ws[0]["group_id"] == ws[1]["group_id"] and ws[0]["group_id"] is not None  # w1,w3 同轮
    assert ws[2]["group_id"] is None                                 # w2 被留下 → 独立

def test_delete_wave_in_round_prunes(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 1)
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=ah).status_code == 200
    ws = _waves(client, ah, rid)
    assert len(ws) == 1 and ws[0]["group_id"] is None

def test_parallelize_merge_conflict_400(client):
    ah = _admin(client)
    h, _ = register_user(client, "parm", "丙")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    _add_wave(client, ah, rid, 1)   # w2
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})  # 轮{1,2}
    w1 = next(w for w in _waves(client, ah, rid) if w["index"] == 1)
    s1 = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200   # 丙 在轮{1,2} 占 C1
    _add_wave(client, ah, rid, 1)   # w3 独立
    w3 = next(w for w in _waves(client, ah, rid) if w["index"] == 3)
    s3 = next(s for s in w3["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s3['id']}/fill", headers=h,
                       json={"character_id": c2}).status_code == 200
    # w3 加入轮{1,2} 会令 丙 跨两波占位 → 400，且状态不变
    assert client.post(f"/api/raids/{rid}/waves/3/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 400
    w3_after = next(w for w in _waves(client, ah, rid) if w["index"] == 3)
    assert w3_after["group_id"] is None

def test_ws_broadcast_parallel_events(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 1)
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
        assert ws.receive_json()["type"] == "wave:parallelized"
        client.delete(f"/api/raids/{rid}/waves/2/parallel", headers=ah)
        assert ws.receive_json()["type"] == "wave:parallel_removed"
```

- [ ] **Step 3: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_parallel.py -v`
Expected: FAIL（`parallelize` 端点 404/405 不存在；`WaveOut` 无 group_id 字段 → `_detail` 500）

- [ ] **Step 4: 实现**（`routers/raids.py`）

`_detail` 显示计算（替换 `:115-134` 的 waves 构建）：
```python
def _detail(db: Session, raid: Raid) -> RaidDetail:
    # 按并行分组分区为轮次（group_id=None 视为独立轮），轮次按 min(index) 排序、轮内按 index 排序
    buckets: dict[int | None, list[Wave]] = {}
    for w in raid.waves:
        buckets.setdefault(w.group_id, []).append(w)
    ordered_rounds = sorted(buckets.values(), key=lambda g: min(w.index for w in g))
    waves = []
    for round_index, round_waves in enumerate(ordered_rounds, start=1):
        for group_index, w in enumerate(sorted(round_waves, key=lambda x: x.index), start=1):
            waves.append(WaveOut(id=w.id, index=w.index, group_id=w.group_id,
                                 round_index=round_index, group_index=group_index,
                                 slots=[_slot_out(s) for s in w.slots]))
    ...  # 其余 signups/slack_rules 不变，RaidDetail(... waves=waves, ...)
```

Helpers（放在 `_validate_one_char_per_wave` 附近）：
```python
def _round_wave_ids(db: Session, wave: Wave) -> set[int]:
    """返回与 wave 同轮的所有 wave.id（独立波 → {wave.id}）。调用方须先 flush 使 group_id 落库。"""
    if wave.group_id is None:
        return {wave.id}
    return {w.id for w in db.query(Wave).filter(Wave.group_id == wave.group_id).all()}

def _validate_one_char_per_round(db: Session, round_wave_ids: set[int]) -> None:
    """跨轮内所有波聚合：同一玩家出现两次（含同团内与跨并行团）→ 400。"""
    seen: set[int] = set()
    for s in db.query(Slot).filter(Slot.wave_id.in_(round_wave_ids)):
        if s.character_id is not None and s.character is not None:
            uid = s.character.user_id
            if uid in seen:
                raise HTTPException(400, "同一轮次中一个玩家只能上一个角色")
            seen.add(uid)

def _prune_round(db: Session, group_id: int) -> None:
    """若 group_id 轮内仅剩 1 波，则将其 group_id 置 NULL（单波轮恒 NULL 不变量）。调用方须先 flush。"""
    members = db.query(Wave).filter(Wave.group_id == group_id).all()
    if len(members) == 1:
        members[0].group_id = None
```

并行端点（放在 delete_wave 之后）：
```python
@router.post("/{rid}/waves/{index}/parallel")
async def parallelize_wave(rid: int, index: int, body: ParallelIn,
                           admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    wave = db.query(Wave).filter(Wave.raid_id == rid, Wave.index == index).first()
    if wave is None:
        raise HTTPException(404, "波次不存在")
    target = db.query(Wave).filter(Wave.raid_id == rid,
                                   Wave.index == body.target_index).first()
    if target is None:
        raise HTTPException(404, "波次不存在")
    if target.id == wave.id:
        raise HTTPException(400, "不能与自身并行")
    # wave 若已在某轮 → 先退出，清理可能成单的旧轮
    if wave.group_id is not None:
        old = wave.group_id
        wave.group_id = None
        db.flush()
        _prune_round(db, old)
    # 加入目标轮（目标独立则以 target.id 为轮键）
    if target.group_id is None:
        target.group_id = target.id
    wave.group_id = target.group_id
    db.flush()
    # 合并后校验同轮限一占位（失败回滚，保持原状）
    try:
        _validate_one_char_per_round(db, _round_wave_ids(db, wave))
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    await manager.broadcast(rid, {"type": "wave:parallelized", "index": wave.index})
    return _detail(db, raid)

@router.delete("/{rid}/waves/{index}/parallel")
async def unparallelize_wave(rid: int, index: int, admin: User = Depends(require_admin),
                             db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    wave = db.query(Wave).filter(Wave.raid_id == rid, Wave.index == index).first()
    if wave is None:
        raise HTTPException(404, "波次不存在")
    if wave.group_id is None:
        raise HTTPException(400, "该波未并行")
    old = wave.group_id
    wave.group_id = None
    db.flush()
    _prune_round(db, old)
    db.commit()
    await manager.broadcast(rid, {"type": "wave:parallel_removed", "index": wave.index})
    return _detail(db, raid)
```

`delete_wave` 补「轮内删波后清理单波轮」（在 `db.delete(wave)` 前捕获 group_id，delete 后 flush + prune）：
```python
    gid = wave.group_id
    db.delete(wave)
    db.flush()
    if gid is not None:
        _prune_round(db, gid)
    db.commit()
```
（`_prune_round` 在 flush 后执行，SELECT 不再含已删波。）

imports：`from ..schemas import (... , WaveOut, ParallelIn)`。

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_parallel.py tests/test_raids.py -v`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/raids.py backend/tests/test_raid_parallel.py
git commit -m "feat: 波次并行/取消并行端点 + 轮次团号显示计算"
```

---

## Task 4: 后端同轮限一占位 — fill/move 扩到同轮

**Files:**
- Modify: `backend/app/routers/raids.py`（`fill_slot` same_owner、`move_slot` 校验、删除 `_validate_one_char_per_wave`）
- Test: `backend/tests/test_raid_parallel.py`（追加约束用例）

- [ ] **Step 1: 写失败测试**（`test_raid_parallel.py` 追加）

```python
def test_fill_same_player_across_parallel_waves_blocked(client):
    ah = _admin(client)
    h, _ = register_user(client, "parf", "丁")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    _add_wave(client, ah, rid, 1)
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    w1 = next(w for w in _waves(client, ah, rid) if w["index"] == 1)
    w2 = next(w for w in _waves(client, ah, rid) if w["index"] == 2)
    s1 = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200
    r = client.post(f"/api/raids/{rid}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": c2})
    assert r.status_code == 400
    assert "同一轮次" in r.json()["detail"]

def test_fill_replace_across_parallel_waves(client):
    ah = _admin(client)
    h, _ = register_user(client, "parg", "戊")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    _add_wave(client, ah, rid, 1)
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    w1 = next(w for w in _waves(client, ah, rid) if w["index"] == 1)
    w2 = next(w for w in _waves(client, ah, rid) if w["index"] == 2)
    s1 = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h, json={"character_id": c1})
    r = client.post(f"/api/raids/{rid}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": c2, "replace": True})
    assert r.status_code == 200
    assert [s["id"] for s in r.json()["removed_slots"]] == [s1["id"]]

def test_move_cross_parallel_round_duplicate_blocked(client):
    ah = _admin(client)
    h, _ = register_user(client, "parh", "己")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    _add_wave(client, ah, rid, 2)   # w2, w3
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})  # 轮{1,2}
    ws = _waves(client, ah, rid)
    w1 = next(w for w in ws if w["index"] == 1)
    w2 = next(w for w in ws if w["index"] == 2)
    w3 = next(w for w in ws if w["index"] == 3)
    s1 = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    s3 = next(s for s in w3["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h, json={"character_id": c1})
    client.post(f"/api/raids/{rid}/slots/{s3['id']}/fill", headers=h, json={"character_id": c2})
    # 把 w3 的 C2（己）移到 w2（与 w1 同轮）→ 己 在轮{1,2}占两格 → 400
    r = client.post(f"/api/raids/{rid}/slots/{s3['id']}/move", headers=ah,
                    json={"target_slot_id": s2["id"]})
    assert r.status_code == 400
    assert "同一轮次" in r.json()["detail"]
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_parallel.py -v`
Expected: FAIL（fill 跨并行团返回 200（旧同波校验不拦跨波）；move 同理）

- [ ] **Step 3: 实现**

`fill_slot` 的 `same_owner` 查询（`:326-330` replace 分支 与 `:342-346` 非 replace 分支）——两处 `Slot.wave_id == slot.wave_id` 改为 `Slot.wave_id.in_(_round_wave_ids(db, slot.wave))`：

**非 replace 分支的报错文案同步改为「同一轮次中一个玩家只能上一个角色」**（`:348` 的 `raise HTTPException(400, "同一波次中一个玩家只能上一个角色")` → 新文案；否则 `test_fill_same_player_across_parallel_waves_blocked` 断言 `"同一轮次" in detail` 会失败）。replace 分支无报错文案，无需改。
```python
        same_owner = db.query(Slot).filter(
            Slot.wave_id.in_(_round_wave_ids(db, slot.wave)),
            Slot.id != slot.id,
            Slot.character.has(user_id=char.user_id),
        ).all()   # replace 分支（list）
```
```python
        same_owner = db.query(Slot).filter(
            Slot.wave_id.in_(_round_wave_ids(db, slot.wave)),
            Slot.id != slot.id,
            Slot.character.has(user_id=char.user_id),
        ).first()   # 非 replace 分支
```
（`slot.wave.group_id` 在本请求内未被修改，查询无 memory/DB 不一致问题。）

`move_slot` 校验（`:477`）：`_validate_one_char_per_wave(db, {source.wave_id, target.wave_id})` → 替换为：
```python
        _validate_one_char_per_round(db, _round_wave_ids(db, source.wave))
        _validate_one_char_per_round(db, _round_wave_ids(db, target.wave))
```
删除旧的 `_validate_one_char_per_wave` 函数（`:426-435`，仅此一处调用）。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_parallel.py tests/test_raids.py tests/test_admin_adjust.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/raids.py backend/tests/test_raid_parallel.py
git commit -m "feat: 占位约束扩为同轮限一（fill/move 跨并行团拦截）"
```

---

## Task 5: 前端 types + fixture 涟漪

**Files:**
- Modify: `frontend/src/types.ts:29`（Wave）
- Modify: `frontend/src/lib/placement.spec.ts:22-23`
- Modify: `frontend/src/stores/raid.spec.ts:10`
- Modify: `frontend/src/views/RaidDetailView.spec.ts:56,63`

- [ ] **Step 1: 改 types.ts**

```ts
export interface Wave { id: number; index: number; group_id: number | null; round_index: number; group_index: number; slots: Slot[] }
```

- [ ] **Step 2: 同步 fixture（否则 vue-tsc 报缺字段）**

`placement.spec.ts:22-23`：
```ts
{ id: 1, index: 1, group_id: null, round_index: 1, group_index: 1, slots: [slot(1, 11, 0, '主C'), slot(2, 12, 1, '主奶'), slot(3, null, 0, null)] },
{ id: 2, index: 2, group_id: null, round_index: 2, group_index: 1, slots: [slot(4, 13, 2, '划水')] },
```
`stores/raid.spec.ts:10`：`{ id: 1, index: 1, group_id: null, round_index: 1, group_index: 1, slots: Array.from(...) }`
`RaidDetailView.spec.ts:56`：`waves: [{ id: 1, index: 1, group_id: null, round_index: 1, group_index: 1, slots: [] }]`
`RaidDetailView.spec.ts:63-64`：`{ id: 1, index: 1, group_id: null, round_index: 1, group_index: 1, slots: [{...}] }`

- [ ] **Step 3: 类型检查确认通过**

Run: `cd frontend && npm run build`
Expected: PASS（vue-tsc 无缺字段报错；vite build 成功）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types.ts frontend/src/lib/placement.spec.ts frontend/src/stores/raid.spec.ts frontend/src/views/RaidDetailView.spec.ts
git commit -m "ref: Wave 类型增并行字段并同步 fixture"
```

---

## Task 6: 前端 WS 事件 — onRefresh 路由 + WsEvent 类型

**Files:**
- Modify: `frontend/src/api/ws.ts:21`
- Modify: `frontend/src/stores/raid.ts:5-17`

- [ ] **Step 1: 改 ws.ts onmessage 全量刷新条件**

```ts
      if (ev.type === 'wave:added' || ev.type === 'wave:removed' ||
          ev.type === 'wave:parallelized' || ev.type === 'wave:parallel_removed') cb.onRefresh()
      else cb.onEvent(ev)
```

- [ ] **Step 2: 改 stores/raid.ts WsEvent 联合类型**

```ts
  | { type: 'wave:added'; index: number }
  | { type: 'wave:removed'; index: number }
  | { type: 'wave:parallelized'; index: number }
  | { type: 'wave:parallel_removed'; index: number }
```
（`applyEvent` 不加新分支——新事件被 `ws.ts` 截走触发刷新。）

- [ ] **Step 3: 类型检查确认通过**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/api/ws.ts frontend/src/stores/raid.ts
git commit -m "feat: WS 并行事件走全量刷新路径"
```

---

## Task 7: 前端 WaveSection — 标签 + 并行控件

**Files:**
- Modify: `frontend/src/components/WaveSection.vue`
- Test: `frontend/src/components/WaveSection.spec.ts`（Create）

- [ ] **Step 1: 写失败测试**（新建 `WaveSection.spec.ts`）

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WaveSection from './WaveSection.vue'
import type { Wave } from '../types'

function makeWave(over: Partial<Wave> = {}): Wave {
  return { id: 1, index: 1, group_id: null, round_index: 1, group_index: 1, slots: [], ...over }
}
function mountWave(wave: Wave, opts: { isAdmin?: boolean; canDelete?: boolean } = {}) {
  return mount(WaveSection, {
    props: { wave, editable: true, isAdmin: opts.isAdmin ?? true,
             canDelete: opts.canDelete ?? true, currentUserId: null },
    global: { stubs: { SlotCell: true } },
  })
}

describe('WaveSection 并行标签与操作', () => {
  it('独立波显示 第X波（无团号）', () => {
    const w = mountWave(makeWave())
    expect(w.text()).toContain('第 1 波')
    expect(w.text()).not.toContain('团')
  })
  it('并行波显示 第X波Y团', () => {
    const w = mountWave(makeWave({ group_id: 5, round_index: 1, group_index: 2 }))
    expect(w.text()).toContain('第 1 波 2 团')
  })
  it('独立波显示「并行到…」，管理员点击 emit parallelize', async () => {
    const wave = makeWave()
    const w = mountWave(wave)
    const btn = w.find('[data-act="parallelize"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(w.emitted('parallelize')).toBeTruthy()
    expect(w.emitted('parallelize')![0][0]).toEqual(wave)
  })
  it('轮内波显示「取消并行」，点击 emit unparallelize', async () => {
    const wave = makeWave({ group_id: 5 })
    const w = mountWave(wave)
    const btn = w.find('[data-act="unparallelize"]')
    expect(btn.exists()).toBe(true)
    expect(w.find('[data-act="parallelize"]').exists()).toBe(false)
    await btn.trigger('click')
    expect(w.emitted('unparallelize')).toBeTruthy()
  })
  it('非管理员不显示并行控件', () => {
    const w = mountWave(makeWave(), { isAdmin: false })
    expect(w.find('[data-act="parallelize"]').exists()).toBe(false)
    expect(w.find('[data-act="unparallelize"]').exists()).toBe(false)
  })
  it('删除本波仅 canDelete 时显示', () => {
    expect(mountWave(makeWave(), { canDelete: true }).find('.wave-delete').exists()).toBe(true)
    expect(mountWave(makeWave(), { canDelete: false }).find('.wave-delete').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/WaveSection.spec.ts`
Expected: FAIL（`data-act="parallelize"` 不存在；标签仍为 `第 {{ wave.index }} 波`）

- [ ] **Step 3: 实现**（`WaveSection.vue`）

script 加 computed + emits：
```ts
const emit = defineEmits<{
  (e: 'pick', slot: any): void
  (e: 'duty', slot: any, duty: string): void
  (e: 'remove', slot: any): void
  (e: 'deleteWave', index: number): void
  (e: 'manage', slot: any): void
  (e: 'moveTo', slot: any): void
  (e: 'parallelize', wave: Wave): void
  (e: 'unparallelize', wave: Wave): void
}>()
const waveLabel = computed(() =>
  props.wave.group_id == null
    ? `第 ${props.wave.round_index} 波`
    : `第 ${props.wave.round_index} 波 ${props.wave.group_index} 团`)
```

template 的 wave-head 替换：
```html
    <div class="wave-head">
      <b class="dnf-title">{{ waveLabel }}</b>
      <span style="margin-left:auto;display:flex;gap:12px;align-items:center">
        <a v-if="isAdmin && wave.group_id == null" href="#" class="wave-link"
           data-act="parallelize" @click.prevent="emit('parallelize', wave)">并行到…</a>
        <a v-if="isAdmin && wave.group_id != null" href="#" class="wave-link"
           data-act="unparallelize" @click.prevent="emit('unparallelize', wave)">取消并行</a>
        <a v-if="canDelete" href="#" class="wave-delete"
           @click.prevent="emit('deleteWave', wave.index)">删除本波</a>
      </span>
    </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/WaveSection.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/WaveSection.vue frontend/src/components/WaveSection.spec.ts
git commit -m "feat: WaveSection 并行标签与并行/取消并行控件"
```

---

## Task 8: 前端 RaidDetailView — 并行弹窗 + 管理员门控

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`
- Test: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: 写失败测试**（`RaidDetailView.spec.ts` 追加）

在文件顶部（`:26` mock 区后）加转发 stub，并加 mount 助手：
```ts
const WaveSectionForward = {
  name: 'WaveSection', props: ['wave'], emits: ['parallelize', 'unparallelize'],
  template: `<div><button data-act="par" @click="$emit('parallelize', wave)">并行到…</button>
    <button data-act="unpar" @click="$emit('unparallelize', wave)">取消并行</button></div>`,
}

function twoWaveRaid(signups: Raid['signups']): Raid {
  const r = makeRaid(signups)
  r.waves = [
    { id: 1, index: 1, group_id: null, round_index: 1, group_index: 1, slots: [] },
    { id: 2, index: 2, group_id: 1, round_index: 1, group_index: 2, slots: [] },
  ]
  return r
}

async function mountParallelView(signups: Raid['signups'], user: User = admin) {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore(); auth.user = user
  const store = useRaidStore()
  const snapshot = twoWaveRaid(signups)
  store.raid = twoWaveRaid(signups)
  apiMock.get.mockImplementation(async (url: string) => url === '/api/raids/1' ? snapshot : [])
  const router = createRouter({ history: createMemoryHistory(),
    routes: [{ path: '/raids/:id', component: RaidDetailView }] })
  await router.push('/raids/1'); await router.isReady()
  return { wrapper: mount(RaidDetailView, { global: {
    plugins: [pinia, router],
    stubs: { 'router-link': true, 'router-view': true, WaveSection: WaveSectionForward,
      CharacterPickerModal: true, SlotActionModal: true, UserAvatar: true,
      MemberCharactersModal: true, SignupMemberPicker: true, SignupModal: true,
      SlackRulesModal: true, teleport: true } } }), auth, store }
}
```

用例（追加到 describe）：
```ts
describe('并行攻坚', () => {
  it('管理员点击并行到… 弹窗列出其他波，选择触发 api.post', async () => {
    apiMock.post.mockResolvedValueOnce({})
    const { wrapper } = await mountParallelView([])
    await wrapper.find('[data-act="par"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('并行到')
    expect(wrapper.text()).toContain('第 1 波 2 团')   // 弹窗列出目标波标签
    await wrapper.find('[data-test="parallel-target-2"]').trigger('click')
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/waves/1/parallel', { target_index: 2 })
    expect(apiMock.get).toHaveBeenCalled()   // 成功后 load 刷新
  })
  it('管理员取消并行触发 api.del', async () => {
    apiMock.del.mockResolvedValueOnce({})
    const { wrapper } = await mountParallelView([])
    await wrapper.find('[data-act="unpar"]').trigger('click')
    expect(apiMock.del).toHaveBeenCalledWith('/api/raids/1/waves/1/parallel')
    expect(apiMock.get).toHaveBeenCalled()
  })
  it('成员不显示「＋ 添加一波」，管理员显示', async () => {
    const m = await mountParallelView([], member)
    expect(m.wrapper.text()).not.toContain('添加一波')
    const a = await mountParallelView([])
    expect(a.wrapper.text()).toContain('添加一波')
  })
})
```
（「＋ 添加一波」按钮加 `data-test="add-wave"`，用 `find('[data-test="add-wave"]')` 断言更稳。）

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: FAIL（无并行弹窗/无 add-wave 门控）

- [ ] **Step 3: 实现**（`RaidDetailView.vue`）

script 加：
```ts
const parallelizeWave = ref<Wave | null>(null)
const showParallelModal = computed(() => parallelizeWave.value != null)
const otherWaves = computed(() =>
  store.raid?.waves.filter(w => w.id !== parallelizeWave.value?.id) ?? [])
function waveLabel(w: Wave): string {
  return w.group_id == null ? `第 ${w.round_index} 波` : `第 ${w.round_index} 波 ${w.group_index} 团`
}
async function onParallelize(w: Wave) { parallelizeWave.value = w }
async function onParallelTo(target: Wave) {
  if (!store.raid || !parallelizeWave.value) return
  try {
    await api.post(`/api/raids/${store.raid.id}/waves/${parallelizeWave.value.index}/parallel`,
                   { target_index: target.index })
    parallelizeWave.value = null
    await load()
  } catch (e: any) { notifyError(e.message) }
}
async function onUnparallelize(w: Wave) {
  if (!store.raid) return
  try { await api.del(`/api/raids/${store.raid.id}/waves/${w.index}/parallel`); await load() }
  catch (e: any) { notifyError(e.message) }
}
```

template 改：
- 加波按钮：`v-if="editable"` → `v-if="auth.isAdmin"`，加 `data-test="add-wave"`。
- WaveSection 传参：`:can-delete="auth.isAdmin"`，加 `@parallelize="onParallelize" @unparallelize="onUnparallelize"`。
- 加并行目标弹窗（放在 SlackRulesModal 后）：
```html
    <n-modal :show="showParallelModal" preset="card" title="并行到哪一波？" style="width:min(360px,92vw)"
             @update:show="(s: boolean) => { if (!s) parallelizeWave = null }">
      <div style="display:flex;flex-direction:column;gap:8px">
        <button v-for="t in otherWaves" :key="t.id" class="dnf-btn"
                :data-test="`parallel-target-${t.id}`" @click="onParallelTo(t)">
          {{ waveLabel(t) }}
        </button>
      </div>
    </n-modal>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts src/components/WaveSection.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RaidDetailView.vue frontend/src/views/RaidDetailView.spec.ts
git commit -m "feat: 并行目标弹窗 + 加波/删波/并行控件管理员门控"
```

---

## Task 9: 全量验证

**Files:** 无

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: PASS（全量）

- [ ] **Step 2: 前端全量测试 + 构建**

Run: `cd frontend && npx vitest run`，然后 `cd frontend && npm run build`
Expected: PASS + build 成功

- [ ] **Step 3: 修复任何回归并提交**

```bash
git add -A && git commit -m "fix: 并行攻坚回归修复"
```
（若 Step 1/2 全绿则跳过本步。）

---

## 手工验收（可选）

1. 建 12 人团，加 2 波，把第 2 波「并行到」第 1 波 → 显示「第 1 波 1 团」「第 1 波 2 团」。
2. 普通成员看不到「＋ 添加一波」「并行到…」「删除本波」。
3. 成员尝试 API 直接调加波/删波/并行 → 403。
4. 同玩家占并行两团 → 前端提示「同一轮次中一个玩家只能上一个角色」。
