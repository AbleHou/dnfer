// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WaveSection from './WaveSection.vue'
import type { Wave } from '../types'

function makeWave(over: Partial<Wave> = {}): Wave {
  return { id: 1, index: 1, group_id: null, round_index: 1, group_index: 1, slots: [], ...over }
}
function mountWave(wave: Wave, opts: { isAdmin?: boolean; canDelete?: boolean } = {}) {
  return mount(WaveSection, {
    props: { wave, editable: true, isAdmin: opts.isAdmin ?? true,
             canDelete: opts.canDelete ?? true, currentUserId: null },
    global: { stubs: { SlotCell: true } },
  })
}

describe('WaveSection 并行标签与操作', () => {
  it('独立波显示 第X波（无团号）', () => {
    const w = mountWave(makeWave())
    expect(w.text()).toContain('第 1 波')
    expect(w.text()).not.toContain('团')
  })
  it('并行波显示 第X波Y团', () => {
    const w = mountWave(makeWave({ group_id: 5, round_index: 1, group_index: 2 }))
    expect(w.text()).toContain('第 1 波 2 团')
  })
  it('独立波显示「并行到…」，管理员点击 emit parallelize', async () => {
    const wave = makeWave()
    const w = mountWave(wave)
    const btn = w.find('[data-act="parallelize"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(w.emitted('parallelize')).toBeTruthy()
    expect(w.emitted('parallelize')![0][0]).toEqual(wave)
  })
  it('轮内波显示「取消并行」，点击 emit unparallelize', async () => {
    const wave = makeWave({ group_id: 5 })
    const w = mountWave(wave)
    const btn = w.find('[data-act="unparallelize"]')
    expect(btn.exists()).toBe(true)
    expect(w.find('[data-act="parallelize"]').exists()).toBe(false)
    await btn.trigger('click')
    expect(w.emitted('unparallelize')).toBeTruthy()
  })
  it('非管理员不显示并行控件', () => {
    const w = mountWave(makeWave(), { isAdmin: false })
    expect(w.find('[data-act="parallelize"]').exists()).toBe(false)
    expect(w.find('[data-act="unparallelize"]').exists()).toBe(false)
  })
  it('删除本波仅 canDelete 时显示', () => {
    expect(mountWave(makeWave(), { canDelete: true }).find('.wave-delete').exists()).toBe(true)
    expect(mountWave(makeWave(), { canDelete: false }).find('.wave-delete').exists()).toBe(false)
  })
})
