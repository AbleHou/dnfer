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
