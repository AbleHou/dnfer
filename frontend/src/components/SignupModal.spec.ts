// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SignupModal from './SignupModal.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

const chars = [
  { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 1, simulated_damage: 5,
    sustained_dps: 2, buff_amount: null },
  { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 1, simulated_damage: null,
    sustained_dps: null, buff_amount: 9000 },
]

function mountModal(overrides: Record<string, unknown> = {}) {
  return mount(SignupModal, {
    props: { open: true, mode: 'signup', selectedIds: [], ...overrides },
    global: { stubs: { teleport: true } },
  })
}

describe('SignupModal', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.get.mockResolvedValue(chars) })

  it('signup 模式默认全选，确认提交全部 id', async () => {
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('[data-act="submit"]').trigger('click')
    expect(wrapper.emitted('submit')).toEqual([[ [1, 2] ]])
  })

  it('signup 模式取消一个后提交剩余', async () => {
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('[data-act="char-1"]').setValue(false)
    await wrapper.find('[data-act="submit"]').trigger('click')
    expect(wrapper.emitted('submit')).toEqual([[ [2] ]])
  })

  it('signup 模式全不选不提交', async () => {
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('[data-act="char-1"]').setValue(false)
    await wrapper.find('[data-act="char-2"]').setValue(false)
    await wrapper.find('[data-act="submit"]').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('manage 模式勾选态由 selectedIds 派生，切换透传 toggle', async () => {
    const wrapper = mountModal({ mode: 'manage', selectedIds: [1] })
    await flushPromises()
    expect((wrapper.find('[data-act="char-1"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('[data-act="char-2"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper.find('[data-act="char-2"]').setValue(true)
    expect(wrapper.emitted('toggle')).toEqual([[2, true]])
  })
})
