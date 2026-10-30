// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  vi.clearAllMocks()
})

it('confirmDialog：action==="confirm" 解析为 true，否则 false', async () => {
  dialogServiceMock.confirm.mockResolvedValue({ action: 'confirm', reason: 'confirm' })
  const { confirmDialog } = await import('../lib/notify')
  await expect(confirmDialog({ content: 'x' })).resolves.toBe(true)

  dialogServiceMock.confirm.mockResolvedValue({ action: 'cancel', reason: 'cancel' })
  await expect(confirmDialog({ content: 'x' })).resolves.toBe(false)
})

it('notifyError/Success/Warning 转发到 message service 对应方法', async () => {
  const { notifyError, notifySuccess, notifyWarning } = await import('../lib/notify')
  notifyError('e'); expect(messageServiceMock.error).toHaveBeenCalledWith('e')
  notifySuccess('s'); expect(messageServiceMock.success).toHaveBeenCalledWith('s')
  notifyWarning('w'); expect(messageServiceMock.warning).toHaveBeenCalledWith('w')
})
