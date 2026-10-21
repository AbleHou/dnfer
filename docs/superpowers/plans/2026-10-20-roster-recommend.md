# 编队缺口总览 + 推荐修正 —— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把编队页「推荐」从不可用状态重构为「缺口总览为主、推荐角标为辅」，并修复模板生命周期（关闭/删除攻坚时清除）。

**Architecture:** 纯前端重构。`lib/roster.ts` 新增 `squadOverview`（每队模板各维度 实际/目标/✓✗/差值）作为单一事实来源，喂给 RosterGrid 状态条与推荐打分；新增 `recommendFillers`（队→最佳候选，修 P1-P5）取代 `rankCandidates`；新增 `clearTargets` 并在关闭/删除/WS closed 时清除模板。删除旧函数 `computeSquadStatus`/`rankCandidates`/`squadGap`/`candidateFitsSquad`，不留两套并行系统。

**Tech Stack:** Vue 3 + TypeScript + Vitest（`@vue/test-utils`，jsdom）。后端零改动。

**Spec:** `docs/superpowers/specs/2026-10-20-roster-recommend-design.md`

**测试命令（每任务通用）：**
- 单测：`cd frontend && npx vitest run <file> -v`
- 全量前端测试：`cd frontend && npx vitest run`
- 类型/构建：`cd frontend && npm run build`（= vue-tsc -b && vite build）

**提交约定：** `[feat]/[fix]/[ref]/[test]/[docs]` + 中文描述 + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。直接提交到 main（项目既定约定，不做 worktree）。

---

## 文件结构

| 文件 | 职责 | 改动 |
|------|------|------|
| `frontend/src/lib/roster.ts` | 总览引擎 + 推荐引擎 + 模板存储 | 加 `squadOverview`/`OverviewDim`/`SquadOverview`、`recommendFillers`/`SquadSuggestion`、`clearTargets`；删 `computeSquadStatus`/`SquadStatus`/`rankCandidates`/`RankedCandidate`/`squadGap`/`candidateFitsSquad`；`saveTargets` 补 try/catch |
| `frontend/src/lib/roster.spec.ts` | 纯函数单测 | 迁移+新增（见各任务） |
| `frontend/src/components/RosterGrid.vue` | 每队状态条（全维度） | 改用 `squadOverview` 渲染；删 computeSquadStatus |
| `frontend/src/components/RosterGrid.spec.ts` | 状态条测试 | 更新格式断言 |
| `frontend/src/components/RosterPool.vue` | 角色池 + 推荐角标 | prop `recommendTop3`+`recommendTarget` → 单个 `recommend`；角标带团号 |
| `frontend/src/components/RosterPool.spec.ts` | 角标测试 | 更新 |
| `frontend/src/views/RosterView.vue` | 接线 | 用 `recommendFillers` 算 `recommend`；closed 时 `clearTargets` + 清内存 targets |
| `frontend/src/views/RosterView.spec.ts` | 接线测试 | 更新 + closed 清模板用例 |
| `frontend/src/views/RaidDetailView.vue` | 关闭/WS 清除模板 | `onCloseRaid` + `raid:closed` → `clearTargets` |
| `frontend/src/views/RaidDetailView.spec.ts` | 关闭清模板测试 | 新增断言 |
| `frontend/src/views/RaidListView.vue` | 删除清除模板 | `onDelete` → `clearTargets` |
| `frontend/src/views/RaidListView.spec.ts` | 删除清模板测试 | 新增断言 |

---

## Task 1: `squadOverview` 总览引擎（纯新增）

**Files:**
- Modify: `frontend/src/lib/roster.ts`
- Test: `frontend/src/lib/roster.spec.ts`

- [ ] **Step 1: 在 roster.spec.ts 加失败测试** —— 在文件顶部 import 加 `squadOverview`，在 `describe('computeSquadStatus 达标计算')` **之前**新增 describe（保留旧 describe 不动，Task 5 才删）：

```ts
describe('squadOverview 总览（新引擎）', () => {
  const target = {
    outputs: { count: 2, simMin: 20000, simMax: 25000 },
    mainHeal: { buffMin: 45000, buffMax: 48000 },
    sunHeal: { count: 1 },
  }
  it('无模板 → dims 空、ok、issues 空', () => {
    const ov = squadOverview([os(12000)], undefined)
    expect(ov.dims).toEqual([]); expect(ov.ok).toBe(true); expect(ov.issues).toEqual([])
  })
  it('全达标 → 各维度 ok 且 diff 为超出量', () => {
    const ov = squadOverview([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(ov.ok).toBe(true)
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.actual).toBe(22000); expect(sim.ok).toBe(true); expect(sim.diff).toBe(2000) // 22000-20000
    const heal = ov.dims.find(d => d.key === 'mainHealBuff')!
    expect(heal.ok).toBe(true); expect(heal.diff).toBe(1000) // 46000-45000
    const out = ov.dims.find(d => d.key === 'outputCount')!
    expect(out.ok).toBe(true); expect(out.actual).toBe(2); expect(out.min).toBe(2)
    const sun = ov.dims.find(d => d.key === 'sunHealCount')!
    expect(sun.ok).toBe(true); expect(sun.actual).toBe(1)
  })
  it('缺输出数 → outputCount !ok、diff 为负缺口、issues 缺N输出', () => {
    const ov = squadOverview([os(20000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    const out = ov.dims.find(d => d.key === 'outputCount')!
    expect(out.ok).toBe(false); expect(out.actual).toBe(1); expect(out.diff).toBe(-1)
    expect(ov.ok).toBe(false); expect(ov.issues.join()).toContain('缺1输出')
  })
  it('总伤低于下限 → simDamage !ok、issues 总伤差', () => {
    const ov = squadOverview([os(5000), os(5000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.ok).toBe(false); expect(sim.diff).toBe(-10000); expect(ov.issues.join()).toContain('总伤差')
  })
  it('总伤高于上限 → simDamage !ok、diff 为正（超限）', () => {
    const ov = squadOverview([os(15000), os(15000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.ok).toBe(false); expect(sim.diff).toBe(5000); expect(ov.issues.join()).toContain('总伤超')
  })
  it('主奶无槽 → mainHealBuff actual null、!ok、issues 缺主奶', () => {
    const ov = squadOverview([os(12000), os(10000), aux('太阳奶', 0)], target)
    const heal = ov.dims.find(d => d.key === 'mainHealBuff')!
    expect(heal.actual).toBeNull(); expect(heal.ok).toBe(false); expect(ov.issues.join()).toContain('缺主奶')
  })
  it('缺太阳奶 → sunHealCount !ok、issues 缺太阳奶', () => {
    const ov = squadOverview([os(12000), os(10000), aux('主奶', 46000)], target)
    const sun = ov.dims.find(d => d.key === 'sunHealCount')!
    expect(sun.ok).toBe(false); expect(sun.actual).toBe(0); expect(ov.issues.join()).toContain('缺太阳奶')
  })
  it('双界：min+max 同时设时 dim 同时带 min/max（总伤须落在区间内才 ok）', () => {
    const ov = squadOverview([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.min).toBe(20000); expect(sim.max).toBe(25000)
    expect(sim.actual).toBe(22000); expect(sim.ok).toBe(true)   // 22000 ∈ [20000, 25000]
  })
  it('划水豁免（成员划水）→ slack、ok、issues 空', () => {
    const ov = squadOverview([os(100, '划水')], target)
    expect(ov.slack).toBe(true); expect(ov.ok).toBe(true); expect(ov.issues).toEqual([])
  })
  it('target.slack=true → 豁免', () => {
    const ov = squadOverview([os(5000), os(5000), aux('主奶', 40000)], { ...target, slack: true })
    expect(ov.slack).toBe(true); expect(ov.ok).toBe(true); expect(ov.issues).toEqual([])
  })
  it('统计字段 filled/total', () => {
    const ov = squadOverview([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(ov.filled).toBe(4); expect(ov.total).toBe(4)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: FAIL（`squadOverview` is not a function / 未导出）

- [ ] **Step 3: 在 roster.ts 实现 squadOverview + 类型**（放在 `computeSquadStatus` 之后，`:44` 附近；保留 computeSquadStatus 不动）：

```ts
export type OverviewDimKey = 'outputCount' | 'simDamage' | 'mainHealBuff' | 'sunHealCount'

export interface OverviewDim {
  key: OverviewDimKey
  label: string
  actual: number | null
  min: number | null
  max: number | null
  ok: boolean
  diff: number | null
}

export interface SquadOverview {
  filled: number
  total: number
  dims: OverviewDim[]
  slack: boolean
  ok: boolean
  issues: string[]
}

function issueText(d: OverviewDim): string {
  switch (d.key) {
    case 'outputCount': return `缺${(d.min ?? 0) - (d.actual ?? 0)}输出`
    case 'sunHealCount': return '缺太阳奶'
    case 'mainHealBuff': return d.actual == null ? '缺主奶' : '主奶增益'
    case 'simDamage':
      return d.actual != null && d.max != null && d.actual > d.max ? `总伤超${d.actual - d.max}` : `总伤差${(d.min ?? 0) - (d.actual ?? 0)}`
  }
}

export function squadOverview(slots: Slot[], target: SquadTarget | undefined): SquadOverview {
  const filled = slots.filter(s => s.character_id != null)
  const total = slots.length
  const slack = filled.some(s => s.duty === '划水') || target?.slack === true
  const dims: OverviewDim[] = []
  const push = (d: OverviewDim) => dims.push(d)
  // 维度始终照算（spec §4.1 划水豁免也要显示维度）；slack 时强制 ok、不产 issues
  if (target) {
    if (target.outputs?.count != null) {
      const actual = filled.filter(s => s.character_class === '输出').length
      push({ key: 'outputCount', label: '输出', actual, min: target.outputs.count, max: null,
             ok: actual >= target.outputs.count, diff: actual - target.outputs.count })
    }
    if (target.outputs?.simMin != null || target.outputs?.simMax != null) {
      const actual = sumSquadDamage(filled).simulated
      const min = target.outputs.simMin ?? null
      const max = target.outputs.simMax ?? null
      const ok = (min == null || actual >= min) && (max == null || actual <= max)
      let diff: number | null = null
      if (actual != null) {
        if (!ok) diff = min != null && actual < min ? actual - min : (max != null && actual > max ? actual - max : null)
        else diff = min != null ? actual - min : (max != null ? actual - max : null)
      }
      push({ key: 'simDamage', label: '总伤', actual, min, max, ok, diff })
    }
    if (target.mainHeal?.buffMin != null || target.mainHeal?.buffMax != null) {
      const mainHeal = filled.find(s => s.duty === '主奶')
      const actual = mainHeal?.buff_amount ?? null
      const min = target.mainHeal.buffMin ?? null
      const max = target.mainHeal.buffMax ?? null
      const ok = actual != null && (min == null || actual >= min) && (max == null || actual <= max)
      let diff: number | null = null
      if (actual != null) {
        if (!ok) diff = min != null && actual < min ? actual - min : (max != null && actual > max ? actual - max : null)
        else diff = min != null ? actual - min : (max != null ? actual - max : null)
      }
      push({ key: 'mainHealBuff', label: '主奶增益', actual, min, max, ok, diff })
    }
    if (target.sunHeal?.count != null) {
      const actual = filled.filter(s => s.duty === '太阳奶').length
      push({ key: 'sunHealCount', label: '太阳奶', actual, min: target.sunHeal.count, max: null,
             ok: actual >= target.sunHeal.count, diff: actual - target.sunHeal.count })
    }
  }
  const issues: string[] = []
  if (!slack) for (const d of dims) if (!d.ok) issues.push(issueText(d))
  if (slack) for (const d of dims) d.ok = true
  return { filled, total, dims, slack, ok: slack || dims.every(d => d.ok), issues }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: PASS（新增 describe 全绿，旧 describe 仍绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts
git commit -m "$(cat <<'EOF'
[feat] roster：squadOverview 总览引擎（每队维度 实际/目标/✓✗/差值）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `clearTargets` + `saveTargets` try/catch

**Files:**
- Modify: `frontend/src/lib/roster.ts`
- Test: `frontend/src/lib/roster.spec.ts`

- [ ] **Step 1: 加失败测试**（在 `模板 localStorage 读写` describe 内追加；import 加 `clearTargets`，并把 vitest import 从 `{ describe, it, expect, beforeEach }` 改为 `{ describe, it, expect, beforeEach, vi }`——本项目未开 vitest globals，必须显式引 `vi`）：

```ts
it('clearTargets 清除该 raid 模板', () => {
  saveTargets(7, { 0: { outputs: { count: 2 } } })
  clearTargets(7)
  expect(loadTargets(7)).toEqual({})
})
it('clearTargets 只清指定 raid', () => {
  saveTargets(7, { 0: { outputs: { count: 2 } } }); saveTargets(8, { 0: { outputs: { count: 3 } } })
  clearTargets(7)
  expect(loadTargets(7)).toEqual({}); expect(loadTargets(8)[0]?.outputs?.count).toBe(3)
})
it('saveTargets/clearTargets 在 localStorage 异常时不抛（try/catch 兜底）', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => saveTargets(7, { 0: {} })).not.toThrow()
  spy.mockRestore()
  const spy2 = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
  expect(() => clearTargets(7)).not.toThrow()
  spy2.mockRestore()
})
```

- [ ] **Step 2: 跑测试确认失败**（import 需先加 `clearTargets`；若未导出则 compile error 即视为失败）

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

在 `saveTargets` 前加（roster.ts:16 的 `TARGETS_KEY` 之下）：

```ts
export function clearTargets(raidId: number): void {
  try { localStorage.removeItem(TARGETS_KEY(raidId)) } catch { /* 隐私模式等忽略 */ }
}
```

`saveTargets`（roster.ts:24-26）改为：

```ts
export function saveTargets(raidId: number, targets: SquadTargets): void {
  try { localStorage.setItem(TARGETS_KEY(raidId), JSON.stringify(targets)) } catch { /* 忽略 */ }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts
git commit -m "$(cat <<'EOF'
[feat] roster：clearTargets + saveTargets 异常兜底

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `recommendFillers` 推荐引擎（纯新增，与 rankCandidates 并存）

**Files:**
- Modify: `frontend/src/lib/roster.ts`
- Test: `frontend/src/lib/roster.spec.ts`

- [ ] **Step 1: 加失败测试** —— import 加 `recommendFillers`；在 `describe('rankCandidates 推荐排序')` **之前**新增 describe。

> **fixture 注意（重要）：** 文件里 `os()`/`aux()` 造的 slot `character_id` 非空（`duty ? 1 : null`）——单格波会被新规则 P1（满员）跳过，`recommendFillers` 会误返回 `[]`。故本 describe 用**可控空格**的自定义 fixture `sqSlot(sq, filled, sim?, duty?)`，并断言用 `waveId`/`groupIndex`（不用 `squadIndex`，因并行/多波共用 squad 0 无法区分）。

```ts
// sqSlot：可指定 squad_index 与「是否已占」；空格 → character_id null
const sqSlot = (sq: number, filled: boolean, sim: number | null = null, duty: string | null = '主C'): Slot =>
  ({ id: 0, squad_index: sq, row_index: 0, character_id: filled ? 1 : null,
     character_name: filled ? 'x' : null, character_class: filled ? '输出' : null,
     job_name: null, job_title: null, fame: null, simulated_damage: sim, sustained_dps: null,
     buff_amount: null, sun_buff: null, owner_id: null, owner_nickname: null, owner_avatar: null,
     duty: filled ? duty : null, version: 1, adventure_party_id: null, adventure_party_name: null })

describe('recommendFillers 队→候选推荐（新引擎）', () => {
  const tOut = { 0: { outputs: { count: 2, simMin: 20000 } } }
  const tHeal = { 0: { mainHeal: { buffMin: 45000 } } }
  const tSun = { 0: { outputs: { count: 2 }, sunHeal: { count: 1 } } }
  // 缺输出的队（1 已占输出 + 2 空格）
  const needyWave = (id: number) => wave(id, [sqSlot(0, true, 5000, '主C'), sqSlot(0, false), sqSlot(0, false)])
  const wave2 = (id: number, groupIndex: number): Wave =>
    ({ id, index: id, group_id: groupIndex, round_index: 1, group_index: groupIndex,
       slots: [sqSlot(0, true, 5000, '主C'), sqSlot(0, false), sqSlot(0, false)] })

  it('P5 无模板 → 空建议', () => {
    expect(recommendFillers({ candidates: [c1, healer], groups: [needyWave(10)], targets: {} })).toEqual([])
  })
  it('P1 满员队不进推荐（未达标但有空格才推）', () => {
    // 红队(wave10) 4/4 满、总伤 4000 不足 → 跳过；蓝队(wave20) 有空格 → 推
    const g = [wave(10, [sqSlot(0, true, 1000, '主C'), sqSlot(0, true, 1000, '主C'),
                         sqSlot(0, true, 1000, '主C'), sqSlot(0, true, 1000, '主C')]),
              wave(20, [sqSlot(0, true, 5000, '主C'), sqSlot(0, false), sqSlot(0, false)])]
    const r = recommendFillers({ candidates: [c1], groups: g, targets: tOut })
    expect(r.length).toBe(1)
    expect(r[0].waveId).toBe(20) // 只推蓝队
  })
  it('P2 主奶已达标、纯缺输出的队：只推荐输出，不推荐辅助', () => {
    // 队已有主奶 46000(达标) + 1 输出 + 空格；辅助候选不该被吸过去
    const g = [wave(10, [aux('主奶', 46000), sqSlot(0, true, 5000, '主C'), sqSlot(0, false), sqSlot(0, false)])]
    const r = recommendFillers({ candidates: [c1, healer], groups: g, targets: tOut })
    expect(r.length).toBe(1)
    expect(r[0].character.id).toBe(c1.id) // 输出
  })
  it('缺主奶的队：推荐辅助', () => {
    const g = [needyWave(10)]
    const r = recommendFillers({ candidates: [c1, healer], groups: g, targets: tHeal })
    expect(r.length).toBe(1)
    expect(r[0].character.id).toBe(healer.id)
  })
  it('P3 跨队去重：两个缺人队各拿一条建议、角色不重复', () => {
    const g = [needyWave(10), needyWave(20)]
    const r = recommendFillers({ candidates: [c1, c2], groups: g, targets: tOut })
    expect(r.length).toBe(2)
    expect(new Set(r.map(x => x.character.id)).size).toBe(2)
    expect(new Set(r.map(x => x.waveId)).size).toBe(2)
  })
  it('P3 同一角色只落一条（缺口更大的队优先占用）', () => {
    // wave10 有 1 输出(gap2：缺1输出+总伤差)；wave20 全空(gap3：缺2输出+总伤差)；只有一个候选 c1
    const g = [wave(10, [sqSlot(0, true, 5000, '主C'), sqSlot(0, false)]),
              wave(20, [sqSlot(0, false), sqSlot(0, false), sqSlot(0, false), sqSlot(0, false)])]
    const r = recommendFillers({ candidates: [c1], groups: g, targets: tOut })
    expect(r.length).toBe(1)
    expect(r[0].waveId).toBe(20) // 缺口更大的队
  })
  it('P4 并行团：建议带 roundIndex/groupIndex（角标可区分）', () => {
    const g = [wave2(10, 1), wave2(20, 2)]
    const r = recommendFillers({ candidates: [c1, c2], groups: g, targets: tOut })
    expect(r.length).toBe(2)
    const g1 = r.find(x => x.groupIndex === 1)!; const g2 = r.find(x => x.groupIndex === 2)!
    expect(g1.waveId).toBe(10); expect(g1.roundIndex).toBe(1); expect(g1.groupIndex).toBe(1)
    expect(g2.waveId).toBe(20); expect(g2.groupIndex).toBe(2)
  })
  it('混合需求（缺输出+缺太阳奶）：按优先级表推荐输出（输出数 < 目标 优先于 缺太阳奶）', () => {
    const g = [needyWave(10)]
    const r = recommendFillers({ candidates: [c1, healer], groups: g, targets: tSun })
    expect(r.length).toBe(1)
    expect(r[0].character.id).toBe(c1.id) // 输出
  })
  it('排序：gap 降序（缺口更大的队优先被推）', () => {
    const g = [wave(10, [sqSlot(0, true, 5000, '主C'), sqSlot(0, false)]),   // gap2
              wave(20, [sqSlot(0, false), sqSlot(0, false), sqSlot(0, false), sqSlot(0, false)])] // gap3
    const r = recommendFillers({ candidates: [c1, c2], groups: g, targets: tOut })
    expect(r[0].waveId).toBe(20) // 全空队 gap 更大 → 排最前
  })
  it('总伤超上限（simMax）：无角色能改善 → 跳过该队（即使有空格）', () => {
    const g = [wave(10, [sqSlot(0, true, 30000, '主C'), sqSlot(0, true, 30000, '主C'), sqSlot(0, false)])]
    const t = { 0: { outputs: { count: 2, simMin: 20000, simMax: 50000 } } }
    const r = recommendFillers({ candidates: [c1], groups: g, targets: t })
    expect(r).toEqual([]) // 输出数已够、总伤 60000 > 50000，塞谁都超 → recommendType 返回 null 跳过
  })
})
```

> 注：`needyWave`/`wave2`/`sqSlot` 只在本 describe 内使用；`wave2` 与 `needyWave` 都自带「1 已占输出 + 2 空格」的 squad 0，保证 `recommendFillers` 不会因 P1 满员而跳过。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: FAIL（`recommendFillers` is not a function）

- [ ] **Step 3: 在 roster.ts 实现**（放在 `rankCandidates` 之后，保留 rankCandidates 不动，Task 4 才删）：

```ts
export interface SquadSuggestion {
  character: Character
  waveId: number
  roundIndex: number
  groupIndex: number | null
  squadIndex: number
  gap: number
}

/** 队伍缺口分：count 类按缺失个数，连续类(总伤/主奶)各 +1。与旧 squadGap 语义一致。 */
function gapScore(ov: SquadOverview): number {
  let gap = 0
  for (const d of ov.dims) {
    if (d.ok) continue
    if (d.key === 'outputCount' || d.key === 'sunHealCount') gap += Math.max(0, (d.min ?? 0) - (d.actual ?? 0))
    else gap += 1
  }
  return gap
}

/** 按 spec §3.3 优先级表决定该队推荐角色类型；总伤超上限(塞谁都超)返回 null 表示跳过。 */
function recommendType(slots: Slot[], ov: SquadOverview): '输出' | '辅助' | null {
  const dim = (k: OverviewDimKey) => ov.dims.find(d => d.key === k)
  const out = dim('outputCount'); const sim = dim('simDamage')
  const heal = dim('mainHealBuff'); const sun = dim('sunHealCount')
  // 注意：超上限判断优先于优先级表——「既超 simMax 又缺输出数」的队也跳过（塞谁都更超，推输出无意义）。这是有意设计，勿改为仍推输出。
  if (sim && !sim.ok && sim.actual != null && sim.max != null && sim.actual > sim.max) return null
  if (heal && heal.actual == null) return '辅助'        // 1. 无主奶槽
  if (!slots.some(s => s.duty === '主C')) return '输出'  // 2. 无主C槽
  if (out && !out.ok) return '输出'                      // 3. 缺输出数
  if (sun && !sun.ok) return '辅助'                      // 4. 缺太阳奶
  if (sim && !sim.ok) return '输出'                      // 5. 总伤低于下限
  if (heal && !heal.ok) return '辅助'                    // 6. 主奶增益未达标
  return null
}

function bestCandidate(candidates: Character[], type: '输出' | '辅助', used: Set<number>): Character | null {
  let best: Character | null = null
  for (const c of candidates) {
    if (used.has(c.id) || c.class_type !== type) continue
    if (!best || powerValue(c) > powerValue(best)) best = c
  }
  return best
}

export function recommendFillers(opts: {
  candidates: Character[]
  groups: Wave[]
  targets: SquadTargets
}): SquadSuggestion[] {
  type Team = { wave: Wave; squadIndex: number; slots: Slot[]; overview: SquadOverview; gap: number }
  const teams: Team[] = []
  for (const w of opts.groups) {
    squadSlotsOf(w).forEach((slots, si) => {
      const target = opts.targets[si]
      if (!target) return
      const overview = squadOverview(slots, target)
      if (overview.slack || overview.ok) return
      if (overview.filled >= overview.total) return   // P1 满员
      teams.push({ wave: w, squadIndex: si, slots, overview, gap: gapScore(overview) })
    })
  }
  // 排序：gap 降序；同 gap 按「该队当前类型最强可选候选的战力」降序（确定性）
  teams.sort((a, b) => {
    if (b.gap !== a.gap) return b.gap - a.gap
    const bestPower = (type: '输出' | '辅助' | null): number => {
      if (type == null) return -Infinity
      const c = bestCandidate(opts.candidates, type, new Set())
      return c ? powerValue(c) : -Infinity
    }
    return bestPower(recommendType(b.slots, b.overview)) - bestPower(recommendType(a.slots, a.overview))
  })
  const used = new Set<number>()
  const out: SquadSuggestion[] = []
  for (const t of teams) {
    const type = recommendType(t.slots, t.overview)
    if (type == null) continue
    const pick = bestCandidate(opts.candidates, type, used)
    if (!pick) continue
    used.add(pick.id)
    out.push({ character: pick, waveId: t.wave.id, roundIndex: t.wave.round_index,
               groupIndex: t.wave.group_index, squadIndex: t.squadIndex, gap: t.gap })
  }
  return out.sort((a, b) => b.gap - a.gap || powerValue(b.character) - powerValue(a.character)).slice(0, 6)
}
```

> 注：`powerValue` 对输出取 `simulated_damage`、对辅助取 `buff_amount`，均为各自类型内的可比量纲（`bestCandidate` 只在同类候选里比）。类型间不比较（由 `recommendType` 决定）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: PASS（新 describe 全绿；rankCandidates 旧 describe 仍绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts
git commit -m "$(cat <<'EOF'
[feat] roster：recommendFillers 队→候选推荐（满员/类型匹配/跨队去重/团号）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 推荐接线迁移（RosterView + RosterPool）+ 删旧推荐函数

**Files:**
- Modify: `frontend/src/views/RosterView.vue`, `frontend/src/components/RosterPool.vue`, `frontend/src/lib/roster.ts`
- Test: `frontend/src/views/RosterView.spec.ts`, `frontend/src/components/RosterPool.spec.ts`, `frontend/src/lib/roster.spec.ts`

- [ ] **Step 1: RosterPool.spec 改为新 prop `recommend`** —— `mountPool` 默认 props（RosterPool.spec.ts:28）`recommendTop3: new Set<number>(), recommendTarget: {}` 改为 `recommend: {}`；两个用例（64-71 行）改为：

```ts
it('推荐角标：单波显示 推荐→红队', () => {
  const w = mountPool({ recommend: { 10: { roundIndex: 1, groupIndex: null, squadIndex: 0 } } })
  expect(w.find('[data-act="pool-char-10"]').text()).toContain('推荐→红队')
})
it('推荐角标：并行团带团号', () => {
  const w = mountPool({ recommend: { 10: { roundIndex: 1, groupIndex: 2, squadIndex: 0 } } })
  expect(w.find('[data-act="pool-char-10"]').text()).toContain('推荐→第 1 波 2 团红队')
})
it('无建议角色不打推荐标', () => {
  const w = mountPool({ recommend: {} })
  expect(w.find('[data-act="pool-char-10"]').text()).not.toContain('推荐')
})
```

- [ ] **Step 2: 跑 RosterPool.spec 确认失败**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: FAIL（prop 不存在 / 文案不符）

- [ ] **Step 3: 改 RosterPool.vue** —— props 定义（9-26 行）：

```ts
recommend?: Record<number, { roundIndex: number; groupIndex: number | null; squadIndex: number }>
```
withDefaults 里 `recommendTarget: () => ({})` 改为 `recommend: () => ({})`（删 `recommendTop3` 默认）。

script 加：

```ts
function recText(cid: number): string {
  const r = props.recommend[cid]
  if (!r) return ''
  const squad = squadName(r.squadIndex)
  return r.groupIndex != null ? `→第 ${r.roundIndex} 波 ${r.groupIndex} 团${squad}` : `→${squad}`
}
```

模板角标（149-151 行）改为：

```html
<span v-if="recommend[c.id]" class="pool-tag rec">推荐{{ recText(c.id) }}</span>
```

- [ ] **Step 4: 改 RosterView.vue** —— import（11-14 行）：`rankCandidates` 换成 `recommendFillers`，加 `clearTargets`（clearTargets 本任务先不接，Task 6 用；可先加 import 供 Task 6，或 Task 6 再加——**Task 6 再加，避免未使用 import**）。本任务只换 `rankCandidates` → `recommendFillers`。

计算属性（86-97 行）替换为：

```ts
const suggestions = computed(() => recommendOn.value ? recommendFillers({
  candidates: candidates.value, groups: currentGroups.value, targets: targets.value,
}) : [])
const recommend = computed<Record<number, { roundIndex: number; groupIndex: number | null; squadIndex: number }>>(() => {
  const m: Record<number, { roundIndex: number; groupIndex: number | null; squadIndex: number }> = {}
  for (const s of suggestions.value) m[s.character.id] = { roundIndex: s.roundIndex, groupIndex: s.groupIndex, squadIndex: s.squadIndex }
  return m
})
```

删 `ranked` / `recommendTop3` / `recommendTarget` 三个 computed。

RosterPool 传参（272-277 行）：`:recommend-top3="recommendTop3" :recommend-target="recommendTarget"` 改为 `:recommend="recommend"`。

- [ ] **Step 5: 删 roster.ts 旧推荐函数 + 其 spec** ——
  - roster.ts：删 `RankedCandidate`（80-85 行）、`squadGap`（99-109）、`candidateFitsSquad`（111-124）、`rankCandidates`（126-150）。`rankCandidates` 用到的 `rankCandidates` 内部 `sortByPower` 仍被 RosterPool 用，保留。
  - roster.spec.ts：删 `describe('rankCandidates 推荐排序', ...)`（153-201 行）整块；import（第 3 行）去掉 `rankCandidates`。
  - RosterView.vue import 已在 Step 4 去掉 `rankCandidates`。

- [ ] **Step 6: 跑三处测试**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts src/components/RosterPool.spec.ts src/views/RosterView.spec.ts`
Expected: PASS（RosterView.spec 的「推荐开关」用例应仍绿：模板 `{0:{outputs:{count:2}}}` + 空格 → 剑魂被推荐；开关关 → 无标）

- [ ] **Step 7: 类型检查**

Run: `cd frontend && npm run build`
Expected: 通过（无未使用 import / 类型错误）

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts \
        frontend/src/components/RosterPool.vue frontend/src/components/RosterPool.spec.ts \
        frontend/src/views/RosterView.vue frontend/src/views/RosterView.spec.ts
git commit -m "$(cat <<'EOF'
[ref] roster：推荐接线迁移到 recommendFillers，删除 rankCandidates/squadGap/candidateFitsSquad

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: RosterGrid 状态条改版 + 删 `computeSquadStatus`

**Files:**
- Modify: `frontend/src/components/RosterGrid.vue`, `frontend/src/lib/roster.ts`
- Test: `frontend/src/components/RosterGrid.spec.ts`, `frontend/src/lib/roster.spec.ts`

- [ ] **Step 1: RosterGrid.spec 更新状态条断言** —— `有目标时队头显示缺口文案`（37-40 行）改为：

```ts
it('有目标时状态条显示维度 实际/目标 + 未达标✗', () => {
  const w = mountGrid({ targets: { 0: { outputs: { count: 2 } } } })
  expect(w.text()).toContain('输出')
  expect(w.text()).toContain('✗')
})
it('无目标时显示 未设目标', () => {
  const w = mountGrid()
  expect(w.text()).toContain('未设目标')
})
it('全达标时各维度显示 ✓ 且带超出量', () => {
  const slots = [
    { ...out(1, 0), simulated_damage: 12000 },
    { ...out(2, 0), simulated_damage: 10000 },
  ]
  const w = mountGrid({ groups: [wave(1, slots)], targets: { 0: { outputs: { count: 2, simMin: 20000 } } } })
  expect(w.text()).toContain('✓')
  expect(w.text()).toContain('(+2000)') // 22000-20000
})
it('划水豁免：显示 划水豁免 tag、维度照显但不标 ✗', () => {
  const slots = [{ ...out(1, 0), duty: '划水' as any, simulated_damage: 100 }]
  const w = mountGrid({ groups: [wave(1, slots)], targets: { 0: { outputs: { count: 2 } } } })
  expect(w.text()).toContain('划水豁免')
  expect(w.text()).not.toContain('✗')
})
```

- [ ] **Step 2: 跑 RosterGrid.spec 确认失败**

Run: `cd frontend && npx vitest run src/components/RosterGrid.spec.ts`
Expected: FAIL（状态条格式不符 / 无 未设目标）

- [ ] **Step 3: 改 RosterGrid.vue** —— import（5 行）`computeSquadStatus` → `squadOverview`，type 加 `SquadOverview`。`squadsOf`（26-28 行）改为带 overview：

```ts
function squadsOf(w: Wave): { index: number; slots: Slot[]; overview: SquadOverview }[] {
  return squadSlotsOf(w).map((slots, i) => ({ index: i, slots, overview: squadOverview(slots, props.targets[i]) }))
}
```

script 加格式化助手：

```ts
function dimText(d: SquadOverview['dims'][number], slack: boolean): string {
  const tgt = d.min != null && d.max != null ? `${d.min}~${d.max}` : (d.min ?? d.max) != null ? `${d.min ?? d.max}` : ''
  let margin = ''
  // slack 时 squadOverview 强制 ok=true 但保留原始 diff——不输出 margin，避免「✓(差N)」矛盾
  if (!slack && d.diff != null && d.diff !== 0 && (d.key === 'simDamage' || d.key === 'mainHealBuff')) {
    margin = d.diff > 0 ? `(+${d.diff})` : `(差${-d.diff})`
  }
  return `${d.label} ${d.actual ?? '—'}/${tgt} ${d.ok ? '✓' : '✗'}${margin}`
}
```

模板状态条（44-50 行）替换为：

```html
<div class="roster-squad-status"
     :class="sq.overview.slack || sq.overview.ok ? 'ok' : 'warn'">
  <template v-if="!targets[sq.index] || sq.overview.dims.length === 0">未设目标</template>
  <template v-else>
    <span v-if="sq.overview.slack" class="dim-slack">划水豁免</span>
    <span v-if="sq.overview.ok && !sq.overview.slack">达标 ✓ </span>
    <span v-for="d in sq.overview.dims" :key="d.key"
          :class="d.ok ? 'dim-ok' : 'dim-warn'">{{ dimText(d, sq.overview.slack) }}</span>
  </template>
</div>
```

style 加 `dim-ok`（绿）/`dim-warn`（红）：
```css
.dim-ok { color: var(--dnf-ok, #34c759); }
.dim-warn { color: var(--dnf-danger, #e5484d); }
```

- [ ] **Step 4: 删 roster.ts `computeSquadStatus` + `SquadStatus`** ——
  - roster.ts：删 `SquadStatus`（36-42）、`computeSquadStatus`（44-78）。此时 roster.ts 内 `squadOverview` 已全覆盖，无其他调用方。
  - roster.spec.ts：删 `describe('computeSquadStatus 达标计算', ...)`（61-130 行）整块；import（第 3 行）去掉 `computeSquadStatus`。

- [ ] **Step 5: 跑测试**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts src/components/RosterGrid.spec.ts src/views/RosterView.spec.ts`
Expected: PASS（RosterView.spec 的「编辑目标保存后…网格显示缺口」用例断言 `.roster-squad-status` 含「输出」，新状态条 `输出 0/2 ✗` 仍含）

- [ ] **Step 6: 类型检查**

Run: `cd frontend && npm run build`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts \
        frontend/src/components/RosterGrid.vue frontend/src/components/RosterGrid.spec.ts
git commit -m "$(cat <<'EOF'
[feat] roster：网格状态条改全维度总览（实际/目标/✓✗/差值），删除 computeSquadStatus

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 模板生命周期清除（关闭/删除/closed）

**Files:**
- Modify: `frontend/src/views/RosterView.vue`, `frontend/src/views/RaidDetailView.vue`, `frontend/src/views/RaidListView.vue`
- Test: `frontend/src/views/RosterView.spec.ts`, `frontend/src/views/RaidDetailView.spec.ts`, `frontend/src/views/RaidListView.spec.ts`

- [ ] **Step 1: 加失败测试**

**RosterView.spec**（`已关闭攻坚…` 用例后追加；前置 `localStorage.setItem('dnfer-roster-targets-1', …)`，断言 mount 后已清）：

```ts
it('进入已关闭攻坚：清除该 raid 模板（localStorage + 内存）', async () => {
  localStorage.setItem('dnfer-roster-targets-1', JSON.stringify({ 0: { outputs: { count: 2 } } }))
  const snapshot = makeRaid([]); snapshot.closed = true
  const { wrapper } = await mountView([], admin, snapshot)
  await flushPromises()
  expect(localStorage.getItem('dnfer-roster-targets-1')).toBeNull()
  // 内存 targets 也清空 → 状态条回退「未设目标」（Task 5 起状态条恒渲染）
  expect(wrapper.find('.roster-squad-status').text()).toContain('未设目标')
})
```

**RaidDetailView.spec**（`describe('RaidDetailView 关闭攻坚')` 的关闭成功用例后追加）：

```ts
it('关闭攻坚成功 → 清除该 raid 模板', async () => {
  localStorage.setItem('dnfer-roster-targets-1', JSON.stringify({ 0: { outputs: { count: 2 } } }))
  apiMock.post.mockResolvedValueOnce({})
  // …复用该 describe 已有的 mount 方式（admin + open raid）
  await wrapper.find('[data-test="close-raid"]').trigger('click')
  await flushPromises()
  expect(localStorage.getItem('dnfer-roster-targets-1')).toBeNull()
})
```

**RaidListView.spec**（`admin can delete a raid after confirming` 用例后追加）：

```ts
it('删除攻坚成功 → 清除该 raid 模板', async () => {
  localStorage.setItem('dnfer-roster-targets-3', JSON.stringify({ 0: { outputs: { count: 2 } } }))
  // …复用该 describe 已有的 mount（含删除按钮）+ trigger 删除
  await flushPromises()
  expect(localStorage.getItem('dnfer-roster-targets-3')).toBeNull()
})
```

> 注：RaidDetailView/RaidListView 用例需按各自 spec 现有的 mount/数据构建方式补全（RaidListView 数据 id 用 3，对齐现有 `/api/raids/3`）。若测试文件无现成 mount 辅助，参照同 describe 内其它用例。

- [ ] **Step 2: 跑三处测试确认失败**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts src/views/RaidDetailView.spec.ts src/views/RaidListView.spec.ts`
Expected: FAIL（close/delete 未清模板）

- [ ] **Step 3: 实现**

**RosterView.vue**：import（11-14 行）加 `clearTargets`。`load()`（180-184 行）改：

```ts
async function load() {
  await store.load(rid)
  if (store.raid?.closed) {
    clearTargets(rid)
    targets.value = {}
    disconnect?.()   // 已关闭攻坚只读快照：断开 WS
  }
}
```
（WS `raid:closed` 分支已 `void load()`，走 load 内清除，无需重复。）

**RaidDetailView.vue**：顶部加 `import { clearTargets } from '../lib/roster'`。`onCloseRaid`（216-219 行）：

```ts
await api.post(`/api/raids/${store.raid.id}/close`)
clearTargets(store.raid.id)
notifySuccess('已关闭攻坚')
await load()
```
WS `raid:closed` 分支（84 行）：

```ts
if (ev.type === 'raid:closed') { clearTargets(rid); disconnect?.(); cancel(); void load() }
```

**RaidListView.vue**：顶部加 `import { clearTargets } from '../lib/roster'`。`onDelete`（58 行）：

```ts
try { await api.del(`/api/raids/${r.id}`); clearTargets(r.id); await load() }
catch (e: any) { notifyError(e.message) }
```

- [ ] **Step 4: 跑测试**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts src/views/RaidDetailView.spec.ts src/views/RaidListView.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RosterView.vue frontend/src/views/RosterView.spec.ts \
        frontend/src/views/RaidDetailView.vue frontend/src/views/RaidDetailView.spec.ts \
        frontend/src/views/RaidListView.vue frontend/src/views/RaidListView.spec.ts
git commit -m "$(cat <<'EOF'
[fix] roster：关闭/删除攻坚或进入已关闭攻坚时清除模板（clearTargets）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 收尾验证

- [ ] **Step 1: 全量前端测试**

Run: `cd frontend && npx vitest run`
Expected: 全部 PASS

- [ ] **Step 2: 类型/构建**

Run: `cd frontend && npm run build`
Expected: 通过（vue-tsc -b && vite build 无错误）

- [ ] **Step 3: 复核 spec 覆盖面** —— 对照 `docs/superpowers/specs/2026-10-20-roster-recommend-design.md` 逐条核对：
  - [ ] §3.1/§3.2：squadOverview 全维度、computeSquadStatus 已删（Task 1/5）
  - [ ] §3.3：recommendFillers P1-P5 + 混合类型 + 跨队去重（Task 3）
  - [ ] §4.1：RosterGrid 全维度状态条（Task 5）
  - [ ] §4.2：RosterPool recommend prop + 团号角标（Task 4）
  - [ ] §3.4/§4.3：clearTargets + 4 处 hook（Task 2/6）
- [ ] **Step 4: 硬化项（Task 3/Task 5 代码审阅遗留 Minor，酌情处理）**
  - [ ] `recommendType`：与 simMax 对称地处理 **buffMax 超限**（主奶 buff > buffMax 时不推辅助、返回 null）——决定是否加守卫并补测试
  - [ ] **同 gap tie-break** 补一个测试（当前排序用例都是不同 gap）
  - [ ] `slice(0, 6)` 的魔法数 6 提为具名常量 `MAX_SUGGESTIONS`
  - [ ] tie-break 注释措辞：跨类型比较仅影响输出展示顺序（会被末尾 `out.sort` 重排），不影响角色归属
  - [ ] 可选：`gapScore` 对 buffMax 超限不计缺口（与 simMax 对称）
  - [ ] `squadOverview` **mainHealBuff 只设上限且达标** 补镜像回归测试（现有只覆盖 simMax 单边；`buffMax` 单边达标 diff 应为 null）
  - [ ] 清理 `.dim-slack` 悬空 class（RosterGrid 模板用了但无 CSS 规则——要么加样式要么去掉）
  - [ ] **Task 6 审阅 Important**：RosterView WS `raid:closed` 时关闭 `targetModal.value.open`（正在编辑的目标弹窗 WS 关闭后仍开着，点保存会把模板写回 localStorage 重新泄漏）+ `onSaveTarget` 加 `!canEdit` 早退守卫 + 测试
  - [ ] **Task 6 审阅 Minor**：RaidDetailView.spec / RaidListView.spec 的 `beforeEach` 加 `localStorage.clear()`（防模板 key 跨用例泄漏）
- [ ] **Step 5: 若有遗留问题修复并提交**（如发现 spec 未覆盖场景，回到 Task 处理）

---

## 备注（实现时注意）

- **vitest 不做类型检查**：类型错误要到 `npm run build`（vue-tsc）才暴露。每个任务末尾跑 build。
- **`powerValue`** 输出取 `simulated_damage`、辅助取 `buff_amount`，是各自类型内的可比量纲；`recommendFillers` 只在同类里用 `bestCandidate` 比较，跨类型靠 `recommendType` 决定，不跨量纲。
- **RosterView.spec「推荐开关」用例依赖**：模板 `{0:{outputs:{count:2}}}` + 4 空格 → 红队无主C槽 → `recommendType` 返回「输出」→ 剑魂被推荐。若该用例后续被改坏，检查 `recommendType` 优先级是否按 spec 表。
- **并行团测试**：`wave2` 构造 `group_id: groupIndex` 仅测试用；真实 Wave 的 `group_id` 语义不影响 `recommendFillers`（只用 `group_index`/`round_index`/`id`）。
