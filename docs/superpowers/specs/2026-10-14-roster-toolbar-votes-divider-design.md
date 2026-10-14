# 编队页工具栏美化 + 投票页分隔 — 设计规格

日期：2026-10-14
状态：已确认
需求来源：用户口述——①编队页左侧角色栏搜索框加边框、展开/收起按钮去文字改图标、工具栏与整个左侧栏加内边距（现在粘在一起）；②投票页每个投票间加分隔（投票卡粘在一起）。已确认的决策：**图标用 Unicode 双箭头（展开 `▾▾` / 收起 `▴▴`，零依赖，与组件折叠指示符 ▸/▾ 一致）**；**投票分隔用 `.vote-list` flex gap 间距（投票卡自带金色边框即为分隔效果）**。

## 1. 目标

1. **编队页左侧角色栏工具栏美化**：搜索输入框带边框、右侧两个按钮去文字换小图标（带 `title` 悬浮提示）、工具栏行与整个左侧栏（`aside.dnf-panel`）加内边距。
2. **投票页投票卡分隔**：投票卡之间拉开间距，不再粘在一起。

**范围**：纯前端 3 个文件——`RosterPool.vue`、`RosterView.vue`、`VotesView.vue`（含各自 spec）。**不含**：后端、图标库依赖、投票卡内部样式、编队页网格改动。

## 2. 现状与关键点

- `RosterPool.vue` 工具栏（行 79-84）：`<input data-act="pool-search">` 无任何边框样式；两按钮 `data-act="pool-expand-all"/"pool-collapse-all"` 带文字「全部展开/全部收起」。
- `dnf.css` 已有 `.dnf-input`（行 89-93）：金色边框 + focus 高亮，复用即可给搜索框加边框。
- `dnf-panel`（dnf.css:35-40）**无内边距**——这是左侧栏内容贴边/粘在一起的根因。`RosterView.vue` 的 `<aside class="dnf-panel">`（行 222-223）需补内边距。
- 项目无图标库（package.json 仅 naive-ui，无 @vicons），故用 Unicode 双箭头。
- `RosterPool.spec` 通过 `data-act` 定位按钮与输入框，不依赖按钮文字，去文字不影响；`VotesView.spec` 用 `findComponent({name:'VoteCard'})`，包一层 `.vote-list` 不影响。

## 3. 前端改动

### 3.1 RosterPool.vue — 工具栏（行 79-84）

```html
<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;padding:0 2px">
  <input v-model="query" class="dnf-input" data-act="pool-search" placeholder="按用户名搜索"
         style="flex:1;min-width:0" />
  <button class="dnf-btn dnf-btn-sm" title="全部展开" data-act="pool-expand-all" @click="expandAll">▾▾</button>
  <button class="dnf-btn dnf-btn-sm" title="全部收起" data-act="pool-collapse-all" @click="collapseAll">▴▴</button>
</div>
```

- 搜索框：加 `class="dnf-input"`（复用金色边框样式）；`flex:1;min-width:0` 保留。
- 按钮：去文字，改 Unicode 双箭头；保留 `data-act`（spec 依赖）；加 `title` 悬浮提示。
- 工具栏行：加 `padding:0 2px`。

### 3.2 RosterView.vue — 左侧栏 aside（行 222-223）

`<aside>` 的 inline style 追加 `padding:10px`：

```html
<aside style="width:260px;flex-shrink:0;max-height:70vh;overflow:auto;position:sticky;top:60px;padding:10px"
       data-test="roster-pool" class="dnf-panel">
```

### 3.3 VotesView.vue — 投票卡分隔

`<VoteCard v-for>`（行 35）外包一层容器：

```html
<div class="vote-list">
  <VoteCard v-for="v in votes" :key="v.id" :vote="v" :is-admin="auth.isAdmin" @refresh="load" />
</div>
```

scoped style：

```css
.vote-list { display: flex; flex-direction: column; gap: 14px; }
```

（投票卡自带 `.dnf-panel` 金色边框，间距拉开即为清晰分隔。）

## 4. 测试

### 4.1 RosterPool.spec.ts（追加轻量断言）

- 展开按钮文本 `▾▾`、收起按钮文本 `▴▴`（`data-act` 定位）。
- 搜索框 `data-act="pool-search"` 带 `dnf-input` 类。
- 既有 data-act 用例不受影响。

### 4.2 VotesView.spec.ts（追加轻量断言）

- `find('.vote-list')` 存在，且其下 VoteCard 渲染。

### 4.3 构建

- `cd frontend && npm run build` + `npx vitest run` 全绿。

## 5. 风险

- 低：三处均为纯展示/布局改动，无逻辑、无 schema、无迁移。
- 低：`.dnf-input` 高度（padding 7px 10px）比 `dnf-btn-sm`（padding 4px 12px）略高，工具栏 `align-items:center` 居中显示，可接受。
- 低：VotesView 包 `.vote-list` 容器，既有 `findComponent(VoteCard)` 与 `find('[data-act="create-toggle"]')` 不受影响。

## 6. 范围外

- 投票卡内部样式调整、搜索逻辑改动、图标库引入、编队页网格/池分组逻辑改动。
