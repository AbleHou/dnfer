# DNfer 攻坚排表 — DNF 鎏金风 UI 改造设计规格

日期：2026-09-18
状态：已确认
上游：`2026-09-16-dnfer-raid-scheduler-design.md` 及后续增量（纯前端视觉改造，不改后端 API、不改数据语义）
需求来源：用户要求「用成熟 UI 组件库美化系统，使其更贴合 DNF 游戏风格」

## 1. 目标与已确认决策

在不改动后端与业务逻辑的前提下，将前端从「全内联样式、无组件库」改造为 **Naive UI + DNF 鎏金复古主题**。已与用户确认的决策：

- **组件库**：Naive UI（主题定制能力强、内置深色模式、TS 友好）
- **视觉方向**：经典阿拉德 · 鎏金复古 —— 暗褐/藏蓝底 + 黄铜鎏金描边 + 铆钉金属板，中世纪羊皮卷质感（设计预览已获确认）
- **范围**：全站一次性改造（登录/注册、攻坚列表、排表详情、我的角色、管理）
- **布局**：保持顶部横条导航（对移动端友好），响应式适配移动端
- **实现策略**：Naive UI 深色主题（`themeOverrides` 定 DNF 色板）+ 一层定制 CSS 装饰类（鎏金边框、渐变按钮、背景纹理）；组件库干重活，CSS 干美术
- **小队配色**：排表红/黄/绿/蓝/紫小队色**保留但暗化**（适配暗色主题，见 §2），这是 DNF 攻坚的约定色
- 排表页 12 人 = 3 队 × 4 格结构不变

## 2. 设计系统（Design Tokens）

### 2.1 配色

| Token | 值 | 用途 |
|---|---|---|
| `--dnf-bg` | `#191310` | 全局背景（深棕黑） |
| `--dnf-panel` | `#241c14` | 面板底 |
| `--dnf-panel-inner` | `#2b2114` | 卡片/内嵌底 |
| `--dnf-gold` | `#a8842c` | 主描边金 |
| `--dnf-gold-deep` | `#6b5320` | 深描边/分割线 |
| `--dnf-gold-hi` | `#ffd97a` | 高亮金（标题/强调） |
| `--dnf-text` | `#e8d9a8` | 主文本（羊皮纸色） |
| `--dnf-text-muted` | `#b09b66` | 次要文本 |
| `--dnf-text-faint` | `#8a7a5a` | 弱文本/占位 |
| `--dnf-danger` | `#c0392b` | 危险/锁定 |
| `--dnf-ok` | `#5d8a4e` | 成功/未锁定 |

小队色（暗化版，保持辨识度）：红 `#c0392b`、黄 `#b8860b`、绿 `#3a6b35`、蓝 `#2a5a8a`、紫 `#7a4a8a`。

**小队色使用规则**：小队色用于**表头渐变、描边、角色名强调**；格子底色一律用各队的**暗色半透明 tint**（如 `color-mix(in srgb, 队色 12%, var(--dnf-panel-inner))` 或预置暗化底），**弃用现有 `SQUAD_LIGHT` 亮色底**（在暗色主题下会视觉崩坏）。`colors.ts` 中小队数据结构随之调整（移除 `SQUAD_LIGHT`，新增暗色 tint 或改由 CSS 类提供）。

### 2.2 字体

- **标题/Logo/徽章**：衬线 —— `"Noto Serif SC", "Songti SC", "STSong", Georgia, serif`；字距拉宽、金色高亮
- **正文/输入**：无衬线 —— `"PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
- 不打包字体文件（避免体积与部署复杂度），使用系统/通用字体栈

### 2.3 纹饰与元素

- **面板 `.dnf-panel`**：金描边（`border:2px solid #a8842c`）+ 内嵌描边（`box-shadow: inset 0 0 0 1px #6b5320`）+ 上下渐变底（`#2b2114 → #241c14`）+ 外投影
- **按钮**：主按钮金→铜渐变（`linear-gradient(#d4a53c,#a1711d)`）、深字、hover 提亮；危险按钮红渐变；幽灵按钮暗底金描边
- **分割线 `.dnf-divider`**：两端渐变的金色细线
- **背景 `.dnf-bg`**：纯 CSS 渐变模拟羊皮纸/石纹 + 暗角（vignette），不依赖图片资源
- **状态徽章**：`锁定`=暗红描边、`未锁定`=暗绿描边，圆角小胶囊

## 3. 布局与导航

- **顶导航 `.dnf-nav`**：鎏金底条，左侧 Logo「阿拉德远征」（衬线金字），中部导航项（攻坚列表/我的角色/管理），右侧用户名 + 退出。窄屏（`<768px`）导航项收进汉堡菜单（**定案用 `NDropdown`**）
- **内容区**：`max-width:800–900px` 居中，卡片统一 `.dnf-panel`
- **路由过渡**：`<router-view>` 加简单淡入过渡（可选，低成本加分项）。**保留现有 `:key="$route.fullPath"`**，过渡才能在新路由时触发

## 4. 各页面改造点

| 页面 | 现状 | 改造 |
|---|---|---|
| `App.vue` | 内联样式 nav | `NConfigProvider`(dark + overrides) + `NMessageProvider` + `NDialogProvider` 包裹；顶导航 `.dnf-nav`，移动端汉堡菜单 |
| `LoginView` / `RegisterView` | 裸输入框 + button | 居中 `.dnf-panel` 卡片 + 背景纹理；`NForm`/`NInput`/`NButton` |
| `RaidListView` | 裸卡片 + 原生表单 | `.dnf-panel` 卡片列表 + 状态徽章；创建表单改 Naive 组件（副本选择用 `NSelect`、发起时间用 **`NDatePicker`**（定案，不用样式化 `datetime-local`——暗色下跨浏览器样式不一致）；`confirm()` 换 `NDialog` |
| `RaidDetailView` + `WaveSection`/`SlotCell`/`DutySelect` | 内联样式网格 | 波次面板 `.dnf-panel`；小队表头按 §2.1 小队色渐变；格子职业图标 + 角色名 + 职责；`DutySelect` → `NSelect` |
| `CharacterPickerModal` | 自写 modal | 改 `NModal` + `NList`/`NCard`，保留现有选择/占位交互逻辑 |
| `MyCharactersView` | 角色列表 | 角色卡片网格 `.dnf-panel` + 职业图标；新增/编辑表单用 Naive 组件 |
| `AdminView` | 管理页 | `NDataTable` + `NTabs` + `NForm`，金色主题 |

**全局替换**：`alert()`/`confirm()` → `NMessage`/`NDialog`（经 `discreteApi` 或 provider）；所有内联 `style` 收敛为语义类名。**注意**：`CharacterPickerModal.vue` 内有个字面叫 `confirm` 的本地方法（负责 emit `select`），改造时必须改名为 `confirmPick` 等，避免被「`confirm()` → `NDialog`」的替换误伤。

## 5. 技术实现

### 5.1 依赖与配置

- 新增依赖：`naive-ui`、`@vicons/ionicons5`（UI 图标，可选）、`vfonts`（可选，字体度量，仅英文字体，非必需）
- **不改 `vite.config.ts`**：Naive 组件采用**显式按需 import**（不用 unplugin-vue-components 自动导入），保持项目现有简单配置
- `package.json` scripts 不变；`npm run build`（vue-tsc 类型检查）保持通过

### 5.2 新增文件

- `frontend/src/styles/dnf.css` —— CSS 变量 + `.dnf-*` 装饰类 + 背景/字体 + 响应式断点
- `frontend/src/styles/theme.ts` —— `darkTheme` + `themeOverrides`（common 主色/字体/圆角，及各组件色板对齐 §2.1）

### 5.3 修改文件

- `frontend/src/main.ts` —— 引入 `naive-ui` 样式与 `dnf.css`、`theme.ts`
- `frontend/src/App.vue` —— `NConfigProvider`(theme + themeOverrides) + `NMessageProvider` + `NDialogProvider` 包裹 `<router-view>`；顶导航重写
- 各 `views/*.vue` 与 `components/*.vue` —— 换用 Naive 组件 + `.dnf-*` 类
- 现有 `frontend/src/lib/colors.ts`（`SQUAD_COLORS` / `SQUAD_LIGHT`）—— 更新为暗化小队色，**移除 `SQUAD_LIGHT` 亮色底**，暗色 tint 由 `dnf.css` 类或 `color-mix` 提供；组件改为引用类名

### 5.4 不改的部分

- 后端、API 契约、Pinia store、WS 逻辑、路由定义、职业图标 URL 逻辑（`lib/job.ts`）均不动

## 6. 响应式 / 移动端

- **排表网格列数必须由小队数动态决定**（规模 4/8/12/16/20 → **1/2/3/4/5 队**，后端 `squads = size // 4`），不得写死 3 列。桌面端用 `repeat(auto-fit, minmax(240px, 1fr))` 或按 `squadCount` 显式列数；`≥768px` 宽屏 12 人时自然三队并排，其他规模随容器自适应
- `≥768px`：顶导航横排显示全部导航项
- `<768px`：导航收进汉堡菜单（固定用 `NDropdown`）；每波纵向展示小队（网格 `1fr` 折叠）；卡片/表单全宽
- 触控目标 ≥44px（按钮/格子点击区），适配移动端使用场景
- **`WaveSection.vue` 现有 `<table min-width:600px>` 是移动端横向滚动的元凶**，须改为 CSS Grid 布局（按小队数动态列数，见上），否则移动端适配不成立

## 7. 测试

- 后端 pytest 不受影响（无后端改动）
- 前端 vitest：现有 `RaidListView.spec.ts`、`MyCharactersView.spec.ts` 等若因 DOM 结构变化（内联样式→类名、原生元素→Naive 组件）断言失败，**同步修正断言**（仅测结构/逻辑，不断言样式）。已知两个需要**重写而非微调**的点：
  - `RaidListView.spec.ts` 通过 spy `window.confirm` 测删除确认——`confirm()`→`NDialog` 后需改为 mock 对话框（如 stub `NDialog` 或直接断言调用触发）
  - `RaidListView.spec.ts` 里 `inputs[1]` 依赖原生 DOM 顺序，`NInput`/`NSelect`/`NDatePicker` 不保证该顺序，需按组件定位改写
- `npm run test` 与 `npm run build` 必须通过作为完成标准

## 8. 文件变更范围汇总

新增：
- `frontend/src/styles/dnf.css`
- `frontend/src/styles/theme.ts`

修改：
- `frontend/package.json` / `package-lock.json`（加依赖）
- `frontend/src/main.ts`
- `frontend/src/App.vue`
- `frontend/src/views/{LoginView,RegisterView,RaidListView,RaidDetailView,MyCharactersView,AdminView}.vue`
- `frontend/src/components/{SlotCell,WaveSection,DutySelect,CharacterPickerModal}.vue`
- `frontend/src/lib/colors.ts`（小队色暗化）
- 相关 `*.spec.ts`（如必要）
- `frontend/index.html`（标题/字体预载可选）

不做：后端无改动、无数据迁移、无 README 大改（README 技术栈表可顺带更新前端一栏，可选）。
