// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ProfilePanel from './ProfilePanel.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { put: vi.fn(), upload: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 1, username: 'a', nickname: '阿甲', is_admin: false, avatar: null },
                         updateProfile: vi.fn() }),
}))
vi.mock('../lib/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }))
vi.mock('./UserAvatar.vue', () => ({ default: { props: ['nickname', 'avatar', 'size'], template: '<span />' } }))

beforeEach(() => vi.clearAllMocks())

describe('ProfilePanel', () => {
  it('非法昵称不调接口并显示错误', async () => {
    apiMock.put.mockResolvedValue({ id: 1, username: 'a', nickname: '阿甲', is_admin: false, avatar: null })
    const w = mount(ProfilePanel, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    const input = w.find('input[type="text"]')
    await input.setValue('带空格 名')
    await w.find('button.save-nickname').trigger('click')
    await flushPromises()
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(w.text()).toContain('昵称仅支持中文、字母和数字')
  })

  it('合法昵称保存后调用 PUT /api/me/profile', async () => {
    apiMock.put.mockResolvedValue({ id: 1, username: 'a', nickname: '新名', is_admin: false, avatar: null })
    const w = mount(ProfilePanel, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('input[type="text"]').setValue('新名')
    await w.find('button.save-nickname').trigger('click')
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/me/profile', { nickname: '新名' })
  })
})
