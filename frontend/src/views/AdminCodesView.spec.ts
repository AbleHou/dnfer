// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminCodesView from './AdminCodesView.vue'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

const codes = [{ id: 1, code: 'abc123', used_by: null, used_at: null, expires_at: null, single_use: true }]

describe('AdminCodesView', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.get.mockResolvedValue(codes) })
  it('加载并生成注册码', async () => {
    const wrapper = mount(AdminCodesView, { global: { stubs: { AdminNav: true } } })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/admin/codes')
    expect(wrapper.text()).toContain('abc123')
    apiMock.post.mockResolvedValue({ id: 2, code: 'xyz', used_by: null, used_at: null, expires_at: null, single_use: true })
    await wrapper.find('[data-act="gen"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/codes', { single_use: true, expire_days: 7 })
  })
})
