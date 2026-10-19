# 亮色主题切换（Apple 金）— 设计规格

日期：2026-10-19
状态：已确认
需求来源：用户口述——当前暗黑风截图很酷，但攻坚排表久看眼睛累；想加一版苹果风格（Apple）的明亮主题，保留 DNF 金色品牌感，用户可自由切换。

已确认的决策（头脑风暴结论）：
- **视觉方向**：B「Apple 金」——苹果的结构（白卡片、系统灰底 `#f5f5f7`、`system-ui` 字体、圆角留白），但保留 DNF 金色作为强调色与小队配色；不引入毛玻璃。
- **切换入口**：顶部导航右侧图标按钮（`☾/☀`），一点即切。
- **默认主题**：暗色默认（新用户/未切换用户仍看暗色），个人偏好 localStorage 持久化，不跟账号、不跟随系统。
- **实现路线**：变量集中化——`dnf.css` 的 `:root` 变量作为唯一调色板，亮色用 `[data-theme="light"]` 变量块覆盖；补上缺失的 `--dnf-border`/`--dnf-accent`；新建 composable 统一管理主题状态 + naive-ui 联动。

## 1. 目标

- 新增一套「Apple 金」亮色主题，视觉与现有暗黑风并存，顶栏按钮一键切换。
- 暗色默认、偏好持久化，不破坏现有用户的既有体验。
- naive-ui 组件（按钮/输入框/弹窗/消息/确认框）与自定义 `dnf.css` 面板随主题一起切换。
- 纯前端改动，后端零改动。

**范围**：前端 `composables/useTheme.ts`（新）、`styles/theme.ts`、`styles/dnf.css`、`App.vue`、`lib/notify.ts`、`index.html` + `composables/useTheme.spec.ts`（新）。**不含**：跟随系统深浅色、毛玻璃/材质、主题跟账号跨设备同步、主题切换的逐视图截图回归。

## 2. 主题状态核心：`composables/useTheme.ts`（新）

模块级单例 composable，统一管理主题状态、localStorage 持久化与 naive-ui 联动：

```ts
export type ThemeMode = 'dark' | 'light'

export function useTheme() {
  const theme = ref<ThemeMode>('dark')          // 初始读 localStorage['dnfer-theme']，无则 dark
  const naiveTheme = computed(() => theme.value === 'dark' ? darkTheme : lightTheme)
  const naiveOverrides = computed(() => theme.value === 'dark' ? darkOverrides : lightOverrides)

  function applyTheme(mode: ThemeMode) {
    theme.value = mode
    localStorage.setItem('dnfer-theme', mode)
    document.documentElement.dataset.theme = mode   // 驱动 dnf.css 的 [data-theme="light"] 块
  }
  function toggleTheme() { applyTheme(theme.value === 'dark' ? 'light' : 'dark') }
  // 初始化时同步一次 data-theme，避免首帧与存储不符
}
```

要点：
- **单一事实来源**：`theme` ref 同时驱动 naive 组件（`naiveTheme`/`naiveOverrides`）与自定义 CSS（`data-theme` 属性）。
- **localStorage key**：`dnfer-theme`，值为 `'dark'|'light'`。沿用项目裸 `localStorage` 约定（无 vueuse）。
- **notify.ts 复用同一单例**：discrete API 的 `configProviderProps` 构造为响应式（见 4 节），保证消息/确认框随主题切换。

## 3. naive-ui 主题：`styles/theme.ts` + `App.vue`

- 现有暗色覆写改名为 `darkOverrides`（值不变，避免回归）。
- 新增 `lightOverrides`：naive 组件亮色覆写，Apple 金基调：

```ts
export const lightOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#a8842c',        // 品牌金保留
    primaryColorHover: '#c9a34a',
    primaryColorPressed: '#8a6d26',
    primaryColorSuppl: '#a8842c',
    infoColor: '#a8842c',
    successColor: '#34c759',        // 苹果系
    warningColor: '#ff9500',
    errorColor: '#ff3b30',
    bodyColor: '#f5f5f7',           // 苹果系统灰
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    tableColor: '#ffffff',
    inputColor: '#ffffff',
    inputColorDisabled: '#f2f2f7',
    textColorBase: '#1d1d1f',       // 苹果近黑
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
```

- `App.vue`：`<n-config-provider :theme="naiveTheme" :theme-overrides="naiveOverrides">`（`naiveTheme`/`naiveOverrides` 来自 `useTheme()`）。naive-ui 按需导入不变，新增 `lightTheme` import。
- 亮色下 naive 组件的 `fontFamily` 沿用现有 PingFang/system-ui，不改字体族（`body` 已用同一栈）。

## 4. `lib/notify.ts` 联动

`createDiscreteApi(['message','dialog'])` 的 `configProviderProps` 改为响应式，随主题切换：

- 由模块级 `useTheme()` 的响应式对象驱动（naive-ui 2.45 的 discrete API 支持 `configProviderProps` 传响应式值，主题切换时已创建的消息/确认框同步换色）。
- 若不支持响应式（实现时验证），退路：导出 `refreshDiscreteTheme()`，主题切换时重建 discrete API（module 内重新 `createDiscreteApi`）。以实际行为为准，测试时覆盖「切换后 message/dialog 主题已变」。

## 5. `styles/dnf.css`：变量集中化 + 亮色一套

### 5.1 补全 `:root` 缺失变量

当前 `--dnf-border`/`--dnf-accent` 未在 `:root` 定义，10+ 组件靠 fallback。补上（值取现有 fallback，零行为变化）：

```css
:root {
  /* 现有 12 个变量不动 */
  --dnf-border: #3a3f4b;
  --dnf-accent: #ffd54a;
}
```

### 5.2 `[data-theme="light"]` 变量块

```css
[data-theme="light"] {
  --dnf-bg: #f5f5f7;
  --dnf-panel: #ffffff;
  --dnf-panel-inner: #f2f2f7;
  --dnf-gold: #a8842c;          /* 品牌金加深保证浅底对比度 */
  --dnf-gold-deep: #d9c58a;     /* 浅金边框 */
  --dnf-gold-hi: #8a6d26;       /* 标题金加深 */
  --dnf-text: #1d1d1f;
  --dnf-text-muted: #6e6e73;
  --dnf-text-faint: #86868b;
  --dnf-danger: #e5484d;
  --dnf-ok: #2f7d32;
  --dnf-border: #e5e5ea;
  --dnf-accent: #b8860b;        /* 亮色下的强调金 */
}
```

### 5.3 亮色下的结构覆盖

- `body` 背景：`[data-theme="light"]` 下径向渐变与底色改为浅灰（保留 `radial-gradient(...) fixed` 结构，仅换色值）。
- `.dnf-panel` 阴影：`[data-theme="light"]` 下内描边/外阴影改为浅色柔和阴影（`0 4px 12px rgba(0,0,0,.06)`）。
- `.dnf-btn`/`.dnf-btn-primary`/`.dnf-btn-danger`：亮色下 `linear-gradient` 底色同步浅化（金色渐变保持可读的深字）。
- `.slot-cell` 深色底（5 队）→ 亮色下覆盖为各队浅色底（保留队色辨识）：

```css
[data-theme="light"] .squad-0 .slot-cell { background: #fdf1ef; }
[data-theme="light"] .squad-1 .slot-cell { background: #fdf8ea; }
[data-theme="light"] .squad-2 .slot-cell { background: #f0f7ef; }
[data-theme="light"] .squad-3 .slot-cell { background: #eef4fa; }
[data-theme="light"] .squad-4 .slot-cell { background: #f5f1f8; }
```

- 5 队 `squad-head` 渐变：深色 header + 白字在两套主题通用，不动。
- 组件级硬编码（`RosterPool` 徽章 `#fff`/`#1a1205`、`CharacterCard` 金字、`UserAvatar` `#fff`）：金色/彩色背景上两套通用，不动。
- 各组件中 `var(--dnf-*, fallback)` 的 fallback 值（`#3a3f4b`/`#9aa3b2`/`#e6e9ef` 等）：`[data-theme="light"]` 定义了对应变量后 fallback 不再触发，自动适配。

## 6. 入口 + 防闪烁

- `App.vue` 导航 `.nav-right` 内、头像按钮前加主题切换按钮：`☾/☀` 字符图标（当前暗色显示 ☀「切到亮」，亮色显示 ☾），`class="nav-user"` + `data-act="theme-toggle"` + `@click="toggleTheme"`，登录后可见。
- `index.html` `<head>` 加内联脚本（在 `/src/main.ts` 之前），防刷新闪烁：

```html
<script>
  try {
    if (localStorage.getItem('dnfer-theme') === 'light')
      document.documentElement.dataset.theme = 'light'
  } catch (e) { /* 隐私模式等取不到存储时保持暗色默认 */ }
</script>
```

- 苹果风细节：字体沿用现有 PingFang/system-ui；圆角/留白沿用现有结构；**不引入毛玻璃**（自定义面板与 naive 已有层次，玻璃化风险高、收益低）。

## 7. 约束与边界

- 纯前端，后端零改动；无新接口、无新数据字段。
- 默认暗色：`theme` 初始化与 `index.html` 内联脚本都只在存储为 light 时才切亮。
- 偏好仅存浏览器 localStorage，不跨设备同步、不跟账号。
- 不支持「跟随系统」——顶栏按钮是唯一入口，三态（跟系统/暗/亮）明确不做。
- 主题切换不改变布局与数据，仅换色；WS 实时数据、轮询等不受影响。

## 8. 测试

### 8.1 新增 `composables/useTheme.spec.ts`（jsdom）

- 默认 `dark`，`data-theme` 属性不设或设为 dark。
- 初始化读 localStorage：预置 `dnfer-theme=light` → `theme.value==='light'` 且 `document.documentElement.dataset.theme==='light'`。
- `toggleTheme()`：dark→light 写 localStorage + 设 `data-theme=light`；naiveTheme/naiveOverrides 切换到 light 对应值；再 toggle 回 dark。
- `applyTheme('dark')` 显式回暗。
- 存储读写异常（如 jsdom 无 localStorage 场景）不抛错、保持默认（对齐 index.html 的 try/catch 语义）。

### 8.2 现有回归

- 现有 42 个 spec 不挂载 `App.vue`、不 import `dnf.css`/`theme.ts`，默认主题暗色 → 不受影响，全量 `npx vitest run` 通过。
- `styles/theme.ts` 改名 `darkOverrides` 后，`App.vue`/`notify.ts` 的引用同步更新，无遗留 `themeOverrides` 引用（vue-tsc 兜底）。
- 验证命令：`cd frontend && npm run build`（vue-tsc -b && vite build）+ `npx vitest run`。

## 9. 非目标 / 后续

- 跟随系统深浅色（三态选择）。
- 毛玻璃/材质/动态岛等苹果高级视觉效果。
- 主题偏好跨设备/账号同步。
- 更多预设主题（主题市场）。
