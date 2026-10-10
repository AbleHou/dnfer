// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterTargetModal from './RosterTargetModal.vue'
import type { SquadTarget } from '../lib/roster'

async function mountModal(target: SquadTarget | null) {
  const w = mount(RosterTargetModal, {
    props: { open: true, squadLabel: '红队', target },
    global: { stubs: { teleport: true } },
  })
  await w.vm.$nextTick()
  return w
}

describe('RosterTargetModal', () => {
  it('已有目标预填输入框', async () => {
    const w = await mountModal({ outputs: { count: 2, simMin: 20000, simMax: 25000 },
      mainHeal: { buffMin: 45000 }, sunHeal: { count: 1 } })
    expect((w.find('[data-test="tgt-out-count"] input').element as HTMLInputElement).value).toBe('2')
    expect((w.find('[data-test="tgt-sim-min"] input').element as HTMLInputElement).value).toBe('20000')
  })
  it('保存 emit 规范化后的 target', async () => {
    const w = await mountModal({})
    await w.find('[data-test="tgt-save"]').trigger('click')
    const saved = w.emitted('save')?.[0]?.[0] as SquadTarget
    expect(saved.outputs).toBeUndefined()
  })
  it('关闭 emit close', async () => {
    const w = await mountModal({})
    await w.find('[data-test="tgt-close"]').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
  it('部分目标保存：保留已填字段、省略空字段', async () => {
    const w = await mountModal({ outputs: { count: undefined, simMin: 20000, simMax: undefined } })
    await w.find('[data-test="tgt-save"]').trigger('click')
    const saved = w.emitted('save')?.[0]?.[0] as SquadTarget
    expect(saved.outputs?.simMin).toBe(20000)
    expect(saved.outputs?.count).toBeUndefined()
    expect(saved.outputs?.simMax).toBeUndefined()
  })
  it('仅主奶/仅太阳奶目标', async () => {
    const w = await mountModal({ mainHeal: { buffMin: 45000 }, sunHeal: { count: 1 } })
    await w.find('[data-test="tgt-save"]').trigger('click')
    const saved = w.emitted('save')?.[0]?.[0] as SquadTarget
    expect(saved.mainHeal?.buffMin).toBe(45000)
    expect(saved.sunHeal?.count).toBe(1)
    expect(saved.outputs).toBeUndefined()
  })
  it('划水豁免勾选 → 保存含 slack:true', async () => {
    const w = await mountModal({})
    await w.find('[data-test="tgt-slack"]').trigger('click')
    await w.find('[data-test="tgt-save"]').trigger('click')
    const saved = w.emitted('save')?.[0]?.[0] as SquadTarget
    expect(saved.slack).toBe(true)
  })
  it('预填后清空 → 保存省略该字段', async () => {
    const w = await mountModal({ outputs: { simMin: 20000 } })
    await w.find('[data-test="tgt-sim-min"] input').setValue('')
    await w.find('[data-test="tgt-save"]').trigger('click')
    const saved = w.emitted('save')?.[0]?.[0] as SquadTarget
    expect(saved.outputs).toBeUndefined()
  })
})
