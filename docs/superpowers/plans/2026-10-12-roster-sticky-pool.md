# 编队页左侧角色池 sticky 固定跟随 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让编队页（`/raids/:id/roster`）左侧角色池 `position:sticky` 钉在视口顶部，页面下滚查看右侧长网格时角色信息始终可见（不再需要回滚顶部）。

**Architecture:** 纯前端 CSS 微调。`RosterView.vue` 主体为 `display:flex; align-items:flex-start` 双栏（该 `align-items:flex-start` 是 sticky 在 flex 容器内生效的前提，已存在）。仅在左侧 `<aside data-test="roster-pool">` 的 inline style 追加 `position:sticky; top:60px`——`top:60px` 刻意避开全局 sticky 顶栏 `.dnf-nav`（约 50px，`z-index:10`），避免下滚后角色池顶部被顶栏遮挡。保留既有 `max-height:70vh; overflow:auto`（钉住后池内列表仍独立滚动）。配一条 jsdom 回归用例防止回退（scoped CSS 无法被 jsdom 解析，故 sticky 用 inline style 承载以可断言）。

**Tech Stack:** Vue 3 `<script setup>` + Vitest + vue-tsc（frontend）。无后端改动。

**测试命令：** 前端单测 `cd frontend && npx vitest run src/views/RosterView.spec.ts`；类型/构建 `cd frontend && npm run build`（= vue-tsc -b && vite build）。

**设计文档：** `docs/superpowers/specs/2026-10-12-roster-sticky-pool-design.md`

---

## 文件结构

**前端（frontend/src/）：**
- `views/RosterView.vue:220-227` — 主体双栏容器；`<aside data-test="roster-pool">` inline style 追加 sticky（Modify）

**前端测试（frontend/src/）：**
- `views/RosterView.spec.ts` — 新增「角色池 sticky」回归用例（Modify）

---

## Task 1: 左侧角色池 sticky

**Files:**
- Modify: `frontend/src/views/RosterView.vue:220-227`
- Test: `frontend/src/views/RosterView.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `RosterView.spec.ts` 的 `describe('RosterView', ...)` 内、「渲染角色池与网格」用例之后追加：

```ts
it('左侧角色池 sticky 固定跟随（下滚后仍可见，防止回退普通流）', async () => {
  const { wrapper } = await mountView([adminRow, memberRow])
  await flushPromises()
  const pool = wrapper.find('[data-test="roster-pool"]')
  expect(pool.element.style.position).toBe('sticky')
})
```

用 `element.style.position`（而非 `attributes('style')` 子串匹配），避免内联样式属性顺序导致的脆弱断言。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts`
Expected: 新增用例 FAIL——`expect(...).toBe('sticky')` 得到空字符串（aside 当前无 sticky）。

- [ ] **Step 3: 实现**

修改 `RosterView.vue` 中 `<aside>`（当前约 220-227 行）：

```html
    <div style="display:flex;gap:16px;align-items:flex-start">
      <!-- position:sticky;top:60px 依赖全局 .dnf-nav 顶栏高度（约50px）：改顶栏高度需同步调整 top -->
      <aside style="width:260px;flex-shrink:0;max-height:70vh;overflow:auto;position:sticky;top:60px" data-test="roster-pool"
             class="dnf-panel" >
```

要点：`align-items:flex-start` 已在父容器上（勿改回 stretch，否则 sticky 无可粘空间）；保留 `max-height:70vh;overflow:auto`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/RosterView.spec.ts`
Expected: 全用例 PASS（含新增 sticky 用例）。

- [ ] **Step 5: 全量回归 + 类型/构建**

Run: `cd frontend && npx vitest run`
Expected: 全量通过（既有 265 用例 + 新增 1 用例）。

Run: `cd frontend && npm run build`
Expected: vue-tsc + vite build 通过。

- [ ] **Step 6: 手动验证（jsdom 无法验证真实 sticky 布局）**

浏览器打开编队页：
1. 页面下滚后，角色池钉在顶栏下方且不被 `.dnf-nav` 遮挡（顶部首行角色可见）；
2. 钉住后池内列表仍可独立滚动（`max-height:70vh` 生效）；
3. 滚回页面顶部，角色池回到正常文档位置。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/views/RosterView.vue frontend/src/views/RosterView.spec.ts
git commit -m "feat: 编队页左侧角色池 sticky 固定跟随，下滚时角色信息始终可见"
```

---

## 验收标准

- 页面下滚后左侧角色池始终可见、不被全局顶栏遮挡；回顶部恢复原位。
- `RosterView.spec.ts` 含 sticky 回归用例且通过；全量前端测试与 `npm run build` 通过。
- 后端零改动。
