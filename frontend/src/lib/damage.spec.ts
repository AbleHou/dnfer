import { describe, it, expect } from 'vitest'
import { sumSquadDamage } from './damage'
import type { Slot } from '../types'

function slot(partial: Partial<Slot>): Slot {
  return {
    id: 1, squad_index: 0, row_index: 0,
    character_id: null, character_name: null, character_class: null,
    job_name: null, job_title: null, fame: null,
    simulated_damage: null, sustained_dps: null, buff_amount: null,
    owner_id: null, owner_nickname: null, duty: null, version: 1,
    ...partial,
  }
}

describe('sumSquadDamage', () => {
  it('sums simulated damage and sustained dps of occupied output slots', () => {
    const slots = [
      slot({ character_id: 1, character_class: '输出', simulated_damage: 100, sustained_dps: 30 }),
      slot({ character_id: 2, character_class: '输出', simulated_damage: 68, sustained_dps: 22 }),
    ]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 168, sustained: 52, hasOutput: true })
  })

  it('ignores support and empty slots', () => {
    const slots = [
      slot({ character_id: 3, character_class: '辅助', buff_amount: 9000 }),
      slot({ character_id: null, character_class: null }),
      slot({ character_id: 1, character_class: '输出', simulated_damage: 100, sustained_dps: 30 }),
    ]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 100, sustained: 30, hasOutput: true })
  })

  it('skips null value fields on output slots', () => {
    const slots = [
      slot({ character_id: 1, character_class: '输出', simulated_damage: 100, sustained_dps: null }),
      slot({ character_id: 2, character_class: '输出', simulated_damage: null, sustained_dps: 20 }),
    ]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 100, sustained: 20, hasOutput: true })
  })

  it('empty squad returns zeros and hasOutput false', () => {
    expect(sumSquadDamage([])).toEqual({ simulated: 0, sustained: 0, hasOutput: false })
  })

  it('pure support squad has hasOutput false', () => {
    const slots = [
      slot({ character_id: 3, character_class: '辅助', buff_amount: 9000 }),
      slot({ character_id: 4, character_class: '辅助', buff_amount: 7000 }),
    ]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 0, sustained: 0, hasOutput: false })
  })

  it('occupied output with all-null values has hasOutput true and zero sums', () => {
    const slots = [slot({ character_id: 1, character_class: '输出' })]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 0, sustained: 0, hasOutput: true })
  })

  it('unoccupied slot typed as output is excluded and does not set hasOutput', () => {
    const slots = [slot({ character_id: null, character_class: '输出', simulated_damage: 999 })]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 0, sustained: 0, hasOutput: false })
  })
})
