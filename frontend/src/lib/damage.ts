import type { Slot } from '../types'

export interface SquadDamage {
  simulated: number
  sustained: number
  hasOutput: boolean
}

export function sumSquadDamage(slots: Slot[]): SquadDamage {
  let simulated = 0
  let sustained = 0
  let hasOutput = false
  for (const s of slots) {
    if (s.character_id == null || s.character_class !== '输出') continue
    hasOutput = true
    if (s.simulated_damage != null) simulated += s.simulated_damage
    if (s.sustained_dps != null) sustained += s.sustained_dps
  }
  return { simulated, sustained, hasOutput }
}
