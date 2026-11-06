# 角色自定义 profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户能在「我的角色」编辑弹窗为自己角色上传自定义 profile（存 S3 `profiles/` 目录），并可恢复默认职业图。

**Architecture:** 后端 `Character` 加 `profile` nullable 列（存量迁移）+ S3 新增 `upload_profile`/`delete_profile`（内部抽 `_upload`/`_delete`）+ 成员端点 `POST/DELETE /api/me/characters/{cid}/profile`；`CharacterOut`/`character_out` 携带 profile；角色删除时 best-effort 清 S3 对象。前端 `Character` 类型加 `profile`，`CharacterPoster` 主图优先用自定义、失败逐级回退（自定义→默认→深底+图标），`MyCharactersView` 编辑弹窗在 `CharacterForm` 下方加「角色头像」区（上传/恢复默认）。

**Tech Stack:** FastAPI + SQLAlchemy + boto3（后端）、Vue 3 `<script setup>` + `@dnftools/ui` + Vitest + vue-tsc（前端）。

**Spec:** `docs/superpowers/specs/2026-11-06-character-custom-profile-design.md`

---

### Task 1: 后端基础设施（模型列 + 迁移 + S3 重构 + 序列化 + 删除清理）

**Files:**
- Modify: `backend/app/models.py:35-57`（Character 加 profile 列）
- Modify: `backend/app/migrations.py`（新增 `migrate_characters_profile`）
- Modify: `backend/app/db.py:35-49`（注册迁移）
- Modify: `backend/app/s3.py`（抽 `_upload`/`_delete`/`_key_from_url`，新增 `upload_profile`/`delete_profile`，保留 `upload_avatar`/`delete_avatar` 签名）
- Modify: `backend/app/schemas.py:31-52`（CharacterOut 加 `profile`）
- Modify: `backend/app/services/characters.py`（`character_out` 补 profile；`delete_character_if_free` 删前清 S3）
- Modify: `backend/app/routers/admin.py:250-270`（`delete_guest_user` 批量删角色前收集 profile 清理）
- Test: `backend/tests/test_migrations.py`、`backend/tests/test_profile.py`（s3 单测）

- [ ] **Step 1: models.py 加 profile 列**

`backend/app/models.py` 的 `Character` 类 `combat_power` 之后加：

```python
    profile: Mapped[str | None] = mapped_column(String(256), nullable=True)  # 自定义海报图 S3 URL
```

- [ ] **Step 2: migrations.py 新增迁移函数**

`backend/app/migrations.py` 末尾加（对齐 `migrate_characters_sun_buff` 模式）：

```python
def migrate_characters_profile(engine: Engine) -> None:
    """为存量库补建 characters.profile 列（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(characters)")).all()}
        if "profile" not in cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN profile VARCHAR(256)"))
```

- [ ] **Step 3: db.py 注册迁移**

`backend/app/db.py` `init_db`：在 import 列表加 `migrate_characters_profile`，在调用列表（`migrate_characters_damage` 之后）加 `migrate_characters_profile(engine)`。

- [ ] **Step 4: s3.py 重构 + 新增 profile 函数**

`backend/app/s3.py` 改为（保留 `upload_avatar`/`delete_avatar` 对外签名不变，内部抽公共）：

```python
def _key_from_url(url: str) -> str | None:
    base = settings.s3_public_base.rstrip("/")
    if not url.startswith(base + "/"):
        return None
    return url[len(base) + 1:]

def _upload(key: str, ext: str, data: bytes, content_type: str) -> str:
    _get_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data,
                             ContentType=content_type, ACL="public-read")
    return f"{settings.s3_public_base.rstrip('/')}/{key}"

def _delete(key: str) -> None:
    try:
        _get_client().delete_object(Bucket=settings.s3_bucket, Key=key)
    except Exception:
        pass

def upload_avatar(user_id: int, ext: str, data: bytes, content_type: str) -> str:
    return _upload(f"avatars/{user_id}/{uuid4().hex}.{ext}", ext, data, content_type)

def delete_avatar(url: str) -> None:
    key = _key_from_url(url)
    if key:
        _delete(key)

def upload_profile(user_id: int, char_id: int, ext: str, data: bytes, content_type: str) -> str:
    return _upload(f"profiles/{user_id}/{char_id}/{uuid4().hex}.{ext}", ext, data, content_type)

def delete_profile(url: str) -> None:
    key = _key_from_url(url)
    if key:
        _delete(key)
```

- [ ] **Step 5: schemas.py CharacterOut 加 profile**

`backend/app/schemas.py` `CharacterOut` 末尾（`combat_power` 后）加：

```python
    profile: str | None = None
```

- [ ] **Step 6: services/characters.py 序列化 + 删除清理**

`character_out` 返回值加 `profile=c.profile`。

`delete_character_if_free` 顶部（拿到 `cid` 后）加：

```python
    c = db.get(Character, cid)
    if c and c.profile:
        s3.delete_profile(c.profile)
```

并在文件顶部 import 加 `from .. import s3`（s3.py 只依赖 config，无循环引用）。

- [ ] **Step 7: admin.py delete_guest_user 清理 profile**

`delete_guest_user` 中第 2 步「删角色」之前收集并清理：

```python
    for p in [c.profile for c in db.query(Character).filter(Character.user_id == uid).all() if c.profile]:
        s3.delete_profile(p)
    db.query(Character).filter(Character.user_id == uid).delete()
```

文件顶部加 `from .. import s3`（若未导入）。

- [ ] **Step 8: 迁移 + s3 单测（TDD）**

`backend/tests/test_migrations.py` 加（对齐该文件既有 inline engine 写法，**无 `engine` fixture**）：

```python
def test_migrate_characters_profile():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE characters (
            id INTEGER PRIMARY KEY, user_id INTEGER, name VARCHAR(64), job_name VARCHAR(64),
            class_type VARCHAR(8), fame INTEGER)"""))
    from app.migrations import migrate_characters_profile
    migrate_characters_profile(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(characters)")).all()}
        assert "profile" in cols
    migrate_characters_profile(engine)  # 幂等
```

（顶部 import 已有 `create_engine, text`。）

`backend/tests/test_profile.py` 加 s3 key 格式单测：

```python
def test_upload_profile_key_format(monkeypatch):
    captured = {}
    monkeypatch.setattr("app.s3._get_client", lambda: SimpleNamespace(
        put_object=lambda **kw: captured.update(kw)))
    from app.s3 import upload_profile, delete_profile, _key_from_url
    url = upload_profile(3, 7, "png", b"x", "image/png")
    assert "/profiles/3/7/" in url and url.endswith(".png")
    assert captured["Key"].startswith("profiles/3/7/") and captured["Key"].endswith(".png")
    assert captured["ACL"] == "public-read"
    assert _key_from_url(url) == captured["Key"]
    assert _key_from_url("https://other.example.com/x.png") is None
```

- [ ] **Step 9: 跑后端测试**

```bash
cd backend && .venv/bin/python -m pytest tests/test_profile.py tests/test_migrations.py -v
```

Expected: 全绿。

- [ ] **Step 10: 提交**

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/db.py backend/app/s3.py backend/app/schemas.py backend/app/services/characters.py backend/app/routers/admin.py backend/tests/test_profile.py backend/tests/test_migrations.py
git commit -m "[fet] 角色自定义 profile：数据模型 + S3 重构 + 删除清理"
```

---

### Task 2: 后端 profile 端点（成员上传 / 恢复默认）

**Files:**
- Modify: `backend/app/routers/members.py`
- Test: Create `backend/tests/test_character_profiles.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_character_profiles.py`：

```python
from .helpers import register_user

def _create_char(client, h, name="角色", job_name="weapon_master"):
    r = client.post("/api/me/characters", headers=h,
                    json={"name": name, "job_name": job_name, "fame": 1})
    assert r.status_code == 200
    return r.json()

def test_profile_upload_success(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    calls = []
    monkeypatch.setattr("app.s3.upload_profile",
                        lambda uid, cid, ext, data, ct: calls.append((uid, cid)) or
                        "https://cdn.example.com/profiles/%s/%s/abc.png" % (uid, cid))
    monkeypatch.setattr("app.s3.delete_profile", lambda url: calls.append(("del", url)))
    h, u = register_user(client, "pf1", "阿p")
    char = _create_char(client, h)
    r = client.post(f"/api/me/characters/{char['id']}/profile", headers=h,
                    files={"file": ("a.png", b"fakepng", "image/png")})
    assert r.status_code == 200
    assert r.json()["profile"] == f"https://cdn.example.com/profiles/{u['id']}/{char['id']}/abc.png"
    assert calls[0] == (u["id"], char["id"])

def test_profile_upload_replaces_old_and_deletes(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    monkeypatch.setattr("app.s3.upload_profile",
                        lambda uid, cid, ext, data, ct: "https://cdn.example.com/profiles/%s/%s/new.png" % (uid, cid))
    deleted = []
    monkeypatch.setattr("app.s3.delete_profile", lambda url: deleted.append(url))
    h, u = register_user(client, "pf2", "阿换")
    char = _create_char(client, h)
    client.post(f"/api/me/characters/{char['id']}/profile", headers=h,
                files={"file": ("a.png", b"fakepng", "image/png")})
    deleted.clear()
    client.post(f"/api/me/characters/{char['id']}/profile", headers=h,
                files={"file": ("b.png", b"fakepng", "image/png")})
    assert len(deleted) == 1 and "profiles/" in deleted[0]  # 旧对象被删

def test_profile_upload_validation(client):
    h, u = register_user(client, "pf3", "阿限")
    char = _create_char(client, h)
    url = f"/api/me/characters/{char['id']}/profile"
    assert client.post(url, headers=h, files={"file": ("a.svg", b"x", "image/svg+xml")}).status_code == 400
    assert client.post(url, headers=h, files={"file": ("a.png", b"x" * (10 * 1024 * 1024 + 1), "image/png")}).status_code == 400
    assert client.post(url, headers=h, files={"file": ("a.png", b"x", "image/png")}).status_code == 503  # 默认未配置

def test_profile_upload_not_own_404(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    h1, u1 = register_user(client, "pf4", "阿甲")
    h2, u2 = register_user(client, "pf5", "阿乙")
    char = _create_char(client, h1)
    assert client.post(f"/api/me/characters/{char['id']}/profile", headers=h2,
                       files={"file": ("a.png", b"x", "image/png")}).status_code == 404

def test_profile_restore_default(client, monkeypatch):
    monkeypatch.setattr("app.s3.s3_configured", lambda: True)
    monkeypatch.setattr("app.s3.upload_profile",
                        lambda uid, cid, ext, data, ct: "https://cdn.example.com/profiles/%s/%s/abc.png" % (uid, cid))
    deleted = []
    monkeypatch.setattr("app.s3.delete_profile", lambda url: deleted.append(url))
    h, u = register_user(client, "pf6", "阿恢")
    char = _create_char(client, h)
    client.post(f"/api/me/characters/{char['id']}/profile", headers=h,
                files={"file": ("a.png", b"x", "image/png")})
    r = client.delete(f"/api/me/characters/{char['id']}/profile", headers=h)
    assert r.status_code == 200
    assert r.json()["profile"] is None
    assert len(deleted) == 1

def test_profile_restore_not_own_404(client, monkeypatch):
    h1, u1 = register_user(client, "pf7", "阿丙")
    h2, u2 = register_user(client, "pf8", "阿丁")
    char = _create_char(client, h1)
    assert client.delete(f"/api/me/characters/{char['id']}/profile", headers=h2).status_code == 404
```

- [ ] **Step 2: 运行确认失败**

```bash
cd backend && .venv/bin/python -m pytest tests/test_character_profiles.py -v
```

Expected: FAIL——`/api/me/characters/{cid}/profile` 返回 405 或 404（端点未注册）。

- [ ] **Step 3: 实现端点**

`backend/app/routers/members.py` 顶部 import 加 `File, UploadFile` 与 `from .. import s3`；加常量与两个端点（`delete_character` 之后）：

```python
_PROFILE_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_MAX_PROFILE_BYTES = 10 * 1024 * 1024

@router.post("/{cid}/profile", response_model=CharacterOut)
def upload_character_profile(cid: int, file: UploadFile = File(...),
                             user: User = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    if file.content_type not in _PROFILE_EXT:
        raise HTTPException(400, "仅支持 PNG/JPG/WebP 图片")
    data = file.file.read()
    if len(data) > _MAX_PROFILE_BYTES:
        raise HTTPException(400, "图片不能超过 10MB")
    if not s3.s3_configured():
        raise HTTPException(503, "图片存储未配置")
    ext = _PROFILE_EXT[file.content_type]
    try:
        url = s3.upload_profile(user.id, c.id, ext, data,
                                file.content_type or "application/octet-stream")
    except Exception:
        raise HTTPException(503, "图片存储暂不可用")
    if c.profile:
        s3.delete_profile(c.profile)
    c.profile = url
    db.commit()
    db.refresh(c)
    return character_out(c)

@router.delete("/{cid}/profile", response_model=CharacterOut)
def restore_default_profile(cid: int, user: User = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    if c.profile:
        s3.delete_profile(c.profile)
    c.profile = None
    db.commit()
    db.refresh(c)
    return character_out(c)
```

- [ ] **Step 4: 运行确认通过**

```bash
cd backend && .venv/bin/python -m pytest tests/test_character_profiles.py -v
```

Expected: 全绿。再跑 `cd backend && .venv/bin/python -m pytest -q` 全量无回归。

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/members.py backend/tests/test_character_profiles.py
git commit -m "[fet] 角色自定义 profile：成员上传/恢复默认端点"
```

---

### Task 3: 前端类型 + CharacterPoster 自定义图支持

**Files:**
- Modify: `frontend/src/types.ts`（Character 加 `profile`）
- Modify: `frontend/src/components/CharacterPoster.vue`（主图优先自定义 + 逐级兜底 + prop 变化重置）
- Modify: `frontend/src/components/CharacterPoster.spec.ts`
- Modify: 其余含 Character 字面量 fixture 的 spec（vue-tsc 引导补 `profile: null`）

- [ ] **Step 1: types.ts 加字段**

`frontend/src/types.ts` 的 `Character` 接口 `combat_power: number | null` 之后加：

```ts
  profile: string | null
```

（必填字段，所有 Character 字面量 fixture 需补 `profile: null`。）

- [ ] **Step 2: 改 CharacterPoster.spec（先写失败断言）**

更新 `frontend/src/components/CharacterPoster.spec.ts`：
- `mkChar` 默认补 `profile: null`
- 新增/改用例：

```ts
it('有自定义 profile 时主图用自定义 URL', () => {
  const w = mount(CharacterPoster, { props: { character: mkChar({ profile: 'https://cdn.example.com/profiles/1/2/x.png' }) } })
  expect(w.find('.cover').attributes('src')).toBe('https://cdn.example.com/profiles/1/2/x.png')
})

it('自定义图加载失败降级默认图，默认再失败降级深底', async () => {
  const w = mount(CharacterPoster, { props: { character: mkChar({ profile: 'https://cdn.example.com/profiles/1/2/x.png' }) } })
  await w.find('.cover').trigger('error')          // 自定义失败 → 默认图
  expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
  await w.find('.cover').trigger('error')          // 默认失败 → 深底+图标
  expect(w.find('.fallback').exists()).toBe(true)
})

it('无自定义 profile 时直接用默认图，失败走深底', async () => {
  const w = mount(CharacterPoster, { props: { character: mkChar({ profile: null }) } })
  expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
  await w.find('.cover').trigger('error')
  expect(w.find('.fallback').exists()).toBe(true)
})

it('profile 变化后重置兜底状态', async () => {
  const w = mount(CharacterPoster, { props: { character: mkChar({ profile: 'https://cdn.example.com/profiles/1/2/x.png' }) } })
  await w.find('.cover').trigger('error')          // 降级到默认图
  expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
  await w.setProps({ character: mkChar({ profile: null }) })  // 恢复默认 → 重置
  expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
})
```

- [ ] **Step 3: 运行确认失败**

```bash
cd frontend && npx vitest run src/components/CharacterPoster.spec.ts
```

Expected: 失败（类型缺 `profile` / 组件仍用固定 `characterProfile` src）。

- [ ] **Step 4: 实现 CharacterPoster**

`frontend/src/components/CharacterPoster.vue` script 段改：

```ts
const customSrc = computed(() => props.character.profile)
const defaultSrc = computed(() => characterProfile(props.character.parent_name, props.character.job_name))
// 兜底层级：0=当前 src（自定义或默认） 1=降级默认图 2=深底+图标
const level = ref(0)
const displaySrc = computed(() => level.value === 1 ? defaultSrc.value : (customSrc.value ?? defaultSrc.value))
function onImgError() {
  if (level.value === 0 && customSrc.value) level.value = 1  // 自定义失败 → 默认图
  else level.value = 2                                        // 默认失败或无自定义 → 深底
}
watch(() => props.character.profile, () => { level.value = 0 })
```

template 主图段改：

```vue
    <div class="poster-img">
      <img v-if="level < 2" :src="displaySrc" class="cover" alt="" @error="onImgError">
      <div v-else class="fallback">
        <img :src="jobIcon(character.job_name)" class="fallback-icon" alt="" @error="onIconError">
      </div>
    </div>
```

（`watch` 从 `vue` 导入。）

- [ ] **Step 5: 修全部 Character fixture + 跑测试**

```bash
cd frontend && npx vitest run src/components/CharacterPoster.spec.ts
cd frontend && npx vue-tsc -b
```

Expected: CharacterPoster.spec 全绿；vue-tsc 报出的缺 `profile` 的 fixture 逐个补 `profile: null`（涉及 MyCharactersView/CharacterForm/MemberCharactersModal/RosterPool/RosterSlot/SlotCell/SlotActionModal/RosterView/RaidListView/RaidDetailView/AdminUsersView/CharacterPickerModal/RosterGrid/stores/raid/lib 各 spec 等，以 vue-tsc 报错为准，机械补字段）。补完重跑 `npx vue-tsc -b` 直到无错。

- [ ] **Step 6: 跑前端全量**

```bash
cd frontend && npx vitest run
```

Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/types.ts frontend/src/components/CharacterPoster.vue frontend/src/components/CharacterPoster.spec.ts
git add -u frontend/src   # 收拢 fixture 修复（或按 vue-tsc 报错逐个 add）
git commit -m "[fet] 角色自定义 profile：海报自定义图支持（逐级兜底 + prop 重置）"
```

---

### Task 4: MyCharactersView 编辑弹窗「角色头像」区

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`
- Test: `frontend/src/views/MyCharactersView.spec.ts`

- [ ] **Step 1: 写失败测试**

**先改 mock**：`frontend/src/views/MyCharactersView.spec.ts` 顶部 `vi.mock('../lib/notify', ...)` 加 `notifySuccess: vi.fn()`（恢复默认路径会调用它，缺了会 `TypeError`）；hoisted 的 `apiMock` 加 `upload: vi.fn()`。

新增用例：

```ts
it('编辑弹窗显示角色头像区，创建弹窗不显示', async () => {
  const char = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 100,
    simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null, profile: null }
  apiMock.get.mockResolvedValueOnce([char])
  const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
  await flushPromises()
  // 创建弹窗：不显示头像区
  await wrapper.find('button').trigger('click')   // 添加角色
  await flushPromises()
  expect(wrapper.find('.profile-preview').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('上传头像')
  // 取消创建 → 点海报进编辑 → 显示头像区
  await wrapper.findAll('button').find(b => b.text() === '取消')!.trigger('click')
  await flushPromises()
  await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
  await flushPromises()
  expect(wrapper.find('.profile-preview').exists()).toBe(true)
  expect(wrapper.text()).toContain('上传头像')
})

it('有自定义 profile 时预览用自定义图', async () => {
  const char = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 100,
    simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null, profile: 'https://cdn.example.com/profiles/1/2/x.png' }
  apiMock.get.mockResolvedValueOnce([char])
  const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
  await flushPromises()
  await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
  await flushPromises()
  expect(wrapper.find('.profile-preview').attributes('src')).toBe('https://cdn.example.com/profiles/1/2/x.png')
})

it('恢复默认按钮调用 api.del', async () => {
  const char = { id: 5, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 100,
    simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null, profile: 'https://cdn.example.com/profiles/1/5/x.png' }
  apiMock.get.mockResolvedValueOnce([char])
  apiMock.del.mockResolvedValueOnce({ ...char, profile: null })
  const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
  await flushPromises()
  await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
  await flushPromises()
  await wrapper.findAll('button').find(b => b.text() === '恢复默认')!.trigger('click')
  await flushPromises()
  expect(apiMock.del).toHaveBeenCalledWith('/api/me/characters/5/profile')
})

it('上传头像调用 api.upload 正确 URL', async () => {
  const char = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 100,
    simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null, profile: null }
  apiMock.get.mockResolvedValueOnce([char])
  apiMock.upload.mockResolvedValueOnce({ ...char, profile: 'https://cdn.example.com/profiles/1/1/u.png' })
  const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
  await flushPromises()
  await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
  await flushPromises()
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.png', { type: 'image/png' })] })
  await input.trigger('change')
  await flushPromises()
  expect(apiMock.upload).toHaveBeenCalledWith('/api/me/characters/1/profile', expect.anything())
})
```

（注：`profile-preview` 选择器、`上传头像`/`恢复默认` 文案与 Step 3 实现保持一致。）

- [ ] **Step 2: 运行确认失败**

```bash
cd frontend && npx vitest run src/views/MyCharactersView.spec.ts
```

Expected: 新用例失败（`.profile-preview` 不存在 / `上传头像` 文案缺失）。

- [ ] **Step 3: 实现视图**

`frontend/src/views/MyCharactersView.vue`：
- import 加 `computed`（已有）、`ref`（已有）、`characterProfile`（`../lib/job`）、`notifySuccess`（`../lib/notify`）
- script 加：

```ts
const profileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const profilePreviewSrc = computed(() =>
  editing.value ? editing.value.profile
      ?? characterProfile(editing.value.parent_name, editing.value.job_name) : '')

async function onProfileFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f || !editing.value) return
  uploading.value = true
  try {
    const updated = await api.upload<Character>(`/api/me/characters/${editing.value.id}/profile`, f)
    editing.value = updated
    await load()
    notifySuccess('头像已更新')
  } catch (err: any) { notifyError(err.message) }
  finally {
    uploading.value = false
    if (profileInput.value) profileInput.value.value = ''
  }
}

async function restoreProfile() {
  if (!editing.value) return
  uploading.value = true
  try {
    const updated = await api.del<Character>(`/api/me/characters/${editing.value.id}/profile`)
    editing.value = updated
    await load()
    notifySuccess('已恢复默认')
  } catch (err: any) { notifyError(err.message) }
  finally { uploading.value = false }
}
```

- template：`DnfDialog` 内 `CharacterForm` 之后加：

```vue
      <div v-if="editing" class="profile-section" style="margin-top:12px;display:flex;align-items:center;gap:10px">
        <img :src="profilePreviewSrc" class="profile-preview"
             style="width:48px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--dnf-edge)">
        <input ref="profileInput" type="file" accept="image/*" style="display:none" @change="onProfileFile">
        <DnfButton class="dnf-btn-sm" :disabled="uploading" @click="profileInput?.click()">
          {{ uploading ? '上传中…' : '上传头像' }}</DnfButton>
        <DnfButton v-if="editing.profile" class="dnf-btn-sm" :disabled="uploading" @click="restoreProfile">
          恢复默认</DnfButton>
      </div>
```

- [ ] **Step 4: 跑视图测试 + 全量**

```bash
cd frontend && npx vitest run src/views/MyCharactersView.spec.ts
cd frontend && npx vitest run
cd frontend && npx vue-tsc -b
```

Expected: 全绿、无类型错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/MyCharactersView.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "[fet] 角色自定义 profile：编辑弹窗头像上传/恢复 UI"
```

---

### Task 5: 全量验证 + CHANGELOG

**Files:** `CHANGELOG.md`

- [ ] **Step 1: 前端构建**

```bash
cd frontend && npm run build
```

Expected: vue-tsc + vite build 通过。

- [ ] **Step 2: 前后端全量测试**

```bash
cd frontend && npx vitest run
cd backend && .venv/bin/python -m pytest -q
```

Expected: 全绿（前端 ~401+ 新用例；后端 361+ 新用例）。

- [ ] **Step 3: CHANGELOG**

`CHANGELOG.md` `[Unreleased]` 的「变更」/「工程」追加角色自定义 profile 条目（参照既有风格，含测试计数）。

- [ ] **Step 4: 提交**

```bash
git add CHANGELOG.md
git commit -m "[docs] CHANGELOG：记录角色自定义 profile"
```

---

## 验证清单（完成标准）

- [ ] `cd backend && .venv/bin/python -m pytest -q` 全绿
- [ ] `cd frontend && npx vitest run` 全绿
- [ ] `cd frontend && npm run build` 通过（vue-tsc）
- [ ] 浏览器「我的角色」：编辑角色弹窗出现「角色头像」区；上传 PNG → 海报显示自定义图；点「恢复默认」→ 海报回到职业默认图；创建弹窗不显示该区
