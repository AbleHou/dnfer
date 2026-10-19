# 亮色主题切换（Apple 金） 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「Apple 金」亮色主题，顶栏按钮一键在暗/亮间切换，偏好 localStorage 持久化，naive-ui 组件与自定义 dnf.css 面板随主题同步换色。

**Architecture:** 纯前端。新增模块级单例 `composables/useTheme.ts`（`theme` ref 同时驱动 naive 的 `naiveTheme`/`naiveOverrides` 与 `document.documentElement.dataset.theme`）；`styles/theme.ts` 拆出 `darkOverrides` + 新增 `lightOverrides`；`App.vue` 的 `<n-config-provider>` 改吃 useTheme 的响应式主题；`lib/notify.ts` 的 discrete API 用响应式 `configProviderProps`；`dnf.css` 在 `:root` 补全 `--dnf-border`/`--dnf-accent` 并新增 `[data-theme="light"]` 变量块与少量结构覆盖；`index.html` 加内联脚本防刷新闪烁。

**Tech Stack:** Vue 3 `<script setup>` + naive-ui 2.45（按需导入）+ Vitest（jsdom 环境）。

**参考文档：** `docs/superpowers/specs/2026-10-19-light-theme-design.md`

**测试/验证命令（全程使用）：**
- 单个 spec：`cd /Users/able/toys/dnfer/frontend && npx vitest run <file>`
- 全量：`cd /Users/able/toys/dnfer/frontend && npx vitest run`
- 类型+构建：`cd /Users/able/toys/dnfer/frontend && npm run build`（= vue-tsc -b && vite build）

---

### Task 1: `styles/theme.ts` —— 拆暗色覆写 + 新增亮色覆写

**Files:**
- Modify: `frontend/src/styles/theme.ts`（整文件重写）

- [ ] **Step 1: 重写 `theme.ts`**

将现有 `themeOverrides` 改名 `darkOverrides`（值不变），新增 `lightOverrides`，并同时导出 `darkTheme`/`lightTheme`：

```ts
import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme, lightTheme } from 'naive-ui'

export const darkOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#a8842c',
    primaryColorHover: '#c9a34a',
    primaryColorPressed: '#8a6d26',
    primaryColorSuppl: '#a8842c',
    infoColor: '#a8842c',
    successColor: '#5d8a4e',
    warningColor: '#b8860b',
    errorColor: '#c0392b',
    bodyColor: '#191310',
    cardColor: '#241c14',
    modalColor: '#241c14',
    popoverColor: '#2b2114',
    tableColor: '#241c14',
    inputColor: '#2b2114',
    inputColorDisabled: '#241c14',
    textColorBase: '#e8d9a8',
    textColor1: '#e8d9a8',
    textColor2: '#d8c896',
    textColor3: '#b09b66',
    textColorDisabled: '#8a7a5a',
    borderColor: '#6b5320',
    dividerColor: '#6b5320',
    borderRadius: '8px',
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  Button: { borderRadiusMedium: '6px', fontWeight: 'bold' },
  Card: { borderRadius: '10px' },
}

export const lightOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#a8842c',
    primaryColorHover: '#c9a34a',
    primaryColorPressed: '#8a6d26',
    primaryColorSuppl: '#a8842c',
    infoColor: '#a8842c',
    successColor: '#34c759',
    warningColor: '#ff9500',
    errorColor: '#ff3b30',
    bodyColor: '#f5f5f7',
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    tableColor: '#ffffff',
    inputColor: '#ffffff',
    inputColorDisabled: '#f2f2f7',
    textColorBase: '#1d1d1f',
    textColor1: '#1d1d1f',
    textColor2: '#3c3c43',
    textColor3: '#86868b',
    textColorDisabled: '#b0b0b8',
    borderColor: '#e5e5ea',
    dividerColor: '#e5e5ea',
    borderRadius: '8px',
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  Button: { borderRadiusMedium: '6px', fontWeight: 'bold' },
  Card: { borderRadius: '10px' },
}

// 过渡别名：App.vue/notify.ts 迁移到 useTheme 之前保持可编译，Task 4 完成后删除
export const themeOverrides = darkOverrides

export { darkTheme, lightTheme }
```

- [ ] **Step 2: 验证构建通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: **通过**（`App.vue`/`notify.ts` 仍引用 `themeOverrides`，它现在是 `darkOverrides` 的别名，编译无错）。别名会在 Task 4 后删除。

- [ ] **Step 3: Commit**（构建绿，可安全提交）

```bash
cd /Users/able/toys/dnfer && git add frontend/src/styles/theme.ts && git commit -m "feat: theme.ts 拆 darkOverrides/lightOverrides + 过渡别名
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: `composables/useTheme.ts`（TDD）

**Files:**
- Create: `frontend/src/composables/useTheme.ts`
- Test: `frontend/src/composables/useTheme.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/composables/useTheme.spec.ts`
Expected: FAIL，`Cannot find module './useTheme'`（文件不存在）。

- [ ] **Step 3: 实现 `useTheme.ts`**

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/composables/useTheme.spec.ts`
Expected: PASS（4 个用例）。
注意：`naiveOverrides` 断言用 `toStrictEqual`（值级比较）而非 `toBe`——`vi.resetModules()` 会清项目文件模块缓存，`theme.ts` 每次动态 import 重新求值产生**新对象**，`toBe`（引用相等）会误报失败；`naiveTheme` 断言用 `toBe`（naive-ui 被 externalize、`darkTheme`/`lightTheme` 跨 reset 保持同一引用）。

- [ ] **Step 5: Commit**（`theme.ts` 已在 Task 1 提交，这里只提交 composable + spec）

```bash
cd /Users/able/toys/dnfer && git add frontend/src/composables/useTheme.ts frontend/src/composables/useTheme.spec.ts && git commit -m "feat: 主题状态 composable（useTheme）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: `lib/notify.ts` —— discrete API 响应式联动（TDD）

**Files:**
- Modify: `frontend/src/lib/notify.ts`（第 1-6 行）
- Test: `frontend/src/lib/notify.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/lib/notify.spec.ts`
Expected: FAIL，`Cannot find module '../lib/notify'` 相关或 `capturedConfig` 为 null。

- [ ] **Step 3: 改 `notify.ts`**

`configProviderProps` 传一个 **computed 整体**（naive-ui 2.45 的 `configProviderProps?: MaybeRef<ConfigProviderProps>` 支持 Ref，内部 `unref` 解包；普通对象里塞 ref 不会被解包）：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/lib/notify.spec.ts`
Expected: PASS（2 个用例）。`capturedConfig.value.theme` 随 `toggleTheme()` 从 darkTheme → lightTheme。

- [ ] **Step 5: 验证构建通过**（确认此提交点是绿的：notify 已迁移，App.vue 仍吃别名）

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/lib/notify.ts frontend/src/lib/notify.spec.ts && git commit -m "feat: notify 离散 API 主题响应式联动（随主题切换换色）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: `App.vue` —— n-config-provider 动态主题 + 顶栏切换按钮

**Files:**
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: 改 `<script setup>`**

- 删除 naive-ui import 中的 `darkTheme`（不再直接用）；`import { useTheme } from './composables/useTheme'`，删除 `import { themeOverrides } from './styles/theme'`。
- 在 `profileOpen` 旁取主题：`const { theme, naiveTheme, naiveOverrides, toggleTheme } = useTheme()`

```ts
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NConfigProvider, NDropdown } from 'naive-ui'
import { useAuthStore } from './stores/auth'
import { useTheme } from './composables/useTheme'
import UserAvatar from './components/UserAvatar.vue'
import ProfilePanel from './components/ProfilePanel.vue'

const auth = useAuthStore()
const router = useRouter()
const profileOpen = ref(false)
const { theme, naiveTheme, naiveOverrides, toggleTheme } = useTheme()

// naive-ui 2.45 未在包根导出 DropdownMixedOption，回退为 any[]（唯一一处）
const menuOptions = computed<any[]>(() => [
  { label: '攻坚列表', key: 'raids' },
  { label: '我的角色', key: 'characters' },
  { label: '群会议', key: 'votes' },
  ...(auth.isAdmin ? [{ label: '管理', key: 'admin' }] : []),
  { type: 'divider', key: 'd1' },
  { label: '退出', key: 'logout' },
])

function logout() {
  auth.logout()
  router.push('/login')
}
function onMenuSelect(key: string) {
  if (key === 'logout') { logout(); return }
  const path = ({ raids: '/', characters: '/characters', votes: '/votes', admin: '/admin' } as Record<string, string>)[key]
  if (path) router.push(path)
}
</script>
```

- [ ] **Step 2: 改 `<template>`**

- `<n-config-provider>` 改 `:theme="naiveTheme" :theme-overrides="naiveOverrides"`。
- `.nav-right` 内、头像按钮前加切换按钮（`data-act="theme-toggle"`）：

```html
<n-config-provider :theme="naiveTheme" :theme-overrides="naiveOverrides">
  <nav v-if="auth.user" class="dnf-nav">
    <router-link to="/" class="logo">跨六 DNF 糕手</router-link>
    <router-link to="/" class="nav-link">攻坚列表</router-link>
    <router-link to="/characters" class="nav-link">我的角色</router-link>
    <router-link to="/votes" class="nav-link">群会议</router-link>
    <router-link v-if="auth.isAdmin" to="/admin" class="nav-link">管理</router-link>
    <span class="nav-right">
      <button class="nav-user" :title="theme === 'dark' ? '切换到亮色' : '切换到暗色'"
              data-act="theme-toggle" @click="toggleTheme">
        <span style="font-size:18px;line-height:1">{{ theme === 'dark' ? '☀' : '☾' }}</span>
      </button>
      <button class="nav-user" title="个人信息" @click="profileOpen = true">
        <UserAvatar v-if="auth.user" :nickname="auth.user.nickname"
                    :avatar="auth.user.avatar" :size="26" />
        <span class="nav-username">{{ auth.user?.nickname }}</span>
      </button>
      <a href="#" class="nav-exit" @click.prevent="logout">退出</a>
      <n-dropdown :options="menuOptions" @select="onMenuSelect">
        <button class="hamburger" aria-label="菜单">☰</button>
      </n-dropdown>
    </span>
    <ProfilePanel :open="profileOpen" @close="profileOpen = false" />
  </nav>
  <router-view :key="$route.fullPath" />
</n-config-provider>
```

- [ ] **Step 3: 验证构建通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过（vue-tsc 无错误 + vite build 成功）。此时 `App.vue` 已用 `naiveOverrides`，`theme.ts` 的过渡别名不再被引用。

- [ ] **Step 4: 删除 `theme.ts` 过渡别名**（`App.vue`/`notify.ts` 已迁移，无引用者）

编辑 `frontend/src/styles/theme.ts`：删除 `// 过渡别名：...` 注释与 `export const themeOverrides = darkOverrides` 一行。

- [ ] **Step 5: 验证构建通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过。

- [ ] **Step 6: Commit**（含删除别名）

```bash
cd /Users/able/toys/dnfer && git add frontend/src/App.vue frontend/src/styles/theme.ts && git commit -m "feat: App 动态主题 + 顶栏亮/暗切换按钮，移除 themeOverrides 过渡别名
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: `styles/dnf.css` —— 补全变量 + 亮色变量块 + 结构覆盖

**Files:**
- Modify: `frontend/src/styles/dnf.css`

- [ ] **Step 1: `:root` 补全缺失的 `--dnf-border`/`--dnf-accent`**

在 `:root`（L1-13）末尾补两行（值取现有 fallback，暗色行为不变）：

```css
:root {
  --dnf-bg: #191310;
  --dnf-panel: #241c14;
  --dnf-panel-inner: #2b2114;
  --dnf-gold: #a8842c;
  --dnf-gold-deep: #6b5320;
  --dnf-gold-hi: #ffd97a;
  --dnf-text: #e8d9a8;
  --dnf-text-muted: #b09b66;
  --dnf-text-faint: #8a7a5a;
  --dnf-danger: #c0392b;
  --dnf-ok: #5d8a4e;
  --dnf-border: #3a3f4b;
  --dnf-accent: #ffd54a;
}
```

注意：`SignupMemberPicker.vue` 有一处 `border: 1px solid var(--dnf-border)` **无 fallback**，当前解析为无效值、边框以 `currentColor` 渲染；补上变量后暗色下该处边框变为 `#3a3f4b`。属预期/良性（spec §5.1 已注明），看到这处暗色细微变化不要当 bug。

- [ ] **Step 2: `:root` 之后新增 `[data-theme="light"]` 变量块**

```css
[data-theme="light"] {
  --dnf-bg: #f5f5f7;
  --dnf-panel: #ffffff;
  --dnf-panel-inner: #f2f2f7;
  --dnf-gold: #a8842c;
  --dnf-gold-deep: #d9c58a;
  --dnf-gold-hi: #8a6d26;
  --dnf-text: #1d1d1f;
  --dnf-text-muted: #6e6e73;
  --dnf-text-faint: #86868b;
  --dnf-danger: #e5484d;
  --dnf-ok: #2f7d32;
  --dnf-border: #e5e5ea;
  --dnf-accent: #b8860b;
}
```

- [ ] **Step 3: 新增亮色结构覆盖**（插到文件末尾的 `@media (max-width: 767px)` 块**之前**，保证亮色覆盖不被移动端媒体查询压过）

```css
/* 亮色主题结构覆盖 */
[data-theme="light"] body {
  background: radial-gradient(1200px 600px at 70% -10%, #ffffff 0%, var(--dnf-bg) 55%) fixed;
  background-color: var(--dnf-bg);
}
[data-theme="light"] .dnf-panel {
  box-shadow: 0 4px 12px rgba(0, 0, 0, .06);
}
/* .dnf-btn 的文字/边框用了 --dnf-gold-hi/--dnf-gold-deep，亮色下变量变深金，
   若保留深色渐变底会深字配深底不可读，故亮色下改为浅金底 + 深金字。
   注意用 :not(.dnf-btn-primary):not(.dnf-btn-danger) 排除主/危险按钮——
   代码里 primary/danger 按钮同时带 .dnf-btn 基类（如 class="dnf-btn dnf-btn-sm dnf-btn-danger"），
   若直接覆盖 .dnf-btn 会因特异性(0,2,0)高于 .dnf-btn-danger(0,1,0) 把红色按钮盖成浅金，必须排除。 */
[data-theme="light"] .dnf-btn:not(.dnf-btn-primary):not(.dnf-btn-danger) {
  background: linear-gradient(#f3e9cf, #e3d6b3);
  color: var(--dnf-gold-hi);
  border-color: var(--dnf-gold-deep);
}
[data-theme="light"] .form-error { color: #e5484d; }
[data-theme="light"] .slot-cell.empty { color: var(--dnf-text-faint); }
/* 5 队 slot-cell 深色底 → 浅色队色底（squad-head 渐变两套通用，不动） */
[data-theme="light"] .squad-0 .slot-cell { background: #fdf1ef; }
[data-theme="light"] .squad-1 .slot-cell { background: #fdf8ea; }
[data-theme="light"] .squad-2 .slot-cell { background: #f0f7ef; }
[data-theme="light"] .squad-3 .slot-cell { background: #eef4fa; }
[data-theme="light"] .squad-4 .slot-cell { background: #f5f1f8; }
```

注意：
- `.dnf-btn-primary`/`.dnf-btn-danger` 的渐变/文字/边框全硬编码（`#d4a53c/#2a1c05`、`#c0392b/#ffd9c4`），不依赖变量，深色按钮在亮底上对比度充足，**无需覆盖**；且因上面用 `:not()` 排除，它们不会被 `.dnf-btn` 的亮色覆盖盖掉。
- 其余组件（`.dnf-input`/`.dnf-select`/`.char-pick`/`.job-pick-btn`/`.dnf-nav`/`.dnf-badge-*`/`.dnf-table`/`.wave-link` 等）全部走 `--dnf-*` 变量，随 `[data-theme="light"]` 块自动适配，无需逐个覆盖。
- `.squad-col` 5 队边框色（`#a12a1e` 等）与 `.squad-head` 渐变（深色 header + 白字）亮色下可读，不动。

- [ ] **Step 4: 验证构建通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过。CSS 无编译检查，此步确认 vite 打包正常。

- [ ] **Step 5: Commit**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/styles/dnf.css && git commit -m "feat: dnf.css 亮色变量块与结构覆盖（Apple 金）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: `index.html` —— 防刷新闪烁

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: `<head>` 加内联脚本**（在 `/src/main.ts` 之前，module 脚本是 deferred，此内联脚本先执行）

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DNfer 攻坚排表</title>
    <script>
      try {
        if (localStorage.getItem('dnfer-theme') === 'light') {
          document.documentElement.dataset.theme = 'light'
        }
      } catch (e) {
        /* 隐私模式等取不到存储时保持暗色默认 */
      }
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 验证构建通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
cd /Users/able/toys/dnfer && git add frontend/index.html && git commit -m "feat: index.html 内联脚本防亮色刷新闪烁
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 全量回归

**Files:**
- 无新改动，仅验证

- [ ] **Step 1: 全量前端测试**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run`
Expected: 全部通过（原 42 个 spec + 新增 `useTheme.spec` + `notify.spec`）。现有 spec 不挂载 `App.vue`、不 import `dnf.css`/`theme.ts`，默认暗色，不受影响。

- [ ] **Step 2: 全量类型+构建**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过（vue-tsc 无错误）。

- [ ] **Step 3: 手动验证（浏览器）**

- 启动前端 `cd /Users/able/toys/dnfer/frontend && npm run dev`，登录后点顶栏 ☀/☾ 按钮：
  - 暗色→亮色：整体变白卡片/系统灰/金标题，naive 输入框/弹窗/消息变亮色。
  - 刷新页面：亮色不闪烁（index.html 内联脚本生效），保持亮色。
  - 再切回暗色：回到原暗黑风。
  - 排表页（`/raids/:id` 与 `/raids/:id/roster`）：5 队格子浅色底、队头渐变清晰、`.dnf-btn` 浅金底深金字可读。
  - 消息/确认框（如取消报名、删投票）随主题换色。
- 注意 localStorage `dnfer-theme` 值：默认无该 key = 暗色。

- [ ] **Step 4: 无遗留引用检查**

Run: `cd /Users/able/toys/dnfer/frontend && grep -rn "export const themeOverrides\|import { themeOverrides\|themeOverrides\b" src/ --include='*.ts' --include='*.vue'`
Expected: 仅 `src/lib/notify.ts` 里 `themeOverrides: naiveOverrides.value` 一处（那是 naive-ui 配置对象的合法属性名，`\b` 会匹配 `s` 与冒号之间）。除此之外**无** `export const themeOverrides`/`import { themeOverrides }` 等旧导出/导入遗留（Task 4 已删别名）。

- [ ] **Step 5: Commit（若有测试期间修正）**

若有回归修正则按项目风格提交；无则本任务无提交。

---

## 非目标

- 跟随系统深浅色（三态）—— 顶栏按钮是唯一入口。
- 毛玻璃/材质等苹果高级视觉效果。
- 主题偏好跨设备/账号同步（仅 localStorage）。
- 更多预设主题。
