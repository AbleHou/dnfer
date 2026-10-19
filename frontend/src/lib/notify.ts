import { computed } from 'vue'
import { createDiscreteApi } from 'naive-ui'
import { useTheme } from '../composables/useTheme'

const { naiveTheme, naiveOverrides } = useTheme()

const configProviderProps = computed(() => ({
  theme: naiveTheme.value,
  themeOverrides: naiveOverrides.value,
}))

const { message, dialog } = createDiscreteApi(['message', 'dialog'], {
  configProviderProps,
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
