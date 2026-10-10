// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterGrid from './RosterGrid.vue'
import type { Slot, Wave } from '../types'

const empty = (id: number, sq: number): Slot => ({ id, squad_index: sq, row_index: 0, character_id: null,
  character_name: null, character_class: null, job_name: null, job_title: null, fame: null,
  simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
  owner_id: null, owner_nickname: null, owner_avatar: null, duty: null, version: 1 })
const out = (id: number, sq: number): Slot => ({ ...empty(id, sq), character_id: 10, character_name: '剑魂',
  character_class: '输出', simulated_damage: 12000, owner_id: 3, owner_nickname: '队员', duty: '主C', version: 2 })
const wave = (id: number, slots: Slot[]): Wave => ({ id, index: id, group_id: null, round_index: 1, group_index: 1, slots })

function mountGrid(overrides: Record<string, unknown> = {}) {
  return mount(RosterGrid, {
    props: {
      groups: [wave(1, [out(1, 0), empty(2, 0)])],
      targets: {}, canEdit: true, holding: null, ...overrides,
    },
    global: { stubs: { RosterSlot: { template: '<div class="roster-slot-stub" />' }, teleport: true } },
  })
}

describe('RosterGrid', () => {
  it('渲染团 + 队组头部（红队/已填 x/y）', () => {
    const w = mountGrid()
    expect(w.text()).toContain('红队')
    expect(w.text()).toContain('1/2')
  })
  it('并行团并排渲染（两列）', () => {
    const w = mountGrid({ groups: [wave(1, [empty(1, 0)]), wave(2, [empty(2, 0)])] })
    expect(w.findAll('.roster-group').length).toBe(2)
  })
  it('有目标时队头显示缺口文案', () => {
    const w = mountGrid({ targets: { 0: { outputs: { count: 2 } } } })
    expect(w.text()).toContain('输出')
  })
  it('编辑目标按钮 emit editTarget', async () => {
    const w = mountGrid()
    await w.find('[data-act="edit-target-0"]').trigger('click')
    expect(w.emitted('editTarget')?.[0]?.[0]).toBe(0)
  })
  it('编辑目标按钮非编辑态隐藏', () => {
    const w = mountGrid({ canEdit: false })
    expect(w.find('[data-act="edit-target-0"]').exists()).toBe(false)
  })
})
