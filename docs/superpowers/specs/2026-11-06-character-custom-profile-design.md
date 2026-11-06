# 角色自定义 profile · 设计文档

日期：2026-11-06
状态：设计已确认，待实现

## 背景与目标

「我的角色」九宫格海报目前用职业默认 profile（`images/characters/{parent}/{job}/profile.png`）。
本次加入**自定义 profile**：用户可为自己角色的海报上传专属图片，也可随时恢复默认。
图片存 S3 桶的 `profiles/` 目录（桶已在 `.env` 配置，目录已创建；既有用户头像存 `avatars/`）。

## 设计决策（已与用户确认）

| 决策点 | 结论 |
| --- | --- |
| 上传入口 | 编辑角色弹窗内（MyCharactersView 的 DnfDialog 中 CharacterForm 下方，仅编辑态显示） |
| 权限范围 | 仅成员本人（`/api/me`）；管理员只管用户信息不管 profile；前端只在「我的角色」实现一次，不动管理端 |
| 图片约束 | png/jpg/webp，≤10MB；海报 `object-fit: cover` 裁剪，不限比例 |
| 恢复默认 | DELETE 清 profile 字段并删 S3 对象，海报回退职业默认图 |
| 后端接口 | 一套成员端点（共用），不单独为管理端建端点 |

## 架构与组件

### 后端

1. **数据模型** `models.py`：`Character` 加
   ```python
   profile: Mapped[str | None] = mapped_column(String(256), nullable=True)
   ```
   存量库幂等迁移 `migrate_characters_profile`（`PRAGMA table_info(characters)` → `ALTER TABLE characters ADD COLUMN profile VARCHAR(256)`），注册进 `db.py` 的 `init_db`。

2. **S3** `s3.py`：
   - 抽出通用内部函数 `_upload(key, ext, data, content_type)` / `_delete(key)`；
   - 对外 `upload_avatar` / `delete_avatar` 内部复用（签名不变）；
   - 新增 `upload_profile(user_id, char_id, ext, data, content_type)` → key `profiles/{user_id}/{char_id}/{uuid}.{ext}`；
   - 新增 `delete_object(key_or_url)`：按 URL 前缀校验后 best-effort 删对象（对齐 `delete_avatar` 语义，入参可为完整 URL）。

3. **端点** `routers/members.py`（仅成员，owner 校验）：
   - `POST /api/me/characters/{cid}/profile`（multipart `file`）：
     1. 校验角色归属（404「角色不存在」）；
     2. 白名单 `image/png|jpeg|webp` 否则 400「仅支持 PNG/JPG/WebP 图片」；`>10MB` → 400「图片不能超过 10MB」；`s3_configured()` 为假 → 503「图片存储未配置」；
     3. S3 上传异常 → 503「图片存储暂不可用」；
     4. 若已有 `profile` 先 best-effort 删旧对象；
     5. `character.profile = url`，commit，返回 `CharacterOut`。
   - `DELETE /api/me/characters/{cid}/profile`（恢复默认）：校验归属 → best-effort 删 S3 对象 → `profile = None` → commit → 返回 `CharacterOut`。

4. **角色删除清理**：`services/characters.py` `delete_character_if_free` 删除角色前 best-effort 删其 profile S3 对象（覆盖成员端与管理端单角色删除）；`admin.py` `delete_guest_user` 批量删角色时**先收集各角色 profile URL 再批量 best-effort 删除**（该路径不走 `delete_character_if_free`，需显式处理，防孤儿对象）。

5. **序列化** `services/characters.py` `character_out` 补 `profile=c.profile`；`schemas.py` `CharacterOut` 加 `profile: str | None = None`（带默认值防中间态）。

### 前端

1. **类型** `types.ts`：`Character` 加必填 `profile: string | null`（连带修全部 Character 字面量 fixture）。

2. **CharacterPoster.vue**：主图 src 改为 `character.profile ?? characterProfile(parent_name, job_name)`；兜底链路两级——自定义图加载失败 → 切默认图（`characterProfile`）再失败 → 深底+职业图标。`fallbackUsed` 状态改为记录当前兜底层级（`0` 原图 / `1` 默认图 / `2` 深底图标）；**watch `character.profile` 变化时重置兜底状态**（恢复默认/换图后重新尝试对应层级，避免停留在旧兜底）。

3. **api.client**：复用 `api.upload`（FormData）与 `api.del`。

4. **MyCharactersView.vue 编辑弹窗**：`DnfDialog` 内 `CharacterForm` 下方加「角色头像」区（`editing` 非空才显示）：
   - 当前图预览（`character.profile ?? characterProfile(...)`，3:4 小预览）；
   - 「上传」按钮（隐藏 file input，`api.upload('/api/me/characters/{id}/profile', f)` → 用返回的 `CharacterOut` 更新 `editing`（含新 profile，弹窗内预览即时刷新）→ `load()` 刷新网格）；
   - 「恢复默认」按钮（仅 `editing.profile` 非空显示，`api.del(...)` → 同样更新 `editing` + `load()`）；
   - 上传/恢复中按钮禁用；错误 `notifyError`、成功 `notifySuccess`。

## 错误处理

- 上传：类型不符 / >10MB → 400；S3 未配置 → 503；S3 异常 → 503；非本人角色 → 404（校验顺序对齐 avatar 端点）。
- 恢复默认：非本人 → 404；S3 删除失败 best-effort 忽略。
- 自定义图加载失败：前端逐级回退（自定义 → 默认 → 深底+图标），不阻断、不循环。
- 角色删除：S3 清理 best-effort，失败不影响删除。

## 测试

- 后端 `tests/test_character_profiles.py`：
  - 上传 png → `CharacterOut.profile` 为 `profiles/` URL；重复上传后旧对象被删（mock `s3` 断言调用与 key）
  - svg → 400、>10MB → 400、S3 未配置 → 503（清空 s3 env 覆盖）
  - DELETE → `profile` 变 None + 删对象；非本人 → 404
  - `character_out` 序列化含 profile
- 前端：
  - `CharacterPoster.spec`：有 `profile` 时主图用自定义 URL；自定义失败回退默认；默认再失败回退深底+图标
  - `MyCharactersView.spec`：编辑弹窗显示「角色头像」区、创建弹窗不显示；上传调用 `api.upload` 正确 URL；恢复默认调用 `api.del`
  - 修全部 Character fixture（补 `profile: null`）
- 全量：`npm run build`（vue-tsc）+ 前后端测试全绿

## 不做的事（明确非目标）

- 不向管理端加 profile 管理（管理员只管用户信息）
- 不把自定义 profile 引入其他角色展示模块（SignupModal / RosterPool / CharacterCard 等仍用职业图标或默认图）
- 不强制图片比例/裁剪（交给 `object-fit: cover`）
- 不为自定义 profile 建独立表（一角色一图直接列字段）
