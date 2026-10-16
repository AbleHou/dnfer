# 攻坚互不影响 + 报名强制选角色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉「一个角色全局只能占一个格子」的设定（改为 raid 内唯一），并让 web 自助/代报名入口强制选角色（默认全选）。

**Architecture:** 后端 `fill_slot` 的两处全局 `char_dup`/`dup` 查询加 `Slot.wave.has(raid_id=raid.id)` 限定到本 raid；`SignupUserIn` 加可选 `character_ids` 并由 `admin_signup` 透传。前端 `SignupModal` 加 `charactersUrl` prop；RaidListView 一键报名改为弹 SignupModal；SignupMemberPicker 选人后弹 SignupModal 选角色。机器人 skill 与 guest 代报名保持默认全选。

**Tech Stack:** FastAPI + SQLAlchemy 2（backend，venv `backend/.venv`）+ Vue 3 `<script setup>` + naive-ui + Vitest（frontend）。测试命令：后端 `cd backend && .venv/bin/python -m pytest <file> -v`；前端 `cd frontend && npx vitest run <file>`；类型/构建 `cd frontend && npm run build`。

**前置注意（重要）：** `frontend/src/views/RaidListView.vue`、`RaidListView.spec.ts`、`CHANGELOG.md` 当前有**用户既有未提交工作**（攻坚列表「整卡可点」功能，非本计划内容）。本计划 Task 1 先把它单独提交，之后本计划的改动能以干净 diff 呈现。提交只 add 这三个文件，勿带其他文件。

**Spec:** `docs/superpowers/specs/2026-10-16-raid-independence-design.md`

---

### Task 1: 前置 — 提交既有「攻坚列表整卡可点」未提交工作

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `frontend/src/views/RaidListView.vue`
- Modify: `frontend/src/views/RaidListView.spec.ts`

- [ ] **Step 1: 确认现状**

Run: `git status --short`
Expected: `M CHANGELOG.md`、`M frontend/src/views/RaidListView.spec.ts`、`M frontend/src/views/RaidListView.vue`（以及无关的 `?? docs/usage/`）。

Run: `git diff frontend/src/views/RaidListView.vue`
Expected: 是「整卡可点」（`.raid-link` 拉伸整卡 + 名称下划线），不是本计划内容。

- [ ] **Step 2: 先跑一次既有前端测试确认绿**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidListView.spec.ts`
Expected: PASS（既有「整卡可点」spec 全绿）。

- [ ] **Step 3: 单独提交既有工作**

```bash
cd /Users/able/toys/dnfer
git add CHANGELOG.md frontend/src/views/RaidListView.vue frontend/src/views/RaidListView.spec.ts
git commit -m "$(cat <<'EOF'
[feat] 攻坚列表整卡可点（信息区整体可进入详情，按钮保持独立）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

Run: `git log --oneline -1`
Expected: 新提交在顶部；`git status --short` 只剩 `?? docs/usage/` 与本计划无关。

---

### Task 2: 后端 — `fill_slot` 去重限定 raid（TDD）

**Files:**
- Modify: `backend/app/routers/raids.py:380-407`（replace 分支 `char_dup` + 非 replace 分支 `dup`）
- Test: `backend/tests/test_raids.py`（新增 2 用例）

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_raids.py` 末尾新增两个用例：

```python
def test_same_character_can_fill_across_raids(client):
    """去掉全局唯一后：同一角色可在两个攻坚同时占位（互不撤格）。"""
    ah = _admin(client)
    h, _ = register_user(client, "px1", "元")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "job_name": "weapon_master", "fame": 1}).json()["id"]
    r1 = make_raid(client, ah)
    r2 = make_raid(client, ah)
    signup(client, r1["id"], h)
    signup(client, r2["id"], h)
    s1 = client.get(f"/api/raids/{r1['id']}", headers=h).json()["waves"][0]["slots"][0]
    s2 = client.get(f"/api/raids/{r2['id']}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{r1['id']}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    # 在 r2 以 replace 填同一角色：不应撤下 r1 的占位
    r = client.post(f"/api/raids/{r2['id']}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": cid, "replace": True})
    assert r.status_code == 200
    assert r.json()["removed_slots"] == []
    d1 = client.get(f"/api/raids/{r1['id']}", headers=h).json()["waves"][0]["slots"][0]
    d2 = client.get(f"/api/raids/{r2['id']}", headers=h).json()["waves"][0]["slots"][0]
    assert d1["character_id"] == cid
    assert d2["character_id"] == cid


def test_non_replace_same_character_across_raids_ok(client):
    """非 replace 跨攻坚填同一角色：不再 400（「该角色已在其他格子中」仅限本 raid）。"""
    ah = _admin(client)
    h, _ = register_user(client, "px2", "元")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "job_name": "weapon_master", "fame": 1}).json()["id"]
    r1 = make_raid(client, ah)
    r2 = make_raid(client, ah)
    signup(client, r1["id"], h)
    signup(client, r2["id"], h)
    s1 = client.get(f"/api/raids/{r1['id']}", headers=h).json()["waves"][0]["slots"][0]
    s2 = client.get(f"/api/raids/{r2['id']}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{r1['id']}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    r = client.post(f"/api/raids/{r2['id']}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 200
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raids.py -v -k "across_raids"`
Expected: 2 个 FAIL——`test_same_character_can_fill_across_raids` 当前 replace 会撤 r1 格（`removed_slots` 非空）；`test_non_replace_same_character_across_raids_ok` 当前 `dup` 全局命中 r1 → 400。

- [ ] **Step 3: 实现——`char_dup`/`dup` 限定 raid**

`backend/app/routers/raids.py` replace 分支（现约 383-384 行）改为：

```python
        char_dup = db.query(Slot).filter(
            Slot.wave.has(raid_id=raid.id),          # 新增：限定本 raid
            Slot.character_id == char.id,
            Slot.id != slot.id).all()
```

非 replace 分支（现约 396-397 行）改为：

```python
        dup = db.query(Slot).filter(Slot.wave.has(raid_id=raid.id),  # 新增：限定本 raid
                                    Slot.character_id == char.id,
                                    Slot.id != slot.id).first()
```

（`Slot.wave.has(...)` 与 `_remove_signup`/`remove_signup_character` 既有写法一致；`same_owner` 同轮限一不动。）

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raids.py -v -k "across_raids"`
Expected: 2 PASS。

- [ ] **Step 5: 全量后端回归（raid 内规则不回归）**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raids.py tests/test_raid_parallel.py tests/test_raid_signup_characters.py -q`
Expected: 全 PASS——尤其 `test_character_unique_across_waves`（同 raid 非 replace 400）、`test_fill_replace_moves_same_character`（同 raid 跨波 replace）、`test_fill_replace_across_parallel_waves`（并行波 replace）不回归。

- [ ] **Step 6: 提交**

```bash
cd /Users/able/toys/dnfer
git add backend/app/routers/raids.py backend/tests/test_raids.py
git commit -m "$(cat <<'EOF'
[fix] fill_slot 去重限定本 raid：跨攻坚占位共存，不再全局撤格

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 后端 — `admin_signup` 支持 `character_ids`（TDD）

**Files:**
- Modify: `backend/app/schemas.py:142-143`（`SignupUserIn`）
- Modify: `backend/app/routers/raids.py:722`（`admin_signup` 透传）
- Test: `backend/tests/test_raid_signup_characters.py`（新增 2 用例）

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_raid_signup_characters.py` 的 `test_admin_signup_no_character_target_rejected`（约 225 行）之后新增：

```python
def test_admin_signup_with_character_subset(client):
    """admin 代报名可指定勾选角色子集（不传仍默认全选）。"""
    ah = _admin(client)
    h, u = register_user(client, "sc20", "亥")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/signups", headers=ah,
                       json={"user_id": u["id"], "character_ids": [c1]}).status_code == 200
    assert _char_ids_of(client, rid, u["id"], ah) == [c1]


def test_admin_signup_empty_character_ids_rejected(client):
    """显式传空列表 → 400 至少选择一个角色（须有角色才可区分：旧代码忽略该字段）。"""
    ah = _admin(client)
    h, u = register_user(client, "sc21", "戌")
    _mkchar(client, h, "C1")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signups", headers=ah,
                    json={"user_id": u["id"], "character_ids": []})
    assert r.status_code == 400
    assert r.json()["detail"] == "至少选择一个角色"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raid_signup_characters.py -v -k "admin_signup"`
Expected: `test_admin_signup_with_character_subset` FAIL（`SignupUserIn` 无该字段，Pydantic v2 忽略 extra → 默认全选，`_char_ids_of` 得 [c1,c2] 而非 [c1]）；`test_admin_signup_empty_character_ids_rejected` FAIL（空列表被忽略 → 全选 c1 → 200 而非 400）；既有 2 个 admin_signup 用例（`test_admin_signup_defaults_all` / `test_admin_signup_no_character_target_rejected`）不回归。

- [ ] **Step 3: 实现**

`backend/app/schemas.py`：

```python
class SignupUserIn(BaseModel):
    user_id: int
    character_ids: list[int] | None = None  # None=默认全部角色
```

`backend/app/routers/raids.py:722`：

```python
    rs = _signup_user(db, raid, target, body.character_ids)  # 代报名默认全部角色（None）
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raid_signup_characters.py -q`
Expected: 全 PASS（含新增 2 用例 + 既有默认全选/空目标 400/机器人默认全选）。

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer
git add backend/app/schemas.py backend/app/routers/raids.py backend/tests/test_raid_signup_characters.py
git commit -m "$(cat <<'EOF'
[feat] admin 代报名支持指定勾选角色（SignupUserIn.character_ids）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 前端 — `SignupModal` 增加 `charactersUrl` prop（TDD）

**Files:**
- Modify: `frontend/src/components/SignupModal.vue`
- Test: `frontend/src/components/SignupModal.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `frontend/src/components/SignupModal.spec.ts` 的 `describe` 内新增：

```typescript
it('charactersUrl prop 覆盖拉取地址（默认 /api/me/characters）', async () => {
  const wrapper = mountModal({ charactersUrl: '/api/admin/users/5/characters' })
  await flushPromises()
  expect(apiMock.get).toHaveBeenCalledWith('/api/admin/users/5/characters')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/SignupModal.spec.ts`
Expected: 新用例 FAIL（当前硬编码 `/api/me/characters`），其余 PASS。

- [ ] **Step 3: 实现**

`frontend/src/components/SignupModal.vue` props 声明改为：

```typescript
const props = withDefaults(defineProps<{
  open: boolean
  mode: 'signup' | 'manage'
  selectedIds: number[]
  charactersUrl?: string
}>(), { selectedIds: () => [], charactersUrl: '/api/me/characters' })
```

拉取处（现约 29 行）改为：

```typescript
    characters.value = await api.get<Character[]>(props.charactersUrl)
```

（`mode` 语义不变：admin 代报名仍用 `mode='signup'`，仅换拉取 URL。）

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/SignupModal.spec.ts`
Expected: 全 PASS（默认值路径的既有用例不回归）。

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/components/SignupModal.vue frontend/src/components/SignupModal.spec.ts
git commit -m "$(cat <<'EOF'
[feat] SignupModal 支持 charactersUrl 覆盖拉取地址（默认 /api/me/characters）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 前端 — RaidListView 报名改为弹框选角色（TDD）

**Files:**
- Modify: `frontend/src/views/RaidListView.vue`
- Modify: `frontend/src/views/RaidListView.spec.ts`

- [ ] **Step 1: 改/写测试**

`RaidListView.spec.ts`：顶部引入 `Character` 类型与角色 fixture（`SignupModal` 用真实组件，`teleport` 打桩使其内容内联渲染）：

```typescript
import type { Dungeon, RaidListItem, Character } from '../types'

const chars: Character[] = [
  { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 1, simulated_damage: 5,
    sustained_dps: 2, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null },
  { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 2, simulated_damage: null,
    sustained_dps: null, buff_amount: 9000, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null },
]
```

> **注意**：`Character` 类型含必填 `adventure_party_id/adventure_party_name`（冒险团功能加的），fixture 必须补这两个字段，否则 `npm run build`（vue-tsc 检查 spec）会报 TS2739。

`beforeEach` 的 `apiMock.get.mockImplementation` 里加 `if (url === '/api/me/characters') return chars`。

把既有用例 `'non-admin sees 报名 button and signs up'` 整段替换为：

```typescript
it('non-admin 点报名弹角色选择框，确认后带 character_ids 报名', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false, avatar: null, is_banned: false, is_guest: false }
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/raids') return [raid] as RaidListItem[]
    if (url === '/api/me/characters') return chars
    return []
  })
  const wrapper = mount(RaidListView, {
    global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub, teleport: true } },
  })
  await flushPromises()
  // 点报名：打开弹框（默认全选），不立即 POST
  await wrapper.find('[data-test="signup"]').trigger('click')
  await flushPromises()
  expect(apiMock.post).not.toHaveBeenCalledWith(expect.stringContaining('/signup'))
  // 确认报名 → 带 character_ids
  await wrapper.find('[data-act="submit"]').trigger('click')
  await flushPromises()
  expect(apiMock.post).toHaveBeenCalledWith('/api/raids/3/signup', { character_ids: [1, 2] })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidListView.spec.ts`
Expected: 新用例 FAIL（当前 `onSignup` 直接 POST 无 body；页面也无 SignupModal / `data-act="submit"`）。

- [ ] **Step 3: 实现**

`frontend/src/views/RaidListView.vue`：

script 顶部 `import SignupModal from '../components/SignupModal.vue'`；`onSignup` 改为：

```typescript
const signupTarget = ref<RaidListItem | null>(null)
function onSignup(r: RaidListItem) { signupTarget.value = r }
async function onSignupSubmit(ids: number[]) {
  if (!signupTarget.value) return
  const rid = signupTarget.value.id
  signupTarget.value = null
  try {
    await api.post(`/api/raids/${rid}/signup`, { character_ids: ids })
    notifySuccess('报名成功')
    await load()
  } catch (e: any) { notifyError(e.message) }
}
```

模板末尾（`</div>` 外层根节点内）加：

```vue
<SignupModal :open="!!signupTarget" mode="signup" :selected-ids="[]"
             @close="signupTarget = null" @submit="onSignupSubmit" />
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/views/RaidListView.spec.ts`
Expected: 全 PASS。

- [ ] **Step 5: 类型检查**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过（vue-tsc + vite build）。

- [ ] **Step 6: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/views/RaidListView.vue frontend/src/views/RaidListView.spec.ts
git commit -m "$(cat <<'EOF'
[feat] 攻坚列表报名改为弹框强制选角色（默认全选，提交带 character_ids）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 前端 — SignupMemberPicker 选人后加选角色步骤（TDD）

**Files:**
- Modify: `frontend/src/components/SignupMemberPicker.vue`
- Modify: `frontend/src/components/SignupMemberPicker.spec.ts`

- [ ] **Step 1: 改/写测试**

`SignupMemberPicker.spec.ts`：移除 `confirmDialog` mock 依赖（不再使用），加角色 fixture：

```typescript
const chars = [
  { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 1, simulated_damage: 5,
    sustained_dps: 2, buff_amount: null, sun_buff: null },
  { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 2, simulated_damage: null,
    sustained_dps: null, buff_amount: 9000, sun_buff: null },
]
```

把 `'过滤团长与已报名者，点击帮报名'` 与 `'confirmDialog 取消时不 POST 也不 emit'` 两个用例替换为：

```typescript
it('过滤团长与已报名者；选人后弹角色选择框，确认报名带 user_id + character_ids', async () => {
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/admin/users') return users
    if (url === '/api/admin/users/2/characters') return chars
    return []
  })
  const wrapper = mount(SignupMemberPicker, {
    props: { open: true, rid: 1, excludeUserIds: [1, 3] },
    global: { stubs: { teleport: true, UserAvatar: true } },
  })
  await flushPromises()
  expect(apiMock.get).toHaveBeenCalledWith('/api/admin/users')
  expect(wrapper.text()).toContain('乙')
  expect(wrapper.text()).not.toContain('甲')
  await wrapper.findAll('.member-row')[0].trigger('click')
  await flushPromises()
  // 弹框拉取目标用户角色，默认全选
  expect(apiMock.get).toHaveBeenCalledWith('/api/admin/users/2/characters')
  await wrapper.find('[data-act="submit"]').trigger('click')
  await flushPromises()
  expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/signups',
    { user_id: 2, character_ids: [1, 2] })
})

it('选人后不开确认就不 POST 不 emit', async () => {
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/admin/users') return users
    if (url === '/api/admin/users/2/characters') return chars
    return []
  })
  const wrapper = mount(SignupMemberPicker, {
    props: { open: true, rid: 1, excludeUserIds: [1, 3] },
    global: { stubs: { teleport: true, UserAvatar: true } },
  })
  await flushPromises()
  await wrapper.findAll('.member-row')[0].trigger('click')
  await flushPromises()
  // 只打开弹框、不点确认 → 不 POST 不 emit（「取消」= 不提交即不报名）
  expect(apiMock.post).not.toHaveBeenCalled()
  expect(wrapper.emitted('signedUp')).toBeUndefined()
})
```

> **注意**：上面这个「取消不提交」用例只断言「点开弹框但不提交就不 POST」——点真实 SignupModal 的取消按钮依赖 naive DOM 不稳定，故以该简化断言为准；SignupModal 自身的取消行为已在其独立 spec 覆盖。

`'成功报名 emit signedUp/close 并提示'` 用例改为：

```typescript
it('成功报名 emit signedUp/close 并提示', async () => {
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/admin/users') return users
    if (url === '/api/admin/users/2/characters') return chars
    return []
  })
  const wrapper = mount(SignupMemberPicker, {
    props: { open: true, rid: 1, excludeUserIds: [1, 3] },
    global: { stubs: { teleport: true, UserAvatar: true } },
  })
  await flushPromises()
  await wrapper.findAll('.member-row')[0].trigger('click')
  await flushPromises()
  await wrapper.find('[data-act="submit"]').trigger('click')
  await flushPromises()
  expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/signups',
    { user_id: 2, character_ids: [1, 2] })
  expect(notifyMock.success).toHaveBeenCalledWith('报名成功')
  expect(wrapper.emitted('signedUp')).toHaveLength(1)
  expect(wrapper.emitted('close')).toHaveLength(1)
})
```

`'全部已报名时显示空态'`、`'拉取失败显示加载失败'` 保留原样。

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/SignupMemberPicker.spec.ts`
Expected: 改造用例 FAIL（当前 `onPick` 直接 confirm+POST `{ user_id: 2 }`，无选角色弹框）。

- [ ] **Step 3: 实现**

`frontend/src/components/SignupMemberPicker.vue`：

- 移除 `confirmDialog` 的 import（`import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'` → `import { notifyError, notifySuccess } from '../lib/notify'`）。
- 新增 import `SignupModal`；新增状态 `const pickUser = ref<User | null>(null)`。
- `onPick` 改为：

```typescript
function onPick(u: User) {
  if (busy.value) return
  pickUser.value = u   // 打开选角色弹框，不再直接报名
}
```

- 新增 `onSubmit`：

```typescript
async function onSubmit(ids: number[]) {
  if (!pickUser.value || busy.value) return
  const uid = pickUser.value.id
  pickUser.value = null
  busy.value = true
  try {
    await api.post(`/api/raids/${props.rid}/signups`, { user_id: uid, character_ids: ids })
    notifySuccess('报名成功')
    emit('signedUp')
    emit('close')
  } catch (e: any) { notifyError(String(e?.message ?? '操作失败')) }
  finally { busy.value = false }
}
```

- 模板 `n-modal` 内追加：

```vue
<SignupModal :open="!!pickUser" mode="signup" :selected-ids="[]"
             :characters-url="pickUser ? `/api/admin/users/${pickUser.id}/characters` : '/api/me/characters'"
             @close="pickUser = null" @submit="onSubmit" />
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/SignupMemberPicker.spec.ts`
Expected: 全 PASS。

- [ ] **Step 5: 类型检查**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
cd /Users/able/toys/dnfer
git add frontend/src/components/SignupMemberPicker.vue frontend/src/components/SignupMemberPicker.spec.ts
git commit -m "$(cat <<'EOF'
[feat] 帮成员报名增加选角色步骤（默认全选，代报名可指定勾选角色）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 全量验证 + CHANGELOG + 收尾

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 后端全量测试**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest -q`
Expected: 全 PASS。

- [ ] **Step 2: 前端全量测试 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run`
Expected: 全 PASS。

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 通过（vue-tsc 类型检查无误）。

- [ ] **Step 3: 更新 CHANGELOG**

在 `CHANGELOG.md` 的 `## [Unreleased]` 下追加：

```markdown
### 变更

- **攻坚互不影响**：同一角色可在多个攻坚中同时占位（各攻坚排表相互独立），不再因在另一攻坚占位而自动撤下；raid 内仍保持「一场一角色一格」
- **报名强制选角色**：攻坚列表与详情页报名、管理员帮成员报名均改为弹出角色选择框（默认全选），由用户/管理员显式选择本场要上场的角色；机器人与临时选手代报名保持默认全选
```

- [ ] **Step 4: 提交**

```bash
cd /Users/able/toys/dnfer
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
[docs] CHANGELOG：攻坚互不影响 + 报名强制选角色

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: 确认最终状态**

Run: `git status --short` 与 `git log --oneline -8`
Expected: 工作区干净（除与本计划无关的 `?? docs/usage/`）；顶部为本计划 7 个提交（含 Task 1 前置提交）。
