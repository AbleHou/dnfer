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
  localStorage.setItem(TARGETS_KEY(raidId), JSON.stringify(targets))
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
