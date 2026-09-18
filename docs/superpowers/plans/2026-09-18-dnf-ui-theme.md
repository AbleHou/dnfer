# DNF 鎏金风 UI 改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Naive UI（深色主题 + themeOverrides）+ 一层定制 CSS 装饰类，把全站（登录/注册、攻坚列表、排表详情、我的角色、管理）改造成经典阿拉德 · 鎏金复古风格，并适配移动端。

**Architecture:** 前端纯改造，不动后端与数据语义。设计系统落在一个 `dnf.css`（CSS 变量 + `.dnf-*` 装饰类 + 响应式断点）与一个 `theme.ts`（Naive `darkTheme` + `themeOverrides`）。Naive 负责复杂交互组件（Select/DatePicker/Modal/Dropdown/Message/Dialog），`dnf.css` 负责品牌面层（面板/按钮/小队配色/表格）。`alert`/`confirm` 收敛到一个 `notify.ts`（Naive discrete API 封装），便于测试 mock。

**Tech Stack:** Vue 3 · TypeScript · Vite · Pinia · Naive UI v2。工作目录 `/Users/able/toys/dnfer`，前端在 `frontend/`。

**依赖约束：** 只新增 `naive-ui`（不用 `@vicons`——用 Unicode 字形，减少依赖面；不用 unplugin 自动导入——组件显式 import，不动 `vite.config.ts`）。

**Vue 约定：** 遵循 @superpowers 的 vue-best-practices——全部 `<script setup>` + Composition API（现状已如此，保持）。

**提交纪律：** 每个 task 结束后仓库处于可构建状态（绿树）才提交。涉及 `colors.ts` 删导出的改动与唯一消费者 WaveSection 必须**同一次提交**（见 Task 4）。

---

## File Structure

**新增：**
- `frontend/src/styles/dnf.css` — 全局设计系统：CSS 变量、背景、字体、`.dnf-*` 装饰类、小队色变体、响应式断点
- `frontend/src/styles/theme.ts` — 导出 `darkTheme` 与 `themeOverrides`（DNF 金褐色板对齐 dnf.css）
- `frontend/src/lib/notify.ts` — `notifyError` / `notifyWarning` / `notifySuccess` / `confirmDialog`（Naive discrete API）

**修改：**
- `frontend/package.json` / `package-lock.json` — 加 `naive-ui`
- `frontend/src/main.ts` — 引入 `./styles/dnf.css`
- `frontend/src/App.vue` — `NConfigProvider` 包裹 + 顶导航重写（含移动端汉堡菜单）
- `frontend/src/lib/colors.ts` — 只保留 `SQUAD_NAMES`，删 `SQUAD_COLORS`/`SQUAD_LIGHT`（随 WaveSection 一并提交）
- `frontend/src/components/DutySelect.vue` — 原生 `<select>` → `NSelect`
- `frontend/src/components/SlotCell.vue` — `<td>` → 小队 tint 卡片 `<div>`（接收 `squadIndex`）
- `frontend/src/components/WaveSection.vue` — `<table>` → CSS Grid，按小队数动态列数
- `frontend/src/components/CharacterPickerModal.vue` — 手写 modal → `NModal`；本地 `confirm()` → `confirmPick()`
- `frontend/src/views/RaidDetailView.vue` — 头部按钮/徽章 + alert/confirm/notice → notify
- `frontend/src/views/LoginView.vue`、`RegisterView.vue` — 居中鎏金卡片 + Naive 表单控件
- `frontend/src/views/RaidListView.vue` — 卡片列表 + Naive 创建表单 + confirmDialog
- `frontend/src/views/RaidListView.spec.ts` — 重写（Naive 组件 + mock notify）
- `frontend/src/views/MyCharactersView.vue` — 卡片化 + dnf 类；表单保持原生 input（保留测试依赖的 `#char-*` id 与 `data-*`）
- `frontend/src/views/AdminView.vue` — 分区面板 + 样式化表格 + confirmDialog

**不做：** 后端零改动、无迁移、无路由改动；`index.html` 不改。

---

## Task 1: 依赖 + 全局主题骨架（theme.ts / dnf.css / main.ts / App.vue）

**Files:**
- Modify: `frontend/package.json`（deps）
- Create: `frontend/src/styles/theme.ts`
- Create: `frontend/src/styles/dnf.css`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: 安装依赖**

```bash
cd /Users/able/toys/dnfer/frontend && npm install naive-ui
```

预期：`package.json` 的 `dependencies` 出现 `"naive-ui": "^2.x"`。

- [ ] **Step 2: 创建 `frontend/src/styles/theme.ts`**

```ts
import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme } from 'naive-ui'

export const themeOverrides: GlobalThemeOverrides = {
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
export { darkTheme }
```

- [ ] **Step 3: 创建 `frontend/src/styles/dnf.css`（完整设计系统，一次写完）**

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
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: radial-gradient(1200px 600px at 70% -10%, #2b2114 0%, var(--dnf-bg) 55%) fixed;
  background-color: var(--dnf-bg);
  color: var(--dnf-text);
  font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}
h1, h2, h3 {
  font-family: "Noto Serif SC", "Songti SC", "STSong", Georgia, serif;
  color: var(--dnf-gold-hi);
  letter-spacing: 1px;
}
a { color: var(--dnf-gold-hi); }

.dnf-title {
  font-family: "Noto Serif SC", "Songti SC", "STSong", Georgia, serif;
  color: var(--dnf-gold-hi);
  letter-spacing: 2px;
}
.dnf-panel {
  border: 2px solid var(--dnf-gold);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--dnf-panel-inner), var(--dnf-panel));
  box-shadow: inset 0 0 0 1px var(--dnf-gold-deep), 0 4px 12px rgba(0, 0, 0, .5);
}
.dnf-divider {
  height: 1px; border: none; margin: 14px 0;
  background: linear-gradient(90deg, transparent, var(--dnf-gold), transparent);
}

/* 按钮：品牌面层用 dnf-btn，复杂交互控件用 Naive */
.dnf-btn {
  border-radius: 6px; font-weight: bold; cursor: pointer;
  border: 2px solid var(--dnf-gold-deep);
  background: linear-gradient(#4a3a18, #2b2114);
  color: var(--dnf-gold-hi); padding: 6px 16px;
}
.dnf-btn:hover { filter: brightness(1.15); }
.dnf-btn:disabled { opacity: .5; cursor: not-allowed; }
.dnf-btn-primary { background: linear-gradient(#d4a53c, #a1711d); color: #2a1c05; border-color: #6b4d12; }
.dnf-btn-danger { background: linear-gradient(#c0392b, #8e2a20); color: #ffd9c4; border-color: #6b1f18; }
.dnf-btn-sm { padding: 4px 12px; font-size: 13px; }

/* 顶导航 */
.dnf-nav {
  display: flex; align-items: center; gap: 18px;
  padding: 10px 20px; border-bottom: 3px solid var(--dnf-gold);
  background: var(--dnf-panel);
  position: sticky; top: 0; z-index: 10;
}
.dnf-nav .logo {
  font-family: "Noto Serif SC", "Songti SC", serif;
  color: var(--dnf-gold-hi); font-size: 18px; letter-spacing: 3px; text-decoration: none;
}
.dnf-nav a.nav-link { color: var(--dnf-text); text-decoration: none; }
.dnf-nav a.nav-link.router-link-active { color: var(--dnf-gold-hi); }
.dnf-nav .nav-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.dnf-nav .nav-exit { color: var(--dnf-text-muted); text-decoration: none; }
.dnf-nav .nav-exit:hover { color: var(--dnf-gold-hi); }
.dnf-nav .hamburger {
  display: none; background: none; border: 1px solid var(--dnf-gold);
  color: var(--dnf-gold-hi); border-radius: 6px; padding: 4px 10px; font-size: 18px; cursor: pointer;
}

/* 页面容器与排版 */
.dnf-page { max-width: 860px; margin: 24px auto; padding: 0 16px; }
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }

/* 状态徽章 */
.dnf-badge { font-size: 12px; padding: 1px 10px; border-radius: 10px; border: 1px solid; white-space: nowrap; }
.dnf-badge-ok { color: var(--dnf-ok); border-color: var(--dnf-ok); }
.dnf-badge-danger { color: var(--dnf-danger); border-color: var(--dnf-danger); }

/* 原生表单控件（MyCharacters/Admin 的输入框与下拉，保留原生以维持测试 id 可定位） */
.dnf-input, .dnf-select, .dnf-number {
  background: var(--dnf-panel-inner); border: 2px solid var(--dnf-gold-deep);
  color: var(--dnf-text); border-radius: 6px; padding: 7px 10px; font-size: 14px;
}
.dnf-input:focus, .dnf-select:focus, .dnf-number:focus { outline: none; border-color: var(--dnf-gold); }
.form-label { width: 80px; flex-shrink: 0; color: var(--dnf-text-muted); }
.form-error { color: #ff8a80; }

/* 排表小队网格：列数由内容自适应，非写死 */
.squad-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
.squad-col {
  border: 2px solid var(--dnf-gold-deep); border-radius: 10px;
  overflow: hidden; background: var(--dnf-panel-inner);
}
.squad-head { text-align: center; padding: 3px 0; font-size: 13px; letter-spacing: 2px; }
.squad-cells { display: grid; gap: 8px; padding: 8px; }
.squad-0 .squad-head { background: linear-gradient(180deg, #c0392b, #8e2a20); color: #ffd9c4; }
.squad-1 .squad-head { background: linear-gradient(180deg, #b8860b, #7d5c08); color: #fff3d6; }
.squad-2 .squad-head { background: linear-gradient(180deg, #3a6b35, #2a4e26); color: #d8f0cf; }
.squad-3 .squad-head { background: linear-gradient(180deg, #2a5a8a, #1d3f61); color: #d6e8f5; }
.squad-4 .squad-head { background: linear-gradient(180deg, #7a4a8a, #5a3466); color: #f0dcf5; }
.squad-0 .squad-col { border-color: #a12a1e; }
.squad-1 .squad-col { border-color: #96720a; }
.squad-2 .squad-col { border-color: #2f5a29; }
.squad-3 .squad-col { border-color: #244b73; }
.squad-4 .squad-col { border-color: #5d3a6b; }

/* 格子（SlotCell） */
.slot-cell {
  border-radius: 8px; border: 1px solid var(--dnf-gold-deep);
  background: var(--dnf-panel); padding: 8px; min-height: 58px;
  display: flex; align-items: center; justify-content: center;
}
.squad-0 .slot-cell { background: #2b1a16; }
.squad-1 .slot-cell { background: #2b2212; }
.squad-2 .slot-cell { background: #182317; }
.squad-3 .slot-cell { background: #16202c; }
.squad-4 .slot-cell { background: #231a2b; }
.slot-cell.occupied { text-align: left; display: block; }
.slot-cell.pickable { cursor: pointer; color: var(--dnf-text-faint); }
.slot-cell.pickable:hover { border-color: var(--dnf-gold-hi); }
.slot-cell.empty { color: #4a3d28; }
.pick-btn { border: none; background: transparent; color: var(--dnf-text-faint); cursor: pointer; font-size: 14px; }
.pick-btn:hover { color: var(--dnf-gold-hi); }

/* 波次面板 */
.wave-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--dnf-gold-deep);
}
.wave-delete { color: var(--dnf-danger); font-size: 12px; text-decoration: none; }

/* 攻坚列表 */
.raid-card { display: flex; align-items: center; gap: 16px; padding: 12px 16px; margin-bottom: 10px; flex-wrap: wrap; }
.raid-name { color: var(--dnf-gold-hi); font-weight: bold; font-size: 16px; text-decoration: none; font-family: serif; }
.raid-meta { color: var(--dnf-text-muted); font-size: 13px; }
.create-form { padding: 16px; margin: 12px 0; }

/* 角色选择弹窗 */
.char-pick {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--dnf-gold-deep); border-radius: 8px;
  padding: 10px; margin: 6px 0; cursor: pointer; background: var(--dnf-panel);
}
.char-pick:hover { border-color: var(--dnf-gold); }
.char-pick.active { outline: 2px solid var(--dnf-gold-hi); }

/* 职业选择按钮（MyCharacters） */
.job-pick-btn {
  background: var(--dnf-panel); border: 2px solid var(--dnf-gold-deep);
  border-radius: 8px; padding: 8px; cursor: pointer; color: var(--dnf-text);
  font-family: serif; font-size: 11px;
}
.job-pick-btn:hover { border-color: var(--dnf-gold); }
.job-pick-btn.active { outline: 2px solid var(--dnf-gold-hi); }

/* 管理页表格 */
.dnf-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.dnf-table th { text-align: left; color: var(--dnf-gold-hi); border-bottom: 2px solid var(--dnf-gold-deep); padding: 8px; font-family: serif; }
.dnf-table td { padding: 8px; border-bottom: 1px solid var(--dnf-gold-deep); color: var(--dnf-text); }
.dnf-section { padding: 16px; margin: 16px 0; }

/* 登录/注册 */
.auth-wrap { max-width: 360px; margin: 64px auto; padding: 0 16px; }
.auth-card { padding: 28px; }

/* 移动端 */
@media (max-width: 767px) {
  .dnf-nav a.nav-link { display: none; }
  .dnf-nav .nav-username { display: none; }
  .dnf-nav .hamburger { display: block; }
  .dnf-page { margin: 16px auto; }
}
```

- [ ] **Step 4: 更新 `frontend/src/main.ts`** 引入样式

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/dnf.css'

createApp(App).use(createPinia()).use(router).mount('#app')
```

- [ ] **Step 5: 重写 `frontend/src/App.vue`**（NConfigProvider + 顶导航 + 汉堡菜单）

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NConfigProvider, NDropdown, darkTheme, type DropdownMixedOption } from 'naive-ui'
import { useAuthStore } from './stores/auth'
import { themeOverrides } from './styles/theme'

const auth = useAuthStore()
const router = useRouter()

const menuOptions = computed<DropdownMixedOption[]>(() => [
  { label: '攻坚列表', key: 'raids' },
  { label: '我的角色', key: 'characters' },
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
  const path = ({ raids: '/', characters: '/characters', admin: '/admin' } as Record<string, string>)[key]
  if (path) router.push(path)
}
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <nav v-if="auth.user" class="dnf-nav">
      <router-link to="/" class="logo">阿拉德远征</router-link>
      <router-link to="/" class="nav-link">攻坚列表</router-link>
      <router-link to="/characters" class="nav-link">我的角色</router-link>
      <router-link v-if="auth.isAdmin" to="/admin" class="nav-link">管理</router-link>
      <span class="nav-right">
        <span class="nav-username">{{ auth.user.nickname }}</span>
        <a href="#" class="nav-exit" @click.prevent="logout">退出</a>
        <n-dropdown :options="menuOptions" @select="onMenuSelect">
          <button class="hamburger" aria-label="菜单">☰</button>
        </n-dropdown>
      </span>
    </nav>
    <router-view :key="$route.fullPath" />
  </n-config-provider>
</template>
```

> 若 `DropdownMixedOption` 类型在你的 naive-ui 版本不可用，回退为 `any[]`（仅一处，非阻断）。

- [ ] **Step 6: 验证构建**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
预期：vue-tsc 通过、vite 构建成功，无 TS 报错。

- [ ] **Step 7: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/package.json frontend/package-lock.json frontend/src/main.ts frontend/src/App.vue frontend/src/styles
git commit -m "$(cat <<'EOF'
[fet] 引入 Naive UI 并搭建 DNF 鎏金主题骨架

- theme.ts：darkTheme + themeOverrides 定 DNF 金褐色板
- dnf.css：设计系统（变量/装饰类/小队色/响应式断点）
- App.vue：NConfigProvider + 顶导航 + 移动端汉堡菜单

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: notify 封装

**Files:**
- Create: `frontend/src/lib/notify.ts`

- [ ] **Step 1: 创建 `frontend/src/lib/notify.ts`**

```ts
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
```

- [ ] **Step 2: 验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build && npm run test`
预期：构建与测试全绿（新文件尚未被引用，不影响现有代码）。

- [ ] **Step 3: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/lib/notify.ts
git commit -m "$(cat <<'EOF'
[fet] 新增 notify 封装（Naive discrete dialog/message）供全站替换 alert/confirm

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: DutySelect 改 NSelect

**Files:**
- Modify: `frontend/src/components/DutySelect.vue`

- [ ] **Step 1: 重写 `DutySelect.vue`**（原生 select → NSelect）

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import { dutyOptions } from '../lib/duty'
import type { ClassType, Duty } from '../types'

const props = defineProps<{ classType: ClassType; modelValue: Duty | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Duty): void }>()

const options = computed(() => dutyOptions(props.classType).map(v => ({ label: v, value: v })))
</script>

<template>
  <n-select size="small" :options="options" :value="modelValue"
            @update:value="(v) => emit('update:modelValue', v as Duty)" />
</template>
```

- [ ] **Step 2: 验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build && npm run test`
预期：构建与测试全绿（调用方 SlotCell 只透传 props，行为不变）。

- [ ] **Step 3: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/components/DutySelect.vue
git commit -m "$(cat <<'EOF'
[fet] 职责下拉改 NSelect

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SlotCell + WaveSection 改 Grid + colors.ts 清理（合并提交，保证绿树）

**Files:**
- Modify: `frontend/src/components/SlotCell.vue`
- Modify: `frontend/src/components/WaveSection.vue`
- Modify: `frontend/src/lib/colors.ts`

> `SQUAD_COLORS`/`SQUAD_LIGHT` 唯一消费者是 WaveSection，必须在 WaveSection 改完的同一次提交里删除，否则构建红。三者一起改、一起提交。

- [ ] **Step 1: 重写 `SlotCell.vue`**（td → div 卡片，接收 `squadIndex`）

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Slot } from '../types'
import DutySelect from './DutySelect.vue'

const props = defineProps<{
  slot: Slot
  squadIndex: number
  editable: boolean
  pickable: boolean
}>()
const emit = defineEmits<{
  (e: 'pick', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'remove', slot: Slot): void
}>()

const occupied = computed(() => props.slot.character_id != null)
const attrs = computed(() => {
  const s = props.slot
  if (s.character_class === '输出') return `模拟 ${fmtDps(s.simulated_damage)} · 秒伤 ${fmtDps(s.sustained_dps)}`
  if (s.character_class === '辅助') return `增益 ${fmtBuff(s.buff_amount)}`
  return ''
})
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <div class="slot-cell" :class="[
    { occupied, pickable, empty: !occupied && !pickable },
    `squad-${squadIndex}`,
  ]">
    <template v-if="occupied">
      <div>
        <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
        <span style="color:var(--dnf-text-muted);font-size:12px">（{{ slot.character_name }}）</span>
        <img v-if="slot.job_name" :src="jobIcon(slot.job_name)" @error="onIconError"
             style="width:20px;height:20px;margin-left:6px;vertical-align:middle">
        <span v-if="slot.job_title" style="color:var(--dnf-text-muted);font-size:12px;margin-left:6px">{{ slot.job_title }}</span>
        <DutySelect v-if="editable" :class-type="slot.character_class!" :model-value="slot.duty"
                    @update:model-value="(d) => emit('duty', slot, d)" />
        <span v-else class="dnf-badge" style="font-size:11px;color:var(--dnf-gold-hi);border-color:var(--dnf-gold-deep)">{{ slot.duty }}</span>
      </div>
      <div style="color:var(--dnf-text-faint);font-size:12px;margin-top:2px">
        {{ attrs }}
        <a v-if="editable" href="#" style="margin-left:8px;color:var(--dnf-danger)"
           @click.prevent="emit('remove', slot)">撤下</a>
      </div>
    </template>
    <button v-else-if="pickable" class="pick-btn" @click="emit('pick', slot)">＋ 点击占位</button>
    <span v-else>—</span>
  </div>
</template>
```

- [ ] **Step 2: 重写 `WaveSection.vue`**（表格 → CSS Grid，按小队数动态列，计数移入队头）

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Wave } from '../types'
import SlotCell from './SlotCell.vue'
import { SQUAD_NAMES } from '../lib/colors'

const props = defineProps<{
  wave: Wave
  editable: boolean
  isAdmin: boolean
  canDelete: boolean
  currentUserId: number | null
}>()
const emit = defineEmits<{
  (e: 'pick', slot: any): void
  (e: 'duty', slot: any, duty: string): void
  (e: 'remove', slot: any): void
  (e: 'deleteWave', index: number): void
}>()

const squads = computed(() => {
  const n = Math.max(...props.wave.slots.map(s => s.squad_index)) + 1
  return Array.from({ length: n }, (_, sq) => props.wave.slots.filter(s => s.squad_index === sq))
})
const counts = computed(() =>
  squads.value.map(g => ({ filled: g.filter(s => s.character_id != null).length, total: g.length })))
</script>

<template>
  <div class="dnf-panel" style="margin:20px 0;padding:14px">
    <div class="wave-head">
      <b class="dnf-title">第 {{ wave.index }} 波</b>
      <a v-if="canDelete" href="#" class="wave-delete" @click.prevent="emit('deleteWave', wave.index)">删除本波</a>
    </div>
    <div class="squad-grid">
      <div v-for="(g, i) in squads" :key="i" class="squad-col" :class="'squad-' + i">
        <div class="squad-head">{{ SQUAD_NAMES[i] }} · {{ counts[i].filled }}/{{ counts[i].total }}</div>
        <div class="squad-cells">
          <SlotCell v-for="slot in g" :key="slot.id" :slot="slot" :squad-index="i"
                    :editable="editable && (isAdmin || slot.owner_id === currentUserId)"
                    :pickable="editable && slot.character_id == null"
                    @pick="emit('pick', $event)" @duty="(s, d) => emit('duty', s, d)"
                    @remove="emit('remove', $event)" />
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 清理 `frontend/src/lib/colors.ts`** 只留队名

```ts
export const SQUAD_NAMES = ['红队', '黄队', '绿队', '蓝队', '紫队']
```

（`SQUAD_COLORS`/`SQUAD_LIGHT` 已无引用，颜色由 `dnf.css` 的 `.squad-*` 类承担。）

- [ ] **Step 4: 统一验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build && npm run test`
预期：构建通过；现有测试全部通过。

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/components/SlotCell.vue frontend/src/components/WaveSection.vue frontend/src/lib/colors.ts
git commit -m "$(cat <<'EOF'
[fet] 排表波次改 CSS Grid（按小队数动态列），格子改小队 tint 卡片；colors 收敛为队名

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: RaidDetailView 接入 notify + 鎏金化

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`

- [ ] **Step 1: script 部分改动**

- 新增 import：`import { confirmDialog, notifyError, notifyWarning } from '../lib/notify'`
- **删除** `notice` ref 及其赋值（统一走 notify 消息，不再保留内联提示条）
- `onSelectCharacter` 的收尾改为：

```ts
async function onSelectCharacter(c: Character, duty: Duty) {
  if (!pickSlot.value) return
  try {
    const r = await api.post<{ slot: Slot; warnings: string[]; removed_slots?: Slot[] }>(
      `/api/raids/${rid}/slots/${pickSlot.value.id}/fill`,
      { character_id: c.id, duty, replace: true })
    const moved = r.removed_slots?.length ? '已替换原占位角色' : ''
    const msg = r.warnings.length ? r.warnings.join('；') + (moved ? '，' + moved : '') : moved
    if (r.warnings.length) notifyWarning(msg)
    else if (moved) notifySuccess(moved)
  } catch (e: any) { notifyError(e.message) }
  pickSlot.value = null
  await load()
}
```

- `onDuty`/`onRemove`/`onAddWave`/`onToggleLock` 的 `alert(e.message)` → `notifyError(e.message)`
- `onDeleteWave`：

```ts
async function onDeleteWave(index: number) {
  const ok = await confirmDialog({ content: `确认删除第 ${index} 波？` })
  if (!ok) return
  try { await api.del(`/api/raids/${rid}/waves/${index}`) } catch (e: any) { notifyError(e.message) }
  await load()
}
```

- [ ] **Step 2: template 部分改动**

```vue
<template>
  <div v-if="store.raid" class="dnf-page">
    <div class="page-head" style="flex-wrap:wrap;gap:10px">
      <h2 style="margin:0">{{ store.raid.name }}</h2>
      <span style="color:var(--dnf-text-muted)">{{ store.raid.dungeon_name }}</span>
      <span style="color:var(--dnf-text-faint)">{{ store.raid.size }} 人 · {{ formatDateTime(store.raid.starts_at) }}</span>
      <span class="dnf-badge" :class="store.raid.locked ? 'dnf-badge-danger' : 'dnf-badge-ok'">
        {{ store.raid.locked ? '已锁定' : '未锁定' }}
      </span>
      <span style="margin-left:auto;display:flex;gap:8px">
        <button v-if="auth.isAdmin" class="dnf-btn" @click="onToggleLock">{{ store.raid.locked ? '解锁' : '锁定' }}</button>
        <button v-if="editable" class="dnf-btn dnf-btn-primary" @click="onAddWave">＋ 添加一波</button>
      </span>
    </div>

    <WaveSection v-for="w in store.raid.waves" :key="w.id"
                 :wave="w" :editable="editable" :is-admin="auth.isAdmin"
                 :can-delete="auth.isAdmin || (store.raid.waves.length > 1)"
                 :current-user-id="auth.user?.id ?? null"
                 @pick="onPick" @duty="onDuty" @remove="onRemove"
                 @delete-wave="onDeleteWave" />

    <CharacterPickerModal :open="pickSlot != null" @close="pickSlot = null"
                          @select="onSelectCharacter" />
  </div>
</template>
```

> 注意删除原模板中的 `<p v-if="notice" ...>` 提示条。

- [ ] **Step 3: 验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build && npm run test`
预期：构建与测试全绿。

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/views/RaidDetailView.vue
git commit -m "$(cat <<'EOF'
[fet] 排表详情页头部鎏金化，alert/confirm/notice 统一接入 notify

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CharacterPickerModal 改 NModal

**Files:**
- Modify: `frontend/src/components/CharacterPickerModal.vue`

- [ ] **Step 1: 重写 `CharacterPickerModal.vue`**（手写 modal → NModal；本地 `confirm()` → `confirmPick()`）

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { NModal, NSelect } from 'naive-ui'
import { api } from '../api/client'
import { defaultDuty, dutyOptions } from '../lib/duty'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character, Duty } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', c: Character, duty: Duty): void }>()
const characters = ref<Character[]>([])
const selected = ref<Character | null>(null)
const duty = ref<Duty>('主C')
onMounted(async () => { characters.value = await api.get<Character[]>('/api/me/characters') })

function choose(c: Character) {
  selected.value = c
  duty.value = defaultDuty(c.class_type)
}
function confirmPick() { if (selected.value) emit('select', selected.value, duty.value) }
const options = computed(() =>
  selected.value ? dutyOptions(selected.value.class_type).map(v => ({ label: v, value: v })) : [])
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <n-modal :show="open" preset="card" title="选择角色" style="width:min(420px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <div v-for="c in characters" :key="c.id" class="char-pick"
           :class="{ active: selected?.id === c.id }" @click="choose(c)">
        <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:28px;height:28px;margin-right:8px">
        <div>
          <b>{{ c.name }}</b>
          <span style="color:var(--dnf-text-muted);font-size:12px">{{ c.job_title }} · {{ c.class_type }} · 名望 {{ c.fame }}</span>
          <div style="color:var(--dnf-text-faint);font-size:12px">
            {{ c.class_type === '输出' ? `模拟 ${fmtDps(c.simulated_damage)} · 秒伤 ${fmtDps(c.sustained_dps)}` : `增益 ${fmtBuff(c.buff_amount)}` }}
          </div>
        </div>
      </div>
      <p v-if="!characters.length" style="color:var(--dnf-text-faint)">还没有角色，去「我的角色」添加</p>
      <div v-if="selected" style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <span>职责：</span>
        <n-select size="small" style="flex:1" :options="options" v-model:value="duty" />
      </div>
    </div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="dnf-btn" @click="emit('close')">关闭</button>
        <button v-if="selected" class="dnf-btn dnf-btn-primary" @click="confirmPick">确定</button>
      </div>
    </template>
  </n-modal>
</template>
```

- [ ] **Step 2: 验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build && npm run test`
预期：构建通过，测试通过。

- [ ] **Step 3: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/components/CharacterPickerModal.vue
git commit -m "$(cat <<'EOF'
[fet] 角色选择弹窗改 NModal，本地 confirm 方法更名 confirmPick 避免误替换

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 登录/注册页

**Files:**
- Modify: `frontend/src/views/LoginView.vue`
- Modify: `frontend/src/views/RegisterView.vue`

- [ ] **Step 1: 重写 `LoginView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, NButton } from 'naive-ui'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true; error.value = ''
  try { await auth.login(username.value, password.value); router.push('/') }
  catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div class="auth-wrap">
    <div class="dnf-panel auth-card">
      <h2 style="margin-top:0">登录</h2>
      <form @submit.prevent="submit">
        <div style="margin:10px 0"><n-input v-model:value="username" placeholder="账号" /></div>
        <div style="margin:10px 0"><n-input v-model:value="password" type="password" placeholder="密码" /></div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <n-button type="primary" attr-type="submit" block :loading="loading">登录</n-button>
      </form>
      <p style="margin-top:12px">还没有账号？<router-link to="/register">凭注册码注册</router-link></p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 重写 `RegisterView.vue`**（同结构：账号/密码/群昵称/注册码 四个 `NInput` + 提交）

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, NButton } from 'naive-ui'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const nickname = ref('')
const code = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true; error.value = ''
  try {
    await auth.register({ username: username.value, password: password.value,
                          nickname: nickname.value, code: code.value })
    router.push('/')
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div class="auth-wrap">
    <div class="dnf-panel auth-card">
      <h2 style="margin-top:0">注册</h2>
      <form @submit.prevent="submit">
        <div style="margin:10px 0"><n-input v-model:value="username" placeholder="账号（登录用）" /></div>
        <div style="margin:10px 0"><n-input v-model:value="password" type="password" placeholder="密码（≥6位）" /></div>
        <div style="margin:10px 0"><n-input v-model:value="nickname" placeholder="群昵称" /></div>
        <div style="margin:10px 0"><n-input v-model:value="code" placeholder="注册码" /></div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <n-button type="primary" attr-type="submit" block :loading="loading">注册</n-button>
      </form>
      <p style="margin-top:12px">已有账号？<router-link to="/login">登录</router-link></p>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build && npm run test`
预期：构建通过，测试通过。

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/views/LoginView.vue frontend/src/views/RegisterView.vue
git commit -m "$(cat <<'EOF'
[fet] 登录/注册页改鎏金面板卡片 + Naive 表单控件

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: RaidListView + 测试重写（TDD）

**Files:**
- Modify: `frontend/src/views/RaidListView.vue`
- Modify: `frontend/src/views/RaidListView.spec.ts`

> 参考 @superpowers:test-driven-development：先改测试（红），再实现（绿）。

- [ ] **Step 1: 先重写 `RaidListView.spec.ts`**（Naive 组件 + mock notify）

```ts
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RaidListView from './RaidListView.vue'
import { useAuthStore } from '../stores/auth'
import type { Dungeon, RaidListItem } from '../types'

const { apiMock, confirmDialogMock, notifyErrorMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  confirmDialogMock: vi.fn(async () => true),
  notifyErrorMock: vi.fn(),
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}))
vi.mock('../lib/notify', () => ({
  confirmDialog: confirmDialogMock,
  notifyError: notifyErrorMock,
  notifyWarning: vi.fn(),
  notifySuccess: vi.fn(),
}))

const dungeons: Dungeon[] = [{ id: 7, name: '巴卡尔', size: 16, description: '', created_at: '' }]
const raid: RaidListItem = { id: 3, name: '巴卡尔', dungeon_id: 7, dungeon_name: '巴卡尔',
  size: 16, locked: false, starts_at: '2026-09-20T14:00:00', wave_count: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  confirmDialogMock.mockResolvedValue(true)
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/raids') return [] as RaidListItem[]
    if (url === '/api/dungeons') return dungeons
    return []
  })
})

describe('RaidListView create form', () => {
  it('selecting a dungeon auto-fills name and shows locked size', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true }

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    await wrapper.find('[data-test="create-toggle"]').trigger('click')
    await wrapper.findComponent({ name: 'NSelect' }).vm.$emit('update:value', 7)
    await flushPromises()

    expect(wrapper.findComponent({ name: 'NInput' }).props('value')).toBe('巴卡尔')
    expect(wrapper.text()).toContain('规模锁定：16 人')
  })

  it('does not fetch dungeons for non-admin members', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false }

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    expect(apiMock.get).not.toHaveBeenCalledWith('/api/dungeons')
  })

  it('admin can delete a raid after confirming', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/dungeons') return dungeons
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    const delBtn = wrapper.findAll('button').find(b => b.text().includes('删除'))
    expect(delBtn).toBeTruthy()
    await delBtn!.trigger('click')
    await flushPromises()
    expect(confirmDialogMock).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/raids/3')
  })

  it('cancel keeps the raid', async () => {
    confirmDialogMock.mockResolvedValue(false)
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      if (url === '/api/dungeons') return dungeons
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('删除'))!.trigger('click')
    await flushPromises()
    expect(apiMock.del).not.toHaveBeenCalled()
  })

  it('does not show delete button for non-admin', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids') return [raid] as RaidListItem[]
      return []
    })

    const wrapper = mount(RaidListView, { global: { plugins: [pinia], stubs: ['router-link'] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('删除')
  })
})
```

- [ ] **Step 2: 跑测试确认失败（红）**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidListView.spec.ts`
预期：FAIL —— 组件尚未改造（`data-test="create-toggle"` 不存在、无 `NSelect`/`NInput` 等）。

- [ ] **Step 3: 重写 `RaidListView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NSelect, NDatePicker, NInput } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { formatDateTime } from '../utils/datetime'
import { confirmDialog, notifyError } from '../lib/notify'
import type { Dungeon, RaidListItem } from '../types'

const auth = useAuthStore()
const raids = ref<RaidListItem[]>([])
const showCreate = ref(false)
const name = ref('')
const dungeonId = ref<number | null>(null)
const startsAt = ref<string>('')
const dungeons = ref<Dungeon[]>([])
const sizeLocked = ref<number | null>(null)
const error = ref('')
const creating = ref(false)

const dungeonOptions = computed(() =>
  dungeons.value.map(d => ({ label: `${d.name}（${d.size} 人）`, value: d.id })))

async function load() {
  raids.value = await api.get<RaidListItem[]>('/api/raids')
  if (auth.isAdmin) dungeons.value = await api.get<Dungeon[]>('/api/dungeons')
}
onMounted(load)

function onDungeonChange(v: number | null) {
  dungeonId.value = v
  const d = dungeons.value.find(x => x.id === dungeonId.value)
  sizeLocked.value = d ? d.size : null
  if (d && !name.value) name.value = d.name
}

async function create() {
  if (!dungeonId.value || !startsAt.value) {
    error.value = '请选择副本并填写发起时间'; return
  }
  creating.value = true; error.value = ''
  try {
    await api.post('/api/raids', {
      name: name.value || undefined,
      dungeon_id: dungeonId.value,
      starts_at: startsAt.value,
    })
    showCreate.value = false; name.value = ''; dungeonId.value = null
    startsAt.value = ''; sizeLocked.value = null
    await load()
  } catch (e: any) { error.value = e.message }
  finally { creating.value = false }
}

async function onDelete(r: RaidListItem) {
  const ok = await confirmDialog({ content: `确认删除攻坚「${r.name}」？该操作不可恢复` })
  if (!ok) return
  try { await api.del(`/api/raids/${r.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
</script>

<template>
  <div class="dnf-page">
    <div class="page-head">
      <h2 style="margin:0">攻坚列表</h2>
      <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-primary" data-test="create-toggle"
              @click="showCreate = !showCreate">＋ 发起攻坚</button>
    </div>

    <div v-if="showCreate" class="dnf-panel create-form">
      <div style="margin:8px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <n-select data-test="dungeon-select" style="flex:1;min-width:220px"
                  :options="dungeonOptions" placeholder="选择副本" @update:value="onDungeonChange" />
        <span v-if="sizeLocked" style="color:var(--dnf-text-muted)">规模锁定：{{ sizeLocked }} 人</span>
      </div>
      <div style="margin:8px 0">
        <n-date-picker data-test="starts-at" type="datetime" value-format="yyyy-MM-ddTHH:mm:ss"
                       :actions="null" clearable placeholder="发起时间" v-model:value="startsAt" />
      </div>
      <div style="margin:8px 0">
        <n-input data-test="name-input" v-model:value="name" placeholder="攻坚名称（默认副本名）" />
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-test="create-submit" :disabled="creating" @click="create">
        {{ creating ? '创建中…' : '创建' }}
      </button>
    </div>

    <div v-for="r in raids" :key="r.id" class="dnf-panel raid-card">
      <router-link :to="`/raids/${r.id}`" class="raid-name">{{ r.name }}</router-link>
      <span class="raid-meta">{{ r.dungeon_name }} · {{ r.size }} 人 · {{ r.wave_count }} 波 · {{ formatDateTime(r.starts_at) }}</span>
      <span class="dnf-badge" :class="r.locked ? 'dnf-badge-danger' : 'dnf-badge-ok'">
        {{ r.locked ? '已锁定' : '未锁定' }}
      </span>
      <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-sm" style="margin-left:auto" @click="onDelete(r)">删除</button>
    </div>
    <p v-if="!raids.length" style="color:var(--dnf-text-faint)">还没有攻坚，管理员可点击「＋ 发起攻坚」</p>
  </div>
</template>
```

- [ ] **Step 4: 跑测试确认通过（绿）**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidListView.spec.ts`
预期：PASS 全部用例。

> jsdom 兜底：项目无 vitest `setupFiles`。若 Naive 组件挂载报 `ResizeObserver is not defined`，在 `vite.config.ts` 的 `test` 加 `setupFiles: ['src/test-setup.ts']`，并新建：

```ts
// src/test-setup.ts
export default {}
class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
;(globalThis as any).ResizeObserver = ResizeObserver
```

（本测试不打开下拉/日期面板，通常不会触发；仅作兜底记录。）

- [ ] **Step 5: 全量验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run test && npm run build`
预期：全部测试通过、构建通过。

- [ ] **Step 6: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/views/RaidListView.vue frontend/src/views/RaidListView.spec.ts
git commit -m "$(cat <<'EOF'
[fet] 攻坚列表鎏金化（Naive 创建表单 + 确认对话框），测试重写适配组件化

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: MyCharactersView 卡片化

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`

> 关键约束：**保留** 测试依赖的定位点——`button[data-cat]`、`button[data-job]`、`button[data-act="save"]`、`#char-name` / `#char-fame` / `#char-damage` / `#char-dps` / `#char-buff`（原生 input，样式走 `.dnf-input`）、文案「添加角色 / 编辑 / 删除 / 已选：… / 请选择职业 / 模拟伤害 / 增益量」、以及模板中第一个 button 仍是「＋ 添加角色」。

- [ ] **Step 1: script 部分改动**

- 新增 import：`import { confirmDialog, notifyError } from '../lib/notify'`
- `remove()`：

```ts
async function remove(c: Character) {
  const ok = await confirmDialog({ content: `删除角色 ${c.name}？` })
  if (!ok) return
  try { await api.del(`/api/me/characters/${c.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
```

- [ ] **Step 2: template 部分改动**（逻辑/结构不变，只换类与样式）

- 根容器：`<div style="max-width:600px;margin:24px auto">` → `<div class="dnf-page" style="max-width:640px">`
- 标题行：`.page-head`；「＋ 添加角色」按钮 `class="dnf-btn dnf-btn-primary"`（保持为模板第一个 button）
- 角色卡片：`<div v-for="c in list" ... style="border:1px solid #eee;...">` → `class="dnf-panel" style="padding:12px;margin:10px 0;display:flex;align-items:center;gap:12px"`；内部分行样式替换为 `var(--dnf-*)` 变量色
- 「编辑」按钮 `class="dnf-btn dnf-btn-sm"`；「删除」`class="dnf-btn dnf-btn-sm dnf-btn-danger"`
- 职业选择按钮：`class="job-pick-btn"` + `:class="{ active: ... }"`（替换原 `outline` 内联）；保留 `:data-cat`/`:data-job`；图标 img 宽 36 保留
- 表单区：外层 `class="dnf-panel create-form"`；label 用 `class="form-label"`；各 input 加 `class="dnf-input"`（保留 `id`）；保存按钮 `class="dnf-btn dnf-btn-primary"` 保留 `data-act="save"`；取消按钮 `class="dnf-btn"`
- 错误文案 `<p v-if="error" class="form-error">`

- [ ] **Step 3: 验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run test && npm run build`
预期：`MyCharactersView.spec.ts` 全部通过（定位点保留），构建通过。

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/views/MyCharactersView.vue
git commit -m "$(cat <<'EOF'
[fet] 我的角色页卡片化 + 删除确认走 confirmDialog，测试定位点保留

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: AdminView 鎏金化

**Files:**
- Modify: `frontend/src/views/AdminView.vue`

> 决策：注册码/成员/副本三张表用**样式化原生表格**（`.dnf-table`）而非 `NDataTable`——行内编辑/删除按钮更自然、零配置；复杂交互才用 Naive。这是对规格 §4 的刻意简化（YAGNI）。

- [ ] **Step 1: script 部分改动**

- 新增 import：`import { confirmDialog, notifyError } from '../lib/notify'`
- `delDungeon()`：

```ts
async function delDungeon(d: Dungeon) {
  const ok = await confirmDialog({ content: `确认删除副本「${d.name}」？` })
  if (!ok) return
  try { await api.del(`/api/dungeons/${d.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
```

- [ ] **Step 2: template 部分改动**

- 根容器：`<div style="max-width:700px;margin:24px auto">` → `<div class="dnf-page">`
- 三个 `<section>` 各自包 `class="dnf-panel dnf-section"`
- 三张 `<table>` 加 `class="dnf-table"`（表头 th 已被样式化）
- 输入框/下拉加 `class="dnf-input"` / `class="dnf-select"`；label 行 `class="form-label"`
- 按钮：生成 `class="dnf-btn"`；新增/保存 `class="dnf-btn dnf-btn-primary"`；行内编辑/删除 `class="dnf-btn dnf-btn-sm"`（删除加 `dnf-btn-danger`）
- 错误文案 `class="form-error"`

- [ ] **Step 3: 验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build && npm run test`
预期：构建通过，测试通过。

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/views/AdminView.vue
git commit -m "$(cat <<'EOF'
[fet] 管理页鎏金化（分区面板 + 样式化表格 + confirmDialog）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: 最终验证 + 视觉清单

**Files:**
- 可选：`README.md` 技术栈表前端一栏补 `Naive UI`

- [ ] **Step 1: 全量测试与构建**

Run: `cd /Users/able/toys/dnfer/frontend && npm run test && npm run build`
预期：全部通过。

- [ ] **Step 2: 启动本地开发服务做视觉走查**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/uvicorn app.main:app --port 8000`（另一终端）与 `cd /Users/able/toys/dnfer/frontend && npm run dev`

走查清单（对照浏览器）：
- [ ] 登录/注册页：居中鎏金卡片、背景纹理、NInput/NButton 金色主题
- [ ] 攻坚列表：卡片鎏金描边、锁定/未锁定徽章、创建表单（副本 NSelect 自动填名、NDatePicker、名称 NInput）
- [ ] 排表详情：波次面板、红/黄/绿小队色块与计数、格子占位/空位、职责 NSelect、锁定时按钮只读态
- [ ] 我的角色：卡片网格、职业选择按钮 active 态、表单
- [ ] 管理页：三个分区面板、表格金色表头、删除确认弹窗（Naive 金色对话框）
- [ ] 移动端（DevTools 窄屏 <768px）：顶导航收进 ☰ 汉堡菜单、排表小队纵向堆叠
- [ ] 无 JS 报错；`alert()`/`confirm()` 不再出现（已被 notify 取代）

- [ ] **Step 3: （可选）README 技术栈表**

`README.md` 第 23 行前端一栏 `Vue 3 · TypeScript · Vite · Pinia · Vue Router` → 追加 `· Naive UI`。

- [ ] **Step 4: 提交收尾**

```bash
cd /Users/able/toys/dnfer
git add README.md
git commit -m "$(cat <<'EOF'
[docs] README 技术栈补充 Naive UI

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

（README 无改动则跳过本提交。）

---

## 完成标准

- `npm run test` 全绿（含重写后的 `RaidListView.spec.ts`、保留的 `MyCharactersView.spec.ts`）
- `npm run build`（vue-tsc + vite）通过
- 视觉走查清单全部满足；`confirm()`/`alert()` 全站已由 `notify.ts` 取代
- 后端零改动；小队色在暗色主题下清晰可辨；移动端导航与网格自适应
