# DNfer 攻坚报名 — 设计规格

日期：2026-09-22
状态：已确认
上游：`2026-09-16-dnfer-raid-scheduler-design.md`（既有攻坚排表核心，Raid/Wave/Slot 模型）与 `2026-09-20-admin-position-adjust-design.md`（管理员排表交互范式）
需求来源：用户口头需求——攻坚列表新增「报名」按钮，报名后才可被管理员排表；未报名用户在占位时询问是否报名；详情页显示已报名用户，管理员可取消报名。

## 1. 目标

为攻坚系统引入「报名」机制：非管理员用户需报名某次攻坚，管理员排表时才能选择到该用户的角色；管理员默认参加（无需报名）；详情页展示已报名列表并支持取消。

已确认的约束与决策：

- **新增独立表 `raid_signups`**（raid_id + user_id 唯一），`Base.metadata.create_all` 自动建表，无 ALTER 迁移。
- **仅未锁定（`locked=False`）的攻坚可报名**；锁定后不可报名、不可自行取消（管理员取消不受锁定限制）。
- **管理员无需报名、默认参加**：管理员始终可被排表，且固定显示在已报名列表首位。
- **管理员排表可选范围收窄**：选人面板（CharacterPickerModal 管理员模式）只显示「管理员自己 ∪ 已报名用户」。
- **取消报名时自动撤下该用户全部占位**（清空所有波次中该用户的格子）。
- **允许自行取消**：未锁定时用户可取消自己的报名（同样撤下自身占位）。
- **占位询问**：未报名用户进入详情页并尝试占位时，先询问是否报名，确认后才打开选人弹窗。
- 后端 `fill_slot` 强制校验「非管理员未报名 → 403」，前端询问仅是 UX 增强，规则单一可靠。

## 2. 数据模型（`backend/app/models.py`）

新增：

```python
class RaidSignup(Base):
    __tablename__ = "raid_signups"
    __table_args__ = (UniqueConstraint("raid_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    raid: Mapped[Raid] = relationship()
    user: Mapped[User] = relationship()
```

- `init_db()` 的 `Base.metadata.create_all(bind=engine)` 会在启动时自动建新表，无需新增迁移函数。

## 3. Schema 变更（`backend/app/schemas.py`）

```python
class RaidSignupOut(BaseModel):
    user: UserOut
    created_at: datetime | None   # 管理员固定行（无真实报名记录）为 None
```

- `RaidListItem` 增加：`signup_count: int`、`my_signed_up: bool`。
- `RaidDetail` 增加：`signups: list[RaidSignupOut]`（管理员固定首位，`created_at=None`，后跟已报名非管理员）。
- `my_signed_up` / `signup_open` 在前端从 `signups` 与 `locked` 推导，不新增后端字段。

## 4. 后端接口（`backend/app/routers/raids.py`）

### 4.1 列表 `GET /api/raids`

`RaidListItem` 补 `signup_count`（`raid_signups` 行数）与 `my_signed_up`（当前用户是否有报名行）。

### 4.2 详情 `GET /api/raids/{rid}`

`_detail` 补 `signups`：管理员（`User` 查 is_admin）固定第一项，再按报名时间升序排非管理员报名者。报名行取 `db.query(RaidSignup).filter(raid_id==rid).order_by(created_at)` 并 `selectinload` 用户。

### 4.3 报名 `POST /api/raids/{rid}/signup`

- 鉴权：`get_current_user`。
- `user.is_admin` → `400 "管理员无需报名"`。
- `raid.locked` → `400 "攻坚已锁定，无法报名"`。
- 已存在报名行 → `400 "你已报名"`。
- 新增报名行，`commit`，广播 `raid:signup { user, created_at }`。
- 返回 `{"ok": True}`。

### 4.4 自行取消 `DELETE /api/raids/{rid}/signup`

- 鉴权：`get_current_user`。
- `raid.locked` 且非管理员 → `403 "攻坚已锁定，无法取消报名"`。
- 无报名行 → `400 "你尚未报名"`。
- 删除报名行；撤下该用户全部占位（所有波次中 `character.owner.user_id == user.id` 的格子逐个 `_clear_slot`）；广播 `slot:removed` 与 `raid:signup_removed { user_id }`。
- 返回 `{"ok": True}`。

### 4.5 管理员取消他人 `DELETE /api/raids/{rid}/signups/{user_id}`

- 鉴权：`require_admin`（锁定状态下也可操作）。
- 目标用户无报名行 → `400 "该用户尚未报名"`。
- 删除报名行；撤下该用户全部占位；广播 `slot:removed` 与 `raid:signup_removed { user_id }`。
- 返回 `{"ok": True}`。

### 4.6 占位强制（`fill_slot`）

在既有 `_can_edit`（锁定拦截）之后、占位逻辑之前：

```python
if not user.is_admin and not raid.locked:
    signed = db.query(RaidSignup).filter(raid_id==rid, user_id==user.id).first()
    if signed is None:
        raise HTTPException(403, "请先报名再占位")
```

- `remove_slot` / `change_duty` 无需额外校验：报名取消会撤占位，非报名用户不可能持有自身占位。

## 5. WebSocket 事件

新增事件类型，走现有 `manager.broadcast(rid, {...})`：

- `raid:signup`：`{ type, user: UserOut, created_at }`
- `raid:signup_removed`：`{ type, user_id }`

## 6. 前端

### 6.1 `frontend/src/types.ts`

- `Raid` 增加 `signups: RaidSignup[]`。
- 新增 `RaidSignup = { user: User; created_at: string | null }`。
- `RaidListItem` 增加 `signup_count: number`、`my_signed_up: boolean`。

### 6.2 `frontend/src/stores/raid.ts`

`applyEvent` 增加：

- `raid:signup`：`raid.signups` 去重追加（按 user_id 去重）。
- `raid:signup_removed`：过滤掉 `user_id` 匹配项。

### 6.3 `RaidListView.vue`

- 卡片 meta 追加 `已报名 {{ r.signup_count }} 人`。
- 按钮显隐：
  - 非管理员 & 未锁定 & `!r.my_signed_up` → 「报名」按钮，点击 `POST /api/raids/{rid}/signup`，成功后 `load()`。
  - 非管理员 & 未锁定 & `r.my_signed_up` → 禁用的「已报名」徽标。
  - 管理员或已锁定 → 不显示。

### 6.4 `RaidDetailView.vue`

- 顶部新增「已报名」面板：管理员固定第一行（`created_at` 为 null，标记「管理员」），后列报名用户；每行 `UserAvatar` + 昵称。
  - 当前用户为管理员 → 每个非管理员行「取消报名」按钮（`confirmDialog` 后 `DELETE /api/raids/{rid}/signups/{user_id}`）。
  - 当前用户为本人（非管理员）且未锁定 → 该行「取消报名」按钮（`DELETE /api/raids/{rid}/signup`）。
- 未报名 & 未锁定 & 非管理员 → 面板给「报名」按钮。
- **占位询问**：`onPick` 中，若非管理员 & 未报名 & 未锁定 → `confirmDialog('你还没有报名本次攻坚，是否先报名？')`；确认 → 先 `POST /api/raids/{rid}/signup` 并 `load()`，再打开选人弹窗；取消 → 不打开。
- 传给 `CharacterPickerModal` 的 `signupUserIds` 由 `store.raid.signups.map(s => s.user.id)` 计算。

### 6.5 `CharacterPickerModal.vue`

- 新增 prop `signupUserIds: number[]`（默认 `[]`）。
- 管理员模式过滤：`players.filter(p => p.user.id === auth.user.id || signupUserIds.includes(p.user.id))`。
- 过滤后为空 → 显示「还没有人报名」。

## 7. 测试

### 后端 `backend/tests/test_raid_signup.py`（新增）

沿用 `conftest.py` 既有 fixture。用例：

- 报名成功：非管理员、未锁定 → `{"ok": True}`，`raid_signups` 有行。
- 管理员报名 → 400「管理员无需报名」。
- 锁定报名 → 400「攻坚已锁定，无法报名」。
- 重复报名 → 400「你已报名」。
- 自行取消：未锁定 → 撤下该用户占位 + 报名行删除；锁定 → 403。
- 管理员取消他人：删除报名行 + 撤占位；锁定状态也可操作；未报名 → 400。
- `fill_slot`：非管理员未报名 → 403「请先报名再占位」；报名后 → 成功。
- 列表：含 `signup_count`、`my_signed_up`。
- 详情：`signups` 管理员在首位。

### 前端

- `RaidListView.spec.ts`：报名按钮显隐 / 人数展示断言。
- `stores/raid.spec.ts`：`applyEvent` 的 `raid:signup` / `raid:signup_removed` 增量更新。

## 8. 文档

- `CHANGELOG.md` [Unreleased] → 新增：攻坚报名（列表报名/自行取消/管理员取消/占位强校验）。
- 根 `README.md`：如必要在功能清单补一句（报名为普通前端/API 功能，机器人 API 表不变）。

## 9. 变更文件范围

- `backend/app/models.py` — 新增 `RaidSignup`
- `backend/app/schemas.py` — 新增 `RaidSignupOut`；扩展 `RaidListItem` / `RaidDetail`
- `backend/app/routers/raids.py` — 新增 3 个报名端点、`_detail`/列表补字段、`fill_slot` 强制校验
- `backend/tests/test_raid_signup.py` — 新增
- `frontend/src/types.ts` — `Raid` / `RaidListItem` / `RaidSignup`
- `frontend/src/stores/raid.ts` — WS 事件处理
- `frontend/src/views/RaidListView.vue` — 报名按钮 / 人数
- `frontend/src/views/RaidDetailView.vue` — 已报名面板 / 占位询问 / 取消
- `frontend/src/components/CharacterPickerModal.vue` — `signupUserIds` 过滤
- `frontend/src/views/RaidListView.spec.ts` — 报名按钮断言
- `frontend/src/stores/raid.spec.ts` — WS 事件用例
- `CHANGELOG.md` — [Unreleased] 新增
