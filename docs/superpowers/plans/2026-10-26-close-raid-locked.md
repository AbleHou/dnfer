# 攻坚队关闭默认置为锁定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 攻坚队关闭（close）时默认置为锁定：后端 `close_raid` 先置 `raid.locked = True` 再取快照，前端对已关闭攻坚徽章一律显示「已锁定」。

**Architecture:** `closed` 已挡掉一切写操作（含 lock/unlock），本改动是纯语义/展示变更——快照记录 `locked=True`，详情页与列表页徽章条件从 `locked` 改为 `closed || locked`。历史已关闭攻坚（快照 `locked=False`）靠前端兜底显示「已锁定」，无需 DB 迁移。

**Tech Stack:** FastAPI / SQLAlchemy 2 / SQLite（backend）；Vue 3 `<script setup>` + naive-ui + Vitest（frontend）。

**Spec:** `docs/superpowers/specs/2026-10-26-close-raid-locked-design.md`

---

### Task 1: 后端 close_raid 置 locked=True

**Files:**
- Modify: `backend/app/routers/raids.py:251`（close_raid 取快照前插入置锁）
- Test: `backend/tests/test_raid_close.py`

- [ ] **Step 1: 写失败测试**（`test_raid_close.py` 文件末尾追加）

```python
def test_close_sets_locked_true(client):
    """关闭攻坚默认置为锁定：返回详情与快照 locked 均为 True。"""
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.get(f"/api/raids/{rid}", headers=ah).json()["locked"] is False
    r = client.post(f"/api/raids/{rid}/close", headers=ah)
    assert r.status_code == 200
    assert r.json()["locked"] is True
    assert client.get(f"/api/raids/{rid}", headers=ah).json()["locked"] is True
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_close.py::test_close_sets_locked_true -v`
Expected: FAIL —— `assert r.json()["locked"] is True` 处 `locked` 仍为 `False`

- [ ] **Step 3: 实现**（`raids.py` 251-252，在 `raid.snapshot = _detail(...)` 之前插入置锁；`raid.locked` 默认 False，`_detail` 读实况值故必须先置再快照）

```python
    raid.locked = True  # 关闭默认置为锁定，先于快照记录
    raid.snapshot = _detail(db, raid).model_dump(mode="json")  # 先取快照（datetime→ISO）
    raid.closed = True
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_close.py::test_close_sets_locked_true -v`
Expected: PASS

- [ ] **Step 5: 跑整个 test_raid_close.py 回归**

Run: `cd backend && .venv/bin/python -m pytest tests/test_raid_close.py -v`
Expected: 全部 PASS（含 `test_all_write_endpoints_rejected_when_closed`——lock/unlock 在 `_reject_if_closed` 仍 400）

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/raids.py backend/tests/test_raid_close.py
git commit -m "[feat] 关闭攻坚默认置为锁定：close_raid 置 locked=True 并记录进快照
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 前端 closed ⇒ 已锁定 展示兜底

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue:299-301`
- Modify: `frontend/src/views/RaidListView.vue:112-113`
- Test: `frontend/src/views/RaidDetailView.spec.ts`（closed 攻坚用例）、`frontend/src/views/RaidListView.spec.ts`（closed raid 用例）

- [ ] **Step 1: 给两个 spec 的 closed 用例补断言**（fixture 均为 `locked: false`，正验证兜底）

`RaidDetailView.spec.ts`「closed 攻坚显示已关闭徽章并隐藏编辑入口」内、`expect(wrapper.text()).toContain('已关闭')`（约 479 行）之后追加：

```ts
    expect(wrapper.text()).toContain('已锁定')  // 关闭攻坚默认视为锁定
```

`RaidListView.spec.ts`「closed raid」用例内、`expect(wrapper.text()).toContain('已关闭')`（约 253 行）之后追加：

```ts
    expect(wrapper.text()).toContain('已锁定')
```

- [ ] **Step 2: 跑两个 spec 确认失败**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts src/views/RaidListView.spec.ts`
Expected: FAIL —— 两个 closed 用例断言「已锁定」失败（当前徽章显示「未锁定」）

- [ ] **Step 3: 实现两处徽章条件**

`RaidDetailView.vue` 299-301（视图已有 `closed` computed，模板直接用它，与 302 行 `v-if="closed"` 一致）：

```vue
      <span class="dnf-badge" :class="closed || store.raid.locked ? 'dnf-badge-danger' : 'dnf-badge-ok'">
        {{ closed || store.raid.locked ? '已锁定' : '未锁定' }}
      </span>
```

`RaidListView.vue` 112-113：

```vue
        <span class="dnf-badge" :class="r.closed || r.locked ? 'dnf-badge-danger' : 'dnf-badge-ok'">
          {{ r.closed || r.locked ? '已锁定' : '未锁定' }}
        </span>
```

- [ ] **Step 4: 跑两个 spec 确认通过**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts src/views/RaidListView.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: 跑前端类型/构建**

Run: `cd frontend && npm run build`
Expected: vue-tsc + vite build 通过

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/RaidDetailView.vue frontend/src/views/RaidListView.vue
git add frontend/src/views/RaidDetailView.spec.ts frontend/src/views/RaidListView.spec.ts
git commit -m "[feat] 前端对已关闭攻坚徽章显示「已锁定」（closed || locked 兜底）
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: CHANGELOG 条目

**Files:**
- Modify: `CHANGELOG.md`（Unreleased「变更」块，约 7-11 行）

- [ ] **Step 1: 加条目**（Unreleased「变更」列表追加，风格对齐既有条目）

```
- **关闭攻坚默认置为锁定**：关闭攻坚时快照记录 `locked=True`，详情/列表徽章显示「已锁定」（前端对已关闭攻坚展示兜底，历史已关闭的同样显示「已锁定」）
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "[docs] CHANGELOG：Unreleased 新增「关闭攻坚默认置为锁定」条目
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
