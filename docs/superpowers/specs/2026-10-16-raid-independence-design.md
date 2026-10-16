# 攻坚互不影响 + 报名强制选角色 — 设计规格

日期：2026-10-16
状态：已确认
需求来源：用户口述——同一角色现在被「全局唯一占位」限制，只能同时在一个攻坚里占格；但攻坚之间本就相互独立（早上一场、下午一场，同一角色都能打），系统不应感知、也不应负责跨攻坚的角色重复。锁定功能保护的是管理员编队成果，而非靠全局唯一兜底。为方便管理员编队，报名时强制弹出角色选择框（默认全选），由用户自己控制本场上哪些角色；用户勾选了重复角色，责任在用户。

已确认的决策：
- **去掉「一个角色全局只能占一个格子」**，改为 **raid 内唯一**（`fill_slot` 的 `char_dup` 查询限定本 raid）——跨攻坚占位共存，攻坚之间互不影响；
- **raid 内保留「一场一格」**：同一攻坚内一个角色仍只能占一个格子（跨波也不行，wave1 放、wave2 再放会撤 wave1），RosterView 置灰/推荐/计数逻辑零改动；
- **报名强制选角色**覆盖 web 全部自助/代报名入口：RaidListView、RaidDetailView（已有弹框）、admin 代报名（SignupMemberPicker 选人后加选角色步骤）；**仅机器人 skill 与编队页 guest 代报名默认全选**；
- **锁定语义**：跨攻坚不再撤格后，锁定攻坚的排表不会被任何其他攻坚的操作改动，天然满足「锁定=保护管理员编队成果」；
- WS 广播方向 bug 被顺带消除（`removed` 格子从此只可能属于本 raid，广播到 `rid` 即正确，无需单独改代码）。

## 1. 目标

- 同一角色可在多个攻坚中同时占位（各攻坚排表相互独立，系统不感知跨攻坚重复）。
- 报名/代报名时由用户（或代报名的管理员）显式勾选本场要上场的角色，默认全选；选空拦截。
- 锁定攻坚的排表不受任何其他攻坚操作影响。

**范围**：后端（`fill_slot` 两处全局查询限定 raid + `SignupUserIn` 加 `character_ids` + `admin_signup` 透传）+ 前端（RaidListView 复用 SignupModal + SignupMemberPicker 加选角色步骤）。**不含**：机器人 skill 改动（保持默认全选）、编队页 guest 代报名改动（保持默认全选）、跨攻坚重复检测/告警（明确不做，责任在用户）、数据迁移（当前全局唯一已保证不存在跨攻坚重复存量数据）。

## 2. 后端改动

### 2.1 `routers/raids.py` — `fill_slot` 全局去重改为 raid 内去重

两处全局查询加上 `Slot.wave.has(raid_id=raid.id)` 过滤：

- **replace 分支**（现 raids.py:383-384）：
  ```python
  char_dup = db.query(Slot).filter(
      Slot.wave.has(raid_id=raid.id),          # 新增：限定本 raid
      Slot.character_id == char.id,
      Slot.id != slot.id).all()
  ```
- **非 replace 分支**（现 raids.py:396-397）：`dup` 查询同样加 `Slot.wave.has(raid_id=raid.id)`。

`Slot.wave.has(raid_id=...)` 沿用 `_remove_signup`/`remove_signup_character` 既有的多对一关系过滤写法。

不改动：`same_owner` 同轮限一规则（本就按 `_round_wave_ids` 限定本 raid 轮次）；`_validate_one_char_per_round`；`_raise_if_hard`。

效果：
- 跨攻坚：b 填 role1 不再撤 a 的 role1，两场共存；
- raid 内：wave1 放 role1、wave2 再放 → `char_dup` 命中同 raid 格子 → replace 仍撤 wave1；非 replace 仍 400「该角色已在其他格子中」（语义收窄为本 raid）；
- `removed` 集合只含本 raid 格子 → 第 428-429 行 `broadcast(rid, ...)` 方向正确。

### 2.2 `schemas.py` + `routers/raids.py` — admin 代报名支持选角色

- `SignupUserIn`（现 schemas.py:142-143）加字段：
  ```python
  class SignupUserIn(BaseModel):
      user_id: int
      character_ids: list[int] | None = None   # None=默认全部角色
  ```
- `admin_signup`（现 raids.py:722）：`_signup_user(db, raid, target, body.character_ids)` 透传（原为 `None`）。

向后兼容：不传 `character_ids` 的旧调用（如 guest 代报名、RosterView guest 流、机器人侧）仍默认全选，`_signup_user` 的 None→全部、空列表→400「至少选择一个角色」逻辑不变。

## 3. 前端改动

### 3.1 RaidListView — 报名改为强制弹框

- 新增 `signupTarget = ref<RaidListItem | null>(null)`，`onSignup(r)` 改为 `signupTarget.value = r`（打开弹框），不再直接 POST。
- 模板引入复用 `SignupModal`（mode='signup'，内部 `GET /api/me/characters` + 默认全选，本组件已有）；`:open` 绑定 `!!signupTarget`、`:selected-ids="[]"`，`@close` 清 `signupTarget`，`@submit` → `POST /api/raids/{signupTarget.id}/signup { character_ids: ids }` → `notifySuccess('报名成功')` → `load()`。
- 角色数为 0 时 SignupModal 显示「还没有角色」空态，无法提交（与详情页一致）。

### 3.2 SignupMemberPicker — 选人后加选角色步骤

- `onPick(u)` 不再直接 confirm+POST，改为记录 `pickUser = u` 并打开一个选角色弹框。
- 选角色弹框：复用 `SignupModal` 的样式/交互但改为 admin 模式——`fetch GET /api/admin/users/{uid}/characters`（admin.py:176 `list_user_characters`，返回 `list[CharacterOut]`，对未报名用户也有效），默认全选；提交 `POST /api/raids/{rid}/signups { user_id, character_ids }`。
- 实现取舍：`SignupModal` 内部固定请求 `/api/me/characters`，admin 代报名需按目标用户拉角色——方案为给 `SignupModal` 增加可选 `charactersUrl` prop（默认 `/api/me/characters`），SignupMemberPicker 传 `/api/admin/users/{uid}/characters`，选中态默认全选逻辑复用；不新增组件。
- 移除原有的「确认帮 XX 报名？」confirmDialog（选角色弹框即确认动作）。

### 3.3 保持默认全选（零改动）

- RosterView guest 代报名（`onGuestCreated` → `POST /signups { user_id }`）：guest 刚在创建弹窗填好角色，代报名全部角色，不弹框。
- 机器人 skill `bot_signup`：保持现行为（skill 传 character_ids 或默认全部），本次不动。
- RaidDetailView：SignupModal 已有（mode='signup' 默认全选），`onSignupSubmit` 已传 character_ids，不动。

## 4. 约束与边界

- 攻坚之间完全独立：不感知、不检测、不负责跨攻坚的角色重复；用户勾选了重复角色，责任在用户。
- raid 内「一场一格」保留：同一攻坚内同一角色只能占一个格子（跨波也限），同轮同玩家限一保留。
- 锁定语义不变（代码零改动）：锁定后非 admin 不能在本 raid 填/删/改职责，锁定后不能报名/取消报名/改勾选；跨攻坚不再撤格后锁定排表天然不被外部改动。
- `SignupUserIn` 加可选字段向后兼容，旧客户端/机器人不受影响。
- 无需数据迁移：当前全局唯一保证不存在「同一角色已占两个 raid」的存量数据。

## 5. 测试

### 后端（`backend/tests/test_raids.py`）

- **跨攻坚共存（新）**：raid a 填 role1 → 建 raid b、填同一 role1 → 两场 detail 均显示 role1 占位，a 的格子不被撤（回归「全局唯一」旧行为的反例）。
- **非 replace 跨攻坚（新）**：raid a 已占 role1，raid b 非 replace 填 role1 → 200（不再 400「该角色已在其他格子中」）。
- **raid 内回归（现有用例不回归）**：`test_fill_replace_moves_conflicting_slot`（同波同玩家换角色）、`test_fill_replace_moves_same_character`（同 raid 跨波移动同一角色）、非 replace「该角色已在其他格子中」400（同一 raid 内）。
- **admin_signup 带 character_ids（新）**：传子集 → 报名行只含这些角色；传空列表 → 400「至少选择一个角色」；不传 → 全部角色（回归）。

### 前端

- **RaidListView.spec**：点报名 → 弹出 SignupModal（mode='signup'）→ 提交带 `character_ids` 的 POST；取消不提交。
- **SignupMemberPicker.spec**：选人 → 选角色弹框（拉取 admin 用户角色、默认全选）→ 提交带 `{ user_id, character_ids }`；选空拦截。
- **SignupModal 增 prop 回归**：`charactersUrl` 默认 `/api/me/characters` 时行为不变。

## 6. 非目标 / 后续

- 跨攻坚重复角色检测/告警（明确不做：责任在用户，系统不感知）。
- 同一攻坚内同一角色跨波重复占位（保留「一场一格」，不放开）。
- 机器人 skill 的报名角色选择交互（保持默认全选）。
