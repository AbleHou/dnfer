# APNG 上传识别与校验 · 设计文档

日期：2026-11-10
状态：设计已确认，待实现

## 背景与目标

「我的角色」形象（`POST /api/me/characters/{cid}/profile`）与用户头像（`POST /api/me/avatar`）上传目前按 **MIME 白名单**拦截（仅 `image/png|jpeg|webp`）。APNG 文件以 `.apng` 扩展名保存时，Chromium/Firefox 报 `image/apng`，被白名单 400「仅支持 PNG/JPG/WebP 图片」——这是用户实测到的失败（能选中文件，上传后报 400）。

同时现状**完全没有字节级内容校验**：伪造 MIME 或非图片字节（如 `b"fakepng"`）也能入库。

本次目标：
1. **识别**：上传时识别 APNG（PNG 的 `acTL` chunk），使其能正常上传；
2. **校验**：字节级 magic 校验，拒绝内容与声称格式不符的文件；
3. **归一化存储**：APNG 按 `image/png` 存储（新浏览器照常播动画、旧 Safari 显首帧），兼容性最好。

## 设计决策（已与用户确认）

| 决策点 | 结论 |
| --- | --- |
| 方案 | 方案 A：字节级 magic 校验 + APNG chunk 识别，归一化存储 |
| 覆盖入口 | 角色形象（`routers/members.py`）+ 头像（`routers/auth.py`），同一套共享逻辑 |
| 校验方式 | 不引入新依赖；magic bytes + PNG chunk 扫描（`acTL` 于首个 `IDAT` 前即 APNG） |
| 存储归一化 | png/apng → `image/png` + `.png` 后缀；jpeg → `image/jpeg`；webp → `image/webp` |
| 大小限制 | 不变（头像 2MB / 形象 10MB） |
| 前端 | 不改拦截逻辑，只把 `accept` 补 `.apng` 兜底 Safari 文件选择器过滤 |

## 架构与组件

### 后端

1. **新共享助手** `services/images.py`（纯函数，无状态）：
   - 常量 `PNG_SIG = b"\x89PNG\r\n\x1a\n"`、`JPEG_SIG = b"\xff\xd8\xff"`、`WEBP_SIG = (b"RIFF", b"WEBP")`
   - `detect_image(data: bytes) -> str | None`：按 magic 返回 `'png'` / `'jpg'` / `'webp'`，均不命中返回 `None`
     - `data.startswith(PNG_SIG)` → `'png'`（APNG 与静态 PNG 同签名，天然覆盖）
     - `data.startswith(JPEG_SIG)` → `'jpg'`
     - `len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"` → `'webp'`
   - `is_apng(data: bytes) -> bool`：先验 PNG 签名；随后按 chunk 结构遍历（8 字节签名 → IHDR → 循环读 4 字节大端长度 + 4 字节类型），`acTL` 出现在首个 `IDAT` 之前 → `True`；到 `IDAT` 未见 `acTL` → `False`；非 PNG / 数据不足 → `False`
   - **角色说明**：请求放行只依赖 `detect_image`（APNG 与静态 PNG 同签名，天然被接受）；`is_apng` 是「识别」这一交付物的可测纯函数（配单测），**不接入请求流**，供诊断/未来使用——计划实现时不得把它当请求校验路径的一部分。
   - `image_content_type(ext: str) -> str`：`{'png': 'image/png', 'jpg': 'image/jpeg', 'webp': 'image/webp'}[ext]`

2. **`routers/auth.py`（头像）与 `routers/members.py`（形象）**：
   - `_AVATAR_EXT` / `_PROFILE_EXT` 白名单加 `"image/apng": "png"`（仍按 content-type 做快速预过滤）
   - 读取 `data` 且大小校验通过后新增内容校验：
     ```python
     ext = _AVATAR_EXT[file.content_type]  # 或 _PROFILE_EXT
     if detect_image(data) != ext:
         raise HTTPException(400, "图片内容与格式不符")
     ```
   - 存储 ContentType 归一化：`s3.upload_*(..., image_content_type(ext))`（不再透传浏览器声称的 content_type；`file.content_type or "application/octet-stream"` 兜底随之消失）
   - 校验顺序保持「文件级 400 先于 s3 可用性 503」的既有契约：**白名单 → 大小 → 内容 magic → s3 可用性**（未配置 S3 时，非法内容文件仍返回 400；合法文件才落到 503）

### 前端

- `MyCharactersView.vue:129` 与 `ProfilePanel.vue:67` 的 `<input ... accept="image/*">` 改为 `accept="image/*,.apng"`（Chromium/Firefox 本就允许 `.apng`；补 `.apng` 兜底 Safari 按扩展名过滤的文件选择器）。
- 前端不做类型拦截；错误统一交给后端 400 文案（`notifyError(err.message)`）。

## 错误处理

| 场景 | 响应 |
| --- | --- |
| content-type 不在白名单（svg/gif/bmp/avif 等） | 400「仅支持 PNG/JPG/WebP 图片」（现有行为不变） |
| 内容 magic 与声称格式不符（伪造 MIME / 非图片字节） | 400「图片内容与格式不符」（新增） |
| 大小超限（头像 2MB / 形象 10MB） | 400（现有，不变） |
| S3 未配置 / 上传异常 | 503「…存储未配置 / 暂不可用」（现有，不变） |

校验顺序保证：白名单 → 大小 → 内容 magic → s3 可用性。现有 `test_profile_upload_validation` 中「`b"x"` 期望 503」的用例需改为**合法 PNG 字节**才落到 503；`b"x"` 转为断言 400。

## 测试

- 后端纯函数单测 `tests/test_images.py`（新）：
  - `detect_image`：真 PNG/JPEG/WebP 签名命中；空字节 / 垃圾字节 → `None`；APNG 字节 → `'png'`
  - `is_apng`：minimal APNG（`PNG_SIG + IHDR + acTL + IDAT`）→ `True`；静态 PNG（`PNG_SIG + IHDR + IDAT`）→ `False`；非 PNG → `False`；仅签名无 chunk → `False`
  - `image_content_type`：png→image/png、jpg→image/jpeg、webp→image/webp
- 测试 fixture 统一提供合法 PNG 字节，例如：
  ```python
  PNG = b"\x89PNG\r\n\x1a\n" + b"payload"
  ```
- `tests/test_profile.py` / `tests/test_character_profiles.py`：
  - 所有走 magic 校验的成功/替换/恢复/503 用例：`b"fakepng"` / `b"x"` 换 `PNG` 字节（`test_profile_upload_success`、`test_profile_upload_replaces_old_and_deletes`、`test_profile_restore_default`、`test_avatar_upload_success`、`test_avatar_unconfigured`、`test_profile_upload_validation` 的 503 行）
  - `test_profile_upload_not_own_404` 保持 `b"x"` 不变：404 归属校验先于内容校验，属有意为之（若将来调整校验顺序需同步改该 fixture）
  - 新增：形象上传 APNG（minimal APNG 字节 + `image/apng` 与 `image/png`）→ 200，且 mock 捕获的 s3 调用断言 `ext == 'png'`、`content_type == 'image/png'`
  - 新增：声称 `image/png` 但字节为垃圾 → 400「图片内容与格式不符」（形象 + 头像两处）
  - 头像同样补 APNG 成功用例（`image/apng` → 200）
- 前端：
  - 现有 `MyCharactersView.spec` / `ProfilePanel.spec` 上传 URL / FormData 断言不受影响
  - 可补 `accept` 属性含 `.apng` 的断言（可选）
  - 全量 `npm run build`（vue-tsc）保持绿

## 不做的事（明确非目标）

- 不引入 Pillow 等重解码依赖（不做真实像素解码；magic + chunk 校验足够）
- 不为 APNG 单独建存储类型 / 目录（归一化为 png）
- 不提供「仅允许静态」或「仅允许 APNG」的开关
- 不改展示端逻辑（现代浏览器对 `image/png` 的 APNG 已能播动画；旧 Safari 只显首帧属浏览器行为，不在本项目解决）
