# 编队页左侧角色池固定跟随（sticky）— 设计规格

日期：2026-10-12
状态：已确认
需求来源：用户反馈——编队页右侧队伍网格较长时，页面滚到下方后左侧角色池随整页滚出视口，要滑回顶部才能看角色信息。

## 1. 目标

让左侧角色池在右侧队伍网格滚动时**始终可见**，团长在排下方队伍时无需回滚顶部即可取用/查看角色。

- **已确认方案**：左侧角色池 `position: sticky` 钉在视口顶部（用户三选一选了「左侧固定跟随」）。
- **范围**：仅 `RosterView.vue` 布局的纯前端 CSS 微调 + 一条回归用例；后端零改动，不动角色池/网格组件的内部逻辑与数据结构。

## 2. 实现

### 2.1 布局现状（问题根因）

`RosterView.vue` 主体为 `display:flex; align-items:flex-start` 双栏：

- 左侧 `<aside data-test="roster-pool">`：`width:260px; flex-shrink:0; max-height:70vh; overflow:auto`，位于页面正常流顶部。
- 右侧 `<main data-test="roster-grid">`：`flex:1`，队伍格子纵向堆叠（并行团横向 wrap），随整页滚动。

整页滚动时 `<aside>` 跟着滚出视口 → 下方队伍编辑时看不到左侧角色信息。

### 2.2 改动

在 `<aside>` 的 inline style 上追加 `position:sticky; top:12px`：

- `align-items:flex-start` 已存在，是 sticky 在 flex 容器内生效的前提（子项不被拉伸、留出可粘空间），无需改。
- 保留 `max-height:70vh; overflow:auto`：钉住后角色池列表仍可独立滚动。
- 顶部波标签/未排条、拿起提示仍随整页滚动；角色池在视口顶部持续可见。

### 2.3 可测性与测试

纯视觉 CSS 改动，jsdom 无法解析 scoped 样式，故 sticky 用 inline style 承载（与模板既有 inline style 风格一致），使回归用例可断言。

- `RosterView.spec` 新增用例：挂载视图后断言 `[data-test=roster-pool]` 的 `style` 含 `position: sticky`（防止日后被回退为普通流）。

## 3. 风险

- 极低：单行 inline style + 一条用例，纯前端，不涉及数据流/交互逻辑。
- sticky 与内部 `overflow:auto` 可共存（外层 sticky、内部独立滚动），是常见侧边栏模式。

## 4. 范围外

- 不改变角色池/网格组件内部实现、排序、拿起/放下状态机。
- 不做双栏独立滚动、抽屉/折叠等其它布局方案（用户已明确选 sticky）。
