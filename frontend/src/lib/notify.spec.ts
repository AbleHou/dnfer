// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { darkTheme, lightTheme } from 'naive-ui'

// 拦截 createDiscreteApi，捕获传给它的 configProviderProps，避免真实渲染离散 API
const createDiscreteApiMock = vi.hoisted(() => vi.fn())
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>()
  return { ...actual, createDiscreteApi: createDiscreteApiMock }
})

let capturedConfig: unknown = null

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.resetModules()
  capturedConfig = null
  createDiscreteApiMock.mockReset()
  createDiscreteApiMock.mockImplementation((_includes: unknown, opts: { configProviderProps?: unknown }) => {
    capturedConfig = opts?.configProviderProps
    return { message: {}, dialog: {} }
  })
})

it('configProviderProps 是响应式 Ref：主题切换后 theme/themeOverrides 随之变化', async () => {
  await import('../lib/notify')
  const { useTheme } = await import('../composables/useTheme')
  const { theme, toggleTheme } = useTheme()

  // capturedConfig 是传入的 computed（Ref<ConfigProviderProps>），非普通对象
  expect(typeof capturedConfig).toBe('object')
  expect(capturedConfig).toHaveProperty('value')
  expect((capturedConfig as { value: { theme: unknown } }).value.theme).toBe(darkTheme)

  toggleTheme()
  expect(theme.value).toBe('light')
  expect((capturedConfig as { value: { theme: unknown } }).value.theme).toBe(lightTheme)
})

it('默认暗色下 configProviderProps.theme 为 darkTheme', async () => {
  await import('../lib/notify')
  expect((capturedConfig as { value: { theme: unknown } }).value.theme).toBe(darkTheme)
})
