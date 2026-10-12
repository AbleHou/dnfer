# 编队角色池增强（折叠 + 全部展开/收起 + 用户名搜索）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让编队页左侧角色池可点用户名折叠/展开角色组、工具栏提供「全部展开/全部收起」按钮、并支持仅前端的用户名（昵称）搜索过滤（角色名不参与、搜索不改折叠态）。

**Architecture:** 纯前端单组件改动。`RosterPool.vue` 新增内存态 `collapsed: Set<user_id>`（默认空=全展开）与 `query: string`；`groups` computed（按用户分组、组内战力排序、过滤 0 角色）保留，其上叠加 `visibleGroups` computed（按昵称子串过滤）；角色渲染用 `v-if="!collapsed.has(g.user.id)"`。搜索只整组显示/隐藏，折叠态独立不受影响。不动 `RosterView.vue` 与其它组件、不动后端。

**Tech Stack:** Vue 3 `<script setup>` + Vitest + vue-tsc（frontend）。无后端改动。

**测试命令：** 前端单测 `cd frontend && npx vitest run src/components/RosterPool.spec.ts`；全量 `cd frontend && npx vitest run`；类型/构建 `cd frontend && npm run build`（= vue-tsc -b && vite build）。

**设计文档：** `docs/superpowers/specs/2026-10-12-roster-pool-collapse-search-design.md`

---

## 文件结构

**前端（frontend/src/）：**
- `components/RosterPool.vue` — 加工具栏（搜索框 + 全部展开/收起按钮）、用户组折叠（Modify）

**前端测试（frontend/src/）：**
- `components/RosterPool.spec.ts` — 新增折叠/按钮/搜索用例（Modify；现有 10 例保持通过）

---

## Task 1: 用户组折叠 + 全部展开/收起按钮

**Files:**
- Modify: `frontend/src/components/RosterPool.vue`
- Test: `frontend/src/components/RosterPool.spec.ts`

**上下文：** `RosterPool.vue` 现有 `groups` computed 已存在（`props.signups.filter(s => s.characters.length > 0).map(s => ({ user: s.user, chars: sortByPower(s.characters) }))`）；模板为 `.roster-pool` 下 `v-for="g in groups"` 的 `.pool-user`（`.pool-user-head` 昵称 + `.pool-char` 角色卡）。默认必须全展开（现有测试依赖），收起的组角色**不渲染**（`v-if`，从 DOM 移除，便于 `exists()` 断言）。

- [ ] **Step 1: 写失败测试**（追加到 `RosterPool.spec.ts` 的 `describe('RosterPool')` 内，现有 10 例不动）

```ts
it('点用户名头收起：该组角色不渲染，再点恢复', async () => {
  const w = mountPool()
  await w.find('[data-user-id="1"]').trigger('click')
  expect(w.find('[data-act="pool-char-10"]').exists()).toBe(false)
  expect(w.find('[data-act="pool-char-11"]').exists()).toBe(false)  // 甲 组两角色都收起
  await w.find('[data-user-id="1"]').trigger('click')
  expect(w.find('[data-act="pool-char-10"]').exists()).toBe(true)
})

it('收起/展开指示符：收起 ▸、展开 ▾', async () => {
  const w = mountPool()
  expect(w.find('[data-user-id="1"]').text()).toContain('▾')
  await w.find('[data-user-id="1"]').trigger('click')
  expect(w.find('[data-user-id="1"]').text()).toContain('▸')
})

it('全部收起后所有组角色不渲染，全部展开后恢复', async () => {
  const w = mountPool()
  await w.find('[data-act="pool-collapse-all"]').trigger('click')
  expect(w.findAll('.pool-char').length).toBe(0)
  await w.find('[data-act="pool-expand-all"]').trigger('click')
  expect(w.findAll('.pool-char').length).toBe(3)  // c1,c2,c3
})
```

注意 fixture：`mountPool()` 默认 signups = 甲{u1,c1,c2} + 乙{u2,c3}，u1.id=1、u2.id=2（`RosterPool.spec.ts:7-18`）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: 3 个新用例 FAIL（无 `[data-user-id]`、无 `pool-collapse-all`/`pool-expand-all` 元素），现有 10 例仍 PASS。

- [ ] **Step 3: 实现**

改写 `RosterPool.vue` 的 `<script setup>` 与 `<template>`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { jobIcon, handleIconError as onIconError, jobGenderTitle } from '../lib/job'
import { SQUAD_NAMES } from '../lib/colors'
import { sortByPower } from '../lib/roster'
import type { Character, RaidSignup } from '../types'

const props = withDefaults(defineProps<{
  signups: RaidSignup[]
  blockedCharIds: Set<number>
  slackCharIds: Set<number>
  recommendTop3: Set<number>
  recommendTarget: Record<number, number | null>
  holdingId: number | null
  canEdit: boolean
}>(), { recommendTop3: () => new Set(), recommendTarget: () => ({}) })
const emit = defineEmits<{ (e: 'pick', c: Character): void }>()

// 按用户分组；组内按战力排序（输出模拟伤害/辅助增益 desc）
const groups = computed(() => props.signups
  .filter(s => s.characters.length > 0)
  .map(s => ({ user: s.user, chars: sortByPower(s.characters) })))

// 折叠态（内存态，离开页面重置）：收起 user.id 集合，默认全展开
const collapsed = ref<Set<number>>(new Set())
function toggleGroup(uid: number) {
  const next = new Set(collapsed.value)
  if (next.has(uid)) next.delete(uid)
  else next.add(uid)
  collapsed.value = next
}
function collapseAll() { collapsed.value = new Set(groups.value.map(g => g.user.id)) }
function expandAll() { collapsed.value = new Set() }

function fmt(n: number | null, unit: string): string { return n == null ? '暂无' : `${n}${unit}` }
function powerText(c: Character): string {
  return c.class_type === '输出'
    ? `模拟 ${fmt(c.simulated_damage, '亿')} · 秒伤 ${fmt(c.sustained_dps, '亿')}`
    : `增益 ${fmt(c.buff_amount, '')} · 太阳 ${fmt(c.sun_buff, '')}`
}
function onPick(c: Character) { if (props.canEdit && !props.blockedCharIds.has(c.id)) emit('pick', c) }
</script>

<template>
  <div class="roster-pool">
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
      <input v-model="query" data-act="pool-search" placeholder="按用户名搜索"
             style="flex:1;min-width:0" />
      <button class="dnf-btn dnf-btn-sm" data-act="pool-expand-all" @click="expandAll">全部展开</button>
      <button class="dnf-btn dnf-btn-sm" data-act="pool-collapse-all" @click="collapseAll">全部收起</button>
    </div>
    <div v-for="g in visibleGroups" :key="g.user.id" class="pool-user" data-test="pool-user">
      <div class="pool-user-head" :data-user-id="g.user.id" @click="toggleGroup(g.user.id)">
        <span style="color:var(--dnf-text-muted,#9aa3b2);width:12px;display:inline-block">
          {{ collapsed.has(g.user.id) ? '▸' : '▾' }}
        </span>{{ g.user.nickname }}
      </div>
      <div v-if="!collapsed.has(g.user.id)">
        <div v-for="c in g.chars" :key="c.id" class="pool-char"
             :class="{ blocked: blockedCharIds.has(c.id), holding: holdingId === c.id,
                       slack: slackCharIds.has(c.id) }"
             :data-act="`pool-char-${c.id}`" @click="onPick(c)">
          <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:26px;height:26px">
          <div style="flex:1;min-width:0">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              <b>{{ c.name }}</b>
              <span style="color:var(--dnf-text-muted);font-size:12px">
                {{ jobGenderTitle(c.job_name, c.job_title) }} · {{ c.class_type }}
              </span>
            </div>
            <div style="color:var(--dnf-text-faint);font-size:12px">{{ powerText(c) }}</div>
          </div>
          <span v-if="slackCharIds.has(c.id)" class="pool-tag slack">划水</span>
          <span v-if="recommendTop3.has(c.id)" class="pool-tag rec">
            推荐<template v-if="recommendTarget[c.id] != null">→{{ SQUAD_NAMES[recommendTarget[c.id]!] ?? `队${recommendTarget[c.id]! + 1}` }}</template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
```

注意：模板用了 `query` 与 `visibleGroups`（Task 2 才定义）。为让 Task 1 可独立提交，先在本 Task 一并加入：

```ts
// 用户名搜索（角色名不参与、不改折叠态）：空词显示全部
const query = ref('')
const visibleGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return groups.value
  return groups.value.filter(g => g.user.nickname.toLowerCase().includes(q))
})
```

样式追加（scoped style 内，`.pool-user-head` 现有 `font-weight:bold;margin-bottom:4px;color:var(--dnf-text-muted,#9aa3b2)`，改为可点击）：

```css
.pool-user-head { font-weight: bold; margin-bottom: 4px; color: var(--dnf-text-muted,#9aa3b2); cursor: pointer; }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: 现有 10 例 + 新增 3 例全 PASS。

Run: `cd frontend && npm run build` → vue-tsc + vite build 通过（Task 1 独立提交，需自身过编译门槛）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RosterPool.vue frontend/src/components/RosterPool.spec.ts
git commit -m "feat: 编队角色池用户组折叠 + 全部展开/收起按钮

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: 用户名搜索框（昵称过滤）

**Files:**
- Modify: `frontend/src/components/RosterPool.vue`
- Test: `frontend/src/components/RosterPool.spec.ts`

**上下文：** Task 1 已实现工具栏（含 `data-act="pool-search"` 输入框 + 折叠状态）。本任务补搜索过滤用例，验证搜索按昵称整组过滤、不改折叠态。

- [ ] **Step 1: 写失败测试**（追加到 `describe('RosterPool')` 内）

```ts
it('搜索按昵称过滤：匹配组保留、不匹配整组隐藏', async () => {
  const w = mountPool()
  await w.find('[data-act="pool-search"]').setValue('甲')
  expect(w.findAll('[data-test="pool-user"]').length).toBe(1)
  expect(w.text()).toContain('剑魂')     // 甲 组角色在
  expect(w.text()).not.toContain('划水剑') // 乙(c3) 整组隐藏
  await w.find('[data-act="pool-search"]').setValue('不存在')
  expect(w.findAll('[data-test="pool-user"]').length).toBe(0)
})

it('搜索不改变折叠态：折叠组在搜索中仍收起', async () => {
  const w = mountPool()
  await w.find('[data-user-id="2"]').trigger('click')      // 收起 乙 组
  await w.find('[data-act="pool-search"]').setValue('乙')  // 搜索命中 乙 组
  expect(w.find('[data-act="pool-char-12"]').exists()).toBe(false)  // 仍收起
  expect(w.find('[data-user-id="2"]').text()).toContain('▸')
  await w.find('[data-act="pool-search"]').setValue('')    // 清空
  expect(w.find('[data-act="pool-char-12"]').exists()).toBe(false)  // 折叠态保留
  expect(w.findAll('[data-test="pool-user"]').length).toBe(2)
})
```

注意：`pool-char-12` 是 c3「划水剑」（`RosterPool.spec.ts:13`，属于 u2=乙）。搜索「乙」命中 乙 组，但该组已收起 → 角色不渲染。

- [ ] **Step 2: 运行测试确认通过（Task 1 已接入搜索，红态为既定设计）**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: 2 个新用例直接 PASS——Task 1 Step 3 已把 `query`/`visibleGroups` 与 `v-for="g in visibleGroups"` 全部接好（为模板可编译所必需），因此 Task 2 无独立红态；若 Task 1 实际未接入（改用 `v-for="g in groups"` 交付），则此步会 FAIL，正好在 Step 3 补接。

- [ ] **Step 3: 实现**

若 Task 1 已按上述模板实现（含 `query`/`visibleGroups`），本 Task 代码应已存在——**先运行确认通过**；若 `visibleGroups` 未接入（Task 1 只做了折叠、模板仍 `v-for="g in groups"`），则：

- 将模板 `v-for="g in groups"` 改为 `v-for="g in visibleGroups"`。
- 加入 `query` ref 与 `visibleGroups` computed（代码同 Task 1 Step 3 中的片段）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: 全部用例（现有 10 + Task1 3 + Task2 2 = 15）PASS。

- [ ] **Step 5: 全量回归 + 类型/构建**

Run: `cd frontend && npx vitest run` → 全量通过（含 `RosterView.spec.ts` 的池交互断言）。
Run: `cd frontend && npm run build` → vue-tsc + vite build 通过。

- [ ] **Step 6: 手动验证**

浏览器打开编队页角色池：①点用户名收起/展开、指示符切换；②全部展开/全部收起生效；③搜索「某昵称」整组过滤、搜索不丢折叠态、清空恢复。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/RosterPool.vue frontend/src/components/RosterPool.spec.ts
git commit -m "feat: 编队角色池用户名搜索（昵称过滤，不改折叠态）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 验收标准

- 点用户名头折叠/展开该组角色（默认全展开，收起角色从 DOM 移除，`▸/▾` 指示符）。
- 「全部展开/全部收起」作用于全部用户组（含被搜索隐藏的），一键生效。
- 搜索框按昵称子串整组过滤，角色名不参与、不改变折叠态，清空恢复。
- `RosterPool.spec.ts` 现有 10 例 + 新增 5 例全过；全量前端测试与 `npm run build` 通过；后端零改动。
