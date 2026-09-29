# DNfer 报名 UI 美化（弹窗表头 + 报名行分组） — 设计规格

日期：2026-09-29
状态：已确认
上游：`2026-09-28-raid-signup-characters-design.md`（角色级报名，`RaidSignup.characters` 勾选）与 `2026-09-28-votes-design.md`（投票卡片样式参考）。
需求来源：用户口述——(1) 参照投票卡片样式美化「管理报名角色」弹窗，加表头，行内呈现 `勾选框/角色名/avatar+职业/战力/名望`；(2) 详情页报名行对团长以外用户改为 `头像+昵称+占位/报名计数` + `角色变更` + `取消报名` 三部分的分组圆角矩形，取消报名红色并加确认框。

## 1. 目标

纯前端 UI 改动（**无后端变更**）：

- **需求 1**：重排 `SignupModal.vue` 的角色列表——顶部加表头，每行用网格呈现「勾选框｜角色名｜职业图标+职业名｜战力｜名望」，样式对齐投票卡片（圆角边框、hover）。
- **需求 2**：重排 `RaidDetailView.vue` 报名面板——团长行不变；非团长行改为圆角矩形分组块：第一部分「头像+昵称+占位/报名计数」（可点击打开占位信息），第二部分「角色变更」按钮（打开管理弹窗），第三部分「取消报名」红色按钮（带确认框）。移除原角色芯片与快捷 × 删除。

已确认的决策：

- **战力列**：输出职业显示 `模拟伤害/秒伤` 纯数值（如 `12000/300`）；辅助职业显示 `增益量` 纯数值（如 `49000`）；对应字段为 null 时显示 `—`。不带单位、不带标签。
- **角色芯片移除**：报名行内不再渲染各报名角色芯片（含 × 快捷删除），增删角色统一走「角色变更」弹窗（SignupModal manage 模式）。
- **职业图标即“avatar”**：角色无独立头像，用 `jobIcon(job_name)` 职业图标作为该行视觉头像（与 `CharacterCard` 一致，加载失败回退 `empty.png`）。

## 2. 需求 1：`SignupModal.vue` 弹窗美化

### 2.1 结构

弹窗标题（「报名选角色」/「管理报名角色」）、signup/manage 双模式、`data-act`、signup 默认全选、manage 勾选态由 `selectedIds` 派生等**逻辑全部保持不变**。仅替换角色列表渲染与新增表头。

- 列表外包一个表头行 + 每角色一行，统一用 CSS grid：
  ```
  grid-template-columns: auto minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto
  列： [勾选] [角色名] [职业图标+职业名] [战力] [名望]
  ```
- **表头行**：`角色 | 职业 | 伤害/增益 | 名望`（勾选列留空位），表头文字用小号弱化色（`--dnf-text-faint`）。
- **每行**：
  - 勾选框：`<input type="checkbox" :data-act="'char-' + c.id">`（保留原事件逻辑）。
  - 角色名：`c.name`。
  - 职业：`<img :src="jobIcon(c.job_name)" @error="handleIconError">` + `c.job_title`。
  - 战力：输出 → `${fmtDps(c.simulated_damage)}/${fmtDps(c.sustained_dps)}`；辅助 → `${fmtBuff(c.buff_amount)}`；null → `—`。
  - 名望：`c.fame` 纯数字。
- 行/表头使用投票卡片风格：边框 `--dnf-border`、圆角、`selected` 态强调 `--dnf-accent`（manage 模式勾选行可加 `.selected` 边框）。
- 样式放 `<style scoped>`。

### 2.2 格式化辅助

`fmtDps(n: number | null): string`（输出战力）与 `fmtBuff(n: number | null): string`（辅助战力）：`n == null ? '—' : String(n)`。二者合并为一个 `fmtPower(n)` 即可，放 `<script setup>` 顶层。

### 2.3 测试影响（`SignupModal.spec.ts`）

- 「显示角色名望便于区分」用例断言 `名望 52000` → 改为断言表头「名望」与纯数值 `52000`（行内不再含“名望”前缀字样；文本 `toContain('52000')` 即可，避免与表头/职业数字误撞，用 `data-act="char-1"` 所在行 scope 断言更稳）。
- 新增用例：输出角色战力显示 `5/2`、辅助角色战力显示 `9000`（基于现有 chars fixture：剑魂 `simulated_damage:5, sustained_dps:2`，奶 `buff_amount:9000`）。

## 3. 需求 2：`RaidDetailView.vue` 报名面板

### 3.1 结构

报名面板 `v-for="s in store.raid.signups"` 中：

- **团长行**（`s.created_at === null`）：保持现状（头像按钮 + 昵称 + 「团长」badge）。
- **非团长行**：渲染为圆角矩形分组块 `.signup-group`，内含三部分：
  1. **`.signup-user`（按钮）**：`<UserAvatar>` + 昵称 + `{{ placedCount(s) }}/{{ s.characters.length }}`。点击 `memberModalUser = s.user`（与现在点头像一致，打开 `MemberCharactersModal` 查看该用户占位信息）。
  2. **「角色变更」按钮**：仅 `s.user.id === auth.user?.id && !store.raid.locked` 显示；`data-act="manage-chars"`；点击 `openManageSignup()`（复用现有逻辑，打开 SignupModal manage 模式）。
  3. **「取消报名」按钮**：红色 `dnf-btn-danger`，带 `confirmDialog`：
     - 管理员且 `s.created_at !== null`：显示（含锁定状态，维持现状），点击 `onCancelUser(s)`（已有确认框文案不变）。
     - 本人且未锁定：显示，点击 `onCancelSelf()` **新增确认框**（文案如「确认取消本次报名？将撤下已占位的角色」）。
- `.signup-group` 样式：圆角矩形、边框、内边距；三部分水平排布（flex），第一部分撑满剩余空间（`flex:1`）实现“整体性”。
- **移除**：`signup-chips`/`signup-chip`/`chip-x` 模板与样式、`data-act="add-char"`/`rm-char-*`、`onRemoveSignupChar` 处理函数（不再被引用）。

### 3.2 占位计数

```ts
function placedCount(s: RaidSignup): number {
  return s.characters.filter(c => placed.value[c.id]).length
}
```

`placed` 为既有 `buildPlacementMap` 结果（`Record<number, CharacterPlacement>`），key 即 character_id。

### 3.3 测试影响（`RaidDetailView.spec.ts`）

- 既有「团长固定行不显示取消报名按钮」用例：原选择器 `div[style*="border: 1px solid var(--dnf-border)"]` 依赖行内样式，改版后团长行仍保留该内联样式、非团长行改为 `.signup-group`——选择器与断言需更新：
  - 团长行 = 内联样式 div（不含「取消报名」）。
  - 非团长行 = `wrapper.findAll('.signup-group')`（管理员视角含「取消报名」，且不含「角色变更」——管理员非本人）。
- 「点击头像打开成员角色只读弹窗」用例：头像按钮选择器 `.avatar-btn` 仍适用（第一部分仍是按钮包 `UserAvatar`），断言不变。
- 新增用例：
  - 本人（member 视角）行显示 `占位/报名` 计数与「角色变更」按钮，点击打开 SignupModal manage 模式（校验 `mode === 'manage'` 与 `selectedIds` 同步自 `myRow.characters`）。
  - 「取消报名」带确认框：`confirmDialog` 被调用（mock 返回 true → `DELETE /api/raids/{rid}/signup`）；返回 false → 不调 DELETE。
  - fixture：`memberRow` 补 `characters`（如 `[{id, name, job_title, class_type}]`）以支持计数渲染；`placed` 需含对应占位以便断言 `占位/报名`。

## 4. 文档

- `CHANGELOG.md` [Unreleased] → 新增：报名弹窗加表头与战力列；详情页报名行分组美化（角色变更/红色取消+确认）。

## 5. 变更文件范围

- `frontend/src/components/SignupModal.vue` — 表头 + 网格行 + 战力列
- `frontend/src/views/RaidDetailView.vue` — 非团长行分组块 + 移除芯片 + 取消确认
- `frontend/src/components/SignupModal.spec.ts` — 断言适配 + 战力用例
- `frontend/src/views/RaidDetailView.spec.ts` — 选择器适配 + 新用例
- `CHANGELOG.md` — [Unreleased] 新增

无后端、无 `stores/`、无其他组件改动。
