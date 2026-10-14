# 详情页点击占位显示冒险团 — 设计规格

日期：2026-10-13
状态：已确认
需求来源：用户口述——攻坚详情页排表时不总是走编队页，希望在点击已占位格子时能看到该角色所属冒险团（多账号场景区分账号）。已确认的决策：**仅弹窗显示**（在已占格「角色操作」弹窗 SlotActionModal 内加一行冒险团，网格本身不显示）。

## 1. 目标

攻坚详情页（`RaidDetailView`）点击已占位格子弹出的 `SlotActionModal` 中，展示该占位角色所属的冒险团名称，帮助管理员（在详情页直接排表时）一眼识别角色所在账号。

**范围**：后端 `SlotOut` 补两字段 + `_slot_out()` 填充；前端 `Slot` 类型 + `SlotActionModal` 展示。**不含**：空格选人弹窗（CharacterPickerModal）、报名头像的 MemberCharactersModal、非管理员点击占位、格子内联显示、编队页改动。

## 2. 后端

### 2.1 schemas.py — `SlotOut` 加字段（带默认值防中间态 500）

```python
adventure_party_id: int | None = None
adventure_party_name: str | None = None
```

### 2.2 raids.py — `_slot_out()` 填充

`_slot_out(slot)`（raids.py:43，唯一 Slot 序列化点）当前取 `c = slot.character` 与 `meta`。补（绑定 `party` 一次，同 `character_out` 风格）：

```python
    party = c.adventure_party if c else None
    ...
    adventure_party_id=c.adventure_party_id if c else None,
    adventure_party_name=party.name if party else None,
```

- None 防护：空格（`c is None`）与「角色无团」（理论不出现，防御）均输出 null。
- 传播：详情页波网格（`_detail` 的 `_slot_out`）、fill 响应、`slot:filled`/`slot:duty_changed` WS 广播全部经 `_slot_out`，自动携带团信息；无需新接口。
- N+1：`c.adventure_party` lazy 加载，本工具规模可接受（同 `character_out` 现有模式）。

## 3. 前端

### 3.1 types.ts — `Slot` 加必填字段（与 `Character` 处理一致）

```ts
adventure_party_id: number | null; adventure_party_name: string | null
```

- `Slot` 是必填字段，手写 `Slot` 字面量 fixture 会过不了 vue-tsc，需一并补（vue-tsc 为准，同类坑见记忆库）。已知候选（含但不限于）：`RaidDetailView.spec`、`SlotCell.spec`、`RosterSlot.spec`、`RosterGrid.spec`、`RosterView.spec`、`stores/raid.spec`、`composables/useSlotMove.spec`、`lib/damage.spec`、`lib/roster.spec`、`lib/placement.spec`。

### 3.2 SlotActionModal.vue — 展示冒险团

在现有信息行 `{{ slot.owner_nickname }}（{{ slot.character_name }} · {{ slot.duty }}）` 下加一行：

```html
<p v-if="slot.adventure_party_name" style="margin-top:4px;color:var(--dnf-text-faint);font-size:12px">
  冒险团：{{ slot.adventure_party_name }}
</p>
```

- null 不显示（防御）。
- 可见范围：该弹窗本就仅管理员点已占格打开（SlotCell `manageable = occupied && isAdmin && !moveMode`），故冒险团信息天然只对管理员可见，符合「管理员排表看账号」场景。

## 4. 测试

### 4.1 后端（pytest）

- `_slot_out` 序列化：已占格角色带 `adventure_party_id/adventure_party_name`（给角色建团后填格，断言 SlotOut 两字段）；空格两字段为 null。
- 可追加到现有 raids/fill 测试（如 `test_raid_validator.py`/`test_raids.py` 填格用例），断言 fill 响应 slot 带团名。
- 既有测试为字段级断言，加字段不破坏。

### 4.2 前端（Vitest）

- `SlotActionModal.spec`（若无则新建，或并入 RaidDetailView.spec）：slot 带 `adventure_party_name` 时渲染「冒险团：xxx」；null 时不渲染。
- 相关 spec 手写 `Slot` 字面量补两字段（vue-tsc 为准）。

### 4.3 构建

- `npm run build`（vue-tsc + vite）通过。

## 5. 风险

- 低：后端只加字段（向后兼容），`_slot_out` 全路径生效。
- 中：`Slot` 加必填 TS 字段牵连手写 fixture，需逐个补（vue-tsc 报错为准）。
- 低：N+1（每已占格 lazy 取团名）——规模可接受。

## 6. 范围外

- 空格选人弹窗、报名头像 MemberCharactersModal、非管理员点击占位、格子内联团名、编队页展示。
- 不做冒险团字段的筛选/排序（详情页无此需求）。
