# DNfer 管理员重置密码 + 用户自助改密 — 设计规格

日期：2026-10-09
状态：已确认
上游：`2026-09-24-admin-split-design.md`（admin 路由 `/api/admin/*`、`require_admin`、`_user_or_404`/`_admin_user_out` 复用）与 `2026-09-21-nickname-and-avatar-design.md`（`/me/profile` 个人中心、ProfilePanel 弹窗）。
需求来源：用户口述——需要一个管理员修改用户密码的功能；澄清后扩展为「管理员重置任意用户密码」+「用户自助修改自己密码」两项。

## 1. 目标

新增两项密码修改能力（后端两端点 + 前端两弹窗）：

- **管理员重置**：`AdminUsersView.vue` 用户列表每行加「改密」按钮 → 弹窗输入新密码两次 → `POST /api/admin/users/{uid}/password`。
- **用户自助改密**：`ProfilePanel.vue` 个人中心加「修改密码」入口 → 弹窗输入原密码 + 新密码两次 → `PUT /api/me/password`。

已确认的决策：

- **密码规则**：与注册一致，新密码 `6–128` 位（`Field(min_length=6, max_length=128)`）。
- **旧会话不失效**：不改 token 机制（JWT 无服务端会话跟踪），重置/改密后旧 token 仍有效直至过期。**不做** `token_version` 迁移。
- **自助改密须验旧密码**：`old_password` 不匹配 → 400「原密码错误」。
- **管理员可重置任意用户（含管理员）密码**：重置他人/其他管理员密码是合法管理动作，无 ban 那样的自封禁限制。
- **实现方案 A**：双端点 + 双独立弹窗，前端抽 `validatePassword` 工具。

## 2. 后端

### 2.1 Schemas（schemas.py）

```python
class PasswordResetIn(BaseModel):
    password: str = Field(min_length=6, max_length=128)

class ChangePasswordIn(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=128)
```

### 2.2 管理员重置 — `routers/admin.py`

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

- 复用 `_user_or_404`（404「用户不存在」）、`_admin_user_out`、`hash_password`（`..auth`）。
- 目标用户可为管理员自身或任意管理员；无自封禁类限制。
- 校验越界（<6 / >128）由 pydantic 422 兜底。

### 2.3 用户自助改密 — `routers/auth.py`（router 已挂 `/me/profile`、`/me/avatar`）

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

- 未登录 → 401（`get_current_user`）。
- 原密码错误 → 400「原密码错误」。
- 成功改密后旧密码失效（`password_hash` 已覆盖）；新密码即时可登录。

## 3. 前端

### 3.1 校验工具 — `frontend/src/utils/password.ts`（新建）

```ts
export function validatePassword(pw: string): string | null {
  if (pw.length < 6) return '密码至少 6 位'
  if (pw.length > 128) return '密码最多 128 位'
  return null
}
```

两个弹窗共用。确认框一致性校验（两次输入相同）在弹窗本地做，不抽工具。

### 3.2 管理员重置弹窗 — `components/AdminResetPasswordModal.vue`（新建）

- props：`{ open: boolean, user: User }`；emits：`close`。
- 结构参照 ProfilePanel（`NModal` preset="card"）：
  - 「新密码」`<n-input type="password">`、`data-act="new-pw"`
  - 「确认新密码」`<n-input type="password">`、`data-act="confirm-pw"`
  - 提交按钮 `data-act="submit"`，取消关闭。
- 提交前校验：`validatePassword(newPw)` → 错误文案；两次不一致 → 「两次输入的密码不一致」。
- 提交：`api.post('/api/admin/users/${user.id}/password', { password: newPw })` → 成功 `notifySuccess('密码已重置')` + `emit('close')`；失败 `notifyError(e.message)`。
- `open` 变为 true 时清空字段与错误（`watch`，参照 ProfilePanel/AdminUserCharactersModal）。

### 3.3 自助改密弹窗 — `components/ChangePasswordModal.vue`（新建）

- props：`{ open: boolean }`；emits：`close`。
- 字段：原密码 `data-act="old-pw"`、新密码 `data-act="new-pw"`、确认新密码 `data-act="confirm-pw"`；提交按钮 `data-act="submit"`。
- 提交：`api.put('/api/me/password', { old_password, new_password })` → 成功 `notifySuccess('密码已修改')` + `emit('close')`。
- 校验：`validatePassword(newPw)` + 两次一致 + **原密码必填**（本地校验「原密码必填」，避免空串走到后端 422 显示泛化错误文案）。原密码错误时后端 400，`notifyError` 显示「原密码错误」。

### 3.4 入口接线

- **AdminUsersView.vue**：用户列表操作列加「改密」按钮（`data-act="reset-pw-{id}"`，**所有行含管理员均显示**；ban/unban 的 `v-if="!u.is_admin"` 限制不套用到改密）。点击 `openResetPw(u)` 打开弹窗。**须用独立 `resetPwOpen`/`resetPwUser` ref**，不要与驱动 AdminUserCharactersModal 的 `modalOpen`/`modalUser` 共用同一个 open 标志，避免两个弹窗同时渲染；关闭后 `loadUsers()` 刷新（密码改动不影响列表字段，可仅关闭）。
- **ProfilePanel.vue**：昵称/头像区下方加「修改密码」按钮（`data-act="change-pw"`）→ 打开 ChangePasswordModal。

## 4. 测试

### 4.1 后端

- `tests/test_admin_management.py` 增补：
  - 重置成功后旧密码登录 401、新密码登录 200。
  - 用户不存在 → 404。
  - 非管理员（普通用户 headers）调 `/api/admin/users/{uid}/password` → 403。
  - 新密码过短（<6）→ 422。
  - 管理员可重置另一管理员密码（200）。
- `tests/test_profile.py`（或 test_auth.py）增补：
  - 自助改密成功：旧密码登录 401、新密码登录 200。
  - 原密码错误 → 400「原密码错误」。
  - 新密码过短 → 422。
  - 未登录 → 401。

### 4.2 前端

- `AdminResetPasswordModal.spec.ts`（新建）：渲染字段；短密码/两次不一致报错；提交 `api.post` payload 正确（`{ password }`）；成功后 `notifySuccess` 并关闭。
- `ChangePasswordModal.spec.ts`（新建）：同上，提交 `api.put` payload 为 `{ old_password, new_password }`。
- `AdminUsersView.spec.ts`：新增用例「改密按钮打开弹窗」——点击 `data-act="reset-pw-{id}"` 出现 AdminResetPasswordModal。
- `ProfilePanel.spec.ts`：新增用例「修改密码按钮打开弹窗」。

## 5. 不做的事（YAGNI）

- 不做 token 失效/踢下线（已确认不踢）。
- 不做密码强度规则（仅长度）。
- 不改注册/登录逻辑。
- 不做忘记密码/找回（无邮件等渠道）。
- 不限制管理员重置管理员的密码（合法管理动作）。
