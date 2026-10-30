# @dnftools/ui 全量 UI 升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端 UI 从 naive-ui + 自绘 `dnf.css` 全面迁移到 DNF 游戏贴图组件库 `@dnftools/ui`（全量迁移、只留暗色、分 4 阶段）。

**Architecture:** 库以 vendored dist 内置 `frontend/src/vendor/@dnftools/ui/` + TS 别名接入；`notify.ts` 重写为 `createDnfDialog`/`createDnfMessage` 适配层（签名不变）；`App.vue` 用 `DnfProvider` + `DnfDialogProvider` + `DnfMessageProvider` 包根；组件按「通用视觉层 → 表单控件 → 弹窗」逐批替换；最后移除 naive-ui 依赖。

**Tech Stack:** Vue 3.5（+reka-ui 2.11.0 + @vueuse/core 14.4.0 运行时依赖）、Vitest 2、vue-tsc、@dnftools/ui（本地 v0.1.0，vendored）。

**规格依据：** `docs/superpowers/specs/2026-10-29-dnftools-ui-upgrade-design.md`

---

## 总则（所有阶段遵守）

1. **库 import**：一律 `import { DnfButton } from '@dnftools/ui'`；类型 `import type { DnfOption, DnfValue } from '@dnftools/ui'`。
2. **门禁**：每阶段结束在 `frontend/` 跑 `npm run build`（vue-tsc 类型把关）与 `npx vitest run`，**全绿**才提交。
3. **后端零改动**；只动 `frontend/`。
4. **提交直接到 main**，信息 `[feat]/[test]/[ref]` 风格 + 中文描述 + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
5. **spec 全量适配**：行为契约不变；naive 内部断言（`findComponent({name:'Switch'})` 等）改为针对 DNF 组件（`{name:'DnfSwitch'}`）或 `data-test` 选择器。**name 定位可用**：@vue/test-utils 的 `getComponentName` 会回退到编译产物的 `__name`，`findComponent({name:'DnfXxx'})` 可解析；仍**优先用 `data-test`/`data-act` 属性定位**更稳。`vi.mock('../lib/notify')` 因签名不变保持原样。
6. **改每个文件前先读它**；`<template>` 中 naive 组件标签（`<n-modal>` 等）在 Vue 模板中是 kebab/camel 均可解析，迁移后统一改为 DNF 组件标签。

---

## 阶段 1「基础接入」

目标：库接入可用、消息/弹窗切到 DNF、删亮色主题、导航换皮肤。**naive 仍保留在其余视图**（阶段 1 末起 naive 回退默认亮色主题，属预期阶段性视觉回归，非 bug）。

### Task 1.1: vendored 依赖 + alias + style.css

**Files:**
- Create: `frontend/src/vendor/@dnftools/ui/`（整目录从 `~/Desktop/package/dist/` 拷贝）
- Modify: `frontend/package.json`（加 `reka-ui@2.11.0`、`@vueuse/core@14.4.0`；`vue` 范围 `^3.4`→`^3.5`）
- Modify: `frontend/package-lock.json`（`npm install` 生成）
- Modify: `frontend/tsconfig.json`（加 `paths`）
- Modify: `frontend/vite.config.ts`（加 `resolve.alias`）
- Modify: `frontend/src/main.ts`（引 `@dnftools/ui/style.css`）

- [ ] **Step 1: 拷贝库 dist 进 vendor**

```bash
mkdir -p frontend/src/vendor/@dnftools/ui
cp -R ~/Desktop/package/dist/* frontend/src/vendor/@dnftools/ui/
```

- [ ] **Step 2: package.json 加运行时依赖并安装**

编辑 `frontend/package.json`：
```json
"dependencies": {
  "@vueuse/core": "14.4.0",
  "naive-ui": "^2.45.3",
  "pinia": "^2.2",
  "reka-ui": "2.11.0",
  "vue": "^3.5",
  "vue-router": "^4.4"
}
```
然后：`cd frontend && npm install`（安装 reka-ui/@vueuse，锁版本，生成新 lock）。

- [ ] **Step 3: tsconfig paths**

`frontend/tsconfig.json` 的 `compilerOptions` 加：
```json
"paths": {
  "@dnftools/ui": ["./src/vendor/@dnftools/ui/index.d.ts"],
  "@dnftools/ui/style.css": ["./src/vendor/@dnftools/ui/style.css"]
}
```

- [ ] **Step 4: vite alias（style.css 必须在前）**

`frontend/vite.config.ts`：
```ts
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@dnftools/ui/style.css': path.resolve(__dirname, 'src/vendor/@dnftools/ui/style.css'),
      '@dnftools/ui': path.resolve(__dirname, 'src/vendor/@dnftools/ui/index.js'),
    },
  },
  server: { /* 原 proxy 不变 */ },
})
```
注：`__dirname` 在 ESM 配置里不可用，需 `const __dirname = path.dirname(new URL(import.meta.url).pathname)` 或改用 `new URL('./src/...', import.meta.url).pathname`。

- [ ] **Step 5: main.ts 引样式（顺序：库样式在前，dnf.css 在后）**

`frontend/src/main.ts` 引库样式，**放在 `./styles/dnf.css` 之前**（CSS 变量层面 §5.2 靠 DOM 就近取库值，与顺序无关；库 `style.css` 规则包在 `@layer components` 内，而 `dnf.css` 无 @layer，未分层规则总是优先于分层规则——故 `.dnf-badge-danger/ok` 覆盖库 `.dnf-badge` 金色默认**与引入顺序无关**；保持「库在前」仅作保险，防库未来去 layer）：
```ts
import '@dnftools/ui/style.css'
import './styles/dnf.css'
```

- [ ] **Step 6: vendored index.d.ts 的 styles 引用处理**

`frontend/src/vendor/@dnftools/ui/index.d.ts` 首行是 `import './styles/index.css';`，但 vendor 内无 `styles/` 目录。先跑构建验证 `skipLibCheck` 是否抑制；若不通过，删除该行。

- [ ] **Step 7: 验证构建**

Run: `cd frontend && npm run build`
Expected: vue-tsc + vite build 通过（此时尚未使用库组件，仅样式引入）。

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/vite.config.ts frontend/src/main.ts frontend/src/vendor
git commit -m "feat: 内置 @dnftools/ui 组件库并接入样式/别名"
```

### Task 1.2: vitest setup（reka-ui 兼容）

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/tsconfig.json`（`types` 加 vitest 或由 config 接管）

库组件底层用 reka-ui，jsdom 下常缺 `ResizeObserver`/`matchMedia`/`Element.prototype.scrollIntoView`，需全局 stub。

- [ ] **Step 1: 建 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@dnftools/ui/style.css': new URL('./src/vendor/@dnftools/ui/style.css', import.meta.url).pathname,
      '@dnftools/ui': new URL('./src/vendor/@dnftools/ui/index.js', import.meta.url).pathname,
    },
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 2: 建 setup.ts**

`frontend/src/test/setup.ts`：
```ts
// 所有 stub 须用 typeof window 守卫——setupFiles 会在 node 环境 spec 中也加载
// （useSlotMove.spec.ts 是 // @vitest-environment node），裸访问 window/Element 会抛 ReferenceError
if (typeof window !== 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as any).ResizeObserver = ResizeObserverStub
  }
  if (!window.matchMedia) {
    ;(window as any).matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
}
```
注：现有各 spec 文件顶部有 `// @vitest-environment jsdom` 注解，保留不动；setup.ts 在 node 环境下经 `typeof window` 守卫后为空操作，不破坏 `useSlotMove.spec.ts`。

- [ ] **Step 3: 验证既有测试不受影响**

Run: `cd frontend && npx vitest run`
Expected: 全绿（此时尚未用库组件）。

- [ ] **Step 4: Commit**

```bash
git add frontend/vitest.config.ts frontend/src/test/setup.ts frontend/tsconfig.json
git commit -m "test: vitest 全局 setup 兼容 reka-ui（ResizeObserver/matchMedia/scrollIntoView stub）"
```

### Task 1.3: notify.ts 适配层 + App Provider + notify.spec 重写

**Files:**
- Modify: `frontend/src/lib/notify.ts`（重写内部，签名不变）
- Modify: `frontend/src/App.vue`（挂 `DnfDialogProvider`/`DnfMessageProvider`）
- Modify: `frontend/src/lib/notify.spec.ts`（重写为 mock DNF service）

- [ ] **Step 1: 写失败测试（重写 notify.spec.ts）**

重写 `frontend/src/lib/notify.spec.ts`：
```ts
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
```
注：`vi.mock('@dnftools/ui')` 里 `importOriginal` 需保留库其余导出（组件类型在类型层已够，运行时只需 service 被 mock）。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/notify.spec.ts`
Expected: FAIL（当前实现是 naive createDiscreteApi）。

- [ ] **Step 3: 重写 notify.ts**

`frontend/src/lib/notify.ts` 全文替换为：
```ts
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
```
注：`showCancel` 库默认 `true`（已核实）无需显式传；**`modal: true` 必须显式传**——库 `confirm()` 默认 `modal: false`（无遮罩/焦点陷阱），旧 naive `dialog.warning()` 是模态，危险操作（删除/封禁等）需保留背景阻断。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/notify.spec.ts`
Expected: PASS。

- [ ] **Step 5: App.vue 挂 Provider**

`frontend/src/App.vue` 的 `<script setup>` 加：
```ts
import { DnfDialogProvider, DnfMessageProvider } from '@dnftools/ui'
import { dialogs, messages } from './lib/notify'
```
`<template>` 根结构调整（`n-config-provider` 先保留到 Task 1.5，但外面再包 Provider）：
```vue
<DnfDialogProvider :service="dialogs">
  <DnfMessageProvider :service="messages">
    <n-config-provider :theme="naiveTheme" :theme-overrides="naiveOverrides">
      ...原内容...
    </n-config-provider>
  </DnfMessageProvider>
</DnfDialogProvider>
```
注：此步保持 `n-config-provider` 与 `useTheme` 暂存（Task 1.5 替换导航时一并移除）。

- [ ] **Step 6: 全量测试确认不受影响**

Run: `cd frontend && npx vitest run`
Expected: 全绿（其余视图仍 mock `../lib/notify`，签名不变）。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/notify.ts frontend/src/lib/notify.spec.ts frontend/src/App.vue
git commit -m "feat: notify 消息/弹窗适配层切到 @dnftools/ui（createDnfDialog/createDnfMessage，签名不变）"
```

### Task 1.4: 删亮色主题（含 App.vue 同步，保构建绿）

**Files:**
- Delete: `frontend/src/composables/useTheme.ts`
- Delete: `frontend/src/styles/theme.ts`
- Delete: `frontend/src/composables/useTheme.spec.ts`
- Modify: `frontend/src/App.vue`（移除 `useTheme` 解构与 `n-config-provider` 的 theme props）
- Modify: `frontend/index.html`（删 FOUC 脚本）
- Modify: `frontend/src/styles/dnf.css`（删 `[data-theme="light"]` 全部块，含 body/panel/btn/slot-cell/pos-team 等覆盖）

- [ ] **Step 1: 确认 useTheme 外部引用只剩 App.vue**

Run: `cd frontend && grep -rn "useTheme\|styles/theme" src/ | grep -v spec`
Expected: 只剩 `App.vue` 与 `composables/useTheme.ts` 自身（`notify.ts` 已被 Task 1.3 替换）；本任务随后删除 useTheme.ts/theme.ts 即可清空。

- [ ] **Step 2: App.vue 移除 useTheme（与删文件同一提交，避免中间红 commit）**

`App.vue` 中：删除 `import { useTheme }` 与 `const { theme, naiveTheme, naiveOverrides, toggleTheme } = useTheme()`；`<n-config-provider>` 去掉 `:theme`/`:theme-overrides`（naive 回退默认主题，Task 1.5 会整体替换为 DnfProvider）；删除主题切换按钮（`data-act="theme-toggle"`）与 `theme` 相关绑定。保留 `n-config-provider` 外壳到 Task 1.5。

- [ ] **Step 3: 删文件**

```bash
rm frontend/src/composables/useTheme.ts frontend/src/styles/theme.ts frontend/src/composables/useTheme.spec.ts
```

- [ ] **Step 4: index.html 删 FOUC 脚本**

`frontend/index.html` 删除 `<head>` 内 7-15 行的内联 `<script>try{...}catch(e){...}</script>`。

- [ ] **Step 5: dnf.css 删 light 块**

删除 `frontend/src/styles/dnf.css` 中所有 `[data-theme="light"]` 规则块（约 22-31、223-254 行区域），保留 `:root` 变量（阶段 4 再裁剪）。

- [ ] **Step 6: 门禁**

Run: `cd frontend && npm run build && npx vitest run`
Expected: 全绿（`useTheme.spec.ts` 已删；`notify.spec.ts` 在 Task 1.3 已重写，无 useTheme 引用）。

- [ ] **Step 7: Commit**

```bash
git add -A frontend/index.html frontend/src/styles/dnf.css frontend/src/composables frontend/src/styles/theme.ts frontend/src/App.vue
git commit -m "ref: 删除亮色主题与 FOUC 脚本，锁定暗色（App 同步移除 useTheme）"
```

### Task 1.5: App 导航 DNF 皮肤

**Files:**
- Modify: `frontend/src/App.vue`（`NConfigProvider`/`NDropdown` → `DnfProvider`/`DnfDropdownMenu`；`useTheme` 已在 Task 1.4 移除）

- [ ] **Step 1: 重写 App.vue**

`frontend/src/App.vue` 全文替换为：
```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { DnfProvider, DnfDropdownMenu, DnfDialogProvider, DnfMessageProvider } from '@dnftools/ui'
import type { DnfMenuItem } from '@dnftools/ui'
import { useAuthStore } from './stores/auth'
import { dialogs, messages } from './lib/notify'
import UserAvatar from './components/UserAvatar.vue'
import ProfilePanel from './components/ProfilePanel.vue'

const auth = useAuthStore()
const router = useRouter()
const profileOpen = ref(false)

const menuItems: DnfMenuItem[] = [
  { value: 'raids', label: '攻坚列表' },
  { value: 'characters', label: '我的角色' },
  { value: 'votes', label: '群会议' },
  ...(auth.isAdmin ? [{ value: 'admin', label: '管理' }] : []),
  { separator: true, value: '__sep', label: '' },
  { value: 'logout', label: '退出' },
]

function logout() {
  auth.logout()
  router.push('/login')
}
function onMenuSelect(item: DnfMenuItem) {
  if (item.value === 'logout') { logout(); return }
  const path = ({ raids: '/', characters: '/characters', votes: '/votes', admin: '/admin' } as Record<string, string>)[item.value]
  if (path) router.push(path)
}
</script>

<template>
  <DnfProvider>
    <DnfDialogProvider :service="dialogs">
      <DnfMessageProvider :service="messages">
        <nav v-if="auth.user" class="dnf-nav">
          <router-link to="/" class="logo">跨六 DNF 糕手</router-link>
          <router-link to="/" class="nav-link">攻坚列表</router-link>
          <router-link to="/characters" class="nav-link">我的角色</router-link>
          <router-link to="/votes" class="nav-link">群会议</router-link>
          <router-link v-if="auth.isAdmin" to="/admin" class="nav-link">管理</router-link>
          <span class="nav-right">
            <button class="nav-user" title="个人信息" @click="profileOpen = true">
              <UserAvatar v-if="auth.user" :nickname="auth.user.nickname"
                          :avatar="auth.user.avatar" :size="26" />
              <span class="nav-username">{{ auth.user?.nickname }}</span>
            </button>
            <a href="#" class="nav-exit" @click.prevent="logout">退出</a>
            <DnfDropdownMenu :items="menuItems" @select="onMenuSelect">
              <template #trigger><button class="hamburger" aria-label="菜单">☰</button></template>
            </DnfDropdownMenu>
          </span>
          <ProfilePanel :open="profileOpen" @close="profileOpen = false" />
        </nav>
        <router-view :key="$route.fullPath" />
      </DnfMessageProvider>
    </DnfDialogProvider>
  </DnfProvider>
</template>
```
注：`DnfDropdownMenu` 的触发内容用 `#trigger` 插槽（实现时查 `dist/components/dropdown-menu/DnfDropdownMenu.vue.d.ts` 确认插槽名；若为默认插槽则去掉 `#trigger` 包裹直接放按钮）。`.dnf-nav` 样式保留在 `dnf.css`（阶段 4 前不动）；顶部导航不强制用 `DnfFrame`，若想贴图化可把 `<nav>` 换成 `<DnfFrame surface="strip">`，实现时按实际效果取舍。

- [ ] **Step 2: 验证**

Run: `cd frontend && npm run build && npx vitest run`
Expected: 全绿。注意 `App.vue` 无专属 spec；`ProfilePanel` 等子组件 spec 不依赖导航。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.vue
git commit -m "feat: App 根换 DnfProvider + DnfDropdownMenu 导航，移除 naive 配置与主题切换"
```

### Task 1.6: 阶段 1 门禁

- [ ] **Step 1: 全量构建 + 测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: 全绿（若 Task 1.3 的 spec 适配不完整，此处会暴露）。

- [ ] **Step 2: 人工抽查**

`cd frontend && npm run dev`，浏览器打开确认：导航皮肤、登录后消息提示（如报名成功）走 DNF 贴图、主题切换按钮已消失。

- [ ] **Step 3: 确认阶段 1 提交完整**

```bash
git log --oneline -5
```
Expected: 阶段 1 各 task 提交齐全。

---

## 阶段 2「通用视觉层」

目标：全局皮肤类替换——按钮/面板/徽章/表格/原生表单皮肤，及不含 naive 控件的简单视图。**naive 控件仍在的视图只换皮肤不换控件**（Login/Register 换按钮与页面皮肤，RaidListView 换卡片/徽章/按钮）。

### Task 2.1: dnf-btn → DnfButton 全局

**Files:**
- Modify: `frontend/src/views/LoginView.vue`, `frontend/src/views/RegisterView.vue`, `frontend/src/views/RaidListView.vue`, `frontend/src/views/RaidDetailView.vue`, `frontend/src/views/RosterView.vue`, `frontend/src/views/MyCharactersView.vue`, `frontend/src/views/VotesView.vue`, `frontend/src/views/AdminCodesView.vue`, `frontend/src/views/AdminDungeonsView.vue`, `frontend/src/views/AdminUsersView.vue`
- Modify: 全部 `frontend/src/components/*.vue` 中带 `dnf-btn` 的组件（SignupModal / SlotActionModal / RosterTargetModal / CharacterPickerModal / DutySelect 等）
- Delete: `frontend/src/styles/dnf.css` 中 `.dnf-btn` 系列规则

映射规则：
| 现状 | 替换 |
|---|---|
| `<button class="dnf-btn">确定</button>` | `<DnfButton>确定</DnfButton>` |
| `<button class="dnf-btn dnf-btn-primary">` | `<DnfButton tone="gold">` |
| `<button class="dnf-btn dnf-btn-danger">` | `<DnfButton tone="orange">` |
| `<button class="dnf-btn dnf-btn-sm">` | `<DnfButton>`（size 用小号类，若库无 size prop 则加 `class="dnf-btn-sm"` 保留尺寸） |
| `<button class="dnf-btn dnf-btn-sm dnf-btn-primary">` | `<DnfButton tone="gold">` |
| `:disabled` / `@click` | `:disabled` / `@click` 原样传 |

- [ ] **Step 1: 先改一个代表文件确认 API**

读 `frontend/src/views/LoginView.vue`，把 `<n-button type="primary" attr-type="submit" block :loading="loading">登录</n-button>` 换成 `<DnfButton type="submit" :loading="loading">登录</DnfButton>`（`tone="gold"`），并把其余 `dnf-btn` 按钮替换。验证 `npm run build` 类型通过。**同时验证组件 name 解析**：写一个最小 spec 尝试 `findComponent({name:'DnfButton'})`，若 vendored 组件只有 `__name` 无法按 name 命中，**本阶段起一律用 `data-test`/`data-act` 定位组件**（总则 #5）。

- [ ] **Step 2: 全局替换**

对上面 Files 列出的每个文件：先读，再把 template 里所有带 `dnf-btn` 的 `<button>` 换成 `<DnfButton>`（按映射规则选 `tone`/`skin`），删除 `<style>` 里对按钮的尺寸覆盖或保留 `dnf-btn-sm` 尺寸类。**保留 `data-act`/`data-test` 属性**，确保 spec 可定位。

- [ ] **Step 3: spec 适配**

搜索 `dnf-btn` 相关断言（如 `find('.dnf-btn')`、`classes('dnf-btn-primary')`），改为断言 `findComponent({name:'DnfButton'})` 或 `find('button')` + `data-test`/`data-act`。逐个 spec 文件适配到 `vitest run` 全绿。

- [ ] **Step 4: 门禁**

Run: `cd frontend && npm run build && npx vitest run`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "feat: 全局按钮换 DnfButton（gold 主按钮/orange 危险按钮）"
```

### Task 2.2: dnf-panel → DnfFrame

**Files:**
- Modify: 使用 `dnf-panel` 的视图/组件（RaidListView 创建表单与 raid-card、RaidDetailView、Login/Register auth-card、AdminUsersView 的 dnf-section、MyCharactersView 等，用 grep 定位）
- Delete: `frontend/src/styles/dnf.css` 中 `.dnf-panel` 规则

映射规则：
- `<div class="dnf-panel">…</div>` → `<DnfFrame surface="panel">…</DnfFrame>`（或 `surface="group"/"well"`，按视觉效果选）
- `class="dnf-panel raid-card"` → `<DnfFrame surface="panel" class="raid-card">`（保留 raid-card 的 hover 样式）
- `class="dnf-panel auth-card"` → `<DnfFrame surface="panel" class="auth-card">`

- [ ] **Step 1: grep 定位全部 `dnf-panel` 使用点**

Run: `cd frontend && grep -rn "dnf-panel" src/ | grep -v '.spec.ts'`

- [ ] **Step 2: 逐个替换并适配 spec**

对每处：读文件 → 换 `<DnfFrame surface="panel">` → 若外层类还承载布局/悬停样式，把 class 留给 DnfFrame。spec 中 `find('.dnf-panel')` 类断言改为 `findComponent({name:'DnfFrame'})`。

- [ ] **Step 3: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 面板换 DnfFrame 贴图底板"
```

### Task 2.3: dnf-badge → DnfBadge

**Files:**
- Modify: 使用 `dnf-badge` 的视图/组件（RaidList / RaidDetail / Roster / MyCharacters / AdminUsers 等，用 grep 定位）
- Modify: `frontend/src/styles/dnf.css`（**保留** `.dnf-badge` 基类与 `.dnf-badge-danger`/`.dnf-badge-ok` 颜色规则，Task 4.2 才清理）

映射规则（**DnfBadge 无 `tone` prop**，仅有 `quality`/`variant`/`count`/`label`，已核实 `badge/DnfBadge.vue.d.ts`）：
- 状态色徽章（已锁定/未锁定/已关闭/已报名）→ `<DnfBadge class="dnf-badge-danger">已锁定</DnfBadge>` / `<DnfBadge class="dnf-badge-ok">未锁定</DnfBadge>`——DnfBadge 根节点渲染 `class="dnf-badge"`，`data-test`/自定义 class 会合并；**`dnf.css` 中 `.dnf-badge-danger`/`.dnf-badge-ok` 两个颜色规则保留**（库无状态色等价物）。
- 普通徽章（如「临时」）→ `<DnfBadge>临时</DnfBadge>`（无状态色，仅贴图外壳）。
- 若需计数/等级形态，用 `variant="count"/"level"` + `count`/`max`。

- [ ] **Step 1: 确认 DnfBadge 渲染与 class 合并**

读 `frontend/src/vendor/@dnftools/ui/components/badge/DnfBadge.vue.d.ts` 与编译产物，确认根节点带 `class="dnf-badge"`、传入 class 可合并；按上面规则定映射。

- [ ] **Step 2: 全局替换 + spec 适配**

对每处 `dnf-badge`：状态色徽章换 `<DnfBadge class="dnf-badge-danger/ok">`，普通徽章换 `<DnfBadge>`。**保留 `.dnf-badge-danger`/`.dnf-badge-ok` 的 dnf.css 颜色规则**（Task 4.2 裁剪时排除）。spec 中徽章断言改为 `findComponent({name:'DnfBadge'})` + `.text()`，或继续用 `.dnf-badge` class 定位。

- [ ] **Step 3: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 状态徽章换 DnfBadge"
```

### Task 2.4: dnf-table → DnfTable

**Files:**
- Modify: `frontend/src/views/AdminUsersView.vue`（两处 `<table class="dnf-table">`）
- Modify: `frontend/src/views/AdminDungeonsView.vue`（若有 table）
- Modify: `frontend/src/views/AdminCodesView.vue`（若有 table）
- Modify: `frontend/src/components/VoteCard.vue`（投票明细若有 table）
- Delete: `frontend/src/styles/dnf.css` 中 `.dnf-table` 规则

DnfTable 是声明式表格：`<DnfTable :columns="cols" :rows="rows" :row-key="r => r.id">` + 单元格插槽 `#cell-<key>="{row}"`。列定义 `{ key, label, width?, align?, sortable? }`。

- [ ] **Step 1: 转换 AdminUsersView 角色查询表**

把：
```html
<table class="dnf-table">
  <thead><tr><th>角色名</th>…</tr></thead>
  <tbody><tr v-for="c in queryItems"><td>{{ c.name }}</td>…</tr></tbody>
</table>
```
换成：
```vue
<DnfTable :columns="queryCols" :rows="queryItems" :row-key="(r) => r.id">
  <template #cell-name="{ row }">{{ row.name }}</template>
  <template #cell-job_title="{ row }">{{ jobGenderTitle(row.job_name, row.job_title) }}</template>
  <!-- 其余列按列定义补 cell 插槽 -->
</DnfTable>
```
`queryCols` 定义在 script：
```ts
const queryCols = [
  { key: 'name', label: '角色名' },
  { key: 'job_title', label: '职业' },
  { key: 'class_type', label: '类别' },
  { key: 'fame', label: '名望' },
  { key: 'simulated_damage', label: '模拟伤害' },
  { key: 'sustained_dps', label: '持续输出' },
  { key: 'buff_amount', label: '增益量' },
  { key: 'sun_buff', label: '太阳增益' },
  { key: 'adventure_party_name', label: '冒险团' },
  { key: 'owner_nickname', label: '归属玩家' },
] as DnfColumn[]
```
注：`owner_nickname` 列内需按钮，用 `#cell-owner_nickname="{ row }"` 放 `<DnfButton>`。数值列输出/辅助显示 `—` 的逻辑放插槽里。

- [ ] **Step 2: 转换账号管理表**（同上模式，`users` 行 + 操作列按钮）

- [ ] **Step 3: spec 适配**

`AdminUsersView.spec` 对 `<table>`/行/单元格的断言改为 DnfTable 渲染结果（`findComponent({name:'DnfTable'})` 或按文本内容）。其它视图若有 `.dnf-table` 断言同理。

- [ ] **Step 4: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 管理表格换 DnfTable 声明式表格"
```

### Task 2.5: 原生表单皮肤 → DnfInput/DnfSelect

**Files:**
- Modify: 全部含原生 `<input class="dnf-input">` 的文件（见 Step 1 的 grep 清单）
- Modify: `frontend/src/styles/dnf.css`（删 `.dnf-input` 规则；**`.dnf-select` 保留到 Task 3.1 全部原生 select 换完后再删**，避免阶段 2 末到阶段 3 之间 select 无皮肤）
- Test: 对应文件的 spec（`CharacterForm.spec`/`AdminUsersView.spec` 等）

映射规则：
- `<input class="dnf-input" v-model="x" placeholder="…">`（x 为 string）→ `<DnfInput v-model="x" placeholder="…">`
- **数字字段（重点）**：DnfInput 的 `modelValue` 是 `string`（无 number 变体，已核实 d.ts）。凡 `<input type="number" v-model.number>` 绑定的 `number | null` 字段（CharacterForm `fame/simulated_damage/sustained_dps/buff_amount/sun_buff`、GuestCreateModal 每角色行数值、AdminCodesView `expireDays`、SlackRulesModal `value/count`），**不能直接 `v-model`**，须显式转换：
  ```html
  <DnfInput :model-value="form.fame?.toString() ?? ''" @update:model-value="v => form.fame = v ? Number(v) : null" type="number" />
  ```
  否则 vue-tsc 门禁因 number→string 类型不符而失败。若字段语义是整数（如 `expireDays`），`Number(v)` 可加 `Math.trunc`。
- `<select class="dnf-select" v-model="x">` 或 `<select class="dnf-input" v-model="x">` → **阶段 2 一律不换 select**，统一留到阶段 3 Task 3.1（见 Step 2；注意 SlackRulesModal 的 4 个下拉用的是 `class="dnf-input"`，也归 Task 3.1）
- `:focus` 边框样式随库组件自带，删 dnf.css 对应规则

- [ ] **Step 1: grep 全部原生 input 并逐个替换**

Run: `cd frontend && grep -rn 'class="dnf-input"' src/ | grep -v '.spec.ts'`
Expected: 覆盖以下全部（**实测 12 文件**）：CharacterForm（6）/ SlackRulesModal（7）/ GuestCreateModal（8）/ GuestConvertModal（3）/ VoteCreateModal（3，**其中 1 处是 `<textarea class="dnf-input">`，映射 `DnfTextarea`**）/ ChangePasswordModal（3）/ AdventurePartyModal（2）/ AdminResetPasswordModal（2）/ AdminDungeonsView（2）/ **AdminUsersView（3：`keyword`/`owner`/`user_q` 搜索框）**/ AdminCodesView（1）/ **RosterPool（`data-act="pool-search"` 搜索框）**。逐个读文件后把 `<input class="dnf-input">` 换 `<DnfInput>`（保留 `data-test`/`data-filter`/`data-act`/`id` 属性；**attrs 透传到底层原生元素需在实现时验证**——DnfInput 的 d.ts 未声明 `placeholder`，靠 fallthrough 生效）。

- [ ] **Step 2: 原生 select 统一留到阶段 3**

**阶段 2 不替换任何原生 `<select>`**——无论 `class="dnf-select"` 还是 `class="dnf-input"`（含简单选项与 60 项职业选择、SlackRulesModal 的 4 个下拉）。全部在阶段 3 Task 3.1 一并转 `DnfSelect`（含 `:options` 构造与 null/undefined 适配）。

- [ ] **Step 3: spec 适配 + 门禁**

`CharacterForm.spec`/`AdminUsersView.spec` 若按 `input#char-name` 等选择器定位，DnfInput 透传 id 应仍可命中；若有 `find('.dnf-input')` 断言改为 `findComponent({name:'DnfInput'})`。
Run: `cd frontend && npm run build && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src
git commit -m "feat: 原生表单控件换 DnfInput/DnfSelect"
```

### Task 2.6: UserAvatar → DnfAvatar + 简单视图换肤

**Files:**
- Modify: `frontend/src/components/UserAvatar.vue`（内部用 `DnfAvatar`）
- Modify: `frontend/src/views/LoginView.vue`（auth-card 用 DnfFrame，NButton 已在 2.1 换）
- Modify: `frontend/src/views/RegisterView.vue`（同上）
- Modify: `frontend/src/views/AdminCodesView.vue`, `frontend/src/views/AdminDungeonsView.vue`（dnf-btn/panel/badge 已在前面任务覆盖，此处仅查漏）
- Modify: `frontend/src/views/MyCharactersView.vue`（卡片/面板换肤）

- [ ] **Step 1: UserAvatar 改用 DnfAvatar**

读 `frontend/src/components/UserAvatar.vue`，把自绘头像外层替换/内嵌 `DnfAvatar`（props `src`/`label`/`size`）。保留对外 props（`nickname`/`avatar`/`size`）不变，组件内部计算 `src`/`label` 传给 DnfAvatar。`UserAvatar.spec` 若断言内部结构需适配，对外契约不变则基本不动。

- [ ] **Step 2: 简单视图查漏换肤**

Login/Register/AdminCodes/AdminDungeons/MyCharacters：确认按钮/面板/徽章/输入已换，无残留 `dnf-btn`/`dnf-panel` 裸用（除了编队网格等阶段 4 才清理的专用类）。

- [ ] **Step 3: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: UserAvatar 换 DnfAvatar，简单视图换肤完成"
```

### Task 2.7: 阶段 2 门禁

- [ ] **Step 1: 全量构建 + 测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: 全绿。

- [ ] **Step 2: 人工抽查**

`npm run dev`：攻坚列表/详情/我的角色/管理页皮肤已 DNF 化；编队网格、攻坚卡片等专用 CSS 仍正常。

- [ ] **Step 3: 提交完整性确认**

```bash
git log --oneline -10
```

---

## 阶段 3「弹窗与表单控件」

目标：所有 naive 表单控件与 18 处 NModal（17 个文件）全部替换。**按组件归属、不按视图整体归属**。

### Task 3.1: NSelect + 原生 select → DnfSelect

**Files:**
- Modify: `frontend/src/components/DutySelect.vue`（NSelect）
- Modify: `frontend/src/components/CharacterPickerModal.vue`（NSelect，含 `filterable`）
- Modify: `frontend/src/views/RaidListView.vue`（NSelect，`dungeonId` 的 `null`→`undefined`）
- Modify: `frontend/src/views/AdminUsersView.vue`（原生 `<select class="dnf-select">` × 3：class_type / job / sort）
- Modify: `frontend/src/components/GuestCreateModal.vue`（原生职业 select，若存在）
- Modify: `frontend/src/components/CharacterForm.vue`（原生冒险团 `<select id="char-party" data-act="adventure-party">`，约 102 行）
- Modify: `frontend/src/views/AdminDungeonsView.vue`（原生 `<select class="dnf-select">`，`dgSize` 约 56 行）
- Modify: `frontend/src/components/SlackRulesModal.vue`（4 个 `<select class="dnf-input">`：class_type/metric 下拉，约 54/58/73/77 行）
- Test: `frontend/src/views/RaidListView.spec.ts`、`frontend/src/components/CharacterPickerModal.spec.ts`、`frontend/src/views/AdminUsersView.spec.ts`、`frontend/src/components/CharacterForm.spec.ts`

映射规则：
- `<n-select size="small" :options="opts" :value="modelValue" @update:value="(v)=>emit('update:modelValue', v)">` → `<DnfSelect :options="opts" :model-value="modelValue" @update:model-value="(v)=>emit('update:modelValue', v)">`
- `v-model:value` → `v-model`；`@update:value` → `@update:model-value`
- 原生 `<select class="dnf-select" v-model="x">` → `<DnfSelect v-model="x" :options="opts">`（options 由现有 `<option>` 构造，`value` 用 DnfValue：AdminUsersView 的 filter value 是字符串，直接映射）
- **null 值**：DnfSelect 的 `DnfValue = string | number`（不含 null/undefined）。凡绑定 `number | null` 的 ref（如 `dungeonId`）改为 `ref<number | undefined>(undefined)`，清空语义用 `undefined`（库约定）。
- **filterable 无等价物**：DnfSelect 无 `filterable` prop（已核实 `select/DnfSelect.vue.d.ts`）。CharacterPickerModal 管理员选人下拉的搜索能力丢失——**实现时在 DnfSelect 上方保留一个原生搜索输入**（按玩家昵称过滤 options）或明确接受该降级；不得静默丢失搜索。

- [ ] **Step 1: DutySelect 替换**

读 `DutySelect.vue`，换成 DnfSelect。类型：`modelValue: Duty | null` 改为 `Duty | undefined`；`emit('update:modelValue', v)` 保留。`DutySelect.spec` 若按 `n-select` 定位，改为 `findComponent({name:'DnfSelect'})` 或 `data-test`。

- [ ] **Step 2: CharacterPickerModal + RaidListView + 原生 select**

- CharacterPickerModal：换 DnfSelect，处理 `filterable` 降级（上方搜索输入）。spec 中 `Select` 断言改为 DnfSelect，事件名 `update:value`→`update:modelValue`、prop `value`→`modelValue`。
- RaidListView：`dungeonId`/`startsAt` 相关 null 处理按 DnfSelect/DnfInput 语义适配；`onDungeonChange` 在 `@update:model-value` 触发。RaidList 的 `dungeonOptions` 的 value 是 `d.id`（number）——DnfSelect 支持 number value。spec 中 `RaidListView.spec.ts:65` 的 `findComponent({name:'Select'}).vm.$emit('update:value', 7)` 改为 DnfSelect + `update:modelValue`。
- AdminUsersView / GuestCreateModal / CharacterForm（冒险团 select）/ AdminDungeonsView（`dgSize`）：原生 select 换 DnfSelect，`:options` 构造，`data-filter`/`data-act`/`data-test` 属性透传。
- **原生 select 相关 spec 交互改写（重点）**：DnfSelect 渲染的是 `<div class="dnf-select">` + 触发按钮（非 aria attrs 落在根 div 上），原 `find('[data-filter="class_type"]').setValue('辅助')`（AdminUsersView.spec 39-41、108）对 div 会失败；`find('[data-act="adventure-party"]')` 断言 `HTMLSelectElement`（CharacterForm.spec 82）也不再成立。**改写为驱动 reka-ui 弹层**：click 触发按钮 → click 选项，或改断言组件渲染（DnfSelect + 选项文本）。实现时若 jsdom 驱动 reka-ui 弹层困难，优先收窄断言到「触发按钮存在 + v-model 绑定」这一契约层。

- [ ] **Step 3: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 下拉选择换 DnfSelect"
```

### Task 3.2: NInput → DnfInput

**Files:**
- Modify: `frontend/src/views/LoginView.vue`（2 处 NInput）、`frontend/src/views/RegisterView.vue`（4 处 NInput）
- Modify: `frontend/src/components/ProfilePanel.vue`（NInput）
- Modify: `frontend/src/views/RaidListView.vue`（创建表单 `name` 的 NInput）
- Modify: `frontend/src/views/RaidDetailView.vue`（编辑表单 `editName` 的 NInput，约 390 行，与 NDatePicker 同一表单）
- Test: `frontend/src/views/RaidListView.spec.ts`

映射规则：
- `<n-input v-model:value="x" placeholder="…" />` → `<DnfInput v-model="x" placeholder="…" />`
- `<n-input v-model:value="x" type="password" />` → `<DnfInput v-model="x" type="password" />`
- `:maxlength`/`:show-count` 对应 DnfInput `maxlength`/`showCount`（实现时查 `input/index.d.ts`）
- **prop/事件名**：naive `value` prop → Dnf `modelValue`；`update:value` → `update:modelValue`。`RaidListView.spec.ts:68` 的 `findAllComponents({name:'Input'})…props('value')` 改为 DnfInput + `modelValue`。

- [ ] **Step 1: 逐个替换**

每个文件读后替换。`RaidListView.spec.ts:84` 的 `findComponent({ name: 'DatePicker' })` 不在本任务（NDatePicker 是 Task 3.6）。

- [ ] **Step 2: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 文本输入换 DnfInput"
```

### Task 3.3: NInputNumber / NCheckbox → DnfNumberInput / DnfCheckbox

**Files:**
- Modify: `frontend/src/components/RosterTargetModal.vue`（NInputNumber × 6 + NCheckbox × 1）

映射规则：
- `<n-input-number v-model:value="draft.outCount" :min="0" data-test="tgt-out-count" />` → `<DnfNumberInput v-model="draft.outCount" :min="0" data-test="tgt-out-count" />`
- `<n-checkbox v-model:checked="draft.slack" data-test="tgt-slack">划水豁免…</n-checkbox>` → `<DnfCheckbox v-model="draft.slack" data-test="tgt-slack">划水豁免…</DnfCheckbox>`

**null 处理（重点）**：`DnfNumberInput` 的 `modelValue` 是 `number`（不含 null），而 `draft` 字段是 `number | null`（null=未设置）。适配方式：
```ts
// 方案：wrapper 保持 draft 可空，value 用 ?? 0 兜底
<DnfNumberInput :model-value="draft.outCount ?? 0" @update:model-value="v => draft.outCount = v" :min="0" />
```
`toTarget()` 仍按 `draft.x != null` 决定是否写入 target（语义不变）。**已知取舍**：用户清空输入框时组件回退最近有限数，不会产生 null（无法「取消设置」），可接受；若需取消，加一个清除按钮置 null。

- [ ] **Step 1: 替换 + null 适配**

读 `RosterTargetModal.vue` 替换 6 个 NInputNumber + 1 个 NCheckbox，按上述 null 方案处理。

- [ ] **Step 2: spec 适配**

`RosterTargetModal.spec`（或所在 RosterView.spec）对 `n-input-number`/`n-checkbox` 的定位改为 DnfNumberInput/DnfCheckbox 或 `data-test`。

- [ ] **Step 3: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 数值输入与勾选换 DnfNumberInput/DnfCheckbox"
```

### Task 3.4: NSwitch → DnfSwitch

**Files:**
- Modify: `frontend/src/views/RosterView.vue`

映射规则：
- `<n-switch v-model:value="x" />` → `<DnfSwitch v-model="x" />`
- **受控式**（RosterView 的「推荐」开关是 `:value="recommendOn"` + `@update:value="toggleRecommend"`，非 v-model）→ `<DnfSwitch :model-value="recommendOn" @update:model-value="toggleRecommend" />`

- [ ] **Step 1: 替换**

读 `RosterView.vue` 找到 NSwitch（「推荐」开关，约 225 行），按受控式映射替换。spec 中 `findComponent({ name: 'Switch' })` 改为 `{ name: 'DnfSwitch' }` 或 `data-test`；**事件名同步**：`RosterView.spec.ts:161` 对开关 emit 的 `'update:value'` 改为 `'update:modelValue'`。

- [ ] **Step 2: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 开关换 DnfSwitch"
```

### Task 3.5: NTabs → DnfTabs

**Files:**
- Modify: `frontend/src/views/AdminUsersView.vue`

DnfTabs 是数组式 Tabs：`<DnfTabs v-model="activeTab" :tabs="tabs">`，内容放默认插槽，用 `v-if` 按 tab 显示。

- [ ] **Step 1: 转换**

把：
```html
<n-tabs v-model:value="activeTab">
  <n-tab-pane name="query" tab="角色查询" display-directive="show">…</n-tab-pane>
  <n-tab-pane name="users" tab="账号管理" display-directive="show">…</n-tab-pane>
</n-tabs>
```
换成：
```vue
<DnfTabs v-model="activeTab" :tabs="tabs">
  <section v-if="activeTab === 'query'" class="dnf-frame-section">…原角色查询内容…</section>
  <section v-if="activeTab === 'users'" class="dnf-frame-section">…原账号管理内容…</section>
</DnfTabs>
```
script 加：
```ts
import { DnfTabs } from '@dnftools/ui'
const tabs = [
  { value: 'query', label: '角色查询' },
  { value: 'users', label: '账号管理' },
]
```

- [ ] **Step 2: spec 适配**

`AdminUsersView.spec` 对 tab 切换/内容的断言（可能 `findComponent({name:'Tabs'})` 或点击 tab 文本）改为 DnfTabs + `v-if` 内容断言。

- [ ] **Step 3: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 标签页换 DnfTabs"
```

### Task 3.6: NDatePicker → 原生 datetime-local

**Files:**
- Modify: `frontend/src/views/RaidListView.vue`（创建表单）
- Modify: `frontend/src/views/RaidDetailView.vue`（编辑表单）

- [ ] **Step 1: RaidList 替换**

把：
```html
<n-date-picker data-test="starts-at" type="datetime" value-format="yyyy-MM-dd'T'HH:mm:ss" clearable update-value-on-close placeholder="发起时间" v-model:formatted-value="startsAt" />
```
换成：
```html
<input type="datetime-local" data-test="starts-at" class="dnf-datetime"
       v-model="startsAtLocal" placeholder="发起时间" style="width:100%" />
```
**皮肤（重点）**：Task 2.5 已删除 `.dnf-input` 规则，此处不能再引用它。在 `dnf.css` 保留/新增一个 `.dnf-datetime` 皮肤规则（复用 `.dnf-input` 的视觉，背景 `var(--dnf-panel-inner)` + 金色边框），或包一层 `DnfFrame`/自定义 class。Task 4.2 清理时保留该规则。
script 适配：
```ts
// startsAt 保留 ISO 字符串（发后端）；startsAtLocal 是 datetime-local 的本地值
const startsAtLocal = computed<string>({
  get: () => startsAt.value ? startsAt.value.slice(0, 16) : '',
  set: (v) => { startsAt.value = v ? `${v}:00` : null },
})
```
`create()` 里校验与提交 `starts_at: startsAt.value` 不变。

- [ ] **Step 2: RaidDetail 替换**

读 `RaidDetailView.vue` 的编辑表单 NDatePicker（约 394 行），用同样 `datetime-local` 模式替换 `editStartsAt`。

- [ ] **Step 3: spec 适配**

`RaidListView.spec.ts:84` 的 `findComponent({ name: 'DatePicker' }).vm` 删除，改为断言 `input[data-test="starts-at"]` 存在及 v-model 绑定。

- [ ] **Step 4: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add -A frontend/src
git commit -m "feat: 日期时间选择换原生 datetime-local"
```

### Task 3.7: NModal → DnfDialog（18 处 / 17 文件）

**Files:**
- Modify: `frontend/src/components/*Modal.vue` 与含 NModal 的视图（AdventurePartyModal / ChangePasswordModal / GuestCreateModal / GuestConvertModal / MemberCharactersModal / AdminResetPasswordModal / AdminUserCharactersModal / CharacterPickerModal / RosterTargetModal / SignupModal / SignupMemberPicker / SlackRulesModal / SlotActionModal / VoteCreateModal / ProfilePanel / RaidDetailView / RosterView）

**映射规则：**
- `<n-modal v-model:show="open" preset="card" :title="…">…</n-modal>` →
```vue
<DnfDialog v-model:open="open" :title="…" modal>
  …内容…
  <template #footer>…底部按钮…</template>
</DnfDialog>
```
- 受控式 `<n-modal :show="open" @update:show="s => { if (!s) emit('close') }">` →
```vue
<DnfDialog :open="open" :title="…" modal @update:open="s => { if (!s) emit('close') }">
```
- `n-modal` 的 `preset="card"` 语义对应 DnfDialog 自带窗口外壳（title 插槽/属性），不再需要 `preset`。
- **`modal` prop 必须显式传 `modal`**：DnfDialog 的 `modal` 默认 `false`（无遮罩/焦点陷阱），naive `n-modal` 默认阻断背景交互——迁移后每个弹窗加 `modal`（及按需 `close-on-escape`/`close-on-outside`）保持原交互。
- 底部按钮：原 `#footer` 里是 `<button class="dnf-btn">`（Task 2.1 已换 DnfButton），保留在 `#footer` 插槽；`close` 事件在 footer 插槽 props 里提供 `{ close }`。
- 宽度：`n-modal` 的 `style="width:…"` → DnfDialog `width` prop（如 `width="min(380px,92vw)"`）。
- **逐弹窗处理**：每个弹窗的 `show`/`update:show`/`v-model:show` 绑定与 emit('close') 模式不同，逐个读文件后按上面对应模式改。

- [ ] **Step 1: 先迁移 3 个代表弹窗**

AdventurePartyModal、SignupModal、RosterTargetModal：读文件 → 换 DnfDialog → 对应 spec 适配（`findComponent({name:'Modal'})` 等改为 DnfDialog）→ `npx vitest run` 通过。确认模式可行。

- [ ] **Step 2: 迁移其余 14 个文件（共 17 个文件、18 处 `<n-modal>`，RaidDetailView 有 2 处）**

逐个弹窗/视图按同一模式迁移，每完成一批跑一次 `npx vitest run`。

- [ ] **Step 3: 移除 App/根级 NModal 残留**

确认无 `<n-modal>` 残留：`grep -rn "<n-modal" src/` 应为空。

- [ ] **Step 4: 门禁**

Run: `cd frontend && npm run build && npx vitest run`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "feat: 18 处弹窗换 DnfDialog"
```

### Task 3.8: 阶段 3 门禁

- [ ] **Step 1: 全量构建 + 测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: 全绿。

- [ ] **Step 2: 人工抽查**

`npm run dev`：报名弹窗、编队目标弹窗、角色管理弹窗、临时用户弹窗、确认对话框、消息提示全部 DNF 贴图化；创建/编辑攻坚的 datetime-local 正常。

- [ ] **Step 3: 残留 naive 检查**

Run: `cd frontend && grep -rn "naive-ui\|<n-" src/ | grep -v spec`
Expected: 除 spec 里的注释/快照外无残留（spec 中 naive 相关 mock 也应在对应任务清理）。

---

## 阶段 4「收尾清理」

### Task 4.1: 移除 naive-ui 依赖

**Files:**
- Modify: `frontend/package.json`（删 `naive-ui`）
- Modify: `frontend/package-lock.json`（npm install 生成）

- [ ] **Step 1: 确认零引用**

Run: `cd frontend && grep -rn "naive-ui|n-config-provider|n-modal|n-select|n-input|<n-" src/`
Expected: 无（spec 也干净）。

- [ ] **Step 2: 移除依赖**

`frontend/package.json` 删 `"naive-ui": "^2.45.3"`，然后 `npm install`。

- [ ] **Step 3: 门禁 + Commit**

Run: `cd frontend && npm run build && npx vitest run`
```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "ref: 移除 naive-ui 依赖"
```

### Task 4.2: dnf.css 裁剪与变量清理

**Files:**
- Modify: `frontend/src/styles/dnf.css`

- [ ] **Step 1: 裁剪已替换的类**

删除已无使用点的 `.dnf-btn*` / `.dnf-panel` / `.dnf-table` / `.dnf-input` / `.dnf-select`（前面任务已删，此处确认无残留引用后收尾）。**保留 `.dnf-badge` 基类与 `.dnf-badge-danger`/`.dnf-badge-ok` 状态色规则**（Task 2.3 的 `<DnfBadge class="dnf-badge-danger/ok">` 依赖它们）。

- [ ] **Step 2: 变量冲突处理**

`:root` 里删除与库重复的 `--dnf-gold/--dnf-panel/--dnf-text/--dnf-text-muted/--dnf-danger`（库在 Provider 根定义，DOM 就近取库值）；保留库未定义的 `--dnf-bg/--dnf-gold-hi/--dnf-gold-deep/--dnf-panel-inner/--dnf-text-faint/--dnf-ok/--dnf-border/--dnf-accent`。保留的定制类（`squad-grid`/`slot-cell`/`raid-card`/`char-pick`/`pos-capsule`/`wave-tag`/`dnf-nav`/`auth-*`/`dnf-page`）继续用这些变量。

- [ ] **Step 3: 验证**

Run: `cd frontend && npm run build && npx vitest run`（若变量裁剪导致某些定制类颜色异常，人工抽查编队网格/攻坚卡片）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/dnf.css
git commit -m "ref: dnf.css 裁剪已替换类与库重复变量"
```

### Task 4.3: 最终门禁 + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`（Unreleased 新增条目）

- [ ] **Step 1: 全量验证**

Run: `cd frontend && npm run build && npx vitest run`；再跑后端测试确认无影响：`cd ../backend && .venv/bin/python -m pytest -q`

- [ ] **Step 2: 人工全流程抽查**

`npm run dev`：登录 → 攻坚列表 → 创建攻坚（datetime-local）→ 详情 → 报名 → 编队 → 管理页 → 会议投票，逐个过一遍，确认无 naive 残留视觉、无 JS 报错。

- [ ] **Step 3: CHANGELOG**

`CHANGELOG.md` 的 Unreleased 新增：**UI 全面升级 @dnftools/ui**——以 DNF 游戏贴图组件库替换 naive-ui 与自绘样式（全量迁移、只留暗色、分阶段落地）。

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 记录 @dnftools/ui 全面升级"
```
