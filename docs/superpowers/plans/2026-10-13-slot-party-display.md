# 详情页点击占位显示冒险团 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 攻坚详情页点击已占格弹出的「角色操作」弹窗（SlotActionModal）中展示该角色所属冒险团名称，便于管理员在详情页直接排表时识别角色所在账号。

**Architecture:** 后端在唯一 Slot 序列化点 `_slot_out()`（raids.py）补 `adventure_party_id/adventure_party_name`（取 `slot.character.adventure_party` lazy，None 防护），`SlotOut` 加两字段带默认值 → 详情页波网格/fill 响应/WS 广播全路径自动携带。前端 `Slot` 类型加两必填字段（连带修手写 fixture），`SlotActionModal.vue` 加一行「冒险团：xxx」（null 不显示）。

**Tech Stack:** FastAPI + SQLAlchemy 2（backend）；Vue 3 `<script setup>` + Vitest + vue-tsc（frontend）。

**前置约定（务必遵守）**
- 提交直接到 main，不做 worktree。提交信息 `[feat]/[fix]/[test]/[ref]` + 中文，`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- 测试命令：后端 `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest <file> -v`；前端 `cd /Users/able/toys/dnfer/frontend && npx vitest run <file>`；前端构建 `cd /Users/able/toys/dnfer/frontend && npm run build`。
- 规范文档：`docs/superpowers/specs/2026-10-13-slot-party-display-design.md`（歧义时回看 spec）。

---

### Task 1: 后端 SlotOut 补团字段 + `_slot_out` 填充 + 测试

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/raids.py`
- Test: `backend/tests/test_raids.py`

- [ ] **Step 1: 写失败测试**（追加到 `test_raids.py`）

```python
def test_fill_slot_serializes_adventure_party(client):
    ah = _admin(client)
    h, user = register_user(client, "p30", "阿伟")
    parties = client.get("/api/me/adventure-parties", headers=h).json()
    assert parties[0]["name"] == "阿伟的冒险团"  # 注册即建默认团
    pid = parties[0]["id"]
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 20000}).json()["id"]
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    slots = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
    # 空格：两字段 null
    assert slots[0]["adventure_party_id"] is None
    assert slots[0]["adventure_party_name"] is None
    # 填格后 slot 带团
    r = client.post(f"/api/raids/{rid}/slots/{slots[0]['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 200
    assert r.json()["slot"]["adventure_party_id"] == pid
    assert r.json()["slot"]["adventure_party_name"] == "阿伟的冒险团"
    # 详情页波网格 slot 带团
    filled = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    assert filled["adventure_party_id"] == pid
    assert filled["adventure_party_name"] == "阿伟的冒险团"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raids.py::test_fill_slot_serializes_adventure_party -v`
Expected: FAIL（`adventure_party_id` KeyError / None）。

- [ ] **Step 3: schemas.py `SlotOut` 加字段**（带默认值防中间态 500）

```python
    duty: str | None
    version: int
    adventure_party_id: int | None = None
    adventure_party_name: str | None = None
```

- [ ] **Step 4: raids.py `_slot_out` 填充**（当前函数开头 `c = slot.character`、`meta = job_data.job_meta(...) if c else None`）

在函数体加：
```python
    party = c.adventure_party if c else None
```
在 `SlotOut(...)` 构造尾部、现有 `version=slot.version` 之后、**闭合 `)` 之前**插入两行（现有 `version` 行尾带逗号，直接追加即可；`adventure_party_name` 行尾改成闭合 `)`）：
```python
        adventure_party_id=c.adventure_party_id if c else None,
        adventure_party_name=party.name if party else None)
```
（绑定 `party` 一次，同 `character_out` 风格；空格 `c is None` → 两字段 None。）

- [ ] **Step 5: 运行确认通过 + 回归**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_raids.py -v`
Expected: 全 PASS（含新用例）。

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas.py backend/app/routers/raids.py backend/tests/test_raids.py
git commit -m "[feat] Slot 序列化携带冒险团字段（详情页占位可见）"
```

---

### Task 2: 前端 `Slot` 类型加字段 + 全部手写 fixture 补字段

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: 所有因 `Slot` 新增必填字段而编译失败的 spec/组件 fixture（vue-tsc 为准）

- [ ] **Step 1: types.ts `Slot` 加两必填字段**（`duty`/`version` 之后）

```ts
  duty: Duty | null; version: number;
  adventure_party_id: number | null; adventure_party_name: string | null }
```

- [ ] **Step 2: 运行构建暴露失败点**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: vue-tsc 报多个文件手写 `Slot` 字面量缺字段。已知候选（含但不限于）：`src/views/RaidDetailView.spec.ts`、`src/components/SlotCell.spec.ts`、`src/components/RosterSlot.spec.ts`、`src/components/RosterGrid.spec.ts`、`src/views/RosterView.spec.ts`、`src/stores/raid.spec.ts`、`src/composables/useSlotMove.spec.ts`、`src/lib/damage.spec.ts`、`src/lib/roster.spec.ts`、`src/lib/placement.spec.ts`。

- [ ] **Step 3: 逐个补齐两字段**

对每个手写 `Slot` 字面量加 `adventure_party_id: <id 或 null>, adventure_party_name: '<名' 或 null>`。一般已占格用非 null（配合 owner 昵称语境，如 `阿伟的冒险团`），空格/中性场景用 null。`Slot` 类型构造多出现在 `mkSlot`/helper 里——在 helper 里补默认值即可一处生效。以 vue-tsc 报错为准，勿过度设计。

- [ ] **Step 4: 重新构建通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 构建 PASS。

- [ ] **Step 5: 跑现有前端测试确认无回归**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run`
Expected: 全 PASS（此步只加字段不改逻辑）。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "[ref] Slot 类型补冒险团字段并修全部 fixture"
```
（`git add -A` 前检查不含无关文件；`docs/usage/` 不要 stage。）

---

### Task 3: SlotActionModal 显示冒险团 + 独立 spec

**Files:**
- Modify: `frontend/src/components/SlotActionModal.vue`
- Create: `frontend/src/components/SlotActionModal.spec.ts`

- [ ] **Step 1: 写失败测试**（新建 `SlotActionModal.spec.ts`，naive NModal 测试参照 `AdminUserCharactersModal.spec.ts`——`global: { stubs: { teleport: true } }`）

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlotActionModal from './SlotActionModal.vue'
import type { Slot } from '../types'

function mkSlot(over: Partial<Slot> = {}): Slot {
  return {
    id: 1, squad_index: 0, row_index: 0, character_id: 5, character_name: '剑魂',
    character_class: '输出' as const, job_name: 'weapon_master', job_title: '极诣·剑魂',
    fame: 1, simulated_damage: 1, sustained_dps: null, buff_amount: null, sun_buff: null,
    owner_id: 2, owner_nickname: '阿伟', owner_avatar: null, duty: '主C' as const, version: 0,
    adventure_party_id: 1, adventure_party_name: '阿伟的冒险团',
    ...over,
  }
}

describe('SlotActionModal', () => {
  it('已占格显示冒险团', () => {
    const w = mount(SlotActionModal, { props: { open: true, slot: mkSlot() },
      global: { stubs: { teleport: true } } })
    expect(w.text()).toContain('冒险团：阿伟的冒险团')
  })
  it('无团时不显示冒险团行', () => {
    const w = mount(SlotActionModal, { props: { open: true,
      slot: mkSlot({ adventure_party_id: null, adventure_party_name: null }) },
      global: { stubs: { teleport: true } } })
    expect(w.text()).not.toContain('冒险团')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/SlotActionModal.spec.ts`
Expected: 新增用例 FAIL（无「冒险团」文本）。

- [ ] **Step 3: 实现 `SlotActionModal.vue`**（现有信息行 `{{ slot.owner_nickname }}（{{ slot.character_name }} · {{ slot.duty }}）` 所在 div 内追加）

```html
    <div v-if="slot" style="margin-bottom:12px;color:var(--dnf-text-muted)">
      <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
      （{{ slot.character_name }} · {{ slot.duty }}）
      <p v-if="slot.adventure_party_name" style="margin-top:4px;color:var(--dnf-text-faint);font-size:12px">
        冒险团：{{ slot.adventure_party_name }}
      </p>
    </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/SlotActionModal.spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SlotActionModal.vue frontend/src/components/SlotActionModal.spec.ts
git commit -m "[feat] 占位操作弹窗显示冒险团"
```

---

### Task 4: 全量构建 + 测试回归

**Files:**（无新增）

- [ ] **Step 1: 前端全量构建 + 测试**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build` 与 `cd /Users/able/toys/dnfer/frontend && npx vitest run`
Expected: 构建 PASS、测试全 PASS。若有失败修复。

- [ ] **Step 2: 后端全量测试**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest -q`
Expected: 全 PASS。

- [ ] **Step 3: Commit（如有修复）**

```bash
git add -A
git commit -m "[fix] 占位冒险团前端回归修复"
```

---

## 验收清单（对照 spec）

- [ ] `SlotOut` 带 `adventure_party_id/adventure_party_name`；`_slot_out` 填充（空格 null、已占格带团、None 防护）。
- [ ] 详情页波网格 / fill 响应 slot 携带团字段（后端测试覆盖）。
- [ ] `Slot` 类型加两必填字段，手写 fixture 全部补齐，`npm run build` 通过。
- [ ] SlotActionModal 显示「冒险团：xxx」，null 不显示；独立 spec 覆盖两分支。
- [ ] 前端 vitest、后端 pytest 全量绿。
