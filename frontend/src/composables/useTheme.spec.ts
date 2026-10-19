// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { darkTheme, lightTheme } from 'naive-ui'
import { darkOverrides, lightOverrides } from '../styles/theme'

// useTheme 是模块级单例、import 时读一次存储：每个用例 resetModules + 动态 import 重新加载
async function loadTheme() {
  const mod = await import('./useTheme')
  return mod.useTheme()
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.resetModules()
})

describe('useTheme', () => {
  it('默认 dark：naiveTheme=darkTheme、naiveOverrides=darkOverrides、data-theme=dark', async () => {
    const { theme, naiveTheme, naiveOverrides } = await loadTheme()
    expect(theme.value).toBe('dark')
    expect(naiveTheme.value).toBe(darkTheme)
    expect(naiveOverrides.value).toStrictEqual(darkOverrides)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('预置 localStorage=light：初始化即 light 并设 data-theme', async () => {
    localStorage.setItem('dnfer-theme', 'light')
    const { theme, naiveTheme, naiveOverrides } = await loadTheme()
    expect(theme.value).toBe('light')
    expect(naiveTheme.value).toBe(lightTheme)
    expect(naiveOverrides.value).toStrictEqual(lightOverrides)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('toggleTheme 在 dark→light 写存储+设属性，再切回 dark', async () => {
    const { theme, naiveTheme, toggleTheme } = await loadTheme()
    toggleTheme()
    expect(theme.value).toBe('light')
    expect(naiveTheme.value).toBe(lightTheme)
    expect(localStorage.getItem('dnfer-theme')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    toggleTheme()
    expect(theme.value).toBe('dark')
    expect(naiveTheme.value).toBe(darkTheme)
    expect(localStorage.getItem('dnfer-theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applyTheme 显式切到指定主题', async () => {
    const { theme, applyTheme } = await loadTheme()
    applyTheme('light')
    expect(theme.value).toBe('light')
    expect(localStorage.getItem('dnfer-theme')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    applyTheme('dark')
    expect(theme.value).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
