# 投票删除 + 关闭默认收起 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员可删除任意投票（开放/关闭，级联清票）；已关闭投票默认收起展示，所有投票头部可手动切换展开/收起。

**Architecture:** 后端在 `services/votes.py` 加 `delete_vote`（`db.delete` + commit，模型已有 `Vote.options/ballots`、`VoteOption.ballots` 的 `cascade="all, delete-orphan"`，零迁移），`routers/admin.py` 加 `DELETE /api/admin/votes/{vid}`（`require_admin`）。前端在 `VoteCard.vue` 加删除按钮（`api.del` + confirmDialog）与折叠态（`collapsed = ref(!vote.open)`，头部点击 toggle，操作按钮 `@click.stop` 防冒泡，`watch(vote.open)` 开→关自动收起）。

**Tech Stack:** FastAPI + SQLAlchemy 2（后端）；Vue 3 `<script setup>` + Vitest（前端）。

**参考文档：** `docs/superpowers/specs/2026-10-19-vote-delete-collapse-design.md`

---

### Task 1: 后端 —— 删除投票端点（TDD）

**Files:**
- Modify: `backend/app/services/votes.py`（文件末尾 `cast_vote` 之后加 `delete_vote`）
- Modify: `backend/app/routers/admin.py:20`（import 加 `delete_vote`）+ 文件末尾（加 DELETE 端点）
- Test: `backend/tests/test_votes.py`（追加用例）

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_votes.py` 末尾）

```python
def test_delete_vote_admin_only(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    h, _ = register_user(client, "d1", "删票观察员")
    assert client.delete(f"/api/admin/votes/{vid}", headers=h).status_code == 403  # 非管理员
    r = client.delete(f"/api/admin/votes/{vid}", headers=admin_headers)
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert client.get("/api/votes", headers=admin_headers).json() == []  # 列表不再含
    assert client.get(f"/api/votes/{vid}", headers=admin_headers).status_code == 404


def test_delete_vote_cascades_ballots(client, admin_headers, db):
    from app.models import Vote, VoteBallot, VoteOption
    vid = _create_vote(client, admin_headers).json()["id"]
    h1, _ = register_user(client, "d2", "实名甲")
    client.post(f"/api/votes/{vid}/ballots", headers=h1, json={"option_ids": [1]})
    h2, _ = register_user(client, "d3", "匿名乙")
    client.post(f"/api/votes/{vid}/ballots", headers=h2,
                json={"option_ids": [2], "anonymous": True})
    assert client.delete(f"/api/admin/votes/{vid}", headers=admin_headers).status_code == 200
    # 级联：votes / vote_options / vote_ballots 全部清除
    assert db.query(Vote).filter(Vote.id == vid).count() == 0
    assert db.query(VoteOption).filter(VoteOption.vote_id == vid).count() == 0
    assert db.query(VoteBallot).filter(VoteBallot.vote_id == vid).count() == 0


def test_delete_vote_404(client, admin_headers, db):
    assert client.delete("/api/admin/votes/999", headers=admin_headers).status_code == 404


def test_delete_open_vote_frees_open_slot(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    assert client.delete(f"/api/admin/votes/{vid}", headers=admin_headers).status_code == 200
    # 删除开放中的投票后，「同时仅一个打开」名额释放
    assert _create_vote(client, admin_headers, title="重建").status_code == 200


def test_delete_closed_vote(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    client.post(f"/api/admin/votes/{vid}/close", headers=admin_headers)
    assert client.delete(f"/api/admin/votes/{vid}", headers=admin_headers).status_code == 200
    assert client.get("/api/votes", headers=admin_headers).json() == []
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_votes.py -v`
Expected: 新增用例 FAIL，报 404（路由不存在，DELETE 无匹配路径 → 405 或 404）。

- [ ] **Step 3: 实现后端**

`backend/app/services/votes.py`，文件末尾 `cast_vote` 之后加：

```python
def delete_vote(db: Session, vote: Vote) -> None:
    """删除投票：级联删除全部选项与票（Vote.options/ballots 已配 cascade）。"""
    db.delete(vote)
    db.commit()
```

`backend/app/routers/admin.py:20` 的 import 改为：

```python
from ..services.votes import _vote_or_404, close_vote, create_vote, delete_vote, vote_detail
```

`backend/app/routers/admin.py` 文件末尾（`close_vote_endpoint` 之后）加：

```python
@router.delete("/votes/{vid}")
def delete_vote_endpoint(vid: int, admin: User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    delete_vote(db, _vote_or_404(db, vid))
    return {"ok": True}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_votes.py -v`
Expected: 全部 PASS（新增 5 例 + 既有用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/votes.py backend/app/routers/admin.py backend/tests/test_votes.py
git commit -m "[feat] 投票：管理员删除端点（级联清票）"
```

---

### Task 2: 前端 —— VoteCard 删除按钮 + 收起/展开（TDD）

**Files:**
- Modify: `frontend/src/components/VoteCard.vue`（script 加 `collapsed`/`deleteVote`/watch；template 头部 toggle + 删除按钮 + 正文 `v-if="!collapsed"` 包裹 + 操作按钮 `@click.stop`）
- Test: `frontend/src/components/VoteCard.spec.ts`（追加用例）

- [ ] **Step 1: 写失败测试**（追加到 `frontend/src/components/VoteCard.spec.ts` 末尾，`closedVote` 常量加在 `openVote` 定义后）

```ts
const closedVote = { ...openVote, open: false, closed_at: '2026-09-29T00:00:00' }
```

```ts
it('关闭投票默认收起，点击头部可展开/收起', async () => {
  const wrapper = mount(VoteCard, { props: { vote: closedVote } })
  expect(wrapper.find('.vote-options').exists()).toBe(false) // 默认收起
  await wrapper.find('.vote-head').trigger('click')
  expect(wrapper.find('.vote-options').exists()).toBe(true)
  await wrapper.find('.vote-head').trigger('click')
  expect(wrapper.find('.vote-options').exists()).toBe(false)
})
it('进行中投票默认展开', async () => {
  const wrapper = mount(VoteCard, { props: { vote: openVote } })
  expect(wrapper.find('.vote-options').exists()).toBe(true)
})
it('非管理员不显示删除按钮', async () => {
  const wrapper = mount(VoteCard, { props: { vote: openVote } })
  expect(wrapper.find('[data-act="delete"]').exists()).toBe(false)
})
it('管理员可删除投票并触发 refresh', async () => {
  apiMock.del.mockResolvedValue({ ok: true })
  const wrapper = mount(VoteCard, { props: { vote: openVote, isAdmin: true } })
  expect(wrapper.find('[data-act="delete"]').exists()).toBe(true)
  await wrapper.find('[data-act="delete"]').trigger('click')
  await flushPromises()
  expect(confirmDialog).toHaveBeenCalled()
  expect(apiMock.del).toHaveBeenCalledWith('/api/admin/votes/1')
  expect(wrapper.emitted('refresh')).toHaveLength(1)
})
it('点击删除/关闭按钮不触发折叠切换（@click.stop）', async () => {
  apiMock.post.mockResolvedValue(openVote)
  apiMock.del.mockResolvedValue({ ok: true })
  const wrapper = mount(VoteCard, { props: { vote: openVote, isAdmin: true } })
  await wrapper.find('[data-act="close"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('.vote-options').exists()).toBe(true) // 仍展开
  await wrapper.find('[data-act="delete"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('.vote-options').exists()).toBe(true) // 仍展开
})
it('投票由进行中变为已关闭时自动收起；手动展开后不重收起', async () => {
  const wrapper = mount(VoteCard, { props: { vote: openVote } })
  expect(wrapper.find('.vote-options').exists()).toBe(true)
  await wrapper.setProps({ vote: closedVote })
  expect(wrapper.find('.vote-options').exists()).toBe(false) // 开→关自动收起
  await wrapper.find('.vote-head').trigger('click')
  expect(wrapper.find('.vote-options').exists()).toBe(true)  // 手动展开
  await wrapper.setProps({ vote: { ...closedVote, total_voters: 1 } })
  expect(wrapper.find('.vote-options').exists()).toBe(true)  // prop 刷新不重收起
})
```

> 注：现有 spec 顶部 hoisted mock 已含 `del: vi.fn()`，无需改。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/VoteCard.spec.ts`
Expected: 新增用例 FAIL（`data-act="delete"` 不存在、`.vote-options` 始终可见）。

- [ ] **Step 3: 实现 `VoteCard.vue`**

Script 区（在 `closeVote` 之后加）：

```ts
const collapsed = ref(!props.vote.open)   // 关闭默认收起、进行中默认展开
watch(() => props.vote.open, (nowOpen, prev) => {
  if (!nowOpen && prev) collapsed.value = true  // 由开→关时自动收起
})

async function deleteVote() {
  const ok = await confirmDialog({ content: `确认删除投票「${props.vote.title}」？删除后不可恢复（包含全部投票）！` })
  if (!ok) return
  try {
    await api.del(`/api/admin/votes/${props.vote.id}`)
    notifySuccess('投票已删除')
    emit('refresh')
  } catch (e: any) { notifyError(e.message) }
}
```

Template：

- `.vote-head` 改为可点击 toggle：加 `@click="collapsed = !collapsed"`，标题前加折叠指示符 `<span class="vote-caret">{{ collapsed ? '▸' : '▾' }}</span>`；内部「关闭投票」按钮加 `@click.stop`（替换原 `@click="closeVote"`），新增删除按钮：
```html
<button v-if="isAdmin" class="dnf-btn dnf-btn-sm" data-act="delete" @click.stop="deleteVote">删除投票</button>
```
- 头部下方全部正文（`vote-desc` / `vote-mask` / `ul.vote-options` / 两个 `vote-note` / `vote-submit`）用 `<div v-if="!collapsed" class="vote-body">` 包裹。
- Style 加：`.vote-head { cursor: pointer }`、`.vote-caret { color: var(--dnf-text-faint,#7a8291); font-size: 12px }`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/VoteCard.spec.ts`
Expected: 全部 PASS（新增 6 例 + 既有 7 例）。

- [ ] **Step 5: 类型/构建检查（vue-tsc）**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误（VoteCard 改动不牵动 types.ts，`api.del` 已存在于 client.ts）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/VoteCard.vue frontend/src/components/VoteCard.spec.ts
git commit -m "[feat] 投票卡片：管理员删除 + 关闭默认收起/手动展开"
```

---

### Task 3: 全量回归

**Files:**
- 无代码改动，仅验证

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS（含既有 votes 用例，尤其 `test_no_rewrite_or_withdraw` 的 `DELETE /api/votes/{vid}/ballots` 仍 405——新 DELETE 端点在 `/api/admin/votes/{vid}` 路径，不影响成员路由）。

- [ ] **Step 2: 前端相关测试 + 构建**

Run: `cd frontend && npx vitest run src/components/VoteCard.spec.ts src/views/VotesView.spec.ts && npm run build`
Expected: 全部 PASS + 构建成功。

- [ ] **Step 3: 提交（若有残留变更）**

```bash
git add -A
git commit -m "[test] 投票删除/收起全量回归"
```
（若无变更则跳过本步。）

---

## 说明 / 注意事项

- 提交直接到 main（仓库既定约定，不做 worktree）。
- 提交信息用 `[feat]/[test]` 风格 + 中文描述，`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- `DELETE /api/admin/votes/{vid}` 是 admin 新路径，与成员侧 `DELETE /api/votes/{vid}/ballots` 的 405 语义互不影响。
- `VoteCard.spec.ts` 的 `apiMock` hoisted mock 已有 `del`，直接复用。
- 前端类型经 `npm run build`（vue-tsc）校验；vitest 不做类型检查。
