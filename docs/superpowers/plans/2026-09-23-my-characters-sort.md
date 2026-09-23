# 我的角色页排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「我的角色」页默认按类型（输出/辅助）排序，用户可切换按名望降序排序。

**Architecture:** 纯前端单视图改造——`MyCharactersView.vue` 加 `sortMode`（默认 `type`）与 `sorted` computed（`[...list]` 排序副本，不改源数组）；头部「添加角色」按钮保持首位，其后加「按类型/按名望」切换按钮（激活态 `dnf-btn-primary`，对象 `:class` 语法）。

**Tech Stack:** Vue 3 `<script setup>` / TypeScript / Vitest + @vue/test-utils。

**Spec:** `docs/superpowers/specs/2026-09-23-my-characters-sort-design.md`

---

## 仓库约定（重要）

- 提交直接到 main（不做 worktree）。提交信息 `[feat]/[docs]` 风格 + 中文描述 + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- 前端测试：`cd frontend && npx vitest run src/views/MyCharactersView.spec.ts`
- 前端类型/构建检查（vitest 不做类型检查）：`cd frontend && npm run build`（= vue-tsc -b && vite build）

---

## 文件结构

- Modify: `frontend/src/views/MyCharactersView.vue` — 排序 computed + 切换按钮 + 模板循环改 `sorted`
- Modify: `frontend/src/views/MyCharactersView.spec.ts` — 新增排序/切换/激活态用例
- Modify: `CHANGELOG.md` — [v1.7]「新增」追加
- Modify: `README.md` —「我的角色」功能点补一句（可选，有自然位置则改）

---

### Task 1: MyCharactersView 排序功能（TDD）

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`
- Test: `frontend/src/views/MyCharactersView.spec.ts`

- [ ] **Step 1: 写失败的测试**

在 `frontend/src/views/MyCharactersView.spec.ts` 顶部 import 追加 `nextTick`：

```ts
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'   // 新增
```

在文件末尾（最后一个 `})` 前）追加用例。先定义本地角色工厂（三个用例都引用它，**必须放在 `describe` 顶层**）：

```ts
function mk(id: number, name: string, class_type: '输出' | '辅助', fame: number) {
  return {
    id, name, job_name: 'x', job_title: 't', parent_name: 'p',
    class_type, fame, simulated_damage: null, sustained_dps: null, buff_amount: null,
  }
}

it('defaults to type sort: 输出 group first (fame desc), then 辅助', async () => {
  apiMock.get.mockResolvedValueOnce([
    mk(1, '奶', '辅助', 200), mk(2, '剑魂', '输出', 100), mk(3, '鬼泣', '输出', 300),
  ])
  const wrapper = mount(MyCharactersView)
  await flushPromises()
  const names = wrapper.findAll('.dnf-panel b').map(b => b.text())
  expect(names).toEqual(['鬼泣', '剑魂', '奶'])   // 输出(名望降序) → 辅助
})

it('toggling 按名望 reorders by fame desc', async () => {
  apiMock.get.mockResolvedValueOnce([
    mk(1, '剑魂', '输出', 100), mk(2, '奶', '辅助', 200), mk(3, '鬼泣', '输出', 300),
  ])
  const wrapper = mount(MyCharactersView)
  await flushPromises()
  expect(wrapper.findAll('.dnf-panel b').map(b => b.text())).toEqual(['鬼泣', '剑魂', '奶'])
  const fameBtn = wrapper.findAll('button').find(b => b.text() === '按名望')!
  await fameBtn.trigger('click')
  await nextTick()
  expect(wrapper.findAll('.dnf-panel b').map(b => b.text())).toEqual(['鬼泣', '奶', '剑魂'])
})

it('highlights the active sort mode button', async () => {
  const wrapper = mount(MyCharactersView)
  await flushPromises()
  const typeBtn = wrapper.findAll('button').find(b => b.text() === '按类型')!
  const fameBtn = wrapper.findAll('button').find(b => b.text() === '按名望')!
  expect(typeBtn.classes()).toContain('dnf-btn-primary')
  expect(fameBtn.classes()).not.toContain('dnf-btn-primary')
  await fameBtn.trigger('click')
  await nextTick()
  expect(fameBtn.classes()).toContain('dnf-btn-primary')
  expect(typeBtn.classes()).not.toContain('dnf-btn-primary')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/MyCharactersView.spec.ts`
Expected: 3 个新用例 FAIL（`按类型/按名望` 按钮不存在、`find` 抛错；或顺序断言失败）

- [ ] **Step 3: 实现**

`frontend/src/views/MyCharactersView.vue`：

（a）script 顶部 import 追加 `computed`：

```ts
import { computed, onMounted, ref } from 'vue'
```

（b）`const error = ref('')` 之后新增：

```ts
type SortMode = 'type' | 'fame'
const sortMode = ref<SortMode>('type')
const TYPE_RANK: Record<Character['class_type'], number> = { 输出: 0, 辅助: 1 }

const sorted = computed(() =>
  [...list.value].sort((a, b) => {
    if (sortMode.value === 'fame') return b.fame - a.fame || a.id - b.id
    return TYPE_RANK[a.class_type] - TYPE_RANK[b.class_type] || b.fame - a.fame || a.id - b.id
  }))
```

（c）模板两处改动：
1. `<template v-for="c in list" :key="c.id">` → `<template v-for="c in sorted" :key="c.id">`
2. 头部 page-head 内，「＋ 添加角色」按钮**保持首位**，其后加两个排序按钮：

```html
<div class="page-head">
  <h2>我的角色</h2>
  <div style="display:flex;align-items:center;gap:8px">
    <button class="dnf-btn dnf-btn-primary" @click="startCreate">＋ 添加角色</button>
    <button class="dnf-btn dnf-btn-sm" :class="{ 'dnf-btn-primary': sortMode === 'type' }"
            @click="sortMode = 'type'">按类型</button>
    <button class="dnf-btn dnf-btn-sm" :class="{ 'dnf-btn-primary': sortMode === 'fame' }"
            @click="sortMode = 'fame'">按名望</button>
  </div>
</div>
```

注意：保持「＋ 添加角色」为第一个按钮（既有 4 个用例用 `wrapper.find('button')` 点它，顺序不可变）。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/MyCharactersView.spec.ts`
Expected: 全部 PASS（既有 7 个 + 新 3 个）

- [ ] **Step 5: 类型/构建检查**

Run: `cd frontend && npm run build`
Expected: vue-tsc 无类型错误、vite build 成功

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/MyCharactersView.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "$(cat <<'EOF'
feat: 我的角色页默认按类型排序、可切换按名望降序

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: CHANGELOG + README 同步

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: CHANGELOG**

`CHANGELOG.md` [v1.7]「新增」块末尾（「机器人报名/取消」条目之后）追加：

```
- **我的角色排序**：「我的角色」页角色列表默认按类型（输出→辅助，组内名望降序）排列，可切换按名望降序排列
```

- [ ] **Step 2: README（可选但推荐）**

`README.md` 功能清单第 19 行「**我的角色**：编辑框打开时点击角色卡片即关闭（等同取消），移动端无需下滑到取消按钮」改为：

```
- **我的角色**：编辑框打开时点击角色卡片即关闭（等同取消），移动端无需下滑到取消按钮；角色列表默认按类型（输出/辅助）排序，可切换按名望降序
```

- [ ] **Step 3: 提交**

```bash
git add CHANGELOG.md README.md
git commit -m "$(cat <<'EOF'
docs: CHANGELOG v1.7 + README 记录我的角色排序

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 全量验证

- [ ] **Step 1: 前端全量测试**

Run: `cd frontend && npx vitest run`
Expected: 全部 PASS（含新增排序用例）

- [ ] **Step 2: 构建**

Run: `cd frontend && npm run build`
Expected: 成功，无类型错误

- [ ] **Step 3: git 状态**

Run: `git status --short`
Expected: 工作区干净

---

## 关键实现要点回顾

- `sorted` 用 `[...list.value]` 副本排序，不改 `list`（后续增删改仍基于原始 `list`）。
- 排序键确定性：`type` = 类型 rank → 名望降序 → id 升序；`fame` = 名望降序 → id 升序。
- 「＋ 添加角色」必须是 page-head 里第一个 `<button>`（既有测试 `wrapper.find('button')` 依赖）。
- 激活态用对象 `:class="{ 'dnf-btn-primary': cond }"`（与代码库 CharacterCard/CharacterForm 一致）。
- vitest 不做类型检查，`npm run build` 才暴露类型错误；新代码用 `Record<Character['class_type'], number>` 需确认 `Character` 已 import（模板 script 顶部已有 `import type { Character, JobCategory }`）。
