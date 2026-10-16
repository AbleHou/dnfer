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
  notifyError: notifyMock.error,
  notifySuccess: notifyMock.success,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const users = [
  { id: 1, username: 'a', nickname: '甲', is_admin: false, avatar: null },
  { id: 2, username: 'b', nickname: '乙', is_admin: false, avatar: null },
  { id: 3, username: 'c', nickname: '丙', is_admin: false, avatar: null },
]

const chars = [
  { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 1, simulated_damage: 5,
    sustained_dps: 2, buff_amount: null, sun_buff: null },
  { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 2, simulated_damage: null,
    sustained_dps: null, buff_amount: 9000, sun_buff: null },
]

describe('SignupMemberPicker', () => {
  it('过滤团长与已报名者；选人后弹角色选择框，确认报名带 user_id + character_ids', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/users') return users
      if (url === '/api/admin/users/2/characters') return chars
      return []
    })
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
    // 弹框拉取目标用户角色，默认全选
    expect(apiMock.get).toHaveBeenCalledWith('/api/admin/users/2/characters')
    await wrapper.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/signups',
      { user_id: 2, character_ids: [1, 2] })
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

  it('选人后不开确认就不 POST 不 emit', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/users') return users
      if (url === '/api/admin/users/2/characters') return chars
      return []
    })
    const wrapper = mount(SignupMemberPicker, {
      props: { open: true, rid: 1, excludeUserIds: [1, 3] },
      global: { stubs: { teleport: true, UserAvatar: true } },
    })
    await flushPromises()
    await wrapper.findAll('.member-row')[0].trigger('click')
    await flushPromises()
    // 只打开弹框、不点确认 → 不 POST 不 emit（「取消」= 不提交即不报名）
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(wrapper.emitted('signedUp')).toBeUndefined()
  })

  it('拉取失败显示加载失败', async () => {
    apiMock.get.mockRejectedValue(new Error('网络错误'))
    const wrapper = mount(SignupMemberPicker, {
      props: { open: true, rid: 1, excludeUserIds: [] },
      global: { stubs: { teleport: true, UserAvatar: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('加载失败，请重试')
  })

  it('成功报名 emit signedUp/close 并提示', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/users') return users
      if (url === '/api/admin/users/2/characters') return chars
      return []
    })
    const wrapper = mount(SignupMemberPicker, {
      props: { open: true, rid: 1, excludeUserIds: [1, 3] },
      global: { stubs: { teleport: true, UserAvatar: true } },
    })
    await flushPromises()
    await wrapper.findAll('.member-row')[0].trigger('click')
    await flushPromises()
    await wrapper.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/signups',
      { user_id: 2, character_ids: [1, 2] })
    expect(notifyMock.success).toHaveBeenCalledWith('报名成功')
    expect(wrapper.emitted('signedUp')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
