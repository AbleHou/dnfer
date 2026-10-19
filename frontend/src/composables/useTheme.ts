import { computed, ref } from 'vue'
import { darkTheme, lightTheme } from 'naive-ui'
import { darkOverrides, lightOverrides } from '../styles/theme'

export type ThemeMode = 'dark' | 'light'

const THEME_KEY = 'dnfer-theme'

function readInitialTheme(): ThemeMode {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark' // 隐私模式等读不到 → 暗色默认
  }
}

// 模块级单例状态（不在 useTheme() 函数体内创建）：
const theme = ref<ThemeMode>(readInitialTheme())
const naiveTheme = computed(() => (theme.value === 'dark' ? darkTheme : lightTheme))
const naiveOverrides = computed(() => (theme.value === 'dark' ? darkOverrides : lightOverrides))

function applyTheme(mode: ThemeMode): void {
  theme.value = mode
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    // 写失败不阻断切换
  }
  document.documentElement.dataset.theme = mode // 驱动 dnf.css 的 [data-theme="light"] 块
}

function toggleTheme(): void {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark')
}

// 模块加载时同步一次 data-theme，避免首帧与存储不符
document.documentElement.dataset.theme = theme.value

export function useTheme() {
  return { theme, naiveTheme, naiveOverrides, applyTheme, toggleTheme }
}
