// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterSlot from './RosterSlot.vue'
import type { Slot } from '../types'

const emptySlot: Slot = { id: 1, squad_index: 0, row_index: 0, character_id: null, character_name: null,
  character_class: null, job_name: null, job_title: null, fame: null, simulated_damage: null,
  sustained_dps: null, buff_amount: null, sun_buff: null, owner_id: null, owner_nickname: null,
  owner_avatar: null, duty: null, version: 1 }
const filledSlot: Slot = { ...emptySlot, id: 2, character_id: 10, character_name: '剑魂',
  character_class: '输出', job_name: 'weapon_master', job_title: '极诣·剑魂',
  simulated_damage: 12000, sustained_dps: 3000, owner_id: 3, owner_nickname: '队员',
  duty: '主C', version: 2 }
const healSlot: Slot = { ...emptySlot, id: 3, character_id: 20, character_name: '奶',
  character_class: '辅助', job_name: 'crusader_female', job_title: '神启·圣骑士',
  buff_amount: 46000, sun_buff: 1000, owner_id: 3, owner_nickname: '队员', duty: '主奶', version: 2 }

function mountSlot(props: Record<string, unknown>) {
  return mount(RosterSlot, { props: { slot: emptySlot, canEdit: true, dropTarget: false, ...props },
    global: { stubs: { DutySelect: true, teleport: true } } })
}

describe('RosterSlot', () => {
  it('空格在 dropTarget 时显示占位按钮', async () => {
    const w = mountSlot({ dropTarget: true })
    expect(w.text()).toContain('＋')
  })
  it('空格非 dropTarget 不显示占位按钮', () => {
    const w = mountSlot({})
    expect(w.text()).not.toContain('＋')
  })
  it('dropTarget 空格点击 emit place', async () => {
    const w = mountSlot({ dropTarget: true })
    await w.find('.roster-slot').trigger('click')
    expect(w.emitted('place')).toBeTruthy()
  })
  it('已占格显示 owner/角色名/数值', () => {
    const w = mountSlot({ slot: filledSlot })
    expect(w.text()).toContain('队员'); expect(w.text()).toContain('剑魂')
    expect(w.text()).toContain('12000')
  })
  it('已占格 canEdit 时显示撤下与拿起', () => {
    const w = mountSlot({ slot: filledSlot })
    expect(w.text()).toContain('撤下'); expect(w.text()).toContain('拿起')
  })
  it('已占辅助格显示增益且无 亿 单位', () => {
    const w = mountSlot({ slot: healSlot })
    expect(w.text()).toContain('46000')
    expect(w.text()).not.toContain('46000亿')
  })
  it('撤下点击 emit remove', async () => {
    const w = mountSlot({ slot: filledSlot })
    await w.find('[data-act="roster-remove"]').trigger('click')
    expect(w.emitted('remove')).toBeTruthy()
  })
  it('拿起点击 emit pickUp', async () => {
    const w = mountSlot({ slot: filledSlot })
    await w.find('[data-act="roster-pickup"]').trigger('click')
    expect(w.emitted('pickUp')).toBeTruthy()
  })
  it('已占格点击 emit manage', async () => {
    const w = mountSlot({ slot: filledSlot })
    await w.find('.roster-slot').trigger('click')
    expect(w.emitted('manage')).toBeTruthy()
  })
})
