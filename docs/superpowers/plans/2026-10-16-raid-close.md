# 攻坚关闭（快照归档）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员可「关闭」一场攻坚：关闭瞬间把整场详情冻结为 JSON 快照（`raids.snapshot`）、标 `raids.closed`、删除 live 占位/报名行释放角色引用、之后只读（不可逆），查看详情即查看快照。

**Architecture:** 后端 `Raid.closed`+`Raid.snapshot` 列 + 幂等迁移；`POST /{rid}/close` 先 `_detail().model_dump(mode="json")` 取快照再 bulk 删 Slot/Wave/RaidSignupCharacter/RaidSignup；共享 `_read_detail(db, raid)` 对 closed 由快照重建 `RaidDetail`；全部写端点 `_reject_if_closed` 拒绝。前端 `closed` 字段 + 详情/列表/编队只读化 + `applyEvent` 处理 `raid:closed` + 关闭按钮强确认。

**Tech Stack:** FastAPI + SQLAlchemy 2（backend，venv `backend/.venv`）+ Vue 3 `<script setup>` + naive-ui + Vitest（frontend）。测试：后端 `cd backend && .venv/bin/python -m pytest <file> -v`；前端 `cd frontend && npx vitest run <file>`；类型/构建 `cd frontend && npm run build`。

**Spec:** `docs/superpowers/specs/2026-10-16-raid-close-design.md`

**前置注意（重要）：** 工作区有与本计划无关的未跟踪目录 `docs/usage/`——勿 add、勿动。提交直接到 main（仓库约定）。

---

### Task 1: 后端 — 模型列 + 幂等迁移（TDD）

**Files:**
- Modify: `backend/app/models.py`（`Raid`）
- Modify: `backend/app/migrations.py`（新增 `migrate_raid_close`）
- Modify: `backend/app/db.py:35-45`（init_db 注册）
- Test: `backend/tests/test_migrations.py`（新增用例）

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_migrations.py` 末尾追加（**沿用该文件既有模式**：内联 `create_engine("sqlite://")` + 手工建**缺新列的遗留 `raids` 表**——本文件没有 `db_engine` fixture）：

```python
def test_migrate_raid_close_adds_columns():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE raids (
            id INTEGER PRIMARY KEY, name VARCHAR(128), dungeon_id INTEGER,
            size INTEGER, locked BOOLEAN, created_by INTEGER,
            starts_at DATETIME, created_at DATETIME)"""))
    from app.migrations import migrate_raid_close
    migrate_raid_close(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(raids)")).all()}
        assert "closed" in cols
        assert "snapshot" in cols
    migrate_raid_close(engine)  # 幂等：再次运行不报错
```

（`create_engine`/`text` 文件顶部已 import；`migrate_raid_close` 内部 `Base.metadata.create_all` 会建其余表但不会重建已存在的遗留 `raids` 表，随后 ALTER 补列。）

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_migrations.py -v -k raid_close`
Expected: FAIL（`Raid` 模型/表尚无 `closed`/`snapshot` 列，或 `migrate_raid_close` 未定义）。

- [ ] **Step 3: 实现**

`backend/app/models.py` `Raid` 类（`locked` 列附近）加：

```python
    closed: Mapped[bool] = mapped_column(Boolean, default=False)   # 已关闭（终态）
    snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # 关闭时冻结的详情快照
```

（`JSON` 已在 models.py 顶部 import——`RaidSlackRule.rules` 用过。）

`backend/app/migrations.py` 追加（对齐 `migrate_users_guest` 模式）：

```python
def migrate_raid_close(engine: Engine) -> None:
    """为存量库补建 raids.closed / raids.snapshot 列（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(raids)")).all()}
        if "closed" not in cols:
            conn.execute(text("ALTER TABLE raids ADD COLUMN closed BOOLEAN NOT NULL DEFAULT 0"))
        if "snapshot" not in cols:
            conn.execute(text("ALTER TABLE raids ADD COLUMN snapshot JSON"))
```

`backend/app/db.py` init_db：import 加 `migrate_raid_close`，调用链末尾加 `migrate_raid_close(engine)`。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_migrations.py -q`
Expected: 全 PASS（新库 `create_all` 建列 + 存量库 ALTER 均覆盖）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "$(cat <<'EOF'
[feat] Raid.closed/snapshot 列 + migrate_raid_close 幂等迁移

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 后端 — schemas + `_read_detail` + `POST /{rid}/close`（TDD）

**Files:**
- Modify: `backend/app/schemas.py`（`RaidDetail`/`RaidListItem` 加 `closed`）
- Modify: `backend/app/routers/raids.py`（`_read_detail` 助手 + `close_raid` 端点）
- Test: `backend/tests/test_raid_close.py`（新文件，4 用例）

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_raid_close.py`：

```python
from .helpers import make_raid, register_user, signup


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _mkchar(client, h, name="C", job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]


def _slot_of(client, rid, h):
    return client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]


def test_close_snapshot_freezes_character_attrs(client):
    """关闭后改角色属性 → 详情仍显示关闭时快照值。"""
    ah = _admin(client)
    h, _ = register_user(client, "rc1", "甲")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    slot = _slot_of(client, rid, h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    r = client.post(f"/api/raids/{rid}/close", headers=ah)
    assert r.status_code == 200
    assert r.json()["closed"] is True
    assert any(s["character_id"] == cid for s in r.json()["waves"][0]["slots"])
    # 关闭后改角色属性
    assert client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "改名后", "job_name": "weapon_master", "fame": 99999}).status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert detail["closed"] is True
    filled = next(s for s in detail["waves"][0]["slots"] if s["character_id"] == cid)
    assert filled["character_name"] == "C"
    assert filled["fame"] == 1


def test_close_irreversible(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 400


def test_close_frees_character_references(client):
    """关闭清 live 占位/报名行 → 角色可删除（无死锁）。"""
    ah = _admin(client)
    h, _ = register_user(client, "rc2", "乙")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    slot = _slot_of(client, rid, h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    # 详情（快照）仍含报名与占位；但 live 行已清 → 角色可删
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) >= 1
    assert client.delete(f"/api/me/characters/{cid}", headers=h).status_code == 200


def test_close_broadcasts_raid_closed(client):
    """关闭广播 raid:closed（WS 连接用 admin token，对齐 test_ws.py 模式）。"""
    from .test_ws import _admin as ws_admin
    token = ws_admin(client)
    ah = {"Authorization": f"Bearer {token}"}
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        client.post(f"/api/raids/{rid}/close", headers=ah)
        assert ws.receive_json()["type"] == "raid:closed"
```

（若 `from .test_ws import _admin` 不被 pytest 当作测试收集，就直接在文件内写一个返回 token 的 `_token(client)`，login 后 `r.json()["token"]`。）

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raid_close.py -v`
Expected: 全部 FAIL（无 `close` 端点 → 405/404；`closed` 字段缺失）。

- [ ] **Step 3: 实现**

`backend/app/schemas.py`：
- `RaidListItem`（约 159 行）`locked` 后加 `closed: bool = False`；
- `RaidDetail`（约 204 行）`locked` 后加 `closed: bool = False`。

`backend/app/routers/raids.py`：
- 新增助手（放 `_detail` 之后）：

```python
def _read_detail(db: Session, raid: Raid) -> RaidDetail:
    """closed 攻坚由快照重建详情；否则走 live _detail。"""
    if raid.closed and raid.snapshot:
        return RaidDetail.model_validate({**raid.snapshot, "id": raid.id, "closed": True})
    return _detail(db, raid)
```

- 新增关闭端点（放 `update_raid` 附近，`require_admin`，`async def`）：

```python
@router.post("/{rid}/close", response_model=RaidDetail)
async def close_raid(rid: int, admin: User = Depends(require_admin),
                     db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if admin.is_banned:
        raise HTTPException(403, "你已被封禁，无法操作")
    if raid.closed:
        raise HTTPException(400, "攻坚已关闭")
    raid.snapshot = _detail(db, raid).model_dump(mode="json")  # 先取快照（datetime→ISO）
    raid.closed = True
    # 清理 live 行：Slot → Wave → RaidSignupCharacter → RaidSignup（释放角色引用）
    db.query(Slot).filter(Slot.wave.has(raid_id=raid.id)).delete(synchronize_session=False)
    db.query(Wave).filter(Wave.raid_id == raid.id).delete(synchronize_session=False)
    db.query(RaidSignupCharacter).filter(RaidSignupCharacter.signup_id.in_(
        select(RaidSignup.id).where(RaidSignup.raid_id == raid.id))).delete(synchronize_session=False)
    db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id).delete(synchronize_session=False)
    db.commit()
    await manager.broadcast(rid, {"type": "raid:closed"})
    return _read_detail(db, raid)
```

> **要点**：`model_dump(mode="json")` 必须带 `mode="json"`（否则 `starts_at`/`created_at` 是 datetime，SQLite JSON 列序列化会 `TypeError`）。清理后不要再调 `_detail`（live 波已空），统一 `_read_detail` 走快照。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raid_close.py -v`
Expected: 4 PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/raids.py backend/tests/test_raid_close.py
git commit -m "$(cat <<'EOF'
[feat] 攻坚关闭端点：快照冻结 + 清理 live 行 + raid:closed 广播

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 后端 — 冻结全部写端点（TDD）

**Files:**
- Modify: `backend/app/routers/raids.py`（`_reject_if_closed` + 各端点插入）
- Modify: `backend/app/routers/bot.py`（`bot_signup` / `bot_cancel_signup`）
- Test: `backend/tests/test_raid_close.py`（新增冻结用例）

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_raid_close.py` 追加：

```python
def _closed_raid(client, ah):
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    return rid


def test_all_write_endpoints_rejected_when_closed(client):
    """关闭后全部写端点 400「攻坚已关闭，无法操作」。"""
    ah = _admin(client)
    h, u = register_user(client, "rc4", "丁")
    cid = _mkchar(client, h)
    rid = _closed_raid(client, ah)
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    wave = detail["waves"][0]
    slot = wave["slots"][0]
    checks = [
        ("post", f"/api/raids/{rid}/slots/{slot['id']}/fill", {"character_id": cid}),
        ("delete", f"/api/raids/{rid}/slots/{slot['id']}", None),
        ("put", f"/api/raids/{rid}/slots/{slot['id']}/duty", {"duty": "主C"}),
        ("post", f"/api/raids/{rid}/waves", {}),
        ("delete", f"/api/raids/{rid}/waves/{wave['index']}", None),
        ("post", f"/api/raids/{rid}/waves/{wave['index']}/parallel", {"target_index": wave["index"]}),
        ("delete", f"/api/raids/{rid}/waves/{wave['index']}/parallel", None),
        ("post", f"/api/raids/{rid}/lock", None),
        ("post", f"/api/raids/{rid}/unlock", None),
        ("put", f"/api/raids/{rid}/slack-rules", {"criteria": [], "exchange": []}),
        ("put", f"/api/raids/{rid}", {"name": "改名"}),
        ("post", f"/api/raids/{rid}/signup", None),
        ("post", f"/api/raids/{rid}/signup/characters/{cid}", None),
        ("delete", f"/api/raids/{rid}/signup/characters/{cid}", None),
        ("delete", f"/api/raids/{rid}/signup", None),
        ("delete", f"/api/raids/{rid}/signups/{u['id']}", None),
        ("post", f"/api/raids/{rid}/signups", {"user_id": u["id"]}),
    ]
    for method, url, body in checks:
        r = getattr(client, method)(url, headers=ah, json=body) if body is not None \
            else getattr(client, method)(url, headers=ah)
        assert r.status_code == 400, f"{method} {url} -> {r.status_code} {r.text}"
        assert r.json()["detail"] == "攻坚已关闭，无法操作"
```

（`move_slot` 是 admin 独占且需两个格子，单独一个用例：关闭后 `POST /{rid}/slots/{s}/move` 400；bot 报名/取消也各断言 400。若 `put /api/raids/{rid}` 需要 body 里有 starts_at 之类必填，用最小合法体，或该断言只检查 400 状态码即可。）

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raid_close.py -v -k rejected`
Expected: FAIL（当前未冻结，各端点不返回 400「攻坚已关闭，无法操作」）。

- [ ] **Step 3: 实现**

`backend/app/routers/raids.py` 加助手：

```python
def _reject_if_closed(raid: Raid) -> None:
    if raid.closed:
        raise HTTPException(400, "攻坚已关闭，无法操作")
```

在以下端点**解析 raid 之后、任何业务逻辑之前**调用 `_reject_if_closed(raid)`（`update_raid / set_slack_rules / lock_raid / unlock_raid / add_wave / delete_wave / parallelize_wave / unparallelize_wave / fill_slot / remove_slot / change_duty / move_slot / signup / add_signup_character / remove_signup_character / cancel_self / cancel_other / admin_signup`）。`signup`/`add_signup_character`/`remove_signup_character`/`cancel_self` 已有各自 403/400 的 lock 检查，`_reject_if_closed` 放最前即可。

`backend/app/routers/bot.py`：`bot_signup` / `bot_cancel_signup` 在解析 raid 后同样 `_reject_if_closed(raid)`（从 `..routers.raids import ... _reject_if_closed`）。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raid_close.py -v`
Expected: 全 PASS（冻结用例 + Task 2 的 4 用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/raids.py backend/app/routers/bot.py backend/tests/test_raid_close.py
git commit -m "$(cat <<'EOF'
[fix] 关闭攻坚冻结：全部写端点（含 bot）400 拒绝

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 后端 — 读取分支（get/list/public）（TDD）

**Files:**
- Modify: `backend/app/routers/raids.py`（`get_raid`、`list_raids`）
- Modify: `backend/app/routers/public.py`（三端点）
- Test: `backend/tests/test_raid_close.py` + `backend/tests/test_public_raids.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_raid_close.py` 追加：

```python
def test_closed_raid_list_counts_from_snapshot(client):
    """列表页对 closed 攻坚的 wave/signup/my_signed_up 从快照推导。"""
    ah = _admin(client)
    h, u = register_user(client, "rc5", "戊")
    _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    item = next(r for r in client.get("/api/raids", headers=ah).json() if r["id"] == rid)
    assert item["closed"] is True
    assert item["wave_count"] >= 1        # 来自快照（live 波已删）
    assert item["signup_count"] >= 1      # 非团长报名行数（来自快照）
    # 已报名用户视角 my_signed_up
    item_mine = next(r for r in client.get("/api/raids", headers=h).json() if r["id"] == rid)
    assert item_mine["my_signed_up"] is True
```

在 `backend/tests/test_public_raids.py`（若不存在则新建，对齐该文件既有 fixture 的 bot token 头写法）追加 closed 攻坚的公开详情/列表/波次由快照提供：

```python
def test_public_closed_raid_serves_snapshot(client):
    from .helpers import make_raid, register_user, signup
    ah_ = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    ah = {"Authorization": f"Bearer {ah_.json()['token']}"}
    h, _ = register_user(client, "prc1", "甲")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "job_name": "weapon_master", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    s = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    assert client.post(f"/api/raids/{rid}/close", headers=ah).status_code == 200
    bot = {"Authorization": "Bearer change-me-bot-token"}
    # 公开详情 → closed=True 且含波/报名（快照）
    d = client.get(f"/api/public/raids/{rid}", headers=bot).json()
    assert d["closed"] is True and len(d["waves"]) >= 1 and len(d["signups"]) >= 1
    # 公开列表 → closed=True、wave_count 来自快照
    item = next(r for r in client.get("/api/public/raids", headers=bot).json()
                if r["id"] == rid)
    assert item["closed"] is True and item["wave_count"] >= 1
    # 公开波次 → 由快照重建，不 404
    r = client.get(f"/api/public/raids/{rid}/waves/{d['waves'][0]['index']}", headers=bot)
    assert r.status_code == 200
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raid_close.py tests/test_public_raids.py -v -k "closed|snapshot"`
Expected: FAIL（当前 `get_raid`/`list_raids`/public 都走 live，closed 后 wave_count=0、detail 空、public_wave 404）。

- [ ] **Step 3: 实现**

`backend/app/routers/raids.py`：
- `get_raid`：`return _read_detail(db, _raid_or_404(db, rid))`。
- `list_raids`：closed 分支（在循环内按 `r.closed` 分流）：

```python
    for r in db.query(Raid).options(selectinload(Raid.dungeon)).order_by(Raid.created_at.desc()).all():
        if r.closed:
            snap = r.snapshot or {}
            wave_count = len(snap.get("waves") or [])
            signup_count = sum(1 for s in (snap.get("signups") or [])
                               if s.get("created_at") is not None)
            my_signed_up = (r.created_by == user.id) or any(
                s.get("user", {}).get("id") == user.id for s in (snap.get("signups") or []))
        else:
            wave_count = len(r.waves)
            signup_count = counts.get(r.id, 0)
            my_signed_up = (r.created_by == user.id) or r.id in my_ids
        items.append(RaidListItem(id=r.id, name=r.name, dungeon_id=r.dungeon_id,
                                  dungeon_name=r.dungeon.name, size=r.size,
                                  locked=r.locked, closed=r.closed, starts_at=r.starts_at,
                                  wave_count=wave_count, signup_count=signup_count,
                                  my_signed_up=my_signed_up))
```

`backend/app/routers/public.py`：
- `public_raid`：`return _read_detail(db, raid)`（改 import `_read_detail`）。
- `public_wave`：closed 时由快照重建：

```python
    raid = db.get(Raid, rid)
    if raid is None:
        raise HTTPException(404, "攻坚不存在")
    if raid.closed and raid.snapshot:
        for w in raid.snapshot.get("waves", []):
            if w.get("index") == index:
                return WaveOut(**w)
        raise HTTPException(404, "波次不存在")
    wave = db.query(Wave).filter(Wave.raid_id == rid, Wave.index == index).first()
    if wave is None:
        raise HTTPException(404, "波次不存在")
    detail = _read_detail(db, raid)
    for w in detail.waves:
        if w.index == index:
            return w
    raise HTTPException(404, "波次不存在")
```

- `public_raids`：closed 分支推导（无 user）：

```python
        wave_count = len(r.snapshot.get("waves") or []) if r.closed and r.snapshot else len(r.waves)
        signup_count = sum(1 for s in (r.snapshot.get("signups") or [])
                           if s.get("created_at") is not None) if r.closed and r.snapshot else 0
        RaidListItem(..., locked=r.locked, closed=r.closed, starts_at=r.starts_at,
                     wave_count=wave_count, signup_count=signup_count, my_signed_up=False)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raid_close.py tests/test_public_raids.py -q`
Expected: 全 PASS。

- [ ] **Step 5: 全量后端回归**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest -q`
Expected: 全 PASS（尤其 `test_public_raids.py`、`test_raids.py`、`test_bot_raid_signup.py` 不回归）。

- [ ] **Step 6: 提交**

```bash
git add backend/app/routers/raids.py backend/app/routers/public.py backend/tests/test_raid_close.py backend/tests/test_public_raids.py
git commit -m "$(cat <<'EOF'
[feat] 读取分支：closed 攻坚详情/列表/公开端点由快照提供

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 前端 — types `closed` + WS `applyEvent`（TDD）

**Files:**
- Modify: `frontend/src/types.ts`（`Raid`/`RaidListItem` 加 `closed`）
- Modify: `frontend/src/stores/raid.ts`（`WsEvent` + `applyEvent`）
- Test: `frontend/src/stores/raid.spec.ts` + 各处 Raid/RaidListItem fixture

- [ ] **Step 1: 加字段 + 修 fixture**

`frontend/src/types.ts`：`Raid` 与 `RaidListItem` 各加 `closed: boolean`（必填）。然后跑一次 `npm run build`（vue-tsc）找出所有 Raid/RaidListItem 字面量 fixture 报错处，逐一补 `closed: false`（涉及 RaidList/RaidDetail/RosterView/RaidDetailView/stores/raid 等 spec 的 fixture，vue-tsc 为准）。

- [ ] **Step 2: 写失败测试**

`frontend/src/stores/raid.spec.ts` 追加（先读该文件确认 fixture/store 构造方式）：

```typescript
it('raid:closed 事件置 closed 并触发 reload 提示', () => {
  const raid = makeRaid()   // 按既有 fixture 构造，closed: false
  const store = useRaidStore(); store.raid = raid
  applyEvent(store, { type: 'raid:closed' })
  expect(store.raid.closed).toBe(true)
  expect(store.needRefresh).toBe(true)
})
```

- [ ] **Step 3: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/stores/raid.spec.ts`
Expected: 新用例 FAIL（`applyEvent` 无 `raid:closed` 分支）。

- [ ] **Step 4: 实现**

`frontend/src/stores/raid.ts`：
- `WsEvent` 联合加 `| { type: 'raid:closed' }`；
- `applyEvent` 加分支：

```typescript
    case 'raid:closed': raid.closed = true; store.needRefresh = true; break
```

- [ ] **Step 5: 运行确认通过 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/stores/raid.spec.ts && npm run build`
Expected: PASS + 构建绿（fixture 已补 `closed`）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/types.ts frontend/src/stores/raid.ts frontend/src/stores/raid.spec.ts <修过的 fixture spec 文件>
git commit -m "$(cat <<'EOF'
[feat] Raid/RaidListItem 加 closed 字段 + applyEvent 处理 raid:closed

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 前端 — 详情页只读化 + 关闭按钮（TDD）

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`
- Modify: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `RaidDetailView.spec.ts` 追加（用 `makeRaid` 构造 `closed: true` 的 raid fixture；先读 spec 现有 `makeRaid`/`mountView` 结构）：

```typescript
it('closed 攻坚显示已关闭徽章并隐藏编辑入口', async () => {
  const closedRaid = { ...makeRaid([...]), closed: true }
  const { wrapper } = await mountView([...], admin, closedRaid)
  await flushPromises()
  expect(wrapper.text()).toContain('已关闭')
  expect(wrapper.find('[data-test="signup"]').exists()).toBe(false)
  expect(wrapper.find('[data-test="roster-link"]').exists()).toBe(false)
  expect(wrapper.find('[data-test="add-wave"]').exists()).toBe(false)
  expect(wrapper.find('[data-test="close-raid"]').exists()).toBe(false) // 已关闭不显示关闭按钮
})

it('关闭按钮走强确认后调 close 并刷新', async () => {
  // 未关闭 raid，管理员可见 [data-test="close-raid"]；点击 → confirmDialog → POST /close → load
})
```

`frontend/src/components/MemberCharactersModal.spec.ts` 追加（对齐该文件既有 mount 写法）：传入 `characters` prop 时**不触发 fetch**（`apiMock.get` 不被调用 `/signups/...`）、直接渲染传入角色：

```typescript
it('传入 characters prop 时免 fetch，直接渲染快照角色', async () => {
  const wrapper = mount(MemberCharactersModal, {
    props: { open: true, rid: 1, user: member, placed: {},
             characters: chars },   // chars 为既有 fixture
    global: { stubs: { teleport: true, CharacterCard: true } },
  })
  await flushPromises()
  expect(apiMock.get).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain(...)  // 渲染了传入角色（按既有断言风格）
})
```

（`mountView` 现有 stub 已含 SignupModal/WaveSection 等；`closed` 分支测试可能需要把某些 stub 取消以断言徽章/按钮，视实现取舍调整。）

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: 新用例 FAIL。

- [ ] **Step 3: 实现**

`RaidDetailView.vue`（`const closed = computed(() => store.raid?.closed ?? false)`）：
- **顶部徽章**：头部区 `v-if="closed"` 显示「已关闭」。
- **隐藏编辑入口**：给现有各编辑按钮/入口的 `v-if` 条件追加 `&& !closed`——报名（signup）、`＋`（signup-plus）、添加临时选手（add-guest）、管理角色/取消报名（signup-group 内按钮）、锁定/解锁、修改、添加一波（add-wave）、划水规则、编队（roster-link）、选人面板（memberPicker）、并行操作。最简：在这些条件的公共处统一 `&& !closed`。**另需给 `editable` computed（RaidDetailView.vue:36 `!store.raid?.locked || auth.isAdmin`）追加 `&& !closed`**——否则未锁定的 closed 攻坚管理员仍可点格进入编辑态（后端 400 兜底，但 UI 不是「只读」）。
- **不连 WS（关键）**：`onMounted` 时 `store.raid` 还是 null（`load()` 未 resolve），**不能**在 mount 里用 `store.raid?.closed` 判——直链进入已关闭攻坚仍会连上 WS。改为两处兜底：
  1. `load()` 里 `await store.load(rid)` 之后：`if (store.raid?.closed) disconnect?.()`（连上后立即断，覆盖直链进入场景）；
  2. `onEvent` 加 `if (ev.type === 'raid:closed') { disconnect?.(); void load() }`（覆盖「已在开放页时被关闭」场景；disconnect 闭包幂等，重复调用无副作用）。
- **成员弹框**：`MemberCharactersModal` 的取数改为——`closed` 时从 `store.raid.signups.find(s => s.user.id === user.id)?.characters` 渲染（不走 fetch），避免 404。给 `MemberCharactersModal` 加可选 prop `characters?: Character[]`（传入则免 fetch、直接渲染），父级在 closed 时传快照角色数组。
- **关闭按钮**：管理员区加 `data-test="close-raid"` 按钮（`v-if="auth.isAdmin && !closed"`）→ 强 confirmDialog（内容强调不可逆）→ `POST /api/raids/{rid}/close` → `load()`。

- [ ] **Step 4: 运行确认通过 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidDetailView.spec.ts && npm run build`
Expected: PASS + 构建绿。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RaidDetailView.vue frontend/src/views/RaidDetailView.spec.ts frontend/src/components/MemberCharactersModal.vue <若有>
git commit -m "$(cat <<'EOF'
[feat] 详情页：关闭攻坚只读化（徽章/隐藏编辑/免 WS）+ 关闭按钮强确认

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 前端 — 列表页 + 编队页（TDD）

**Files:**
- Modify: `frontend/src/views/RaidListView.vue` + `RaidListView.spec.ts`
- Modify: `frontend/src/views/RosterView.vue` + `RosterView.spec.ts`

- [ ] **Step 1: 写失败测试**

`RaidListView.spec.ts` 追加：`closed: true` 的 raid → 显示「已关闭」徽章、无报名按钮（`[data-test="signup"]` 不存在）、管理员删除按钮仍在。

`RosterView.spec.ts` 追加：`closed: true` → `canEdit` 为 false（管理员也进不了编辑态/无「＋临时」入口）。

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidListView.spec.ts src/views/RosterView.spec.ts`
Expected: 新用例 FAIL。

- [ ] **Step 3: 实现**

`RaidListView.vue`：
- 卡片徽章：`closed` → 灰显「已关闭」（新增 `<span v-if="r.closed" class="dnf-badge dnf-badge-danger">已关闭</span>` 或复用现有 badge 样式）；
- 报名按钮 `v-if="!r.locked && !r.my_signed_up && !r.closed"`；
- 删除按钮保持 `auth.isAdmin`（可删已关闭）。

`RosterView.vue`：
- `const canEdit = computed(() => auth.isAdmin && !store.raid?.closed)`；
- **不连 WS（关键）**：`onMounted` 时 `store.raid` 还是 null，不能在 mount 里判——在 `load()` 里 `await store.load(rid)` 之后 `if (store.raid?.closed) disconnect?.()`（对齐详情页的两处兜底：load 后断 + `onEvent` 判 `raid:closed` 断并 reload）；
- closed 时显示只读提示（如顶部「攻坚已关闭，仅查看」）。

- [ ] **Step 4: 运行确认通过 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidListView.spec.ts src/views/RosterView.spec.ts && npm run build`
Expected: PASS + 构建绿。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RaidListView.vue frontend/src/views/RaidListView.spec.ts frontend/src/views/RosterView.vue frontend/src/views/RosterView.spec.ts
git commit -m "$(cat <<'EOF'
[feat] 列表/编队页：已关闭攻坚徽章、禁报名、编队只读不连 WS

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 全量验证 + CHANGELOG + 收尾

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 后端全量**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest -q`
Expected: 全 PASS。

- [ ] **Step 2: 前端全量 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run && npm run build`
Expected: 全 PASS + 构建绿。

- [ ] **Step 3: CHANGELOG**

在 `CHANGELOG.md` `## [Unreleased]` 的 `### 新增`（若无则新增该节）追加：

```markdown
### 新增

- **攻坚关闭（快照归档）**：管理员可关闭一场攻坚——关闭瞬间把整场排表与参与角色冻结为不可变快照，之后查看详情即查看快照，不受后续角色编辑影响；关闭不可逆（只读 + 可删除），关闭后该攻坚不再占用任何角色引用
```

- [ ] **Step 4: 提交**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
[docs] CHANGELOG：攻坚关闭（快照归档）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: 确认最终状态**

Run: `git status --short` 与 `git log --oneline -12`
Expected: 工作区干净（除无关 `?? docs/usage/`）；顶部为本计划 8 个提交。
