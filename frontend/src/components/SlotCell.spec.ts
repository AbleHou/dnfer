// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlotCell from './SlotCell.vue'
import type { Slot } from '../types'

function occupied(id: number): Slot {
  return { id, squad_index: 0, row_index: 0, character_id: 1, character_name: '剑魂',
    character_class: '输出', job_name: 'weapon_master', job_title: '极诣·剑魂', fame: 1,
    simulated_damage: 2, sustained_dps: 3, buff_amount: null,
    owner_id: 1, owner_nickname: '甲', duty: '主C', version: 1 }
}
function empty(id: number): Slot {
  return { id, squad_index: 0, row_index: 0, character_id: null, character_name: null,
    character_class: null, job_name: null, job_title: null, fame: null,
    simulated_damage: null, sustained_dps: null, buff_amount: null,
    owner_id: null, owner_nickname: null, duty: null, version: 0 }
}

describe('SlotCell admin interactions', () => {
  it('管理员点击已占位格 emit manage', async () => {
    const s = occupied(1)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: false, isAdmin: true } })
    await wrapper.find('.slot-cell').trigger('click')
    expect((wrapper.emitted('manage')?.[0][0] as Slot).id).toBe(1)
  })

  it('非管理员点击已占位格不 emit manage', async () => {
    const s = occupied(1)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: false, isAdmin: false } })
    await wrapper.find('.slot-cell').trigger('click')
    expect(wrapper.emitted('manage')).toBeUndefined()
  })

  it('移动态下点击任意格 emit moveTo', async () => {
    const s = empty(2)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 1, editable: true, pickable: true, isAdmin: true, moveMode: true } })
    await wrapper.find('.slot-cell').trigger('click')
    expect((wrapper.emitted('moveTo')?.[0][0] as Slot).id).toBe(2)
  })

  it('移动源格显示「移动中」且点击 emit moveTo（由组合式函数处理取消）', async () => {
    const s = occupied(1)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: false, isAdmin: true, moveMode: true, moving: true } })
    expect(wrapper.text()).toContain('移动中')
    await wrapper.find('.slot-cell').trigger('click')
    expect((wrapper.emitted('moveTo')?.[0][0] as Slot).id).toBe(1)
  })

  it('移动态下占位格点击 emit moveTo 而非 pick', async () => {
    const s = empty(3)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: true, isAdmin: true, moveMode: true } })
    await wrapper.find('.slot-cell').trigger('click')
    expect(wrapper.emitted('pick')).toBeUndefined()
    expect(wrapper.emitted('moveTo')).toBeTruthy()
  })

  it('点击「撤下」链接只 emit remove，不 emit manage', async () => {
    const s = occupied(1)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: false, isAdmin: true } })
    const links = wrapper.findAll('a')
    const removeLink = links.find(a => a.text() === '撤下')
    expect(removeLink).toBeTruthy()
    await removeLink!.trigger('click')
    expect((wrapper.emitted('remove')?.[0][0] as Slot).id).toBe(1)
    expect(wrapper.emitted('manage')).toBeUndefined()
  })
})
