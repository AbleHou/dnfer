# 攻坚关闭（快照归档）— 设计规格

日期：2026-10-16
状态：已确认
需求来源：用户口述——攻坚记录目前是「活引用」（占位格/报名行只存 `character_id`，角色属性实时取 `characters` 表当前值），玩家事后改角色会追溯影响所有引用它的攻坚，影响面过大。希望管理员增加「关闭」功能：关闭后查看详情即查看**关闭瞬间的快照**；关闭不可逆；以此缓解角色变更影响面。

已确认的决策：
- **快照形态**：JSON 快照 blob——关闭时把整场详情序列化成一个 JSON 存到 `raids.snapshot` 新列，查看关闭攻坚直接返回快照渲染；零新增表。
- **冻结边界**：完全冻结 + 可删除——关闭后所有写操作拒绝（占位/报名/勾选/波次/锁定/并行/投票无关），WS 停止推送，编队入口隐藏；仅能查看快照与删除攻坚；列表仍显示（可回看历史）。
- **live 数据清理**：关闭瞬间写入快照后**删除该攻坚的占位格/报名行**，释放角色引用——玩家可自由删/改角色，不会与 `delete_character_if_free` 全局守卫形成「已冻结无法撤下」死锁。
- **前置条件**：随时可关（管理员）+ 强确认（不可逆提示）；不强制先锁定（锁定仍用于编队期保护，关闭是独立终态操作）。

## 1. 目标

- 管理员可「关闭」一场攻坚：关闭瞬间冻结整场排表与参与角色信息为不可变快照。
- 关闭后攻坚详情 = 快照（显示关闭时的波/格/占位/角色属性/报名），不受后续角色编辑影响。
- 关闭不可逆；关闭后只读 + 可删除。
- 关闭后该攻坚不再「占用」任何角色引用，玩家可自由修改/删除角色。

**范围**：后端（`Raid.closed` + `Raid.snapshot` 列 + 迁移 + `POST /{rid}/close` + 读取分支 + 全部写端点冻结）+ 前端（类型 `closed` + 详情/列表/编队/WS 只读化 + 关闭按钮）。**不含**：历史攻坚的跨攻坚统计/导出、关闭攻坚的再编辑/再开启、角色版本化（活引用模型保持）。

## 2. 数据模型与迁移

### 2.1 `raids` 新列

- `Raid.closed: Mapped[bool] = mapped_column(Boolean, default=False)`：True = 已关闭（终态）。
- `Raid.snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)`：关闭时冻结的详情 JSON。

### 2.2 迁移 `migrate_raid_close`（幂等，挂到 `init_db()`）

对齐 `migrate_users_guest`/`migrate_users_ban` 模式：

1. `raids` 缺 `closed` 列 → `ALTER TABLE raids ADD COLUMN closed BOOLEAN NOT NULL DEFAULT 0`；
2. `raids` 缺 `snapshot` 列 → `ALTER TABLE raids ADD COLUMN snapshot JSON`（SQLite 存 TEXT，SQLAlchemy JSON 自动序列化，对齐 `raid_slack_rules.rules`）；
3. 幂等：二次运行列已存在，空转。

### 2.3 快照内容

`snapshot = _detail(db, raid).model_dump(mode="json")`——自包含的冻结 `RaidDetail`。

> **必须 `mode="json"`**：`_detail(...).model_dump()` 会产出 `datetime` 对象（`starts_at`、各报名行 `created_at`），SQLAlchemy `JSON` 列在 SQLite 上无法序列化 datetime，会 `TypeError: Object of type datetime is not JSON serializable`——每次关闭都 500。`mode="json"` 序列化为 ISO 字符串；读取重建时由 pydantic 反序列化回 datetime。

- `waves`：每波 `index/group_id/round_index/group_index/slots`；每格 `squad_index/row_index/duty/version` + **占位角色的全部展示属性**（`character_id/character_name/character_class/job_name/job_title/owner_nickname/owner_avatar/fame 等战力/duty/adventure_party_id/adventure_party_name`）；
- `signups`：每报名行 `user`（UserOut）+ `created_at` + **该用户勾选角色的全部属性**（CharacterOut）；
- 副本/规模/发起时间/`slack_rules`。

即详情页渲染所需的全部，读取关闭攻坚时直接 `model_validate` 重建。

## 3. 后端 API

### 3.1 schemas.py

- `RaidDetail` 加 `closed: bool = False`（带默认值防中间态 500）。
- `RaidListItem` 加 `closed: bool = False`。

### 3.2 `POST /api/raids/{rid}/close`（admin，`require_admin`）

流程：
1. 守卫：`raid.closed` 已 True → 400「攻坚已关闭」；`admin.is_banned` → 403（对齐 create_raid 封禁拦截）。
2. **先**取快照：`raid.snapshot = _detail(db, raid).model_dump(mode="json")`（含团长固定行与全部占位，此刻为最新）。
3. `raid.closed = True`。
4. 清理 live 行（bulk delete，`synchronize_session=False`）：
   - 该 raid 全部 `Slot`（`Slot.wave.has(raid_id=raid.id)`）；
   - 该 raid 全部 `Wave`；
   - 该 raid 全部 `RaidSignupCharacter`（`signup_id in (该 raid 报名行 id)`）→ 再删 `RaidSignup`（bulk delete 不走 ORM 级联，须先删 join 行）。
   - 顺序确保无 FK 悬挂；删除后角色引用全部释放。
5. commit；`await manager.broadcast(rid, {"type": "raid:closed"})`。
6. 返回冻结 `RaidDetail`（`closed: True`）。

### 3.3 读取路径分支

- 新增共享助手 `_read_detail(db, raid) -> RaidDetail`：`raid.closed` → `RaidDetail.model_validate({**raid.snapshot, "id": raid.id, "closed": True})`；否则 `_detail(db, raid)`。
- `get_raid`（raids.py:204）改用 `_read_detail`。
- `_read_detail` 实现注意：`_detail` 构造的 `RaidDetail` **不含 `closed`**，故快照里存的 `"closed": false` 是自然结果——**不要在 `_detail` 里加 `closed`**（否则快照会存误导性的旧值），统一由 `_read_detail` 读取时覆盖 `closed: True`；可加防御 `raid.snapshot is None → 回退 _detail`（正常不触发）。
- `public.py` 三个读取端点统一改走快照分支——
  - `public_raid`（public.py:37）改走 `_read_detail`（关闭攻坚公开详情同样返回快照）；
  - `public_wave`（public.py:23）：closed → 由快照中对应 `index` 的波重建 `WaveOut`（关闭后 live `Wave` 行已删，不能查库）；
  - `public_raids`（public.py:13）：closed → `wave_count`/`signup_count` 从快照推导（同 `list_raids`），且 `RaidListItem.closed` 显式置 True（该处手工构造 item，别依赖默认值漏设）。
- `list_raids`（raids.py:175）：closed 攻坚的 `wave_count`/`signup_count`/`my_signed_up` 从快照推导——
  - `wave_count = len(snapshot["waves"])`；
  - `signup_count = 非团长报名行数 = sum(1 for s in snapshot["signups"] if s["created_at"] is not None)`；
  - `my_signed_up = any(s["user"]["id"] == user.id for s in snapshot["signups"]) or user.id == raid.created_by`；
  - 否则沿用现有 live 查询。
- 关闭后 `Raid.waves`/`Raid.signups` 为空，任何走 live 的读取都会退化，故统一经 `_read_detail`/快照推导。

### 3.4 冻结：全部写操作拒绝

新增 `_reject_if_closed(raid)` → `HTTPException(400, "攻坚已关闭，无法操作")`。插入以下端点（都在解析 raid 后、业务逻辑前）：

- `raids.py`：`fill_slot / remove_slot / move_slot / change_duty / add_wave / delete_wave / parallelize_wave / unparallelize_wave / lock_raid / unlock_raid / set_slack_rules / signup / add_signup_character / remove_signup_character / cancel_self / cancel_other / admin_signup / update_raid`——`update_raid`（PUT `/{rid}`）尤其必须拦：它改 live 的 `name/starts_at` 且返回 `_detail`（closed 后 live 波为空），会让列表与详情不一致；
- `bot.py`：`bot_signup / bot_cancel_signup`（对齐 raid 冻结语义）；
- 其余 admin 端点（创建/删除 raid、`GET` 类）不受影响；`DELETE /{rid}`（删除攻坚）对已关闭攻坚**仍允许**（含快照一并删除）。

### 3.5 WS

- 关闭是终态：清理 live 行后无写事件来源；`raid:closed` 广播后房间不再有有效事件。
- 前端对 closed 攻坚**不建立 WS 订阅**（见 §4）。

## 4. 前端

- `types.ts`：`Raid` 与 `RaidListItem` 加必填 `closed: boolean` → **连带修所有字面量 fixture**（RaidList/RaidDetail/各 spec，以 `npm run build` 的 vue-tsc 为准）。
- **WS `applyEvent`（stores/raid.ts）**：事件类型联合与 `applyEvent` 增加 `raid:closed` 分支——已打开的详情/编队页收到后触发 reload（或直接置 `closed` 只读态）并 `disconnect()` 断开已订阅 socket（关闭后无事件，别留悬挂连接），避免停留在「开放」UI。
- **成员角色弹框**：关闭攻坚详情页的成员头像点击（`MemberCharactersModal`，fetch `/api/raids/{rid}/signups/{user_id}/characters`）对 live 报名行已删的 closed 攻坚会 404（且团长短路正常→不一致）。**closed 时隐藏头像点击/不打开成员弹框**——成员及其勾选角色已直接展示在快照报名面板里，无需再弹框。
- **详情页（RaidDetailView）**：`raid.closed` 为真时——
  - 顶部显示「已关闭」徽章；
  - 隐藏全部编辑入口：报名/管理角色/取消报名/「＋」选人面板/临时选手/锁定·解锁/编队按钮/波次操作/并行/修改攻坚；
  - 网格只读展示快照（复用现有 WaveSection 展示，`canEdit` 相关控制隐去）；
  - 不连接 WS（`connectRaidWs` 跳过）。
- **列表页（RaidListView）**：`closed` → 灰显「已关闭」徽章；报名按钮不显示（已关闭不可报名）；管理员「删除」仍显示（可清理历史攻坚）。
- **编队页（RosterView）**：`canEdit` 由 `auth.isAdmin` 改为 `auth.isAdmin && !raid.closed`，且 closed 时不连接 WS；详情页对 closed 不提供编队入口；直链进入显示只读提示（后端 400 兜底）。
- **关闭按钮**：详情页管理员区「关闭攻坚」，强 confirmDialog（内容强调不可逆，如「关闭后攻坚将永久冻结为快照且无法再打开，确认？」）。
- 其余页面（AdminUsersView 等）不受影响。

## 5. 约束与边界

- 关闭**不可逆**：无 reopen 端点；误操作靠强确认兜底。
- 关闭后只读 + 可删除：写操作一律 400「攻坚已关闭，无法操作」。
- 关闭后角色引用释放：占位格/报名行删除 → `delete_character_if_free` 不再拦截曾在该攻坚用过的角色。
- 关闭不影响其他攻坚（跨 raid 独立性保持）；一个角色可在多个开放/关闭攻坚中「共存」。
- 存量攻坚无快照（`snapshot` 为 NULL），直到管理员关闭那一刻才生成——不回填。
- `RaidDetail`/`RaidListItem` 的 `closed` 带默认值，避免既有调用/中间态 500。
- 已关闭攻坚的 `Raid.waves`/`Raid.signups` 为空，读取一律走快照，不依赖 live 行。

## 6. 测试

### 后端（`backend/tests/`）

- **关闭生成快照**：关闭 → 返回 `closed: True` 且 waves/signups 完整；随后改角色属性（改名/改战力）→ GET 详情仍显示关闭时快照值。
- **不可逆**：重复关闭 400「攻坚已关闭」；关闭后无 reopen 端点。
- **live 清理**：关闭后 GET 详情正常（走快照）；`RaidSignup`/`Slot` 行已删；**该角色可被删除**（`delete_character_if_free` 不拦截）——验证无死锁。
- **冻结**：关闭后对每个写端点（fill/remove/move/duty/update_raid/waves/parallel/lock/unlock/slack/signup/cancel/admin_signup/bot_signup）逐一断言 400「攻坚已关闭，无法操作」。
- **列表推导**：关闭后列表 `wave_count`/`signup_count`/`my_signed_up` 来自快照；非参与者视角 `my_signed_up` 为 false。
- **迁移**：`migrate_raid_close` 幂等（老库 ALTER + 二次空转）。
- **广播**：关闭广播 `raid:closed`。

### 前端

- `types` fixture 补 `closed`（vue-tsc 为准）。
- 详情页：closed 显示「已关闭」徽章、隐藏编辑入口、不连 WS。
- 列表页：closed 灰显「已关闭」徽章、无报名按钮、管理员仍可删除。
- 编队页：closed 时 `canEdit` 为 false、不连 WS。
- `applyEvent`：`raid:closed` 事件触发 reload。
- 关闭按钮：确认流（confirmDialog → `POST /close` → 刷新）。

## 7. 非目标 / 后续

- 已关闭攻坚的跨攻坚统计/导出。
- 关闭攻坚的再编辑/再开启（明确不做，单向终态）。
- 字符属性版本化/生效日期（活引用模型保持，靠关闭快照缓解影响面）。
- 关闭的自动触发（按 `starts_at` 过期自动关闭等）——需时再议。
