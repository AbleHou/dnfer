# DNfer 排表小队输出统计 — 设计规格

日期：2026-09-18
状态：已确认
上游：`2026-09-16-dnfer-raid-scheduler-design.md`（纯前端增强，不改后端与数据语义）
需求来源：用户希望攻坚排表页直观评估各小队强度

## 1. 目标

在攻坚排表详情页，每个小队表头下方显示该队**输出职业**已占位格子的**总模拟伤害**与**总秒伤**，方便管理员/成员一眼评估小队输出强度。

## 2. 已确认决策

- **显示位置**：排表详情页（`RaidDetailView` → `WaveSection`）每个小队列内，小队表头下方新增一行统计。
- **统计口径**：只统计 `character_class === '输出'` **且已占位**（`character_id != null`）的格子；辅助/空格不参与；字段值为 `null` 跳过。
- **显隐**：该队**不存在**任何已占位输出角色时整行不显示；**输出角色的模拟伤害与秒伤均为 0（数值未录入）时也不显示**——避免把「未录入数据」误导成「输出为 0」。
- **单位**：`simulated_damage` / `sustained_dps` 字段本身即「亿」单位，直接求和、直接显示。
- **实现**：抽取纯函数 `sumSquadDamage(slots)` 到 `src/lib/damage.ts`，配 vitest 单测；`WaveSection.vue` 调用。与现有 `lib/duty.ts` / `lib/job.ts` 风格一致。
- 纯前端，零后端改动，不改数据模型。

## 3. 实现

### 3.1 新文件 `frontend/src/lib/damage.ts`

```ts
import type { Slot } from '../types'

export interface SquadDamage {
  simulated: number
  sustained: number
  hasOutput: boolean
}

export function sumSquadDamage(slots: Slot[]): SquadDamage {
  let simulated = 0
  let sustained = 0
  for (const s of slots) {
    if (s.character_id == null || s.character_class !== '输出') continue
    if (s.simulated_damage != null) simulated += s.simulated_damage
    if (s.sustained_dps != null) sustained += s.sustained_dps
  }
  const hasOutput = slots.some(s => s.character_id != null && s.character_class === '输出')
  return { simulated, sustained, hasOutput }
}
```

### 3.2 修改 `frontend/src/components/WaveSection.vue`

- 新增 import：`import { sumSquadDamage } from '../lib/damage'`
- 新增 computed：

```ts
const totals = computed(() => squads.value.map(sumSquadDamage))
```

- 模板：`.squad-head` 之后插入：

```html
<div v-if="totals[i].hasOutput && (totals[i].simulated > 0 || totals[i].sustained > 0)" class="squad-stats">
  总输出 {{ totals[i].simulated }}亿 · 秒伤 {{ totals[i].sustained }}亿
</div>
```

### 3.3 修改 `frontend/src/styles/dnf.css`

新增小队统计行样式（紧随 squad-head 的细分隔线）：

```css
.squad-stats {
  font-size: 12px; color: var(--dnf-text-muted); text-align: center;
  padding: 2px 0 4px; border-bottom: 1px solid var(--dnf-gold-deep);
}
```

## 4. 测试（新文件 `frontend/src/lib/damage.spec.ts`）

- 求和：多个输出格子 → `simulated` / `sustained` 分别为对应字段之和。
- 排除：辅助格、空格（`character_id == null`）不参与求和。
- 跳过 null：某输出格数值字段为 `null` → 不贡献该项。
- 空数组 → `{ simulated: 0, sustained: 0, hasOutput: false }`。
- 纯辅助队 → `hasOutput: false`。
- 有已占位输出但数值全 null → `hasOutput: true`，数值为 0。

## 5. 变更文件范围

- Create：`frontend/src/lib/damage.ts`、`frontend/src/lib/damage.spec.ts`
- Modify：`frontend/src/components/WaveSection.vue`、`frontend/src/styles/dnf.css`

后端零改动、无迁移、无 README 变更。
