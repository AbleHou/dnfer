import { createDiscreteApi, darkTheme } from 'naive-ui'
import { themeOverrides } from '../styles/theme'

const { message, dialog } = createDiscreteApi(['message', 'dialog'], {
  configProviderProps: { theme: darkTheme, themeOverrides },
})

export function notifyError(content: string): void { message.error(content) }
export function notifyWarning(content: string): void { message.warning(content) }
export function notifySuccess(content: string): void { message.success(content) }

export function confirmDialog(options: { title?: string; content: string }): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.warning({
      title: options.title ?? '确认',
      content: options.content,
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => resolve(false),
      onEsc: () => resolve(false),
    })
  })
}
