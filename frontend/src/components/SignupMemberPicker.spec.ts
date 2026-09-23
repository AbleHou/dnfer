// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SignupMemberPicker from './SignupMemberPicker.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn() },
  notifyMock: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true),
  notifyError: notifyMock.error,
  notifySuccess: notifyMock.success,
}))

beforeEach(() => vi.clearAllMocks())

const users = [
  { id: 1, username: 'a', nickname: '甲', is_admin: false, avatar: null },
  { id: 2, username: 'b', nickname: '乙', is_admin: false, avatar: null },
  { id: 3, username: 'c', nickname: '丙', is_admin: false, avatar: null },
]

describe('SignupMemberPicker', () => {
  it('过滤团长与已报名者，点击帮报名', async () => {
    apiMock.get.mockResolvedValue(users)
    const wrapper = mount(SignupMemberPicker, {
      props: { open: true, rid: 1, excludeUserIds: [1, 3] },
      global: { stubs: { teleport: true, UserAvatar: true } },
    })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/admin/users')
    expect(wrapper.text()).toContain('乙')
    expect(wrapper.text()).not.toContain('甲')
    await wrapper.findAll('.member-row')[0].trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/signups', { user_id: 2 })
  })

  it('全部已报名时显示空态', async () => {
    apiMock.get.mockResolvedValue(users)
    const wrapper = mount(SignupMemberPicker, {
      props: { open: true, rid: 1, excludeUserIds: [1, 2, 3] },
      global: { stubs: { teleport: true, UserAvatar: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('所有人都已报名')
  })
})
