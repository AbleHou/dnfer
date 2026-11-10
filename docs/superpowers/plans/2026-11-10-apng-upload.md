# APNG 上传识别与校验 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 APNG 形象/头像能正常上传——后端字节级识别校验（magic + `acTL` chunk），归一化 `image/png` 存储，前端 `accept` 补 `.apng`。

**Architecture:** 新增纯函数助手 `services/images.py`（`detect_image`/`is_apng`/`image_content_type`），`auth.py` 头像与 `members.py` 形象两个上传端点共用：白名单加 `image/apng`、读字节后按 magic 校验内容与声称格式一致、S3 存储 ContentType 归一化。校验顺序「白名单 → 大小 → 内容 magic → s3 可用性」保持「未配置 S3 时非法文件仍 400」的既有契约。

**Tech Stack:** Python 3 + FastAPI + pytest（后端）；Vue 3 + Vitest（前端）。

**工作约定（覆盖技能默认）：** 本仓库**直接提交到 main，不做 worktree**；提交信息 `[feat]/[test]` 前缀 + 中文描述 + `Co-Authored-By` 尾注（HEREDOC 形式，见各任务 commit 步骤）。

---

## 文件结构

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `backend/app/services/images.py` | 创建 | 图片 magic 识别 / APNG chunk 识别 / ContentType 归一化（纯函数） |
| `backend/tests/test_images.py` | 创建 | 上述纯函数单测 |
| `backend/tests/helpers.py` | 修改 | 追加 `PNG_BYTES` / `APNG_BYTES` / `_chunk` 测试常量与构造器 |
| `backend/app/routers/auth.py` | 修改 | 头像上传：白名单 + magic 校验 + 归一化存储 |
| `backend/tests/test_profile.py` | 修改 | fixture 换真 PNG + APNG/伪造 MIME 新用例 |
| `backend/app/routers/members.py` | 修改 | 形象上传：同上模式 |
| `backend/tests/test_character_profiles.py` | 修改 | fixture 换真 PNG + APNG/伪造 MIME 新用例 |
| `frontend/src/views/MyCharactersView.vue` | 修改 | 形象 file input `accept` 补 `.apng` |
| `frontend/src/components/ProfilePanel.vue` | 修改 | 头像 file input `accept` 补 `.apng` |
| `frontend/src/views/MyCharactersView.spec.ts` | 修改 | 断言 accept 含 `.apng` |
| `frontend/src/components/ProfilePanel.spec.ts` | 修改 | 断言 accept 含 `.apng` |

后端测试命令（仓库约定）：`cd backend && .venv/bin/python -m pytest <file> -v`
前端测试命令（仓库约定）：`cd frontend && npx vitest run <file>`

---

## Task 1: 共享助手 `services/images.py` + 纯函数单测

**Files:**
- Create: `backend/app/services/images.py`
- Test: `backend/tests/test_images.py`

- [ ] **Step 1: 写失败测试** `backend/tests/test_images.py`

```python
from app.services.images import detect_image, image_content_type, is_apng

PNG_SIG = b"\x89PNG\r\n\x1a\n"


def _chunk(cname: bytes, payload: bytes) -> bytes:
    # 真实 PNG chunk 含 4 字节 CRC；补齐以匹配 is_apng 的 12+length 步进
    return len(payload).to_bytes(4, "big") + cname + payload + b"\x00\x00\x00\x00"


def _ihdr() -> bytes:
    return _chunk(b"IHDR",
                  (1).to_bytes(4, "big") + (1).to_bytes(4, "big") + b"\x08\x06\x00\x00\x00")


def _png(extra: bytes = b"") -> bytes:
    return PNG_SIG + _ihdr() + extra


def _static_png() -> bytes:
    return _png(_chunk(b"IDAT", b""))


def _apng() -> bytes:
    actl = _chunk(b"acTL", (1).to_bytes(4, "big") + (1).to_bytes(4, "big"))
    return _png(actl + _chunk(b"IDAT", b""))


def test_detect_png():
    assert detect_image(PNG_SIG + b"payload") == "png"


def test_detect_apng_returns_png():
    # APNG 与静态 PNG 同签名，detect_image 一律返回 'png'
    assert detect_image(_apng()) == "png"


def test_detect_jpeg():
    assert detect_image(b"\xff\xd8\xff\xe0\x00\x10JFIF") == "jpg"


def test_detect_webp():
    assert detect_image(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "webp"


def test_detect_unknown():
    assert detect_image(b"") is None
    assert detect_image(b"not an image") is None


def test_is_apng_true():
    assert is_apng(_apng()) is True


def test_is_apng_static_false():
    assert is_apng(_static_png()) is False


def test_is_apng_not_png_false():
    assert is_apng(b"garbage") is False


def test_is_apng_only_signature_false():
    assert is_apng(PNG_SIG) is False


def test_image_content_type():
    assert image_content_type("png") == "image/png"
    assert image_content_type("jpg") == "image/jpeg"
    assert image_content_type("webp") == "image/webp"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_images.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.images'`

- [ ] **Step 3: 实现最小代码** `backend/app/services/images.py`

```python
"""图片上传字节级识别与校验（纯函数，无状态）。

请求放行只依赖 detect_image（APNG 与静态 PNG 同签名，天然被接受）；
is_apng 是「识别」的可测纯函数，不接入请求流，供诊断/未来使用。
"""

PNG_SIG = b"\x89PNG\r\n\x1a\n"
JPEG_SIG = b"\xff\xd8\xff"
WEBP_MAGIC = (b"RIFF", b"WEBP")

_EXT_CONTENT_TYPE = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}


def detect_image(data: bytes) -> str | None:
    """按 magic bytes 识别图片类型，返回 'png'/'jpg'/'webp'，均不命中返回 None。"""
    if data.startswith(PNG_SIG):
        return "png"
    if data.startswith(JPEG_SIG):
        return "jpg"
    if len(data) >= 12 and data[:4] == WEBP_MAGIC[0] and data[8:12] == WEBP_MAGIC[1]:
        return "webp"
    return None


def is_apng(data: bytes) -> bool:
    """识别 APNG：PNG 签名后，acTL chunk 出现在首个 IDAT 之前。"""
    if not data.startswith(PNG_SIG):
        return False
    offset = 8
    while offset + 8 <= len(data):
        length = int.from_bytes(data[offset:offset + 4], "big")
        chunk_type = data[offset + 4:offset + 8]
        if chunk_type == b"acTL":
            return True
        if chunk_type == b"IDAT":
            return False
        offset += 12 + length
    return False


def image_content_type(ext: str) -> str:
    """存储用 ContentType 归一化映射。"""
    return _EXT_CONTENT_TYPE[ext]
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_images.py -v`
Expected: PASS — 10 tests passed

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/images.py backend/tests/test_images.py
git commit -m "$(cat <<'EOF'
[feat] 图片上传字节级识别与校验助手 detect_image/is_apng

APNG 与静态 PNG 同签名，detect_image 天然覆盖；is_apng 按 acTL chunk 识别。

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 测试常量 `PNG_BYTES` / `APNG_BYTES` 进 helpers

**Files:**
- Modify: `backend/tests/helpers.py:1-8`（顶部追加）

- [ ] **Step 1: 追加常量与构造器** `backend/tests/helpers.py` 顶部（`register_user` 定义之前）

```python
def _chunk(cname: bytes, payload: bytes) -> bytes:
    # 与 test_images.py 的构造器保持一致：真实 PNG chunk 含 4 字节 CRC
    return len(payload).to_bytes(4, "big") + cname + payload + b"\x00\x00\x00\x00"


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"payload"

APNG_BYTES = (b"\x89PNG\r\n\x1a\n"
              + _chunk(b"IHDR", (1).to_bytes(4, "big") + (1).to_bytes(4, "big") + b"\x08\x06\x00\x00\x00")
              + _chunk(b"acTL", (1).to_bytes(4, "big") + (1).to_bytes(4, "big"))
              + _chunk(b"IDAT", b""))
```

- [ ] **Step 2: 运行现有测试确认不回归**

Run: `cd backend && .venv/bin/python -m pytest tests/test_profile.py tests/test_character_profiles.py -v`
Expected: PASS — 全部通过（新增常量暂未被引用）

- [ ] **Step 3: 提交**

```bash
git add backend/tests/helpers.py
git commit -m "$(cat <<'EOF'
[test] helpers 增加 PNG_BYTES/APNG_BYTES 测试常量

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 头像上传接入 magic 校验（auth.py）

**Files:**
- Modify: `backend/app/routers/auth.py:6-12`（import）、`:45`（白名单）、`:70-95`（上传端点）
- Test: `backend/tests/test_profile.py`

- [ ] **Step 1: 改 fixture + 写失败测试** `backend/tests/test_profile.py`

1. 顶部 import（第 4 行）改为：
```python
from .helpers import APNG_BYTES, PNG_BYTES, register_user
```
2. `_upload` 助手默认数据换真 PNG（第 6 行）：
```python
def _upload(client, h, filename="a.png", data=PNG_BYTES, content_type="image/png"):
```
3. 新增两个测试（追加到 `test_avatar_unconfigured` 之后）：

```python
def test_avatar_upload_apng(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    captured = {}
    monkeypatch.setattr("app.s3.upload_avatar",
                        lambda uid, ext, data, ct: captured.update(ext=ext, ct=ct) or
                        "https://cdn.example.com/avatars/1/abc.png")
    h, _ = register_user(client, "prof10", "阿p动")
    r = _upload(client, h, data=APNG_BYTES, content_type="image/apng")
    assert r.status_code == 200
    assert captured["ext"] == "png"
    assert captured["ct"] == "image/png"  # 归一化存储


def test_avatar_upload_mime_spoof(client):
    # 声称 image/png 但内容是垃圾：magic 校验拦截（未配置 S3 也先 400）
    h, _ = register_user(client, "prof11", "阿伪")
    r = _upload(client, h, data=b"garbage", content_type="image/png")
    assert r.status_code == 400
    assert r.json()["detail"] == "图片内容与格式不符"
```

- [ ] **Step 2: 运行确认新测试失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_profile.py -v`
Expected: 既有用例全绿；`test_avatar_upload_apng` FAIL（`image/apng` 不在白名单 → 400 而非 200）、`test_avatar_upload_mime_spoof` FAIL（`b"garbage"` 无 magic 校验 → 503 而非 400）

- [ ] **Step 3: 实现** `backend/app/routers/auth.py`

1. import 区（第 6-12 行处）加：
```python
from ..services.images import detect_image, image_content_type
```
2. 白名单（第 45 行）加 `image/apng`：
```python
_AVATAR_EXT = {"image/png": "png", "image/apng": "png",
               "image/jpeg": "jpg", "image/webp": "webp"}
```
3. `upload_avatar` 端点（第 77-87 行）——在大小校验后加 magic 校验、存储 ContentType 归一化：
```python
    if file.content_type not in _AVATAR_EXT:
        raise HTTPException(400, "仅支持 PNG/JPG/WebP 图片")
    data = file.file.read()
    if len(data) > _MAX_AVATAR_BYTES:
        raise HTTPException(400, "图片不能超过 2MB")
    ext = _AVATAR_EXT[file.content_type]
    if detect_image(data) != ext:
        raise HTTPException(400, "图片内容与格式不符")
    if not s3.s3_configured():
        raise HTTPException(503, "头像存储未配置")
    try:
        url = s3.upload_avatar(user.id, ext, data, image_content_type(ext))
    except Exception:
        raise HTTPException(503, "头像存储暂不可用")
```

> 端点其余部分（删旧头像对象、`user.avatar = url`、commit、返回）原样保留，不改动。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_profile.py -v`
Expected: PASS — 全部通过（含新 APNG / 伪造 MIME 用例）

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/auth.py backend/tests/test_profile.py
git commit -m "$(cat <<'EOF'
[feat] 头像上传支持 APNG：image/apng 白名单 + magic 内容校验 + 归一化 image/png

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 形象上传接入 magic 校验（members.py）

**Files:**
- Modify: `backend/app/routers/members.py:10-12`（import）、`:61`（白名单）、`:64-87`（上传端点）
- Test: `backend/tests/test_character_profiles.py`

- [ ] **Step 1: 改 fixture + 写失败测试** `backend/tests/test_character_profiles.py`

1. 顶部 import 改为：
```python
from .helpers import APNG_BYTES, PNG_BYTES, register_user
```
2. 三处走 magic 校验的 fixture（`b"fakepng"` 或 `b"x"`）换 `PNG_BYTES`：
   - `test_profile_upload_success`（第 19 行 `files={"file": ("a.png", b"fakepng", "image/png")}`）
   - `test_profile_upload_replaces_old_and_deletes`（第 33 与 36 行，均为 `b"fakepng"`）
   - `test_profile_restore_default`（第 64 行 `b"x"` → `PNG_BYTES`）
3. `test_profile_upload_validation`（第 39-45 行）改 503 行为合法 PNG，并新增伪造 MIME 断言：
```python
def test_profile_upload_validation(client):
    h, u = register_user(client, "pf3", "阿限")
    char = _create_char(client, h)
    url = f"/api/me/characters/{char['id']}/profile"
    assert client.post(url, headers=h, files={"file": ("a.svg", b"x", "image/svg+xml")}).status_code == 400
    assert client.post(url, headers=h, files={"file": ("a.png", b"x" * (10 * 1024 * 1024 + 1), "image/png")}).status_code == 400
    # 内容与声称格式不符：magic 校验拦截（未配置 S3 也先 400）
    assert client.post(url, headers=h, files={"file": ("a.png", b"x", "image/png")}).status_code == 400
    # 合法 PNG 但 S3 未配置 → 503
    assert client.post(url, headers=h, files={"file": ("a.png", PNG_BYTES, "image/png")}).status_code == 503
```
4. 新增 APNG 用例（追加到文件末尾）：

```python
def test_profile_upload_apng(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    captured = []
    monkeypatch.setattr("app.s3.upload_profile",
                        lambda uid, cid, ext, data, ct: captured.append((ext, ct)) or
                        "https://cdn.example.com/profiles/%s/%s/a.png" % (uid, cid))
    h, u = register_user(client, "pf9", "阿动")
    char = _create_char(client, h)
    url = f"/api/me/characters/{char['id']}/profile"
    for ct in ("image/apng", "image/png"):
        r = client.post(url, headers=h, files={"file": ("a.apng", APNG_BYTES, ct)})
        assert r.status_code == 200, ct
    # 两种声称类型都归一化存储为 image/png
    assert captured == [("png", "image/png"), ("png", "image/png")]
```

- [ ] **Step 2: 运行确认新测试失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_character_profiles.py -v`
Expected: 未改动的既有用例全绿（fixture 换 PNG 后按旧逻辑通过）；`test_profile_upload_apng` FAIL（`image/apng` 白名单外 → 400）；被改动的 `test_profile_upload_validation` FAIL——其新增「`b"x"` 断言 400」一行实得 503（无 magic 校验）

- [ ] **Step 3: 实现** `backend/app/routers/members.py`

1. import 区（第 10-12 行 services imports 后）加：
```python
from ..services.images import detect_image, image_content_type
```
2. 白名单（第 61 行）加 `image/apng`：
```python
_PROFILE_EXT = {"image/png": "png", "image/apng": "png",
                "image/jpeg": "jpg", "image/webp": "webp"}
```
3. `upload_character_profile` 端点（第 69-79 行）——大小校验后加 magic 校验、存储 ContentType 归一化：
```python
    if file.content_type not in _PROFILE_EXT:
        raise HTTPException(400, "仅支持 PNG/JPG/WebP 图片")
    data = file.file.read()
    if len(data) > _MAX_PROFILE_BYTES:
        raise HTTPException(400, "图片不能超过 10MB")
    ext = _PROFILE_EXT[file.content_type]
    if detect_image(data) != ext:
        raise HTTPException(400, "图片内容与格式不符")
    if not s3.s3_configured():
        raise HTTPException(503, "图片存储未配置")
    try:
        url = s3.upload_profile(user.id, c.id, ext, data, image_content_type(ext))
    except Exception:
        raise HTTPException(503, "图片存储暂不可用")
```

> 端点其余部分（删旧 profile 对象、`c.profile = url`、commit、返回）原样保留，不改动。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_character_profiles.py -v`
Expected: PASS — 全部通过（含新 APNG / 伪造 MIME 用例）

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/members.py backend/tests/test_character_profiles.py
git commit -m "$(cat <<'EOF'
[feat] 角色形象上传支持 APNG：image/apng 白名单 + magic 内容校验 + 归一化 image/png

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 前端 file input `accept` 补 `.apng`

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue:129`
- Modify: `frontend/src/components/ProfilePanel.vue:67`
- Test: `frontend/src/views/MyCharactersView.spec.ts:344-356`
- Test: `frontend/src/components/ProfilePanel.spec.ts:56-70`

- [ ] **Step 1: 改 accept**（两处 `accept="image/*"` → `accept="image/*,.apng"`）

- `frontend/src/views/MyCharactersView.vue:129`：`<input ref="profileInput" type="file" accept="image/*,.apng" ...>`
- `frontend/src/components/ProfilePanel.vue:67`：`<input ref="fileInput" type="file" accept="image/*,.apng" ...>`

- [ ] **Step 2: 加断言**（利用两个 spec 现成的 `const input = ...find('input[type="file"]')`）

- `MyCharactersView.spec.ts`「自定义形象上传调用 api.upload 正确 URL」用例中，`const input = wrapper.find('input[type="file"]')` 之后加一行：
```ts
expect(input.attributes('accept')).toContain('.apng')
```
- `ProfilePanel.spec.ts`「上传头像成功后更新用户并提示」用例中，`const input = w.find('input[type="file"]')` 之后加一行：
```ts
expect(input.attributes('accept')).toContain('.apng')
```

- [ ] **Step 3: 运行前端测试**

Run: `cd frontend && npx vitest run src/views/MyCharactersView.spec.ts src/components/ProfilePanel.spec.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/MyCharactersView.vue frontend/src/components/ProfilePanel.vue frontend/src/views/MyCharactersView.spec.ts frontend/src/components/ProfilePanel.spec.ts
git commit -m "$(cat <<'EOF'
[feat] 形象/头像上传 accept 补 .apng，兜底 Safari 文件选择器过滤

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 全量回归

**Files:**（无代码改动，仅验证）

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: PASS — 全量通过

- [ ] **Step 2: 前端全量测试 + 类型/构建**

Run: `cd frontend && npx vitest run`
Expected: PASS
Run: `cd frontend && npm run build`（= vue-tsc -b && vite build）
Expected: 无类型错误，构建成功

- [ ] **Step 3: 收尾**（如全绿即完成，无需额外提交）

---
