# DNfer 攻坚删除 — 设计规格

日期：2026-09-17
状态：已确认
上游：`2026-09-16-dnfer-raid-scheduler-design.md`（新增子功能，不改既有排表语义）

## 1. 目标

允许管理员删除攻坚（例如创建错误）。当前攻坚列表无法删除任何攻坚。

已确认的约束：

- **仅管理员**可删除。
- 删除入口在**攻坚列表页**（每个条目一个删除按钮）。
- 锁定状态不额外拦截（管理员 + 确认即可删）。
- 删除为**硬删除 + 级联清理**（waves/slots 随之删除），前端 `confirm()` 兜底防误触。

## 2. 后端

新增端点：

- `DELETE /api/raids/{rid}`（`require_admin`）
  - 攻坚不存在 → 404「攻坚不存在」
  - 删除 `Raid`，`waves`/`slots` 经既有 `cascade="all, delete-orphan"` 级联清理
  - 返回 `{"ok": True}`

公共 API、WebSocket、数据模型均不改动（删掉的攻坚自然不再出现在列表中）。

## 3. 前端

`frontend/src/views/RaidListView.vue`：

- 列表条目右侧新增「删除」按钮，`v-if="auth.isAdmin"`。
- 点击 → `confirm('确认删除攻坚「name」？该操作不可恢复')` → 取消则无操作；确认则 `api.del('/api/raids/{id}')` → 成功后重新 `load()` 刷新列表。
- 请求失败 → `alert(e.message)`（与现有删除/报错风格一致）。

## 4. 测试

- **后端 pytest**：
  - 非管理员删除 → 403。
  - 管理员删除 → 200；攻坚决/波次/格子均被清空（级联）。
  - 删除不存在的攻坚 → 404。
- **前端 Vitest**（`RaidListView.spec.ts`）：
  - 管理员看到删除按钮；点确认调用 `api.del` 并刷新。
  - 非管理员不显示删除按钮。

## 5. 变更文件范围

后端：

- `backend/app/routers/raids.py` — 新增 DELETE 端点
- `backend/tests/test_raids.py` — 新增删除测试

前端：

- `frontend/src/views/RaidListView.vue` — 删除按钮与处理逻辑
- `frontend/src/views/RaidListView.spec.ts` — 删除流程测试
