// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RaidListView from './RaidListView.vue'
import { useAuthStore } from '../stores/auth'
import type { Dungeon, RaidListItem } from '../types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}))

const dungeons: Dungeon[] = [{ id: 7, name: '巴卡尔', size: 16, description: '', created_at: '' }]

beforeEach(() => {
  vi.clearAllMocks()
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
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true }

    const wrapper = mount(RaidListView, {
      global: { plugins: [pinia], stubs: ['router-link'] },
    })
    await flushPromises()
    await wrapper.find('button').trigger('click')        // 展开创建表单
    await wrapper.find('select').setValue(7)             // 选择副本
    const inputs = wrapper.findAll('input')
    // 表单输入顺序为 [starts_at(datetime-local), name]，name 是第 2 个（自动填入副本名）
    expect((inputs[1].element as HTMLInputElement).value).toBe('巴卡尔')
    expect(wrapper.text()).toContain('规模锁定：16 人')
  })

  it('does not fetch dungeons for non-admin members', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false }

    const wrapper = mount(RaidListView, {
      global: { plugins: [pinia], stubs: ['router-link'] },
    })
    await flushPromises()
    expect(apiMock.get).not.toHaveBeenCalledWith('/api/dungeons')
  })

  it('admin can delete a raid after confirming', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true }
    const raid: RaidListItem = { id: 3, name: '巴卡尔', dungeon_id: 7, dungeon_name: '巴卡尔',
      size: 16, locked: false, starts_at: '2026-09-20T14:00:00', wave_count: 1 }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/dungeons') return dungeons
      return []
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(RaidListView, {
      global: { plugins: [pinia], stubs: ['router-link'] },
    })
    await flushPromises()
    const delBtn = wrapper.findAll('button').find(b => b.text().includes('删除'))
    expect(delBtn).toBeTruthy()
    await delBtn!.trigger('click')
    expect(confirmSpy).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/raids/3')
    confirmSpy.mockRestore()
  })

  it('does not show delete button for non-admin', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false }
    const raid: RaidListItem = { id: 3, name: '巴卡尔', dungeon_id: 7, dungeon_name: '巴卡尔',
      size: 16, locked: false, starts_at: '2026-09-20T14:00:00', wave_count: 1 }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      return []
    })
    const wrapper = mount(RaidListView, {
      global: { plugins: [pinia], stubs: ['router-link'] },
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('删除')
  })
})
