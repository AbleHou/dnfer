# 用户管理页角色查询/账号管理拆双 tab 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理→用户管理页把「角色查询」与「账号管理」拆成两个 tab，默认激活「角色查询」，账号操作无需滚到底部。

**Architecture:** 纯前端展示层拆分，零后端/类型改动。`AdminUsersView.vue` 用 naive-ui `n-tabs`/`n-tab-pane` 包住原两个 `<section>`（去掉各自 `<h3>`），`display-directive="show"` 使两个 pane 都渲染、非激活用 `vShow` 隐藏（切 tab 保留滚动/焦点，且现有 8 个用户列表用例零改动保留）。脚本区逻辑与 `onMounted` 双加载原样不动，仅加 `activeTab = ref('query')`。四个弹窗保持在 `n-tabs` 外的根级。

**Tech Stack:** Vue 3 `<script setup>` + naive-ui（`NTabs`/`NTabPane` 按需 import）+ Vitest。

**参考文档：** `docs/superpowers/specs/2026-10-23-admin-users-tabs-design.md`

---

### Task 1: 新增 tab 切换测试（TDD 红）

**Files:**
- Test: `frontend/src/views/AdminUsersView.spec.ts`（追加用例）

- [ ] **Step 1: 写失败测试**（追加到 `AdminUsersView.spec.ts` 末尾，`describe` 内最后一个 `it` 之后）

```ts
it('默认激活角色查询 tab，可切换到账号管理 tab', async () => {
  const wrapper = mount(AdminUsersView, { global: { stubs: { AdminNav: true, AdminUserCharactersModal: true } } })
  await flushPromises()
  // 默认激活「角色查询」tab（naive 激活 tab 按钮带 n-tabs-tab--active 类）
  expect(wrapper.find('.n-tabs-tab--active').text()).toContain('角色查询')
  const usersTab = wrapper.findAll('.n-tabs-tab').find((t) => t.text().includes('账号管理'))
  expect(usersTab).toBeTruthy()
  await usersTab!.trigger('click')
  await flushPromises()
  expect(wrapper.find('.n-tabs-tab--active').text()).toContain('账号管理')   // 切到「账号管理」tab
})
```

> 不用 `wrapper.vm.activeTab`——项目无此先例且 vue-tsc 类型检查 spec 时 `ComponentPublicInstance` 无任意属性索引，改用 naive 的 `.n-tabs-tab--active` 类（`Tab.mjs:109` 确认）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: 新增用例 FAIL——`.n-tabs-tab--active` 不存在（当前页面还没有 n-tabs），`find` 访问 `.text()` 抛错或 `usersTab` 为 undefined 断言失败；既有 12 例仍 PASS。

---

### Task 2: 实现 AdminUsersView 双 tab（TDD 绿）

**Files:**
- Modify: `frontend/src/views/AdminUsersView.vue`（script 加 import + `activeTab`；template 用 n-tabs 包住两个 section）

- [ ] **Step 1: 脚本改动**

`frontend/src/views/AdminUsersView.vue`：

- 第 11 行 `import type { ... }` 之后、`// ---- 角色查询区 ----` 之前，加 import 与 ref：

```ts
import { NTabs, NTabPane } from 'naive-ui'

// ---- tab 切换（角色查询 / 账号管理）----
const activeTab = ref('query')   // 默认「角色查询」
```

- 其余脚本（`queryItems`/筛选器/`loadQuery`/`querySeq`、`users`/`loadUsers`、弹窗状态、`toggleBan`、临时用户函数、`onMounted`）**一律不动**。

- [ ] **Step 2: 模板改动（开包第一 pane）**

把原开头的：

```html
    <h2>用户管理</h2>

    <section class="dnf-panel dnf-section">
      <h3>角色查询</h3>
```

替换为：

```html
    <h2>用户管理</h2>

    <n-tabs v-model:value="activeTab">
      <n-tab-pane name="query" tab="角色查询" display-directive="show">
        <section class="dnf-panel dnf-section">
```

> **注意**：`display-directive="show"` 必须放在 `<n-tab-pane>` 上，不是 `<n-tabs>`——naive-ui 2.45.3 该 prop 只属于 pane，放 n-tabs 上会被静默忽略（vue-tsc 不报多余属性）而回落默认 `"if"`，届时「账号管理」pane 从 DOM 移除，现有 8 个用户列表用例全挂。

「角色查询」section 的**内部内容（筛选栏、`queryError`、`dnf-table`、`共 N 个角色`）全部原样保留**（含所有 `data-filter` 属性）。

- [ ] **Step 3: 模板改动（两 pane 接缝 + 收包）**

把两 section 之间的：

```html
    </section>

    <section class="dnf-panel dnf-section">
      <h3>用户列表</h3>
```

替换为：

```html
        </section>
      </n-tab-pane>
      <n-tab-pane name="users" tab="账号管理" display-directive="show">
        <section class="dnf-panel dnf-section">
```

「账号管理」section 的**内部内容（搜索栏、`userError`、`dnf-table`）全部原样保留**（含所有 `data-act` 属性，如 `user-search`/`add-guest`/`manage-*`/`reset-pw-*`/`ban-*`/`unban-*`/`convert-*`/`delete-guest-*`）。

把用户列表 section 的收尾（`</section>` + 弹窗起始行，`@close` 行保持原样不动）：

```html
    </section>

    <AdminUserCharactersModal v-if="modalOpen" :open="modalOpen" :user="modalUser"
```

替换为：

```html
        </section>
      </n-tab-pane>
    </n-tabs>

    <AdminUserCharactersModal v-if="modalOpen" :open="modalOpen" :user="modalUser"
```

四个弹窗**保持原样**（仍在 `n-tabs` 外的根级，`v-if` 逻辑不变）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: 全部 PASS——既有 12 例（`display-directive="show"` 下 users pane 隐藏但仍在 DOM，`find`/`trigger` 可命中）+ 新增 1 例。

- [ ] **Step 5: 类型/构建检查（vue-tsc）**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误（`NTabs`/`NTabPane` 是 naive-ui 具名导出；spec 的 `.n-tabs-tab--active` 断言不涉 TS 类型问题）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/AdminUsersView.vue frontend/src/views/AdminUsersView.spec.ts
git commit -m "[feat] 用户管理：角色查询/账号管理拆双 tab"
```

---

### Task 3: 全量回归

**Files:**
- 无代码改动，仅验证

- [ ] **Step 1: 前端相关测试 + 构建**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts && npm run build`
Expected: AdminUsersView.spec 全部 PASS（含新增 1 例）+ `npm run build` 成功。

- [ ] **Step 2: 后端回归（确认零影响）**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS（本改动零后端代码变更，纯确认）。

- [ ] **Step 3: 提交（若有残留变更）**

```bash
git add -A
git commit -m "[test] 用户管理双 tab 全量回归"
```
（若无变更则跳过本步。）

---

## 说明 / 注意事项

- 提交直接到 main（仓库既定约定，不做 worktree）。
- 提交信息用 `[feat]/[test]` 风格 + 中文描述，`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- `display-directive="show"` 必须放在**每个 `<n-tab-pane>` 上**，不能放 `<n-tabs>`——naive-ui 2.45.3 该 prop 只属于 pane（`TabPane.mjs:13` 声明，`Tabs.mjs:872-873` 从 pane 的 `vNode.props` 读取），放 n-tabs 上会被静默忽略回落默认 `"if"`。默认 `if` 会把非激活 pane 从 DOM 移除，现有 8 个用户列表用例会因找不到 `data-act` 元素而失败。
- 删掉两个 `<h3>`（角色查询/用户列表）是设计决策，无测试依赖其文本，安全。
- tab 标签用「角色查询」/「账号管理」，与页面 `<h2>用户管理</h2>` 区分，避免同名冗余。
- 前端类型经 `npm run build`（vue-tsc）校验；vitest 不做类型检查。
- naive `n-tabs` 首次在此视图 jsdom 挂载：vueuc 已 polyfill `ResizeObserver`（`@juggle/resize-observer`），低风险；若意外抛错，兜底是在 spec 里 stub `NTabs`/`NTabPane`，不改设计。
