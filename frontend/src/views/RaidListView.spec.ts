// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RaidListView from './RaidListView.vue'
import { useAuthStore } from '../stores/auth'
import type { Dungeon, RaidListItem } from '../types'

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
  size: 16, locked: false, starts_at: '2026-09-20T14:00:00', wave_count: 1,
  signup_count: 0, my_signed_up: false }

beforeEach(() => {
  vi.clearAllMocks()
  confirmDialogMock.mockResolvedValue(true)
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/raids') return [] as RaidListItem[]
    if (url === '/api/dungeons') return dungeons
    return []
  })
})

describe('RaidListView create form', () => {
  it('selecting a dungeon auto-fills name and shows locked size', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null }

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
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
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null }

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
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
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null }

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    expect(apiMock.get).not.toHaveBeenCalledWith('/api/dungeons')
  })

  it('admin can delete a raid after confirming', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/dungeons') return dungeons
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
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
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true, avatar: null }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/dungeons') return dungeons
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('删除'))!.trigger('click')
    await flushPromises()
    expect(apiMock.del).not.toHaveBeenCalled()
  })

  it('does not show delete button for non-admin', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('删除')
  })

  it('non-admin sees 报名 button and signs up', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      return []
    })
    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    expect(wrapper.text()).toContain('已报名 1 人') // 报名人数含团长（与详情一致）
    await wrapper.find('[data-test="signup"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/3/signup')
  })

  it('shows 已报名 badge instead of button when signed up', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null }
    const signed: RaidListItem = { ...raid, my_signed_up: true, signup_count: 3 }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [signed] as RaidListItem[]
      return []
    })
    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    expect(wrapper.text()).toContain('已报名 4 人') // 含团长
    expect(wrapper.find('[data-test="signup"]').exists()).toBe(false)
  })
})
