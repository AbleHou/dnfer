// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GuestConvertModal from './GuestConvertModal.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { post: vi.fn() },
  notifyMock: { notifyError: vi.fn(), notifySuccess: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => notifyMock)

const user = { id: 7, username: 'guest_abc', nickname: '来客', is_admin: false, avatar: null, is_banned: false, is_guest: true }

describe('GuestConvertModal', () => {
  beforeEach(() => vi.clearAllMocks())
  it('用户名为空不可提交', async () => {
    const w = mount(GuestConvertModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="username"]').setValue('')
    await w.find('[data-field="password"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('请填写用户名')
  })
  it('两次密码不一致报错不调接口', async () => {
    const w = mount(GuestConvertModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="username"]').setValue('real1')
    await w.find('[data-field="password"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdefg')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('两次输入的密码不一致')
  })
  it('提交成功调用 POST convert 并 emit close', async () => {
    apiMock.post.mockResolvedValue({})
    const w = mount(GuestConvertModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="username"]').setValue('real1')
    await w.find('[data-field="password"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/7/convert', { username: 'real1', password: 'abcdef' })
    expect(notifyMock.notifySuccess).toHaveBeenCalled()
    expect(w.emitted('close')).toBeTruthy()
  })
  it('提交失败提示 notifyError 不 emit close', async () => {
    apiMock.post.mockRejectedValue(new Error('该用户不是临时用户'))
    const w = mount(GuestConvertModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="username"]').setValue('real1')
    await w.find('[data-field="password"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(notifyMock.notifyError).toHaveBeenCalledWith('该用户不是临时用户')
    expect(w.emitted('close')).toBeFalsy()
  })
})
