// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminUsersView from './AdminUsersView.vue'
import { confirmDialog } from '../lib/notify'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), getJobs: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))

const users = [{ id: 2, username: 'a', nickname: '阿甲', is_admin: false, avatar: null,
  is_banned: false, character_count: 1 }]
const query = { items: [{ id: 9, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: 'swordman_male', class_type: '输出' as const, fame: 100,
  simulated_damage: null, sustained_dps: null, buff_amount: null,
  owner_id: 2, owner_nickname: '阿甲', owner_username: 'a', owner_is_banned: false }], total: 1 }
const jobs = [{ id: 1, name: 'swordman_male', title: '鬼剑士(男)',
  children: [{ id: 11, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' as const }] }]

describe('AdminUsersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/api/admin/users') return Promise.resolve(users)
      if (url.startsWith('/api/admin/characters/query')) return Promise.resolve(query)
      return Promise.resolve([])
    })
    apiMock.getJobs.mockResolvedValue(jobs)
  })
  it('角色查询带筛选与排序参数', async () => {
    const wrapper = mount(AdminUsersView, { global: { stubs: { AdminNav: true, AdminUserCharactersModal: true } } })
    await flushPromises()
    await wrapper.find('[data-filter="class_type"]').setValue('辅助')
    await wrapper.find('[data-filter="keyword"]').setValue('剑')
    await wrapper.find('[data-filter="sort"]').setValue('buff_amount')
    await flushPromises()
    const qcalls = apiMock.get.mock.calls.filter((c: any[]) => String(c[0]).includes('/query'))
    const lastCall = qcalls[qcalls.length - 1]
    // URLSearchParams 会把非 ASCII 编码成 %xx，先 decodeURIComponent 再断言
    const url = decodeURIComponent(String(lastCall[0]))
    expect(url).toContain('class_type=辅助')
    expect(url).toContain('keyword=剑')
    expect(url).toContain('sort=buff_amount')
  })
  it('封禁/解封与角色管理入口', async () => {
    apiMock.post.mockResolvedValue({})
    const wrapper = mount(AdminUsersView, { global: { stubs: { AdminNav: true, AdminUserCharactersModal: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('阿甲')
    await wrapper.find('[data-act="ban-2"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/2/ban')
    await wrapper.find('[data-act="manage-2"]').trigger('click')
    expect(wrapper.findComponent({ name: 'AdminUserCharactersModal' }).exists()).toBe(true)
  })
  it('解封调用 unban 端点', async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/api/admin/users') return Promise.resolve([{ ...users[0], is_banned: true }])
      if (url.startsWith('/api/admin/characters/query')) return Promise.resolve(query)
      return Promise.resolve([])
    })
    apiMock.post.mockResolvedValue({})
    const wrapper = mount(AdminUsersView, { global: { stubs: { AdminNav: true, AdminUserCharactersModal: true } } })
    await flushPromises()
    await wrapper.find('[data-act="unban-2"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/2/unban')
  })
})
