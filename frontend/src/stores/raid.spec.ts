import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRaidStore, applyEvent } from './raid'
import type { Raid } from '../types'

function makeRaid(): Raid {
  return {
    id: 1, name: 'x', dungeon: '', size: 12, locked: false,
    waves: [{ id: 1, index: 1, slots: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, squad_index: Math.floor(i / 4), row_index: i % 4,
      character_id: null, character_name: null, character_class: null, fame: null,
      simulated_damage: null, sustained_dps: null, buff_amount: null,
      owner_id: null, owner_nickname: null, duty: null, version: 0 })) }],
  }
}

describe('raid store', () => {
  it('applies slot:filled event by id', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    applyEvent(store, { type: 'slot:filled', slot: {
      id: 1, squad_index: 0, row_index: 0, character_id: 9, character_name: '剑魂',
      character_class: '输出', fame: 1, simulated_damage: 2, sustained_dps: 3, buff_amount: null,
      owner_id: 9, owner_nickname: '甲', duty: '主C', version: 1 } })
    expect(store.raid!.waves[0].slots[0].character_name).toBe('剑魂')
  })

  it('applies wave:added', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    // wave:added 仅带 index，客户端拉快照刷新（简单策略）
    applyEvent(store, { type: 'wave:added', index: 2 })
    // 简单策略：置 needRefresh 标志
    expect(store.needRefresh).toBe(true)
  })

  it('replaces slot on version conflict by applying server payload', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    applyEvent(store, { type: 'slot:removed', slot_id: 1 })
    expect(store.raid!.waves[0].slots[0].character_id).toBeNull()
  })

  it('applies slot:duty_changed', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    applyEvent(store, { type: 'slot:filled', slot: {
      id: 1, squad_index: 0, row_index: 0, character_id: 9, character_name: '剑魂',
      character_class: '输出', fame: 1, simulated_damage: 2, sustained_dps: 3, buff_amount: null,
      owner_id: 9, owner_nickname: '甲', duty: '主C', version: 1 } })
    applyEvent(store, { type: 'slot:duty_changed', slot: {
      id: 1, squad_index: 0, row_index: 0, character_id: 9, character_name: '剑魂',
      character_class: '输出', fame: 1, simulated_damage: 2, sustained_dps: 3, buff_amount: null,
      owner_id: 9, owner_nickname: '甲', duty: '辅C', version: 2 } })
    expect(store.raid!.waves[0].slots[0].duty).toBe('辅C')
  })

  it('ignores stale events with lower version', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    applyEvent(store, { type: 'slot:filled', slot: {
      id: 1, squad_index: 0, row_index: 0, character_id: 9, character_name: '剑魂',
      character_class: '输出', fame: 1, simulated_damage: 2, sustained_dps: 3, buff_amount: null,
      owner_id: 9, owner_nickname: '甲', duty: '主C', version: 2 } })
    // stale v1 event must NOT overwrite v2
    applyEvent(store, { type: 'slot:duty_changed', slot: {
      id: 1, squad_index: 0, row_index: 0, character_id: 9, character_name: '剑魂',
      character_class: '输出', fame: 1, simulated_damage: 2, sustained_dps: 3, buff_amount: null,
      owner_id: 9, owner_nickname: '甲', duty: '主奶', version: 1 } })
    expect(store.raid!.waves[0].slots[0].duty).toBe('主C')
  })
})
