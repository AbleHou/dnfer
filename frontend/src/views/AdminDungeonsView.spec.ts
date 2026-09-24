// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminDungeonsView from './AdminDungeonsView.vue'
import { confirmDialog } from '../lib/notify'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))

const dg = [{ id: 1, name: '巴卡尔', size: 12, description: '', created_at: '2026-09-01T00:00:00' }]

describe('AdminDungeonsView', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.get.mockResolvedValue(dg) })
  it('加载、新增、删除副本', async () => {
    const wrapper = mount(AdminDungeonsView, { global: { stubs: { AdminNav: true } } })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/dungeons')
    expect(wrapper.text()).toContain('巴卡尔')
    apiMock.post.mockResolvedValue(dg[0])
    await wrapper.find('[data-act="save"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/dungeons',
      { name: '', size: 12, description: '' })
    await wrapper.find('[data-act="del-1"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/dungeons/1')
  })
})
