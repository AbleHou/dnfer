# 管理员重置密码 + 用户自助改密 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增两项密码修改能力：管理员在用户管理里重置任意用户密码，用户在个人中心自助修改自己密码。

**Architecture:** 后端在 `admin.py` 加 `POST /api/admin/users/{uid}/password`（require_admin，直接覆写 `password_hash`），在 `auth.py`（已挂 `/api/me/*`）加 `PUT /api/me/password`（校验旧密码后覆写）。前端新增 `validatePassword` 纯函数与两个独立弹窗（`AdminResetPasswordModal`/`ChangePasswordModal`），分别从 `AdminUsersView` 用户行「改密」按钮与 `ProfilePanel`「修改密码」按钮打开。**不做 token 失效**（旧会话继续有效），无 schema 迁移。

**Tech Stack:** FastAPI + SQLAlchemy 2 + SQLite + bcrypt（后端）；Vue 3 `<script setup>` + Pinia + naive-ui + Vitest（前端）。设计规格：`docs/superpowers/specs/2026-10-09-admin-reset-password-design.md`。

---

## 任务总览（文件结构）

### 后端

| 文件 | 职责 |
|---|---|
| `backend/app/schemas.py` | 新增 `PasswordResetIn`（新密码）、`ChangePasswordIn`（旧+新密码） |
| `backend/app/routers/admin.py` | `POST /users/{uid}/password`：`_user_or_404` + `hash_password` 覆写 + `_admin_user_out` |
| `backend/app/routers/auth.py` | `PUT /me/password`：验旧密码 → 覆写 `password_hash` |
| `backend/tests/test_admin_management.py` | 管理员重置：成功（新旧密码登录验证）、404/403/422、重置管理员 |
| `backend/tests/test_profile.py` | 自助改密：成功（新旧密码登录验证）、400 原密码错、422、401 |

### 前端

| 文件 | 职责 |
|---|---|
| `frontend/src/utils/password.ts` | `validatePassword(pw)` 纯函数（6–128 位） |
| `frontend/src/components/AdminResetPasswordModal.vue` (+`.spec.ts`) | 管理员重置弹窗（新密码+确认，`data-field` 字段，`data-act="submit"`） |
| `frontend/src/views/AdminUsersView.vue` (+`.spec.ts`) | 用户行「改密」按钮 → 独立 `resetPwOpen`/`resetPwUser` ref 打开弹窗 |
| `frontend/src/components/ChangePasswordModal.vue` (+`.spec.ts`) | 自助改密弹窗（原+新+确认） |
| `frontend/src/components/ProfilePanel.vue` (+`.spec.ts`) | 「修改密码」按钮 → `changePwOpen` ref 打开弹窗 |

> **实现细节注记**：spec 里字段写的 `data-act="new-pw"`，落地时**字段用 `data-field`**（对齐 VoteCreateModal 的表单字段惯例：`<input class="dnf-input" data-field="...">`，直接用 `find('[data-field=...]')` 可测）；**按钮用 `data-act="submit"`**（动作选择器惯例）。弹窗内不用 NInput，用原生 `<input type="password" class="dnf-input">`，避免 n-input 属性透传位置不确定性。

---

## Task 1: 后端管理员重置密码端点

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_management.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_admin_management.py` 末尾追加（文件已 `from app.models import Character, RaidSignup, User` 与 `from .helpers import register_user`）：

```python
def test_admin_reset_password(client, admin_headers):
    h, u = register_user(client, "pwreset1", "改密甲")
    # 旧密码可登录
    assert client.post("/api/auth/login",
                       json={"username": "pwreset1", "password": "secret1"}).status_code == 200
    r = client.post(f"/api/admin/users/{u['id']}/password", headers=admin_headers,
                    json={"password": "newpass99"})
    assert r.status_code == 200 and r.json()["username"] == "pwreset1"
    # 旧密码失效、新密码可登录
    assert client.post("/api/auth/login",
                       json={"username": "pwreset1", "password": "secret1"}).status_code == 401
    assert client.post("/api/auth/login",
                       json={"username": "pwreset1", "password": "newpass99"}).status_code == 200

def test_admin_reset_password_errors(client, admin_headers):
    h, u = register_user(client, "pwreset2", "改密乙")
    # 用户不存在 → 404
    assert client.post("/api/admin/users/99999/password", headers=admin_headers,
                       json={"password": "newpass99"}).status_code == 404
    # 非管理员 → 403
    assert client.post(f"/api/admin/users/{u['id']}/password", headers=h,
                       json={"password": "newpass99"}).status_code == 403
    # 密码过短 → 422
    assert client.post(f"/api/admin/users/{u['id']}/password", headers=admin_headers,
                       json={"password": "123"}).status_code == 422
    # 管理员可重置另一管理员密码（admin id=1；token 不失效所以 admin_headers 仍可用）
    assert client.post("/api/admin/users/1/password", headers=admin_headers,
                       json={"password": "adminNew99"}).status_code == 200
```

> `register_user` 注册密码恒为 `secret1`（见 `tests/helpers.py`）。`db` fixture 为函数级（每次 `drop_all` 重建），单测内改 admin 密码不影响其它测试。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py::test_admin_reset_password tests/test_admin_management.py::test_admin_reset_password_errors -v`
Expected: FAIL（`404 Not Found`——路由未注册）

- [ ] **Step 3: 实现 Schema**

`backend/app/schemas.py` 在 `LoginIn` 类后新增：

```python
class PasswordResetIn(BaseModel):
    password: str = Field(min_length=6, max_length=128)

class ChangePasswordIn(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=128)
```

- [ ] **Step 4: 实现端点**

`backend/app/routers/admin.py`：
- import 行改为 `from ..auth import hash_password, make_code, require_admin`
- schemas import 加 `PasswordResetIn`
- 在 `unban_user` 端点后新增：

```python
@router.post("/users/{uid}/password", response_model=AdminUserOut)
def reset_user_password(uid: int, body: PasswordResetIn,
                        admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = _user_or_404(db, uid)
    target.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(target)
    return _admin_user_out(db, target)
```

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_admin_management.py -v`
Expected: PASS（全部，含既有用例）

- [ ] **Step 6: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/admin.py backend/tests/test_admin_management.py
git commit -m "$(cat <<'EOF'
feat: 管理员重置用户密码端点（POST /api/admin/users/{uid}/password）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 后端用户自助改密端点

**Files:**
- Modify: `backend/app/schemas.py`（`ChangePasswordIn` 已在 Task 1 加，跳过）
- Modify: `backend/app/routers/auth.py`
- Test: `backend/tests/test_profile.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_profile.py` 末尾追加（文件已 `from .helpers import register_user`）：

```python
def test_change_password_success(client):
    h, u = register_user(client, "pwchg1", "改密甲")
    r = client.put("/api/me/password", headers=h,
                   json={"old_password": "secret1", "new_password": "newpass99"})
    assert r.status_code == 200 and r.json()["username"] == "pwchg1"
    # 旧密码失效、新密码可登录
    assert client.post("/api/auth/login",
                       json={"username": "pwchg1", "password": "secret1"}).status_code == 401
    assert client.post("/api/auth/login",
                       json={"username": "pwchg1", "password": "newpass99"}).status_code == 200

def test_change_password_errors(client):
    h, _ = register_user(client, "pwchg2", "改密乙")
    # 原密码错误 → 400
    r = client.put("/api/me/password", headers=h,
                   json={"old_password": "wrongpw", "new_password": "newpass99"})
    assert r.status_code == 400 and r.json()["detail"] == "原密码错误"
    # 新密码过短 → 422
    assert client.put("/api/me/password", headers=h,
                      json={"old_password": "secret1", "new_password": "123"}).status_code == 422
    # 未登录 → 401
    assert client.put("/api/me/password",
                      json={"old_password": "secret1", "new_password": "newpass99"}).status_code == 401
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_profile.py::test_change_password_success tests/test_profile.py::test_change_password_errors -v`
Expected: FAIL（`404 Not Found`）

- [ ] **Step 3: 实现端点**

`backend/app/routers/auth.py`：
- schemas import 行加 `ChangePasswordIn`（改为 `from ..schemas import ChangePasswordIn, LoginIn, ProfileUpdate, RegisterIn, UserOut`）
- 在 `update_profile` 端点后新增（`hash_password`/`verify_password`/`HTTPException` 文件已 import）：

```python
@router.put("/me/password", response_model=UserOut)
def change_password(body: ChangePasswordIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "原密码错误")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_profile.py -v`
Expected: PASS（全部，含既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/auth.py backend/tests/test_profile.py
git commit -m "$(cat <<'EOF'
feat: 用户自助改密端点（PUT /api/me/password）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 前端 validatePassword + AdminResetPasswordModal

**Files:**
- Create: `frontend/src/utils/password.ts`
- Create: `frontend/src/components/AdminResetPasswordModal.vue`
- Create: `frontend/src/components/AdminResetPasswordModal.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/AdminResetPasswordModal.spec.ts`（参照 `VoteCreateModal.spec.ts` / `AdminUserCharactersModal.spec.ts` 的 mock 结构）：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminResetPasswordModal from './AdminResetPasswordModal.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { post: vi.fn() },
  notifyMock: { notifyError: vi.fn(), notifySuccess: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => notifyMock)

const user = { id: 7, username: 'p', nickname: '玩家', is_admin: false, avatar: null, is_banned: false }

describe('AdminResetPasswordModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('密码过短不调接口并显示错误', async () => {
    const w = mount(AdminResetPasswordModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="new-pw"]').setValue('123')
    await w.find('[data-field="confirm-pw"]').setValue('123')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('密码至少 6 位')
  })

  it('两次密码不一致报错不调接口', async () => {
    const w = mount(AdminResetPasswordModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdefg')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('两次输入的密码不一致')
  })

  it('提交成功调用 POST 并 emit close', async () => {
    apiMock.post.mockResolvedValue({})
    const w = mount(AdminResetPasswordModal, { props: { open: true, user }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/7/password', { password: 'abcdef' })
    expect(notifyMock.notifySuccess).toHaveBeenCalledWith('密码已重置')
    expect(w.emitted('close')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/AdminResetPasswordModal.spec.ts`
Expected: FAIL（找不到 `AdminResetPasswordModal` 模块）

- [ ] **Step 3: 实现工具函数**

`frontend/src/utils/password.ts`（参照 `utils/nickname.ts`）：

```ts
export function validatePassword(pw: string): string | null {
  if (pw.length < 6) return '密码至少 6 位'
  if (pw.length > 128) return '密码最多 128 位'
  return null
}
```

- [ ] **Step 4: 实现弹窗**

`frontend/src/components/AdminResetPasswordModal.vue`：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { validatePassword } from '../utils/password'
import { notifyError, notifySuccess } from '../lib/notify'
import type { User } from '../types'

const props = defineProps<{ open: boolean; user: User | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const newPw = ref('')
const confirmPw = ref('')
const error = ref('')
const saving = ref(false)

watch(() => props.open, (o) => { if (o) { newPw.value = ''; confirmPw.value = ''; error.value = '' } })

async function submit() {
  if (saving.value) return
  if (!props.user) return   // 弹窗仅在有目标用户时打开；兜底避免空 id 请求
  error.value = ''
  const err = validatePassword(newPw.value)
  if (err) { error.value = err; return }
  if (newPw.value !== confirmPw.value) { error.value = '两次输入的密码不一致'; return }
  saving.value = true
  try {
    await api.post(`/api/admin/users/${props.user.id}/password`, { password: newPw.value })
    notifySuccess('密码已重置')
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { saving.value = false }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="重置密码" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="color:var(--dnf-text-muted);font-size:12px">
        为 {{ props.user?.nickname }}（{{ props.user?.username }}）设置新密码
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">新密码</div>
        <input v-model="newPw" type="password" class="dnf-input" data-field="new-pw" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">确认新密码</div>
        <input v-model="confirmPw" type="password" class="dnf-input" data-field="confirm-pw"
               @keyup.enter="submit" />
      </div>
      <p v-if="error" class="form-error" style="margin:0">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-act="submit" :disabled="saving"
              @click="submit">确认重置</button>
    </div>
  </n-modal>
</template>
```

> 样式沿用 dnf.css 既有 `dnf-input`/`dnf-btn`/`dnf-btn-primary`/`form-error` 类；需要自定义样式时放 `<style scoped>`，CSS 变量一律带 fallback（`var(--dnf-border,#3a3f4b)`）。

- [ ] **Step 5: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/AdminResetPasswordModal.spec.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/utils/password.ts frontend/src/components/AdminResetPasswordModal.vue frontend/src/components/AdminResetPasswordModal.spec.ts
git commit -m "$(cat <<'EOF'
feat: 管理员重置密码弹窗与 validatePassword 工具

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: AdminUsersView 接入改密入口

**Files:**
- Modify: `frontend/src/views/AdminUsersView.vue`
- Test: `frontend/src/views/AdminUsersView.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/views/AdminUsersView.spec.ts` 追加用例（stubs 列表补 `AdminResetPasswordModal: true`；`users` fixture 已是 `[{ id: 2, ... }]`）：

```ts
it('改密按钮打开重置密码弹窗', async () => {
  const wrapper = mount(AdminUsersView, {
    global: { stubs: { AdminNav: true, AdminUserCharactersModal: true, AdminResetPasswordModal: true } },
  })
  await flushPromises()
  await wrapper.find('[data-act="reset-pw-2"]').trigger('click')
  expect(wrapper.findComponent({ name: 'AdminResetPasswordModal' }).exists()).toBe(true)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: FAIL（找不到 `[data-act="reset-pw-2"]`）

- [ ] **Step 3: 实现**

`frontend/src/views/AdminUsersView.vue`：
- script 区 import 加 `AdminResetPasswordModal`（`import AdminResetPasswordModal from '../components/AdminResetPasswordModal.vue'`）。
- 用户管理区状态（放在 `modalOpen`/`modalUser` 之后；**独立 ref，不共用** `modalOpen`）：

```ts
// 重置密码弹窗独立状态（避免与角色管理弹窗共用 open 标志导致同时渲染）
const resetPwOpen = ref(false)
const resetPwUser = ref<User | null>(null)
function openResetPw(u: AdminUser) { resetPwUser.value = u; resetPwOpen.value = true }
function onResetPwClose() { resetPwOpen.value = false; loadUsers() }
```

- 模板用户列表操作列 `<div style="display:flex;gap:8px">` 内、`manage-{id}` 按钮旁加（**在所有行含管理员均显示**，不加 `!u.is_admin` 限制）：

```html
<button class="dnf-btn dnf-btn-sm" :data-act="'reset-pw-' + u.id" @click="openResetPw(u)">改密</button>
```

- 模板底部（`AdminUserCharactersModal` 之后）渲染：

```html
<AdminResetPasswordModal v-if="resetPwOpen" :open="resetPwOpen" :user="resetPwUser" @close="onResetPwClose" />
```

> `resetPwUser` 为 `User | null`，`AdminResetPasswordModal` 的 `user` prop 也是 `User | null`（Task 3 已按此声明，与既有 `AdminUserCharactersModal` 的 `user: User | null` 写法一致），绑定不会触发 TS2322。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/AdminUsersView.spec.ts`
Expected: PASS

- [ ] **Step 5: 类型检查提前暴露（vitest 不做类型检查，在此及时跑 build 抓 TS 错误）**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误（`resetPwUser`/`user: User | null` 绑定合法）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/AdminUsersView.vue frontend/src/views/AdminUsersView.spec.ts
git commit -m "$(cat <<'EOF'
feat: 用户管理列表加改密入口打开重置密码弹窗

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ChangePasswordModal + ProfilePanel 接入

**Files:**
- Create: `frontend/src/components/ChangePasswordModal.vue`
- Create: `frontend/src/components/ChangePasswordModal.spec.ts`
- Modify: `frontend/src/components/ProfilePanel.vue`
- Test: `frontend/src/components/ProfilePanel.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/ChangePasswordModal.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ChangePasswordModal from './ChangePasswordModal.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { put: vi.fn() },
  notifyMock: { notifyError: vi.fn(), notifySuccess: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => notifyMock)

describe('ChangePasswordModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('原密码为空本地校验拦截不调接口', async () => {
    const w = mount(ChangePasswordModal, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.put).not.toHaveBeenCalled()
    expect(w.text()).toContain('请输入原密码')
  })

  it('提交成功调用 PUT /api/me/password 并 emit close', async () => {
    apiMock.put.mockResolvedValue({})
    const w = mount(ChangePasswordModal, { props: { open: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-field="old-pw"]').setValue('secret1')
    await w.find('[data-field="new-pw"]').setValue('abcdef')
    await w.find('[data-field="confirm-pw"]').setValue('abcdef')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/me/password',
      { old_password: 'secret1', new_password: 'abcdef' })
    expect(notifyMock.notifySuccess).toHaveBeenCalledWith('密码已修改')
    expect(w.emitted('close')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/ChangePasswordModal.spec.ts`
Expected: FAIL（找不到 `ChangePasswordModal` 模块）

- [ ] **Step 3: 实现改密弹窗**

`frontend/src/components/ChangePasswordModal.vue`（结构与 AdminResetPasswordModal 一致，多一个原密码字段，调 `PUT /api/me/password`）：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { validatePassword } from '../utils/password'
import { notifyError, notifySuccess } from '../lib/notify'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const oldPw = ref('')
const newPw = ref('')
const confirmPw = ref('')
const error = ref('')
const saving = ref(false)

watch(() => props.open, (o) => { if (o) { oldPw.value = ''; newPw.value = ''; confirmPw.value = ''; error.value = '' } })

async function submit() {
  if (saving.value) return
  error.value = ''
  if (!oldPw.value) { error.value = '请输入原密码'; return }
  const err = validatePassword(newPw.value)
  if (err) { error.value = err; return }
  if (newPw.value !== confirmPw.value) { error.value = '两次输入的密码不一致'; return }
  saving.value = true
  try {
    await api.put('/api/me/password', { old_password: oldPw.value, new_password: newPw.value })
    notifySuccess('密码已修改')
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { saving.value = false }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="修改密码" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">原密码</div>
        <input v-model="oldPw" type="password" class="dnf-input" data-field="old-pw" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">新密码</div>
        <input v-model="newPw" type="password" class="dnf-input" data-field="new-pw" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">确认新密码</div>
        <input v-model="confirmPw" type="password" class="dnf-input" data-field="confirm-pw"
               @keyup.enter="submit" />
      </div>
      <p v-if="error" class="form-error" style="margin:0">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-act="submit" :disabled="saving"
              @click="submit">确认修改</button>
    </div>
  </n-modal>
</template>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/ChangePasswordModal.spec.ts`
Expected: PASS

- [ ] **Step 5: 加 ProfilePanel 入口测试**

`frontend/src/components/ProfilePanel.spec.ts` 追加用例（stubs 补 `ChangePasswordModal: true`）：

```ts
it('修改密码按钮打开改密弹窗', async () => {
  const w = mount(ProfilePanel, {
    props: { open: true },
    global: { stubs: { teleport: true, ChangePasswordModal: true } },
  })
  await flushPromises()
  await w.find('[data-act="change-pw"]').trigger('click')
  expect(w.findComponent({ name: 'ChangePasswordModal' }).exists()).toBe(true)
})
```

- [ ] **Step 6: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/ProfilePanel.spec.ts`
Expected: FAIL（找不到 `[data-act="change-pw"]`）

- [ ] **Step 7: 实现 ProfilePanel 接入**

`frontend/src/components/ProfilePanel.vue`：
- import 加 `ChangePasswordModal` 与 `ref`（文件已 `import { ref, watch } from 'vue'`，仅加组件 import）：

```ts
import ChangePasswordModal from './ChangePasswordModal.vue'
const changePwOpen = ref(false)
```

- 模板「保存」按钮后加：

```html
<button class="dnf-btn" data-act="change-pw" style="width:100%" @click="changePwOpen = true">修改密码</button>
```

- `</n-modal>` 闭合后（`<n-modal>` 外层）渲染：

```html
<ChangePasswordModal v-if="changePwOpen" :open="changePwOpen" @close="() => changePwOpen = false" />
```

> `n-modal` 默认 teleport 到 body；并排的第二个 `n-modal` 正常叠放。ProfilePanel 模板根当前是单个 `<n-modal>`，**改用 `<template>` 多根**（Vue 3 原生支持 Fragment）：在 `</n-modal>` 之后并列 `<ChangePasswordModal .../>`，不额外包 `<div>`（避免影响布局），`<script>` 内逻辑不变。

- [ ] **Step 8: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/ProfilePanel.spec.ts src/components/ChangePasswordModal.spec.ts`
Expected: PASS（两个文件）

- [ ] **Step 9: 提交**

```bash
git add frontend/src/components/ChangePasswordModal.vue frontend/src/components/ChangePasswordModal.spec.ts frontend/src/components/ProfilePanel.vue frontend/src/components/ProfilePanel.spec.ts
git commit -m "$(cat <<'EOF'
feat: 个人中心自助改密弹窗与入口

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 全量验证

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: PASS（全部用例）

- [ ] **Step 2: 前端全量单测**

Run: `cd frontend && npx vitest run`
Expected: PASS（全部 spec）

- [ ] **Step 3: 前端类型与构建**

Run: `cd frontend && npm run build`（= vue-tsc -b && vite build）
Expected: 构建成功，无类型错误

- [ ] **Step 4: 最终提交（如有遗留变更）**

```bash
git add -A
git status
```
如无新增未提交变更则跳过；有则按内容分类提交。
