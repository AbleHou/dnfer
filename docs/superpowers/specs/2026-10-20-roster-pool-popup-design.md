# 编队角色池弹框化 + 位置/波次标签（设计规格）

日期：2026-10-20
状态：设计已获用户确认
范围：前端纯改动（RosterView / RosterPool / lib/roster.ts / dnf.css / colors.ts）；后端零改动

## 1. 背景与目标

编队总览页当前左侧有一块常驻 sticky 角色池（`<aside data-test="roster-pool">`），在小屏与「先看网格再找人」的场景下占位较大。用户希望：

1. 左侧角色选择栏改为**点击右下角悬浮按钮打开的弹框**。
2. 排表时快速掌握「每个人在当前波的作用」与「每个角色出现在第几波」：
   - **用户头（甲/乙…）**后显示该用户**当前选中波**的位置胶囊，如 `红队 主C`（队伍 tag 用各队色描边淡底、职责 tag 用实心配色）。
   - **角色行**名后显示该角色占位的**波次标签** `第N波`（并行团带 `M团`）。
   - 两个标签均**纯展示**，不可点击；所有角色操作（改职责/撤下/拿起）留在网格表格中。

## 2. 关键领域事实（已核实）

- **每角色全攻坚只占一格**：`raids.py` fill_slot 的 `replace:true` 分支会撤下「同一角色在本攻坚其他格（任意波）」的冲突格 → 一个角色至多一个 `slot`，故角色行波次标签**至多一个**。
- **同轮每用户至多一个占位**：fill_slot 校验「同一轮次中一个玩家只能上一个角色」（`_validate_one_char_per_round` / `same_owner` 查询）→ 用户头胶囊在**当前轮**每用户至多一个。
- **并行团**：同轮多 wave 共享 `group_id`，`round_index` 为展示轮数、`group_index` 为团号；`group_id == null` 表示独立单波（团号无意义）。

## 3. 交互设计

### 3.1 右下角悬浮按钮（FAB）
- 移除 `RosterView.vue` 左侧 `<aside data-test="roster-pool">` sticky 面板。
- 新增**固定定位右下角**圆形按钮（`data-test="pool-fab"`），**所有人可见**（只读观众也能打开角色池浏览）。
- 点击打开居中 NModal（标题「角色池」，宽 `min(380px,92vw)`，对齐 RosterTargetModal 尺寸惯例）。
- 弹框内容 = 原 `RosterPool`（搜索 / 全部展开收起 / ＋临时 工具栏 + 用户→冒险团→角色列表均保留）。
- 弹框内点角色「拿起」→ 置 holding 后**自动关闭弹框**，露出网格落格；Esc / 取消按钮仍可退出拿起态。

### 3.2 用户头职责胶囊（纯展示）
- 位置：`.pool-user-head`（现为可点击折叠的头）中，昵称之后、guest 徽章之前。
- 条件：`roundUserPos` 中有该 `user_id`（即该用户在当前轮已排）。
- 内容：`[团号前缀?][队伍tag][职责tag]`
  - 队伍 tag：`SQUAD_NAMES[squadIndex]`（红/黄/绿/蓝/紫），描边淡底 + 队色。
  - 职责 tag：`duty` 实心填充。
  - 并行团前缀：当所在 wave `group_id != null` 时显示 `{group_index}团 ` 前缀（如 `2团 红队 主C`）；`group_id == null` 不显示。
- 不可点击（`@click.stop` 也不需要——不挂事件即可）；所有角色操作留在网格。

### 3.3 角色行波次标签（纯展示）
- 位置：`.pool-char` 行中角色名后、现有角标（划水/推荐）之前。
- 条件：`charPlacement` 中有该 `character_id`。
- 内容：`第{roundIndex}波`；并行团（`group_id != null`）显示 `第{roundIndex}波{groupIndex}团`。
- 当前选中波高亮（加粗 / accent 描边）。
- 不可点击。

## 4. 职责配色（方案 A，已确认）

| 职责 | 颜色 | 样式 |
|------|------|------|
| 主C | `#e5484d` | 实心白字 |
| 辅C | `#f28b2e` | 实心深字 |
| 主奶 | `#34c759` | 实心深字 |
| 太阳奶 | `#17a2b8` | 实心白字 |
| 划水 | `#6b7280` | 实心白字 |

队伍 tag 用现有 squad 色（dnf.css：红 `#c0392b` / 黄 `#b8860b` / 绿 `#3a6b35` / 蓝 `#2a5a8a` / 紫 `#7a4a8a`），描边淡底：`background: rgba(队色,.2)` + `border: 1px solid 队色` + 浅色文字。

## 5. 数据流

### 5.1 纯函数（lib/roster.ts）
```ts
export interface CharPlacement {
  roundIndex: number          // 展示用波数（round_index）
  groupId: number | null      // 并行团 id；null=独立单波
  groupIndex: number          // 团号（展示用）
  squadIndex: number          // 队索引 0..4 → SQUAD_NAMES
  duty: Duty | null
  userId: number | null
}
export function placementByChar(waves: Wave[]): Map<number, CharPlacement>
```
遍历所有 wave 的所有 slot，`character_id != null` 即写入 `Map<character_id, CharPlacement>`（后端保证每角色至多一格；若出现重复以最后一次为准，不作防御处理）。

### 5.2 RosterView 派生
- `poolOpen = ref(false)` —— NModal 开关。
- `charPlacement = computed(() => placementByChar(store.raid?.waves ?? []))` —— 全波次，供角色行波次标签。
- `roundUserPos = computed(() => Map<number, CharPlacement>)` —— 仅 `currentGroups`（当前轮）内有占位的 slot，按 `owner_id` 建 Map（后端保证同轮每用户至多一个，直接 `set` 即可）。
- `currentRound = computed(() => currentGroups[0]?.round_index ?? 0)` —— 供波次标签高亮。
- `onPick(c)` 改为：置 `holding` 后**同时置 `poolOpen = false`**（拿起即自动关闭弹框，露出网格落格）。

### 5.3 RosterPool props（新增，均带安全默认）
```ts
roundUserPos?: Map<number, CharPlacement>   // 默认 new Map()
charPlacement?: Map<number, CharPlacement>  // 默认 new Map()
currentRound?: number                        // 默认 0（无高亮）
```
保留既有 props（signups / blockedCharIds / slackCharIds / recommendTop3 / recommendTarget / holdingId / canEdit）与 emits（pick）。

## 6. 组件与样式

- `RosterView.vue`（改）：移除左侧 `<aside>`，新增 **FAB（右下角固定，`data-test="pool-fab"`）+ 居中 NModal（含 `<RosterPool>`）**；NModal 用 `v-if`/`display-directive` 控制，`poolOpen` 决定开合；`@pick="onPick"`（onPick 内部关弹框）。FAB 对所有人可见。
- `RosterPool.vue`（改）：
  - `.pool-user-head` 内加胶囊（两个 `<span class="pos-team-N">红队</span><span class="pos-duty-mainc">主C</span>`，N 为 squadIndex，职责 class 见下）。
  - `.pool-char` 角色名后加 `<span class="wave-tag" :class="{current}">第N波[团]</span>`。
- `dnf.css` 新增全局类（含 `[data-theme="light"]` 覆盖，沿用现有模式）：
  - `.pos-team-0..4`：队伍 tag 描边淡底（暗色：淡底+浅色字；亮色：淡底+深色字）。
  - `.pos-duty-mainc / .pos-duty-subc / .pos-duty-mainheal / .pos-duty-sunheal / .pos-duty-slack`：职责实心 tag。
  - `.wave-tag`：波次标签（默认中性描边；`.current` 高亮）。
  - 职责实心色在两主题下一致，无需覆盖；队伍 tag 文字色需要亮色覆盖。
- `colors.ts`：仅复用 `SQUAD_NAMES`，不改。

## 7. 测试

### 7.1 lib/roster.spec.ts
`placementByChar` 用例：
- 单波单占位 → 正确映射 charId→roundIndex/squadIndex/duty。
- 并行团（两 wave 同 group_id）→ groupId/groupIndex 正确。
- 空格（character_id == null）跳过。
- 多角色多波 → 各自正确。
- 空 waves → 空 Map。

### 7.2 RosterPool.spec.ts
新增 props 带默认值，**旧用例不破坏**：
- 用户头胶囊：有 roundUserPos → 显示 `红队 主C`；无 → 不显示。
- 并行团前缀：roundUserPos 带 groupId → 显示 `2团 红队 主C`。
- 职责文字：各职责 tag 文本正确。
- 角色行波次标签：有 charPlacement → `第1波`；无 → 不显示；并行团 → `第1波2团`。
- 高亮：charPlacement.roundIndex === currentRound → `.current`。
- 胶囊/波次标签不响应点击（不 emit pick、不 toggle 折叠）。

### 7.3 RosterView.spec.ts
- **重要前提**：弹框默认关闭，池内容经 naive NModal（teleport + `display-directive`）渲染；**所有需要与角色池交互的旧用例必须先点 `pool-fab` 打开弹框**，或改写为针对网格的断言。
- 改写（原先直接点 `.pool-char-*` / `add-guest` 的用例，现在须先开弹框再交互）：
  - L84 渲染角色池与网格（断言 `[data-test="roster-pool"]` 存在）→ 该 DOM 已移除，改写为断言 FAB 存在 / 开弹框后池可见。
  - L99 非管理员只读（点 `pool-char-11`）→ 先开弹框。
  - L107 拿起→点空格（点 `pool-char-11`）→ 先开弹框；且拿起后弹框应自动关闭。
  - L118 拿起→点已占格（点 `pool-char-11`）→ 先开弹框。
  - L146 推荐开关（断言 `pool-char-10` 文字）→ 先开弹框。
  - L196 Esc 取消拿起态（点 `pool-char-11`）→ 先开弹框。
  - L206 编队池工具栏添加临时选手（点 `add-guest`）→ 先开弹框；L218/L224 的 add-guest 负向用例因弹框默认关闭会**空洞通过**，须改为开弹框后再断言不存在。
- 新增：FAB 存在；点 FAB 打开弹框；弹框内点角色 → holding 置起 + 弹框自动关闭。
- 删除/改写：旧用例「左侧 sticky」断言（该 DOM 已移除）。
- 保持通过（纯网格交互，不涉及池）：撤下（L129）/ 改职责（L137）/ 未排（L157）/ 波标签（L166）/ 编辑目标（L174）/ 拿起已占格后点空格（L184）/ 已关闭（L232 及 WS 关闭用例）。
  - 注：L232 已关闭用例的 add-guest 缺席断言与 L218/L224 同理会空洞通过，但其核心意图（只读态）已由 recommend-switch 缺席 + 「攻坚已关闭」文案覆盖，无需改写。
- 弹框定位：参照 RosterTargetModal/GuestCreateModal 的 stub 方式确认 NModal 内容可被断言。

## 8. 非目标（明确排除）
- 胶囊不做下拉、不做点击操作（用户明确：所有角色操作留在网格表格）。
- 波次标签不可点击跳转。
- 不改后端、不改数据模型。
- 不新增「跟随系统/跨设备」等状态。

## 9. 风险与注意
- naive `NModal` 与现有 spec 的 `teleport: true` stub 交互：`RosterView.spec` 需确认 NModal 内容可被断言（必要时调整 stub 策略，参照 RosterTargetModal/GuestCreateModal 的 stub 方式）。
- `RosterPool` 折叠/搜索为内存态，弹框每次打开重建组件（`v-if`）会重置折叠态——可接受（与「内存态不持久化」一致）；如需保留需在 RosterView 层持有，本设计按「重建重置」处理。
