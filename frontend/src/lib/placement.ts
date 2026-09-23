import type { CharacterPlacement, Raid } from '../types'

export function buildPlacementMap(raid: Raid): Record<number, CharacterPlacement> {
  const map: Record<number, CharacterPlacement> = {}
  for (const w of raid.waves) {
    for (const s of w.slots) {
      if (s.character_id == null) continue
      map[s.character_id] = {
        wave_index: w.index,
        squad_index: s.squad_index,
        duty: s.duty ?? '主C', // 已占位格 duty 必有值；类型为 Duty | null，兜底避免 vue-tsc 报错
      }
    }
  }
  return map
}
