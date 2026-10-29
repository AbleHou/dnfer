# @dnftools/ui 全量 UI 升级 — 设计规格

日期：2026-10-29
状态：已确认
需求来源：用户在开源社区找到 DNF 混合贴图版 Vue3 组件库 `@dnftools/ui`（本地 v0.1.0，位于 `~/Desktop/package/`，未发 npm），希望用它全面升级当前 UI——替换 naive-ui 与自绘 `dnf.css`，呈现更接近 DNF 游戏的视觉。

已确认的决策：
- **全量迁移**：所有视图/组件换到 `@dnftools/ui`，naive-ui 全部移除，`dnf.css` 只留库不覆盖的定制类。
- **只留暗色**：删除亮色主题（Apple 金）与切换按钮，锁定游戏暗色。
- **NDatePicker 缺口**：用原生 `<input type="datetime-local">` + DNF 皮肤替代（两处：创建攻坚、编辑攻坚时间）。
- **分阶段迁移**：一张 spec + 一份 plan，实现拆 4 个阶段独立提交，每阶段可 review、可回退。
- **spec 全量适配**：现有前端 spec 全部保留并适配新组件，行为契约不变。
- **库接入方式**：vendored dist 内置仓库 + TS 别名（`@dnftools/ui`）。

## 1. 背景与现状

### 1.1 组件库 `@dnftools/ui`（v0.1.0）

- DNF 混合贴图版 Vue3 组件库，约 70 个组件；依赖 `reka-ui` + `@vueuse/core`，peerDependency `vue ^3.5.0`。
- 覆盖能力：`DnfProvider`（主题容器）/ `DnfDialog` / `DnfWindow` / `DnfMessage`（含函数式 `createDnfDialog` / `createDnfMessage` + Provider）/ `DnfFrame` / `DnfNinePatch` / `DnfButton` / `DnfInput` / `DnfTextarea` / `DnfNumberInput` / `DnfSelect` / `DnfCombobox` / `DnfCheckbox` / `DnfSwitch` / `DnfSlider` / `DnfTabs` / `DnfTable` / `DnfFormField` / `DnfBadge` / `DnfAvatar` / `DnfIcon`（内置 289 图标）/ `DnfDropdownMenu` / `DnfTooltip` 等。
- 样式：`@dnftools/ui/style.css` 需在应用入口显式引入一次；公开 CSS 与变量带 `dnf` 前缀，不附带全局 Preflight 或游戏字体。
- 主题：通过 `DnfProvider` 上的 `--dnf-*` CSS 变量控制，Provider 将变量复制到浮层容器（Dialog/Select 等脱离 DOM 父级仍继承主题）。
- 发布形态：`dist/` 含编译 ESM（`index.js`）、类型（`index.d.ts`/`types.d.ts`）、`style.css`（260KB）、`resources.json`（图片来源清单）、`assets/`（30 个哈希图片资源，>4KB 未内联的大图）。
- 注意：当前版本 **无** `NDatePicker` 等价组件；**无** 顶部导航栏组件（App 顶栏需自绘 + `DnfFrame` 皮肤）。

### 1.2 当前前端现状

- **naive-ui 使用面**（`frontend/package.json` 依赖 `naive-ui ^2.45.3`）：
  - `App.vue`：`NConfigProvider` + `NDropdown`（导航菜单）。
  - 约 17 处 `NModal`：AdventurePartyModal / ChangePasswordModal / GuestCreateModal / GuestConvertModal / MemberCharactersModal / AdminResetPasswordModal / AdminUserCharactersModal / CharacterPickerModal / RosterTargetModal / SignupModal / SignupMemberPicker / SlackRulesModal / SlotActionModal / VoteCreateModal / ProfilePanel / RaidDetailView / RosterView（角色池弹窗）。
  - 表单控件：`NSelect`（DutySelect / CharacterPicker / RaidList / RosterTargetModal）、`NInput`（Login/Register/Profile/CharacterForm 等）、`NInputNumber`（RosterTargetModal）、`NCheckbox`（RosterTargetModal）、`NSwitch`（RosterView）、`NTabs`/`NTabPane`（AdminUsersView）、`NButton`（Login/Register）、`NDatePicker`（RaidList 创建 / RaidDetail 编辑）。
- **`lib/notify.ts`**：模块级 `createDiscreteApi(['message','dialog'])` 封装 `notifyError/notifyWarning/notifySuccess/confirmDialog`（naive message/dialog）；约 10 个 spec 文件 `vi.mock('../lib/notify')`。
- **`styles/dnf.css`**（262 行）：`--dnf-*` CSS 变量 + `dnf-btn` / `dnf-panel` / `dnf-badge` / `dnf-input` / `dnf-select` / `dnf-table` / `squad-grid` / `slot-cell` / `raid-card` / `char-pick` / `job-pick-btn` / `pos-capsule` / `wave-tag` / `dnf-nav` / `auth-*` 等。
- **主题**：`composables/useTheme.ts` 模块级单例 + `styles/theme.ts`（dark/light naive overrides）+ `data-theme` CSS 机制；`App.vue` 有主题切换按钮（`data-act="theme-toggle"`）。
- **构建**：`vite.config.ts` 无 alias；`tsconfig.json` 无 paths；vitest 无全局 setup（各 spec 用 `// @vitest-environment jsdom` 注解）。

## 2. 目标架构与接入

### 2.1 依赖接入（vendored）

1. 把 `~/Desktop/package/dist/` 内容拷贝进 `frontend/src/vendor/@dnftools/ui/`（`index.js`、`index.d.ts`、`types.d.ts`、`style.css`、`resources.json`、`assets/`、`components/`、`composables/`）。
2. **安装运行时依赖**：`frontend/package.json` 增加 `reka-ui@2.11.0` 与 `@vueuse/core@14.4.0`（vendored `dist/index.js` 把这两者作为**外部模块** import，是必需的运行时依赖）；同时把 `vue` 范围从 `^3.4` 提升到 `^3.5`（库 peerDependency `vue ^3.5.0`，当前 lock 已是 3.5.42）。
3. `tsconfig.json` 加 `"paths"`（tsconfig paths 为精确匹配）：
   ```json
   "paths": {
     "@dnftools/ui": ["./src/vendor/@dnftools/ui/index.d.ts"],
     "@dnftools/ui/style.css": ["./src/vendor/@dnftools/ui/style.css"]
   }
   ```
4. `vite.config.ts` 加 `resolve.alias`，**`@dnftools/ui/style.css` 必须声明在 `@dnftools/ui` 之前**（vite 字符串别名按前缀匹配、先匹配先生效；若 JS 别名在前会把 `@dnftools/ui/style.css` 错误解析成 `index.js/style.css` 导致构建失败）：
   ```ts
   resolve: { alias: {
     '@dnftools/ui/style.css': path.resolve(__dirname, 'src/vendor/@dnftools/ui/style.css'),
     '@dnftools/ui': path.resolve(__dirname, 'src/vendor/@dnftools/ui/index.js'),
   } }
   ```
5. `main.ts`：`import '@dnftools/ui/style.css'`（在 `./styles/dnf.css` 之前或之后按 cascade 策略定序，见 §5 变量冲突）。
6. **vendored `index.d.ts` 首行 `import './styles/index.css';` 需处理**：库 `dist/` 并无 `styles/` 目录（真实样式在根 `style.css`）。阶段 1 构建验证 `skipLibCheck` 是否抑制；若不通过，删掉该行或在 vendor 内补一个空 shim。
7. 未来库发 npm 时：删除 vendor 目录 + 移除 alias + 改为真实依赖，import 路径不变。

### 2.2 应用根结构（App.vue）

- `NConfigProvider` → `DnfProvider`（包住全局，`--dnf-*` 主题变量由它管理，浮层自动继承）。
- 内部嵌套 `DnfDialogProvider` + `DnfMessageProvider`，服务实例从 `lib/notify.ts` 导入共享（模块级单例）。
- 导航栏：`DnfFrame`（surface 皮肤）包裹顶栏，`NDropdown` → `DnfDropdownMenu`；主题切换按钮删除。

### 2.3 消息/弹窗适配层（关键，保持签名不变）

重写 `lib/notify.ts` 内部实现，**保留对外签名不变**：

```ts
import { createDnfDialog, createDnfMessage } from '@dnftools/ui'
export const dialogs = createDnfDialog()
export const messages = createDnfMessage()
export function notifyError(content: string): void { messages.error(content) }
export function notifyWarning(content: string): void { messages.warning(content) }
export function notifySuccess(content: string): void { messages.success(content) }
export function confirmDialog(options: { title?: string; content: string }): Promise<boolean> {
  return dialogs.confirm({ title: options.title ?? '确认', content: options.content, confirmLabel: '确定', cancelLabel: '取消' })
    .then((r) => r.action === 'confirm')
}
```

- 服务实例在模块级创建，`App.vue` 中 `:service="notify.dialogs"` / `:service="notify.messages"` 绑定 Provider。
- **服务实例全应用唯一**：每实例只能挂载一个 Provider，挂载后 service prop 不可替换；不得在其他地方再创建实例。
- 好处：所有视图的调用点 + 所有 spec 的 `vi.mock('../lib/notify')` **零改动**。
- 组件内后续可直接用 `useDnfDialog()` / `useDnfMessage()` 做更复杂的函数式弹窗。

### 2.4 主题删除

- 删除 `composables/useTheme.ts` 亮色分支与 `data-theme` 机制，锁定暗色。
- 删除 `styles/theme.ts`（naive dark/light overrides）与 `App.vue` 主题切换按钮。
- 删除 `dnf.css` 中 `[data-theme="light"]` 全部块。
- **删除 `frontend/index.html` 内联 FOUC 脚本**（读 `localStorage['dnfer-theme']` 设 `data-theme` 的那段 `<head>` 脚本）——否则会残留死掉的 `data-theme` 属性，与已删除的 `[data-theme="light"]` CSS 块不一致。
- 相关 spec（`useTheme.spec.ts` / `notify.spec.ts` 的主题断言）同步删改。

## 3. 组件映射表

### 3.1 naive-ui → @dnftools/ui

| 现状 | 替换为 | 涉及位置 |
|---|---|---|
| `NConfigProvider` | `DnfProvider` | App.vue |
| `NDropdown` | `DnfDropdownMenu` | App.vue |
| `NModal`（约 17 处，含 RosterView 角色池弹窗） | `DnfDialog` / `useDnfDialog()` | 全部弹窗组件/视图 |
| `NSelect` | `DnfSelect` | DutySelect / CharacterPicker / RaidList / RosterTargetModal |
| `NInput` | `DnfInput` | Login / Register / Profile / CharacterForm 等 |
| `NInputNumber` | `DnfNumberInput` | RosterTargetModal |
| `NCheckbox` | `DnfCheckbox` | RosterTargetModal |
| `NSwitch` | `DnfSwitch` | RosterView |
| `NTabs`/`NTabPane` | `DnfTabs` | AdminUsersView |
| `NButton` | `DnfButton`（primary→`tone="gold"`，danger→`tone="orange"`，text→`skin="text"`） | Login / Register |
| `NDatePicker` | `<input type="datetime-local">` + DNF 皮肤 | RaidList 创建 / RaidDetail 编辑 |

### 3.2 自定义 dnf.css → 库组件

| 现状 class | 替换为 |
|---|---|
| `dnf-btn` / `dnf-btn-primary` / `dnf-btn-danger` | `DnfButton`（`tone="gold"` 主按钮、`tone="orange"` 危险按钮、`skin="text"` 文字按钮、默认 `tone="blue"`） |
| `dnf-panel` | `DnfFrame`（surface 面板） |
| `dnf-badge` / `dnf-badge-ok` / `dnf-badge-danger` | `DnfBadge` |
| `dnf-table` | `DnfTable` |
| `dnf-input` / `dnf-select`（原生控件皮肤） | `DnfInput` / `DnfSelect` |
| `UserAvatar`（自绘） | 内部改用 `DnfAvatar` |

### 3.3 保留的定制 CSS（库无对应，沿用但变量换源）

- 编队网格：`squad-grid` / `squad-col` / `squad-head` / `squad-cells` / `slot-cell`（5 队色）。
- 攻坚卡片：`raid-card`。
- 角色/职业选择：`char-pick` / `job-pick-btn`。
- 编队标签：`pos-capsule` / `wave-tag`。
- 页面布局：`dnf-page` / `dnf-nav` / `auth-*`。
- 这些统一改用库的 `--dnf-*` 变量（如 `--dnf-gold` 用库值）。

## 4. 分阶段迁移（每阶段独立提交、spec 全绿）

- **阶段 1「基础接入」**：vendored 依赖 + alias + `main.ts` 引 style.css + `App.vue` 换 `DnfProvider`/`DnfDialogProvider`/`DnfMessageProvider` + 重写 `notify.ts`（签名不变）+ 删亮色主题与切换按钮 + 导航栏换 `DnfFrame`/`DnfDropdownMenu`。naive 仍保留，但消息/弹窗已切到 DNF。全量 build + test 通过。
- **阶段 2「通用视觉层」**：全局换肤——`dnf-btn→DnfButton`、`dnf-panel→DnfFrame`、`dnf-badge→DnfBadge`、`dnf-table→DnfTable`、原生表单皮肤→`DnfInput`/`DnfSelect`；替换**不含表单控件的简单视图**（Login / Register / MyCharacters / AdminCodes / AdminDungeons / RosterView 的非表单部分）。**注意**：此阶段 `NConfigProvider` 已移除但 naive 组件仍在其余视图使用 → naive 回退默认亮色主题，属预期阶段性视觉回归，非 bug。
- **阶段 3「弹窗与表单控件」**：所有含表单控件/弹窗的视图在此阶段完成——约 17 处 `NModal→DnfDialog`、`NSelect→DnfSelect`、`NInput→DnfInput`、`NInputNumber→DnfNumberInput`、`NCheckbox→DnfCheckbox`、`NSwitch→DnfSwitch`、`NTabs→DnfTabs`、`NDatePicker→datetime-local`（RaidList 创建 / RaidDetail 编辑）。**RaidListView 在阶段 2 只换视觉皮肤（卡片/徽章/按钮），其表单控件（NSelect/NDatePicker/NInput）在阶段 3 替换**——同一视图跨两阶段但改动面不重叠，实现时按组件归属、不按视图整体归属。
- **阶段 4「收尾清理」**：移除 `naive-ui` 依赖 + 删除 `useTheme/theme.ts` + `dnf.css` 裁剪与库重复的变量 + 全量 `npm run build` + `vitest run` 通过。

## 5. 测试策略与风险

### 5.1 测试策略（全量适配）

- 每阶段结束：`npm run build`（vue-tsc 类型把关）+ `vitest run` 全绿再提交。
- spec 适配：`findComponent({name:'Switch'})` 等 naive 内部断言 → 改为针对 DNF 组件或行为断言；`vi.mock('../lib/notify')` 因签名不变保持原样。
- 新增：`notify.ts` 适配层单测——**必须 mock `createDnfDialog`/`createDnfMessage`**（服务无挂载 Provider 无法真实渲染），断言 `confirmDialog` 的 `action==='confirm'` 映射。
- 后端测试不受影响。

### 5.2 风险与对策

1. **reka-ui 在 jsdom 兼容性**：库底层用 reka-ui，vitest 可能需要全局 stub `ResizeObserver`/`matchMedia`（当前无 vitest setup 文件）。→ 阶段 1 先建最小 spec 验证，卡住早暴露；必要时加 `vitest.config.ts` setup。
2. **变量冲突**：库 `style.css` 与现有 `dnf.css` 的 `--dnf-gold/--dnf-panel/--dnf-text/--dnf-text-muted/--dnf-danger` 重名（已确认）。→ 以库为准：`dnf.css` 裁剪掉这些变量定义，保留库未定义的 `--dnf-bg/--dnf-gold-hi/--dnf-gold-deep/--dnf-panel-inner/--dnf-text-faint/--dnf-ok/--dnf-border/--dnf-accent` 等；引入顺序保证库值生效。
3. **库未发 npm，vendored 更新靠手动拷贝** → 接受；未来发版删 vendor + 改别名无缝切换。
4. **datetime-local 无秒** → 前端提交前补 `:00`（后端 pydantic 解析 ISO，测试已用 `"2026-09-20T14:00:00"` 无时区格式，兼容 `YYYY-MM-DDTHH:mm`）。
5. **库图片资源**：`dist/assets` 有 30 个哈希图（>4KB 未内联），vendored 时整目录拷入。

## 6. CHANGELOG

Unreleased 新增：**UI 全面升级 @dnftools/ui**——以 DNF 游戏贴图组件库替换 naive-ui 与自绘样式（全量迁移、只留暗色、分阶段落地）。

## 7. 非目标 / 后续

- 库源码的修改/定制（vendored dist 原样使用，不改库）。
- 保留亮色主题或跟随系统主题（明确不做）。
- 攻坚列表/详情页日期选择器的日历弹层（用原生 datetime-local，不造轮子）。
- 未来库发 npm 后的依赖切换（接入方式已预留无缝迁移）。
