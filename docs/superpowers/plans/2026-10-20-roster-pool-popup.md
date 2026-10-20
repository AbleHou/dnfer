# 编队角色池弹框化 + 位置/波次标签 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把编队总览页左侧常驻角色池改为右下角悬浮按钮打开的居中弹框，并在角色池中为「用户头」显示当前波位置胶囊（队伍 tag + 职责 tag）、为「角色行」显示波次标签。

**Architecture:** 纯前端改动。`lib/roster.ts` 新增纯函数 `placementByChar`（全波次占位映射）；`RosterView.vue` 移除左侧 `<aside>`，新增 FAB + naive `NModal` 承载 `RosterPool`；`RosterPool.vue` 新增 `roundUserPos`/`charPlacement`/`currentRound` 三个 props 渲染胶囊与波次标签；`dnf.css` 新增全局标签样式（含 `[data-theme="light"]` 覆盖）。后端零改动。

**Tech Stack:** Vue 3 (`<script setup>`) + naive-ui（NModal/NSwitch）+ Vitest + dnf.css（`[data-theme]` 双主题）。

---

## 任务总览

| # | 任务 | 文件 |
|---|------|------|
| 1 | `placementByChar` 纯函数 | `lib/roster.ts` + `lib/roster.spec.ts` |
| 2 | RosterPool 新 props + 胶囊 + 波次标签 | `components/RosterPool.vue` + `components/RosterPool.spec.ts` |
| 3 | dnf.css 标签样式 + 亮色覆盖 | `styles/dnf.css` |
| 4 | RosterView FAB + NModal 弹框化 | `views/RosterView.vue` + `views/RosterView.spec.ts` |
| 5 | CHANGELOG + 全量验证 | `CHANGELOG.md` |

设计规格见 `docs/superpowers/specs/2026-10-20-roster-pool-popup-design.md`。

---

### Task 1: `placementByChar` 纯函数（TDD）

**Files:**
- Modify: `frontend/src/lib/roster.ts`（文件末尾追加）
- Test: `frontend/src/lib/roster.spec.ts`（文件末尾追加 describe）

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/roster.spec.ts` 末尾追加（顶部 import 增加 `placementByChar`；`Duty` 已从 `../types` 导入的 `ClassType, Slot, Character, Wave` 中需补 `Duty` 可不加——用字面量即可，但 `Partial<Slot>` 的 `duty` 字段需 `as Duty` 或直接字面量。下面的 helper 直接传字面量，TS 会自动收窄）：

```ts
// 占位映射测试用的 slot：character_id != null 即视为已占位
function pslot(id: number, charId: number | null, opts: Partial<Slot> = {}): Slot {
  return { id, squad_index: 0, row_index: 0, character_id: charId,
    character_name: charId != null ? 'x' : null, character_class: null, job_name: null, job_title: null,
    fame: null, simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    owner_id: charId != null ? 1 : null, owner_nickname: null, owner_avatar: null, duty: null, version: 1,
    adventure_party_id: null, adventure_party_name: null, ...opts }
}

describe('placementByChar', () => {
  it('空格（character_id null）不映射', () => {
    const waves: Wave[] = [{ id: 1, index: 1, group_id: null, round_index: 1, group_index: 1,
      slots: [pslot(1, null)] }]
    expect(placementByChar(waves).size).toBe(0)
  })
  it('单波占位：正确映射 roundIndex/squadIndex/duty/userId', () => {
    const waves: Wave[] = [{ id: 1, index: 1, group_id: null, round_index: 2, group_index: 1,
      slots: [pslot(1, 10, { squad_index: 0, duty: '主C', owner_id: 9 })] }]
    const m = placementByChar(waves)
    expect(m.get(10)).toEqual({ roundIndex: 2, groupId: null, groupIndex: 1, squadIndex: 0,
      duty: '主C', userId: 9 })
  })
  it('并行团：映射 groupId/groupIndex', () => {
    const waves: Wave[] = [{ id: 1, index: 1, group_id: 5, round_index: 1, group_index: 2,
      slots: [pslot(1, 10, { squad_index: 3, duty: '太阳奶', owner_id: 9 })] }]
    const m = placementByChar(waves)
    expect(m.get(10)!.groupId).toBe(5)
    expect(m.get(10)!.groupIndex).toBe(2)
    expect(m.get(10)!.squadIndex).toBe(3)
  })
  it('多角色多波各自映射', () => {
    const waves: Wave[] = [
      { id: 1, index: 1, group_id: null, round_index: 1, group_index: 1,
        slots: [pslot(1, 10, { duty: '主C' }), pslot(2, 11, { squad_index: 1, duty: '主奶' })] },
      { id: 2, index: 2, group_id: null, round_index: 2, group_index: 1,
        slots: [pslot(3, 12, { duty: '辅C' })] },
    ]
    const m = placementByChar(waves)
    expect(m.size).toBe(3)
    expect(m.get(11)!.roundIndex).toBe(1)
    expect(m.get(12)!.roundIndex).toBe(2)
  })
  it('空 waves → 空 Map', () => {
    expect(placementByChar([]).size).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: FAIL —— `placementByChar is not defined`

- [ ] **Step 3: 实现最小代码**

在 `frontend/src/lib/roster.ts` 文件末尾追加（`Duty`/`Slot`/`Wave` 类型已在文件顶部 import）：

```ts
/** 角色在整场攻坚的占位信息（后端保证每角色至多占一格）。 */
export interface CharPlacement {
  roundIndex: number          // 展示用波数（round_index）
  groupId: number | null      // 并行团 id；null=独立单波
  groupIndex: number          // 团号（展示用）
  squadIndex: number          // 队索引 0..4 → SQUAD_NAMES
  duty: Duty | null
  userId: number | null
}

export function placementByChar(waves: Wave[]): Map<number, CharPlacement> {
  const m = new Map<number, CharPlacement>()
  for (const w of waves) {
    for (const s of w.slots) {
      if (s.character_id == null) continue
      m.set(s.character_id, {
        roundIndex: w.round_index,
        groupId: w.group_id,
        groupIndex: w.group_index,
        squadIndex: s.squad_index,
        duty: s.duty,
        userId: s.owner_id,
      })
    }
  }
  return m
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts`
Expected: PASS（含原有用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/roster.ts frontend/src/lib/roster.spec.ts
git commit -m "[feat] roster：新增 placementByChar 占位映射纯函数
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: RosterPool 新 props + 用户头胶囊 + 角色行波次标签（TDD）

**Files:**
- Modify: `frontend/src/components/RosterPool.vue`
- Test: `frontend/src/components/RosterPool.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `frontend/src/components/RosterPool.spec.ts` 末尾追加（`mountPool` 已有默认 props；新 props 由组件 `withDefaults` 兜底，旧用例不受影响）：

```ts
import type { CharPlacement } from '../lib/roster'

function pos(cid: number, opts: Partial<CharPlacement> = {}): CharPlacement {
  return { roundIndex: 1, groupId: null, groupIndex: 1, squadIndex: 0, duty: '主C', userId: 1, ...opts }
}

describe('用户头职责胶囊', () => {
  it('当前波已排：显示 队伍名+职责', () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10)]]) })
    const head = w.find('[data-user-id="1"]')
    expect(head.text()).toContain('红队')
    expect(head.text()).toContain('主C')
  })
  it('当前波未排：不显示胶囊', () => {
    const w = mountPool()
    expect(w.find('[data-user-id="1"] .pos-capsule').exists()).toBe(false)
  })
  it('并行团：胶囊带团号前缀', () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10, { groupId: 5, groupIndex: 2, duty: '太阳奶' })]]) })
    // 注意：胶囊内各 span 之间的空白会被 Vue 压缩，故分段断言，勿用带空格的整串
    expect(w.find('[data-user-id="1"]').text()).toContain('2团')
    expect(w.find('[data-user-id="1"]').text()).toContain('红队')
    expect(w.find('[data-user-id="1"]').text()).toContain('太阳奶')
  })
  it('职责 tag class 映射：太阳奶 → pos-duty-sunheal', () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10, { duty: '太阳奶' })]]) })
    expect(w.find('[data-user-id="1"] .pos-duty-sunheal').text()).toBe('太阳奶')
  })
  it('点胶囊不触发用户组折叠', async () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10)]]) })
    await w.find('.pos-capsule').trigger('click')
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(true)  // 组未收起
  })
})

describe('角色行波次标签', () => {
  it('已占位角色显示 第N波', () => {
    const w = mountPool({ charPlacement: new Map([[10, pos(10)]]) })
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('第1波')
  })
  it('并行团：显示 第N波M团', () => {
    const w = mountPool({ charPlacement: new Map([[10, pos(10, { groupId: 5, groupIndex: 2, roundIndex: 3 })]]) })
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('第3波2团')
  })
  it('未占位角色不显示波次标签', () => {
    const w = mountPool()
    expect(w.find('.wave-tag').exists()).toBe(false)
  })
  it('当前选中波高亮 .current', () => {
    const w = mountPool({ charPlacement: new Map([[10, pos(10, { roundIndex: 2 })]]) , currentRound: 2 })
    expect(w.find('[data-act="pool-char-10"] .wave-tag').classes()).toContain('current')
  })
  it('非当前波不高亮', () => {
    const w = mountPool({ charPlacement: new Map([[10, pos(10, { roundIndex: 1 })]]) , currentRound: 2 })
    expect(w.find('[data-act="pool-char-10"] .wave-tag').classes()).not.toContain('current')
  })
})
```

注意：顶部 import 需追加 `import type { CharPlacement } from '../lib/roster'`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: FAIL —— 新用例找不到 `.pos-capsule` / `.wave-tag`（组件尚未实现）

- [ ] **Step 3: 实现**

`frontend/src/components/RosterPool.vue`：

3a. script 区改动：

```ts
import { sortByPower } from '../lib/roster'
import type { CharPlacement } from '../lib/roster'
import type { Character, Duty, RaidSignup, User } from '../types'
```

props 追加三个字段（带默认值，`withDefaults` 第二参）：

```ts
  roundUserPos: Map<number, CharPlacement>
  charPlacement: Map<number, CharPlacement>
  currentRound: number
}>(), {
  recommendTop3: () => new Set(),
  recommendTarget: () => ({}),
  roundUserPos: () => new Map(),
  charPlacement: () => new Map(),
  currentRound: 0,
})
```

`PoolUser` 接口与 `groups` computed 追加 `pos`：

```ts
interface PoolUser { user: User; parties: PoolParty[]; pos?: CharPlacement }

const groups = computed<PoolUser[]>(() => props.signups
  .filter(s => s.characters.length > 0)
  .map(s => ({ user: s.user, parties: groupByParty(s.characters),
               pos: props.roundUserPos.get(s.user.id) })))
```

追加辅助函数（放在 `onPick` 附近）：

```ts
function squadName(si: number): string { return SQUAD_NAMES[si] ?? `队${si + 1}` }
function dutyClass(d: Duty | null): string {
  switch (d) {
    case '主C': return 'mainc'
    case '辅C': return 'subc'
    case '主奶': return 'mainheal'
    case '太阳奶': return 'sunheal'
    default: return 'slack'
  }
}
function waveLabel(p: CharPlacement): string {
  return p.groupId != null ? `第${p.roundIndex}波${p.groupIndex}团` : `第${p.roundIndex}波`
}
function cPos(cid: number): CharPlacement | undefined { return props.charPlacement.get(cid) }
```

3b. 模板：`.pool-user-head` 内，昵称后、guest 徽章前插胶囊（`@click.stop` 防折叠冒泡）：

```html
      <span v-if="g.pos" class="pos-capsule" @click.stop>
        <span v-if="g.pos.groupId != null" class="pos-group">{{ g.pos.groupIndex }}团</span>
        <span :class="`pos-team-${g.pos.squadIndex}`">{{ squadName(g.pos.squadIndex) }}</span>
        <span v-if="g.pos.duty" :class="`pos-duty-${dutyClass(g.pos.duty)}`">{{ g.pos.duty }}</span>
      </span>
      <span v-if="g.user.is_guest" class="dnf-badge" style="margin-left:6px">临时</span>
```

3c. 模板：`.pool-char` 角色名 `<b>{{ c.name }}</b>` 之后、职业信息 span 之前插波次标签：

```html
                  <b>{{ c.name }}</b>
                  <span v-if="cPos(c.id)" class="wave-tag"
                        :class="{ current: cPos(c.id)!.roundIndex === currentRound }">
                    {{ waveLabel(cPos(c.id)!) }}
                  </span>
```

（模板中 `currentRound` 为 props，`<script setup>` 下可直接用变量名。）

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/RosterPool.spec.ts`
Expected: PASS（新旧用例全过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RosterPool.vue frontend/src/components/RosterPool.spec.ts
git commit -m "[feat] roster：角色池用户头职责胶囊 + 角色行波次标签
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: dnf.css 标签样式 + 亮色覆盖

**Files:**
- Modify: `frontend/src/styles/dnf.css`

- [ ] **Step 1: 追加全局样式**

在 `frontend/src/styles/dnf.css` 中，`.pick-btn` 规则块（约 L160）之后新增一节：

```css
/* 编队位置/波次标签（RosterPool 用户头胶囊 + 角色行波次） */
.pos-capsule { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; vertical-align: middle; }
.pos-capsule > span { font-size: 11px; line-height: 1.7; padding: 0 6px; border-radius: 4px; white-space: nowrap; }
.pos-group { background: rgba(255,255,255,.06); color: var(--dnf-text-muted); border: 1px solid var(--dnf-border); }
.pos-team-0 { background: rgba(192,57,43,.18); color: #ffb4a8; border: 1px solid rgba(192,57,43,.55); }
.pos-team-1 { background: rgba(184,134,11,.18); color: #ffd98a; border: 1px solid rgba(184,134,11,.55); }
.pos-team-2 { background: rgba(58,107,53,.18); color: #bde6b0; border: 1px solid rgba(58,107,53,.55); }
.pos-team-3 { background: rgba(42,90,138,.18); color: #9cc9ee; border: 1px solid rgba(42,90,138,.55); }
.pos-team-4 { background: rgba(122,74,138,.18); color: #e0c3ea; border: 1px solid rgba(122,74,138,.55); }
.pos-duty-mainc { background: #e5484d; color: #fff; }
.pos-duty-subc { background: #f28b2e; color: #1a1205; }
.pos-duty-mainheal { background: #34c759; color: #0a1a10; }
.pos-duty-sunheal { background: #17a2b8; color: #fff; }
.pos-duty-slack { background: #6b7280; color: #fff; }
.wave-tag { display: inline-block; font-size: 11px; line-height: 1.7; padding: 0 6px; border-radius: 4px; margin-left: 6px;
  background: rgba(255,213,74,.08); color: var(--dnf-text-muted); border: 1px solid var(--dnf-border); }
.wave-tag.current { border-color: var(--dnf-accent); color: var(--dnf-gold-hi); font-weight: bold; }
```

在 `[data-theme="light"]` 块末尾（`.squad-4 .slot-cell` 覆盖之后、`/* 移动端 */` 之前）追加亮色覆盖：

```css
/* 编队标签亮色覆盖：队色 tag 文字加深保浅底对比度（职责实心色两主题通用） */
[data-theme="light"] .pos-group { color: var(--dnf-text-muted); }
[data-theme="light"] .pos-team-0 { color: #a12a1e; }
[data-theme="light"] .pos-team-1 { color: #8a6d0a; }
[data-theme="light"] .pos-team-2 { color: #2f5a29; }
[data-theme="light"] .pos-team-3 { color: #244b73; }
[data-theme="light"] .pos-team-4 { color: #5d3a6b; }
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建通过（vue-tsc 无新类型错误 + vite build 成功）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/styles/dnf.css
git commit -m "[feat] dnf.css：编队位置/波次标签样式（队伍描边淡底 + 职责实心色 + 亮色覆盖）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: RosterView FAB + NModal 弹框化（TDD）

**Files:**
- Modify: `frontend/src/views/RosterView.vue`
- Modify: `frontend/src/views/RosterView.spec.ts`

- [ ] **Step 1: 改写/新增测试**

`frontend/src/views/RosterView.spec.ts` 改动：

1a. 删除旧用例 L91-97（「左侧角色池 sticky 固定跟随」——该 DOM 已移除）。
1b. 改写 L84 用例「渲染角色池与网格」→ 断言 FAB 存在 + 打开弹框后角色池可见：

```ts
  it('渲染 FAB 与网格；点 FAB 打开角色池弹框', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="pool-fab"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="roster-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-act="pool-char-11"]').exists()).toBe(false)  // 弹框默认关闭
    await wrapper.find('[data-test="pool-fab"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-act="pool-char-11"]').exists()).toBe(true)   // 打开后池可见
  })
```

1c. 以下用例**先点 FAB 打开弹框**再交互（在 `wrapper.find(...)` 前插入两行 `await wrapper.find('[data-test="pool-fab"]').trigger('click'); await flushPromises()`）：
- 「非管理员只读」（L99）：开弹框 → 点 `pool-char-11` → 断言无 `.move-hint`。
- 「拿起→点空格」（L107）：开弹框 → 点 `pool-char-11` → 断言 `.move-hint` 含「奶」**且弹框已自动关闭**（`[data-act="pool-char-11"]` 不存在）→ 点 `.roster-slot .pick-btn`。
- 「拿起→点已占格」（L118）：开弹框 → 点 `pool-char-11` → 点 `.roster-slot.occupied`。
- 「推荐开关」（L146）：开弹框 → 断言 `pool-char-10` 文字。
- 「Esc 取消拿起态」（L196）：开弹框 → 点 `pool-char-11` → dispatch Escape。
- 「编队池工具栏添加临时选手」（L206）：开弹框 → 点 `add-guest`。
- 「非管理员不显示编队添加临时选手入口」（L218）：开弹框 → 断言 `add-guest` 不存在。
- 「已锁定攻坚不显示编队添加临时选手入口」（L224）：开弹框 → 断言 `add-guest` 不存在。

1d. 新增「拿起自动关弹框」断言（并入 L107 用例即可，见上）。

1e. 若 naive NModal 内容在 jsdom 下无法经 `teleport: true` stub 找到（fallback）：在 `mountView` 的 stubs 中去掉 `teleport: true`，改为通过 `document.body` 查询（如 `document.body.querySelector('[data-act="pool-char-11"]')`）并 `await flushPromises()`；或为 NModal 加 stub `NModal: { name: 'NModal', template: '<div><slot /></div>' }` 让内容直接内联渲染。以实际运行结果为准，选用能稳定断言的方式。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts`
Expected: FAIL —— FAB 不存在、旧 sticky 用例等

- [ ] **Step 3: 实现 RosterView.vue**

3a. import 追加：

```ts
import { NModal, NSwitch } from 'naive-ui'
import { inferFillDuty, loadTargets, placementByChar, rankCandidates, saveTargets, squadSlotsOf, RECOMMEND_KEY } from '../lib/roster'
import type { CharPlacement, SquadTarget, SquadTargets } from '../lib/roster'
```

3b. state 追加：`const poolOpen = ref(false)`。

3c. computed 追加（放在 `placed` 之后）：

```ts
const charPlacement = computed(() => placementByChar(store.raid?.waves ?? []))
const roundUserPos = computed<Map<number, CharPlacement>>(() => {
  const m = new Map<number, CharPlacement>()
  for (const w of currentGroups.value) {
    for (const s of w.slots) {
      if (s.character_id == null || s.owner_id == null) continue
      m.set(s.owner_id, { roundIndex: w.round_index, groupId: w.group_id, groupIndex: w.group_index,
                          squadIndex: s.squad_index, duty: s.duty, userId: s.owner_id })
    }
  }
  return m
})
const currentRound = computed(() => currentGroups.value[0]?.round_index ?? 0)
```

3d. `onPick` 追加关闭弹框：

```ts
function onPick(c: Character) {
  holding.value = holding.value?.id === c.id ? null : c
  poolOpen.value = false
}
```

3e. 模板：**删除**整个 `<aside ... data-test="roster-pool">...</aside>` 块（L245-257）。

3f. 模板：在 `</main>` 之后、`RosterTargetModal` 之前，追加 FAB + NModal：

```html
    <button class="roster-fab" data-test="pool-fab" title="打开角色池" @click="poolOpen = true">选人</button>

    <n-modal :show="poolOpen" preset="card" title="角色池" style="width:min(380px,92vw)"
             @update:show="(s: boolean) => { if (!s) poolOpen = false }">
      <RosterPool :signups="store.raid.signups" :blocked-char-ids="blockedCharIds"
                  :slack-char-ids="slackCharIds" :recommend-top3="recommendTop3"
                  :recommend-target="recommendTarget" :holding-id="holding?.id ?? null"
                  :can-edit="canEdit" :round-user-pos="roundUserPos"
                  :char-placement="charPlacement" :current-round="currentRound"
                  @pick="onPick">
        <template #toolbar-extra>
          <button v-if="canEdit && !store.raid.locked" class="dnf-btn dnf-btn-sm"
                  data-test="add-guest" @click="guestOpen = true">＋临时</button>
        </template>
      </RosterPool>
    </n-modal>
```

3g. `<style scoped>` 追加 FAB 样式：

```css
.roster-fab {
  position: fixed; right: 20px; bottom: 20px; z-index: 50;
  width: 52px; height: 52px; border-radius: 50%;
  border: 1px solid var(--dnf-gold-deep); background: linear-gradient(180deg, var(--dnf-panel-inner), var(--dnf-panel));
  color: var(--dnf-gold-hi); font-weight: bold; font-size: 13px; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .45);
}
.roster-fab:hover { border-color: var(--dnf-gold); }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts`
Expected: PASS（含改写/新增用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RosterView.vue frontend/src/views/RosterView.spec.ts
git commit -m "[feat] roster：角色池改右下角悬浮按钮 + 居中弹框，拿起自动关闭
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: CHANGELOG + 全量验证

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新 CHANGELOG**

在 `CHANGELOG.md` 的 `## [Unreleased]` 下追加（`### 新增` 补一条、`### 工程` 补一段，沿用现有措辞风格）：

```markdown
- **编队角色池弹框化 + 位置标签**：编队页左侧常驻角色池改为右下角悬浮按钮打开的居中弹框，小屏更省空间；角色池中「用户头」显示该用户当前波的职责胶囊（队色描边 tag + 职责实心 tag，并行团带团号），「角色行」显示该角色出现的波次标签，均纯展示、角色操作仍在网格表格
```

并在 `### 工程` 追加：

```markdown
- 前端 `lib/roster.ts` 新增 `CharPlacement` 类型与 `placementByChar` 纯函数（全波次占位映射）；`RosterView` 移除左侧 sticky `<aside>`、新增右下角 FAB + naive `NModal` 承载角色池（拿起即自动关闭）；`RosterPool` 新增 `roundUserPos`/`charPlacement`/`currentRound` props 渲染胶囊与波次标签；`dnf.css` 新增 `.pos-team-N`/`.pos-duty-*`/`.wave-tag` 标签样式与亮色主题覆盖
```

- [ ] **Step 2: 全量相关测试**

Run: `cd frontend && npx vitest run src/lib/roster.spec.ts src/components/RosterPool.spec.ts src/views/RosterView.spec.ts`
Expected: 全 PASS

- [ ] **Step 3: 全量构建（vue-tsc 类型检查）**

Run: `cd frontend && npm run build`
Expected: 构建通过

- [ ] **Step 4: 提交**

```bash
git add CHANGELOG.md
git commit -m "[docs] CHANGELOG：Unreleased 记录编队角色池弹框化 + 位置/波次标签
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 执行注意

- **提交风格**：`[feat]`/`[docs]` 方括号标签 + 中文描述 + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注；直接提交到 `main`（本仓库约定，不做 worktree）。
- **测试命令**：`cd frontend && npx vitest run <file>`；类型/构建 `cd frontend && npm run build`（= vue-tsc -b && vite build；esbuild 不做类型检查，类型错误以 build 为准）。
- **spec 测试风险**：naive `NModal` 在 jsdom 下的渲染/断言方式以实际运行结果为准（见 Task 4 Step 1e 的 fallback 策略）。
- **设计规格**：`docs/superpowers/specs/2026-10-20-roster-pool-popup-design.md`（含后端 replace:true 语义、配色、非目标、测试改写清单 L84/L99/L107/L118/L146/L196/L206/L218/L224/L232）。
