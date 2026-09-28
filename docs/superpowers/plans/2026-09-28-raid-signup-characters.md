# 攻坚报名·角色勾选 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把攻坚「报名」从用户级升级为角色级——报名时勾选愿意上场的角色，团长只能排成员勾选过的角色，成员可随时追加/取消勾选（取消撤销占位），机器人/管理员代报名默认全部角色。

**Architecture:** 新增关联表 `raid_signup_characters`（signup_id + character_id 唯一，`create_all` 自动建表），`raid_signups` 仍是参与主行。共享助手 `_signup_user`（建报名行+勾选角色，signup/admin_signup/bot_signup 复用）与 `_selected_ids`/`_signup_characters` 放 `routers/raids.py`。新增追加/取消勾选端点；`fill_slot` 加角色级校验；`_remove_signup` 由批量删除改为 ORM 删除（关键缺陷：批量删除不触发关系级联，SQLite FK 会 500）。前端 `SignupModal`（报名选角色/管理勾选复用）+ 详情页报名面板角色芯片 + 选人面板按勾选过滤。

**Tech Stack:** FastAPI / SQLAlchemy 2 / SQLite / Pydantic v2 / Vue 3 `<script setup>` / naive-ui / Vitest / vue-tsc

**前提（已定稿）：** 设计规格 `docs/superpowers/specs/2026-09-28-raid-signup-characters-design.md`。用户确认：报名/追加/取消均可；网页默认全选、机器人/管理员代报名默认全部角色；至少保留 1 个角色；团长不受勾选约束；锁定后成员改角色 403；取消勾选撤占位。

**提交到 main，不做 worktree（仓库既定约定）。** 提交信息用 `[feat]/[fix]/[ref]/[test]/[docs]` + 中文，`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。

**测试命令：**
- 后端：`cd backend && .venv/bin/python -m pytest <file> -v`
- 前端单测：`cd frontend && npx vitest run <file>`
- 前端类型/构建：`cd frontend && npm run build`（= vue-tsc -b && vite build）

---

## 文件结构

**后端修改：**
- `backend/app/models.py` —— 新增 `RaidSignupCharacter`；`RaidSignup` 补 `characters` 关系（`cascade="all, delete-orphan"`）
- `backend/app/schemas.py` —— 新增 `SignupCharacterOut`/`SignupIn`；`RaidSignupOut` 加 `characters`；`BotSignupIn` 加 `character_ids`
- `backend/app/routers/raids.py` —— `_signup_user`/`_selected_ids`/`_signup_characters`/`_signup_out` 助手；signup 收 body；新增追加/取消勾选端点；`fill_slot` 角色级校验；`_detail`/`get_member_characters` 过滤；`_remove_signup` 批量删除改 ORM 删除
- `backend/app/routers/bot.py` —— `bot_signup` 用 `_signup_user`
- `backend/app/services/characters.py` —— `delete_character_if_free` 清理勾选子行 + 清空报名
- `backend/tests/test_raid_signup_characters.py`（新增）
- `backend/tests/test_raid_signup.py`、`backend/tests/test_bot_raid_signup.py`、`backend/tests/test_public.py`、`backend/tests/test_public_raids.py` —— 既有用例适配

**前端修改：**
- `frontend/src/types.ts` —— `SignupCharacter` / `RaidSignup.characters`
- `frontend/src/stores/raid.ts` —— WS 事件 `raid:signup` 带 characters + 新增 `raid:signup_chars_changed`
- `frontend/src/components/SignupModal.vue`（新增）+ `SignupModal.spec.ts`
- `frontend/src/views/RaidDetailView.vue` —— 报名弹窗 / 面板角色芯片 / 追加取消 / 传 `signupCharsByUser`
- `frontend/src/components/CharacterPickerModal.vue` —— `signupCharsByUser` 过滤
- `frontend/src/views/RaidDetailView.spec.ts`、`frontend/src/stores/raid.spec.ts`、`frontend/src/components/CharacterPickerModal.spec.ts` —— fixture 与新增用例
- `CHANGELOG.md`

---

### Task 1: 数据模型 RaidSignupCharacter

**Files:**
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_smoke.py`

- [ ] **Step 1: 追加模型**

在 `models.py` 中 `RaidSignup` 类之后（`Vote` 之前）插入：

```python
class RaidSignupCharacter(Base):
    __tablename__ = "raid_signup_characters"
    __table_args__ = (UniqueConstraint("signup_id", "character_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    signup_id: Mapped[int] = mapped_column(ForeignKey("raid_signups.id"), index=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    signup: Mapped["RaidSignup"] = relationship(back_populates="characters")
    character: Mapped["Character"] = relationship()
```

并在 `RaidSignup` 类内补反向关系（紧接 `user` 关系之后）：

```python
    characters: Mapped[list["RaidSignupCharacter"]] = relationship(
        back_populates="signup", cascade="all, delete-orphan")
```

- [ ] **Step 2: 验证建表**

Run: `cd backend && .venv/bin/python -m pytest tests/test_smoke.py -v`
Expected: PASS（db fixture 的 `create_all` 自动建新表，smoke 不受影响）

- [ ] **Step 3: 提交**

```bash
git add backend/app/models.py
git commit -m "feat: RaidSignupCharacter 模型（报名勾选角色，signup+character 唯一）"
```

---

### Task 2: schemas 新增类型

**Files:**
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/test_smoke.py`

- [ ] **Step 1: 改 schema**

`schemas.py` 中 `RaidSignupOut`（第 89 行附近）改为：

```python
class SignupCharacterOut(BaseModel):
    id: int
    name: str
    job_title: str
    class_type: str

class RaidSignupOut(BaseModel):
    user: UserOut
    created_at: datetime | None  # 团长固定行（无真实报名记录）为 None
    characters: list[SignupCharacterOut] = []  # 团长固定行为空列表
```

`SignupUserIn` 之后新增：

```python
class SignupIn(BaseModel):
    character_ids: list[int] | None = None  # None=默认全部角色
```

`BotSignupIn` 内加字段：

```python
class BotSignupIn(BaseModel):
    account: str | None = Field(default=None, min_length=1, max_length=64)
    nickname: str | None = Field(default=None, min_length=1, max_length=64)
    character_ids: list[int] | None = None  # None=默认全部角色
```

- [ ] **Step 2: 回归验证**

Run: `cd backend && .venv/bin/python -m pytest tests/test_smoke.py tests/test_auth.py -v`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add backend/app/schemas.py
git commit -m "feat: schema 增加报名勾选类型（SignupCharacterOut/SignupIn/BotSignupIn.character_ids）"
```

---

### Task 3: raids.py 共享助手 + _detail + _remove_signup 缺陷修复

**Files:**
- Modify: `backend/app/routers/raids.py`
- Test: 与后续端点任务一起验证

- [ ] **Step 1: 改导入**

`raids.py` 的 models 导入加 `RaidSignupCharacter`：
```python
from ..models import Character, Dungeon, Raid, RaidSignup, RaidSignupCharacter, Slot, User, Wave
```
schemas 导入加 `SignupCharacterOut, SignupIn`：
```python
from ..schemas import (DutyIn, FillIn, FillResponse, MoveIn, PlayerCharacters,
                       RaidCreate, RaidDetail, RaidListItem, RaidSignupOut,
                       RaidUpdate, SignupCharacterOut, SignupIn, SignupUserIn,
                       SlotMutationResult, SlotOut, UserOut, WaveOut)
```

- [ ] **Step 2: 加共享助手**

在 `_participates`（第 61 行）之后新增：

```python
def _signup_char_out(c: Character) -> SignupCharacterOut:
    meta = job_data.job_meta(c.job_name) or {}
    return SignupCharacterOut(id=c.id, name=c.name,
                              job_title=meta.get("title", ""),
                              class_type=c.class_type)


def _signup_characters(rs: RaidSignup) -> list[SignupCharacterOut]:
    """报名行勾选的角色（SignupCharacterOut 列表，保持插入顺序）。"""
    return [_signup_char_out(rsc.character) for rsc in rs.characters]


def _signup_out(rs: RaidSignup) -> RaidSignupOut:
    return RaidSignupOut(user=UserOut.model_validate(rs.user),
                         created_at=rs.created_at,
                         characters=_signup_characters(rs))


def _selected_ids(db: Session, raid: Raid, user_id: int) -> set[int]:
    """某用户在本场报名中勾选的角色 id 集合。"""
    rs = db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                     RaidSignup.user_id == user_id).first()
    return {rsc.character_id for rsc in rs.characters} if rs else set()


def _signup_user(db: Session, raid: Raid, user: User,
                 character_ids: list[int] | None = None) -> RaidSignup:
    """建报名行 + 勾选角色（signup / admin_signup / bot_signup 复用）。
    character_ids=None → 该用户全部角色；显式空列表 → 400。"""
    if character_ids is None:
        character_ids = [c.id for c in db.scalars(
            select(Character).where(Character.user_id == user.id)).all()]
    else:
        character_ids = list(dict.fromkeys(character_ids))  # 去重，防唯一约束 500
    if not character_ids:
        raise HTTPException(400, "至少选择一个角色")
    owned = set(db.scalars(select(Character.id).where(
        Character.user_id == user.id)).all())
    if not set(character_ids).issubset(owned):
        raise HTTPException(400, "只能勾选自己的角色")
    rs = RaidSignup(raid_id=raid.id, user_id=user.id)
    rs.characters = [RaidSignupCharacter(character_id=cid) for cid in character_ids]
    db.add(rs)
    return rs
```

- [ ] **Step 3: `_detail` 填充 characters**

`_detail`（第 68 行）中把报名行构建改为 `_signup_out`：

```python
    signups = [RaidSignupOut(user=UserOut.model_validate(db.get(User, raid.created_by)),
                             created_at=None)]
    for rs in db.query(RaidSignup).options(selectinload(RaidSignup.user)) \
            .filter(RaidSignup.raid_id == raid.id,
                    RaidSignup.user_id != raid.created_by) \
            .order_by(RaidSignup.created_at).all():
        signups.append(_signup_out(rs))
```

- [ ] **Step 4: `_remove_signup` 批量删除改 ORM 删除（关键缺陷修复）**

现实现（第 443-456 行）用 `db.query(RaidSignup).filter(...).delete()`——**批量删除不触发 ORM 关系级联**，而 SQLite 已启用 `PRAGMA foreign_keys=ON` 且 FK 无 `ondelete`，删父行会因 `raid_signup_characters` 残留触发外键 `IntegrityError → 500`。改为加载对象后 `db.delete(rs)`（ORM 级联清子行）：

```python
async def _remove_signup(db: Session, raid: Raid, user_id: int) -> dict:
    """删除报名行（ORM 级联清 raid_signup_characters）+ 撤下该用户全部占位，并广播。"""
    rs = db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                     RaidSignup.user_id == user_id).first()
    if rs is not None:
        db.delete(rs)  # ORM 级联清 raid_signup_characters 子行
    removed = db.query(Slot) \
        .filter(Slot.wave.has(raid_id=raid.id),
                Slot.character.has(user_id=user_id)).all()
    for s in removed:
        _clear_slot(s)
    db.commit()
    for s in removed:
        await manager.broadcast(raid.id, {"type": "slot:removed", "slot_id": s.id})
    await manager.broadcast(raid.id, {"type": "raid:signup_removed", "user_id": user_id})
    return {"ok": True}
```

- [ ] **Step 5: 验证编译**

Run: `cd backend && .venv/bin/python -c "import app.main" && .venv/bin/python -m pytest tests/test_smoke.py -v`
Expected: PASS（暂无新端点测试，仅确认模块可导入、既有 smoke 通过）

- [ ] **Step 6: 提交**

```bash
git add backend/app/routers/raids.py
git commit -m "fix: 报名共享助手 + _remove_signup 改 ORM 删除（批量删除不触发级联致 FK 500）"
```

---

### Task 4: signup / admin_signup / bot_signup 改用 _signup_user

**Files:**
- Modify: `backend/app/routers/raids.py`
- Modify: `backend/app/routers/bot.py`
- Test: 与 Task 8 一起验证

- [ ] **Step 1: raids.py 的 signup 端点**

`signup`（第 417 行）改为（`body: SignupIn | None = None` 保证无 body 向后兼容）：

```python
@router.post("/{rid}/signup")
async def signup(rid: int, body: SignupIn | None = None,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if user.is_banned:
        raise HTTPException(403, "你已被封禁，无法报名")
    if user.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if raid.locked:
        raise HTTPException(400, "攻坚已锁定，无法报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first():
        raise HTTPException(400, "你已报名")
    rs = _signup_user(db, raid, user, body.character_ids if body else None)
    try:
        db.commit()
    except IntegrityError:  # 并发重复报名兜底
        db.rollback()
        raise HTTPException(400, "你已报名")
    db.refresh(rs)
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(user).model_dump(),
                                  "created_at": rs.created_at.isoformat(),
                                  "characters": [c.model_dump() for c in _signup_characters(rs)]})
    return {"ok": True}
```

- [ ] **Step 2: raids.py 的 admin_signup 端点**

`admin_signup`（第 480 行）中，把「建 `RaidSignup` + 手动加子行」替换为 `_signup_user`（其余校验、广播、并发兜底不变）：

```python
    rs = _signup_user(db, raid, target, None)  # 代报名默认全部角色
    try:
        db.commit()
    except IntegrityError:  # 并发重复报名兜底
        db.rollback()
        raise HTTPException(400, "该用户已报名")
    db.refresh(rs)
    # 广播的是「目标用户」而非管理员
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(target).model_dump(),
                                  "created_at": rs.created_at.isoformat(),
                                  "characters": [c.model_dump() for c in _signup_characters(rs)]})
    return {"ok": True}
```

- [ ] **Step 3: bot.py 的 bot_signup 端点**

`bot.py` 导入 `_raid_or_404, _remove_signup` 处改为追加 `_signup_user`：

```python
from ..routers.raids import _raid_or_404, _remove_signup, _signup_user
```

`bot_signup`（第 120 行）中，把「建 `RaidSignup`」替换为 `_signup_user`：

```python
    rs = _signup_user(db, raid, user, body.character_ids)
    try:
        db.commit()
    except IntegrityError:  # 并发重复报名兜底
        db.rollback()
        raise HTTPException(400, "该用户已报名")
    db.refresh(rs)
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(user).model_dump(),
                                  "created_at": rs.created_at.isoformat(),
                                  "characters": [c.model_dump() for c in _signup_characters(rs)]})
    return {"ok": True,
            "user": UserOut.model_validate(user).model_dump(),
            "raid": {"id": raid.id, "name": raid.name,
                     "starts_at": raid.starts_at.isoformat()}}
```

> 说明：`bot.py` 的广播需要 `_signup_characters`，从 `raids.py` 一并导入：`from ..routers.raids import _raid_or_404, _remove_signup, _signup_characters, _signup_user`。

- [ ] **Step 4: 提交**

```bash
git add backend/app/routers/raids.py backend/app/routers/bot.py
git commit -m "feat: 报名/管理员代报名/机器人报名统一走 _signup_user（默认全部角色）"
```

---

### Task 5: 新增追加/取消勾选端点

**Files:**
- Modify: `backend/app/routers/raids.py`
- Test: 与 Task 8 一起验证

- [ ] **Step 1: 加私有助手 `_own_signup`**

在 `_remove_signup` 之前新增：

```python
def _own_signup(db: Session, raid: Raid, user: User) -> RaidSignup:
    rs = db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                     RaidSignup.user_id == user.id).first()
    if rs is None:
        raise HTTPException(400, "你尚未报名")
    return rs
```

- [ ] **Step 2: 追加勾选端点**

在 `signup` 端点之后新增：

```python
@router.post("/{rid}/signup/characters/{cid}")
async def add_signup_character(rid: int, cid: int,
                               user: User = Depends(get_current_user),
                               db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if user.is_banned:
        raise HTTPException(403, "你已被封禁，无法报名")
    if user.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if raid.locked:
        raise HTTPException(403, "攻坚已锁定，无法修改报名")
    rs = _own_signup(db, raid, user)
    char = db.get(Character, cid)
    if char is None or char.user_id != user.id:
        raise HTTPException(400, "只能勾选自己的角色")
    if any(rsc.character_id == cid for rsc in rs.characters):
        raise HTTPException(400, "该角色已在报名中")
    rs.characters.append(RaidSignupCharacter(character_id=cid))
    db.commit()
    await manager.broadcast(rid, {"type": "raid:signup_chars_changed",
                                  "user_id": user.id,
                                  "characters": [c.model_dump() for c in _signup_characters(rs)]})
    return {"ok": True}
```

- [ ] **Step 3: 取消勾选端点**

紧接其后新增：

```python
@router.delete("/{rid}/signup/characters/{cid}")
async def remove_signup_character(rid: int, cid: int,
                                  user: User = Depends(get_current_user),
                                  db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if user.is_banned:
        raise HTTPException(403, "你已被封禁，无法报名")
    if user.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if raid.locked:
        raise HTTPException(403, "攻坚已锁定，无法修改报名")
    rs = _own_signup(db, raid, user)
    target = next((rsc for rsc in rs.characters if rsc.character_id == cid), None)
    if target is None:
        raise HTTPException(400, "该角色不在报名中")
    if len(rs.characters) <= 1:
        raise HTTPException(400, "至少保留一个角色")
    # 撤销该角色在本场全部波次的占位
    removed = db.query(Slot).filter(Slot.wave.has(raid_id=raid.id),
                                    Slot.character_id == cid).all()
    for s in removed:
        _clear_slot(s)
    db.delete(target)
    db.commit()
    for s in removed:
        await manager.broadcast(rid, {"type": "slot:removed", "slot_id": s.id})
    await manager.broadcast(rid, {"type": "raid:signup_chars_changed",
                                  "user_id": user.id,
                                  "characters": [c.model_dump() for c in _signup_characters(rs)]})
    return {"ok": True}
```

> 说明：`db.delete(target)` 后 `db.commit()`，`rs.characters` 会在下次访问时自动过期重载，`_signup_characters(rs)` 读到的是删除后的集合。

- [ ] **Step 4: 提交**

```bash
git add backend/app/routers/raids.py
git commit -m "feat: 追加/取消勾选报名角色端点（取消撤占位，锁定 403，至少保留一个）"
```

---

### Task 6: fill_slot 角色级校验 + get_member_characters 过滤

**Files:**
- Modify: `backend/app/routers/raids.py`
- Test: 与 Task 8 一起验证

- [ ] **Step 1: fill_slot 加角色级校验**

`fill_slot`（第 235 行）中，在既有 `_participates` 校验块之后立即插入：

```python
    if not _participates(db, raid, char.user_id):
        if user.is_admin:
            raise HTTPException(403, "该用户未报名，无法排表")
        raise HTTPException(403, "请先报名再占位")
    # 团长自己的角色不受勾选约束；其余须已勾选该角色
    if char.user_id != raid.created_by and char.id not in _selected_ids(db, raid, char.user_id):
        if user.is_admin:
            raise HTTPException(403, "该角色未报名，无法排表")
        raise HTTPException(403, "请先勾选该角色再占位")
```

- [ ] **Step 2: get_member_characters 过滤**

`get_member_characters`（第 511 行）改为按是否团长返回不同角色集：

```python
@router.get("/{rid}/signups/{user_id}/characters", response_model=PlayerCharacters)
def get_member_characters(rid: int, user_id: int, user: User = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "用户不存在")
    if not _participates(db, raid, user_id):
        raise HTTPException(404, "该用户未参与本场攻坚")
    if user_id == raid.created_by:
        # 团长不受勾选约束：返回全部角色
        chars = db.scalars(select(Character).where(Character.user_id == user_id)
                           .order_by(Character.id)).all()
    else:
        rs = db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                         RaidSignup.user_id == user_id).first()
        chars = [rsc.character for rsc in rs.characters]
    return PlayerCharacters(user=UserOut.model_validate(target),
                            characters=[character_out(c) for c in chars])
```

- [ ] **Step 3: 提交**

```bash
git add backend/app/routers/raids.py
git commit -m "feat: fill_slot 角色级校验（未勾选 403）+ 成员角色列表按勾选过滤"
```

---

### Task 7: delete_character_if_free 清理勾选子行

**Files:**
- Modify: `backend/app/services/characters.py`
- Test: 与 Task 8 一起验证

- [ ] **Step 1: 改 services/characters.py**

`from ..models import Character, Slot` 改为：

```python
from ..models import Character, RaidSignupCharacter, Slot
```

`delete_character_if_free`（第 33 行）追加清理逻辑：

```python
def delete_character_if_free(db: Session, cid: int) -> None:
    in_use = db.query(Slot).filter(Slot.character_id == cid).first()
    if in_use:
        raise HTTPException(400, "该角色正在攻坚中，请先撤下")
    # 角色在报名勾选中 → 一并移除子行；若该报名因此清空 → 整条取消报名
    for rsc in db.query(RaidSignupCharacter).filter(
            RaidSignupCharacter.character_id == cid).all():
        signup = rsc.signup
        db.delete(rsc)
        remaining = db.query(RaidSignupCharacter).filter(
            RaidSignupCharacter.signup_id == signup.id,
            RaidSignupCharacter.character_id != cid).count()
        if remaining == 0:
            db.delete(signup)  # 角色已 free（无占位），无需撤占位；此路径不广播
```

> 说明：被删角色已通过 `in_use` 检查确认无占位，故清空报名时无需撤占位。此服务被 `members.py` 与 `admin.py` 共用，两处删除行为一致。

- [ ] **Step 2: 提交**

```bash
git add backend/app/services/characters.py
git commit -m "feat: 删除角色时清理报名勾选子行，勾选清空的报名整条取消"
```

---

### Task 8: 新增后端测试 test_raid_signup_characters.py

**Files:**
- Create: `backend/tests/test_raid_signup_characters.py`

- [ ] **Step 1: 写测试**

创建 `backend/tests/test_raid_signup_characters.py`：

```python
from .helpers import make_raid, register_user


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _mkchar(client, h, name="C", job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]


def _signup(client, rid, h, char_ids=None):
    body = {} if char_ids is None else {"character_ids": char_ids}
    return client.post(f"/api/raids/{rid}/signup", headers=h, json=body)


def _char_ids_of(client, rid, uid, h):
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    row = next(s for s in detail["signups"] if s["user"]["id"] == uid)
    return [c["id"] for c in row["characters"]]


def test_signup_defaults_to_all_characters(client):
    ah = _admin(client)
    h, u = register_user(client, "sc1", "甲")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    assert _signup(client, rid, h).status_code == 200
    assert sorted(_char_ids_of(client, rid, u["id"], h)) == sorted([c1, c2])


def test_signup_with_specific_characters(client):
    ah = _admin(client)
    h, u = register_user(client, "sc2", "乙")
    c1 = _mkchar(client, h, "C1")
    _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    assert _signup(client, rid, h, [c1]).status_code == 200
    assert _char_ids_of(client, rid, u["id"], h) == [c1]


def test_signup_rejects_others_characters(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc3", "丙")
    h2, _ = register_user(client, "sc3b", "丁")
    c_other = _mkchar(client, h2)
    rid = make_raid(client, ah)["id"]
    r = _signup(client, rid, h, [c_other])
    assert r.status_code == 400
    assert r.json()["detail"] == "只能勾选自己的角色"


def test_signup_empty_characters_rejected(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc4", "戊")
    _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    r = _signup(client, rid, h, [])
    assert r.status_code == 400
    assert r.json()["detail"] == "至少选择一个角色"


def test_signup_no_characters_rejected(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc5", "己")
    rid = make_raid(client, ah)["id"]
    r = _signup(client, rid, h)
    assert r.status_code == 400
    assert r.json()["detail"] == "至少选择一个角色"


def test_add_signup_character(client):
    ah = _admin(client)
    h, u = register_user(client, "sc6", "庚")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    assert client.post(f"/api/raids/{rid}/signup/characters/{c2}", headers=h).status_code == 200
    assert sorted(_char_ids_of(client, rid, u["id"], h)) == sorted([c1, c2])


def test_add_signup_character_duplicate(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc7", "辛")
    c1 = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    r = client.post(f"/api/raids/{rid}/signup/characters/{c1}", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "该角色已在报名中"


def test_add_signup_character_locked(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc8", "壬")
    c1 = _mkchar(client, h)
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.post(f"/api/raids/{rid}/signup/characters/{c2}", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "攻坚已锁定，无法修改报名"


def test_remove_signup_character_revokes_slot(client):
    ah = _admin(client)
    h, u = register_user(client, "sc9", "癸")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": c1})
    r = client.delete(f"/api/raids/{rid}/signup/characters/{c1}", headers=h)
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert all(s["character_id"] is None for s in detail["waves"][0]["slots"])
    assert _char_ids_of(client, rid, u["id"], h) == [c2]


def test_remove_last_character_rejected(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc10", "子")
    c1 = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    r = client.delete(f"/api/raids/{rid}/signup/characters/{c1}", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "至少保留一个角色"


def test_remove_not_selected_rejected(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc11", "丑")
    c1 = _mkchar(client, h)
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    r = client.delete(f"/api/raids/{rid}/signup/characters/{c2}", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "该角色不在报名中"


def test_fill_requires_selected_character_for_member(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc12", "寅")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                    json={"character_id": c2})
    assert r.status_code == 403
    assert r.json()["detail"] == "请先勾选该角色再占位"
    client.post(f"/api/raids/{rid}/signup/characters/{c2}", headers=h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": c2}).status_code == 200


def test_fill_admin_unselected_character_blocked(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc13", "卯")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                    json={"character_id": c2})
    assert r.status_code == 403
    assert r.json()["detail"] == "该角色未报名，无法排表"


def test_fill_leader_own_char_unrestricted(client):
    ah = _admin(client)
    c1 = _mkchar(client, ah, "团长C")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200


def test_member_characters_only_selected(client):
    ah = _admin(client)
    h, u = register_user(client, "sc14", "辰")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    r = client.get(f"/api/raids/{rid}/signups/{u['id']}/characters", headers=h)
    assert r.status_code == 200
    assert [c["id"] for c in r.json()["characters"]] == [c1]


def test_cancel_signup_clears_characters(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc15", "巳")
    c1 = _mkchar(client, h)
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    assert client.delete(f"/api/raids/{rid}/signup", headers=h).status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) == 1  # 仅剩团长固定行，无 500（验证 _remove_signup 改造）


def test_admin_signup_defaults_all(client):
    ah = _admin(client)
    h, u = register_user(client, "sc16", "午")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/signups", headers=ah,
                       json={"user_id": u["id"]}).status_code == 200
    assert sorted(_char_ids_of(client, rid, u["id"], ah)) == sorted([c1, c2])


def test_admin_signup_no_character_target_rejected(client):
    ah = _admin(client)
    h, u = register_user(client, "sc17", "未")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signups", headers=ah, json={"user_id": u["id"]})
    assert r.status_code == 400
    assert r.json()["detail"] == "至少选择一个角色"


def test_bot_signup_defaults_all(client):
    ah = _admin(client)
    h, u = register_user(client, "sc18", "申")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    bot = {"Authorization": "Bearer change-me-bot-token"}
    assert client.post(f"/api/public/raids/{rid}/signup", headers=bot,
                       json={"account": "sc18"}).status_code == 200
    assert sorted(_char_ids_of(client, rid, u["id"], ah)) == sorted([c1, c2])


def test_delete_character_clears_signup_rows(client):
    ah = _admin(client)
    h, u = register_user(client, "sc19", "酉")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    assert client.delete(f"/api/me/characters/{c1}", headers=h).status_code == 200
    assert _char_ids_of(client, rid, u["id"], h) == [c2]


def test_delete_character_empties_signup_cancels(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc20", "戌")
    c1 = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    assert client.delete(f"/api/me/characters/{c1}", headers=h).status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) == 1  # 报名因角色清空被整条取消


def test_remove_signup_character_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h, _ = register_user(client, "scws1", "亥")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": c1})
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert client.delete(f"/api/raids/{rid}/signup/characters/{c1}",
                             headers=h).status_code == 200
        types = [ws.receive_json()["type"] for _ in range(2)]
        assert types == ["slot:removed", "raid:signup_chars_changed"]


def test_signup_ws_broadcast_includes_characters(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h, _ = register_user(client, "scws2", "天")
    c1 = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert _signup(client, rid, h).status_code == 200
        ev = ws.receive_json()
        assert ev["type"] == "raid:signup"
        assert [c["id"] for c in ev["characters"]] == [c1]
```

- [ ] **Step 2: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup_characters.py -v`
Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add backend/tests/test_raid_signup_characters.py
git commit -m "test: 报名角色勾选后端测试（默认全部/指定/追加取消/撤占位/fill 校验/删除角色/WS）"
```

---

### Task 9: 既有后端测试适配（≥1 角色规则波及）

**Files:**
- Modify: `backend/tests/test_raid_signup.py`
- Modify: `backend/tests/test_bot_raid_signup.py`
- Modify: `backend/tests/test_public.py`
- Modify: `backend/tests/test_public_raids.py`
- Test: 逐个文件

- [ ] **Step 1: test_raid_signup.py（硬破坏补 `_mkchar`）**

`_mkchar` 已存在于此文件。为下列用例的**报名用户**在建角色前补 `_mkchar`：

- `test_signup_success_and_detail`：`sig1` 报名前 `cid = _mkchar(client, h)`。
- `test_signup_duplicate_blocked`：`sig3` 报名前 `_mkchar(client, h)`。
- `test_signup_ws_broadcast`：`sigws1` 报名前 `_mkchar(client, h)`。
- `test_admin_signup_for_other`：`sig9` 被代报名前 `_mkchar(client, h)`。
- `test_admin_signup_other_duplicate_blocked`：`sig11` 首次报名前 `_mkchar(client, h)`。
- `test_admin_signup_ws_broadcast_target_user`：`sigws3` 被代报名前 `_mkchar(client, h)`。

（b）类 setup 意义损失补角色：`test_self_cancel_locked_blocked`（`sig5` 报名前 `_mkchar`）、`test_member_characters_cross_user_visible`（第二个报名用户 `mch5` 前 `_mkchar`）、`test_delete_raid_with_signups`（`sig8` 前 `_mkchar`）、`test_member_characters_user_not_found`（`mch7` 前 `_mkchar`）。

`test_member_characters_empty_roster` 改为验证「无角色用户报名 → 400」：

```python
def test_signup_no_characters_rejected(client):
    ah = _admin(client)
    h, u = register_user(client, "mch6", "己")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "至少选择一个角色"
```

（删除原空名单用例，或按上改写覆盖同一目标。）

- [ ] **Step 2: test_bot_raid_signup.py（硬破坏补 `_mkchar`）**

`_mkchar` 已存在于此文件。为下列用例补角色：

- `test_bot_signup_by_account`：`sig1` 前 `_mkchar(client, h)`。
- `test_bot_signup_by_nickname`：`sig2` 前 `_mkchar(client, h)`。
- `test_bot_signup_duplicate`：`sig3` 首次报名前 `_mkchar(client, h)`。
- `test_bot_signup_ws_broadcast`：`sigws1` 前 `_mkchar(client, h)`。
- `test_bot_cancel_locked_blocked`（b 类）：`sig7` 报名前 `_mkchar(client, h)`。

- [ ] **Step 3: test_public.py 与 test_public_raids.py（调序：先建角色再 signup）**

两文件的 `test_public_list_and_wave` / `test_public_raid_detail` 当前在**建角色之前**调 `helpers.signup()`（断言 200）→ 会变 400。把角色创建移到 signup 之前：

`test_public.py::test_public_list_and_wave` 调整为：

```python
    h, _ = register_user(client, "p1", "甲")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1}).json()["id"]
    signup(client, rid, h)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h, json={"character_id": cid})
```

`test_public_raids.py::test_public_raid_detail` 同样把 `cid = ...` 移到 `signup(client, rid, h)` 之前。

- [ ] **Step 4: 逐个文件运行**

Run:
```bash
cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py tests/test_bot_raid_signup.py tests/test_public.py tests/test_public_raids.py -v
```
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/tests/test_raid_signup.py backend/tests/test_bot_raid_signup.py backend/tests/test_public.py backend/tests/test_public_raids.py
git commit -m "test: 既有报名用例适配 ≥1 角色规则（补 _mkchar / 建角色后报名）"
```

---

### Task 10: 后端全量回归

**Files:**
- Test: 全量

- [ ] **Step 1: 全量运行**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS（含既有 tests + test_raid_signup_characters）

- [ ] **Step 2: 提交（若有漏网改动）**

```bash
git status
```

---

### Task 11: 前端 types + stores/raid.ts WS

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/stores/raid.ts`
- Test: `frontend/src/stores/raid.spec.ts`

- [ ] **Step 1: types.ts**

`types.ts` 中 `RaidSignup` 定义改为：

```ts
export interface SignupCharacter { id: number; name: string; job_title: string; class_type: ClassType }
export interface RaidSignup { user: User; created_at: string | null; characters: SignupCharacter[] }
```

（`SignupCharacter` 需在 `ClassType` 已声明之后，即文件靠前位置或 RaidSignup 上方。）

- [ ] **Step 2: stores/raid.ts**

`WsEvent` 联合中 `raid:signup` 加 `characters`，并新增事件：

```ts
  | { type: 'raid:signup'; user: User; created_at: string | null; characters: SignupCharacter[] }
  | { type: 'raid:signup_chars_changed'; user_id: number; characters: SignupCharacter[] }
```

导入补 `SignupCharacter`：`import type { Raid, RaidSignup, SignupCharacter, Slot, User } from '../types'`。

`applyEvent` 中 `raid:signup` 分支改为：

```ts
    case 'raid:signup':
      raid.signups ??= []
      raid.signups = raid.signups.filter(s => s.user.id !== ev.user.id)
      raid.signups.push({ user: ev.user, created_at: ev.created_at, characters: ev.characters ?? [] })
      break
    case 'raid:signup_chars_changed': {
      const row = raid.signups.find(s => s.user.id === ev.user_id)
      if (row) row.characters = ev.characters
      break
    }
```

- [ ] **Step 3: stores/raid.spec.ts**

- 既有 `raid:signup` 用例（第 88 行 `applyEvent(store, { type: 'raid:signup', user: u, created_at: ... })`）补 `characters: []`（否则 `npm run build` 的 vue-tsc 类型检查会报缺字段）。
- 追加用例：

```ts
  it('raid:signup_chars_changed 更新对应行勾选角色', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    const u = { id: 9, username: 'b', nickname: '乙', is_admin: false, avatar: null, is_banned: false }
    applyEvent(store, { type: 'raid:signup', user: u, created_at: '2026-09-22T10:00:00', characters: [] })
    const chars = [{ id: 1, name: '剑魂', job_title: '极诣·剑魂', class_type: '输出' as const }]
    applyEvent(store, { type: 'raid:signup_chars_changed', user_id: 9, characters: chars })
    expect(store.raid!.signups[0].characters).toEqual(chars)
  })
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/stores/raid.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/types.ts frontend/src/stores/raid.ts frontend/src/stores/raid.spec.ts
git commit -m "feat: RaidSignup 加 characters + raid:signup_chars_changed WS 增量更新"
```

---

### Task 12: SignupModal 组件（报名选角色 / 管理勾选复用）

**Files:**
- Create: `frontend/src/components/SignupModal.vue`
- Test: Create `frontend/src/components/SignupModal.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/SignupModal.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SignupModal from './SignupModal.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

const chars = [
  { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 1, simulated_damage: 5,
    sustained_dps: 2, buff_amount: null },
  { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 1, simulated_damage: null,
    sustained_dps: null, buff_amount: 9000 },
]

function mountModal(overrides: Record<string, unknown> = {}) {
  return mount(SignupModal, {
    props: { open: true, mode: 'signup', selectedIds: [], ...overrides },
    global: { stubs: { teleport: true } },
  })
}

describe('SignupModal', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.get.mockResolvedValue(chars) })

  it('signup 模式默认全选，确认提交全部 id', async () => {
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('[data-act="submit"]').trigger('click')
    expect(wrapper.emitted('submit')).toEqual([[ [1, 2] ]])
  })

  it('signup 模式取消一个后提交剩余', async () => {
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('[data-act="char-1"]').setValue(false)
    await wrapper.find('[data-act="submit"]').trigger('click')
    expect(wrapper.emitted('submit')).toEqual([[ [2] ]])
  })

  it('signup 模式全不选不提交', async () => {
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('[data-act="char-1"]').setValue(false)
    await wrapper.find('[data-act="char-2"]').setValue(false)
    await wrapper.find('[data-act="submit"]').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('manage 模式勾选态由 selectedIds 派生，切换透传 toggle', async () => {
    const wrapper = mountModal({ mode: 'manage', selectedIds: [1] })
    await flushPromises()
    expect((wrapper.find('[data-act="char-1"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('[data-act="char-2"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper.find('[data-act="char-2"]').setValue(true)
    expect(wrapper.emitted('toggle')).toEqual([[ [2, true] ]])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/SignupModal.spec.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现组件**

创建 `frontend/src/components/SignupModal.vue`：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import type { Character } from '../types'

const props = withDefaults(defineProps<{
  open: boolean
  mode: 'signup' | 'manage'
  selectedIds: number[]
}>(), { selectedIds: () => [] })
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', ids: number[]): void
  (e: 'toggle', cid: number, checked: boolean): void
}>()

const characters = ref<Character[]>([])
const loading = ref(false)
const localSelected = ref<number[]>([])
const error = ref('')

watch(() => props.open, async (open) => {
  if (!open) return
  loading.value = true
  error.value = ''
  try {
    characters.value = await api.get<Character[]>('/api/me/characters')
    if (props.mode === 'signup') {
      localSelected.value = characters.value.map(c => c.id)  // 默认全部勾选
    }
  } catch {
    characters.value = []
  } finally {
    loading.value = false
  }
}, { immediate: true })

function isChecked(cid: number): boolean {
  return props.mode === 'manage'
    ? props.selectedIds.includes(cid)
    : localSelected.value.includes(cid)
}
function toggle(cid: number) {
  if (props.mode === 'manage') {
    emit('toggle', cid, !props.selectedIds.includes(cid))
  } else {
    localSelected.value = localSelected.value.includes(cid)
      ? localSelected.value.filter(x => x !== cid)
      : [...localSelected.value, cid]
  }
}
function submit() {
  if (!localSelected.value.length) { error.value = '至少选择一个角色'; return }
  emit('submit', [...localSelected.value])
}
</script>

<template>
  <n-modal :show="open" preset="card"
           :title="mode === 'signup' ? '报名选角色' : '管理报名角色'"
           style="width:min(420px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="loading" style="color:var(--dnf-text-faint)">加载中…</p>
      <p v-else-if="!characters.length" style="color:var(--dnf-text-faint)">
        还没有角色，去「我的角色」添加
      </p>
      <label v-for="c in characters" :key="c.id" class="signup-char">
        <input type="checkbox" :checked="isChecked(c.id)" :data-act="'char-' + c.id"
               @change="toggle(c.id)" />
        <span>{{ c.name }}</span>
        <span style="color:var(--dnf-text-faint);font-size:12px">{{ c.job_title }}</span>
      </label>
      <p v-if="error" style="color:var(--dnf-danger)">{{ error }}</p>
    </div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <template v-if="mode === 'signup'">
          <button class="dnf-btn" @click="emit('close')">取消</button>
          <button class="dnf-btn dnf-btn-primary" data-act="submit" @click="submit">确认报名</button>
        </template>
        <button v-else class="dnf-btn" @click="emit('close')">关闭</button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.signup-char {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; margin: 6px 0;
  border: 1px solid var(--dnf-border); border-radius: 4px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/SignupModal.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/SignupModal.vue frontend/src/components/SignupModal.spec.ts
git commit -m "feat: SignupModal 报名选角色/管理勾选组件"
```

---

### Task 13: CharacterPickerModal 按勾选过滤

**Files:**
- Modify: `frontend/src/components/CharacterPickerModal.vue`
- Test: `frontend/src/components/CharacterPickerModal.spec.ts`

- [ ] **Step 1: 改 props 与过滤逻辑**

`props` 定义加 `signupCharsByUser`：

```ts
const props = withDefaults(defineProps<{
  open: boolean; adminMode?: boolean; signupUserIds?: number[]
  signupCharsByUser?: Record<number, number[]>
  placed?: Record<number, CharacterPlacement>
}>(), { placed: () => ({}), signupCharsByUser: () => ({}) })
```

加过滤函数（放在 `onPlayerChange` 附近）：

```ts
function filterBySignup(list: Character[]): Character[] {
  const key = props.adminMode ? (playerId.value ?? -1) : (auth.user?.id ?? -1)
  const ids = props.signupCharsByUser[key]
  return ids ? list.filter(c => ids.includes(c.id)) : list
}
```

watch 内两处 `characters.value = ...` 包一层 `filterBySignup`：

```ts
    const mine = players.value.find(p => p.user.id === auth.user?.id) ?? players.value[0]
    playerId.value = mine?.user.id ?? null
    characters.value = filterBySignup(mine?.characters ?? [])
  } else {
    characters.value = filterBySignup(await api.get<Character[]>('/api/me/characters'))
  }
```

`onPlayerChange` 也包一层：

```ts
function onPlayerChange(id: number) {
  playerId.value = id
  selected.value = null
  characters.value = filterBySignup(players.value.find(p => p.user.id === id)?.characters ?? [])
}
```

- [ ] **Step 2: 加测试用例**

`CharacterPickerModal.spec.ts` 末尾追加（沿用既有 playerA/mine fixture）：

```ts
describe('CharacterPickerModal signupCharsByUser', () => {
  const playerB = {
    user: { id: 2, username: 'li', nickname: '小李', is_admin: false },
    characters: [
      { id: 11, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
        parent_name: 'swordman_male', class_type: '输出', fame: 52000, simulated_damage: 5,
        sustained_dps: 2, buff_amount: null },
      { id: 21, name: '奶2', job_name: 'crusader_male', job_title: '神启·圣骑士',
        parent_name: 'priest_male', class_type: '辅助', fame: 1, simulated_damage: null,
        sustained_dps: null, buff_amount: 9000 },
    ],
  }

  it('成员仅显示已勾选角色（团长无映射则全显）', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerB]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [2],
               signupCharsByUser: { 2: [21] } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    await wrapper.findComponent({ name: 'Select' }).vm.$emit('update:value', playerB.user.id)
    await flushPromises()
    expect(wrapper.text()).toContain('奶2')
    expect(wrapper.text()).not.toContain('剑魂')
  })
})
```

- [ ] **Step 3: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/CharacterPickerModal.spec.ts`
Expected: 既有用例 + 新用例全部 PASS（既有用例未传 `signupCharsByUser` → 走默认 `{}` → 不过滤，行为不变）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/CharacterPickerModal.vue frontend/src/components/CharacterPickerModal.spec.ts
git commit -m "feat: 选人面板按报名勾选过滤角色（团长不受限）"
```

---

### Task 14: RaidDetailView 报名弹窗 + 面板角色芯片

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`
- Test: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: 加导入与状态**

导入加 `SignupModal`：

```ts
import SignupModal from '../components/SignupModal.vue'
```

`showMemberPicker` 附近新增状态与派生：

```ts
const showSignupModal = ref(false)
const signupMode = ref<'signup' | 'manage'>('signup')
const signupSelected = ref<number[]>([])
const myRow = computed(() =>
  store.raid?.signups.find(s => s.user.id === auth.user?.id) ?? null)
const signupCharsByUser = computed<Record<number, number[]>>(() => {
  const m: Record<number, number[]> = {}
  for (const s of store.raid?.signups ?? []) {
    if (s.created_at === null) continue  // 团长固定行跳过（否则空数组会过滤掉团长全部角色）
    m[s.user.id] = s.characters.map(c => c.id)
  }
  return m
})
```

- [ ] **Step 2: 加报名/勾选操作函数**

把既有 `onSignup` 替换为弹窗流程，并新增管理函数：

```ts
function openSignupModal() {
  signupMode.value = 'signup'
  showSignupModal.value = true
}
async function onSignupSubmit(ids: number[]) {
  if (!store.raid) return
  try {
    await api.post(`/api/raids/${store.raid.id}/signup`, { character_ids: ids })
    notifySuccess('报名成功')
    showSignupModal.value = false
    await load()
  } catch (e: any) { notifyError(e.message) }
}
function openManageSignup() {
  if (!myRow.value) return
  signupMode.value = 'manage'
  signupSelected.value = myRow.value.characters.map(c => c.id)
  showSignupModal.value = true
}
async function onToggleSignupChar(cid: number, checked: boolean) {
  if (!store.raid) return
  if (!checked && placed.value[cid]) {
    const ok = await confirmDialog({ content: '该角色已占位，取消勾选将撤销其占位，确认？' })
    if (!ok) return
  }
  try {
    if (checked) await api.post(`/api/raids/${store.raid.id}/signup/characters/${cid}`)
    else await api.del(`/api/raids/${store.raid.id}/signup/characters/${cid}`)
    await load()
  } catch (e: any) { notifyError(e.message) }
}
async function onRemoveSignupChar(cid: number) {
  if (!store.raid) return
  if (placed.value[cid]) {
    const ok = await confirmDialog({ content: '该角色已占位，取消勾选将撤销其占位，确认？' })
    if (!ok) return
  }
  try {
    await api.del(`/api/raids/${store.raid.id}/signup/characters/${cid}`)
    await load()
  } catch (e: any) { notifyError(e.message) }
}
```

- [ ] **Step 3: 模板：报名按钮开弹窗**

模板中「报名」按钮改绑 `openSignupModal`：

```html
          <button v-if="!store.raid.locked && !mySignedUp" class="dnf-btn dnf-btn-sm dnf-btn-primary"
                  @click="openSignupModal">报名</button>
```

- [ ] **Step 4: 模板：报名面板渲染角色芯片 + 本人行可管理**

报名面板每行（`v-for="s in store.raid.signups"`）的昵称之后加芯片块：

```html
          <div v-if="s.created_at !== null && s.characters.length" class="signup-chips">
            <span v-for="c in s.characters" :key="c.id" class="signup-chip">
              {{ c.name }}
              <button v-if="s.user.id === auth.user?.id && !store.raid.locked"
                      class="chip-x" :data-act="'rm-char-' + c.id"
                      @click="onRemoveSignupChar(c.id)">×</button>
            </span>
            <button v-if="s.user.id === auth.user?.id && !store.raid.locked"
                    class="dnf-btn dnf-btn-sm" data-act="add-char"
                    @click="openManageSignup">＋ 添加角色</button>
          </div>
          <button v-else-if="s.created_at !== null && s.user.id === auth.user?.id && !store.raid.locked"
                  class="dnf-btn dnf-btn-sm" data-act="add-char"
                  @click="openManageSignup">＋ 添加角色</button>
```

（团长行 `created_at === null` 不渲染芯片块；他人行只读芯片。）

- [ ] **Step 5: 模板：挂 SignupModal**

`SignupMemberPicker` 之后加：

```html
    <SignupModal :open="showSignupModal" :mode="signupMode" :selected-ids="signupSelected"
                 @close="showSignupModal = false"
                 @submit="onSignupSubmit" @toggle="onToggleSignupChar" />
```

- [ ] **Step 6: 模板：选人面板传 signupCharsByUser**

`CharacterPickerModal` 加 prop：

```html
    <CharacterPickerModal :open="pickSlot != null" :admin-mode="auth.isAdmin"
                          :signup-user-ids="signupUserIds" :signup-chars-by-user="signupCharsByUser"
                          :placed="placed"
                          @close="pickSlot = null" @select="onSelectCharacter" />
```

- [ ] **Step 7: 样式**

`<style scoped>` 加：

```css
.signup-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; align-items: center; }
.signup-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px; border: 1px solid var(--dnf-border); border-radius: 10px;
  font-size: 12px; color: var(--dnf-text-muted);
}
.chip-x { background: none; border: none; cursor: pointer; color: var(--dnf-text-faint); padding: 0 2px; }
.chip-x:hover { color: var(--dnf-danger, red); }
```

> 注意：报名行外层 div 用**内联** `border:1px solid var(--dnf-border)`，芯片用 CSS class 边框，避免破坏 RaidDetailView.spec 里 `div[style*="border: 1px solid var(--dnf-border)"]` 的行选择器。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/views/RaidDetailView.vue
git commit -m "feat: 详情页报名弹窗 + 面板角色芯片（本人可追加/取消，取消撤占位）"
```

---

### Task 15: RaidDetailView.spec 适配与新增

**Files:**
- Modify: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: fixture 补 characters 字段**

`adminRow` / `memberRow`（第 36-37 行）补 `characters: []`：

```ts
const adminRow = { user: admin, created_at: null, characters: [] }
const memberRow = { user: member, created_at: '2026-09-22T10:00:00', characters: [] }
```

- [ ] **Step 2: stubs 加 SignupModal**

`mountView` 与第二个 mount 的 stubs 里加 `SignupModal: true`（保证弹窗组件不真实渲染、不拉 API）。

- [ ] **Step 3: 追加用例**

在 `RaidDetailView enhance` describe 内追加：

```ts
  it('报名按钮打开 SignupModal（signup 模式）', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    await wrapper.find('button:not(.dnf-btn-sm)').trigger('click')  // 「报名」按钮
    await flushPromises()
    const modal = wrapper.findComponent({ name: 'SignupModal' })
    expect(modal.exists()).toBe(true)
    expect(modal.props('mode')).toBe('signup')
  })
```

> 说明：若「报名」按钮选择器不稳，改用带 `data-test="signup"` 的定位——给模板报名按钮补 `data-test="signup"` 后按 `[data-test="signup"]` 选择。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RaidDetailView.spec.ts
git commit -m "test: RaidDetailView fixture 补 characters + 报名弹窗用例"
```

---

### Task 16: 前端构建 + 全量回归

**Files:**
- Test: 全量

- [ ] **Step 1: 构建 + 单测**

Run: `cd frontend && npm run build`
Expected: 通过（vue-tsc 无类型错误）

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

### Task 17: CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 追加条目**

`CHANGELOG.md` [Unreleased] 区追加（仿既有条目格式）：

```
- 攻坚报名升级为角色级：报名时勾选愿意上场的角色（默认全部），团长只能排成员已勾选的角色；报名后可随时追加/取消勾选角色，取消勾选会撤销该角色占位；机器人/管理员代报名默认勾选全部角色；无角色用户无法报名。
```

- [ ] **Step 2: 提交**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 新增报名角色勾选"
```

---

## 验收清单

- [ ] 报名默认勾选全部角色；指定 `character_ids` 报名仅勾选指定；非本人角色/空勾选/无角色用户报名被拒。
- [ ] 报名后可在详情页追加/取消勾选；取消勾选撤销该角色占位并广播；锁定后改角色 403；最后一个角色不可取消。
- [ ] `fill_slot`：成员放自己未勾选角色 403、管理员放他人未勾选角色 403、团长自放不受限。
- [ ] 成员角色列表（详情弹窗）仅返回已勾选角色，团长返回全部。
- [ ] 取消报名（本人/管理员/机器人）无 500（`_remove_signup` ORM 删除），子表级联清空。
- [ ] 删除被勾选角色清理报名子行，勾选清空的报名整条取消。
- [ ] 机器人/管理员代报名默认全部角色；目标无角色 → 400。
- [ ] 前端报名面板显示每位成员已勾选角色芯片，本人可管理；选人面板成员只显已勾选、团长全显。
- [ ] 后端 pytest、前端 vitest + vue-tsc build 全绿。
