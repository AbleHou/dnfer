# DNfer 攻坚详情增强 — 设计规格

日期：2026-09-23
状态：已确认
上游：`2026-09-22-raid-signup-design.md`（报名机制）、`2026-09-16-dnfer-raid-scheduler-design.md`（攻坚核心模型）
需求来源：用户口头需求 5 点——① 报名列表加号帮成员报名；② 攻坚时间/名字可改；③ 占位弹窗标记已占位角色；④ 点头像弹只读角色窗（带占位标识）；⑤ 报名面板左内边距。

## 1. 目标

在不改动现有报名/占位规则的前提下，增强攻坚详情页的协作体验：

- 管理员可替成员报名（加号，任意管理员，锁定后不可）。
- 攻坚的时间与名字可修改（管理员），WS 实时同步给详情页在线观众。
- 占位弹窗（CharacterPickerModal）与「查看成员角色」只读弹窗均以角标区分「已占位 / 未占位」角色，角标含占位位置（第 N 波 · 红队）。
- 报名面板左内边距加大，标题不再贴边框。

已确认的约束与决策：

- **帮报名**：任意管理员（`is_admin`）可用加号；攻坚锁定后加号不可用（与「锁定后不可报名」一致）；成员来源为**所有注册用户**（`GET /api/admin/users`），排除团长与已报名者；复用 `raid:signup` WS 事件。
- **改时间/名字**：仅管理员（沿用 `PUT /{rid}` 的 `require_admin`）；锁定后仍可改（现状如此，不新增锁定拦截）；改动通过 `raid:updated` WS 事件广播。
- **占位标记（第 3 点）**：已占位角色**仍可点选**，确认后走既有 `replace: true` 流程自动替换；角标文案「已占位 · 第N波 · 红队」（复用 `SQUAD_NAMES`）。
- **头像只读弹窗（第 4 点）**：所有登录用户可点报名者头像查看其角色与占位情况（**只读**，无选择无占位操作）；需新增「查看某参与者角色」端点；目标用户须为本场参与者（团长或已报名）才可查看。
- **占位信息前端推导**：弹窗内占位标记由前端从 `store.raid.waves` 计算（`buildPlacementMap`），后端不重复返回（避免 WS 时序导致占位信息滞后）。
- **第 5 点**：报名面板 `dnf-panel` 内联样式补 `padding:12px`（与 WaveSection 的 `padding:14px` 同级；该面板目前无内边距导致标题贴边）。

## 2. 后端接口（`backend/app/routers/raids.py`、`schemas.py`）

### 2.1 帮成员报名 `POST /api/raids/{rid}/signups`

- 鉴权：`require_admin`。
- body：`SignupUserIn { user_id: int }`（`schemas.py` 新增）。
- `raid.locked` → `400 "攻坚已锁定，无法报名"`。
- `user_id == raid.created_by` → `400 "团长无需报名"`。
- 已存在报名行 → `400 "该用户已报名"`。
- 新增 `RaidSignup`，`commit`；`IntegrityError` 兜底（并发重复报名）→ 回滚 + `400 "该用户已报名"`。
- 广播 `raid:signup { user: UserOut, created_at: <iso> }`（created_at 需 `.isoformat()` 字符串化）。
- 返回 `{"ok": True}`。

### 2.2 查看参与者角色 `GET /api/raids/{rid}/signups/{user_id}/characters`

- 鉴权：`get_current_user`（任何登录用户）。
- 校验：目标用户须为参与者——`user_id == raid.created_by` **或**存在报名行；否则 `404 "该用户未参与本场攻坚"`。
- 返回 `PlayerCharacters { user: UserOut, characters: list[CharacterOut] }`，角色复用 `auth.py` 的 `_character_out`（需从 `routers/auth.py` 导出或在 raids.py 内实现等价转换）。
- 无角色时返回 `characters: []`（与 `/api/admin/characters` 的「过滤无角色玩家」不同——此处明确返回空列表，前端据此显示「还没有角色」）。

### 2.3 修改攻坚 `PUT /api/raids/{rid}`

- 逻辑不变（`name` / `starts_at` 可为空，`require_admin`）。
- commit 后广播：
  ```python
  await manager.broadcast(rid, {"type": "raid:updated",
                                "name": raid.name,
                                "starts_at": raid.starts_at.isoformat()})
  ```

## 3. 前端

### 3.1 `frontend/src/types.ts`

- 新增：
  ```ts
  export interface CharacterPlacement { wave_index: number; squad_index: number; duty: Duty }
  ```

### 3.2 `frontend/src/stores/raid.ts`

- `WsEvent` 联合新增：`{ type: 'raid:updated'; name: string; starts_at: string }`。
- `applyEvent` 增加 `raid:updated`：`raid.name = ev.name; raid.starts_at = ev.starts_at`。

### 3.3 `frontend/src/lib/placement.ts`（新）

```ts
export function buildPlacementMap(raid: Raid): Record<number, CharacterPlacement>
```
- 遍历 `raid.waves` 的每个 slot，`slot.character_id != null` 时写入 `map[slot.character_id] = { wave_index: slot 所在 wave.index, squad_index: slot.squad_index, duty: slot.duty }`。
- 角色全局唯一（`fill_slot` 有角色去重规则），天然一对一，无需处理冲突。
- 纯函数，便于单测。

### 3.4 `frontend/src/components/CharacterCard.vue`（新，共享卡片）

- props：`character: Character`、`placement: CharacterPlacement | null`、`active?: boolean`。
- 渲染现 `CharacterPickerModal` 中的角色行（职业图标 + 名称 + `job_title · class_type · 名望` + 输出/增益行）。
- 当 `placement` 非空：卡片右上角渲染角标 `已占位 · 第{wave_index}波 · {SQUAD_NAMES[squad_index]}`（样式醒目但可辨识，如金色描边）。
- 点击透出 `click` 事件（由父级决定是否可点）。

### 3.5 `frontend/src/components/CharacterPickerModal.vue`（改造）

- 新增 prop `placed?: Record<number, CharacterPlacement>`（默认 `{}`）。
- 卡片行替换为 `<CharacterCard :character="c" :placement="placed[c.id] ?? null" :active="selected?.id === c.id" @click="choose(c)" />`。
- 已占位仍可点选（`choose` 逻辑不变，confirm 走 `onSelectCharacter` 的 replace 流程）。

### 3.6 `frontend/src/components/MemberCharactersModal.vue`（新，只读）

- props：`open: boolean`、`rid: number`、`user: User`。
- 打开时 `GET /api/raids/{rid}/signups/{user.id}/characters` → `PlayerCharacters`。
- 头部：`user.nickname` 的角色（NModal card title）。
- 内容：`v-for` 渲染 `<CharacterCard :placement="placed[c.id] ?? null" />`（不可点，无选择状态）。
- `placed` 由父级（RaidDetailView）经 `buildPlacementMap(store.raid)` 传入（弹窗自身不读 store，保持数据流向单一）。
- 无 footer，仅标题栏关闭。

### 3.7 `frontend/src/components/SignupMemberPicker.vue`（新，加号弹窗）

- props：`open: boolean`、`rid: number`、`excludeUserIds: number[]`。
- 打开时 `GET /api/admin/users` → 过滤 `excludeUserIds`（团长 + 已报名）→ 列表（UserAvatar + 昵称）。
- 点击某人 → `confirmDialog('确认帮「xxx」报名？')` → `POST /api/raids/{rid}/signups { user_id }` → 成功 `emit('signedUp')` 由父级 `load()`。
- 已全部报名 → 显示「所有人都已报名」。

### 3.8 `frontend/src/views/RaidDetailView.vue`（改造）

- **报名面板**：
  - 加号按钮：`auth.isAdmin && !store.raid.locked` → 打开 `SignupMemberPicker`（`excludeUserIds` = `signupUserIds`，其中已含团长）。
  - 头像可点：报名行内 `UserAvatar` 外包一层按钮 → 打开 `MemberCharactersModal`（所有用户可点）。
  - 面板 inline style 补 `padding:12px`（第 5 点）。
- **修改弹窗**：头部时间行给「修改」按钮（`auth.isAdmin`）→ 打开内联 NModal：名字 `NInput` + 时间 `NDatePicker`（`type="datetime"`、`value-format="yyyy-MM-dd'T'HH:mm:ss"`，与创建一致），初始值取当前 `store.raid.name` / `starts_at` → 保存 `PUT /api/raids/{rid}` → `load()`。

## 4. WebSocket 事件

新增：

- `raid:updated { name, starts_at }`：详情页在线观众 `applyEvent` 就地更新 name/starts_at（不触发全量刷新）。

既有事件（`raid:signup`、`raid:signup_removed`）复用，帮报名广播 `raid:signup` 后前端 `applyEvent` 自动追加到 `signups`；父级随后 `load()` 全量刷新兜底。

## 5. 测试

### 后端 `backend/tests/test_raid_signup.py`（扩展）

- `POST /{rid}/signups`：管理员帮普通用户报名成功（`raid_signups` 有行、返回 `{"ok": True}`）；锁定 → 400；团长 → 400；重复 → 400。
- `GET /{rid}/signups/{user_id}/characters`：参与者（含团长）可查、返回 `PlayerCharacters`；非参与者 → 404。

### 前端

- `lib/placement.spec.ts`（新）：`buildPlacementMap` 多波多角色映射正确、空 raid 返回 `{}`。
- `stores/raid.spec.ts`（扩展）：`applyEvent` 的 `raid:updated` 更新 name/starts_at。
- `CharacterPickerModal.spec.ts`（新或扩展）：`placed` 中角色渲染「已占位」角标，未占位无角标。

## 6. 文档

- `CHANGELOG.md` [Unreleased] → 新增：攻坚详情增强（管理员帮报名 / 修改时间名字 + 实时同步 / 占位角标 / 头像只读查看）。
- 根 `README.md`：如必要在功能清单补一句（均为前端/API 功能，机器人 API 表不变）。

## 7. 变更文件范围

- `backend/app/schemas.py` — 新增 `SignupUserIn`
- `backend/app/routers/raids.py` — 新增 2 端点、`PUT` 补广播
- `backend/app/routers/auth.py` — 导出 `_character_out`（或 raids.py 内等价实现）
- `backend/tests/test_raid_signup.py` — 新增用例
- `frontend/src/types.ts` — 新增 `CharacterPlacement`
- `frontend/src/stores/raid.ts` — `raid:updated` WS 处理
- `frontend/src/lib/placement.ts` — `buildPlacementMap`（新）
- `frontend/src/lib/placement.spec.ts` — 单测（新）
- `frontend/src/components/CharacterCard.vue` — 共享卡片（新）
- `frontend/src/components/CharacterPickerModal.vue` — `placed` prop + 卡片替换
- `frontend/src/components/MemberCharactersModal.vue` — 只读弹窗（新）
- `frontend/src/components/SignupMemberPicker.vue` — 加号选人弹窗（新）
- `frontend/src/views/RaidDetailView.vue` — 加号 / 头像可点 / 修改弹窗 / 面板 padding
- `frontend/src/stores/raid.spec.ts` — `raid:updated` 用例
- `frontend/src/components/CharacterPickerModal.spec.ts` — 占位角标用例
- `CHANGELOG.md` — [Unreleased] 新增
