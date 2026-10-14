# 冒险团信息进选人面板 + 我的角色按冒险团排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ①攻坚详情页「点击占位」选人弹窗（CharacterPickerModal）的角色卡片上显示冒险团；②「我的角色」页新增「按冒险团」前端排序（同团相邻、团内名望降序、未分组最后）。

**Architecture:** 纯前端两处改动。冒险团信息加到共享卡片组件 `CharacterCard.vue`（第三行 `冒险团：xxx`，`adventure_party_name` 为 null 不渲染），`CharacterPickerModal`/`MemberCharactersModal`/`AdminUserCharactersModal` 三弹窗统一生效。`MyCharactersView.vue` 扩 `SortMode` 为 `'type' | 'fame' | 'party'`，`sorted` computed 加 party 分支（`adventure_party_id ?? Infinity` 排 null 到末尾，团内名望降序 + id tie-break），头部加「按冒险团」按钮。

**Tech Stack:** Vue 3 `<script setup>` + Vitest + vue-tsc（frontend）。后端零改动。

**前置约定（务必遵守）**
- 提交直接到 main，不做 worktree。提交信息 `[feat]/[fix]/[test]/[ref]` + 中文，`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- 测试命令：前端 `cd /Users/able/toys/dnfer/frontend && npx vitest run <file>`；前端构建 `cd /Users/able/toys/dnfer/frontend && npm run build`。
- 规范文档：`docs/superpowers/specs/2026-10-14-party-picker-and-sort-design.md`（歧义时回看 spec）。

---

### Task 1: CharacterCard 显示冒险团

**Files:**
- Modify: `frontend/src/components/CharacterCard.vue`
- Test: `frontend/src/components/CharacterPickerModal.spec.ts`

- [ ] **Step 1: 写失败测试**（在 `CharacterPickerModal.spec.ts` 末尾追加 describe 块；成员模式 `/api/me/characters` 模式参照既有「成员模式按自己 id 灰显」用例）

```ts
describe('CharacterPickerModal adventure party', () => {
  it('角色卡片显示所属冒险团', async () => {
    const char = { id: 12, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
      parent_name: 'priest_male', class_type: '辅助', fame: 1, simulated_damage: null,
      sustained_dps: null, buff_amount: 9000, sun_buff: null,
      adventure_party_id: 7, adventure_party_name: '阿伟的冒险团' }
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/me/characters') return [char]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: false },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('冒险团：阿伟的冒险团')
  })

  it('无冒险团时不显示冒险团行', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/me/characters') return [mine.characters[0]] // mine 未设团字段
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: false },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('冒险团')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/CharacterPickerModal.spec.ts`
Expected: 新增「冒险团：阿伟的冒险团」用例 FAIL（卡片无该文本）；「无冒险团」用例 PASS（本就无该行）。

- [ ] **Step 3: 实现 `CharacterCard.vue`**（在战力行 `div`（行 22-26）之后、flex 列 `div` 闭合（行 27）之前插入；样式对齐 SlotActionModal 的 `var(--dnf-text-faint)` / `12px`）

```html
      <div v-if="character.adventure_party_name" style="color:var(--dnf-text-faint);font-size:12px;margin-top:2px">
        冒险团：{{ character.adventure_party_name }}
      </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/CharacterPickerModal.spec.ts`
Expected: 全 PASS（含新增两例与既有用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CharacterCard.vue frontend/src/components/CharacterPickerModal.spec.ts
git commit -m "[feat] 选人面板角色卡片显示冒险团"
```

---

### Task 2: MyCharactersView 按冒险团排序

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`
- Test: `frontend/src/views/MyCharactersView.spec.ts`

- [ ] **Step 1: 写失败测试**（在 `MyCharactersView.spec.ts` 的 `describe` 末尾追加两例；`mk(id, name, class_type, fame)` 已存在，用 spread 补团字段）

```ts
it('按冒险团排序：同团相邻、团内名望降序、未分组最后', async () => {
  apiMock.get.mockResolvedValueOnce([
    { ...mk(1, '无团奶', '辅助', 900), adventure_party_id: null, adventure_party_name: null },
    { ...mk(2, '甲输出', '输出', 100), adventure_party_id: 1, adventure_party_name: '甲团' },
    { ...mk(3, '甲奶', '辅助', 500), adventure_party_id: 1, adventure_party_name: '甲团' },
    { ...mk(4, '乙输出', '输出', 300), adventure_party_id: 2, adventure_party_name: '乙团' },
  ])
  const wrapper = mount(MyCharactersView)
  await flushPromises()
  const partyBtn = wrapper.findAll('button').find(b => b.text() === '按冒险团')!
  await partyBtn.trigger('click')
  await nextTick()
  expect(wrapper.findAll('.dnf-panel b').map(b => b.text()))
    .toEqual(['甲奶', '甲输出', '乙输出', '无团奶'])
})

it('按冒险团按钮激活高亮（按类型高亮取消）', async () => {
  const wrapper = mount(MyCharactersView)
  await flushPromises()
  const typeBtn = wrapper.findAll('button').find(b => b.text() === '按类型')!
  const partyBtn = wrapper.findAll('button').find(b => b.text() === '按冒险团')!
  expect(typeBtn.classes()).toContain('dnf-btn-primary')
  expect(partyBtn.classes()).not.toContain('dnf-btn-primary')
  await partyBtn.trigger('click')
  await nextTick()
  expect(partyBtn.classes()).toContain('dnf-btn-primary')
  expect(typeBtn.classes()).not.toContain('dnf-btn-primary')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/MyCharactersView.spec.ts`
Expected: 「按冒险团排序」用例 FAIL（无该按钮，find 抛错）；「高亮」用例 FAIL。

- [ ] **Step 3: 实现 `MyCharactersView.vue`**

① `SortMode` 扩为三值（行 17）：
```ts
type SortMode = 'type' | 'fame' | 'party'
```

② `sorted` computed 加 party 分支（行 21-25 的 `if (sortMode.value === 'fame') ...` 之后）：
```ts
    if (sortMode.value === 'party') {
      const pa = a.adventure_party_id ?? Infinity
      const pb = b.adventure_party_id ?? Infinity
      return pa - pb || b.fame - a.fame || a.id - b.id
    }
```

③ 头部「按名望」按钮之后加「按冒险团」按钮（`按名望` 在行 70-71，紧随其后）：
```html
        <button class="dnf-btn dnf-btn-sm" :class="{ 'dnf-btn-primary': sortMode === 'party' }"
                @click="sortMode = 'party'">按冒险团</button>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/MyCharactersView.spec.ts`
Expected: 全 PASS（含新增两例与既有用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/MyCharactersView.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "[feat] 我的角色页支持按冒险团排序"
```

---

### Task 3: 全量构建 + 测试回归

**Files:**（无新增）

- [ ] **Step 1: 前端构建 + 全量测试**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 构建 PASS（vue-tsc + vite，spec 也被 vue-tsc 检查）。

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run`
Expected: 全 PASS。若有失败修复（如既有 spec 文本断言受 CharacterCard 新行影响——已核查无，但仍以实际为准）。

- [ ] **Step 2: Commit（如有修复）**

```bash
git add -A
git commit -m "[fix] 冒险团展示/排序前端回归修复"
```

---

## 验收清单（对照 spec）

- [ ] `CharacterCard.vue` 显示 `冒险团：xxx`（null 不渲染）；`CharacterPickerModal.spec` 覆盖「显示/不显示」两分支。
- [ ] `MemberCharactersModal`/`AdminUserCharactersModal` 复用 CharacterCard，同步显示（无需单独改动）。
- [ ] `MyCharactersView` 支持「按冒险团」排序：同团相邻、团内名望降序、未分组（null）最后；按钮高亮。
- [ ] `npm run build` 通过；前端 vitest 全量绿。
