# 昵称规则与头像（S3）— 设计规格

日期：2026-09-21
状态：已确认

## 1. 背景与目标

当前昵称只在注册时设置、**不可修改**，且无唯一约束、无字符限制；头像功能不存在。

目标：

1. **昵称规则**：注册与修改时，昵称**不允许重复**，且**仅允许中文/字母/数字**（禁空格与特殊符号）。
2. **头像**：接入 **S3 兼容公开读桶**，用户可上传自定义头像；头像与昵称一同显示在**顶栏右上角**与**排表页占位格**。
3. **个人信息面板**：点击顶栏右上角「头像 + 昵称」区域，弹出面板，可**更换头像**、**修改昵称**（账号只读）。

## 2. 昵称规则

### 2.1 允许字符

- 正则：`^[\u4e00-\u9fa5A-Za-z0-9]+$`（中文、英文大小写、数字，1–64 位）
- 禁空格、标点、emoji 等所有特殊符号

### 2.2 唯一性

- **应用层查询检查**（注册与修改均执行，修改时排除自己）
- **不加 DB 唯一索引**：存量库可能已存在重复/含特殊字符的昵称，建索引会失败；注册后昵称可改，查询兜底足够

## 3. 后端改动

### 3.1 昵称校验（`backend/app/schemas.py`）

- `RegisterIn.nickname`：加 `pattern="^[\u4e00-\u9fa5A-Za-z0-9]+$"`
- 新增 `ProfileUpdate`：`nickname: str`（同规则）

### 3.2 注册查重（`backend/app/routers/auth.py` `register`）

- 在用户名查重后增加：`db.query(User).filter(User.nickname == body.nickname).first()` → 400「昵称已存在」

### 3.3 新增 `PUT /api/me/profile`

- body：`ProfileUpdate`
- 权限：`get_current_user`
- 查重（排除自己）→ 400「昵称已存在」
- 更新 `user.nickname`，commit，返回 `UserOut`

### 3.4 头像（S3 公开读桶）

**配置（`.env` + `backend/app/config.py`）：**

| 变量 | 说明 | 默认 |
|---|---|---|
| `DNFER_S3_ENDPOINT` | S3 端点 | 空 |
| `DNFER_S3_ACCESS_KEY` | AK | 空 |
| `DNFER_S3_SECRET_KEY` | SK | 空 |
| `DNFER_S3_BUCKET` | 桶名 | 空 |
| `DNFER_S3_REGION` | 区域（可空） | 空 |
| `DNFER_S3_PUBLIC_BASE` | 公开访问前缀，如 `https://cdn.example.com` | 空 |

- 依赖：`requirements.txt` 加 `boto3`

**`backend/app/s3.py`（新增）：**

- 懒加载 `boto3.client('s3', endpoint_url, aws_access_key_id, aws_secret_access_key, region_name)`
- `upload_avatar(user_id, ext, data, content_type) -> str`：
  - key = `avatars/{user_id}/{uuid4().hex}.{ext}`
  - `put_object(Bucket, Key, Body, ContentType, ACL='public-read')`
  - 返回 `{S3_PUBLIC_BASE}/{key}`（完整公开 URL）

**`POST /api/me/avatar`（新增，`backend/app/routers/auth.py`）：**

- 权限：`get_current_user`
- multipart 字段 `file`
- 校验：`content_type` 前缀 `image/`；大小 ≤ 2MB → 否则 400
- S3 未配置（`S3_ENDPOINT`/`S3_BUCKET`/`S3_PUBLIC_BASE` 任一为空）→ 503「头像存储未配置」
- 上传成功 → `user.avatar = URL`，commit，返回 `UserOut`
- 不做服务端压缩（原图上传，前端圆形裁剪显示）

### 3.5 模型与序列化

- `User` 加列 `avatar: Mapped[str | None]`（String(256)，nullable）
- `UserOut` 加 `avatar: str | None`
- `SlotOut` 加 `owner_avatar: str | None`；`raids._detail` 填 `owner_avatar=c.owner.avatar if c else None`

### 3.6 迁移（`backend/app/migrations.py` + `db.init_db`）

- 新增 `migrate_avatars(engine)`：幂等 `ALTER TABLE users ADD COLUMN avatar VARCHAR(256)`（沿用现有风格）
- `init_db()` 末尾调用

## 4. 前端改动

### 4.1 类型（`src/types.ts`）

- `User` 加 `avatar: string | null`
- `Slot` 加 `owner_avatar: string | null`

### 4.2 昵称校验工具（新增 `src/utils/nickname.ts`）

- `NICKNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9]+$/`
- `validateNickname(nickname): string | null`（返回错误文案或 null）

### 4.3 注册页（`src/views/RegisterView.vue`）

- 昵称输入：`validateNickname` 前端校验 + 错误提示
- 后端 400「昵称已存在」错误透出（现有 `error` 机制）

### 4.4 顶栏（`src/App.vue`）

- 右侧昵称改为「头像圆 + 昵称」**可点击区域** → 打开 `ProfilePanel`
- 头像：有 `avatar` 显示图片（圆形、`object-fit:cover`）；无则显示「昵称首字符 + 昵称哈希底色」占位

### 4.5 个人信息面板（新增 `src/components/ProfilePanel.vue`）

- `n-modal`（复用现有弹窗风格）
- 内容：
  - 头像（大图圆形，点击触发隐藏 `<input type=file accept="image/*">` → `POST /api/me/avatar`，成功后更新）
  - 昵称输入框 + 保存（`PUT /api/me/profile`，`validateNickname` 校验、错误透出）
  - 账号（username，只读显示）
- 上传/保存成功后通知并刷新 `auth` store 的 `user`

### 4.6 排表页占位格（`src/components/SlotCell.vue`）

- owner 昵称旁显示 20px 头像圆（`slot.owner_avatar`；无则占位不显示）

### 4.7 API 客户端（`src/api/client.ts`）

- 新增 `upload<T>(url, file: File)`：`FormData`（`append('file', file)`），不手动设 `Content-Type`（浏览器自动带 boundary），带 `Authorization`

### 4.8 Auth store（`src/stores/auth.ts`）

- 新增 `updateProfile(user: User)`：更新本地 `this.user`

## 5. 兜底细节（已确认）

- **未上传头像时**：显示「昵称首字符 + 昵称哈希底色」圆形占位（纯前端生成，无存储）
- **不做服务端压缩**：原图上传，前端圆形 `object-fit:cover` 裁剪；大小限制前后端双重校验

## 6. 校验与边界

| 场景 | 结果 |
|---|---|
| 注册昵称重复 | 400「昵称已存在」 |
| 注册昵称含空格/特殊符号 | 422（pydantic pattern） |
| 注册昵称合法（中文/字母/数字） | 200 |
| 修改昵称为他人昵称 | 400「昵称已存在」 |
| 修改昵称为自己当前昵称 | 200（查重排除自己） |
| 修改昵称含非法字符 | 422 |
| 上传非图片 / 超 2MB | 400 |
| S3 未配置 | 503「头像存储未配置」 |
| 无头像用户 | 前端首字符 + 哈希底色占位 |

## 7. 测试

- **后端 pytest**：
  - `test_auth.py`：注册昵称重复 400、非法字符 422、合法注册 200
  - 新增 `test_profile.py`：改昵称成功/查重（含自己不变）/非法字符；上传头像（monkeypatch `s3.upload_avatar` 返回 URL，断言返回 `UserOut.avatar`）；S3 未配置 503；`/api/auth/me` 返回 `avatar`
  - `test_raids.py`：`_detail` 填 `owner_avatar`（抽查 SlotOut 新字段存在）
  - 现有测试全量回归
- **前端 Vitest**：
  - `utils/nickname.spec.ts`：合法/非法昵称判定
  - `ProfilePanel`：改名成功更新 store、上传成功更新头像、错误透出（视组件可测性）
  - `App.vue` / `SlotCell`：头像展示分支（有图/占位）按需补 spec

## 8. 不做的事（YAGNI）

- 不做 S3 私有桶 + 预签名 URL
- 不做服务端图片压缩/裁剪（不加 Pillow）
- 不改密码、不做更多个人资料字段（邮箱、手机等）
- 不迁移/清理存量非法昵称
- 不为头像做 CDN 配置/缓存策略
- 不动公共机器人 API
