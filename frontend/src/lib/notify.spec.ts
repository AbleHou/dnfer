// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'

// 服务无法在无 Provider 下真实渲染，mock createDnfDialog/createDnfMessage
const dialogServiceMock = vi.hoisted(() => ({ confirm: vi.fn(), alert: vi.fn(), open: vi.fn() }))
const messageServiceMock = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), loading: vi.fn(), open: vi.fn(),
}))
vi.mock('@dnftools/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnftools/ui')>()
  return {
    ...actual,
    createDnfDialog: () => dialogServiceMock,
    createDnfMessage: () => messageServiceMock,
  }
})

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
})

it('confirmDialog：action==="confirm" 解析为 true，否则 false', async () => {
  dialogServiceMock.open.mockReturnValue({ result: Promise.resolve({ action: 'confirm', reason: 'confirm' }) })
  const { confirmDialog } = await import('../lib/notify')
  await expect(confirmDialog({ content: 'x' })).resolves.toBe(true)

  dialogServiceMock.open.mockReturnValue({ result: Promise.resolve({ action: 'close', reason: 'close-button' }) })
  await expect(confirmDialog({ content: 'x' })).resolves.toBe(false)
})

it('confirmDialog：open() 只传确认按钮（showCancel:false），转发 title/content/confirmLabel/modal', async () => {
  dialogServiceMock.open.mockReturnValue({ result: Promise.resolve({ action: 'confirm', reason: 'confirm' }) })
  const { confirmDialog } = await import('../lib/notify')
  await confirmDialog({ title: '删除攻坚', content: '确认删除？' })
  expect(dialogServiceMock.open).toHaveBeenCalledWith({
    title: '删除攻坚',
    content: '确认删除？',
    confirmLabel: '确定',
    showCancel: false,
    modal: true,
  })
})

it('notifyError/Success/Warning 转发到 message service 对应方法', async () => {
  const { notifyError, notifySuccess, notifyWarning } = await import('../lib/notify')
  notifyError('e'); expect(messageServiceMock.error).toHaveBeenCalledWith('e')
  notifySuccess('s'); expect(messageServiceMock.success).toHaveBeenCalledWith('s')
  notifyWarning('w'); expect(messageServiceMock.warning).toHaveBeenCalledWith('w')
})
