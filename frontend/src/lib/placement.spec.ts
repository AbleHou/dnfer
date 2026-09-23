import { describe, it, expect } from 'vitest'
import { buildPlacementMap } from './placement'
import type { Raid, Slot } from '../types'

function slot(id: number, characterId: number | null, squad: number, duty: string | null): Slot {
  return { id, squad_index: squad, row_index: 0, character_id: characterId,
    character_name: characterId ? 'x' : null, character_class: characterId ? '输出' : null,
    job_name: characterId ? 'weapon_master' : null, job_title: null, fame: null,
    simulated_damage: null, sustained_dps: null, buff_amount: null,
    owner_id: characterId, owner_nickname: null, owner_avatar: null,
    duty: duty as any, version: 0 }
}

function makeRaid(waves: Raid['waves']): Raid {
  return { id: 1, name: 'x', dungeon_id: 1, dungeon_name: '副本', starts_at: 'x',
    size: 12, locked: false, signups: [], waves }
}

describe('buildPlacementMap', () => {
  it('maps placed characters across waves/squads', () => {
    const raid = makeRaid([
      { id: 1, index: 1, slots: [slot(1, 11, 0, '主C'), slot(2, 12, 1, '主奶'), slot(3, null, 0, null)] },
      { id: 2, index: 2, slots: [slot(4, 13, 2, '划水')] },
    ])
    const map = buildPlacementMap(raid)
    expect(map[11]).toEqual({ wave_index: 1, squad_index: 0, duty: '主C' })
    expect(map[12]).toEqual({ wave_index: 1, squad_index: 1, duty: '主奶' })
    expect(map[13]).toEqual({ wave_index: 2, squad_index: 2, duty: '划水' })
    expect(map[99]).toBeUndefined()
  })

  it('returns empty map for empty raid', () => {
    expect(buildPlacementMap(makeRaid([]))).toEqual({})
  })
})
