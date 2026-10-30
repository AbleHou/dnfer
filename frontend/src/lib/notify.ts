import { createDnfDialog, createDnfMessage } from '@dnftools/ui'

// 模块级唯一 service 实例；App.vue 中通过 :service 绑定到对应 Provider
export const dialogs = createDnfDialog()
export const messages = createDnfMessage()

export function notifyError(content: string): void { messages.error(content) }
export function notifyWarning(content: string): void { messages.warning(content) }
export function notifySuccess(content: string): void { messages.success(content) }

export function confirmDialog(options: { title?: string; content: string }): Promise<boolean> {
  return dialogs
    .confirm({ title: options.title ?? '确认', content: options.content, confirmLabel: '确定', cancelLabel: '取消', modal: true })
    .then((r) => r.action === 'confirm')
}
