# 攻坚详情增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强攻坚详情页——管理员帮成员报名、修改时间/名字（WS 实时同步）、占位弹窗与头像只读弹窗标记已占位角色、报名面板左内边距。

**Architecture:** 后端新增 2 个端点（管理员帮报名、查看参与者角色）+ `PUT /{rid}` 补 `raid:updated` 广播；前端抽共享 `CharacterCard`（带占位角标），新增 `MemberCharactersModal`（只读）与 `SignupMemberPicker`（加号选人），`CharacterPickerModal` 加 `placed` prop，占位信息由 `buildPlacementMap` 从 `store.raid.waves` 推导。

**Tech Stack:** FastAPI / SQLAlchemy 2 / SQLite（后端），Vue 3 `<script setup>` / Pinia / naive-ui / Vitest（前端）。

**Spec:** `docs/superpowers/specs/2026-09-23-raid-detail-enhance-design.md`

---

## 仓库约定（重要）

- 提交直接到 main（不做 worktree）。提交信息 `[feat]/[fix]/[docs]` 风格 + 中文描述 + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- 后端测试：`cd backend && .venv/bin/python -m pytest <file> -v`
- 前端测试：`cd frontend && npx vitest run <file>`
- 前端类型/构建检查（vitest 不做类型检查）：`cd frontend && npm run build`（= vue-tsc -b && vite build）

---

## 文件结构

**后端**
- Modify: `backend/app/schemas.py` — 新增 `SignupUserIn`
- Modify: `backend/app/routers/raids.py` — 新增 2 端点、`PUT` 改 async + 广播、补 import
- Modify: `backend/tests/test_raid_signup.py` — 新增用例

**前端**
- Modify: `frontend/src/types.ts` — 新增 `CharacterPlacement`
- Modify: `frontend/src/stores/raid.ts` — `raid:updated` WS 事件
- Create: `frontend/src/lib/placement.ts` + `frontend/src/lib/placement.spec.ts`
- Create: `frontend/src/components/CharacterCard.vue`
- Modify: `frontend/src/components/CharacterPickerModal.vue` + `CharacterPickerModal.spec.ts`
- Create: `frontend/src/components/MemberCharactersModal.vue` + `.spec.ts`
- Create: `frontend/src/components/SignupMemberPicker.vue` + `.spec.ts`
- Modify: `frontend/src/views/RaidDetailView.vue` + `RaidDetailView.spec.ts`
- Modify: `frontend/src/stores/raid.spec.ts`

**文档**
- Modify: `CHANGELOG.md`

---

### Task 1: 后端 — `SignupUserIn` schema + 管理员帮报名端点

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/raids.py`
- Test: `backend/tests/test_raid_signup.py`

- [ ] **Step 1: 写失败的测试**

在 `backend/tests/test_raid_signup.py` 末尾追加：

```python
def test_admin_signup_for_other(client):
    ah = _admin(client)
    h, u = register_user(client, "sig9", "壬")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signups", headers=ah, json={"user_id": u["id"]})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert any(s["user"]["id"] == u["id"] for s in detail["signups"])


def test_admin_signup_other_locked_blocked(client):
    ah = _admin(client)
    h, u = register_user(client, "sig10", "癸")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.post(f"/api/raids/{rid}/signups", headers=ah, json={"user_id": u["id"]})
    assert r.status_code == 400
    assert r.json()["detail"] == "攻坚已锁定，无法报名"


def test_admin_signup_other_duplicate_blocked(client):
    ah = _admin(client)
    h, u = register_user(client, "sig11", "子")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    r = client.post(f"/api/raids/{rid}/signups", headers=ah, json={"user_id": u["id"]})
    assert r.status_code == 400
    assert r.json()["detail"] == "该用户已报名"


def test_admin_signup_creator_blocked(client):
    ah = _admin(client)
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    admin_id = login.json()["user"]["id"]
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signups", headers=ah, json={"user_id": admin_id})
    assert r.status_code == 400
    assert r.json()["detail"] == "团长无需报名"


def test_admin_signup_user_not_found(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signups", headers=ah, json={"user_id": 99999})
    assert r.status_code == 404
    assert r.json()["detail"] == "用户不存在"


def test_admin_signup_requires_admin(client):
    h1, u1 = register_user(client, "sig12a", "丑")
    h2, u2 = register_user(client, "sig12b", "寅")
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signups", headers=h1, json={"user_id": u2["id"]})
    assert r.status_code == 403
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -k admin_signup -v`
Expected: FAIL（`POST /api/raids/{rid}/signups` 404/405）

- [ ] **Step 3: 实现 schema 与端点**

`backend/app/schemas.py`，在 `RaidSignupOut` 之后新增：

```python
class SignupUserIn(BaseModel):
    user_id: int
```

`backend/app/routers/raids.py`：
- schemas import 追加 `SignupUserIn`。
- 在文件末尾（`cancel_other` 之后）新增端点：

```python
@router.post("/{rid}/signups")
async def admin_signup(rid: int, body: SignupUserIn, admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if raid.locked:
        raise HTTPException(400, "攻坚已锁定，无法报名")
    target = db.get(User, body.user_id)
    if target is None:
        raise HTTPException(404, "用户不存在")
    if target.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == target.id).first():
        raise HTTPException(400, "该用户已报名")
    rs = RaidSignup(raid_id=rid, user_id=target.id)
    db.add(rs)
    try:
        db.commit()
    except IntegrityError:  # 并发重复报名兜底
        db.rollback()
        raise HTTPException(400, "该用户已报名")
    db.refresh(rs)
    # 广播的是「目标用户」而非管理员
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(target).model_dump(),
                                  "created_at": rs.created_at.isoformat()})
    return {"ok": True}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -k admin_signup -v`
Expected: PASS（6 个用例全过）

- [ ] **Step 5: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/raids.py backend/tests/test_raid_signup.py
git commit -m "$(cat <<'EOF'
feat: 管理员帮成员报名端点 POST /raids/{rid}/signups

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 后端 — 查看参与者角色端点

**Files:**
- Modify: `backend/app/routers/raids.py`
- Test: `backend/tests/test_raid_signup.py`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_raid_signup.py` 末尾追加：

```python
def test_member_characters_participant(client):
    ah = _admin(client)
    h, u = register_user(client, "mch1", "甲")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/signup", headers=h)
    r = client.get(f"/api/raids/{rid}/signups/{u['id']}/characters", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["id"] == u["id"]
    assert [c["id"] for c in body["characters"]] == [cid]


def test_member_characters_creator_visible(client):
    ah = _admin(client)
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    admin_id = login.json()["user"]["id"]
    cid = _mkchar(client, ah, "团长C")
    rid = make_raid(client, ah)["id"]
    r = client.get(f"/api/raids/{rid}/signups/{admin_id}/characters", headers=ah)
    assert r.status_code == 200
    assert [c["id"] for c in r.json()["characters"]] == [cid]


def test_member_characters_non_participant_404(client):
    ah = _admin(client)
    h, u = register_user(client, "mch2", "乙")
    _mkchar(client, h)
    h3, _ = register_user(client, "mch3", "丙")
    rid = make_raid(client, ah)["id"]
    # 乙未报名 → 查询 404
    r = client.get(f"/api/raids/{rid}/signups/{u['id']}/characters", headers=h3)
    assert r.status_code == 404
    assert r.json()["detail"] == "该用户未参与本场攻坚"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -k member_characters -v`
Expected: FAIL

- [ ] **Step 3: 实现端点**

`backend/app/routers/raids.py`：
- import 调整：`from sqlalchemy import func` → `from sqlalchemy import func, select`；`from ..schemas import (...)` 追加 `PlayerCharacters`；新增 `from ..routers.members import _character_out`（`members.py` 不 import raids，无循环依赖）。
- 在 `admin_signup` 之后新增：

```python
@router.get("/{rid}/signups/{user_id}/characters", response_model=PlayerCharacters)
def get_member_characters(rid: int, user_id: int, user: User = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if not _participates(db, raid, user_id):
        raise HTTPException(404, "该用户未参与本场攻坚")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "用户不存在")
    chars = db.scalars(select(Character).where(Character.user_id == user_id)
                       .order_by(Character.id)).all()
    return PlayerCharacters(user=UserOut.model_validate(target),
                            characters=[_character_out(c) for c in chars])
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -k member_characters -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/raids.py backend/tests/test_raid_signup.py
git commit -m "$(cat <<'EOF'
feat: 查看攻坚参与者角色端点 GET /raids/{rid}/signups/{uid}/characters

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 后端 — `PUT /{rid}` 改 async + `raid:updated` 广播

**Files:**
- Modify: `backend/app/routers/raids.py`
- Test: `backend/tests/test_raid_signup.py`

- [ ] **Step 1: 写失败的测试（mock broadcast，快速失败）**

> 红阶段不用 WS 集成测试——当前 PUT 不广播时 `ws.receive_json()` 会挂死（仓库已知陷阱）。改用 monkeypatch `manager.broadcast` 断言，绿阶段再补 WS 集成测试。

`backend/tests/test_raid_signup.py` 顶部 import 追加：

```python
from unittest.mock import AsyncMock

import app.routers.raids as raids_mod
```

末尾追加：

```python
def test_update_raid_broadcasts_raid_updated(client, monkeypatch):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    called = AsyncMock()
    monkeypatch.setattr(raids_mod.manager, "broadcast", called)
    r = client.put(f"/api/raids/{rid}", headers=ah,
                   json={"name": "改后", "starts_at": "2026-09-21T20:00:00"})
    assert r.status_code == 200
    assert r.json()["name"] == "改后"
    called.assert_awaited_once()
    payload = called.await_args.args[1]  # broadcast(rid, payload)
    assert payload["type"] == "raid:updated"
    assert payload["name"] == "改后"
    assert payload["starts_at"] == "2026-09-21T20:00:00"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -k update_raid -v`
Expected: FAIL——`AssertionError: Expected 'broadcast' to have been awaited once.`（当前 PUT 不广播）

- [ ] **Step 3: 实现**

`backend/app/routers/raids.py`，将 `update_raid` 改为 `async def` 并在 commit 后广播：

```python
@router.put("/{rid}")
async def update_raid(rid: int, body: RaidUpdate, admin: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if body.name is not None:
        raid.name = body.name
    if body.starts_at is not None:
        raid.starts_at = body.starts_at
    db.commit()
    await manager.broadcast(rid, {"type": "raid:updated",
                                  "name": raid.name,
                                  "starts_at": raid.starts_at.isoformat()})
    return _detail(db, raid)
```

- [ ] **Step 4: 运行确认通过（mock 测试）**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -k update_raid -v`
Expected: PASS

- [ ] **Step 5: 补 WS 集成测试并验证**

`backend/tests/test_raid_signup.py` 末尾追加（绿阶段验证真实广播链路）：

```python
def test_update_raid_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        r = client.put(f"/api/raids/{rid}", headers=ah,
                       json={"name": "改后", "starts_at": "2026-09-21T20:00:00"})
        assert r.status_code == 200
        ev = ws.receive_json()
        assert ev["type"] == "raid:updated"
        assert ev["name"] == "改后"
        assert ev["starts_at"] == "2026-09-21T20:00:00"
```

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_signup.py -v`
Expected: 全部 PASS（含既有用例，确认无回归）

- [ ] **Step 6: 提交**

```bash
git add backend/app/routers/raids.py backend/tests/test_raid_signup.py
git commit -m "$(cat <<'EOF'
feat: 修改攻坚 PUT 补 raid:updated WS 广播

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 前端 — 类型 + store `raid:updated` + `buildPlacementMap`

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/stores/raid.ts`
- Create: `frontend/src/lib/placement.ts`
- Test: `frontend/src/lib/placement.spec.ts`、`frontend/src/stores/raid.spec.ts`

- [ ] **Step 1: 写失败的测试**

`frontend/src/lib/placement.spec.ts`（新建）：

```ts
import { describe, it, expect } from 'vitest'
import { buildPlacementMap } from './placement'
import type { CharacterPlacement, Raid, Slot } from '../types'

function slot(id: number, characterId: number | null, squad: number, duty: string | null): Slot {
  return { id, squad_index: squad, row_index: 0, character_id: characterId,
    character_name: characterId ? 'x' : null, character_class: characterId ? '输出' : null,
    job_name: characterId ? 'weapon_master' : null, job_title: null, fame: null,
    simulated_damage: null, sustained_dps: null, buff_amount: null,
    owner_id: characterId, owner_nickname: null, owner_avatar: null,
    duty: duty as any, version: 0 }
}

function makeRaid(waves: Raid['waves']): Raid {
  return { id: 1, name: 'x', dungeon_id: 1, dungeon_name: '副本', starts_at: 'x',
    size: 12, locked: false, signups: [], waves }
}

describe('buildPlacementMap', () => {
  it('maps placed characters across waves/squads', () => {
    const raid = makeRaid([
      { id: 1, index: 1, slots: [slot(1, 11, 0, '主C'), slot(2, 12, 1, '主奶'), slot(3, null, 0, null)] },
      { id: 2, index: 2, slots: [slot(4, 13, 2, '划水')] },
    ])
    const map = buildPlacementMap(raid)
    expect(map[11]).toEqual({ wave_index: 1, squad_index: 0, duty: '主C' })
    expect(map[12]).toEqual({ wave_index: 1, squad_index: 1, duty: '主奶' })
    expect(map[13]).toEqual({ wave_index: 2, squad_index: 2, duty: '划水' })
    expect(map[99]).toBeUndefined()
  })

  it('returns empty map for empty raid', () => {
    expect(buildPlacementMap(makeRaid([]))).toEqual({})
  })
})
```

`frontend/src/stores/raid.spec.ts`，在 `applies raid:signup and raid:signup_removed` 用例后追加：

```ts
it('applies raid:updated', () => {
  setActivePinia(createPinia())
  const store = useRaidStore()
  store.raid = makeRaid()
  applyEvent(store, { type: 'raid:updated', name: '新名', starts_at: '2026-09-25T09:00:00' })
  expect(store.raid!.name).toBe('新名')
  expect(store.raid!.starts_at).toBe('2026-09-25T09:00:00')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/placement.spec.ts src/stores/raid.spec.ts`
Expected: placement.spec FAIL（`buildPlacementMap` 未定义）；raid.spec 中 `raid:updated` 用例 FAIL（当前 `applyEvent` 无该分支，事件被忽略）

- [ ] **Step 3: 实现**

`frontend/src/types.ts`，`Slot` 之后新增：

```ts
export interface CharacterPlacement { wave_index: number; squad_index: number; duty: Duty }
```

`frontend/src/stores/raid.ts`：
- `WsEvent` 联合追加：`| { type: 'raid:updated'; name: string; starts_at: string }`
- `applyEvent` 的 switch 加分支：

```ts
case 'raid:updated':
  raid.name = ev.name
  raid.starts_at = ev.starts_at
  break
```

`frontend/src/lib/placement.ts`（新建）：

```ts
import type { CharacterPlacement, Raid } from '../types'

export function buildPlacementMap(raid: Raid): Record<number, CharacterPlacement> {
  const map: Record<number, CharacterPlacement> = {}
  for (const w of raid.waves) {
    for (const s of w.slots) {
      if (s.character_id == null) continue
      map[s.character_id] = {
        wave_index: w.index,
        squad_index: s.squad_index,
        duty: s.duty ?? '主C', // 已占位格 duty 必有值；类型为 Duty | null，兜底避免 vue-tsc 报错
      }
    }
  }
  return map
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/placement.spec.ts src/stores/raid.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/types.ts frontend/src/stores/raid.ts frontend/src/lib/placement.ts \
        frontend/src/lib/placement.spec.ts frontend/src/stores/raid.spec.ts
git commit -m "$(cat <<'EOF'
feat: 占位映射 buildPlacementMap + raid:updated WS 事件

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 前端 — `CharacterCard` 共享组件 + `CharacterPickerModal` 占位角标

**Files:**
- Create: `frontend/src/components/CharacterCard.vue`
- Modify: `frontend/src/components/CharacterPickerModal.vue`
- Test: `frontend/src/components/CharacterPickerModal.spec.ts`

- [ ] **Step 1: 写失败的测试**

`frontend/src/components/CharacterPickerModal.spec.ts` 末尾追加用例（沿用既有 mock：`playerA`/`mine`、`apiMock.get`）：

```ts
describe('CharacterPickerModal placed badge', () => {
  it('渲染已占位角色的角标', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9],
               placed: { 12: { wave_index: 2, squad_index: 1, duty: '主奶' } } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    // 默认选中管理员自己，角色「奶」id=12 已占位 → 有角标
    expect(wrapper.text()).toContain('已占位 · 第2波 · 黄队')
  })

  it('未占位角色无角标', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9], placed: {} },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('已占位')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/CharacterPickerModal.spec.ts`
Expected: 新用例 FAIL（当前无角标渲染）；既有 3 个用例 PASS（不改坏）

- [ ] **Step 3: 实现**

`frontend/src/components/CharacterCard.vue`（新建）：

```vue
<script setup lang="ts">
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import { SQUAD_NAMES } from '../lib/colors'
import type { Character, CharacterPlacement } from '../types'

defineProps<{ character: Character; placement: CharacterPlacement | null; active?: boolean }>()
const emit = defineEmits<{ (e: 'click', c: Character): void }>()

function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <div class="char-pick" :class="{ active }" @click="emit('click', character)">
    <img :src="jobIcon(character.job_name)" @error="onIconError"
         style="width:28px;height:28px;margin-right:8px">
    <div style="flex:1">
      <b>{{ character.name }}</b>
      <span style="color:var(--dnf-text-muted);font-size:12px">
        {{ character.job_title }} · {{ character.class_type }} · 名望 {{ character.fame }}
      </span>
      <div style="color:var(--dnf-text-faint);font-size:12px">
        {{ character.class_type === '输出'
          ? `模拟 ${fmtDps(character.simulated_damage)} · 秒伤 ${fmtDps(character.sustained_dps)}`
          : `增益 ${fmtBuff(character.buff_amount)}` }}
      </div>
    </div>
    <span v-if="placement" class="placed-badge">
      已占位 · 第{{ placement.wave_index }}波 · {{ SQUAD_NAMES[placement.squad_index] ?? `队${placement.squad_index + 1}` }}
    </span>
  </div>
</template>

<style scoped>
.placed-badge {
  flex-shrink: 0; align-self: flex-start;
  background: var(--dnf-gold); color: #1a1205;
  border-radius: 4px; padding: 2px 6px;
  font-size: 11px; font-weight: bold;
}
</style>
```

`frontend/src/components/CharacterPickerModal.vue`：
- import `CharacterCard` 与 `CharacterPlacement` 类型。
- **移除**已不再使用的 `import { jobIcon, handleIconError as onIconError } from '../lib/job'`（卡片渲染迁入 CharacterCard）。
- props 改为 `withDefaults` 并加 `placed`：

```ts
const props = withDefaults(defineProps<{
  open: boolean; adminMode?: boolean; signupUserIds?: number[]
  placed?: Record<number, CharacterPlacement>
}>(), { placed: () => ({}) })
```

- 删除组件内 `fmtDps`/`fmtBuff`（已移入 CharacterCard）。
- 卡片渲染（原 `v-for` 卡片块）替换为：

```vue
<CharacterCard v-for="c in characters" :key="c.id" :character="c"
               :placement="placed[c.id] ?? null" :active="selected?.id === c.id"
               @click="choose(c)" />
```

模板中 `placed` 直接可用（props 在 `<script setup>` 模板暴露）；`selected` 仍在组件内，`:active` 判定不变。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/CharacterPickerModal.spec.ts`
Expected: 全部 PASS（5 个）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/CharacterCard.vue frontend/src/components/CharacterPickerModal.vue \
        frontend/src/components/CharacterPickerModal.spec.ts
git commit -m "$(cat <<'EOF'
feat: CharacterCard 共享卡片（占位角标）+ 占位弹窗标记已占位角色

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 前端 — `MemberCharactersModal` 只读弹窗

**Files:**
- Create: `frontend/src/components/MemberCharactersModal.vue`
- Test: `frontend/src/components/MemberCharactersModal.spec.ts`

- [ ] **Step 1: 写失败的测试**

`frontend/src/components/MemberCharactersModal.spec.ts`（新建）：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MemberCharactersModal from './MemberCharactersModal.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

beforeEach(() => vi.clearAllMocks())

const user = { id: 3, username: 'm', nickname: '队员', is_admin: false, avatar: null }
const characters = [{ id: 11, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: 'swordman_male', class_type: '输出', fame: 52000,
  simulated_damage: 5, sustained_dps: 2, buff_amount: null }]

describe('MemberCharactersModal', () => {
  it('拉取该用户角色并标记占位', async () => {
    apiMock.get.mockResolvedValue({ user, characters })
    const wrapper = mount(MemberCharactersModal, {
      props: { open: true, rid: 1, user,
               placed: { 11: { wave_index: 1, squad_index: 0, duty: '主C' } } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/raids/1/signups/3/characters')
    expect(wrapper.text()).toContain('剑魂')
    expect(wrapper.text()).toContain('已占位 · 第1波 · 红队')
  })

  it('关闭时不拉取', async () => {
    const wrapper = mount(MemberCharactersModal, {
      props: { open: false, rid: 1, user, placed: {} },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(apiMock.get).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/MemberCharactersModal.spec.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

`frontend/src/components/MemberCharactersModal.vue`（新建）：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import CharacterCard from './CharacterCard.vue'
import type { Character, CharacterPlacement, PlayerCharacters, User } from '../types'

const props = defineProps<{
  open: boolean; rid: number; user: User | null
  placed: Record<number, CharacterPlacement>
}>()
const emit = defineEmits<{ (e: 'close'): void }>()
const characters = ref<Character[]>([])

watch(() => props.open, async (open) => {
  if (!open || !props.user) return
  characters.value = []
  try {
    const res = await api.get<PlayerCharacters>(
      `/api/raids/${props.rid}/signups/${props.user.id}/characters`)
    characters.value = res.characters
  } catch { /* 只读查看失败静默，可关闭重试 */ }
}, { immediate: true }) // immediate：测试挂载 open:true 即触发 fetch（与 CharacterPickerModal 一致）
</script>

<template>
  <n-modal :show="open" preset="card"
           :title="user ? `${user.nickname} 的角色` : ''"
           style="width:min(420px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="!characters.length" style="color:var(--dnf-text-faint)">还没有角色</p>
      <CharacterCard v-for="c in characters" :key="c.id" :character="c"
                     :placement="placed[c.id] ?? null" />
    </div>
  </n-modal>
</template>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/MemberCharactersModal.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/MemberCharactersModal.vue frontend/src/components/MemberCharactersModal.spec.ts
git commit -m "$(cat <<'EOF'
feat: 头像只读弹窗 MemberCharactersModal（带占位标识）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 前端 — `SignupMemberPicker` 加号选人弹窗

**Files:**
- Create: `frontend/src/components/SignupMemberPicker.vue`
- Test: `frontend/src/components/SignupMemberPicker.spec.ts`

- [ ] **Step 1: 写失败的测试**

`frontend/src/components/SignupMemberPicker.spec.ts`（新建）：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SignupMemberPicker from './SignupMemberPicker.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn() },
  notifyMock: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true),
  notifyError: notifyMock.error,
  notifySuccess: notifyMock.success,
}))

beforeEach(() => vi.clearAllMocks())

const users = [
  { id: 1, username: 'a', nickname: '甲', is_admin: false, avatar: null },
  { id: 2, username: 'b', nickname: '乙', is_admin: false, avatar: null },
  { id: 3, username: 'c', nickname: '丙', is_admin: false, avatar: null },
]

describe('SignupMemberPicker', () => {
  it('过滤团长与已报名者，点击帮报名', async () => {
    apiMock.get.mockResolvedValue(users)
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
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/signups', { user_id: 2 })
  })

  it('全部已报名时显示空态', async () => {
    apiMock.get.mockResolvedValue(users)
    const wrapper = mount(SignupMemberPicker, {
      props: { open: true, rid: 1, excludeUserIds: [1, 2, 3] },
      global: { stubs: { teleport: true, UserAvatar: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('所有人都已报名')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/SignupMemberPicker.spec.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

`frontend/src/components/SignupMemberPicker.vue`（新建）：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import UserAvatar from './UserAvatar.vue'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
import type { User } from '../types'

const props = defineProps<{ open: boolean; rid: number; excludeUserIds: number[] }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'signedUp'): void }>()
const users = ref<User[]>([])
const busy = ref(false)

const candidates = computed(() =>
  users.value.filter(u => !props.excludeUserIds.includes(u.id)))

watch(() => props.open, async (open) => {
  if (!open) return
  busy.value = false
  users.value = await api.get<User[]>('/api/admin/users')
}, { immediate: true }) // immediate：测试挂载 open:true 即触发 fetch（与 CharacterPickerModal 一致）

async function onPick(u: User) {
  const ok = await confirmDialog({ content: `确认帮「${u.nickname}」报名？` })
  if (!ok) return
  busy.value = true
  try {
    await api.post(`/api/raids/${props.rid}/signups`, { user_id: u.id })
    notifySuccess('报名成功')
    emit('signedUp')
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { busy.value = false }
}
</script>

<template>
  <n-modal :show="open" preset="card" title="帮成员报名" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="!candidates.length" style="color:var(--dnf-text-faint)">所有人都已报名</p>
      <div v-for="u in candidates" :key="u.id" class="member-row" @click="onPick(u)">
        <UserAvatar :nickname="u.nickname" :avatar="u.avatar" :size="24" />
        <span>{{ u.nickname }}</span>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.member-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; margin: 6px 0;
  border: 1px solid var(--dnf-border); border-radius: 4px;
  cursor: pointer;
}
.member-row:hover { border-color: var(--dnf-gold); }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/SignupMemberPicker.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/SignupMemberPicker.vue frontend/src/components/SignupMemberPicker.spec.ts
git commit -m "$(cat <<'EOF'
feat: 加号帮成员报名弹窗 SignupMemberPicker

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 前端 — `RaidDetailView` 集成（加号/头像可点/修改弹窗/面板内边距）

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`
- Test: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: 写失败的测试**

`frontend/src/views/RaidDetailView.spec.ts`：
- `mountView` 的 stub 列表追加 `'MemberCharactersModal'`、`'SignupMemberPicker'`（避免闭态 NModal 真实渲染干扰）。
- 追加用例：

```ts
describe('RaidDetailView enhance', () => {
  it('管理员可见加号与修改按钮', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="signup-plus"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="edit-raid"]').exists()).toBe(true)
  })

  it('普通用户不可见加号与修改按钮', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = member
    const store = useRaidStore()
    store.raid = makeRaid([adminRow, memberRow])
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids/1') return makeRaid([adminRow, memberRow])
      return []
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/raids/:id', component: RaidDetailView }],
    })
    await router.push('/raids/1')
    await router.isReady()
    const wrapper = mount(RaidDetailView, {
      global: {
        plugins: [pinia, router],
        stubs: ['router-link', 'router-view', 'WaveSection', 'CharacterPickerModal', 'SlotActionModal', 'UserAvatar', 'MemberCharactersModal', 'SignupMemberPicker'],
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-test="signup-plus"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="edit-raid"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: 新用例 FAIL（无 `data-test="signup-plus"` / `data-test="edit-raid"`）；既有 1 个用例 PASS

- [ ] **Step 3: 实现**

`frontend/src/views/RaidDetailView.vue`：

脚本区：
- import 追加：`import { buildPlacementMap } from '../lib/placement'`、`import MemberCharactersModal from '../components/MemberCharactersModal.vue'`、`import SignupMemberPicker from '../components/SignupMemberPicker.vue'`、`import { NDatePicker, NInput } from 'naive-ui'`。
- 类型 import 追加 `User`、`CharacterPlacement`。
- 新增状态：

```ts
const placed = computed<Record<number, CharacterPlacement>>(() =>
  store.raid ? buildPlacementMap(store.raid) : {})
const showMemberPicker = ref(false)
const memberModalUser = ref<User | null>(null)
const showEditRaid = ref(false)
const editName = ref('')
const editStartsAt = ref<string | null>(null)
```

- 新增函数：

```ts
function openEditRaid() {
  if (!store.raid) return
  editName.value = store.raid.name
  editStartsAt.value = store.raid.starts_at
  showEditRaid.value = true
}
async function onSaveRaid() {
  if (!store.raid) return
  try {
    await api.put(`/api/raids/${store.raid.id}`, {
      name: editName.value || undefined,
      starts_at: editStartsAt.value ?? undefined,
    })
    showEditRaid.value = false
    await load()
  } catch (e: any) { notifyError(e.message) }
}
```

模板区：
1. **头部操作区**（`margin-left:auto` 的 span 内）加「修改」按钮：

```vue
<button v-if="auth.isAdmin" class="dnf-btn dnf-btn-sm" data-test="edit-raid" @click="openEditRaid">修改</button>
```

2. **报名面板**：`<div class="dnf-panel" style="margin:10px 0">` → `style="margin:10px 0;padding:12px"`（第 5 点）。

3. **面板头部行**加号按钮：

```vue
<button v-if="auth.isAdmin && !store.raid.locked" class="dnf-btn dnf-btn-sm"
        data-test="signup-plus" style="margin-left:auto" @click="showMemberPicker = true">＋</button>
```

4. **报名行头像可点**（把 `UserAvatar` 包一层 button）：

```vue
<div v-for="s in store.raid.signups" :key="s.user.id"
     style="display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--dnf-border);border-radius:4px">
  <button class="avatar-btn" @click="memberModalUser = s.user">
    <UserAvatar :nickname="s.user.nickname" :avatar="s.user.avatar" :size="24" />
  </button>
  <span>{{ s.user.nickname }}</span>
  ...
```

5. **既有占位弹窗**（第 179-181 行的 `<CharacterPickerModal>`）补 `:placed="placed"`，让占位弹窗标记已占位角色（第 3 点必需）：

```vue
<CharacterPickerModal :open="pickSlot != null" :admin-mode="auth.isAdmin"
                      :signup-user-ids="signupUserIds" :placed="placed"
                      @close="pickSlot = null" @select="onSelectCharacter" />
```

6. **文件末尾**（`CharacterPickerModal` 之后）追加三个弹窗：

```vue
<n-modal :show="showEditRaid" preset="card" title="修改攻坚" style="width:min(360px,92vw)"
         @update:show="(s: boolean) => { if (!s) showEditRaid = false }">
  <div style="display:flex;flex-direction:column;gap:12px">
    <div>
      <div style="margin-bottom:4px">名称</div>
      <n-input v-model:value="editName" data-test="edit-name" />
    </div>
    <div>
      <div style="margin-bottom:4px">时间</div>
      <n-date-picker v-model:value="editStartsAt" type="datetime"
                     value-format="yyyy-MM-dd'T'HH:mm:ss" style="width:100%" />
    </div>
  </div>
  <template #footer>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="dnf-btn" @click="showEditRaid = false">取消</button>
      <button class="dnf-btn dnf-btn-primary" @click="onSaveRaid">保存</button>
    </div>
  </template>
</n-modal>

<MemberCharactersModal :open="memberModalUser != null" :rid="rid" :user="memberModalUser"
                       :placed="placed" @close="memberModalUser = null" />

<SignupMemberPicker :open="showMemberPicker" :rid="rid" :exclude-user-ids="signupUserIds"
                    @close="showMemberPicker = false" @signedUp="load" />
```

6. **`<style scoped>`**（`</template>` 后新增）：

```vue
<style scoped>
.avatar-btn {
  display: inline-flex; padding: 0; margin: 0;
  background: none; border: none; cursor: pointer;
}
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: 全部 PASS（3 个）

- [ ] **Step 5: 全量前端测试 + 类型/构建**

Run: `cd frontend && npx vitest run`
Expected: PASS

Run: `cd frontend && npm run build`
Expected: `vue-tsc -b && vite build` 无类型错误、构建成功

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/RaidDetailView.vue frontend/src/views/RaidDetailView.spec.ts
git commit -m "$(cat <<'EOF'
feat: 详情页加号帮报名/头像只读弹窗/修改时间名字 + 面板内边距

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 文档 — CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新 CHANGELOG**

`CHANGELOG.md` 的 `## [Unreleased]` 下追加（参照既有风格）：

```markdown
## [Unreleased]

### 新增

- **攻坚详情增强**：管理员可帮成员报名（报名列表加号，锁定后不可）；攻坚名称/时间可修改并 WS 实时同步；占位弹窗与成员头像只读弹窗标记「已占位 · 第N波 · 某队」；报名面板内边距加大
```

- [ ] **Step 2: 提交**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: CHANGELOG 攻坚详情增强

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## 收尾验证

完成后在仓库根目录跑：

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx vitest run && npm run build
```

全部通过即完成。
