// frontend/src/lib/roster.ts
import type { Character, Duty, Slot, Wave } from '../types'
import { sumSquadDamage } from './damage'

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
    return raw ? ((JSON.parse(raw) as SquadTargets) ?? {}) : {}
  } catch { return {} }
}
export function saveTargets(raidId: number, targets: SquadTargets): void {
  try { localStorage.setItem(TARGETS_KEY(raidId), JSON.stringify(targets)) } catch { /* 忽略 */ }
}
export function clearTargets(raidId: number): void {
  try { localStorage.removeItem(TARGETS_KEY(raidId)) } catch { /* 隐私模式等忽略 */ }
}

/** 填格职责决策表：只看队伍当前状态，与模板无关（防后端「至多一名主奶」硬 400）。 */
export function inferFillDuty(squadSlots: Slot[], classType: Character['class_type']): Duty {
  const hasMainHeal = squadSlots.some(s => s.duty === '主奶')
  const hasMainC = squadSlots.some(s => s.duty === '主C')
  if (classType === '辅助') return hasMainHeal ? '太阳奶' : '主奶'
  return hasMainC ? '辅C' : '主C'
}

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
  return { filled: filled.length, total, dims, slack, ok: slack || dims.every(d => d.ok), issues }
}

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
  if (st.slack) return 0   // 有划水成员也豁免（与达标徽章一致）
  let gap = 0
  if (target.outputs?.count != null) gap += Math.max(0, target.outputs.count - st.outputCount)
  if (target.outputs?.simMin != null && st.outputTotal < target.outputs.simMin) gap += 1
  if (target.mainHeal?.buffMin != null && (st.mainHealBuff == null || st.mainHealBuff < target.mainHeal.buffMin)) gap += 1
  if (target.sunHeal?.count != null) gap += Math.max(0, target.sunHeal.count - st.sunHealCount)
  return gap
}

/** 候选角色是否适配某队（按模板所需角色类型 + 队伍状态）。无模板 → 不认为适配。 */
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

/** 角色在整场攻坚的占位信息（后端保证每角色至多占一格）。 */
export interface CharPlacement {
  roundIndex: number          // 展示用波数（round_index）
  groupId: number | null      // 并行团 id；null=独立单波
  groupIndex: number          // 团号（展示用）
  squadIndex: number          // 队索引 0..4 → SQUAD_NAMES
  duty: Duty | null
  userId: number | null
}

export function placementByChar(waves: Wave[]): Map<number, CharPlacement> {
  const m = new Map<number, CharPlacement>()
  for (const w of waves) {
    for (const s of w.slots) {
      if (s.character_id == null) continue
      m.set(s.character_id, {
        roundIndex: w.round_index,
        groupId: w.group_id,
        groupIndex: w.group_index,
        squadIndex: s.squad_index,
        duty: s.duty,
        userId: s.owner_id,
      })
    }
  }
  return m
}
