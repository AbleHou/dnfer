// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminResetPasswordModal from './AdminResetPasswordModal.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { post: vi.fn() },
  notifyMock: { notifyError: vi.fn(), notifySuccess: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => notifyMock)

const user = { id: 7, username: 'p', nickname: '玩家', is_admin: false, avatar: null, is_banned: false }

describe('AdminResetPasswordModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('密码过短不调接口并显示错误', async () => {
    const w = mount(AdminResetPasswordModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="new-pw"]').setValue('123')
    await w.find('[data-field="confirm-pw"]').setValue('123')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('密码至少 6 位')
  })

  it('两次密码不一致报错不调接口', async () => {
    const w = mount(AdminResetPasswordModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdefg')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('两次输入的密码不一致')
  })

  it('提交成功调用 POST 并 emit close', async () => {
    apiMock.post.mockResolvedValue({})
    const w = mount(AdminResetPasswordModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/7/password', { password: 'abcdef' })
    expect(notifyMock.notifySuccess).toHaveBeenCalledWith('密码已重置')
    expect(w.emitted('close')).toBeTruthy()
  })
})
