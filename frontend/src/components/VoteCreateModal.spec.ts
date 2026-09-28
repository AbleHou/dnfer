// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VoteCreateModal from './VoteCreateModal.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { post: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }))

describe('VoteCreateModal', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('提交创建投票', async () => {
    apiMock.post.mockResolvedValue({})
    const wrapper = mount(VoteCreateModal, { props: { open: true },
      global: { stubs: { teleport: true } } })
    await wrapper.find('[data-field="title"]').setValue('今晚团吗')
    await wrapper.find('[data-field="opt-0"]').setValue('打')
    await wrapper.find('[data-field="opt-1"]').setValue('不打')
    await wrapper.find('[data-act="create"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/votes',
      { title: '今晚团吗', description: '', multi_choice: false, options: ['打', '不打'] })
    expect(wrapper.emitted('created')).toHaveLength(1)
  })
  it('选项不足或重复不提交', async () => {
    const wrapper = mount(VoteCreateModal, { props: { open: true },
      global: { stubs: { teleport: true } } })
    await wrapper.find('[data-field="title"]').setValue('x')
    await wrapper.find('[data-field="opt-0"]').setValue('打')
    await wrapper.find('[data-field="opt-1"]').setValue('打')
    await wrapper.find('[data-act="create"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})
