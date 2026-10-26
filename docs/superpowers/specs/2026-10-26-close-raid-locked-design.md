# 攻坚队关闭默认置为锁定 — 设计规格

日期：2026-10-26
状态：已确认
需求来源：用户口述——攻坚队关闭时希望默认置为锁定状态，避免已关闭的攻坚仍显示「未锁定」徽章造成困惑。

已确认的决策：
- **后端**：`close_raid` 置 `raid.locked = True`（先于快照，快照与返回 `RaidDetail` 均记录 `locked=True`）。
- **前端展示兜底**：closed 攻坚徽章一律显示「已锁定」（`closed || locked`），覆盖历史已关闭攻坚（其快照 `locked` 仍为 `False`）。
- **不做**历史数据迁移/回填（前端兜底已覆盖显示）、不额外广播 `raid:locked`（`raid:closed` 已触发全量 reload）。

## 1. 背景与现状

`closed`（关闭攻坚）与 `locked`（锁定）是两个独立布尔字段：

- **closed**（`raids.py:243 close_raid`）：终态、不可逆——取快照、清 live 行、广播 `raid:closed`；`_reject_if_closed` 拒绝**所有**写端点（含 lock/unlock，管理员也不例外）。
- **locked**（`raids.py:298/307`）：可逆（管理员可解锁），仅拦非管理员编辑（`_can_edit = is_admin or not locked`，`raids.py:316`）。

因 closed 已挡掉一切写操作，置 `locked=True` **不是**权限/安全变更，纯语义与展示：关闭后攻坚的徽章从「未锁定」变为「已锁定」，快照也记录锁定态。当前关闭一个未锁定攻坚后，详情/列表页并排显示「未锁定 + 已关闭」，语义矛盾、误导成员。

## 2. 后端改动（`backend/app/routers/raids.py` `close_raid`）

在取快照**之前**置锁，保证快照记录 `locked=True`：

```python
raid.locked = True
raid.snapshot = _detail(db, raid).model_dump(mode="json")
raid.closed = True
```

要点：
- `_detail` 读的是 `raid.locked` 实况值（`raids.py:149`），故必须在 `snapshot = _detail(...)` 之前置 `locked`。
- 只广播 `raid:closed`，不额外广播 `raid:locked`：各端收到 `raid:closed` 后断 WS + 全量 reload，快照的 `locked=True` 随之生效。
- `_reject_if_closed` 依旧在一切写端点最先触发，lock/unlock 本就 400，无行为变化。

## 3. 前端展示兜底

两处徽章条件从 `locked` 改为 `closed || locked`（closed 攻坚恒显「已锁定」）：

- `frontend/src/views/RaidDetailView.vue`（约 299-301）：
  ```vue
  <span class="dnf-badge" :class="(store.raid.closed || store.raid.locked) ? 'dnf-badge-danger' : 'dnf-badge-ok'">
    {{ store.raid.closed || store.raid.locked ? '已锁定' : '未锁定' }}
  </span>
  ```
- `frontend/src/views/RaidListView.vue`（约 112-113）：同样把 `r.locked` 改成 `r.closed || r.locked`。

其余 closed 相关入口（报名/＋临时/添加临时选手/编队链接/锁定解锁按钮等）已全部被 `!closed` 或 `canEdit`（`auth.isAdmin && !closed`）拦住，无需改动。`stores/raid.ts applyEvent` 不动（`raid:closed` 分支已设 `closed=true` 并触发 reload）。

## 4. 测试

### 后端（`backend/tests/test_raid_close.py` 新增 1 例）

- **close 置 locked**：创建攻坚（`locked` 默认 False）→ `POST /close` → 返回详情 `locked is True`；再 `GET` 详情同样 `locked is True`（快照已记录）。

### 前端

- `RaidDetailView.spec.ts`「closed 攻坚显示已关闭徽章」用例补 `toContain('已锁定')`（fixture `{...makeRaid([]), closed: true}` 的 `locked:false`，恰好验证兜底逻辑）。
- `RaidListView.spec.ts`「closed raid」用例补 `toContain('已锁定')`（fixture `{...raid, closed: true}`，`locked:false`）。
- 既有用例不受影响：写端点在 `_reject_if_closed` 仍 400；lock-toggle 按钮 `!closed` 仍隐藏；非 closed 的「未锁定」断言（如 `RaidListView.spec.ts:275`）条件不变。

## 5. CHANGELOG

Unreleased「变更」新增一条：**关闭攻坚默认置为锁定**——关闭攻坚时快照记录 `locked=True`，详情/列表徽章显示「已锁定」（前端对已关闭攻坚展示兜底，历史已关闭的同样显示「已锁定」）。

## 6. 非目标 / 后续

- 历史已关闭攻坚的 `locked` 字段回填（前端兜底已覆盖显示，DB 无需迁移）。
- 关闭时同时广播 `raid:locked`（无必要，`raid:closed` 已触发 reload）。
- 调整锁定/关闭的交互流程或文案。
