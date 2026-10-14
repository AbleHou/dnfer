# 冒险团信息进选人面板 + 我的角色按冒险团排序 — 设计规格

日期：2026-10-14
状态：已确认
需求来源：用户口述——①攻坚详情页点击空格「点击占位」弹出的选人面板中看不到该角色所属冒险团，希望在选人时也能按账号区分；②「我的角色」页新增前端「按冒险团」排序。已确认的决策：**冒险团信息加到共享 CharacterCard（三个弹窗统一显示）**；**「按冒险团」用扁平排序（同团相邻、无团角色放最后），不加分组标题**。

## 1. 目标

1. **选人面板显示冒险团**：`CharacterPickerModal`（详情页空格「选择角色」弹窗）的角色卡片上展示 `冒险团：xxx`。实现位置选在共享卡片组件 `CharacterCard`，故 `MemberCharactersModal`（报名人头像）与 `AdminUserCharactersModal`（管理员查角色）同步显示，三处一致。
2. **我的角色按冒险团排序**：`MyCharactersView` 头部新增「按冒险团」排序按钮（与「按类型」「按名望」并列），切到该模式后同冒险团角色相邻、团内按名望降序、未分组（无团）角色放最后。

**范围**：纯前端，两处改动：`CharacterCard.vue` + `MyCharactersView.vue`（含各自 spec）。**不含**：后端改动、分组标题、冒险团筛选、编队页改动。

## 2. 背景与现状

- `Character` 类型已带必填字段 `adventure_party_id: number | null` 与 `adventure_party_name: string | null`（2026-10-13 冒险团功能引入），后端 `/api/me/characters`、`/api/admin/characters` 均已携带。
- `CharacterCard.vue`（共享卡片，三行：名/职业·类型·名望、战力行、可选已占位徽章）被 `CharacterPickerModal`、`MemberCharactersModal`、`AdminUserCharactersModal` 复用。
- `SlotActionModal` 已用 `冒险团：xxx` 单行样式展示团名（v-if name，null 不渲染），本功能沿用该视觉模式。
- `MyCharactersView` 卡片副标题已内联 `· {{ c.adventure_party_name }}`（spec `角色卡片副标题追加冒险团名` 已断言），故「按冒险团」排序后同团相邻即可见分组边界，无需额外分组标题。
- `MyCharactersView` 现状：`type SortMode = 'type' | 'fame'`，头部两个小按钮（`按类型`/`按名望`），`sorted` computed 取 `[...list.value].sort(...)`，`dnf-btn-primary` 高亮激活模式。

## 3. 前端改动

### 3.1 CharacterCard.vue — 显示冒险团

在战力行 `div` 之后追加一行，仅当有团名时显示，样式对齐 SlotActionModal（`var(--dnf-text-faint)` / `12px`）：

```html
<div v-if="character.adventure_party_name" style="color:var(--dnf-text-faint);font-size:12px;margin-top:2px">
  冒险团：{{ character.adventure_party_name }}
</div>
```

- `adventure_party_name` 为 null 时不渲染该行（防御，现有 spec 多为 null 不受影响）。
- 三个弹窗（点击占位 / 成员头像 / 管理员角色）统一生效，行为一致。

### 3.2 MyCharactersView.vue — 按冒险团排序

扩展 `SortMode` 并在头部加第三个按钮：

```ts
type SortMode = 'type' | 'fame' | 'party'
```

```ts
const sorted = computed(() =>
  [...list.value].sort((a, b) => {
    if (sortMode.value === 'fame') return b.fame - a.fame || a.id - b.id
    if (sortMode.value === 'party') {
      const pa = a.adventure_party_id ?? Infinity
      const pb = b.adventure_party_id ?? Infinity
      return pa - pb || b.fame - a.fame || a.id - b.id
    }
    return TYPE_RANK[a.class_type] - TYPE_RANK[b.class_type] || b.fame - a.fame || a.id - b.id
  }))
```

- **团 id asc**（与 RosterPool `groupByParty`「id asc null-last」约定一致）；null 用 `Infinity` 顶到末尾。
- **团内名望降序**、名望相同按 `id` 升序（确定性 tie-break，沿用现有约定）。
- 头部按钮（「添加角色」保持第一个不动，排序按钮在其后）：

```html
<button class="dnf-btn dnf-btn-sm" :class="{ 'dnf-btn-primary': sortMode === 'party' }"
        @click="sortMode = 'party'">按冒险团</button>
```

## 4. 测试

### 4.1 CharacterCard / CharacterPickerModal（Vitest）

- 现有无 `CharacterCard.spec.ts`（组件经各弹窗 spec 间接覆盖）。在 `CharacterPickerModal.spec.ts` 追加（对齐 SlotActionModal.spec 的「显示/不显示」双例模式）：
  - 角色带 `adventure_party_name` 时渲染 `冒险团：xxx`。
  - 角色 `adventure_party_name` 为 null 时不渲染「冒险团」。
- 因团行 v-if 且现有 fixture 多为 null，既有弹窗 spec（MemberCharactersModal/AdminUserCharactersModal/CharacterPickerModal）不受影响；若有 fixture 带团名，确认渲染后文本不破坏既有断言。

### 4.2 MyCharactersView.spec.ts（Vitest）

- **party 排序**：返回 `[无团辅助(高名望), 甲团输出(低名望), 甲团辅助(中名望), 乙团输出(高名望)]`，切「按冒险团」后顺序为 `甲团角色(团内名望降序) → 乙团角色 → 未分组`。
- **按钮激活态**：默认「按类型」高亮；点「按冒险团」后该按钮 `dnf-btn-primary`、原高亮取消。
- 断言方式沿用现有：`wrapper.findAll('.dnf-panel b').map(b => b.text())` 对比角色名顺序；`find(...).find(b => b.text() === '按冒险团')` 触发。

### 4.3 构建

- `cd frontend && npm run build`（vue-tsc + vite）通过。

## 5. 风险

- 低：两处均为纯前端展示/排序，无后端、无 schema、无迁移。
- 低：CharacterCard 加一行是新增渲染，v-if 防 null；三弹窗既有断言无精确全文匹配团行（已核查 spec 均无冲突断言）。
- 低：`SortMode` 扩联合类型，现有 `'type' | 'fame'` 分支不受影响，vue-tsc 保证穷尽。

## 6. 范围外

- 分组标题形态（已否决，选扁平排序）。
- 冒险团筛选、按冒险团在编队页排序、后端排序支持。
- 详情页空格选人弹窗之外的其他展示点（如报名面板 SignupModal 自有的 `.signup-char` 行）。
