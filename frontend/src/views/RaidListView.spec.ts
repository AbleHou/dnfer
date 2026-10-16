// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RaidListView from './RaidListView.vue'
import { useAuthStore } from '../stores/auth'
import type { Dungeon, RaidListItem, Character } from '../types'

const { apiMock, confirmDialogMock, notifyErrorMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  confirmDialogMock: vi.fn(async () => true),
  notifyErrorMock: vi.fn(),
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}))
vi.mock('../lib/notify', () => ({
  confirmDialog: confirmDialogMock,
  notifyError: notifyErrorMock,
  notifyWarning: vi.fn(),
  notifySuccess: vi.fn(),
}))

const dungeons: Dungeon[] = [{ id: 7, name: '巴卡尔', size: 16, description: '', created_at: '' }]
const raid: RaidListItem = { id: 3, name: '巴卡尔', dungeon_id: 7, dungeon_name: '巴卡尔',
  size: 16, locked: false, closed: false, starts_at: '2026-09-20T14:00:00', wave_count: 1,
  signup_count: 0, my_signed_up: false }
const chars: Character[] = [
  { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 1, simulated_damage: 5,
    sustained_dps: 2, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null },
  { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 2, simulated_damage: null,
    sustained_dps: null, buff_amount: 9000, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  confirmDialogMock.mockResolvedValue(true)
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/raids') return [] as RaidListItem[]
    if (url === '/api/dungeons') return dungeons
    if (url === '/api/me/characters') return chars
    return []
  })
})

describe('RaidListView create form', () => {
  it('selecting a dungeon auto-fills name and shows locked size', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null, is_banned: false, is_guest: false }

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    await wrapper.find('[data-test="create-toggle"]').trigger('click')
    await wrapper.findComponent({ name: 'Select' }).vm.$emit('update:value', 7)
    await flushPromises()

    const nameInput = wrapper.findAllComponents({ name: 'Input' })
      .find(c => c.attributes('data-test') === 'name-input')
    expect(nameInput?.props('value')).toBe('巴卡尔')
    expect(wrapper.text()).toContain('规模锁定：16 人')
  })

  it('keeps the selected start time after the datetime panel closes', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null, is_banned: false, is_guest: false }

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    await wrapper.find('[data-test="create-toggle"]').trigger('click')

    const dp: any = wrapper.findComponent({ name: 'DatePicker' }).vm
    const ts = new Date('2026-09-20T14:00:00').getTime()
    // 复现 datetime 面板：点选日期只更新 pending，随后面板关闭才提交。
    dp.handleTriggerClick({})
    dp.handlePanelUpdateValue(ts, false)
    dp.handlePanelClose(false)
    await flushPromises()

    expect(dp.formattedValue).toBe('2026-09-20T14:00:00')
  })

  it('does not fetch dungeons for non-admin members', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null, is_banned: false, is_guest: false }

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    expect(apiMock.get).not.toHaveBeenCalledWith('/api/dungeons')
  })

  it('admin can delete a raid after confirming', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null, is_banned: false, is_guest: false }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/dungeons') return dungeons
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    const delBtn = wrapper.findAll('button').find(b => b.text().includes('删除'))
    expect(delBtn).toBeTruthy()
    await delBtn!.trigger('click')
    await flushPromises()
    expect(confirmDialogMock).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/raids/3')
  })

  it('cancel keeps the raid', async () => {
    confirmDialogMock.mockResolvedValue(false)
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null, is_banned: false, is_guest: false }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/dungeons') return dungeons
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('删除'))!.trigger('click')
    await flushPromises()
    expect(apiMock.del).not.toHaveBeenCalled()
  })

  it('does not show delete button for non-admin', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null, is_banned: false, is_guest: false }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('删除')
  })

  it('non-admin 点报名弹角色选择框，确认后带 character_ids 报名', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null, is_banned: false, is_guest: false }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/me/characters') return chars
      return []
    })
    const wrapper = mount(RaidListView, {
      global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub, teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('已报名 1 人') // 报名人数含团长（与详情一致）
    // 点报名：打开弹框（默认全选），不立即 POST
    await wrapper.find('[data-test="signup"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalledWith(expect.stringContaining('/signup'))
    // 确认报名 → 带 character_ids
    await wrapper.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/3/signup', { character_ids: [1, 2] })
  })

  it('non-admin 报名失败提示错误且弹框保持打开', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null, is_banned: false, is_guest: false }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/me/characters') return chars
      return []
    })
    apiMock.post.mockRejectedValueOnce(new Error('网络错误'))
    const wrapper = mount(RaidListView, {
      global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub, teleport: true } },
    })
    await flushPromises()
    await wrapper.find('[data-test="signup"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/3/signup', { character_ids: [1, 2] })
    expect(notifyErrorMock).toHaveBeenCalledWith('网络错误')
    // 失败不关闭：signupTarget 未清 → SignupModal 仍 open，提交按钮仍在
    expect(wrapper.find('[data-act="submit"]').exists()).toBe(true)
  })

  it('shows 已报名 badge instead of button when signed up', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null, is_banned: false, is_guest: false }
    const signed: RaidListItem = { ...raid, my_signed_up: true, signup_count: 3 }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [signed] as RaidListItem[]
      return []
    })
    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    expect(wrapper.text()).toContain('已报名 4 人') // 含团长
    expect(wrapper.find('[data-test="signup"]').exists()).toBe(false)
  })

  it('info area links to detail (covers meta/status/signup, not just the name)', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null, is_banned: false, is_guest: false }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/dungeons') return dungeons
      return []
    })
    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    const link = wrapper.findAllComponents(RouterLinkStub)[0]
    expect(link.props('to')).toBe('/raids/3')
    // 可点击区域覆盖副本/规模/状态/报名人数，而非仅名称
    expect(link.text()).toContain('巴卡尔')
    expect(link.text()).toContain('16 人')
    expect(link.text()).toContain('未锁定')
    expect(link.text()).toContain('已报名 1 人')
    // 操作按钮留在链接之外，不参与整卡跳转
    expect(wrapper.find('[data-test="signup"]').exists()).toBe(true)
  })
})
