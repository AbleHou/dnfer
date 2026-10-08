# 占位灰显与划水数显示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 占位选人时超额划水角色灰显；报名行与报名角色弹框显示每人划水总数。

**Architecture:** 纯前端。`lib/slack.ts` 内部抽共享 `slackingByUser`，新增导出 `slackCountByUser`（`computeSlack` 契约不变）；`RaidDetailView` 已持有 `grayByUser`/`charsByUser`，新增 `slackCounts` computed，把 `grayByUser` 传给 `CharacterPickerModal`、把 `slackCount` 传给 `MemberCharactersModal`，并在报名行渲染「划水 N」。

**Tech Stack:** Vue 3 `<script setup>` + Pinia + naive-ui + Vitest。设计规格：`docs/superpowers/specs/2026-10-08-slack-placement-count-design.md`。

---

## 任务总览（文件结构）

| 文件 | 职责 |
|---|---|
| `frontend/src/lib/slack.ts`（+spec） | 抽 `slackingByUser`；`computeSlack` 复用；新增 `slackCountByUser` |
| `frontend/src/components/CharacterPickerModal.vue`（+spec） | 加 `grayByUser` prop + `currentPlayerId`，选人灰显 |
| `frontend/src/components/MemberCharactersModal.vue`（+spec） | 加 `slackCount` prop，列表上方显示「划水 N」 |
| `frontend/src/views/RaidDetailView.vue`（+spec） | `slackCounts` computed；报名行「划水 N」；透传 props |
| `CHANGELOG.md` | 更新条目 |

---

## Task 1: `lib/slack.ts` — 共享 `slackingByUser` + `slackCountByUser`

**Files:**
- Modify: `frontend/src/lib/slack.ts`
- Test: `frontend/src/lib/slack.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/slack.spec.ts` 顶部 import 加 `slackCountByUser`，文件末尾追加：

```ts
describe('slackCountByUser', () => {
  const rules: SlackRuleSet = {
    criteria: [{ class_type: '输出', metric: 'fame', value: 60000 }],
    exchange: [],
  }
  it('统计每人划水总数（不扣兑换额度）', () => {
    const a: Character = { ...output, id: 1, fame: 50000 }
    const b: Character = { ...output, id: 2, fame: 30000 }
    const c: Character = { ...output, id: 3, fame: 95000 } // 非划水
    expect(slackCountByUser(rules, { 5: [a, b, c], 6: [c] })).toEqual({ 5: 2, 6: 0 })
  })
  it('空规则为 0', () => {
    const a: Character = { ...output, id: 1, fame: 50000 }
    expect(slackCountByUser({ criteria: [], exchange: [] }, { 5: [a] })).toEqual({ 5: 0 })
  })
  it('职业不匹配与 null 指标不计入', () => {
    // 辅助职业不匹配输出规则；输出角色 buff_amount 为 null
    expect(slackCountByUser(rules, { 5: [support, output] })).toEqual({ 5: 1 })
  })
})
```

（`output`/`support` fixture 与 `SlackRuleSet`/`Character` import 已在文件内。）

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/slack.spec.ts`
Expected: FAIL（`slackCountByUser` 未导出）

- [ ] **Step 3: 实现**

`frontend/src/lib/slack.ts`：抽共享函数并重构 `computeSlack`，新增 `slackCountByUser`：

```ts
function slackingByUser(rules: SlackRuleSet, charsByUser: Record<number, Character[]>): Record<number, Character[]> {
  const out: Record<number, Character[]> = {}
  for (const [uid, chars] of Object.entries(charsByUser)) {
    out[Number(uid)] = chars.filter(c => isSlackingChar(c, rules.criteria))
  }
  return out
}

export function computeSlack(
  rules: SlackRuleSet,
  charsByUser: Record<number, Character[]>,
): Record<number, number[]> {
  const slacking = slackingByUser(rules, charsByUser)
  const out: Record<number, number[]> = {}
  for (const [uid, chars] of Object.entries(charsByUser)) {
    const n = Number(uid)
    const allowance = chars.reduce((acc, c) => acc + charExchangeCount(c, rules.exchange), 0)
    const excess = slacking[n].length - allowance
    out[n] = excess > 0 ? slacking[n].slice(-excess).map(c => c.id) : []
  }
  return out
}

export function slackCountByUser(
  rules: SlackRuleSet,
  charsByUser: Record<number, Character[]>,
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [uid, chars] of Object.entries(slackingByUser(rules, charsByUser))) {
    out[Number(uid)] = chars.length
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/slack.spec.ts`
Expected: PASS（既有 + 新增）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/slack.ts frontend/src/lib/slack.spec.ts
git commit -m "feat: lib/slack 抽 slackingByUser 并新增 slackCountByUser（划水总数）"
```

---

## Task 2: `CharacterPickerModal` 占位选人灰显

**Files:**
- Modify: `frontend/src/components/CharacterPickerModal.vue`
- Test: `frontend/src/components/CharacterPickerModal.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/CharacterPickerModal.spec.ts` 文件末尾追加（既有 fixture `playerA`(id1 剑魂 id11)、`mine`(id9 奶 id12) 已定义；auth mock user id=9）：

```ts
describe('CharacterPickerModal grayByUser', () => {
  function setup(grayByUser: Record<number, number[]>) {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    return mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9], grayByUser },
      global: { stubs: { teleport: true } },
    })
  }

  it('默认玩家（管理员）的灰色角色灰显', async () => {
    const wrapper = setup({ 9: [12] })
    await flushPromises()
    // 默认选管理员自己的「奶」id=12 → 灰显
    const grayed = wrapper.find('.char-pick.grayed')
    expect(grayed.exists()).toBe(true)
    expect(grayed.text()).toContain('奶')
  })
  it('切换玩家后按该玩家灰色 id 灰显', async () => {
    const wrapper = setup({ 1: [11] })
    await flushPromises()
    await wrapper.findComponent({ name: 'Select' }).vm.$emit('update:value', playerA.user.id)
    await flushPromises()
    const grayed = wrapper.find('.char-pick.grayed')
    expect(grayed.exists()).toBe(true)
    expect(grayed.text()).toContain('剑魂')
  })
  it('非灰色角色不灰显', async () => {
    const wrapper = setup({ 9: [] }) // 管理员灰色 id 为空 → 奶不灰
    await flushPromises()
    expect(wrapper.find('.char-pick.grayed').exists()).toBe(false)
    expect(wrapper.text()).toContain('奶')
  })
  it('成员模式按自己 id 灰显', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/me/characters') return [mine.characters[0]]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: false, grayByUser: { 9: [12] } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    const grayed = wrapper.find('.char-pick.grayed')
    expect(grayed.exists()).toBe(true)
    expect(grayed.text()).toContain('奶')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/CharacterPickerModal.spec.ts`
Expected: FAIL（`.char-pick.grayed` 不存在）

- [ ] **Step 3: 实现**

`frontend/src/components/CharacterPickerModal.vue`：
- props（withDefaults）加 `grayByUser?: Record<number, number[]>` 默认 `{}`：

```ts
const props = withDefaults(defineProps<{
  open: boolean; adminMode?: boolean; signupUserIds?: number[]
  signupCharsByUser?: Record<number, number[]>
  placed?: Record<number, CharacterPlacement>
  grayByUser?: Record<number, number[]>
}>(), { placed: () => ({}), signupCharsByUser: () => ({}), grayByUser: () => ({}) })
```

- 新增 computed（复用 `filterBySignup` 的 key 逻辑）：

```ts
const currentPlayerId = computed(() =>
  props.adminMode ? (playerId.value ?? -1) : (auth.user?.id ?? -1))
```

- `CharacterCard` 加 `:grayed`：

```html
      <CharacterCard v-for="c in characters" :key="c.id" :character="c"
                     :placement="placed[c.id] ?? null" :active="selected?.id === c.id"
                     :grayed="(grayByUser?.[currentPlayerId] ?? []).includes(c.id)"
                     @click="choose(c)" />
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/CharacterPickerModal.spec.ts`
Expected: PASS（既有 + 新增）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/CharacterPickerModal.vue frontend/src/components/CharacterPickerModal.spec.ts
git commit -m "feat: 占位选人弹框超额划水角色灰显（grayByUser prop）"
```

---

## Task 3: `MemberCharactersModal` 显示划水数

**Files:**
- Modify: `frontend/src/components/MemberCharactersModal.vue`
- Test: `frontend/src/components/MemberCharactersModal.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/MemberCharactersModal.spec.ts` 文件末尾追加：

```ts
  it('slackCount>0 显示划水数', async () => {
    apiMock.get.mockResolvedValue({ user, characters })
    const wrapper = mount(MemberCharactersModal, {
      props: { open: true, rid: 1, user, placed: {}, slackCount: 2 },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('划水 2')
  })

  it('slackCount 缺省/0 不显示', async () => {
    apiMock.get.mockResolvedValue({ user, characters })
    const zero = mount(MemberCharactersModal, {
      props: { open: true, rid: 1, user, placed: {}, slackCount: 0 },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(zero.text()).not.toContain('划水')
    const omitted = mount(MemberCharactersModal, {
      props: { open: true, rid: 1, user, placed: {} }, // 不传 slackCount
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(omitted.text()).not.toContain('划水')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/MemberCharactersModal.spec.ts`
Expected: FAIL（「划水 2」不显示）

- [ ] **Step 3: 实现**

`frontend/src/components/MemberCharactersModal.vue`：
- props 加 `slackCount?: number`：

```ts
const props = defineProps<{
  open: boolean; rid: number; user: User | null
  placed: Record<number, CharacterPlacement>
  grayIds?: number[]
  slackCount?: number
}>()
```

- 模板在滚动容器前加：

```html
    <p v-if="(slackCount ?? 0) > 0" class="slack-count">划水 {{ slackCount }}</p>
    <div style="max-height:60vh;overflow:auto">
```

- 该组件目前无 `<style>` 块，文件末尾新增一个 `<style scoped>` 块包含 `.slack-count` 规则：

```html
<style scoped>
.slack-count { margin: 0 0 8px; font-size: 12px; color: var(--dnf-text-muted,#9aa3b2); }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/MemberCharactersModal.spec.ts`
Expected: PASS（既有 + 新增）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/MemberCharactersModal.vue frontend/src/components/MemberCharactersModal.spec.ts
git commit -m "feat: 报名角色弹框顶部显示划水数（slackCount prop）"
```

---

## Task 4: `RaidDetailView` 接线

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`
- Test: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/views/RaidDetailView.spec.ts` 追加。已有 fixture：`memberChars`（id10 输出 fame 52000、id11 辅助 fame 40000）、`adminRow`（characters `[]`）、`memberRow`；`makeRaid` 已含空 `slack_rules`；stubs 含 `CharacterPickerModal`/`MemberCharactersModal`/`SlackRulesModal`；`member` 为 id3。

```ts
describe('RaidDetailView slack count & picker gray', () => {
  it('报名行显示划水总数（仅>0，团长行不显示）', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = { criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }], exchange: [] }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    // 成员：id10 输出 fame52000<200000 划水、id11 辅助不判 → 划水 1
    expect(wrapper.find('.signup-group').text()).toContain('划水 1')
    expect(wrapper.find('.signup-leader').text()).not.toContain('划水')
  })

  it('无规则时不显示划水', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('.signup-group').text()).not.toContain('划水')
  })

  it('grayByUser 传递到 CharacterPickerModal', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = { criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }], exchange: [] }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    const picker = wrapper.findComponent(CharacterPickerModal)
    expect((picker.props('grayByUser') as Record<number, number[]>)[3]).toContain(10) // member id3，灰色含 id10
  })

  it('slackCount 传递到 MemberCharactersModal', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = { criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }], exchange: [] }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    await wrapper.find('.signup-user').trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(MemberCharactersModal)
    expect(modal.props('slackCount')).toBe(1)
  })
})
```

（`CharacterPickerModal` 与 `MemberCharactersModal` 需在 spec 顶部 import，若尚未 import 则补。）

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: FAIL（划水 1 不显示 / props 未传）

- [ ] **Step 3: 实现**

`frontend/src/views/RaidDetailView.vue`：
- import 加 `slackCountByUser`：

```ts
import { computeSlack, slackCountByUser } from '../lib/slack'
```

- 新增 computed：

```ts
const slackCounts = computed(() =>
  slackCountByUser(store.raid?.slack_rules ?? { criteria: [], exchange: [] }, charsByUser.value))
```

- 报名行（非团长 `.signup-group`）的 `signup-count` 后追加：

```html
<span class="signup-count">{{ placedCount(s) }}/{{ s.characters.length }}<template v-if="(slackCounts[s.user.id] ?? 0) > 0"> · 划水 {{ slackCounts[s.user.id] }}</template></span>
```

- `CharacterPickerModal` 传 `:gray-by-user="grayByUser"`。
- `MemberCharactersModal` 传 `:slack-count="memberModalUser ? (slackCounts[memberModalUser.id] ?? 0) : 0"`。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: PASS（既有 15 + 新增 4）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RaidDetailView.vue frontend/src/views/RaidDetailView.spec.ts
git commit -m "feat: 报名行与弹框显示划水数，占位选人透传灰色 id"
```

---

## Task 5: CHANGELOG + 回归收尾

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新 CHANGELOG**

`CHANGELOG.md` [Unreleased] 的「攻坚划水位计算」条目补充（保持同一粗体条目）：

```markdown
- **攻坚划水位计算**：攻坚详情新增「划水规则设置」（仅管理员），配置两类规则——「划水名望」按 职业+数值类型+阈值 判定划水角色、「兑换标准」按数值兑换划水位置；系统按每人报名角色计算可兑换划水位，超出额度的划水角色在报名弹框与攻坚表格灰显（仅参考，不影响编队）；占位选人时超额划水角色同样灰显；报名行与报名角色弹框显示每人划水总数
```

- [ ] **Step 2: 前端全量回归 + 构建**

Run: `cd frontend && npx vitest run && npm run build`
Expected: 全 PASS + 构建成功

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全 PASS（244，本功能未改后端，回归确认）

- [ ] **Step 3: 提交**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 补充划水位占位灰显与划水数显示"
```
