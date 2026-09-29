# 职业性别显示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在纯前端给「男女双版」职业的职业名追加 `（男）`/`（女）` 后缀（如 `重霄·漫游枪手（女）`、`光启·光明骑士（男）`），单性别职业（如 剑魂、驭剑士）不加。

**Architecture:** `lib/job.ts` 新增静态 `GENDER_SPLIT` 映射（job_name → 性别，覆盖 10 对男女双版职业）+ `jobGenderTitle(jobName, title)` 助手；在 5 个职业名展示处（CharacterCard、SignupModal、MyCharactersView、AdminUsersView 查询表与筛选下拉、CharacterForm 职业按钮与已选行）应用该助手。无后端改动。

**Tech Stack:** Vue 3 (`<script setup lang="ts">`) + Vitest。测试命令：`cd frontend && npx vitest run <file>`；构建/类型：`cd frontend && npm run build`（= vue-tsc -b && vite build）。

**Spec:** `docs/superpowers/specs/2026-09-29-job-gender-design.md`

**前置环境约定（务必遵守）：**
- 所有测试前需 `cd frontend`；vitest（esbuild）不做类型检查，类型错误靠 `npm run build` 暴露。
- 提交直接到 main（仓库既定约定）；提交信息用 `[feat]/[fix]/[docs]/[test]` + 中文描述 + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- 测试 fixture 里的 title（如 `神启·圣骑士`）与 `职业信息.json` 源数据（`光启·光明骑士`）不同，属历史 fixture，**不要**“修正”为源数据以免牵连无关断言。

---

### Task 1: `lib/job.ts` 性别助手 + 单测（TDD）

**Files:**
- Modify: `frontend/src/lib/job.ts`
- Test: `frontend/src/lib/job.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/job.spec.ts` 顶部 import 追加 `jobGenderTitle`，文件末尾新增 describe：

```ts
import { jobIcon, categoryIcon, ICON_FALLBACK, jobGenderTitle } from './job'
...
describe('jobGenderTitle', () => {
  it('男女双版职业追加性别后缀', () => {
    expect(jobGenderTitle('ranger_female', '重霄·漫游枪手')).toBe('重霄·漫游枪手（女）')
    expect(jobGenderTitle('crusader_male', '光启·光明骑士')).toBe('光启·光明骑士（男）')
  })
  it('男版无 _male 后缀的职业（蓝拳圣使）也能识别', () => {
    expect(jobGenderTitle('infighter', '光启·蓝拳圣使')).toBe('光启·蓝拳圣使（男）')
    expect(jobGenderTitle('infighter_female', '光启·蓝拳圣使')).toBe('光启·蓝拳圣使（女）')
  })
  it('单性别职业不加后缀', () => {
    expect(jobGenderTitle('weapon_master', '极诣·剑魂')).toBe('极诣·剑魂')
    expect(jobGenderTitle('sword_master', '极诣·驭剑士')).toBe('极诣·驭剑士')
  })
  it('空/未知参数容错返回原 title', () => {
    expect(jobGenderTitle(null, 'x')).toBe('x')
    expect(jobGenderTitle(undefined, 'x')).toBe('x')
    expect(jobGenderTitle('unknown_job', 'x')).toBe('x')
    expect(jobGenderTitle('weapon_master', null)).toBe('')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/job.spec.ts`
Expected: FAIL——`jobGenderTitle` 未导出（`is not a function` / 导入报错）。

- [ ] **Step 3: 实现 `lib/job.ts`**

文件末尾（`handleIconError` 之后）追加：

```ts
// 男女双版职业：job_name → 性别（纯前端展示层；对应职业信息.json 中 title 同时存在于男女大类的职业）。
// 注意：蓝拳圣使男版 job_name 为 infighter（无 _male 后缀），必须显式映射，不能靠后缀推断。
const GENDER_SPLIT: Record<string, '男' | '女'> = {
  ranger_male: '男', ranger_female: '女',
  launcher_male: '男', launcher_female: '女',
  mechanic_male: '男', mechanic_female: '女',
  spitfire_male: '男', spitfire_female: '女',
  crusader_male: '男', crusader_female: '女',
  infighter: '男', infighter_female: '女',
  nenmaster_male: '男', nenmaster_female: '女',
  striker_male: '男', striker_female: '女',
  brawler_male: '男', brawler_female: '女',
  grappler_male: '男', grappler_female: '女',
}

/** 男女双版职业在 title 后追加（男）/（女）；单性别或未知返回原 title。 */
export function jobGenderTitle(jobName: string | null | undefined, title: string | null | undefined): string {
  if (!jobName || !title) return title ?? ''
  const g = GENDER_SPLIT[jobName]
  return g ? `${title}（${g}）` : title
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/job.spec.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/job.ts frontend/src/lib/job.spec.ts
git commit -m "feat: 职业性别助手 jobGenderTitle（男女双版职业加后缀）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: CharacterCard + SignupModal 应用（TDD）

**Files:**
- Modify: `frontend/src/components/CharacterCard.vue`
- Modify: `frontend/src/components/SignupModal.vue`
- Test: `frontend/src/components/MemberCharactersModal.spec.ts`（经 CharacterCard 渲染）
- Test: `frontend/src/components/SignupModal.spec.ts`

- [ ] **Step 1: 写失败测试**

（a）`MemberCharactersModal.spec.ts` 末尾新增用例（fixture 含一个 `crusader_male` 角色以触发后缀）：

```ts
  it('男女双版职业显示性别后缀', async () => {
    apiMock.get.mockResolvedValue({ user, characters: [
      ...characters,
      { id: 12, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
        parent_name: 'priest_male', class_type: '辅助', fame: 1,
        simulated_damage: null, sustained_dps: null, buff_amount: 9000 },
    ] })
    const wrapper = mount(MemberCharactersModal, {
      props: { open: true, rid: 1, user, placed: {} },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('神启·圣骑士（男）')
    expect(wrapper.text()).not.toContain('极诣·剑魂（')   // weapon_master 单性别不带后缀
  })
```

（b）`SignupModal.spec.ts` 末尾新增用例（现有 chars fixture：剑魂 `weapon_master` + 奶 `crusader_male`）：

```ts
  it('男女双版职业显示性别后缀', async () => {
    const wrapper = mountModal()
    await flushPromises()
    const row1 = wrapper.find('[data-act="char-1"]').element.closest('.signup-char') as HTMLElement
    expect(row1.textContent).toContain('极诣·剑魂')
    expect(row1.textContent).not.toContain('极诣·剑魂（')
    const row2 = wrapper.find('[data-act="char-2"]').element.closest('.signup-char') as HTMLElement
    expect(row2.textContent).toContain('神启·圣骑士（男）')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/MemberCharactersModal.spec.ts src/components/SignupModal.spec.ts`
Expected: FAIL——`神启·圣骑士（男）` 未出现（现渲染 `神启·圣骑士`）。

- [ ] **Step 3: 实现**

（a）`CharacterCard.vue`：script 顶部 `import { jobIcon, handleIconError as onIconError } from '../lib/job'` 改为追加 `jobGenderTitle`；模板第 20 行：

```vue
      <span style="color:var(--dnf-text-muted);font-size:12px">
        {{ jobGenderTitle(character.job_name, character.job_title) }} · {{ character.class_type }} · 名望 {{ character.fame }}
      </span>
```

（b）`SignupModal.vue`：script 顶部 `import { jobIcon, handleIconError as onIconError } from '../lib/job'` 改为追加 `jobGenderTitle`；模板 `.c-job` 处（约 88 行）：

```vue
          <span class="c-job">
            <img :src="jobIcon(c.job_name)" @error="onIconError" class="job-icon" />
            {{ jobGenderTitle(c.job_name, c.job_title) }}
          </span>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/MemberCharactersModal.spec.ts src/components/SignupModal.spec.ts src/components/CharacterPickerModal.spec.ts`
Expected: 全部 PASS（含既有子串断言，后缀不影响）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/CharacterCard.vue frontend/src/components/SignupModal.vue frontend/src/components/MemberCharactersModal.spec.ts frontend/src/components/SignupModal.spec.ts
git commit -m "feat: 成员角色弹窗与报名弹窗职业名加性别后缀

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: MyCharactersView + CharacterForm 应用（TDD）

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`
- Modify: `frontend/src/components/CharacterForm.vue`
- Test: `frontend/src/views/MyCharactersView.spec.ts`

- [ ] **Step 1: 写失败测试 + 适配既有断言**

（a）`MyCharactersView.spec.ts:89` **必须修改**（CharacterForm「已选」行将被 `（男）` 中缀）：

```ts
    expect(wrapper.text()).toContain('已选：神启·圣骑士（男）（辅助职业）')
```

（b）`MyCharactersView.spec.ts` 末尾新增用例（卡片职业名加后缀；fixture 含 `crusader_male` 奶）：

```ts
  it('角色卡与职业选择器显示男女双版性别后缀', async () => {
    const charA = {
      id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出', fame: 100,
      simulated_damage: 680000, sustained_dps: 60000, buff_amount: null,
    }
    const charB = {
      id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
      parent_name: 'priest_male', class_type: '辅助', fame: 200,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000,
    }
    apiMock.get.mockResolvedValueOnce([charA, charB])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    expect(wrapper.text()).toContain('神启·圣骑士（男）')     // 卡片职业名
    expect(wrapper.text()).not.toContain('极诣·剑魂（')      // 单性别不加
    // 打开添加角色表单，职业按钮 title 带后缀
    await wrapper.find('button').trigger('click')
    await flushPromises()
    await wrapper.find('button[data-cat="priest_male"]').trigger('click')
    await wrapper.find('button[data-job="crusader_male"]').trigger('click')
    expect(wrapper.text()).toContain('已选：神启·圣骑士（男）（辅助职业）')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/MyCharactersView.spec.ts src/components/CharacterForm.spec.ts`
Expected: FAIL——第 89 行断言因 `（男）` 中缀失败；新用例 `神启·圣骑士（男）` 未出现。

- [ ] **Step 3: 实现**

（a）`MyCharactersView.vue`：script 顶部（应已有 `jobIcon`/`onIconError` import）追加 `jobGenderTitle`；模板第 83 行：

```vue
            <span style="color:var(--dnf-text-muted);font-size:12px">{{ jobGenderTitle(c.job_name, c.job_title) }} · {{ c.class_type }} · 名望 {{ c.fame }}</span>
```

（b）`CharacterForm.vue`：script import `{ categoryIcon, jobIcon, handleIconError as onIconError }` 改为追加 `jobGenderTitle`；模板第 73 行（职业按钮）与第 77 行（已选行）：

```vue
            <span style="display:block;font-size:11px">{{ jobGenderTitle(child.name, child.title) }}</span>
...
          已选：{{ jobGenderTitle(selectedJob.name, selectedJob.title) }}（{{ selectedJob.class_type }}职业）
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/MyCharactersView.spec.ts src/components/CharacterForm.spec.ts src/components/AdminUserCharactersModal.spec.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/MyCharactersView.vue frontend/src/components/CharacterForm.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "feat: 「我的角色」与职业选择器职业名加性别后缀

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: AdminUsersView 应用（TDD）

**Files:**
- Modify: `frontend/src/views/AdminUsersView.vue`
- Test: `frontend/src/views/AdminUsersView.spec.ts`

- [ ] **Step 1: 写失败测试**

`AdminUsersView.spec.ts` 末尾新增用例（需含一个 `crusader_male` 查询行与一个带男女双版的职业树）：

```ts
  it('角色查询表与职业筛选显示男女双版性别后缀', async () => {
    apiMock.get.mockResolvedValueOnce({ items: [{
      id: 1, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
      parent_name: 'priest_male', class_type: '辅助', fame: 1,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000,
      owner_id: 3, owner_nickname: '队员', owner_username: 'm', owner_is_banned: false,
    }], total: 1 })
    apiMock.getJobs.mockResolvedValueOnce([{
      id: 8, name: 'priest_male', title: '圣职者(男)', children: [
        { id: 0, name: 'crusader_male', title: '神启·圣骑士', class_type: '辅助' },
      ],
    }])
    const wrapper = mount(AdminUsersView, { global: { plugins: [] } })
    await flushPromises()
    expect(wrapper.text()).toContain('神启·圣骑士（男）')
  })
```

> 若该 spec 现有 mount 需要特定 global 配置（如 router/AdminNav stub），沿用既有 `mountView` 辅助；用例只需断言「查询表/筛选任一处出现 `神启·圣骑士（男）`」即可。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: FAIL——`神启·圣骑士（男）` 未出现。

- [ ] **Step 3: 实现**

`AdminUsersView.vue`：script 顶部新增 `import { jobGenderTitle } from '../lib/job'`；模板第 122 行（筛选下拉）与第 148 行（查询表）：

```vue
          <option v-for="j in flatJobs" :key="j.id" :value="j.name">{{ jobGenderTitle(j.name, j.title) }}</option>
...
            <td>{{ jobGenderTitle(c.job_name, c.job_title) }}</td>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: 全部 PASS（含既有查询/筛选用例，后缀不影响子串断言）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/AdminUsersView.vue frontend/src/views/AdminUsersView.spec.ts
git commit -m "feat: 管理角色查询表与职业筛选显示男女双版性别后缀

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 全量验证 + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 全量前端测试**

Run: `cd frontend && npx vitest run`
Expected: 全部 PASS（无回归）。

- [ ] **Step 2: 类型检查 + 构建**

Run: `cd frontend && npm run build`
Expected: `vue-tsc -b` 与 `vite build` 均通过。

- [ ] **Step 3: 更新 CHANGELOG**

`CHANGELOG.md` 的 `## [Unreleased]` 下追加一段：

```markdown
职业性别显示：男女双版职业（如 漫游枪手、光明骑士、气功师、蓝拳圣使 等）的职业名后追加「（男）/（女）」后缀（纯前端展示，如 重霄·漫游枪手（女）、光启·光明骑士（男））；单性别职业（如 剑魂、驭剑士）不加。
```

- [ ] **Step 4: 提交**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 新增职业性别显示"

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 5: 收尾验证**

Run: `cd frontend && npx vitest run && npm run build`
Expected: 全部 PASS + 构建成功。
