# DNfer 攻坚报名 — 设计规格

日期：2026-09-22
状态：已确认
上游：`2026-09-16-dnfer-raid-scheduler-design.md`（既有攻坚排表核心，Raid/Wave/Slot 模型）与 `2026-09-20-admin-position-adjust-design.md`（管理员排表交互范式）
需求来源：用户口头需求——攻坚列表新增「报名」按钮，报名后才可被管理员排表；未报名用户在占位时询问是否报名；详情页显示已报名用户，管理员可取消报名。

## 1. 目标

为攻坚系统引入「报名」机制：普通用户需报名某次攻坚，管理员排表时才能选择到该用户的角色；发起攻坚的团长（`raid.created_by`）默认参加（无需报名）；详情页展示已报名列表并支持取消。

已确认的约束与决策：

- **新增独立表 `raid_signups`**（raid_id + user_id 唯一），`Base.metadata.create_all` 自动建表，无 ALTER 迁移。
- **仅未锁定（`locked=False`）的攻坚可报名**；锁定后不可报名、不可自行取消（管理员取消他人不受锁定限制）。
- **团长（`raid.created_by`）默认参加**：固定显示在已报名列表首位（`created_at=None`）、始终可被排表、`fill_slot` 免报名校验。**其他用户（含非团长的管理员，若有）一律需报名才能被排表**——「无需报名」的特权仅授予团长一人。
- **管理员排表可选范围收窄**：选人面板（CharacterPickerModal 管理员模式）只显示「团长 ∪ 已报名用户」。
- **取消报名时自动撤下该用户全部占位**（清空所有波次中该用户的格子）。
- **允许自行取消**：未锁定时用户可取消自己的报名（同样撤下自身占位）。
- **占位询问**：非管理员用户进入详情页并尝试放置自己角色（此时本人未报名）时，先询问是否报名，确认后才打开选人弹窗；管理员放置他人角色不触发（由后端 403 兜底，见 §4.6）。
- 后端 `fill_slot` 强制校验「被放置角色的用户必须已报名或为团长 → 否则 403」，前端询问仅是 UX 增强，规则单一可靠。

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
    raid: Mapped[Raid] = relationship(back_populates="signups")
    user: Mapped[User] = relationship()
```

并在 `Raid` 模型补反向关系（**必须**带级联，否则删除攻坚时 `raid_signups` 残留引用触发外键约束报错——`db.py` 已启用 `PRAGMA foreign_keys=ON`）：

```python
class Raid(Base):
    ...
    signups: Mapped[list["RaidSignup"]] = relationship(
        back_populates="raid", cascade="all, delete-orphan")
```

- `init_db()` 的 `Base.metadata.create_all(bind=engine)` 会在启动时自动建新表，无需新增迁移函数。

## 3. Schema 变更（`backend/app/schemas.py`）

```python
class RaidSignupOut(BaseModel):
    user: UserOut
    created_at: datetime | None   # 团长固定行（无真实报名记录）为 None
```

- `RaidListItem` 增加：`signup_count: int`、`my_signed_up: bool`（**后端计算**：列表项不含 `signups` 数组，无法前端推导）。`signup_count` = `raid_signups` 行数，**不含团长**（团长无报名行）。
- `RaidDetail` 增加：`signups: list[RaidSignupOut]`（团长固定首位，`created_at=None`，后跟已报名用户，按报名时间升序）。
- `RaidDetail` 上的 `my_signed_up` 与 `signup_open` **前端推导**：`my_signed_up = signups.some(s => s.user.id === 当前用户)`（团长恒为 true），`signup_open = !locked`，不新增后端字段。

## 4. 后端接口（`backend/app/routers/raids.py`）

### 4.1 列表 `GET /api/raids`

`RaidListItem` 补 `signup_count`（`raid_signups` 行数，不含团长）与 `my_signed_up`（当前用户 `== raid.created_by` **或**有报名行）。

### 4.2 详情 `GET /api/raids/{rid}`

`_detail` 补 `signups`：团长（`raid.created_by` 对应用户）固定第一项（`created_at=None`），再按报名时间升序排其余报名者（团长若在报名行中出现属数据异常，查询时按其 id 过滤排除，防御性处理）。报名行取 `db.query(RaidSignup).filter(raid_id==rid, user_id != raid.created_by).order_by(created_at)` 并 `selectinload` 用户。

### 4.3 报名 `POST /api/raids/{rid}/signup`

- 鉴权：`get_current_user`。
- `user.id == raid.created_by` → `400 "团长无需报名"`。
- `raid.locked` → `400 "攻坚已锁定，无法报名"`。
- 已存在报名行 → `400 "你已报名"`。
- 新增报名行，`commit`，广播 `raid:signup { user, created_at }`。
- 返回 `{"ok": True}`。

### 4.4 自行取消 `DELETE /api/raids/{rid}/signup`

- 鉴权：`get_current_user`。
- `raid.locked` → `403 "攻坚已锁定，无法取消报名"`（任何角色一致；团长无报名行，走下一分支）。
- 无报名行 → `400 "你尚未报名"`。
- 删除报名行；撤下该用户全部占位（所有波次中 `character.owner.user_id == user.id` 的格子逐个 `_clear_slot`）；广播 `slot:removed` 与 `raid:signup_removed { user_id }`。
- 返回 `{"ok": True}`。

### 4.5 管理员取消他人 `DELETE /api/raids/{rid}/signups/{user_id}`

- 鉴权：`require_admin`（锁定状态下也可操作）。
- 目标用户无报名行 → `400 "该用户尚未报名"`。
- 删除报名行；撤下该用户全部占位；广播 `slot:removed` 与 `raid:signup_removed { user_id }`。
- 返回 `{"ok": True}`。

### 4.6 占位强制（`fill_slot`）

**参与判定（唯一规则，对所有人一致）**：一个用户「参与」本场攻坚 ⇔ 他是团长（`id == raid.created_by`）或存在报名行。`fill_slot` 中**被放置角色的主人必须参与**，否则 403。在既有 `_can_edit`（锁定拦截）之后、占位逻辑之前校验：

```python
def _participates(db, rid, user_id, raid) -> bool:
    if user_id == raid.created_by:
        return True
    return db.query(RaidSignup).filter(raid_id==rid, user_id==user_id).first() is not None

if not _participates(db, rid, char.user_id, raid):
    raise HTTPException(403, "请先报名再占位")  # 普通用户放自己：本人未报名
    # 管理员放他人：该用户未报名，文案可由前端/后端按场景区分，见下
```

- 错误文案区分：普通用户放置自己的角色且本人未报名 → `403 "请先报名再占位"`；管理员放置他人的角色且该用户未报名 → `403 "该用户未报名，无法排表"`。两者都基于同一 `_participates` 判定，仅文案不同。
- 既有「非管理员只能放自己的角色」（`char.user_id != user.id → 400`）与「同波同玩家 / 角色去重」规则保持不变。
- `remove_slot` / `change_duty` 无需额外校验：报名取消会撤占位。注意：本功能上线前已存在的历史占位可能由从未报名的用户持有，这类用户仍可自行管理自己的旧格子（`remove_slot`/`change_duty` 的既有 `_can_edit` 与归属校验已覆盖），不要把「非报名用户不可能持有占位」当作必须防御的硬不变量。`move_slot`（管理员）仅移动已占位角色，其主人必然已参与，无需新校验。

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

- 在文件顶部 `WsEvent` 类型联合中新增 `raid:signup` / `raid:signup_removed` 两种事件。
- `applyEvent` 增加：
  - `raid:signup`：`raid.signups` 去重追加（按 user_id 去重）。
  - `raid:signup_removed`：过滤掉 `user_id` 匹配项。

### 6.3 `RaidListView.vue`

- 卡片 meta 追加 `已报名 {{ r.signup_count }} 人`。
- 按钮显隐（`my_signed_up` 对团长恒为 true，天然覆盖「团长不显示按钮」）：
  - 未锁定 & `!r.my_signed_up` → 「报名」按钮，点击 `POST /api/raids/{rid}/signup`，成功后 `load()`。
  - 未锁定 & `r.my_signed_up` → 禁用的「已报名」徽标。
  - 已锁定 → 不显示。

### 6.4 `RaidDetailView.vue`

- 顶部新增「已报名」面板：团长固定第一行（`created_at` 为 null，标记「团长」），后列报名用户；每行 `UserAvatar` + 昵称。
  - 当前用户为管理员 → 每个非团长行「取消报名」按钮（`confirmDialog` 后 `DELETE /api/raids/{rid}/signups/{user_id}`）。
  - 当前用户为本人（非团长）且未锁定 → 该行「取消报名」按钮（`DELETE /api/raids/{rid}/signup`）。
- 未锁定 & 未报名（`my_signed_up` 为 false，团长恒为 true 不触发）→ 面板给「报名」按钮，点击 `POST /api/raids/{rid}/signup`，成功后 `load()`。
- 取消报名成功后除依赖 WS 事件外，**再触发一次 `load()`** 全量刷新：既有 `applyEvent` 的 `slot:removed` 处理不会清 `owner_avatar`（存量小缺陷），全量刷新可保证被撤占位的格子头像也清干净。
- **占位询问**：`onPick` 中，仅当 `!auth.isAdmin && 未报名 && 未锁定`（非管理员放置自己的角色，管理员放他人不触发）→ `confirmDialog('你还没有报名本次攻坚，是否先报名？')`；确认 → 先 `POST /api/raids/{rid}/signup` 并 `load()`，再打开选人弹窗；取消 → 不打开。
- 传给 `CharacterPickerModal` 的 `signupUserIds` 由 `store.raid.signups.map(s => s.user.id)` 计算。
- 注意口径：列表的「已报名 N 人」（`signup_count`，不含团长）与详情面板的行数（含团长固定行）**天然差 1**，属设计使然；详情面板不另显示计数，避免对不上的困惑。

### 6.5 `CharacterPickerModal.vue`

- 新增 prop `signupUserIds: number[]`（默认 `[]`）。父级（RaidDetailView）传入 `store.raid.signups.map(s => s.user.id)`——**已包含团长**（`signups` 固定首位），因此该集合即「团长 ∪ 已报名用户」。
- 管理员模式过滤：`players.filter(p => signupUserIds.includes(p.user.id))`——即「团长 ∪ 已报名用户」。**不含未报名的非团长管理员**（与后端「仅团长豁免」的参与规则一致；若某非团长管理员报名了，自然包含）。
- 过滤后为空 → 显示「还没有人报名」。

## 7. 测试

### 后端 `backend/tests/test_raid_signup.py`（新增）

沿用 `conftest.py` 既有 fixture。用例：

- 报名成功：普通用户、未锁定 → `{"ok": True}`，`raid_signups` 有行。
- 团长报名 → 400「团长无需报名」。
- 锁定报名 → 400「攻坚已锁定，无法报名」。
- 重复报名 → 400「你已报名」。
- 非团长管理员报名 → 允许（与普通用户一致）。
- 自行取消：未锁定 → 撤下该用户占位 + 报名行删除；锁定 → 403。
- 管理员取消他人：删除报名行 + 撤占位；锁定状态也可操作；未报名 → 400。
- `fill_slot`：普通用户未报名 → 403「请先报名再占位」；报名后 → 成功。
- `fill_slot`：管理员放**未报名**用户角色 → 403「该用户未报名，无法排表」；放团长角色 → 成功。
- `fill_slot`：非团长管理员（未报名）放置自己角色 → 403「请先报名再占位」；报名后 → 成功（团长恒可自放）。
- **删除带报名的攻坚 → 成功**（`raid_signups` 级联清理）。**前提：`conftest.py` 的测试引擎需启用 `PRAGMA foreign_keys=ON`**（当前 `conftest.py` 自建 `sqlite://` 引擎未挂 `db.py` 的事件监听，SQLite 默认不查外键，测试将失去对级联的验证意义）——为 `conftest.py` 的引擎补与 `db.py` 一致的外键 pragma，再断言删除后 `raid_signups` 无残留行。
- 列表：含 `signup_count`、`my_signed_up`（团长为 true）。
- 详情：`signups` 团长在首位。

### 前端

- `RaidListView.spec.ts`：报名按钮显隐 / 人数展示断言。
- `stores/raid.spec.ts`：`applyEvent` 的 `raid:signup` / `raid:signup_removed` 增量更新。

## 8. 文档

- `CHANGELOG.md` [Unreleased] → 新增：攻坚报名（列表报名/自行取消/管理员取消/占位强校验）。
- 根 `README.md`：如必要在功能清单补一句（报名为普通前端/API 功能，机器人 API 表不变）。

## 9. 变更文件范围

- `backend/app/models.py` — 新增 `RaidSignup`；`Raid` 补 `signups` 关系（`cascade="all, delete-orphan"`，保证删团时级联清理）
- `backend/app/schemas.py` — 新增 `RaidSignupOut`；扩展 `RaidListItem` / `RaidDetail`
- `backend/app/routers/raids.py` — 新增 3 个报名端点、`_detail`/列表补字段、`fill_slot` 强制校验
- `backend/app/routers/public.py` — `public_raids` 直接构造 `RaidListItem`，补 `signup_count=0`、`my_signed_up=False`（公开列表无用户上下文）
- `backend/tests/test_raid_signup.py` — 新增
- `backend/tests/conftest.py` — 测试引擎补 `PRAGMA foreign_keys=ON`（让删除级联测试有验证意义）
- `frontend/src/types.ts` — `Raid` / `RaidListItem` / `RaidSignup`
- `frontend/src/stores/raid.ts` — WS 事件处理
- `frontend/src/views/RaidListView.vue` — 报名按钮 / 人数
- `frontend/src/views/RaidDetailView.vue` — 已报名面板 / 占位询问 / 取消
- `frontend/src/components/CharacterPickerModal.vue` — `signupUserIds` 过滤
- `frontend/src/views/RaidListView.spec.ts` — 报名按钮断言
- `frontend/src/stores/raid.spec.ts` — WS 事件用例
- `CHANGELOG.md` — [Unreleased] 新增
