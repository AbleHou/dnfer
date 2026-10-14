// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlotActionModal from './SlotActionModal.vue'
import type { Slot } from '../types'

function mkSlot(over: Partial<Slot> = {}): Slot {
  return {
    id: 1, squad_index: 0, row_index: 0, character_id: 5, character_name: '剑魂',
    character_class: '输出' as const, job_name: 'weapon_master', job_title: '极诣·剑魂',
    fame: 1, simulated_damage: 1, sustained_dps: null, buff_amount: null, sun_buff: null,
    owner_id: 2, owner_nickname: '阿伟', owner_avatar: null, duty: '主C' as const, version: 0,
    adventure_party_id: 1, adventure_party_name: '阿伟的冒险团',
    ...over,
  }
}

describe('SlotActionModal', () => {
  it('已占格显示冒险团', () => {
    const w = mount(SlotActionModal, { props: { open: true, slot: mkSlot() },
      global: { stubs: { teleport: true } } })
    expect(w.text()).toContain('冒险团：阿伟的冒险团')
  })
  it('无团时不显示冒险团行', () => {
    const w = mount(SlotActionModal, { props: { open: true,
      slot: mkSlot({ adventure_party_id: null, adventure_party_name: null }) },
      global: { stubs: { teleport: true } } })
    expect(w.text()).not.toContain('冒险团')
  })
})
