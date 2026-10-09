// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ChangePasswordModal from './ChangePasswordModal.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { put: vi.fn() },
  notifyMock: { notifyError: vi.fn(), notifySuccess: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => notifyMock)

describe('ChangePasswordModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('原密码为空本地校验拦截不调接口', async () => {
    const w = mount(ChangePasswordModal, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(w.text()).toContain('请输入原密码')
  })

  it('新密码过短不调接口并显示错误', async () => {
    const w = mount(ChangePasswordModal, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="old-pw"]').setValue('secret1')
    await w.find('[data-field="new-pw"]').setValue('123')
    await w.find('[data-field="confirm-pw"]').setValue('123')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(w.text()).toContain('密码至少 6 位')
  })

  it('两次密码不一致报错不调接口', async () => {
    const w = mount(ChangePasswordModal, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="old-pw"]').setValue('secret1')
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdefg')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(w.text()).toContain('两次输入的密码不一致')
  })

  it('提交成功调用 PUT /api/me/password 并 emit close', async () => {
    apiMock.put.mockResolvedValue({})
    const w = mount(ChangePasswordModal, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="old-pw"]').setValue('secret1')
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/me/password',
      { old_password: 'secret1', new_password: 'abcdef' })
    expect(notifyMock.notifySuccess).toHaveBeenCalledWith('密码已修改')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('提交失败提示 notifyError', async () => {
    apiMock.put.mockRejectedValue(new Error('原密码错误'))
    const w = mount(ChangePasswordModal, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="old-pw"]').setValue('secret1')
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(notifyMock.notifyError).toHaveBeenCalledWith('原密码错误')
    expect(w.emitted('close')).toBeFalsy()
  })
})
