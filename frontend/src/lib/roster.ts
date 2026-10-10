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
