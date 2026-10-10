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
})
