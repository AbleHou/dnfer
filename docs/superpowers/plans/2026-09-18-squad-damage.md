# 排表小队输出统计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在攻坚排表详情页每个小队列内，小队表头下显示该队已占位输出职业格子的总模拟伤害与总秒伤。

**Architecture:** 纯前端增强。把求和逻辑抽成纯函数 `sumSquadDamage(slots)`（新 `src/lib/damage.ts`，配 vitest 单测），`WaveSection.vue` 用 computed 按小队调用并在小队表头下渲染一行 `.squad-stats`；`dnf.css` 补该样式。后端零改动。

**Tech Stack:** Vue 3 · TypeScript · Vitest。工作目录 `/Users/able/toys/dnfer`，前端在 `frontend/`。

**依赖约束：** 无新依赖。数值字段 `simulated_damage` / `sustained_dps` 已为「亿」单位，直接求和显示。

---

## File Structure

- Create: `frontend/src/lib/damage.ts` — 纯函数 `sumSquadDamage(slots): SquadDamage`（求和 + hasOutput 门控）
- Create: `frontend/src/lib/damage.spec.ts` — 纯函数边界单测
- Modify: `frontend/src/components/WaveSection.vue` — import + `totals` computed + 模板 `.squad-stats` 行
- Modify: `frontend/src/styles/dnf.css` — 新增 `.squad-stats` 类

---

## Task 1: sumSquadDamage 纯函数（TDD）

**Files:**
- Create: `frontend/src/lib/damage.ts`
- Test: `frontend/src/lib/damage.spec.ts`

- [ ] **Step 1: 写测试 `frontend/src/lib/damage.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { sumSquadDamage } from './damage'
import type { Slot } from '../types'

function slot(partial: Partial<Slot>): Slot {
  return {
    id: 1, squad_index: 0, row_index: 0,
    character_id: null, character_name: null, character_class: null,
    job_name: null, job_title: null, fame: null,
    simulated_damage: null, sustained_dps: null, buff_amount: null,
    owner_id: null, owner_nickname: null, duty: null, version: 1,
    ...partial,
  }
}

describe('sumSquadDamage', () => {
  it('sums simulated damage and sustained dps of occupied output slots', () => {
    const slots = [
      slot({ character_id: 1, character_class: '输出', simulated_damage: 100, sustained_dps: 30 }),
      slot({ character_id: 2, character_class: '输出', simulated_damage: 68, sustained_dps: 22 }),
    ]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 168, sustained: 52, hasOutput: true })
  })

  it('ignores support and empty slots', () => {
    const slots = [
      slot({ character_id: 3, character_class: '辅助', buff_amount: 9000 }),
      slot({ character_id: null, character_class: null }),
      slot({ character_id: 1, character_class: '输出', simulated_damage: 100, sustained_dps: 30 }),
    ]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 100, sustained: 30, hasOutput: true })
  })

  it('skips null value fields on output slots', () => {
    const slots = [
      slot({ character_id: 1, character_class: '输出', simulated_damage: 100, sustained_dps: null }),
      slot({ character_id: 2, character_class: '输出', simulated_damage: null, sustained_dps: 20 }),
    ]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 100, sustained: 20, hasOutput: true })
  })

  it('empty squad returns zeros and hasOutput false', () => {
    expect(sumSquadDamage([])).toEqual({ simulated: 0, sustained: 0, hasOutput: false })
  })

  it('pure support squad has hasOutput false', () => {
    const slots = [
      slot({ character_id: 3, character_class: '辅助', buff_amount: 9000 }),
      slot({ character_id: 4, character_class: '辅助', buff_amount: 7000 }),
    ]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 0, sustained: 0, hasOutput: false })
  })

  it('occupied output with all-null values has hasOutput true and zero sums', () => {
    const slots = [slot({ character_id: 1, character_class: '输出' })]
    expect(sumSquadDamage(slots)).toEqual({ simulated: 0, sustained: 0, hasOutput: true })
  })
})
```

- [ ] **Step 2: 跑测试确认失败（红）**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/lib/damage.spec.ts`
预期：FAIL — `Cannot find module './damage'`（函数未定义）。

- [ ] **Step 3: 实现 `frontend/src/lib/damage.ts`**

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

- [ ] **Step 4: 跑测试确认通过（绿）**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/lib/damage.spec.ts`
预期：PASS 全部 6 个用例。

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/lib/damage.ts frontend/src/lib/damage.spec.ts
git commit -m "$(cat <<'EOF'
[fet] 新增 sumSquadDamage 纯函数：小队输出职业总模拟/秒伤求和

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: WaveSection 接入 + dnf.css 样式

**Files:**
- Modify: `frontend/src/components/WaveSection.vue`
- Modify: `frontend/src/styles/dnf.css`

- [ ] **Step 1: 修改 `WaveSection.vue`**

script 部分（在现有 `counts` computed 之后新增）：

```ts
import { sumSquadDamage } from '../lib/damage'
// ...
const totals = computed(() => squads.value.map(sumSquadDamage))
```

> `computed` 已导入；`sumSquadDamage` 的 `Slot[]` 参数与 `squads.value`（`Slot[][]`）类型匹配。

template 部分：`.squad-head` 之后、`.squad-cells` 之前插入统计行（现有结构为 `<div class="squad-head">…</div><div class="squad-cells">…</div>`）：

```html
<div v-if="totals[i].hasOutput && (totals[i].simulated > 0 || totals[i].sustained > 0)" class="squad-stats">
  总输出 {{ totals[i].simulated }}亿 · 秒伤 {{ totals[i].sustained }}亿
</div>
```

> 显隐：无已占位输出角色，或输出数值全为 0（未录入）时不显示，避免误导性的「总输出 0亿」。

- [ ] **Step 2: 修改 `frontend/src/styles/dnf.css`**（在 `.squad-head` 相关块附近新增）

```css
.squad-stats {
  font-size: 12px; color: var(--dnf-text-muted); text-align: center;
  padding: 2px 0 4px; border-bottom: 1px solid var(--dnf-gold-deep);
}
```

- [ ] **Step 3: 全量验证**

Run: `cd /Users/able/toys/dnfer/frontend && npm run test && npm run build`
预期：全部测试通过（原 18 + 新增 6 = 24）、vue-tsc + vite 构建通过。

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/components/WaveSection.vue frontend/src/styles/dnf.css
git commit -m "$(cat <<'EOF'
[fet] 排表小队表头下显示总输出/秒伤统计行

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## 完成标准

- `npm run test` 全绿（含新 `damage.spec.ts` 6 用例）
- `npm run build`（vue-tsc + vite）通过
- 排表详情页每个有输出角色的小队列表头下显示「总输出 X亿 · 秒伤 Y亿」；纯辅助队不显示
- 后端零改动
