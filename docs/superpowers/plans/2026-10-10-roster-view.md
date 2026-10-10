# 编队总览页（RosterView）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增独立编队总览页 `/raids/:id/roster`——左侧报名角色池 + 右侧波×团×队格子网格，点选拿起→点格放下完成整场编队；带每队目标模板（localStorage）、达标实时徽章、可开关的推荐排序（解决「怎么排最优费神」），以及「本波/全局未排」状态条（解决「想不起谁还没排」）。

**Architecture:** 纯前端（后端零改动）。页面复用 `useRaidStore` 快照 + `connectRaidWs` 实时同步；所有写操作复用现有三个端点——`POST /slots/{id}/fill {character_id, duty, replace:true}`（自动撤冲突格）、`DELETE /slots/{id}`、`PUT /slots/{id}/duty`。纯逻辑（模板读写、达标计算、推荐排序、职责推断）抽到 `lib/roster.ts` 便于 TDD 单测；页面编排在 `RosterView.vue`，拆 `RosterPool`/`RosterGrid`/`RosterSlot`/`RosterTargetModal` 子组件。

**Tech Stack:** Vue 3 `<script setup>` + Pinia + naive-ui + Vitest + vue-tsc（frontend）。本计划无后端改动。

**测试命令：** 前端单测 `cd frontend && npx vitest run <file>`；类型/构建 `cd frontend && npm run build`（= vue-tsc -b && vite build）。

---

## 文件结构

**前端（frontend/src/）：**
- `lib/roster.ts` — 纯函数：`SquadTarget` 类型、`loadTargets`/`saveTargets`（localStorage）、`inferFillDuty`（职责决策表）、`computeSquadStatus`（达标）、`rankCandidates`/`sortByPower`（推荐排序）、`squadSlotsOf`（Create）
- `views/RosterView.vue` — 页面编排：顶部栏（波标签/推荐开关/未排条）+ 布局 + 拿起状态机 + API 调用（Create）
- `components/RosterPool.vue` — 左角色池：按报名用户分组、状态（本波已用/可用/拿起/划水）、推荐角标（Create）
- `components/RosterGrid.vue` — 右网格：波内并行团并排、队组头部达标徽章 + 编辑目标按钮（Create）
- `components/RosterSlot.vue` — 单格：空/已占、职责下拉、撤下/拿起菜单（Create）
- `components/RosterTargetModal.vue` — 每队目标编辑弹窗（Create）
- `router/index.ts` — 新增 `/raids/:id/roster` 路由（Modify）
- `views/RaidDetailView.vue` — 顶栏加「编队」按钮（仅管理员）（Modify）

**前端测试（frontend/src/）：**
- `lib/roster.spec.ts` — 纯函数单测（Create）
- `views/RosterView.spec.ts` — 页面集成测试（Create）
- `views/RaidDetailView.spec.ts` — 编队按钮显隐（Modify）

---

## Task 1: lib/roster.ts — 模板存取 + 职责决策表

**Files:**
- Create: `frontend/src/lib/roster.ts`
- Test: `frontend/src/lib/roster.spec.ts`

- [ ] **Step 1: 写失败测试**（`// @vitest-environment jsdom`，localStorage 需 jsdom）

```ts
// frontend/src/lib/roster.spec.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadTargets, saveTargets, inferFillDuty, RECOMMEND_KEY } from './roster'
import type { Slot } from '../types'

function slot(duty: string | null, classType: string | null = '输出'): Slot {
  return {
    id: 0, squad_index: 0, row_index: 0, character_id: duty ? 1 : null,
    character_name: duty ? 'x' : null, character_class: classType, job_name: null, job_title: null,
    fame: null, simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    owner_id: null, owner_nickname: null, owner_avatar: null, duty: duty as any, version: 1,
  }
}

beforeEach(() => localStorage.clear())

describe('模板 localStorage 读写', () => {
  it('saveTargets 后 loadTargets 可还原', () => {
    const t = { 0: { outputs: { count: 2, simMin: 20000, simMax: 25000 }, mainHeal: { buffMin: 45000 } } }
    saveTargets(7, t)
    expect(loadTargets(7)).toEqual(t)
  })
  it('无数据时返回空对象', () => {
    expect(loadTargets(7)).toEqual({})
  })
  it('RECOMMEND_KEY 常量存在', () => {
    expect(RECOMMEND_KEY).toBe('dnfer-roster-recommend')
  })
})

describe('inferFillDuty 职责决策表（与模板无关，只看队伍状态）', () => {
  it('辅助 + 队已有主奶 → 太阳奶', () => {
    expect(inferFillDuty([slot('主奶', '辅助')], '辅助')).toBe('太阳奶')
  })
  it('辅助 + 队无主奶 → 主奶', () => {
    expect(inferFillDuty([], '辅助')).toBe('主奶')
  })
  it('输出 + 队无主C → 主C', () => {
    expect(inferFillDuty([], '输出')).toBe('主C')
  })
  it('输出 + 队已有主C → 辅C', () => {
    expect(inferFillDuty([slot('主C')], '输出')).toBe('辅C')
  })
  it('辅助 + 队只有太阳奶无主奶 → 主奶（防主奶超限不误伤）', () => {
    expect(inferFillDuty([slot('太阳奶', '辅助')], '辅助')).toBe('主奶')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: FAIL（`./roster` 不存在 ImportError）

- [ ] **Step 3: 实现 lib/roster.ts（本任务部分）**

```ts
// frontend/src/lib/roster.ts
import type { Character, Duty, Slot, Wave } from '../types'

export interface SquadOutputTarget { count?: number; simMin?: number | null; simMax?: number | null }
export interface SquadMainHealTarget { buffMin?: number | null; buffMax?: number | null }
export interface SquadTarget {
  outputs?: SquadOutputTarget
  mainHeal?: SquadMainHealTarget
  sunHeal?: { count?: number }
  slack?: boolean
}
export type SquadTargets = Record<number, SquadTarget>

export const RECOMMEND_KEY = 'dnfer-roster-recommend'
const TARGETS_KEY = (raidId: number) => `dnfer-roster-targets-${raidId}`

export function loadTargets(raidId: number): SquadTargets {
  try {
    const raw = localStorage.getItem(TARGETS_KEY(raidId))
    return raw ? (JSON.parse(raw) as SquadTargets) : {}
  } catch { return {} }
}
export function saveTargets(raidId: number, targets: SquadTargets): void {
  localStorage.setItem(TARGETS_KEY(raidId), JSON.stringify(targets))
}

/** 填格职责决策表：只看队伍当前状态，与模板无关（防后端「至多一名主奶」硬 400）。 */
export function inferFillDuty(squadSlots: Slot[], classType: Character['class_type']): Duty {
  const hasMainHeal = squadSlots.some(s => s.duty === '主奶')
  const hasMainC = squadSlots.some(s => s.duty === '主C')
  if (classType === '辅助') return hasMainHeal ? '太阳奶' : '主奶'
  return hasMainC ? '辅C' : '主C'
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: PASS（8 用例：模板存取 3 + inferFillDuty 5）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts
git commit -m "feat: roster 模板存取与填格职责决策表（纯函数）"
```

---

## Task 2: lib/roster.ts — 达标计算 computeSquadStatus

**Files:**
- Modify: `frontend/src/lib/roster.ts`
- Modify: `frontend/src/lib/roster.spec.ts`

- [ ] **Step 1: 写失败测试**（roster.spec.ts 追加；复用 `slot()` helper）

```ts
import { computeSquadStatus } from './roster'
// 追加到文件 import 行

function os(sim: number | null, duty: string | null = '主C', buff: number | null = null): Slot {
  return { ...slot(duty, '输出'), simulated_damage: sim, sustained_dps: null, buff_amount: buff, sun_buff: null }
}
function aux(duty: string, buff: number | null, sun: number | null = null): Slot {
  return { ...slot(duty, '辅助'), simulated_damage: null, sustained_dps: null, buff_amount: buff, sun_buff: sun }
}

describe('computeSquadStatus 达标计算', () => {
  const target = {
    outputs: { count: 2, simMin: 20000, simMax: 25000 },
    mainHeal: { buffMin: 45000, buffMax: 48000 },
    sunHeal: { count: 1 },
  }
  it('达标：输出数/总伤/主奶增益/太阳奶全满足', () => {
    const st = computeSquadStatus([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.outputOK).toBe(true)
    expect(st.mainHealOK).toBe(true)
    expect(st.sunHealOK).toBe(true)
    expect(st.issues).toEqual([])
  })
  it('缺输出数：2/1 → 未达标并有缺口文案', () => {
    const st = computeSquadStatus([os(20000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.outputOK).toBe(false)
    expect(st.issues.join()).toContain('输出')
  })
  it('总伤低于下限 → 未达标', () => {
    const st = computeSquadStatus([os(5000), os(5000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.outputOK).toBe(false)
    expect(st.issues.join()).toContain('总伤')
  })
  it('主奶增益低于下限 → 未达标', () => {
    const st = computeSquadStatus([os(12000), os(10000), aux('主奶', 40000), aux('太阳奶', 0)], target)
    expect(st.mainHealOK).toBe(false)
  })
  it('单边区间：只设 simMin 时 simMax 不限', () => {
    const st = computeSquadStatus([os(30000), aux('主奶', 46000)], { outputs: { count: 1, simMin: 20000 } })
    expect(st.outputOK).toBe(true)
  })
  it('目标为空对象时视为无要求，全部达标', () => {
    const st = computeSquadStatus([os(1)], undefined)
    expect(st.outputOK).toBe(true)
    expect(st.mainHealOK).toBe(true)
    expect(st.issues).toEqual([])
  })
  it('有划水成员 → 组成要求豁免', () => {
    const st = computeSquadStatus([os(100, '划水')], target)
    expect(st.issues).toEqual([])
  })
  it('统计字段：filled/total/outputCount/mainHealBuff/sunHealCount', () => {
    const st = computeSquadStatus([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.filled).toBe(4); expect(st.total).toBe(4)
    expect(st.outputCount).toBe(2); expect(st.outputTotal).toBe(22000)
    expect(st.mainHealBuff).toBe(46000); expect(st.sunHealCount).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: FAIL（`computeSquadStatus` 未定义）

- [ ] **Step 3: 实现 computeSquadStatus**（roster.ts 追加；输出总伤复用 `sumSquadDamage`）

```ts
// roster.ts 顶部追加 import
import { sumSquadDamage } from './damage'

export interface SquadStatus {
  filled: number; total: number
  outputCount: number; outputTotal: number; outputOK: boolean
  mainHealBuff: number | null; mainHealOK: boolean
  sunHealCount: number; sunHealOK: boolean
  slack: boolean; issues: string[]
}

export function computeSquadStatus(slots: Slot[], target: SquadTarget | undefined): SquadStatus {
  const filled = slots.filter(s => s.character_id != null)
  const outputCount = filled.filter(s => s.character_class === '输出').length
  const outputTotal = sumSquadDamage(filled).simulated
  const mainHeal = filled.find(s => s.duty === '主奶')
  const mainHealBuff = mainHeal?.buff_amount ?? null
  const sunHealCount = filled.filter(s => s.duty === '太阳奶').length
  const slack = filled.some(s => s.duty === '划水') || target?.slack === true
  const issues: string[] = []
  let outputOK = true; let mainHealOK = true; let sunHealOK = true

  if (target && !slack) {
    if (target.outputs?.count != null && outputCount < target.outputs.count) {
      outputOK = false
      issues.push(`输出 ${outputCount}/${target.outputs.count}`)
    }
    if (target.outputs?.simMin != null && outputTotal < target.outputs.simMin) {
      outputOK = false; issues.push(`总伤 ${outputTotal}/${target.outputs.simMin}+`)
    }
    if (target.outputs?.simMax != null && outputTotal > target.outputs.simMax) {
      outputOK = false; issues.push(`总伤 ${outputTotal}/${target.outputs.simMax}-`)
    }
    const hasMainHealTarget = target.mainHeal?.buffMin != null || target.mainHeal?.buffMax != null
    if (hasMainHealTarget) {
      const lowOk = target.mainHeal?.buffMin == null || (mainHealBuff != null && mainHealBuff >= target.mainHeal.buffMin)
      const highOk = target.mainHeal?.buffMax == null || (mainHealBuff != null && mainHealBuff <= target.mainHeal.buffMax)
      if (!lowOk || !highOk) { mainHealOK = false; issues.push('主奶增益') }
    }
    if (target.sunHeal?.count != null && sunHealCount < target.sunHeal.count) {
      sunHealOK = false; issues.push('缺太阳奶')
    }
  }
  return { filled: filled.length, total: slots.length, outputCount, outputTotal, outputOK,
           mainHealBuff, mainHealOK, sunHealCount, sunHealOK, slack, issues }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: PASS（全用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts
git commit -m "feat: roster 小队达标计算 computeSquadStatus（含划水豁免）"
```

---

## Task 3: lib/roster.ts — 推荐排序 rankCandidates + sortByPower

**Files:**
- Modify: `frontend/src/lib/roster.ts`
- Modify: `frontend/src/lib/roster.spec.ts`

- [ ] **Step 1: 写失败测试**（roster.spec.ts 追加）

```ts
import { rankCandidates, squadSlotsOf, sortByPower } from './roster'
import type { Character, Wave } from '../types'

const c1: Character = { id: 1, name: '高伤', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '输出',
  fame: 1, simulated_damage: 30000, sustained_dps: 0, buff_amount: null, sun_buff: null }
const c2: Character = { id: 2, name: '低伤', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '输出',
  fame: 1, simulated_damage: 5000, sustained_dps: 0, buff_amount: null, sun_buff: null }
const healer: Character = { id: 3, name: '奶', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '辅助',
  fame: 1, simulated_damage: null, sustained_dps: null, buff_amount: 46000, sun_buff: 0 }

function wave(id: number, slots: Slot[]): Wave {
  return { id, index: id, group_id: null, round_index: 1, group_index: 1, slots }
}

describe('sortByPower', () => {
  it('输出按模拟伤害降序（null 排最后）', () => {
    const n: Character = { ...c1, id: 3, simulated_damage: null, sustained_dps: null }
    expect(sortByPower([c2, n, c1]).map(x => x.id)).toEqual([1, 2, 3])
  })
})

describe('rankCandidates 推荐排序', () => {
  const targets = { 0: { outputs: { count: 2, simMin: 20000 } } }
  const group = [wave(10, [os(5000)])]  // 红队(0)已有 1 输出 5000，缺 1 输出
  it('推荐开关开 + 有模板：同队缺口相同 → 按战力 tie-break，高伤排前，目标队红队(0)', () => {
    const r = rankCandidates({ candidates: [c2, c1], groups: group, targets, recommendOn: true })
    expect(r[0].character.id).toBe(1)
    expect(r[1].character.id).toBe(2)
    expect(r[0].score).toBe(r[1].score)  // 缺口分是队伍缺口（候选无关），同队同分
    expect(r[0].score).toBeGreaterThan(0)
    expect(r[0].targetSquadIndex).toBe(0)
  })
  it('推荐开关关：按战力排序、score 为 0、无目标队', () => {
    const r = rankCandidates({ candidates: [c2, c1], groups: group, targets, recommendOn: false })
    expect(r.map(x => x.character.id)).toEqual([1, 2])
    expect(r.every(x => x.score === 0 && x.targetSquadIndex === null)).toBe(true)
  })
  it('无模板：全 score 0、按战力排序、无目标队', () => {
    const r = rankCandidates({ candidates: [c2, c1], groups: group, targets: {}, recommendOn: true })
    expect(r.map(x => x.character.id)).toEqual([1, 2])
    expect(r.every(x => x.score === 0 && x.targetSquadIndex === null)).toBe(true)
  })
  it('辅助角色 → 推荐到缺主奶的队', () => {
    const t = { 0: { mainHeal: { buffMin: 45000 } } }
    const g = [wave(10, [os(5000)])]  // 红队无主奶
    const r = rankCandidates({ candidates: [healer], groups: g, targets: t, recommendOn: true })
    expect(r[0].targetSquadIndex).toBe(0)
    expect(r[0].score).toBeGreaterThan(0)
  })
  it('并行团：取缺口更大的团（跨 wave 比较）', () => {
    const g2 = [wave(10, [os(5000)]), wave(20, [os(30000)])]  // 团1(wave 10)红队缺1输出，团2(wave 20)已满
    const r = rankCandidates({ candidates: [c1], groups: g2, targets, recommendOn: true })
    expect(r[0].targetWaveId).toBe(10)
    expect(r[0].score).toBeGreaterThan(0)
  })
})

describe('squadSlotsOf', () => {
  it('按 squad_index 分组', () => {
    const s0 = { ...slot('主C'), id: 1, squad_index: 0 }
    const s1a = { ...slot('主C'), id: 2, squad_index: 1 }
    const s1b = { ...slot('主C'), id: 3, squad_index: 1 }
    const groups = squadSlotsOf(wave(10, [s0, s1a, s1b]))
    expect(groups.length).toBe(2)
    expect(groups[1].map(s => s.id)).toEqual([2, 3])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: FAIL（`rankCandidates`/`sortByPower`/`squadSlotsOf` 未定义）

- [ ] **Step 3: 实现推荐排序**（roster.ts 追加）

```ts
export interface RankedCandidate {
  character: Character
  score: number
  targetSquadIndex: number | null
  targetWaveId: number | null
}

export function powerValue(c: Character): number {
  return c.class_type === '输出' ? (c.simulated_damage ?? -Infinity) : (c.buff_amount ?? -Infinity)
}
export function sortByPower(list: Character[]): Character[] {
  return [...list].sort((a, b) => powerValue(b) - powerValue(a))
}

export function squadSlotsOf(wave: Wave): Slot[][] {
  const n = wave.slots.length ? Math.max(...wave.slots.map(s => s.squad_index)) + 1 : 0
  return Array.from({ length: n }, (_, sq) => wave.slots.filter(s => s.squad_index === sq))
}

function squadGap(slots: Slot[], target: SquadTarget | undefined): number {
  if (!target || target.slack) return 0
  const st = computeSquadStatus(slots, target)
  let gap = 0
  if (target.outputs?.count != null) gap += Math.max(0, target.outputs.count - st.outputCount)
  if (target.outputs?.simMin != null && st.outputTotal < target.outputs.simMin) gap += 1
  if (target.mainHeal?.buffMin != null && (st.mainHealBuff == null || st.mainHealBuff < target.mainHeal.buffMin)) gap += 1
  if (target.sunHeal?.count != null) gap += Math.max(0, target.sunHeal.count - st.sunHealCount)
  return gap
}

/** 候选角色是否适配某队（按模板所需角色类型 + 队伍状态）。无模板 → 不认为适配。
 *  输出分支含 simMin 缺口（与 squadGap 一致）：输出数已够+有主C 但总伤低于下限的「缺总伤」场景也要能匹配，
 *  否则所有输出候选被判不匹配、推荐静默退化（审阅修复，提交 fdb33fb）。 */
function candidateFitsSquad(c: Character, slots: Slot[], target: SquadTarget | undefined): boolean {
  if (!target) return false
  const st = computeSquadStatus(slots, target)
  if (c.class_type === '输出') {
    const needCount = (target.outputs?.count ?? 0) > st.outputCount
    const needMainC = !slots.some(s => s.duty === '主C')
    const needDmg = target.outputs?.simMin != null && st.outputTotal < target.outputs.simMin
    return needCount || needMainC || needDmg
  }
  const needHeal = target.mainHeal?.buffMin != null || target.mainHeal?.buffMax != null
  const needSun = (target.sunHeal?.count ?? 0) > st.sunHealCount
  return needHeal || needSun
}

export function rankCandidates(opts: {
  candidates: Character[]
  groups: Wave[]
  targets: SquadTargets
  recommendOn: boolean
}): RankedCandidate[] {
  if (!opts.recommendOn) {
    return sortByPower(opts.candidates).map(c => ({
      character: c, score: 0, targetSquadIndex: null, targetWaveId: null,
    }))
  }
  const ranked = opts.candidates.map(c => {
    let best: RankedCandidate = { character: c, score: 0, targetSquadIndex: null, targetWaveId: null }
    for (const w of opts.groups) {
      squadSlotsOf(w).forEach((slots, si) => {
        const target = opts.targets[si]
        if (!candidateFitsSquad(c, slots, target)) return
        const g = squadGap(slots, target)
        if (g > best.score) best = { character: c, score: g, targetSquadIndex: si, targetWaveId: w.id }
      })
    }
    return best
  })
  return ranked.sort((a, b) => b.score - a.score || powerValue(b.character) - powerValue(a.character))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: PASS（全用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts
git commit -m "feat: roster 推荐排序 rankCandidates/sortByPower/squadSlotsOf（纯函数）"
```

---

## Task 4: 路由 + 详情页「编队」入口

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/views/RaidDetailView.vue`
- Modify: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: 写失败测试**（RaidDetailView.spec.ts 追加）

```ts
describe('RosterView 入口', () => {
  it('管理员看到「编队」按钮', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin)
    expect(wrapper.find('[data-test="roster-link"]').exists()).toBe(true)
  })
  it('非管理员看不到「编队」按钮', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], member)
    expect(wrapper.find('[data-test="roster-link"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: FAIL（找不到 `data-test="roster-link"`）

- [ ] **Step 3: 实现路由 + 按钮**

`router/index.ts`（在 `/raids/:id` 后加一行）：
```ts
{ path: '/raids/:id', component: () => import('../views/RaidDetailView.vue') },
{ path: '/raids/:id/roster', component: () => import('../views/RosterView.vue') },
```

`RaidDetailView.vue`（顶栏管理员按钮组，`onToggleLock` 前加）：
```vue
<router-link v-if="auth.isAdmin" class="dnf-btn dnf-btn-sm" data-test="roster-link"
             :to="`/raids/${store.raid.id}/roster`">编队</router-link>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: PASS（含既有 + 2 新用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/router/index.ts frontend/src/views/RaidDetailView.vue frontend/src/views/RaidDetailView.spec.ts
git commit -m "feat: 编队总览页路由与详情页入口（仅管理员）"
```

---

## Task 5: RosterSlot.vue 单格组件

**Files:**
- Create: `frontend/src/components/RosterSlot.vue`
- Test: `frontend/src/components/RosterSlot.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/RosterSlot.spec.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterSlot from './RosterSlot.vue'
import type { Slot } from '../types'

const emptySlot: Slot = { id: 1, squad_index: 0, row_index: 0, character_id: null, character_name: null,
  character_class: null, job_name: null, job_title: null, fame: null, simulated_damage: null,
  sustained_dps: null, buff_amount: null, sun_buff: null, owner_id: null, owner_nickname: null,
  owner_avatar: null, duty: null, version: 1 }
const filledSlot: Slot = { ...emptySlot, id: 2, character_id: 10, character_name: '剑魂',
  character_class: '输出', job_name: 'weapon_master', job_title: '极诣·剑魂',
  simulated_damage: 12000, sustained_dps: 3000, owner_id: 3, owner_nickname: '队员',
  duty: '主C', version: 2 }

function mountSlot(props: Record<string, unknown>) {
  return mount(RosterSlot, { props: { slot: emptySlot, canEdit: true, dropTarget: false, ...props },
    global: { stubs: { DutySelect: true, UserAvatar: true, teleport: true } } })
}

describe('RosterSlot', () => {
  it('空格在 dropTarget 时显示占位按钮', async () => {
    const w = mountSlot({ dropTarget: true })
    expect(w.text()).toContain('＋')
  })
  it('空格非 dropTarget 不显示占位按钮', () => {
    const w = mountSlot({})
    expect(w.text()).not.toContain('＋')
  })
  it('dropTarget 空格点击 emit place', async () => {
    const w = mountSlot({ dropTarget: true })
    await w.find('.roster-slot').trigger('click')
    expect(w.emitted('place')).toBeTruthy()
  })
  it('已占格显示 owner/角色名/数值', () => {
    const w = mountSlot({ slot: filledSlot })
    expect(w.text()).toContain('队员'); expect(w.text()).toContain('剑魂')
    expect(w.text()).toContain('12000')
  })
  it('已占格 canEdit 时显示撤下与拿起', () => {
    const w = mountSlot({ slot: filledSlot })
    expect(w.text()).toContain('撤下'); expect(w.text()).toContain('拿起')
  })
  it('撤下点击 emit remove', async () => {
    const w = mountSlot({ slot: filledSlot })
    await w.find('[data-act="roster-remove"]').trigger('click')
    expect(w.emitted('remove')).toBeTruthy()
  })
  it('拿起点击 emit pickUp', async () => {
    const w = mountSlot({ slot: filledSlot })
    await w.find('[data-act="roster-pickup"]').trigger('click')
    expect(w.emitted('pickUp')).toBeTruthy()
  })
  it('已占格点击 emit manage', async () => {
    const w = mountSlot({ slot: filledSlot })
    await w.find('.roster-slot').trigger('click')
    expect(w.emitted('manage')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/RosterSlot.spec.ts`
Expected: FAIL（找不到 `./RosterSlot.vue`）

- [ ] **Step 3: 实现 RosterSlot.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Slot } from '../types'
import DutySelect from './DutySelect.vue'

const props = withDefaults(defineProps<{
  slot: Slot
  canEdit: boolean
  dropTarget: boolean   // 拿起态下空格为可放入目标
}>(), {})
const emit = defineEmits<{
  (e: 'place', slot: Slot): void
  (e: 'manage', slot: Slot): void
  (e: 'remove', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'pickUp', slot: Slot): void
}>()

const occupied = computed(() => props.slot.character_id != null)
const attrs = computed(() => {
  const s = props.slot
  if (s.character_class === '输出') return `模拟 ${fmtDps(s.simulated_damage)} · 秒伤 ${fmtDps(s.sustained_dps)}`
  if (s.character_class === '辅助') return `增益 ${fmtBuff(s.buff_amount)} · 太阳 ${fmtBuff(s.sun_buff)}`
  return ''
})
// 与 SlotCell 一致：输出带「亿」单位，增益/太阳是裸数值（审阅修复，提交 5737a66）
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
function onCellClick() {
  if (occupied.value) { if (props.canEdit) emit('manage', props.slot); return }
  if (props.dropTarget) emit('place', props.slot)
}
</script>

<template>
  <div class="roster-slot" :class="{ occupied, empty: !occupied, 'drop-target': dropTarget && !occupied }"
       @click="onCellClick">
    <template v-if="occupied">
      <div>
        <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
        <span style="color:var(--dnf-text-muted);font-size:12px">（{{ slot.character_name }}）</span>
        <img v-if="slot.job_name" :src="jobIcon(slot.job_name)" @error="onIconError"
             style="width:18px;height:18px;margin-left:6px;vertical-align:middle">
        <DutySelect v-if="canEdit" :class-type="slot.character_class!" :model-value="slot.duty"
                    @click.stop @update:model-value="(d) => emit('duty', slot, d)" />
        <span v-else class="dnf-badge" style="font-size:11px;color:var(--dnf-gold-hi);border-color:var(--dnf-gold-deep)">
          {{ slot.duty }}
        </span>
      </div>
      <div style="color:var(--dnf-text-faint);font-size:12px;margin-top:2px">
        {{ attrs }}
        <template v-if="canEdit">
          <a href="#" style="margin-left:8px;color:var(--dnf-danger)"
             data-act="roster-remove" @click.prevent.stop="emit('remove', slot)">撤下</a>
          <a href="#" style="margin-left:8px;color:var(--dnf-gold-hi)"
             data-act="roster-pickup" @click.prevent.stop="emit('pickUp', slot)">拿起</a>
        </template>
      </div>
    </template>
    <button v-else-if="dropTarget" class="pick-btn" @click.stop="emit('place', slot)">＋ 放入</button>
    <span v-else>—</span>
  </div>
</template>

<style scoped>
.roster-slot { border: 1px solid var(--dnf-border,#3a3f4b); border-radius: 6px; padding: 6px 8px; min-height: 52px; }
.roster-slot.drop-target { cursor: pointer; border-style: dashed; border-color: var(--dnf-accent,#ffd54a); }
.roster-slot.occupied { cursor: pointer; }
.pick-btn { background: none; border: none; color: var(--dnf-accent,#ffd54a); cursor: pointer; font: inherit; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/RosterSlot.spec.ts`
Expected: PASS（全用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RosterSlot.vue frontend/src/components/RosterSlot.spec.ts
git commit -m "feat: RosterSlot 编队单格组件（空/已占/职责/撤下/拿起）"
```

---

## Task 6: RosterPool.vue 角色池组件

**Files:**
- Create: `frontend/src/components/RosterPool.vue`
- Test: `frontend/src/components/RosterPool.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/RosterPool.spec.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterPool from './RosterPool.vue'
import type { Character, RaidSignup, User } from '../types'

const u1: User = { id: 1, username: 'a', nickname: '甲', is_admin: false, avatar: null, is_banned: false }
const u2: User = { id: 2, username: 'b', nickname: '乙', is_admin: false, avatar: null, is_banned: false }
const c1: Character = { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂', parent_name: '鬼剑士',
  class_type: '输出', fame: 1, simulated_damage: 30000, sustained_dps: 0, buff_amount: null, sun_buff: null }
const c2: Character = { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士', parent_name: '圣职者',
  class_type: '辅助', fame: 1, simulated_damage: null, sustained_dps: null, buff_amount: 46000, sun_buff: 0 }
const c3: Character = { ...c1, id: 12, name: '划水剑', simulated_damage: 100 }
const signups: RaidSignup[] = [
  { user: u1, created_at: null, characters: [c1, c2] },
  { user: u2, created_at: 'x', characters: [c3] },
]

function mountPool(overrides: Record<string, unknown> = {}) {
  return mount(RosterPool, {
    props: {
      signups, blockedCharIds: new Set<number>(), slackCharIds: new Set<number>(),
      recommendTop3: new Set<number>(), recommendTarget: {}, holdingId: null, canEdit: true,
      ...overrides,
    },
    global: { stubs: { UserAvatar: true, teleport: true } },
  })
}

describe('RosterPool', () => {
  it('按用户分组显示', () => {
    const w = mountPool()
    expect(w.text()).toContain('甲'); expect(w.text()).toContain('乙')
    expect(w.text()).toContain('剑魂'); expect(w.text()).toContain('奶')
  })
  it('blocked 角色置灰且点击不 emit pick', async () => {
    const w = mountPool({ blockedCharIds: new Set([10]) })
    const card = w.find('[data-act="pool-char-10"]')
    expect(card.classes()).toContain('blocked')
    await card.trigger('click')
    expect(w.emitted('pick')).toBeFalsy()
  })
  it('可用角色点击 emit pick', async () => {
    const w = mountPool()
    await w.find('[data-act="pool-char-11"]').trigger('click')
    expect(w.emitted('pick')?.[0]?.[0].id).toBe(11)
  })
  it('划水角色标灰 + 划水角标', () => {
    const w = mountPool({ slackCharIds: new Set([12]) })
    expect(w.find('[data-act="pool-char-12"]').text()).toContain('划水')
  })
  it('推荐 top3 显示 推荐 角标 + 目标队色', () => {
    const w = mountPool({ recommendTop3: new Set([10]), recommendTarget: { 10: 0 } })
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('推荐')
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('红队')
  })
  it('拿起角色高亮', () => {
    const w = mountPool({ holdingId: 10 })
    expect(w.find('[data-act="pool-char-10"]').classes()).toContain('holding')
  })
  it('非编辑态点击不 emit pick', async () => {
    const w = mountPool({ canEdit: false })
    await w.find('[data-act="pool-char-11"]').trigger('click')
    expect(w.emitted('pick')).toBeFalsy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: FAIL（找不到 `./RosterPool.vue`）

- [ ] **Step 3: 实现 RosterPool.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
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
    <div v-for="g in groups" :key="g.user.id" class="pool-user">
      <div class="pool-user-head">{{ g.user.nickname }}</div>
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
          推荐<template v-if="recommendTarget[c.id] != null">→{{ SQUAD_NAMES[recommendTarget[c.id]!] }}</template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pool-user { margin-bottom: 10px; }
.pool-user-head { font-weight: bold; margin-bottom: 4px; color: var(--dnf-text-muted,#9aa3b2); }
.pool-char { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--dnf-border,#3a3f4b);
  border-radius: 6px; margin-bottom: 4px; cursor: pointer; }
.pool-char.blocked, .pool-char.slack { opacity: .45; filter: grayscale(1); cursor: default; }
.pool-char.holding { border-color: var(--dnf-accent,#ffd54a); background: rgba(255,213,74,.08); }
.pool-tag { flex-shrink: 0; font-size: 11px; border-radius: 4px; padding: 2px 6px; }
.pool-tag.slack { background: var(--dnf-danger,#e5484d); color: #fff; }
.pool-tag.rec { background: var(--dnf-gold,#ffd54a); color: #1a1205; font-weight: bold; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: PASS（全用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RosterPool.vue frontend/src/components/RosterPool.spec.ts
git commit -m "feat: RosterPool 编队角色池（分组/状态/推荐角标）"
```

---

## Task 7: RosterGrid.vue 网格组件

**Files:**
- Create: `frontend/src/components/RosterGrid.vue`
- Test: `frontend/src/components/RosterGrid.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/RosterGrid.spec.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterGrid from './RosterGrid.vue'
import type { Slot, Wave } from '../types'

const empty = (id: number, sq: number): Slot => ({ id, squad_index: sq, row_index: 0, character_id: null,
  character_name: null, character_class: null, job_name: null, job_title: null, fame: null,
  simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
  owner_id: null, owner_nickname: null, owner_avatar: null, duty: null, version: 1 })
const out = (id: number, sq: number): Slot => ({ ...empty(id, sq), character_id: 10, character_name: '剑魂',
  character_class: '输出', simulated_damage: 12000, owner_id: 3, owner_nickname: '队员', duty: '主C', version: 2 })
const wave = (id: number, slots: Slot[]): Wave => ({ id, index: id, group_id: null, round_index: 1, group_index: 1, slots })

function mountGrid(overrides: Record<string, unknown> = {}) {
  return mount(RosterGrid, {
    props: {
      groups: [wave(1, [out(1, 0), empty(2, 0)])],
      targets: {}, canEdit: true, holding: null, ...overrides,
    },
    global: { stubs: { RosterSlot: { template: '<div class="roster-slot-stub" />' }, teleport: true } },
  })
}

describe('RosterGrid', () => {
  it('渲染团 + 队组头部（红队/已填 x/y）', () => {
    const w = mountGrid()
    expect(w.text()).toContain('红队')
    expect(w.text()).toContain('1/2')
  })
  it('并行团并排渲染（两列）', () => {
    const w = mountGrid({ groups: [wave(1, [empty(1, 0)]), wave(2, [empty(2, 0)])] })
    expect(w.findAll('.roster-group').length).toBe(2)
  })
  it('有目标时队头显示缺口文案', () => {
    const w = mountGrid({ targets: { 0: { outputs: { count: 2 } } } })
    expect(w.text()).toContain('输出')
  })
  it('编辑目标按钮 emit editTarget', async () => {
    const w = mountGrid()
    await w.find('[data-act="edit-target-0"]').trigger('click')
    expect(w.emitted('editTarget')?.[0]?.[0]).toBe(0)
  })
  it('编辑目标按钮非编辑态隐藏', () => {
    const w = mountGrid({ canEdit: false })
    expect(w.find('[data-act="edit-target-0"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/RosterGrid.spec.ts`
Expected: FAIL（找不到 `./RosterGrid.vue`）

- [ ] **Step 3: 实现 RosterGrid.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Character, Slot, Wave } from '../types'
import RosterSlot from './RosterSlot.vue'
import { SQUAD_NAMES } from '../lib/colors'
import { computeSquadStatus, squadSlotsOf } from '../lib/roster'
import type { SquadTargets } from '../lib/roster'

const props = defineProps<{
  groups: Wave[]           // 当前轮所有并行团
  targets: SquadTargets
  canEdit: boolean
  holding: Character | null
}>()
const emit = defineEmits<{
  (e: 'place', slot: Slot): void
  (e: 'manage', slot: Slot): void
  (e: 'remove', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'pickUp', slot: Slot): void
  (e: 'editTarget', squadIndex: number): void
}>()

function groupLabel(w: Wave): string {
  return w.group_id == null ? `第 ${w.round_index} 波` : `第 ${w.round_index} 波 ${w.group_index} 团`
}
function squadsOf(w: Wave): { index: number; slots: Slot[] }[] {
  return squadSlotsOf(w).map((slots, i) => ({ index: i, slots }))
}
const squadNames = computed(() => SQUAD_NAMES)
</script>

<template>
  <div class="roster-grid">
    <div v-for="g in groups" :key="g.id" class="roster-group">
      <div class="roster-group-label">{{ groupLabel(g) }}</div>
      <div v-for="sq in squadsOf(g)" :key="sq.index" class="roster-squad">
        <div class="roster-squad-head">
          <b>{{ squadNames[sq.index] ?? `队${sq.index + 1}` }}</b>
          <span style="color:var(--dnf-text-faint)">
            {{ sq.slots.filter(s => s.character_id != null).length }}/{{ sq.slots.length }}
          </span>
          <button v-if="canEdit" class="dnf-btn dnf-btn-sm"
                  :data-act="`edit-target-${sq.index}`" @click="emit('editTarget', sq.index)">目标</button>
        </div>
        <div v-if="targets[sq.index]" class="roster-squad-status"
             :class="computeSquadStatus(sq.slots, targets[sq.index]).issues.length ? 'warn' : 'ok'">
          <template v-if="computeSquadStatus(sq.slots, targets[sq.index]).issues.length">
            {{ computeSquadStatus(sq.slots, targets[sq.index]).issues.join(' · ') }}
          </template>
          <template v-else>达标 ✓</template>
        </div>
        <RosterSlot v-for="s in sq.slots" :key="s.id" :slot="s" :can-edit="canEdit"
                    :drop-target="holding != null && s.character_id == null"
                    @place="emit('place', $event)" @manage="emit('manage', $event)"
                    @remove="emit('remove', $event)" @duty="(s2, d) => emit('duty', s2, d)"
                    @pickUp="emit('pickUp', $event)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.roster-grid { display: flex; gap: 16px; flex-wrap: wrap; }
.roster-group { flex: 1; min-width: 280px; }
.roster-group-label { font-weight: bold; margin-bottom: 8px; }
.roster-squad { margin-bottom: 14px; }
.roster-squad-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.roster-squad-status { font-size: 12px; padding: 2px 6px; border-radius: 4px; margin-bottom: 6px; }
.roster-squad-status.warn { color: var(--dnf-danger,#e5484d); }
.roster-squad-status.ok { color: var(--dnf-ok,#4ade80); }
</style>
```

注意：`data-act` 用动态绑定 `edit-target-${sq.index}`（测试按 `[data-act="edit-target-0"]` 定位）。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/RosterGrid.spec.ts`
Expected: PASS（全用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RosterGrid.vue frontend/src/components/RosterGrid.spec.ts
git commit -m "feat: RosterGrid 编队网格（并行团/达标徽章/编辑目标）"
```

---

## Task 8: RosterTargetModal.vue 目标编辑弹窗

**Files:**
- Create: `frontend/src/components/RosterTargetModal.vue`
- Test: `frontend/src/components/RosterTargetModal.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/RosterTargetModal.spec.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterTargetModal from './RosterTargetModal.vue'
import type { SquadTarget } from '../lib/roster'

async function mountModal(target: SquadTarget | null) {
  const w = mount(RosterTargetModal, {
    props: { open: true, squadLabel: '红队', target },
    global: { stubs: { teleport: true } },
  })
  await w.vm.$nextTick()
  return w
}

describe('RosterTargetModal', () => {
  it('已有目标预填输入框', async () => {
    const w = await mountModal({ outputs: { count: 2, simMin: 20000, simMax: 25000 },
      mainHeal: { buffMin: 45000 }, sunHeal: { count: 1 } })
    // naive-ui 的 data-test 落在 n-input-number 根 div，需下沉到 input（沿用 RaidDetailView.spec 的 `... input` 惯例）
    expect((w.find('[data-test="tgt-out-count"] input').element as HTMLInputElement).value).toBe('2')
    expect((w.find('[data-test="tgt-sim-min"] input').element as HTMLInputElement).value).toBe('20000')
  })
  it('保存 emit 规范化后的 target', async () => {
    const w = await mountModal({})
    await w.find('[data-test="tgt-save"]').trigger('click')
    const saved = w.emitted('save')?.[0]?.[0] as SquadTarget
    expect(saved.outputs).toBeUndefined()
  })
  it('关闭 emit close', async () => {
    const w = await mountModal({})
    await w.find('[data-test="tgt-close"]').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/RosterTargetModal.spec.ts`
Expected: FAIL（找不到 `./RosterTargetModal.vue`）

- [ ] **Step 3: 实现 RosterTargetModal.vue**（naive-ui 表单，规范化空值）

```vue
<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { NModal, NInputNumber, NCheckbox } from 'naive-ui'
import type { SquadTarget } from '../lib/roster'

const props = defineProps<{ open: boolean; squadLabel: string; target: SquadTarget | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'save', t: SquadTarget): void }>()

interface Draft {
  outCount: number | null; simMin: number | null; simMax: number | null
  buffMin: number | null; buffMax: number | null; sunCount: number | null; slack: boolean
}
const draft = reactive<Draft>({ outCount: null, simMin: null, simMax: null,
  buffMin: null, buffMax: null, sunCount: null, slack: false })

watch(() => props.open, (open) => {
  if (!open) return
  const t = props.target ?? {}
  draft.outCount = t.outputs?.count ?? null
  draft.simMin = t.outputs?.simMin ?? null
  draft.simMax = t.outputs?.simMax ?? null
  draft.buffMin = t.mainHeal?.buffMin ?? null
  draft.buffMax = t.mainHeal?.buffMax ?? null
  draft.sunCount = t.sunHeal?.count ?? null
  draft.slack = t.slack ?? false
}, { immediate: true })  // immediate：测试直接以 open:true 挂载也要预填

function num(n: number | null): number | undefined { return n == null ? undefined : n }
function toTarget(): SquadTarget {
  const t: SquadTarget = {}
  if (draft.outCount != null || draft.simMin != null || draft.simMax != null) {
    t.outputs = { count: num(draft.outCount), simMin: num(draft.simMin), simMax: num(draft.simMax) }
  }
  if (draft.buffMin != null || draft.buffMax != null) {
    t.mainHeal = { buffMin: num(draft.buffMin), buffMax: num(draft.buffMax) }
  }
  if (draft.sunCount != null) t.sunHeal = { count: num(draft.sunCount) }
  if (draft.slack) t.slack = true
  return t
}
</script>

<template>
  <n-modal :show="open" preset="card" :title="`${squadLabel} 编队目标`" style="width:min(380px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="tgt-row"><span class="tgt-label">输出个数</span>
        <n-input-number v-model:value="draft.outCount" data-test="tgt-out-count" :min="0" style="width:90px" /></div>
      <div class="tgt-row"><span class="tgt-label">总模拟伤害下限</span>
        <n-input-number v-model:value="draft.simMin" data-test="tgt-sim-min" :min="0" style="width:140px" /></div>
      <div class="tgt-row"><span class="tgt-label">总模拟伤害上限</span>
        <n-input-number v-model:value="draft.simMax" data-test="tgt-sim-max" :min="0" style="width:140px" /></div>
      <div class="tgt-row"><span class="tgt-label">主奶增益下限</span>
        <n-input-number v-model:value="draft.buffMin" data-test="tgt-buff-min" :min="0" style="width:140px" /></div>
      <div class="tgt-row"><span class="tgt-label">主奶增益上限</span>
        <n-input-number v-model:value="draft.buffMax" data-test="tgt-buff-max" :min="0" style="width:140px" /></div>
      <div class="tgt-row"><span class="tgt-label">太阳奶个数</span>
        <n-input-number v-model:value="draft.sunCount" data-test="tgt-sun-count" :min="0" style="width:90px" /></div>
      <n-checkbox v-model:checked="draft.slack" data-test="tgt-slack">划水豁免（不计较输出/奶量）</n-checkbox>
    </div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="dnf-btn" data-test="tgt-close" @click="emit('close')">取消</button>
        <button class="dnf-btn dnf-btn-primary" data-test="tgt-save" @click="emit('save', toTarget())">保存</button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.tgt-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tgt-label { color: var(--dnf-text-muted,#9aa3b2); }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/RosterTargetModal.spec.ts`
Expected: PASS（全用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RosterTargetModal.vue frontend/src/components/RosterTargetModal.spec.ts
git commit -m "feat: RosterTargetModal 小队目标编辑弹窗"
```

---

## Task 9: RosterView.vue 页面编排

**Files:**
- Create: `frontend/src/views/RosterView.vue`
- Test: `frontend/src/views/RosterView.spec.ts`

- [ ] **Step 1: 写失败测试**（仿 RaidDetailView.spec 的 mountView 约定；**用真实 RosterPool/RosterGrid/RosterSlot 子组件**做端到端集成，只 stub DutySelect/UserAvatar/RosterTargetModal/teleport/router-link）

```ts
// frontend/src/views/RosterView.spec.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import RosterView from './RosterView.vue'
import { useAuthStore } from '../stores/auth'
import { useRaidStore } from '../stores/raid'
import { confirmDialog } from '../lib/notify'
import type { Character, Raid, Slot, User } from '../types'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  notifyMock: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(), clearToken: vi.fn() }))
vi.mock('../api/ws', () => ({ connectRaidWs: vi.fn(() => () => {}) }))
vi.mock('../lib/notify', () => ({ confirmDialog: vi.fn(async () => true),
  notifyError: notifyMock.error, notifyWarning: notifyMock.warning, notifySuccess: notifyMock.success }))

const admin: User = { id: 9, username: 'a', nickname: '团长', is_admin: true, avatar: null, is_banned: false }
const member: User = { id: 3, username: 'm', nickname: '队员', is_admin: false, avatar: null, is_banned: false }
const outChar: Character = { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: '鬼剑士', class_type: '输出', fame: 52000, simulated_damage: 12000,
  sustained_dps: 3000, buff_amount: null, sun_buff: null }
const healChar: Character = { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士',
  parent_name: '圣职者', class_type: '辅助', fame: 40000, simulated_damage: null,
  sustained_dps: null, buff_amount: 46000, sun_buff: 1000 }
const adminRow = { user: admin, created_at: null, characters: [] as Character[] }
const memberRow = { user: member, created_at: 'x', characters: [outChar, healChar] }

function mkSlot(id: number, sq = 0): Slot {
  return { id, squad_index: sq, row_index: 0, character_id: null, character_name: null,
    character_class: null, job_name: null, job_title: null, fame: null, simulated_damage: null,
    sustained_dps: null, buff_amount: null, sun_buff: null, owner_id: null, owner_nickname: null,
    owner_avatar: null, duty: null, version: 1 }
}
function occupiedSlot(): Slot {
  return { ...mkSlot(1), character_id: 10, character_name: '剑魂', character_class: '输出',
    job_name: 'weapon_master', job_title: '极诣·剑魂', simulated_damage: 12000, sustained_dps: 3000,
    owner_id: member.id, owner_nickname: '队员', duty: '主C', version: 2 }
}
function makeRaid(signups: Raid['signups'], filled?: Slot): Raid {
  return { id: 1, name: 'x', dungeon_id: 1, dungeon_name: '副本', starts_at: 'x',
    size: 8, locked: false, signups, slack_rules: { criteria: [], exchange: [] },
    waves: [{ id: 1, index: 1, group_id: null, round_index: 1, group_index: 1,
      slots: [filled ?? mkSlot(1), mkSlot(2), mkSlot(3), mkSlot(4)] }] }
}
function twoWaveRaid(signups: Raid['signups']): Raid {
  const r = makeRaid(signups)
  r.waves = [
    { id: 1, index: 1, group_id: null, round_index: 1, group_index: 1,
      slots: [mkSlot(1), mkSlot(2), mkSlot(3), mkSlot(4)] },
    { id: 2, index: 2, group_id: null, round_index: 2, group_index: 1,
      slots: [mkSlot(5), mkSlot(6), mkSlot(7), mkSlot(8)] },
  ]
  return r
}

async function mountView(signups: Raid['signups'], user: User = admin,
                         snapshot: Raid = makeRaid(signups)) {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore(); auth.user = user
  const store = useRaidStore(); store.raid = makeRaid(signups)
  apiMock.get.mockImplementation(async (url: string) => url === '/api/raids/1' ? snapshot : [])
  const router = createRouter({ history: createMemoryHistory(),
    routes: [{ path: '/raids/:id/roster', component: RosterView }] })
  await router.push('/raids/1/roster'); await router.isReady()
  return { wrapper: mount(RosterView, { global: { plugins: [pinia, router],
    stubs: { 'router-link': true, 'router-view': true, DutySelect: true, UserAvatar: true,
      RosterTargetModal: true, teleport: true } } }), auth, store }
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('RosterView', () => {
  it('渲染角色池与网格', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="roster-pool"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="roster-grid"]').exists()).toBe(true)
  })

  it('非管理员只读：无推荐开关，点角色不进入拿起态', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], member)
    await flushPromises()
    expect(wrapper.find('[data-test="recommend-switch"]').exists()).toBe(false)
    await wrapper.find('[data-act="pool-char-11"]').trigger('click')
    expect(wrapper.find('.move-hint').exists()).toBe(false)
  })

  it('拿起→点空格：fill 带 replace:true，职责按状态推断（辅助且队无主奶 → 主奶）', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    await wrapper.find('[data-act="pool-char-11"]').trigger('click')  // 拿起「奶」
    expect(wrapper.find('.move-hint').text()).toContain('奶')
    await wrapper.find('.roster-slot .pick-btn').trigger('click')     // 放入空位 1
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/slots/1/fill',
      { character_id: 11, duty: '主奶', replace: true })
    expect(wrapper.find('.move-hint').exists()).toBe(false)           // 放入后退出拿起态
  })

  it('拿起→点已占格：confirmDialog 确认后 fill 替换', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin,
      makeRaid([adminRow, memberRow], occupiedSlot()))
    await flushPromises()
    await wrapper.find('[data-act="pool-char-11"]').trigger('click')  // 拿起「奶」
    await wrapper.find('.roster-slot.occupied').trigger('click')      // 点已占格（剑魂 主C）
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/slots/1/fill',
      { character_id: 11, duty: '主奶', replace: true })             // 队有主C、无主奶 → 奶为主奶
  })

  it('撤下：api.del', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin,
      makeRaid([adminRow, memberRow], occupiedSlot()))
    await flushPromises()
    await wrapper.find('[data-act="roster-remove"]').trigger('click')
    expect(apiMock.del).toHaveBeenCalledWith('/api/raids/1/slots/1')
  })

  it('改职责：api.put', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin,
      makeRaid([adminRow, memberRow], occupiedSlot()))
    await flushPromises()
    wrapper.findComponent({ name: 'RosterGrid' }).vm.$emit('duty', occupiedSlot(), '辅C')
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/raids/1/slots/1/duty', { duty: '辅C' })
  })

  it('推荐开关：有模板时显示推荐角标，关闭后消失', async () => {
    localStorage.setItem('dnfer-roster-targets-1', JSON.stringify({ 0: { outputs: { count: 2 } } }))
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-act="pool-char-10"]').text()).toContain('推荐')  // 剑魂缺口>0
    // DOMWrapper 无 .vm，须用 findComponent 定位 naive NSwitch（组件名 'Switch'）再 emit
    wrapper.findComponent({ name: 'Switch' }).vm.$emit('update:value', false)
    await flushPromises()
    expect(localStorage.getItem('dnfer-roster-recommend')).toBe('0')
    expect(wrapper.find('[data-act="pool-char-10"]').text()).not.toContain('推荐')
  })

  it('未排状态条：本波/全局计数与展开列表', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="unplaced-toggle"]').text()).toContain('本波未排 1')
    expect(wrapper.find('[data-test="unplaced-toggle"]').text()).toContain('全局未排 1')
    await wrapper.find('[data-test="unplaced-toggle"]').trigger('click')
    expect(wrapper.find('[data-test="unplaced-list"]').text()).toContain('队员')
  })

  it('波标签切换', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin, twoWaveRaid([adminRow, memberRow]))
    await flushPromises()
    await wrapper.find('[data-test="wave-tab-2"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.roster-group-label').text()).toContain('第 2 波')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts`
Expected: FAIL（找不到 `./RosterView.vue`）

- [ ] **Step 3: 实现 RosterView.vue**（核心编排：WS/波标签/推荐开关/拿起状态机/API/未排统计）

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NSwitch } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useRaidStore, applyEvent } from '../stores/raid'
import { connectRaidWs } from '../api/ws'
import { buildPlacementMap } from '../lib/placement'
import { computeSlack } from '../lib/slack'
import {
  inferFillDuty, loadTargets, rankCandidates, saveTargets, squadSlotsOf,
  RECOMMEND_KEY,
} from '../lib/roster'
import type { SquadTarget, SquadTargets } from '../lib/roster'
import RosterPool from '../components/RosterPool.vue'
import RosterGrid from '../components/RosterGrid.vue'
import RosterTargetModal from '../components/RosterTargetModal.vue'
import { confirmDialog, notifyError, notifySuccess, notifyWarning } from '../lib/notify'
import type { Character, Slot, Wave } from '../types'

const route = useRoute()
const auth = useAuthStore()
const store = useRaidStore()
const rid = Number(route.params.id)
const canEdit = computed(() => auth.isAdmin)

const currentIndex = ref(1)
const holding = ref<Character | null>(null)
const recommendOn = ref(localStorage.getItem(RECOMMEND_KEY) !== '0')
const targets = ref<SquadTargets>(loadTargets(rid))
const targetModal = ref<{ open: boolean; squadIndex: number }>({ open: false, squadIndex: 0 })
let disconnect: (() => void) | null = null

const currentWave = computed<Wave | null>(() =>
  store.raid?.waves.find(w => w.index === currentIndex.value) ?? null)
const currentGroups = computed<Wave[]>(() => {
  const cw = currentWave.value
  if (!store.raid || !cw) return []
  return store.raid.waves.filter(w => w.round_index === cw.round_index)
})
const placed = computed(() => store.raid ? buildPlacementMap(store.raid) : {})

const charsByUser = computed<Record<number, Character[]>>(() => {
  const m: Record<number, Character[]> = {}
  for (const s of store.raid?.signups ?? []) m[s.user.id] = s.characters
  return m
})
const allChars = computed<Character[]>(() =>
  Object.values(charsByUser.value).flat())

// 当前轮已占位的 owner
const roundUsedOwnerIds = computed(() => {
  const set = new Set<number>()
  for (const w of currentGroups.value) for (const s of w.slots) if (s.owner_id != null) set.add(s.owner_id)
  return set
})
// 不可拿起：已占任何格 或 owner 当前轮已用
const blockedCharIds = computed(() => {
  const set = new Set<number>()
  for (const c of allChars.value) if (placed.value[c.id]) set.add(c.id)
  for (const uid of roundUsedOwnerIds.value) for (const c of charsByUser.value[uid] ?? []) set.add(c.id)
  return set
})
const slackCharIds = computed(() =>
  new Set(Object.values(computeSlack(
    store.raid?.slack_rules ?? { criteria: [], exchange: [] }, charsByUser.value)).flat()))

const candidates = computed<Character[]>(() =>
  allChars.value.filter(c => !blockedCharIds.value.has(c.id)))
const ranked = computed(() => rankCandidates({
  candidates: candidates.value, groups: currentGroups.value,
  targets: targets.value, recommendOn: recommendOn.value,
}))
// 推荐 top3：开关开启时取前 3（无模板时 score 全 0，仍标「推荐」但无目标色，对齐 spec）
const recommendTop3 = computed(() =>
  recommendOn.value ? new Set(ranked.value.slice(0, 3).map(r => r.character.id)) : new Set())
const recommendTarget = computed<Record<number, number | null>>(() => {
  const m: Record<number, number | null> = {}
  for (const r of ranked.value) if (r.score > 0) m[r.character.id] = r.targetSquadIndex
  return m
})

// 未排统计（仅统计报了角色的人；0 角色用户不算「未排」）
const globalUnplaced = computed(() => (store.raid?.signups ?? [])
  .filter(s => s.characters.length > 0 && !s.characters.some(c => placed.value[c.id])).length)
const roundUsedCharIds = computed(() => {
  const set = new Set<number>()
  for (const w of currentGroups.value) for (const s of w.slots) if (s.character_id != null) set.add(s.character_id)
  return set
})
const roundUnplacedUsers = computed(() => (store.raid?.signups ?? [])
  .filter(s => s.characters.length > 0 && !s.characters.some(c => roundUsedCharIds.value.has(c.id))))
const roundUnplaced = computed(() => roundUnplacedUsers.value.length)
const showUnplaced = ref(false)

function waveLabel(w: Wave): string {
  return w.group_id == null ? `第 ${w.round_index} 波` : `第 ${w.round_index} 波 ${w.group_index} 团`
}

function toggleRecommend(v: boolean | string | number) {
  const on = v === true || v === 'true' || v === 1
  recommendOn.value = on
  localStorage.setItem(RECOMMEND_KEY, on ? '1' : '0')
  if (!on) holding.value = null
}

// 拿起/放下
function onPick(c: Character) {
  holding.value = holding.value?.id === c.id ? null : c
}
function onPickUp(slot: Slot) {
  const c = allChars.value.find(x => x.id === slot.character_id)
  if (c) holding.value = c
}
function squadOf(slot: Slot): Slot[] {
  const w = store.raid?.waves.find(x => x.slots.some(s => s.id === slot.id))
  if (!w) return []
  const groups = squadSlotsOf(w)
  return groups[slot.squad_index] ?? []
}
async function fill(slot: Slot, needConfirm: boolean) {
  if (!holding.value) return
  const c = holding.value
  const occupant = slot.character_id != null
  if (needConfirm && occupant) {
    const ok = await confirmDialog({ content: `将替换 ${slot.owner_nickname}（${slot.character_name}），确认？` })
    if (!ok) return
  }
  const duty = inferFillDuty(squadOf(slot), c.class_type)
  try {
    const r = await api.post<{ slot: Slot; warnings?: string[]; removed_slots?: Slot[] }>(
      `/api/raids/${rid}/slots/${slot.id}/fill`, { character_id: c.id, duty, replace: true })
    if (r?.removed_slots?.length) notifySuccess('已替换原占位角色')
    if (r?.warnings?.length) notifyWarning(r.warnings.join('；'))
  } catch (e: any) { notifyError(e.message) }
  holding.value = null
  await load()
}
async function onPlace(slot: Slot) { await fill(slot, false) }
async function onManage(slot: Slot) { await fill(slot, true) }
async function onRemove(slot: Slot) {
  try { await api.del(`/api/raids/${rid}/slots/${slot.id}`) } catch (e: any) { notifyError(e.message) }
  await load()
}
async function onDuty(slot: Slot, duty: string) {
  try { await api.put(`/api/raids/${rid}/slots/${slot.id}/duty`, { duty }) } catch (e: any) { notifyError(e.message) }
  await load()
}

// 模板
function openTarget(si: number) { targetModal.value = { open: true, squadIndex: si } }
function onSaveTarget(t: SquadTarget) {
  const si = targetModal.value.squadIndex
  const next = { ...targets.value }
  if (Object.keys(t).length === 0) delete next[si]
  else next[si] = t
  targets.value = next
  saveTargets(rid, next)
  targetModal.value.open = false
}

async function load() { await store.load(rid) }
onMounted(() => {
  disconnect = connectRaidWs(rid, {
    onEvent: (ev) => applyEvent(store, ev),
    onRefresh: async () => { await load() },
    onReconnect: async () => { await load() },
  })
  void load()
})
onBeforeUnmount(() => { disconnect?.() })
</script>

<template>
  <div v-if="store.raid" class="dnf-page">
    <div class="page-head" style="flex-wrap:wrap;gap:10px">
      <router-link :to="`/raids/${rid}`" class="dnf-btn dnf-btn-sm">← 返回</router-link>
      <h2 style="margin:0">{{ store.raid.name }} · 编队</h2>
      <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <span v-if="canEdit" style="display:flex;align-items:center;gap:6px">
          推荐 <n-switch data-test="recommend-switch" :value="recommendOn"
                        @update:value="toggleRecommend" size="small" />
        </span>
      </span>
    </div>

    <!-- 波标签 -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
      <button v-for="w in store.raid.waves" :key="w.id" class="dnf-btn dnf-btn-sm"
              :class="{ 'dnf-btn-primary': w.index === currentIndex }"
              :data-test="`wave-tab-${w.index}`" @click="currentIndex = w.index; holding = null">
        {{ waveLabel(w) }}
      </button>
      <!-- 未排状态条 -->
      <span style="margin-left:auto;display:flex;align-items:center;gap:6px">
        <button class="dnf-btn dnf-btn-sm" data-test="unplaced-toggle"
                @click="showUnplaced = !showUnplaced">
          本波未排 {{ roundUnplaced }} · 全局未排 {{ globalUnplaced }}
        </button>
      </span>
    </div>
    <div v-if="showUnplaced" class="dnf-panel" style="margin-bottom:10px;padding:10px" data-test="unplaced-list">
      <div v-for="s in roundUnplacedUsers" :key="s.user.id">
        {{ s.user.nickname }}（可用 {{ s.characters.length }} 角色）
      </div>
      <div v-if="!roundUnplacedUsers.length" style="color:var(--dnf-text-faint)">本波全部已排 ✓</div>
    </div>

    <!-- 拿起提示 -->
    <div v-if="holding" class="move-hint" style="display:flex;align-items:center;gap:10px;margin:8px 0">
      <span style="color:var(--dnf-gold-hi)">拿起中：{{ holding.name }} → 点击右侧目标格</span>
      <button class="dnf-btn dnf-btn-sm" data-test="cancel-holding" @click="holding = null">取消（Esc）</button>
    </div>

    <div style="display:flex;gap:16px;align-items:flex-start">
      <aside style="width:260px;flex-shrink:0;max-height:70vh;overflow:auto" data-test="roster-pool"
             class="dnf-panel" >
        <RosterPool :signups="store.raid.signups" :blocked-char-ids="blockedCharIds"
                    :slack-char-ids="slackCharIds" :recommend-top3="recommendTop3"
                    :recommend-target="recommendTarget" :holding-id="holding?.id ?? null"
                    :can-edit="canEdit" @pick="onPick" />
      </aside>
      <main style="flex:1;min-width:0" data-test="roster-grid">
        <RosterGrid :groups="currentGroups" :targets="targets" :can-edit="canEdit"
                    :holding="holding" @place="onPlace" @manage="onManage"
                    @remove="onRemove" @duty="onDuty" @pickUp="onPickUp"
                    @editTarget="openTarget" />
      </main>
    </div>

    <RosterTargetModal :open="targetModal.open"
                       :squad-label="`${targetModal.squadIndex + 1} 队`"
                       :target="targets[targetModal.squadIndex] ?? null"
                       @close="targetModal.open = false"
                       @save="onSaveTarget" />
  </div>
</template>

<style scoped>
.move-hint { border: 1px dashed var(--dnf-accent,#ffd54a); border-radius: 6px; padding: 8px 10px; }
</style>
```

注意：`onKeydown` Esc 取消拿起可加（与详情页一致），非必需——本版本用按钮取消，键盘 Esc 可选实现。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts`
Expected: PASS（9 用例：渲染/只读/拿起填格/替换/撤下/改职责/推荐开关/未排条/波标签）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RosterView.vue frontend/src/views/RosterView.spec.ts
git commit -m "feat: RosterView 编队总览页（拿起状态机/模板/推荐/未排统计）"
```

---

## Task 10: 全量验证 + 构建

**Files:**
- 无新增；运行验证

- [ ] **Step 1: 前端全量单测**

Run: `cd frontend && npx vitest run`
Expected: PASS（既有 + 新增全绿）

- [ ] **Step 2: 类型检查 + 构建**

Run: `cd frontend && npm run build`
Expected: 通过（vue-tsc 无类型错误；vite build 成功）

> 若 vue-tsc 报缺字段/类型错：优先修 `lib/roster.ts` 与各组件 props/emits 类型；`slot()` fixture helper 的 `duty` 强转 `as any` 仅用于构造非空 duty 的 Slot，勿扩散。

- [ ] **Step 3: 提交（如有收尾改动）**

```bash
git add -A
git commit -m "chore: 编队总览页收尾（构建通过）"
```

---

## 验证清单（实现完成后人工核对）

- [ ] 详情页管理员可见「编队」按钮，跳转 `/raids/:id/roster`；成员访问只读
- [ ] 角色池按用户分组，组内按战力排序；本波已用角色置灰不可拿；划水角色标灰+角标
- [ ] 点角色拿起 → 顶部提示 → 点空格填入（职责按队伍状态推断）→ 点已占格二次确认替换
- [ ] 已占格菜单：撤下 / 改职责 / 拿起再移动（replace 自动撤原格）
- [ ] 推荐开关开：推荐前 3 名 + `→红队` 角标；关：纯战力排序
- [ ] 每队头部达标徽章（输出数/总伤/主奶增益/太阳奶）随填格实时更新
- [ ] 波标签切换；并行团多标签指向同轮时网格不重复渲染
- [ ] 未排状态条：本波/全局未排计数，点开展示名单
- [ ] 目标编辑弹窗保存后写 localStorage，刷新仍在
- [ ] 模板删除（保存全空）后徽章消失

## 不做的事（YAGNI）

- 无后端改动/新端点。
- 不做拖拽、不做跨波自动编排、不做全波横排视图。
- 模板不存后端（localStorage）。
- 不改 AstrBot skill。
- 不做键盘 Esc 拿起取消（用按钮，可选）。
