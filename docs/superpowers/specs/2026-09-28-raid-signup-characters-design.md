# DNfer 攻坚报名·角色勾选 — 设计规格

日期：2026-09-28
状态：已确认
上游：`2026-09-22-raid-signup-design.md`（既有报名机制，RaidSignup 用户级报名）与 `2026-09-16-dnfer-raid-scheduler-design.md`（Raid/Wave/Slot 排表核心）
需求来源：`报名功能优化.md`——报名时群友可勾选想打的角色，防止被团长安排不想打的位置；团长在详情页只能看到群友已勾选的角色；机器人报名默认勾选全部角色；网页可取消已勾选角色，取消后若该角色已占位则撤销占位。

## 1. 目标

把「报名」从**用户级**升级为**角色级**：报名时成员勾选本场愿意上场的角色；团长排表只能放成员勾选过的角色；成员报名后可随时追加/取消勾选角色，取消勾选会撤销该角色在本场的占位。

已确认的约束与决策：

- **新增独立表 `raid_signup_characters`**（signup_id + character_id 唯一），`Base.metadata.create_all` 自动建表，无 ALTER 迁移。
- **`raid_signups` 仍是「参与报名」主行**，角色维度挂在子表，`_participates()`、报名面板、取消报名逻辑保持兼容。
- **报名必须至少勾选 1 个角色**（`400 至少选择一个角色`）；取消勾选到最后一个时也拦截（`400 至少保留一个角色`）。**无角色的用户无法报名**（行为变更：此前允许空角色报名）。
- **网页报名默认全部勾选**；**机器人报名（不传 character_ids）默认全部角色**；管理员代报名同样默认目标用户全部角色。
- **团长（`raid.created_by`）不受勾选约束**：恒参与、可排自己的全部角色；`fill_slot` 对团长自己的角色跳过勾选校验。
- **追加与取消均可**：报名后成员可随时追加新角色（如新建角色）或取消已勾选角色。
- **锁定后成员不可改角色**：追加/取消勾选一律 `403 攻坚已锁定，无法修改报名`（与自行取消报名 `403` 语义一致）。
- **团长只能看到成员已勾选的角色**：详情报名面板展示每位成员勾选的角色芯片；选人面板（CharacterPickerModal）与成员角色弹窗（MemberCharactersModal）对成员仅显示已勾选角色，对团长仍显示全部角色。
- **取消勾选触发撤占位**：删除勾选时撤下该角色在本场全部波次的占位并广播 `slot:removed`。
- 后端 `fill_slot` 强制校验「被放置角色的主人必须已报名 **且** 该角色已被勾选」→ 否则 403；前端过滤仅是 UX 增强，规则单一可靠。

## 2. 数据模型（`backend/app/models.py`）

新增：

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

`RaidSignup` 补反向关系（**必须**带级联，删除报名行/攻坚时子表一并清理，避免外键残留）：

```python
class RaidSignup(Base):
    ...
    characters: Mapped[list["RaidSignupCharacter"]] = relationship(
        back_populates="signup", cascade="all, delete-orphan")
```

- `init_db()` 的 `create_all` 自动建新表，无需迁移函数。

## 3. Schema 变更（`backend/app/schemas.py`）

```python
class SignupCharacterOut(BaseModel):
    id: int
    name: str
    job_title: str
    class_type: str

class RaidSignupOut(BaseModel):
    user: UserOut
    created_at: datetime | None   # 团长固定行（无真实报名记录）为 None
    characters: list[SignupCharacterOut] = []   # 团长固定行为空列表

class SignupIn(BaseModel):
    character_ids: list[int] | None = None   # None=默认全部角色
```

- `RaidSignupOut.characters` **带默认值 `[]`**：`_detail` 定义于 `raids.py` 并被 `public.py` 复用（公开端点直接调 `_detail`），`RaidSignupOut` 构造点只有 `raids.py` 一处；带默认值可避免中间态 500。
- `BotSignupIn` 增加 `character_ids: list[int] | None = None`（缺省=全部角色）。
- `SignupUserIn`（管理员代报名）不加字段：代报名恒默认全部角色。

## 4. 后端接口

### 4.1 共享助手（`backend/app/routers/raids.py`）

```python
def _selected_ids(db, raid, user_id) -> set[int]:
    """某用户在本场报名中勾选的角色 id 集合。"""
    rs = db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                     RaidSignup.user_id == user_id).first()
    return {rsc.character_id for rsc in rs.characters} if rs else set()

def _signup_user(db, raid, user, character_ids=None) -> RaidSignup:
    """建报名行 + 勾选角色（signup / admin_signup / bot_signup 复用）。
    character_ids=None → 该用户全部角色；显式空列表 → 400。"""
    if character_ids is None:
        character_ids = [c.id for c in db.scalars(
            select(Character).where(Character.user_id == user.id)).all()]
    else:
        character_ids = list(dict.fromkeys(character_ids))   # 去重，防唯一约束 500
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

### 4.2 报名 `POST /api/raids/{rid}/signup`（body 可选 `SignupIn`）

- 鉴权：`get_current_user`。
- 原校验顺序不变：`user.is_banned → 403`、`user.id == raid.created_by → 400 "团长无需报名"`、`raid.locked → 400 "攻坚已锁定，无法报名"`、已存在报名行 → `400 "你已报名"`。
- 调 `_signup_user(db, raid, user, body.character_ids)`（内部完成 ≥1 与归属校验）。
- `commit`（并发重复报名 `IntegrityError → rollback → 400 "你已报名"` 兜底不变），`refresh`。
- 广播 `raid:signup { user, created_at, characters: [SignupCharacterOut] }`。
- 返回 `{"ok": True}`。
- **`_detail`（`GET /api/raids/{rid}`）**：为每位成员报名行填充 `characters`（取该报名行 `RaidSignupCharacter.character` 转 `SignupCharacterOut`）；团长固定行 `characters=[]`（走 schema 默认值）。

### 4.3 追加勾选 `POST /api/raids/{rid}/signup/characters/{cid}`（新增）

- 鉴权：`get_current_user`。
- `user.is_banned → 403 "你已被封禁，无法报名"`。
- `user.id == raid.created_by → 400 "团长无需报名"`。
- `raid.locked → 403 "攻坚已锁定，无法修改报名"`。
- 无报名行 → `400 "你尚未报名"`。
- `cid` 角色不存在或非本人 → `400 "只能勾选自己的角色"`。
- 已勾选该角色 → `400 "该角色已在报名中"`。
- 追加 `RaidSignupCharacter` 子行，`commit`。
- 广播 `raid:signup_chars_changed { user_id, characters: [SignupCharacterOut] }`。
- 返回 `{"ok": True}`。

### 4.4 取消勾选 `DELETE /api/raids/{rid}/signup/characters/{cid}`（新增）

- 鉴权：`get_current_user`。
- 前置校验同 §4.3（封禁/团长/锁定 403/未报名 400）。
- 该角色不在勾选中 → `400 "该角色不在报名中"`。
- 当前勾选数 ≤ 1 → `400 "至少保留一个角色"`。
- **撤销占位**：查本场 `Slot.wave.raid_id == rid and Slot.character_id == cid` 的格子逐个 `_clear_slot`。
- 删除该 `RaidSignupCharacter` 子行，`commit`。
- 广播各被撤格子的 `slot:removed { slot_id }`，再广播 `raid:signup_chars_changed { user_id, characters }`。
- 返回 `{"ok": True}`。

### 4.5 取消报名 `DELETE /api/raids/{rid}/signup` 与管理员取消 `DELETE /api/raids/{rid}/signups/{user_id}`

`_remove_signup`（被本人/管理员/机器人三条取消路径共用）**必须修改**：现实现用批量 `db.query(RaidSignup).filter(...).delete()`，而 **SQLAlchemy 批量删除不触发 ORM 关系级联**（`cascade="all, delete-orphan"` 仅对 `session.delete(obj)` 生效）；SQLite 已启用 `PRAGMA foreign_keys=ON`（`db.py`/`conftest.py`）且 FK 未声明 `ondelete`——直接删父行会因 `raid_signup_characters` 残留触发外键 `IntegrityError` → 500（每条报名都有 ≥1 个子行，所有取消路径必触发）。

改为**加载报名对象后 `db.delete(rs)`**（ORM 级联清 `raid_signup_characters` 子行），再撤全部占位、广播，行为与现状一致：

```python
rs = db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                 RaidSignup.user_id == user_id).first()
if rs is not None:
    db.delete(rs)   # ORM 级联清 raid_signup_characters 子行
removed = db.query(Slot).filter(Slot.wave.has(raid_id=raid.id),
                                Slot.character.has(user_id=user_id)).all()
for s in removed:
    _clear_slot(s)
db.commit()
# 广播 slot:removed + raid:signup_removed 不变
```

`delete_raid` 走 `db.delete(raid)` ORM 级联，不受影响。

### 4.6 占位强制（`fill_slot`）

在既有 `_participates` 校验之后追加角色级校验：

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

- 普通用户放置自己未勾选的角色 → `403 "请先勾选该角色再占位"`。
- 管理员放置他人未勾选的角色 → `403 "该角色未报名，无法排表"`。
- `remove_slot` / `change_duty` / `move_slot` 无需新校验（仅移动/管理已占位角色，其必已勾选）。

### 4.7 成员角色列表 `GET /api/raids/{rid}/signups/{user_id}/characters`

- 目标用户未参与 → 404「该用户未参与本场攻坚」不变。
- **团长（`user_id == raid.created_by`）→ 返回其全部角色**（不受勾选约束）。
- **成员 → 仅返回已勾选角色**（`rsc.character` 列表）。

### 4.8 角色删除（`backend/app/services/characters.py` 的 `delete_character_if_free`）

现有占位检查（`Slot.character_id == cid → 400`）后追加清理：

```python
# 角色在报名勾选中 → 一并移除子行；若该报名因此清空 → 整条取消报名
for rsc in db.query(RaidSignupCharacter).filter(
        RaidSignupCharacter.character_id == cid).all():
    signup = rsc.signup
    db.delete(rsc)
    remaining = db.query(RaidSignupCharacter).filter(
        RaidSignupCharacter.signup_id == signup.id,
        RaidSignupCharacter.character_id != cid).count()
    if remaining == 0:
        db.delete(signup)   # 角色已 free（无占位），无需撤占位；此路径不广播，重载即一致
```

- `delete_character_if_free` 被 `members.py` 与 `admin.py` 共用，两处删除行为一致。

### 4.9 管理员代报名 `POST /api/raids/{rid}/signups` 与机器人报名 `POST /api/public/raids/{rid}/signup`

两者均改用 `_signup_user`（默认全部角色）：

- `admin_signup`：前置校验不变（锁定 400 / 目标封禁 403 / 团长 400 / 已报名 400），将「建 `RaidSignup`」替换为 `_signup_user(db, raid, target, None)`；目标用户无角色 → 400「至少选择一个角色」。既有并发重复报名 `IntegrityError → rollback → 400` 兜底保留。
- `bot_signup`：同样以 `body.character_ids`（缺省 `None`=全部）调 `_signup_user(db, raid, user, body.character_ids)`；机器人用户无角色 → 400「至少选择一个角色」。并发兜底保留。

## 5. WebSocket 事件

- 既有 `raid:signup` 的 payload 增加 `characters: [SignupCharacterOut]`。
- 新增 `raid:signup_chars_changed`：`{ type, user_id, characters: [SignupCharacterOut] }`（成员追加/取消勾选时广播）。
- `slot:removed`（取消勾选撤占位时逐个广播）复用既有类型，前端无需新逻辑。

## 6. 前端

### 6.1 `frontend/src/types.ts`

- 新增 `SignupCharacter = { id: number; name: string; job_title: string; class_type: ClassType }`。
- `RaidSignup` 增加**必填** `characters: SignupCharacter[]`（牵连所有 RaidSignup fixture 需补 `characters: []`，见 §7）。

### 6.2 `frontend/src/stores/raid.ts`

- `WsEvent` 联合新增 `raid:signup_chars_changed { user_id, characters: SignupCharacter[] }`。
- `raid:signup` 分支 push 时带上 `characters: ev.characters ?? []`。
- `raid:signup_chars_changed` 分支：找到该 user_id 的 signup 行并替换其 `characters`。

### 6.3 新组件 `SignupModal.vue`（初始报名 + 管理勾选复用）

- Props：`open: boolean`、`mode: 'signup' | 'manage'`、`selectedIds: number[]`（manage 模式受父组件控制，signup 模式本地维护）。
- 打开时 `GET /api/me/characters` 拉当前用户全部角色，`CharacterCard` 列表 + 复选框。
  - `mode='signup'`：默认全部勾选；「确认」emit `submit(characterIds)`。
  - `mode='manage'`：checked 完全由 `selectedIds` 派生；切换 emit `toggle(cid, checked)`，**父组件**处理占位确认与 API 调用，父组件更新 `selectedIds` 后回传刷新勾选态（用户取消确认则自动还原）。
- 数据为空（无角色）→ 提示「还没有角色，去「我的角色」添加」。

### 6.4 `RaidDetailView.vue`

- **「报名」按钮**：点击打开 `SignupModal`（mode=signup）→ `submit(ids)` 调 `POST /api/raids/{rid}/signup`，body `{ character_ids: ids }`，成功后 `load()`。
- **报名面板**：每个成员行（含团长）昵称下渲染角色芯片 `characters`。
  - **本人行**（非团长、非锁定）：芯片带 × 可取消勾选，`confirmDialog`（若该角色有占位 → 提示「该角色已占位，取消勾选将撤销其占位」）后 `DELETE /api/raids/{rid}/signup/characters/{cid}`；另有「+ 添加角色」按钮打开 `SignupModal`（mode=manage，`selectedIds`=当前勾选），toggle 走 POST/DELETE。
  - **他人行 / 团长行**：只读芯片（团长可见成员已勾选角色）。
- **`CharacterPickerModal` 新 prop `signupCharsByUser: Record<number, number[]>`**：由 `store.raid.signups` 计算，**只取非团长行**（`signups.filter(s => s.created_at !== null)`，每行取其 `characters` 的 id 数组）——团长固定行 `characters: []` 若被纳入会产生 `{ [leaderId]: [] }`，导致团长角色被全部过滤的回归。
  - 管理员模式与本人排表模式都过滤：目标玩家在 `signupCharsByUser` 中 → 仅显示其已勾选角色；不在（团长）→ 显示全部。
- **`MemberCharactersModal`** 不改：后端 §4.7 已过滤。

### 6.5 `CharacterPickerModal.vue`

- 新增 prop `signupCharsByUser?: Record<number, number[]>`（默认 `{}`）。
- 过滤 `characters`（按场景区分，避免本人模式 `playerId` 为 null 失效）：
  - **管理员模式**：`props.signupCharsByUser[playerId]` 存在 → `characters.filter(c => ids.includes(c.id))`；不存在（团长，无报名行）→ 原样全部。
  - **本人模式**：按 `props.signupCharsByUser[auth.user.id]` 过滤（本人已报名必有该键）；不存在 → 原样兜底（后端 `fill_slot` 仍会 403 拦截，见 §4.6）。

### 6.6 机器人脚本 `skills/dnfer-raids/scripts/dnfer_raid.py`

- **不改**：`signup` 命令不传 `character_ids` → 后端默认全部角色，满足「机器人报名默认全部」。

## 7. 测试

### 后端

新增用例（扩展 `backend/tests/test_raid_signup.py` 或新建 `test_raid_signup_characters.py`）：

- 报名默认全部勾选：`detail.signups` 对应行 `characters` 含全部角色 id。
- 指定 `character_ids` 报名 → 仅勾选指定角色。
- 报名非本人角色 → 400「只能勾选自己的角色」。
- 报名空 `character_ids` / 无角色用户 → 400「至少选择一个角色」。
- 追加勾选 → 成功；已勾选 → 400；非本人 → 400；锁定 → 403；未报名 → 400。
- 取消勾选 → 勾选移除 + 该角色占位被撤（`slot.character_id is None`）+ WS 顺序 `slot:removed` → `raid:signup_chars_changed`。
- 取消最后一个勾选 → 400「至少保留一个角色」；未勾选该角色 → 400「该角色不在报名中」；锁定 → 403。
- **取消报名（本人/管理员/机器人）→ `raid_signups` 与 `raid_signup_characters` 子行均清空、无 500**（验证 §4.5 `_remove_signup` 改造，批量删除改 ORM 删除后不触发外键错误）。
- `fill_slot`：成员放置自己未勾选角色 → 403「请先勾选该角色再占位」；管理员放置成员未勾选角色 → 403「该角色未报名，无法排表」；勾选后 → 成功。
- `fill_slot`：团长放置自己任意角色 → 成功（不受勾选约束）。
- `get_member_characters`：成员 → 仅已勾选；团长 → 全部。
- 删除被勾选角色 → 子行清理；勾选清空的报名整条取消。
- 机器人 `bot_signup`：不传 `character_ids` → 全部勾选；传指定 → 仅指定。
- 管理员代报名：默认全部；目标无角色 → 400。
- WS：`raid:signup` payload 含 `characters`；`raid:signup_chars_changed` 增量。

既有用例适配分两类：

**（a）硬破坏（断言 200 但报名无角色用户 → 400，必须补 `_mkchar`）**：`test_signup_success_and_detail`、`test_signup_duplicate_blocked`、`test_signup_ws_broadcast`、`test_admin_signup_for_other`、`test_admin_signup_other_duplicate_blocked`、`test_admin_signup_ws_broadcast_target_user`、`test_public.py::test_public_list_and_wave`、`test_public_raids.py::test_public_raid_detail`（后两者在**建角色之前**调 `helpers.signup()`）、`test_bot_signup_by_account`、`test_bot_signup_by_nickname`、`test_bot_signup_duplicate`、`test_bot_signup_ws_broadcast`。

**（b）setup 意义损失（仍通过但报名失败，建议补 `_mkchar` 保住语义）**：`test_self_cancel_locked_blocked`、`test_bot_cancel_locked_blocked`（锁定检查先于报名存在性，400 后锁定仍得 403）、`test_member_characters_cross_user_visible`（第二个报名用户）、`test_delete_raid_with_signups`、`test_member_characters_user_not_found`。

`test_member_characters_empty_roster` 语义改为「无角色用户报名 → 400」。

另：`helpers.py` 的 `signup()` 辅助还被 `test_raids.py` / `test_admin_adjust.py` 使用；`test_admin_management.py` 则内联 `POST /api/raids/{rid}/signup`（不经辅助函数）。这些调用点均先建角色或前置 400/403 先触发（安全），改动后应再确认报名仍 200。

### 前端

- `SignupModal.spec.ts`（新）：signup 模式默认全选/提交 ids；manage 模式勾选态由 `selectedIds` 派生、toggle 透传。
- `RaidDetailView.spec.ts`：fixture `adminRow`/`memberRow` 补 `characters: []`；报名按钮开弹窗；面板渲染角色芯片；本人取消勾选流。
- `stores/raid.spec.ts`：`raid:signup` 带 `characters`；`raid:signup_chars_changed` 更新对应行。
- `CharacterPickerModal.spec.ts`：`signupCharsByUser` 过滤（成员只显已勾选 / 团长全显）。
- `MemberCharactersModal.spec.ts`：无前端改动，无需新增（后端行为由后端用例覆盖）。

## 8. 文档

- `CHANGELOG.md` [Unreleased] → 新增：报名角色勾选（报名默认全部/追加与取消/取消撤占位/团长仅见已勾选/机器人默认全部）。

## 9. 变更文件范围

- `backend/app/models.py` — 新增 `RaidSignupCharacter`；`RaidSignup` 补 `characters` 关系（`cascade="all, delete-orphan"`）
- `backend/app/schemas.py` — 新增 `SignupCharacterOut` / `SignupIn`；`RaidSignupOut` 加 `characters`；`BotSignupIn` 加 `character_ids`
- `backend/app/routers/raids.py` — `_signup_user`/`_selected_ids` 助手；signup 收 body；新增追加/取消勾选端点；`fill_slot` 角色级校验；`_detail`/`get_member_characters` 过滤；**`_remove_signup` 批量删除改 ORM 删除（关键缺陷修复）**
- `backend/app/routers/bot.py` — `bot_signup` 用 `_signup_user`
- `backend/app/services/characters.py` — `delete_character_if_free` 清理勾选子行 + 清空报名
- `backend/tests/*` — 新增用例 + 既有用例补 `_mkchar`（含 `test_public.py` / `test_public_raids.py` 的 signup 调用点）
- `frontend/src/types.ts` — `SignupCharacter` / `RaidSignup.characters`
- `frontend/src/stores/raid.ts` — WS 事件
- `frontend/src/components/SignupModal.vue` — 新增
- `frontend/src/views/RaidDetailView.vue` — 报名弹窗 / 面板芯片 / 追加取消 / 传 `signupCharsByUser`
- `frontend/src/components/CharacterPickerModal.vue` — `signupCharsByUser` 过滤
- `frontend/src/**/*.spec.ts` — fixture 与新增用例
- `CHANGELOG.md` — [Unreleased] 新增
