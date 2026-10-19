# 投票删除 + 关闭默认收起 — 设计规格

日期：2026-10-19
状态：已确认
需求来源：用户口述——①投票目前无法删除，历史投票只能永久保留；②关闭的投票在列表里默认展开占位，希望默认收起、需要时再展开看结果。

已确认的决策：
- **删除**：仅管理员可删；开放中的与已关闭的都能删。删除级联清掉该投票全部选项与票（模型 `cascade="all, delete-orphan"` 已具备，零迁移）。删除开放中的投票自然释放「同时仅一个打开」名额。
- **收起**：已关闭的投票默认收起，进行中的默认展开；所有投票头部都可手动切换展开/收起。收起时仅显示头部（标题+状态徽章+多选徽章+投票人数+操作按钮），隐藏描述/选项/投票区。
- **折叠态**：组件内自持（`collapsed` ref），轮询刷新（5s）不重置；投票由「进行中」变为「已关闭」时自动收起，手动展开已关闭投票不会被重新收起。

## 1. 目标

- 管理员可删除任意投票（开放/关闭），删除不可恢复（含全部票）。
- 已关闭投票默认收起展示，所有投票可手动切换展开/收起，减少列表占用。
- 进行中投票默认展开，便于继续投票；不破坏现有投票交互（匿名、多选、结果查看）。

**范围**：后端（`services/votes.py` 加 `delete_vote` + `routers/admin.py` 加 `DELETE /api/admin/votes/{vid}`）+ 前端（`VoteCard.vue` 加删除按钮与收起/展开、`types.ts` 无改动）。**不含**：票的软删除/回收站、删除权限下沉到非管理员、投票结果的导出。

## 2. 后端

### 2.1 `services/votes.py`

新增：

```python
def delete_vote(db: Session, vote: Vote) -> None:
    """删除投票：级联删除全部选项与票（Vote.options/ballots 已配 cascade）。"""
    db.delete(vote)
    db.commit()
```

无迁移——`Vote.options`/`Vote.ballots`/`VoteOption.ballots` 已有 `cascade="all, delete-orphan"`，删主表即清理选项与全部实名/匿名票。

### 2.2 `routers/admin.py`

新增端点，对齐 create/close 的 `require_admin`：

```python
@router.delete("/votes/{vid}")
def delete_vote_endpoint(vid: int, admin: User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    delete_vote(db, _vote_or_404(db, vid))
    return {"ok": True}
```

- 复用 `_vote_or_404`（不存在 → 404「投票不存在」）。
- 开放中的投票删除后，`create_vote` 的「存在 open 投票则拒绝」自动放行，无需额外处理。

## 3. 前端（`VoteCard.vue`）

### 3.1 删除按钮

- 头部 admin 操作区（现「关闭投票」旁）加「删除投票」按钮，仅 `isAdmin` 显示。
- 点击走 `confirmDialog`（内容强调不可逆，如「确认删除投票「{title}」？删除后不可恢复（包含全部投票）！」）→ `api.delete('/api/admin/votes/{id}')` → `notifySuccess('投票已删除')` → `emit('refresh')`。
- 异常 `notifyError(e.message)`，对齐现有 `closeVote` 写法。

### 3.2 收起/展开

- `const collapsed = ref(!props.vote.open)`——关闭默认收起、进行中默认展开（`isOpen` 已存在）。
- 头部整块可点击 toggle（加 `▸/▾` 指示符，点击事件 `@click="collapsed = !collapsed"`）；收起时 `v-if="!collapsed"` 隐藏描述、`vote-mask`、选项 `ul`、投票按钮等全部正文区，仅保留头部。
- 轮询刷新不重置：VotesView 用 `:key="v.id"`，组件实例跨 refresh 存活，`collapsed` ref 不受 `vote` prop 替换影响。
- 自动收起 watch：

```ts
watch(() => props.vote.open, (nowOpen, prev) => {
  if (!nowOpen && prev) collapsed.value = true  // 由开→关时自动收起
})
```

  仅 `开→关` 触发（管理员点关闭后 refresh 生效）；手动展开已关闭投票后 prev 恒为 false，不会再被收起。
- 头部保留：`vote-title`、状态徽章、多选徽章、`vote-voters`、操作按钮（关闭/删除）。折叠指示符放标题前或标题旁，样式对齐现有徽章。

### 3.3 样式

- 头部加 `cursor: pointer`（可点击区）；`▸/▾` 用 span 内联字符（复用现有字体，不引图标库）。
- 收起时卡片高度收敛为头部一行，其余样式不动。

## 4. 约束与边界

- 删除仅管理员（`require_admin`），对齐创建/关闭。
- 删除不可逆、无恢复端点；误操作靠强确认兜底。
- 开放中的投票可删；删除后释放「唯一打开」名额。
- 折叠态纯前端内存态，不持久化、不上报后端；刷新页面回到「关闭收起、进行中展开」默认。
- 匿名票随投票一并删除（级联），无追溯残留。

## 5. 测试

### 后端（`backend/tests/`）

- **删除**：建投票+投几票 → DELETE → 返回 `{"ok": True}`；`votes/vote_options/vote_ballots` 行全部清除；GET 列表不含该投票；再 GET 详情 404。
- **级联完整性**：删除含实名/匿名票的投票后，无悬挂的 `vote_ballots` 行。
- **权限**：非管理员 DELETE → 403。
- **404**：删除不存在 id → 404。
- **删除开放中的投票**：删除后 `create_vote` 不再被该投票阻止（可再建新的）。
- **关闭后再删**：关闭 → 删除 → 列表不含，符合预期。

### 前端

- `VoteCard`：关闭投票 `vote.open=false` 渲染时默认收起（不渲染选项 `ul`）；进行中默认展开；点击头部 toggle 展开/收起（正反断言 `exists()`）。
- 删除按钮：仅 `isAdmin` 显示；点击 → confirmDialog 确认 → `api.delete` 被调用 → 触发 `refresh`。
- `vote.open` 由 true→false 时自动收起；手动展开已关闭投票后不因 prop 变化重收起。
- `types` fixture 无改动（不加字段）。

## 6. 非目标 / 后续

- 票的软删除/回收站/恢复。
- 删除权限下沉到投票创建者等非管理员。
- 折叠态的跨会话持久化（localStorage 记忆）。
- 投票结果的导出/归档。
