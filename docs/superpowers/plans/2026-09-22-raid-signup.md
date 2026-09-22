# 攻坚报名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为攻坚引入报名机制：普通用户报名后管理员排表时才能选择其角色；发起攻坚的团长（`raid.created_by`）默认参加；详情页展示已报名列表并支持取消。

**Architecture:** 新增独立表 `raid_signups`（raid_id+user_id 唯一，`Raid.signups` 级联删除）。团长 `raid.created_by` 免报名恒参与；其余用户（含非团长管理员）需报名才可被排表。`fill_slot` 统一校验「被放置角色的主人必须参与（团长或已报名）」，普通用户自放未报名 → 403。选人面板管理员模式前端过滤为「团长 ∪ 已报名用户」。报名/取消走 3 个新端点，WS 广播 `raid:signup` / `raid:signup_removed`。

**Tech Stack:** Python FastAPI · SQLAlchemy 2 · SQLite · Vue 3 + Pinia + naive-ui · Vitest

**Spec:** `docs/superpowers/specs/2026-09-22-raid-signup-design.md`

**测试环境：** 后端 `cd backend && .venv/bin/python -m pytest <file> -v`；前端 `cd frontend && npx vitest run <file>`。仓库工作流直接提交到 `main` 分支，不做 worktree。后端全量现有 117 passed。

**注意（既有测试受 `fill_slot` 新校验影响）：** Task 3 会在 `fill_slot` 加「被放置角色主人须参与」校验，凡是在既有测试里占位/放置角色的用户都需要先报名。helpers.py 会新增 `signup(client, rid, headers)` 辅助函数，Task 3 逐文件补调用（具体清单见 Task 3 Step 5）。

---

### Task 1: 数据模型 + schema + 测试引擎外键

**Files:**
- Modify: `backend/app/models.py`（新增 `RaidSignup`；`Raid` 补 `signups` 关系）
- Modify: `backend/app/schemas.py`（新增 `RaidSignupOut`；扩展 `RaidListItem`/`RaidDetail`）
- Modify: `backend/tests/conftest.py`（测试引擎挂外键 pragma）
- Create: `backend/tests/test_raid_signup.py`

- [ ] **Step 1: 写失败测试** `backend/tests/test_raid_signup.py`

```python
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Dungeon, Raid, RaidSignup, User


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_raid_signup_model_roundtrip_unique_cascade(db):
    admin = db.query(User).filter(User.username == "admin").one()
    d = Dungeon(name="副本", size=12)
    db.add(d)
    db.flush()
    r = Raid(name="x", dungeon_id=d.id, size=12, locked=False,
             starts_at=_now(), created_by=admin.id)
    db.add(r)
    db.flush()
    u = User(username="u1", password_hash="x", nickname="甲", is_admin=False)
    db.add(u)
    db.flush()

    db.add(RaidSignup(raid_id=r.id, user_id=u.id))
    db.commit()
    assert db.query(RaidSignup).count() == 1

    # 同 raid+user 唯一
    db.add(RaidSignup(raid_id=r.id, user_id=u.id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # 删团级联清 signups（Raid.signups cascade="all, delete-orphan"）
    r = db.query(Raid).get(r.id)
    db.delete(r)
    db.commit()
    assert db.query(RaidSignup).count() == 0
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -v`
Expected: FAIL —— `from app.models import ... RaidSignup` 处 `ImportError`（模型尚未定义）。

- [ ] **Step 3: `conftest.py` 测试引擎补外键 pragma**

在 `backend/tests/conftest.py` 的 `engine = create_engine(...)` 之后追加：

```python
from sqlalchemy import event

@event.listens_for(engine, "connect")
def _set_sqlite_fk(dbapi_connection, _):  # pragma: no cover
    dbapi_connection.execute("PRAGMA foreign_keys=ON")
```

（与 `app/db.py` 生产引擎一致，让「删除攻坚带报名 → 外键错误」这类测试有验证意义。）

- [ ] **Step 4: `models.py` 新增 `RaidSignup` 与 `Raid.signups`**

在 `backend/app/models.py` 的 `Slot` 类之后追加：

```python
class RaidSignup(Base):
    __tablename__ = "raid_signups"
    __table_args__ = (UniqueConstraint("raid_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    raid: Mapped[Raid] = relationship(back_populates="signups")
    user: Mapped[User] = relationship()
```

在 `Raid` 类内（`waves` 关系之后）追加：

```python
    signups: Mapped[list["RaidSignup"]] = relationship(
        back_populates="raid", cascade="all, delete-orphan")
```

- [ ] **Step 5: `schemas.py` 新增 schema 与字段**

在 `backend/app/schemas.py` 的 `MoveIn` 之后追加：

```python
class RaidSignupOut(BaseModel):
    user: UserOut
    created_at: datetime | None  # 团长固定行（无真实报名记录）为 None
```

`RaidListItem` 追加字段：

```python
class RaidListItem(BaseModel):
    ...
    signup_count: int
    my_signed_up: bool
```

`RaidDetail` 追加字段：

```python
class RaidDetail(BaseModel):
    ...
    signups: list[RaidSignupOut]
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -v`
Expected: PASS —— 1 test passed（roundtrip / 唯一约束 / 级联三断言）。

- [ ] **Step 7: 跑存量模型相关测试确认无回归**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py tests/test_raids.py -q`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/tests/conftest.py backend/tests/test_raid_signup.py
git commit -m "feat: 攻坚报名数据模型 RaidSignup + Raid.signups 级联 + schema 字段"
```

---

### Task 2: 后端报名/取消端点 + 列表/详情补字段（含 WS 广播）

**Files:**
- Modify: `backend/app/routers/raids.py`
- Modify: `backend/tests/test_raid_signup.py`

- [ ] **Step 1: 写失败测试（报名/取消/列表/详情/删团）**

在 `backend/tests/test_raid_signup.py` 追加（顶部 import `from .helpers import make_raid, register_user`）：

```python
from .helpers import make_raid, register_user


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _mkchar(client, h, name="C", job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]


def test_signup_success_and_detail(client):
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    ah = {"Authorization": f"Bearer {login.json()['token']}"}
    admin_id = login.json()["user"]["id"]
    rid = make_raid(client, ah)["id"]
    h, u = register_user(client, "sig1", "甲")
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    # 列表字段
    item = [x for x in client.get("/api/raids", headers=h).json() if x["id"] == rid][0]
    assert item["signup_count"] == 1
    assert item["my_signed_up"] is True
    # 详情：团长（创建者=管理员）在首位（created_at=None），报名者在后
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert detail["signups"][0]["created_at"] is None
    assert detail["signups"][0]["user"]["id"] == admin_id
    assert detail["signups"][1]["user"]["id"] == u["id"]
    assert detail["signups"][1]["created_at"] is not None


def test_signup_creator_blocked(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signup", headers=ah)
    assert r.status_code == 400
    assert r.json()["detail"] == "团长无需报名"


def test_signup_locked_blocked(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    h, _ = register_user(client, "sig2", "乙")
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "攻坚已锁定，无法报名"


def test_signup_duplicate_blocked(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    h, _ = register_user(client, "sig3", "丙")
    client.post(f"/api/raids/{rid}/signup", headers=h)
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "你已报名"


def test_self_cancel_removes_placements(client):
    ah = _admin(client)
    h, _ = register_user(client, "sig4", "丁")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    r = client.delete(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert len(detail["signups"]) == 1  # 仅剩团长固定行
    assert all(s["character_id"] is None for s in detail["waves"][0]["slots"])


def test_self_cancel_locked_blocked(client):
    ah = _admin(client)
    h, _ = register_user(client, "sig5", "戊")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.delete(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "攻坚已锁定，无法取消报名"


def test_admin_cancel_other_removes_placements(client):
    ah = _admin(client)
    h, u = register_user(client, "sig6", "己")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid})
    # 锁定后管理员仍可取消
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.delete(f"/api/raids/{rid}/signups/{u['id']}", headers=ah)
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) == 1
    assert all(s["character_id"] is None for s in detail["waves"][0]["slots"])


def test_admin_cancel_not_signed_up_400(client):
    ah = _admin(client)
    h, u = register_user(client, "sig7", "庚")
    rid = make_raid(client, ah)["id"]
    r = client.delete(f"/api/raids/{rid}/signups/{u['id']}", headers=ah)
    assert r.status_code == 400
    assert r.json()["detail"] == "该用户尚未报名"


def test_delete_raid_with_signups(client):
    ah = _admin(client)
    h, _ = register_user(client, "sig8", "辛")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    assert client.delete(f"/api/raids/{rid}", headers=ah).status_code == 200
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -v`
Expected: FAIL —— 端点 404（`/api/raids/{rid}/signup` 不存在），或 detail 无 `signups` 字段。

- [ ] **Step 3: `raids.py` 新增 import 与辅助函数**

修改 `backend/app/routers/raids.py` 顶部 import：

```python
from ..models import Character, Dungeon, Raid, RaidSignup, Slot, User, Wave
from ..schemas import (DutyIn, FillIn, FillResponse, MoveIn, RaidCreate,
                       RaidDetail, RaidListItem, RaidSignupOut, RaidUpdate,
                       SlotMutationResult, SlotOut, UserOut, WaveOut)
```

在 `_detail` 之前新增：

```python
def _participates(db: Session, raid: Raid, user_id: int) -> bool:
    """用户是否参与本场攻坚：团长恒参与，其余须有报名行。"""
    if user_id == raid.created_by:
        return True
    return db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                       RaidSignup.user_id == user_id).first() is not None
```

- [ ] **Step 4: `_detail` 补 `signups` 字段**

将 `raids.py` 的 `_detail` 改为：

```python
def _detail(db: Session, raid: Raid) -> RaidDetail:
    waves = []
    for w in raid.waves:
        waves.append(WaveOut(id=w.id, index=w.index,
                             slots=[_slot_out(s) for s in w.slots]))
    signups = [RaidSignupOut(user=UserOut.model_validate(db.get(User, raid.created_by)),
                             created_at=None)]
    for rs in db.query(RaidSignup).options(selectinload(RaidSignup.user)) \
            .filter(RaidSignup.raid_id == raid.id,
                    RaidSignup.user_id != raid.created_by) \
            .order_by(RaidSignup.created_at).all():
        signups.append(RaidSignupOut(user=UserOut.model_validate(rs.user),
                                     created_at=rs.created_at))
    return RaidDetail(id=raid.id, name=raid.name, dungeon_id=raid.dungeon_id,
                      dungeon_name=raid.dungeon.name, size=raid.size,
                      locked=raid.locked, starts_at=raid.starts_at, waves=waves,
                      signups=signups)
```

- [ ] **Step 5: `list_raids` 补 `signup_count` / `my_signed_up`**

将 `raids.py` 的 `list_raids` 改为（预聚合避免 N+1）：

```python
@router.get("", response_model=list[RaidListItem])
def list_raids(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = dict(db.query(RaidSignup.raid_id,
                           func.count(RaidSignup.id)).group_by(RaidSignup.raid_id).all())
    my_ids = {rs.raid_id for rs in db.query(RaidSignup)
              .filter(RaidSignup.user_id == user.id).all()}
    items = []
    for r in db.query(Raid).options(selectinload(Raid.dungeon)).order_by(Raid.created_at.desc()).all():
        items.append(RaidListItem(id=r.id, name=r.name, dungeon_id=r.dungeon_id,
                                  dungeon_name=r.dungeon.name, size=r.size,
                                  locked=r.locked, starts_at=r.starts_at,
                                  wave_count=len(r.waves),
                                  signup_count=counts.get(r.id, 0),
                                  my_signed_up=(r.created_by == user.id) or r.id in my_ids))
    return items
```

顶部 import 补 `from sqlalchemy import func`（当前 `from sqlalchemy.orm import ...` 处加一行 `from sqlalchemy import func`）。

- [ ] **Step 6: 新增报名/取消端点（文件末尾）**

```python
@router.post("/{rid}/signup")
async def signup(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if user.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if raid.locked:
        raise HTTPException(400, "攻坚已锁定，无法报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first():
        raise HTTPException(400, "你已报名")
    rs = RaidSignup(raid_id=rid, user_id=user.id)
    db.add(rs)
    db.commit()
    db.refresh(rs)
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(user).model_dump(),
                                  "created_at": rs.created_at.isoformat()})
    return {"ok": True}


async def _remove_signup(db: Session, raid: Raid, user_id: int) -> dict:
    """删除报名行 + 撤下该用户全部占位，并广播。"""
    db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                RaidSignup.user_id == user_id).delete()
    removed = db.query(Slot).options(selectinload(Slot.character)) \
        .filter(Slot.wave.has(raid_id=raid.id),
                Slot.character.has(user_id=user_id)).all()
    for s in removed:
        _clear_slot(s)
    db.commit()
    for s in removed:
        await manager.broadcast(raid.id, {"type": "slot:removed", "slot_id": s.id})
    await manager.broadcast(raid.id, {"type": "raid:signup_removed", "user_id": user_id})
    return {"ok": True}


@router.delete("/{rid}/signup")
async def cancel_self(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if raid.locked:
        raise HTTPException(403, "攻坚已锁定，无法取消报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first() is None:
        raise HTTPException(400, "你尚未报名")
    return await _remove_signup(db, raid, user.id)


@router.delete("/{rid}/signups/{user_id}")
async def cancel_other(rid: int, user_id: int, admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user_id).first() is None:
        raise HTTPException(400, "该用户尚未报名")
    return await _remove_signup(db, raid, user_id)
```

注意：`cancel_self` 里 `_remove_signup` 之前先查一次判断是否存在；`cancel_other` 同理会先 400。`_remove_signup` 用 `Slot.wave.has(...)` 过滤波次属于该团。

- [ ] **Step 7: 运行测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -v`
Expected: PASS —— 10 tests passed（Task 1 的 1 个 + 本任务 9 个）。

- [ ] **Step 8: 跑存量测试确认无回归**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raids.py tests/test_public.py tests/test_public_raids.py -q`
Expected: PASS（这些测试尚不占位，未触发 fill_slot 新校验）。

- [ ] **Step 9: Commit**

```bash
git add backend/app/routers/raids.py backend/tests/test_raid_signup.py
git commit -m "feat: 攻坚报名/取消端点 + 列表/详情补字段 + WS 广播"
```

---

### Task 3: `fill_slot` 参与校验 + 既有测试补报名

**Files:**
- Modify: `backend/app/routers/raids.py`（`fill_slot` 加校验）
- Modify: `backend/tests/helpers.py`（新增 `signup` 辅助）
- Modify: `backend/tests/test_raid_signup.py`（新校验用例）
- Modify: `backend/tests/test_raids.py`、`test_admin_adjust.py`、`test_public.py`、`test_public_raids.py`（既有占位前补报名）

- [ ] **Step 1: 写失败测试（fill_slot 参与校验）**

在 `backend/tests/test_raid_signup.py` 追加：

```python
def test_fill_requires_signup_for_regular_user(client):
    ah = _admin(client)
    h, _ = register_user(client, "sigf1", "甲")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 403
    assert r.json()["detail"] == "请先报名再占位"
    # 报名后可占位
    client.post(f"/api/raids/{rid}/signup", headers=h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200


def test_fill_admin_placing_unregistered_user_blocked(client):
    ah = _admin(client)
    h, u = register_user(client, "sigf2", "乙")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                    json={"character_id": cid})
    assert r.status_code == 403
    assert r.json()["detail"] == "该用户未报名，无法排表"
    # 该用户报名后管理员可放
    client.post(f"/api/raids/{rid}/signup", headers=h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": cid}).status_code == 200


def test_fill_creator_always_participates(client):
    ah = _admin(client)
    cid = _mkchar(client, ah, "团长C")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    # 团长（管理员、未报名）可放自己角色
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": cid}).status_code == 200
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -v`
Expected: FAIL —— 未加校验前这些 fill 均返回 200。

- [ ] **Step 3: `fill_slot` 加参与校验**

在 `backend/app/routers/raids.py` 的 `fill_slot` 中，紧跟「只能使用自己的角色」400 检查之后（即 `char = db.get(Character, body.character_id)` 与 `if not user.is_admin and char.user_id != user.id: raise 400` 之后）插入：

```python
    if not _participates(db, raid, char.user_id):
        if user.is_admin:
            raise HTTPException(403, "该用户未报名，无法排表")
        raise HTTPException(403, "请先报名再占位")
```

（位置必须在「只能使用自己的角色」检查之后，否则 `test_cannot_fill_others_characters` 会从期望 400 变成 403。）

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -v`
Expected: PASS —— 新 3 个用例通过。

- [ ] **Step 5: 既有测试补报名（全量会红，逐文件修）**

在 `backend/tests/helpers.py` 追加辅助函数：

```python
def signup(client, rid, headers):
    r = client.post(f"/api/raids/{rid}/signup", headers=headers)
    assert r.status_code == 200
```

然后跑 `cd backend && .venv/bin/python -m pytest -q`，逐个红用例在其 `rid = make_raid(...)` 之后补报名调用。需补报名的位置清单（每个都只涉及「会被 fill 的角色主人」）：

- `test_raids.py`：`test_member_fill_remove_duty`(p2)、`test_character_unique_across_waves`(p5)、`test_one_character_per_player_per_wave`(p10)、`test_fill_replace_moves_conflicting_slot`(p13)、`test_fill_replace_moves_same_character`(p14)、`test_main_healer_limit`(p6 与 p6b 两人)、`test_full_squad_composition_error`(4 个 sq* 全报名)、`test_wave_add_and_delete_rules`(p8)、`test_delete_character_in_use_blocked`(p9)、`test_delete_raid_cascades`(pDel2)、`test_slot_out_includes_owner_avatar`(av1)。
  - 例：`test_member_fill_remove_duty` 中 `rid = make_raid(...)` 之后加一行 `signup(client, rid, h)`。
  - `test_full_squad_composition_error` 里 `rid = make_raid(...)` 之后加 `for h in hs: signup(client, rid, h)`。
  - **不需要改**：`test_cannot_fill_others_characters`（own-char 400 在前）、`test_locked_raid_only_admin_edits`（锁定 403 在前）、`test_create_raid_*`/`test_delete_raid_*`/`test_update_raid_*`（不占位）。
- `test_admin_adjust.py`：`test_admin_can_replace_occupied_slot`(rep1/rep2 两人)、`test_non_admin_cannot_fill_occupied_slot`(rep3 一人，rep4 撞「已占位」400 不需报名)、`test_owner_can_manage_slot_admin_placed`(own1)、`test_non_owner_cannot_manage_others_slot`(own2)、`test_owner_can_delete_wave_with_only_own_chars_admin_placed`(own4)、`test_move_to_empty_slot`(mv1)、`test_swap_two_slots`(mv2/mv3)、`test_move_across_waves`(mv4)、`test_swap_cross_wave_duplicate_player_blocked`(mv5/mv6)、`test_move_bad_inputs`(mv7)、`test_move_main_healer_limit_rollback`(mv8/mv9/mv10)、`test_move_full_squad_composition_rollback`(5 个 fs* 全报名)、`test_move_ws_broadcast`(mvws)、`test_swap_ws_broadcast`(swsws1/swsws2)。
  - `test_admin_characters_endpoint` 不占位，不改。
- `test_public.py`：`test_public_list_and_wave`（p1）。
- `test_public_raids.py`：`test_public_raid_detail`（p1）。

改法统一：`import` 处加 `from .helpers import make_raid, register_user, signup`（或沿用既有 import 列表），然后在对应测试 `rid = make_raid(...)` 之后调用 `signup(client, rid, hX)`。

- [ ] **Step 6: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 130 passed（117 存量 + 13 新增；存量占位用例补报名后不破坏原断言）。

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/raids.py backend/tests/helpers.py backend/tests/test_raid_signup.py backend/tests/test_raids.py backend/tests/test_admin_adjust.py backend/tests/test_public.py backend/tests/test_public_raids.py
git commit -m "feat: fill_slot 校验参与（未报名占位 403）+ 既有测试补报名"
```

---

### Task 4: 前端类型 + store（含单测）

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/stores/raid.ts`
- Modify: `frontend/src/stores/raid.spec.ts`

- [ ] **Step 1: `types.ts` 补类型**

`frontend/src/types.ts`：

```typescript
export interface User { ... }
export interface RaidSignup { user: User; created_at: string | null }
```

`Raid` 加 `signups: RaidSignup[]`；`RaidListItem` 加 `signup_count: number`、`my_signed_up: boolean`。

- [ ] **Step 2: `stores/raid.ts` 补 WS 事件与处理**

`WsEvent` 联合加：

```typescript
  | { type: 'raid:signup'; user: User; created_at: string | null }
  | { type: 'raid:signup_removed'; user_id: number }
```

顶部 import 改 `import type { Raid, RaidSignup, Slot, User } from '../types'`。

`applyEvent` 加分支：

```typescript
    case 'raid:signup':
      raid.signups = raid.signups.filter(s => s.user.id !== ev.user.id)
      raid.signups.push({ user: ev.user, created_at: ev.created_at })
      break
    case 'raid:signup_removed':
      raid.signups = raid.signups.filter(s => s.user.id !== ev.user_id)
      break
```

- [ ] **Step 3: `stores/raid.spec.ts` 更新 fixture 并补用例**

`makeRaid()` 返回值加 `signups: []`。追加：

```typescript
  it('applies raid:signup and raid:signup_removed', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    const u = { id: 9, username: 'b', nickname: '乙', is_admin: false, avatar: null }
    applyEvent(store, { type: 'raid:signup', user: u, created_at: '2026-09-22T10:00:00' })
    expect(store.raid!.signups).toHaveLength(1)
    expect(store.raid!.signups[0].user.id).toBe(9)
    // 同用户重复事件 → 去重
    applyEvent(store, { type: 'raid:signup', user: u, created_at: '2026-09-22T10:01:00' })
    expect(store.raid!.signups).toHaveLength(1)
    applyEvent(store, { type: 'raid:signup_removed', user_id: 9 })
    expect(store.raid!.signups).toHaveLength(0)
  })
```

- [ ] **Step 4: 前端测试**

Run: `cd frontend && npx vitest run src/stores/raid.spec.ts`
Expected: PASS。

说明：`RaidListItem`/`Raid`/`CharacterPickerModal` 的新类型字段会让既有 spec 的 fixture 产生 **TypeScript 类型错误**，但 vitest 用 esbuild 转换不做类型检查，运行时不会失败。这些类型错误会在 Task 5/6 更新 fixture 时消除，并由 Task 6 Step 5 的 `npm run build`（vue-tsc）最终验证。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/stores/raid.ts frontend/src/stores/raid.spec.ts
git commit -m "feat: 前端类型 + store 支持 signups 与 WS 事件"
```

---

### Task 5: 前端攻坚列表页（报名按钮 + 人数）

**Files:**
- Modify: `frontend/src/views/RaidListView.vue`
- Modify: `frontend/src/views/RaidListView.spec.ts`

- [ ] **Step 1: `RaidListView.vue` 加报名按钮与人数**

脚本区加：

```typescript
import { notifySuccess } from '../lib/notify'   // 并入既有 import

async function onSignup(r: RaidListItem) {
  try {
    await api.post(`/api/raids/${r.id}/signup`)
    notifySuccess('报名成功')
    await load()
  } catch (e: any) { notifyError(e.message) }
}
```

模板卡片内（锁定徽标之后）加：

```html
      <span class="raid-meta" style="color:var(--dnf-text-faint)">
        已报名 {{ r.signup_count }} 人
      </span>
      <button v-if="!r.locked && !r.my_signed_up" class="dnf-btn dnf-btn-sm dnf-btn-primary"
              data-test="signup" style="margin-left:auto"
              @click="onSignup(r)">报名</button>
      <span v-else-if="!r.locked && r.my_signed_up" class="dnf-badge dnf-badge-ok"
            style="margin-left:auto">已报名</span>
```

（`margin-left:auto` 与既有删除按钮一致；管理员/团长因 `my_signed_up` 为 true 不显示报名按钮。）

- [ ] **Step 2: `RaidListView.spec.ts` 更新 fixture 并补用例**

fixture `raid` 加 `signup_count: 0, my_signed_up: false`。追加用例：

```typescript
  it('non-admin sees 报名 button and signs up', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      return []
    })
    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    expect(wrapper.text()).toContain('已报名 0 人')
    await wrapper.find('[data-test="signup"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/3/signup')
  })

  it('shows 已报名 badge instead of button when signed up', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null }
    const signed: RaidListItem = { ...raid, my_signed_up: true, signup_count: 3 }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [signed] as RaidListItem[]
      return []
    })
    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    expect(wrapper.text()).toContain('已报名 3 人')
    expect(wrapper.find('[data-test="signup"]').exists()).toBe(false)
  })
```

- [ ] **Step 3: 前端测试**

Run: `cd frontend && npx vitest run src/views/RaidListView.spec.ts`
Expected: PASS（含既有 6 个用例）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/RaidListView.vue frontend/src/views/RaidListView.spec.ts
git commit -m "feat: 攻坚列表页报名按钮与报名人数"
```

---

### Task 6: 前端详情页（已报名面板 / 占位询问 / 取消）+ 选人面板过滤

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`
- Modify: `frontend/src/components/CharacterPickerModal.vue`
- Modify: `frontend/src/components/CharacterPickerModal.spec.ts`

- [ ] **Step 1: `CharacterPickerModal.vue` 加 `signupUserIds` 过滤**

`defineProps` 改为：

```typescript
const props = defineProps<{ open: boolean; adminMode?: boolean; signupUserIds?: number[] }>()
```

`watch` 内管理员分支改为过滤：

```typescript
  if (props.adminMode) {
    const ids = new Set(props.signupUserIds ?? [])
    players.value = (await api.get<PlayerCharacters[]>('/api/admin/characters'))
      .filter(p => ids.has(p.user.id))
    const mine = players.value.find(p => p.user.id === auth.user?.id) ?? players.value[0]
    playerId.value = mine?.user.id ?? null
    characters.value = mine?.characters ?? []
  } else {
```

`onPlayerChange` 前补空态：模板中「还没有角色」提示改成区分——过滤后 `players` 为空时在 `n-select` 上方显示「还没有人报名」：

```html
      <p v-if="adminMode && !players.length" style="color:var(--dnf-text-faint)">还没有人报名</p>
      <n-select v-else-if="adminMode" class="player-select" ...>
```

- [ ] **Step 2: `RaidDetailView.vue` 加已报名面板与占位询问**

脚本区新增：

```typescript
import type { Character, Duty, RaidSignup, Slot } from '../types'
import { confirmDialog, notifyError, notifySuccess, notifyWarning } from '../lib/notify'

const mySignedUp = computed(() =>
  store.raid?.signups.some(s => s.user.id === auth.user?.id) ?? false)

async function onSignup() {
  if (!store.raid) return
  try { await api.post(`/api/raids/${store.raid.id}/signup`); notifySuccess('报名成功'); await load() }
  catch (e: any) { notifyError(e.message) }
}
async function onCancelSelf() {
  if (!store.raid) return
  try { await api.del(`/api/raids/${store.raid.id}/signup`); notifySuccess('已取消报名'); await load() }
  catch (e: any) { notifyError(e.message) }
}
async function onCancelUser(s: RaidSignup) {
  if (!store.raid) return
  const ok = await confirmDialog({ content: `确认取消「${s.user.nickname}」的报名？将撤下其已占位的角色` })
  if (!ok) return
  try { await api.del(`/api/raids/${store.raid.id}/signups/${s.user.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
async function onPick(slot: Slot) {
  if (!auth.isAdmin && !mySignedUp.value && !store.raid?.locked) {
    const ok = await confirmDialog({ content: '你还没有报名本次攻坚，是否先报名？' })
    if (!ok) return
    try { await api.post(`/api/raids/${rid}/signup`); await load() }
    catch (e: any) { notifyError(e.message); return }
  }
  pickSlot.value = slot
}
```

`onSelectCharacter` 里传 `signupUserIds` 给弹窗（模板）：

```html
    <CharacterPickerModal :open="pickSlot != null" :admin-mode="auth.isAdmin"
                          :signup-user-ids="signupUserIds"
                          @close="pickSlot = null" @select="onSelectCharacter" />
```

脚本：

```typescript
const signupUserIds = computed(() => store.raid?.signups.map(s => s.user.id) ?? [])
```

模板「已报名」面板（放在 page-head 之后、WaveSection 之前）：

```html
    <div class="dnf-panel" style="margin:10px 0">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <b>已报名</b>
        <span style="color:var(--dnf-text-faint)">{{ store.raid.signups.length }} 人（含团长）</span>
        <button v-if="!store.raid.locked && !mySignedUp" class="dnf-btn dnf-btn-sm dnf-btn-primary"
                style="margin-left:auto" @click="onSignup">报名</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        <div v-for="s in store.raid.signups" :key="s.user.id"
             style="display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--dnf-border);border-radius:4px">
          <UserAvatar :nickname="s.user.nickname" :avatar="s.user.avatar" :size="24" />
          <span>{{ s.user.nickname }}</span>
          <span v-if="s.created_at === null" class="dnf-badge dnf-badge-ok">团长</span>
          <button v-if="auth.isAdmin && s.created_at !== null" class="dnf-btn dnf-btn-sm"
                  @click="onCancelUser(s)">取消报名</button>
          <button v-else-if="s.user.id === auth.user?.id && !store.raid.locked"
                  class="dnf-btn dnf-btn-sm" @click="onCancelSelf">取消报名</button>
        </div>
      </div>
    </div>
```

模板顶部 import `UserAvatar`：`import UserAvatar from '../components/UserAvatar.vue'`。`computed` 已由既有代码导入。

- [ ] **Step 3: `CharacterPickerModal.spec.ts` 更新既有用例 + 补过滤用例**

既有两个管理员用例的 mount 补 `signupUserIds: [1, 9]`（`admin` 是 id 9、`小红` 是 id 1，都在内），保持原断言成立：

```typescript
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9] },
      global: { stubs: { teleport: true } },
    })
```

追加过滤用例：

```typescript
  it('filters out players not in signupUserIds', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [9] },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    // 只有团长（id 9）在列；小红（id 1）被过滤
    expect(wrapper.text()).toContain('奶')
    expect(wrapper.text()).not.toContain('剑魂')
  })
```

- [ ] **Step 4: 前端测试**

Run: `cd frontend && npx vitest run src/components/CharacterPickerModal.spec.ts src/views/RaidListView.spec.ts src/stores/raid.spec.ts`
Expected: PASS。

- [ ] **Step 5: 前端构建类型检查**

Run: `cd frontend && npm run build`
Expected: PASS（vue-tsc 无类型错误）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/RaidDetailView.vue frontend/src/components/CharacterPickerModal.vue frontend/src/components/CharacterPickerModal.spec.ts
git commit -m "feat: 详情页已报名面板/占位询问/取消 + 选人面板按报名过滤"
```

---

### Task 7: 文档与变更日志

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`（如必要）

- [ ] **Step 1: `CHANGELOG.md` [Unreleased] 新增条目**

在 `[Unreleased]` → `### 新增` 下追加：

```markdown
- **攻坚报名**：列表可报名/取消报名；团长（发起人）默认参加；管理员排表仅可选已报名用户的角色；详情页展示已报名名单并支持取消（自动撤下占位）；未报名用户占位时引导先报名
```

- [ ] **Step 2: 根 `README.md`（可选）**

若 README 有「功能清单」，补一句报名说明；机器人 API 表不变。

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: 攻坚报名的接口/自测/CHANGELOG"
```

---

### Task 8: 全量验证

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 130 passed，无失败。

- [ ] **Step 2: 前端全量测试**

Run: `cd frontend && npx vitest run`
Expected: 全绿（存量 + 新增）。

- [ ] **Step 3: 前端构建**

Run: `cd frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 4: 复核变更清单**

Run: `git status --short`
Expected: 工作区干净；`git log --oneline -8` 显示本特性 8 个提交（Task 1–7 各 1 + 可能的收尾）。
