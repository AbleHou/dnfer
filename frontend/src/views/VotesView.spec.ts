// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VotesView from './VotesView.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }))

const list = [{ id: 1, title: '要不要开荒', multi_choice: false, open: true,
  created_at: '2026-09-28T00:00:00', closed_at: null, total_voters: 0 }]
const detail = { id: 1, title: '要不要开荒', description: '', multi_choice: false, open: true,
  created_at: '2026-09-28T00:00:00', closed_at: null,
  options: [{ id: 1, text: '打', count: 0, voters: [] }, { id: 2, text: '不打', count: 0, voters: [] }],
  total_voters: 0, my_option_ids: [], my_voted: false }

describe('VotesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/api/votes') return Promise.resolve(list)
      if (url === '/api/votes/1') return Promise.resolve(detail)
      return Promise.resolve([])
    })
  })
  it('加载列表并渲染投票卡片', async () => {
    const wrapper = mount(VotesView, {
      global: { plugins: [createPinia()], stubs: { VoteCard: true } },
    })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/votes')
    expect(apiMock.get).toHaveBeenCalledWith('/api/votes/1')
    expect(wrapper.findComponent({ name: 'VoteCard' }).exists()).toBe(true)
    wrapper.unmount()  // 清掉 5s 轮询定时器
  })
  it('非管理员不显示发起按钮', async () => {
    const wrapper = mount(VotesView, {
      global: { plugins: [createPinia()], stubs: { VoteCard: true, VoteCreateModal: true } },
    })
    await flushPromises()
    expect(wrapper.find('[data-act="create-toggle"]').exists()).toBe(false) // auth.user 为 null → 非管理员
    wrapper.unmount()
  })
})
