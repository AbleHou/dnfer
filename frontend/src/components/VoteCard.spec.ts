// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VoteCard from './VoteCard.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { post: vi.fn(), del: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn(), notifyWarning: vi.fn() }))

const openVote = {
  id: 1, title: '要不要开荒', description: '', multi_choice: false, open: true,
  created_at: '2026-09-28T00:00:00', closed_at: null,
  options: [{ id: 1, text: '打', count: 0, voters: [] },
            { id: 2, text: '不打', count: 0, voters: [] }],
  total_voters: 0, my_option_ids: [], my_voted: false,
}

describe('VoteCard', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('实名投票提交并触发 refresh', async () => {
    apiMock.post.mockResolvedValue(openVote)
    const wrapper = mount(VoteCard, { props: { vote: openVote } })
    await wrapper.find('[data-act="opt-1"]').trigger('click')
    await wrapper.find('[data-act="vote"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/votes/1/ballots',
      { option_ids: [1], anonymous: false })
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })
  it('拉起面罩后匿名投票', async () => {
    apiMock.post.mockResolvedValue(openVote)
    const wrapper = mount(VoteCard, { props: { vote: openVote } })
    await wrapper.find('[data-act="mask"]').trigger('click')  // 拉起面罩
    await wrapper.find('[data-act="opt-1"]').trigger('click')
    await wrapper.find('[data-act="vote"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/votes/1/ballots',
      { option_ids: [1], anonymous: true })
  })
  it('已实名投票不显示投票按钮', async () => {
    const voted = { ...openVote, my_voted: true, my_option_ids: [1],
      options: [{ ...openVote.options[0], count: 1, voters: ['某人'] }, openVote.options[1]] }
    const wrapper = mount(VoteCard, { props: { vote: voted } })
    expect(wrapper.find('[data-act="vote"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('你已投票')
  })
})
