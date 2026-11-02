import { createDnfDialog, createDnfMessage } from '@dnftools/ui'

// 模块级唯一 service 实例；App.vue 中通过 :service 绑定到对应 Provider
export const dialogs = createDnfDialog()
export const messages = createDnfMessage()

export function notifyError(content: string): void { messages.error(content) }
export function notifyWarning(content: string): void { messages.warning(content) }
export function notifySuccess(content: string): void { messages.success(content) }

export function confirmDialog(options: { title?: string; content: string }): Promise<boolean> {
  // 只保留确认按钮；右上角 x / 外部点击 / Esc 关闭均解析为 false。
  // 库 confirm() 强制 showCancel:true，故改用 open() 显式 showCancel:false。
  const handle = dialogs.open({
    title: options.title ?? '确认',
    content: options.content,
    confirmLabel: '确定',
    showCancel: false,
    modal: true,
  })
  return handle.result.then((r) => r.action === 'confirm')
}
