// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VoteCard from './VoteCard.vue'
import { confirmDialog } from '../lib/notify'

const { apiMock } = vi.hoisted(() => ({ apiMock: { post: vi.fn(), del: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true), notifyError: vi.fn(), notifySuccess: vi.fn(), notifyWarning: vi.fn(),
}))

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
  it('非管理员不显示关闭按钮', async () => {
    const wrapper = mount(VoteCard, { props: { vote: openVote } })
    expect(wrapper.find('[data-act="close"]').exists()).toBe(false)
  })
  it('管理员可关闭投票并触发 refresh', async () => {
    apiMock.post.mockResolvedValue(openVote)
    const wrapper = mount(VoteCard, { props: { vote: openVote, isAdmin: true } })
    expect(wrapper.find('[data-act="close"]').exists()).toBe(true)
    await wrapper.find('[data-act="close"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/votes/1/close')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })
  it('已实名投票不显示投票按钮', async () => {
    const voted = { ...openVote, my_voted: true, my_option_ids: [1],
      options: [{ ...openVote.options[0], count: 1, voters: ['某人'] }, openVote.options[1]] }
    const wrapper = mount(VoteCard, { props: { vote: voted } })
    expect(wrapper.find('[data-act="vote"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('你已投票')
  })
  it('5s 轮询刷新不清空进行中的多选', async () => {
    const multi = { ...openVote, multi_choice: true }
    const wrapper = mount(VoteCard, { props: { vote: multi } })
    await wrapper.find('[data-act="opt-1"]').trigger('click')
    await wrapper.find('[data-act="opt-2"]').trigger('click')
    expect(wrapper.findAll('.vote-option.selected')).toHaveLength(2)
    // 模拟轮询：props.vote 换新对象引用但 my_voted 仍 false → 选择应保留
    await wrapper.setProps({ vote: { ...multi, total_voters: 1 } })
    expect(wrapper.findAll('.vote-option.selected')).toHaveLength(2)
  })
  it('实名投票成功后回填我的选择', async () => {
    const wrapper = mount(VoteCard, { props: { vote: openVote } })
    await wrapper.find('[data-act="opt-1"]').trigger('click')  // 本地选中 [1]
    await wrapper.find('[data-act="vote"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    // 父组件刷新返回已投票详情，但 my_option_ids 与本地点击不同 → 必须靠 watcher 覆盖残留
    const voted = {
      ...openVote,
      my_voted: true, my_option_ids: [2],
      options: [openVote.options[0], { ...openVote.options[1], count: 1, voters: ['某人'] }],
    }
    await wrapper.setProps({ vote: voted })
    const lis = wrapper.findAll('.vote-option')
    expect(lis[0].classes()).not.toContain('selected')  // 旧残留 [1] 被覆盖
    expect(lis[1].classes()).toContain('selected')      // 由 my_option_ids=[2] 回填
  })
})
