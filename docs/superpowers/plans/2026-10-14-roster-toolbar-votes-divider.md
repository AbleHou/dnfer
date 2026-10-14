# 编队页工具栏美化 + 投票页分隔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ①编队页左侧角色栏工具栏美化——搜索框加边框、展开/收起按钮去文字改 Unicode 双箭头图标、工具栏与整个左侧栏加内边距；②投票页投票卡之间拉开间距分隔。

**Architecture:** 纯前端布局/展示改动。`RosterPool.vue` 工具栏复用 `.dnf-input` 类给搜索框加边框、按钮去文字换 `▾▾`/`▴▴` 图标（保留 data-act、加 title）、工具栏行加 padding；`RosterView.vue` 的 `<aside class="dnf-panel">`（无内边距是粘在一起的根因）加 `padding:10px`；`VotesView.vue` 把 `<VoteCard v-for>` 包进 `.vote-list` 容器用 flex gap 分隔。

**Tech Stack:** Vue 3 `<script setup>` + Vitest + vue-tsc（frontend）。后端零改动，无新增依赖。

**前置约定（务必遵守）**
- 提交直接到 main，不做 worktree。提交信息 `[feat]/[fix]/[test]/[ref]` + 中文，`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- 测试命令：前端 `cd /Users/able/toys/dnfer/frontend && npx vitest run <file>`；前端构建 `cd /Users/able/toys/dnfer/frontend && npm run build`。
- 规范文档：`docs/superpowers/specs/2026-10-14-roster-toolbar-votes-divider-design.md`（歧义时回看 spec）。

---

### Task 1: 编队页左侧角色栏工具栏美化

**Files:**
- Modify: `frontend/src/components/RosterPool.vue`
- Modify: `frontend/src/views/RosterView.vue`
- Test: `frontend/src/components/RosterPool.spec.ts`

- [ ] **Step 1: 写失败测试**（在 `RosterPool.spec.ts` 的 `describe('RosterPool')` 内追加）

```ts
it('工具栏：展开/收起按钮为双箭头图标，搜索框带边框类', () => {
  const w = mountPool()
  expect(w.find('[data-act="pool-expand-all"]').text()).toBe('▾▾')
  expect(w.find('[data-act="pool-collapse-all"]').text()).toBe('▴▴')
  expect(w.find('[data-act="pool-search"]').classes()).toContain('dnf-input')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: 新增用例 FAIL（按钮文本仍为「全部展开/全部收起」、输入框无 `dnf-input` 类）。

- [ ] **Step 3: 实现 `RosterPool.vue` 工具栏**（当前行 79-84，整块替换）

```html
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;padding:0 2px">
      <input v-model="query" class="dnf-input" data-act="pool-search" placeholder="按用户名搜索"
             style="flex:1;min-width:0" />
      <button class="dnf-btn dnf-btn-sm" title="全部展开" data-act="pool-expand-all" @click="expandAll">▾▾</button>
      <button class="dnf-btn dnf-btn-sm" title="全部收起" data-act="pool-collapse-all" @click="collapseAll">▴▴</button>
    </div>
```

- [ ] **Step 4: 实现 `RosterView.vue` aside 内边距**（行 222-223，inline style 追加 `padding:10px`）

```html
      <aside style="width:260px;flex-shrink:0;max-height:70vh;overflow:auto;position:sticky;top:60px;padding:10px" data-test="roster-pool"
             class="dnf-panel" >
```

- [ ] **Step 5: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: 全 PASS（含新增与既有）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/RosterPool.vue frontend/src/views/RosterView.vue frontend/src/components/RosterPool.spec.ts
git commit -m "[feat] 编队页工具栏美化（搜索框边框/图标按钮/内边距）"
```

---

### Task 2: 投票页投票卡分隔

**Files:**
- Modify: `frontend/src/views/VotesView.vue`
- Test: `frontend/src/views/VotesView.spec.ts`

- [ ] **Step 1: 写失败测试**（在 `VotesView.spec.ts` 的 `describe('VotesView')` 内追加）

```ts
it('投票卡包在 .vote-list 容器内（间距分隔）', async () => {
  const wrapper = mount(VotesView, {
    global: { plugins: [createPinia()], stubs: { VoteCard: true } },
  })
  await flushPromises()
  const list = wrapper.find('.vote-list')
  expect(list.exists()).toBe(true)
  expect(list.findComponent({ name: 'VoteCard' }).exists()).toBe(true)
  wrapper.unmount()  // 清掉 5s 轮询定时器
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/VotesView.spec.ts`
Expected: 新增用例 FAIL（无 `.vote-list`）。

- [ ] **Step 3: 实现 `VotesView.vue`**（行 35 的 `<VoteCard v-for>` 外包一层 + scoped style）

模板（行 35 前后）：
```html
    <div class="vote-list">
      <VoteCard v-for="v in votes" :key="v.id" :vote="v" :is-admin="auth.isAdmin" @refresh="load" />
    </div>
```
`<script setup>` 之后的 `<template>` 尾部新增 `<style scoped>`：
```html
<style scoped>
.vote-list { display: flex; flex-direction: column; gap: 14px; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/VotesView.spec.ts`
Expected: 全 PASS（含新增与既有）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/VotesView.vue frontend/src/views/VotesView.spec.ts
git commit -m "[feat] 投票页投票卡间距分隔"
```

---

### Task 3: 全量构建 + 测试回归

**Files:**（无新增）

- [ ] **Step 1: 前端构建 + 全量测试**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 构建 PASS（vue-tsc + vite）。

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run`
Expected: 全 PASS。若有失败修复。

- [ ] **Step 2: Commit（如有修复）**

```bash
git add -A
git commit -m "[fix] 工具栏/投票分隔前端回归修复"
```

---

## 验收清单（对照 spec）

- [ ] 搜索框带 `dnf-input` 边框类；展开/收起按钮为 `▾▾`/`▴▴` 图标（保留 data-act、带 title）。
- [ ] 工具栏行 `padding:0 2px`；`aside.dnf-panel` 加 `padding:10px`。
- [ ] VotesView 投票卡包在 `.vote-list`（flex column gap 14px）内，间距分隔。
- [ ] `npm run build` 通过；前端 vitest 全量绿。
