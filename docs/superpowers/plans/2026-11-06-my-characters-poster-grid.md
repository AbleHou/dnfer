# 「我的角色」九宫格海报改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「我的角色」页从横向条卡片列表改为 3:4 竖版海报 + 响应式九宫格，profile 图来自 `images/characters/{parent}/{job}/profile.png`，创建/编辑改弹窗。

**Architecture:** 后端新增 `/characters-images` 静态挂载（config 加 `characters_dir`）供 profile 图访问；前端 `lib/job.ts` 加 `characterProfile()` 路径函数，新增 `CharacterPoster.vue` 纯展示海报卡片（含缺图兜底），`MyCharactersView.vue` 重构为 900px 自适应 grid + DnfDialog 弹窗承载现有 `CharacterForm`。

**Tech Stack:** FastAPI / SQLAlchemy（后端静态挂载）、Vue 3 `<script setup>` + `@dnftools/ui`（DnfDialog/DnfIconButton/DnfIcon）+ Vitest + vue-tsc。

**Spec:** `docs/superpowers/specs/2026-11-06-my-characters-poster-grid-design.md`

---

### Task 1: 后端静态挂载 `/characters-images` + vite 代理

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py:73-76`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: config.py 增加 `characters_dir`**

在 `backend/app/config.py` 的 `images_dir: str = "../images/adventure"` 之后加一行：

```python
    characters_dir: str = "../images/characters"
```

- [ ] **Step 2: main.py 增加 `/characters-images` 挂载**

把 `backend/app/main.py:73-76` 的 `/images` try/except 块，改成两个并列挂载（`/characters-images` 放前面，`/images` 放后面）：

```python
try:
    app.mount("/characters-images", StaticFiles(directory=settings.characters_dir), name="characters-images")
except RuntimeError:
    logger.warning("角色海报目录 %s 不存在，跳过挂载", settings.characters_dir)

try:
    app.mount("/images", StaticFiles(directory=settings.images_dir), name="images")
except RuntimeError:
    logger.warning("职业图标目录 %s 不存在，跳过挂载", settings.images_dir)
```

- [ ] **Step 3: vite.config.ts 增加代理**

`frontend/vite.config.ts` 的 `server.proxy` 里，`'/images': 'http://localhost:8000'` 之后加：

```ts
      '/characters-images': 'http://localhost:8000',
```

- [ ] **Step 4: 验证静态挂载**

从 `backend/` 目录运行（不启服务，用 TestClient 直接打）：

```bash
cd backend && .venv/bin/python -c "from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); r=c.get('/characters-images/archer/hunter/profile.png'); print(r.status_code, r.headers.get('content-type'))"
```

Expected: `200 image/png`（若本机无该图片目录，应输出 404 而非启动报错——目录存在时走正常路径）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/config.py backend/app/main.py frontend/vite.config.ts
git commit -m "[fet] 角色海报：后端挂载 /characters-images 静态目录 + vite 代理"
```

---

### Task 2: `characterProfile` 路径拼接函数（TDD）

**Files:**
- Modify: `frontend/src/lib/job.ts`
- Test: `frontend/src/lib/job.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/job.spec.ts` 现有 import 处追加 `characterProfile`，并新增用例：

```ts
it('characterProfile 拼接角色海报路径', () => {
  expect(characterProfile('archer', 'hunter')).toBe('/characters-images/archer/hunter/profile.png')
})
```

- [ ] **Step 2: 运行确认失败**

```bash
cd frontend && npx vitest run src/lib/job.spec.ts
```

Expected: FAIL——`characterProfile is not defined`（或 TS 报错）。

- [ ] **Step 3: 实现**

`frontend/src/lib/job.ts` 顶部（`jobIcon` 旁）加：

```ts
export function characterProfile(parentName: string, jobName: string): string {
  return `/characters-images/${parentName}/${jobName}/profile.png`
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd frontend && npx vitest run src/lib/job.spec.ts
```

Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/job.ts frontend/src/lib/job.spec.ts
git commit -m "[fet] 角色海报：characterProfile 路径拼接函数"
```

---

### Task 3: 新增 `CharacterPoster.vue` 海报卡片组件（TDD）

**Files:**
- Create: `frontend/src/components/CharacterPoster.vue`
- Test: `frontend/src/components/CharacterPoster.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/CharacterPoster.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CharacterPoster from './CharacterPoster.vue'
import type { Character } from '../types'

function mkChar(over: Partial<Character> = {}): Character {
  return { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 20000,
    simulated_damage: 68, sustained_dps: 6, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: 10000, str_int: 5000, elemental: 300, atk_power: 100, atk_power_amp: 20,
    skill_atk: 50, combat_power: 250271, ...over }
}

describe('CharacterPoster', () => {
  it('主图 src 为 characterProfile 拼接的 profile 路径', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
  })

  it('profile 加载失败切换深底 + 职业图标兜底（仅一次）', async () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    await w.find('.cover').trigger('error')
    expect(w.find('.fallback').exists()).toBe(true)
    expect(w.find('.fallback-icon').attributes('src')).toBe('/images/jobs/weapon_master.png')
    // 兜底后再 error 不切换回（无循环）
    await w.find('.fallback-icon').trigger('error')
    expect(w.find('.fallback').exists()).toBe(true)
  })

  // 注意：simulated_damage/sustained_dps 存储单位即「亿」，fmtDps(n) = `${n}亿`
  it('输出角色第一行显示名望+战斗力（千分位），第二行显示模拟/秒伤', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    expect(w.find('.line1').text()).toContain('名望 20000 · 战斗力 250,271')
    expect(w.find('.line2').text()).toBe('模拟 68亿 · 秒伤 6亿')
  })

  it('输出角色战斗力为空显示暂无', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar({ combat_power: null }) } })
    expect(w.find('.line1').text()).toContain('名望 20000 · 战斗力 暂无')
  })

  it('输出/辅助角色明细为 null 时第二行显示暂无', () => {
    const out = mkChar({ simulated_damage: null, sustained_dps: null })
    const w1 = mount(CharacterPoster, { props: { character: out } })
    expect(w1.find('.line2').text()).toBe('模拟 暂无 · 秒伤 暂无')
    const sup = mkChar({ class_type: '辅助', combat_power: null, buff_amount: null, sun_buff: null })
    const w2 = mount(CharacterPoster, { props: { character: sup } })
    expect(w2.find('.line2').text()).toBe('增益 暂无 · 太阳 暂无')
  })

  it('辅助角色不显示战斗力，第二行显示增益/太阳', () => {
    const sup = mkChar({ name: '奶', class_type: '辅助', fame: 200, combat_power: null,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000, sun_buff: 3000 })
    const w = mount(CharacterPoster, { props: { character: sup } })
    expect(w.find('.line1').text()).toContain('名望 200')
    expect(w.find('.line1').text()).not.toContain('战斗力')
    expect(w.find('.line2').text()).toBe('增益 9000 · 太阳 3000')
  })

  it('有冒险团时第一行追加团名', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar({ adventure_party_id: 7, adventure_party_name: '阿伟的冒险团' }) } })
    expect(w.find('.line1').text()).toContain('名望 20000 · 战斗力 250,271 · 阿伟的冒险团')
  })

  it('点击海报 emit click，点删除按钮 emit delete 且不冒泡 click', async () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    await w.find('.char-poster').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
    await w.find('.poster-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    expect(w.emitted('click')).toHaveLength(1)   // delete 不冒泡
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
cd frontend && npx vitest run src/components/CharacterPoster.spec.ts
```

Expected: FAIL——找不到模块 `./CharacterPoster.vue`。

- [ ] **Step 3: 实现组件**

创建 `frontend/src/components/CharacterPoster.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { DnfIconButton } from '@dnftools/ui'
import { characterProfile, jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character } from '../types'

const props = defineProps<{ character: Character }>()
const emit = defineEmits<{ (e: 'click'): void; (e: 'delete'): void }>()

const src = computed(() => characterProfile(props.character.parent_name, props.character.job_name))
// profile 图加载失败 → 切换深色底 + 职业图标（state flag 保证只切一次，防循环）
const fallbackUsed = ref(false)
function onImgError() { fallbackUsed.value = true }

function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
function fmtPower(n: number | null): string { return n == null ? '暂无' : n.toLocaleString('en-US') }

const line1 = computed(() => {
  const parts = [`名望 ${props.character.fame}`]
  if (props.character.class_type === '输出') parts.push(`战斗力 ${fmtPower(props.character.combat_power)}`)
  if (props.character.adventure_party_name) parts.push(props.character.adventure_party_name)
  return parts.join(' · ')
})
const line2 = computed(() => props.character.class_type === '输出'
  ? `模拟 ${fmtDps(props.character.simulated_damage)} · 秒伤 ${fmtDps(props.character.sustained_dps)}`
  : `增益 ${fmtBuff(props.character.buff_amount)} · 太阳 ${fmtBuff(props.character.sun_buff)}`)
</script>

<template>
  <div class="char-poster" @click="emit('click')">
    <div class="poster-img">
      <img v-if="!fallbackUsed" :src="src" class="cover" alt="" @error="onImgError">
      <div v-else class="fallback">
        <img :src="jobIcon(character.job_name)" class="fallback-icon" alt="" @error="onIconError">
      </div>
    </div>
    <div class="grad"></div>
    <div class="poster-info">
      <img :src="jobIcon(character.job_name)" class="job-icon" alt="" @error="onIconError">
      <div class="name-col">
        <span class="line1"><b class="poster-name">{{ character.name }}</b><span class="meta">{{ line1 }}</span></span>
        <span class="line2">{{ line2 }}</span>
      </div>
    </div>
    <DnfIconButton class="poster-delete" label="删除角色" icon="npc-close" @click.stop="emit('delete')" />
  </div>
</template>

<style scoped>
.char-poster { position: relative; aspect-ratio: 3/4; border-radius: 8px; overflow: hidden;
  cursor: pointer; background: var(--dnf-bg, #1a1b22); box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.poster-img { position: absolute; inset: 0; }
.poster-img .cover { width: 100%; height: 100%; object-fit: cover; display: block; }
.fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: #1a1b22; }
.fallback-icon { width: 60%; height: 60%; object-fit: contain; opacity: .6; }
.grad { position: absolute; inset: auto 0 0 0; height: 55%; pointer-events: none;
  background: linear-gradient(to top, rgba(0,0,0,.88), transparent); }
.poster-info { position: absolute; left: 8px; right: 8px; bottom: 8px; color: #fff;
  display: flex; align-items: flex-start; gap: 6px; pointer-events: none; }
.job-icon { width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0; margin-top: 1px; }
.name-col { line-height: 1.3; min-width: 0; }
.line1 { font-size: 13px; font-weight: bold; }
.line1 .meta { display: block; font-weight: normal; font-size: 10px; opacity: .85; }
.line2 { display: block; font-size: 10px; opacity: .75; }
.poster-delete { position: absolute; top: 6px; right: 6px; z-index: 2; }
</style>
```

- [ ] **Step 4: 运行确认通过**

```bash
cd frontend && npx vitest run src/components/CharacterPoster.spec.ts
```

Expected: PASS（全部用例）。若 `.fallback-icon` 的 error 触发后无断言问题即可。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/CharacterPoster.vue frontend/src/components/CharacterPoster.spec.ts
git commit -m "[fet] 角色海报：新增 CharacterPoster 海报卡片组件（含缺图兜底）"
```

---

### Task 4: `MyCharactersView.vue` 改造为海报网格 + 弹窗创建/编辑

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`
- Test: `frontend/src/views/MyCharactersView.spec.ts`

- [ ] **Step 1: 重构视图（先改代码，再逐步改测试）**

重写 `frontend/src/views/MyCharactersView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DnfButton, DnfDialog, DnfSelect } from '@dnftools/ui'
import { api } from '../api/client'
import CharacterForm from '../components/CharacterForm.vue'
import CharacterPoster from '../components/CharacterPoster.vue'
import AdventurePartyModal from '../components/AdventurePartyModal.vue'
import { confirmDialog, notifyError } from '../lib/notify'
import type { Character, JobCategory } from '../types'

const list = ref<Character[]>([])
const categories = ref<JobCategory[]>([])
const showForm = ref(false)
const editing = ref<Character | null>(null)
const error = ref('')
const partyModalOpen = ref(false)

type SortMode = 'type' | 'fame' | 'party'
const sortMode = ref<SortMode>('type')
const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'type', label: '按类型' },
  { value: 'fame', label: '按名望' },
  { value: 'party', label: '按冒险团' },
]
const TYPE_RANK: Record<Character['class_type'], number> = { 输出: 0, 辅助: 1 }

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

async function load() {
  try {
    const [chars, cats] = await Promise.all([
      api.get<Character[]>('/api/me/characters'),
      api.getJobs(),
    ])
    list.value = chars
    categories.value = cats
  } catch (e: any) {
    error.value = e.message
  }
}
onMounted(load)

function startCreate() { editing.value = null; showForm.value = true }
function startEdit(c: Character) { editing.value = c; showForm.value = true }
async function onSaved() { showForm.value = false; editing.value = null; await load() }
function onCancel() { showForm.value = false; editing.value = null }

async function remove(c: Character) {
  const ok = await confirmDialog({ content: `删除角色 ${c.name}？` })
  if (!ok) return
  try { await api.del(`/api/me/characters/${c.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
</script>

<template>
  <div class="dnf-page" style="max-width:900px">
    <div class="page-head">
      <h2>我的角色</h2>
      <div style="display:flex;align-items:center;gap:8px">
        <DnfButton tone="gold" class="dnf-btn-sm" @click="startCreate">＋ 添加角色</DnfButton>
        <DnfButton class="dnf-btn-sm" data-act="manage-parties"
                   @click="partyModalOpen = true">冒险团管理</DnfButton>
        <DnfSelect :model-value="sortMode" :options="sortOptions" label="排序"
                   data-act="sort-select" style="width:130px"
                   @update:model-value="(v) => sortMode = v as SortMode" />
      </div>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="char-grid">
      <CharacterPoster v-for="c in sorted" :key="c.id" :character="c"
                       @click="startEdit(c)" @delete="remove(c)" />
    </div>
    <p v-if="!list.length" style="color:var(--dnf-text-faint)">还没有角色</p>

    <DnfDialog :open="showForm" :title="editing ? '编辑角色' : '添加角色'" width="min(560px,92vw)"
               modal close-on-outside
               @update:open="(s: boolean) => { if (!s) onCancel() }">
      <CharacterForm :categories="categories" :editing="editing" @saved="onSaved" @cancel="onCancel" />
    </DnfDialog>

    <AdventurePartyModal :open="partyModalOpen"
                         @close="partyModalOpen = false"
                         @changed="load" />
  </div>
</template>

<style scoped>
.char-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px; margin: 12px 0; }
</style>
```

- [ ] **Step 2: 更新测试（按改动映射）**

修改 `frontend/src/views/MyCharactersView.spec.ts`：

(a) 所有**需要与创建/编辑弹窗交互**的 mount 增加 `global: { stubs: { teleport: true } }`。注意：`frontend/src/test/setup.ts` 已全局 stub `DialogPortal` 让 DnfDialog 内容内联渲染（`wrapper.text()` 可查），teleport stub 实际是冗余但无害——对齐 ProfilePanel/AdventurePartyModal 等既有 dialog spec 的做法，保持一致性即可。需要加该 stub 的既有用例：`selecting an output job...`、`selecting a support job...`、`edit pre-selects...`、`save without picking a job...`、`角色卡与职业选择器显示男女双版性别后缀`（其职业选择器交互在弹窗内）。

(b) **删除/替换**不再适用的用例：
- 「edit form renders inline right below the edited card」→ 删除
- 「create form renders below the header, not after the list」→ 改为「点添加角色按钮 → 弹窗内出现『请先选择职业』（CharacterForm 默认提示；不能用『添加角色』，页头按钮也含该文案）」
- 「clicking a character card closes the open edit form」→ 改为「点海报 → 编辑弹窗打开」

(c) **编辑路径**改由海报触发：`findAll('button').find(b => b.text() === '编辑')` 不再存在，改为 `wrapper.findAll('.char-poster').find(w => w.text().includes('奶'))` 触发 click。

(d) **排序/性别断言定位**从 `findAllComponents({ name: 'DnfFrame' }).flatMap(f => f.findAll('b'))` 改为 `wrapper.findAll('.poster-name').map(el => el.text())`。

(e) **卡片文案断言**调整：
- 「角色卡与职业选择器显示男女双版性别后缀」：删掉卡片含 `神启·圣骑士（男）` 的断言（海报不再显示职业名），只保留职业选择器部分
- 「角色卡片副标题追加冒险团名」：改为断言 `名望 100 · 战斗力 暂无 · 阿伟的冒险团`
- 「输出角色卡片展示战斗力」等：断言 `名望 20000 · 战斗力 250,271`、`not.toContain('战斗力 暂无')`、`名望 200`（海报第一行文案，仍成立）

具体改写后的关键用例（替换对应旧用例）：

```ts
// 编辑：点海报 → 弹窗打开并预选职业 → put 保存
it('edit pre-selects the character job from the picker and saves via put', async () => {
  const char = {
    id: 1, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 1,
    simulated_damage: null, sustained_dps: null, buff_amount: 9000, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null,
  }
  apiMock.get.mockResolvedValueOnce([char])
  const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
  await flushPromises()
  await wrapper.findAll('.char-poster').find(w => w.text().includes('奶'))!.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('已选：神启·圣骑士（男）（辅助职业）')
  await wrapper.find('button[data-act="save"]').trigger('click')
  await flushPromises()
  const [url, body] = apiMock.put.mock.calls[0]
  expect(url).toBe('/api/me/characters/1')
  expect(body.job_name).toBe('crusader_male')
})

// 点海报打开编辑弹窗
it('点击海报打开编辑弹窗', async () => {
  const char = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 100,
    simulated_damage: 680000, sustained_dps: 60000, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null }
  apiMock.get.mockResolvedValueOnce([char])
  const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
  await flushPromises()
  expect(wrapper.text()).not.toContain('编辑角色')
  await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('编辑角色')
})

// 点添加角色 → 创建弹窗打开（断言仅弹窗出现的文案，避免被页头按钮「＋ 添加角色」误判）
it('点添加角色按钮打开创建弹窗', async () => {
  const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
  await flushPromises()
  expect(wrapper.text()).not.toContain('请先选择职业')   // 弹窗未开
  await wrapper.find('button').trigger('click')          // 添加角色
  await flushPromises()
  expect(wrapper.text()).toContain('请先选择职业')       // CharacterForm 默认提示，证明弹窗已渲染
})

// 右上角删除按钮 → confirmDialog → api.del
it('海报右上角删除按钮删除角色', async () => {
  const char = { id: 5, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 100,
    simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null }
  apiMock.get.mockResolvedValueOnce([char])
  const wrapper = mount(MyCharactersView)
  await flushPromises()
  await wrapper.find('.poster-delete').trigger('click')
  await flushPromises()
  expect(apiMock.del).toHaveBeenCalledWith('/api/me/characters/5')
})
```

- [ ] **Step 3: 跑视图测试并修到通过**

```bash
cd frontend && npx vitest run src/views/MyCharactersView.spec.ts
```

Expected: PASS。若个别用例因 DnfDialog 内部渲染差异（如 `已选：` 文案、`wrapper.find('button')` 首按钮）失败，用 `wrapper.findAll('button')` 按文本定位或调整断言，不要改回旧交互。

- [ ] **Step 4: 跑全部前端测试确认无回归**

```bash
cd frontend && npx vitest run
```

Expected: 全绿（其他模块测试不应受影响）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/MyCharactersView.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "[fet] 我的角色：九宫格海报网格 + 弹窗创建/编辑"
```

---

### Task 5: 全量验证（类型检查 + 后端烟测）

**Files:** 无（验证用）

- [ ] **Step 1: vue-tsc + 构建**

```bash
cd frontend && npm run build
```

Expected: 构建成功（vue-tsc 类型检查通过 + vite build 产出）。若 TS 报错（如 spec fixture 缺字段、DnfIconButton 类型），修复对应文件后重跑。

- [ ] **Step 2: 后端测试套件冒烟**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: 全绿（后端改动仅为静态挂载，不应影响既有测试）。

- [ ] **Step 3: 提交收尾**

如有 Task 5 产生的修复，单独提交：

```bash
git add -A frontend/src backend/app
git commit -m "[fix] 角色海报：构建/测试修复"
```

---

## 验证清单（完成标准）

- [ ] `cd frontend && npx vitest run` 全绿
- [ ] `cd frontend && npm run build` 通过（vue-tsc）
- [ ] `cd backend && .venv/bin/python -m pytest -q` 全绿
- [ ] 浏览器打开「我的角色」：海报 3:4、九宫格列数随宽度自适应、底部两行信息、右上角 `npc-close` 删除、点击海报弹编辑、添加角色弹创建、`imperialknight/breaker` 与 `priest_female/infighter_female` 显示深底+职业图标兜底
