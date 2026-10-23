# 用户管理页角色查询/账号管理拆双 tab — 设计规格

日期：2026-10-23
状态：已确认
需求来源：用户口述——管理→用户管理页里「角色查询」与「账号管理」平铺在同一页面，操作账号信息时需滚动到页面底部，希望拆成两个 tab 快速切换。

已确认的决策：
- **默认 tab**：角色查询（保持现状首屏不变，用户列表需手动切）。
- **实现**：naive-ui `n-tabs`/`n-tab-pane`（项目既有按需 import naive 组件的约定，主题自动跟随 dark/light）。
- **数据加载**：挂载即双加载（现状 `loadQuery()` + `loadUsers()` 不变），切 tab 秒开。
- **pane 渲染**：`display-directive="show"`——两个 pane 都渲染，非激活 pane 用 `vShow` 隐藏。理由：①切 tab 保留滚动位置与输入焦点；②现有 8 个用户列表操作用例（封禁/解封/改密/临时用户等）零改动保留（隐藏 pane 仍在 DOM，`find`/`trigger` 仍可命中）。

## 1. 目标

- 角色查询与账号管理拆成两个 tab，账号操作不再需要滚到底部。
- 纯前端展示层拆分，**零后端改动、零类型改动**（`types.ts` 不动）。
- 现有行为与测试尽量保留。

**范围**：仅 `frontend/src/views/AdminUsersView.vue` + 其 spec。**不含**：tab 状态持久化/URL 同步、拆子组件、拆路由、懒加载。

## 2. 前端改动（`AdminUsersView.vue`）

### 2.1 模板

- `import { NTabs, NTabPane } from 'naive-ui'`（按需 import，对齐 RaidListView 等既有用法）。
- `<h2>用户管理</h2>` 之后、四个弹窗之前，用 `<n-tabs v-model:value="activeTab">` 包住原两个 `<section>`；**`display-directive="show"` 放在每个 `<n-tab-pane>` 上**（naive-ui 2.45.3 该 prop 只属于 pane，放 `<n-tabs>` 会被静默忽略回落默认 `"if"`）：

```vue
<n-tabs v-model:value="activeTab">
  <n-tab-pane name="query" tab="角色查询" display-directive="show">
    <!-- 原「角色查询」section 内容，去掉 <h3>角色查询</h3> -->
  </n-tab-pane>
  <n-tab-pane name="users" tab="账号管理" display-directive="show">
    <!-- 原「用户列表」section 内容，去掉 <h3>用户列表</h3> -->
  </n-tab-pane>
</n-tabs>
```

- 两个 section 的 `dnf-panel dnf-section` 类保留（内容区样式不变），各去掉 `<h3>`——tab 标签已表达语义，避免重复标题（原 h3 文本无任何测试断言依赖，可安全移除）。
- **所有 `data-filter`/`data-act` 属性原样保留**，测试依赖它们定位。
- 四个弹窗（`AdminUserCharactersModal`/`AdminResetPasswordModal`/`GuestCreateModal`/`GuestConvertModal`）保持在 `n-tabs` 之外的根级渲染，`v-if` 逻辑不变——「归属玩家」按钮在 query tab、「改密/转正/删除」等按钮在 users tab，弹窗不属任一 tab，且 users 的「添加临时用户」入口在 users pane 内工具栏。

### 2.2 脚本

- 新增 `const activeTab = ref('query')`（默认角色查询），其余全部 ref/logic **原样不动**（`queryItems`/筛选器/`loadQuery`、`users`/`loadUsers`、弹窗状态、`toggleBan`、临时用户相关函数）。
- `onMounted` 保持 `loadQuery()` + `loadUsers()` + `api.getJobs()` 三者全加载（双加载决策）。
- tab 状态纯内存态，不持久化、不同步 URL；刷新/离开页面回到「角色查询」默认。

### 2.3 样式

- 无自定义 CSS。naive `n-tabs` 默认「下划线 bar」样式随主题切换（`naiveOverrides` 驱动），与页面既有 naive 组件一致。
- 若渲染后 tab 与内容间距偏小，允许加内联 `style` 微调（如 `n-tab-pane` 上 `padding-top`），不引新类。

## 3. 约束与边界

- `display-directive="show"`：两个 pane 始终在 DOM。对「已双加载」的管理页是合理取舍（DOM 多一个表格，代价可忽略）；换来切 tab 保留滚动/焦点与测试零改动。
- 弹窗不随 tab 切换而销毁/重建——在 n-tabs 外，与 activeTab 无关。
- 角色查询的并发乱序守卫（`querySeq`）与 `watch(queryKey)` 不受影响（ref 变化驱动，非渲染驱动）。
- 前端 `api.del`/`api.get` 等约定不变。

## 4. 测试（`AdminUsersView.spec.ts`）

### 现有用例

- `display-directive="show"` 下**全部保留、不改**：默认激活 query tab，users pane 虽隐藏但仍在 DOM——
  - 角色查询 4 例（筛选参数/性别后缀/太阳增益列/冒险团列）依赖 query pane，天然命中。
  - 用户列表 8 例（封禁/解封/角色管理入口/改密/管理员行/临时用户/添加/删除/转正）依赖 users pane 的 `data-act`，`find` 命中隐藏元素、`trigger('click')` 在 jsdom 不校验可见性，均照常通过。
  - `wrapper.text()` 断言（如「阿甲」「外援」「临时」）在 `show` 下两 pane 文本都在，包含断言不受影响。

### 新增用例（1 例）

- **默认激活 + 切换**：
  - 挂载后断言 `activeTab === 'query'`（经 `wrapper.vm.activeTab`，`<script setup>` 顶层绑定暴露在实例上）。
  - 点击「账号管理」tab 按钮（`wrapper.findAll('.n-tabs-tab')` 中按文本 `账号管理` 定位，或 `findAll('button')` 文本匹配）后断言 `activeTab === 'users'`。
  - 反断言：非激活 pane 具 `display: none`（`n-tab-pane` 上 `vShow`），或直接断言 `activeTab` 值即可（实现细节留实现时定）。

## 5. 非目标 / 后续

- tab 状态持久化（localStorage/URL query）与跨设备同步。
- 拆子组件（CharacterQueryPanel/UserListPanel）或拆路由（`/admin/users/characters` 等）。
- 懒加载 / 按需请求（当前双加载，数据量小无感）。
- 后端或 `types.ts` 的任何改动。
