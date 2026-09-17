# 攻坚删除 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许管理员从攻坚列表删除攻坚（级联清理波次/格子）。

**Architecture:** 后端新增 `DELETE /api/raids/{rid}`（仅管理员），依赖既有 `Raid.waves → Wave.slots` 的 `cascade="all, delete-orphan"` 自动清理；前端攻坚列表条目加「删除」按钮（仅管理员），`confirm()` 确认后调用并刷新。不改公共 API、WebSocket、数据模型。

**Tech Stack:** Python FastAPI + SQLAlchemy；Vue 3 + TypeScript + Vitest。

**规格参考:** `docs/superpowers/specs/2026-09-17-raid-delete-design.md`

---

## 文件结构

- `backend/app/routers/raids.py` — 新增 DELETE 端点
- `backend/tests/test_raids.py` — 新增删除测试（403/级联 200/404）
- `frontend/src/views/RaidListView.vue` — 列表条目加删除按钮 + `onDelete`
- `frontend/src/views/RaidListView.spec.ts` — 删除流程测试（管理员可删、非管理员无按钮）

运行测试：

- 后端：`cd /Users/able/toys/dnfer/backend && ./.venv/bin/python -m pytest`
- 前端：`cd /Users/able/toys/dnfer/frontend && npm run test`；类型检查 `npm run build`

提交沿用仓库风格 `[fet]`。

---

## Task 1: 后端攻坚删除端点

**Files:**
- Modify: `backend/app/routers/raids.py`
- Modify: `backend/tests/test_raids.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_raids.py` 追加（文件顶部已有 `from .helpers import register_user`，测试内用 `_admin`、`make_raid`，均已存在）：

```python
def test_delete_raid_only_admin(client):
    ah = _admin(client)
    h, _ = register_user(client, "pDel1", "删甲")
    rid = make_raid(client, ah)["id"]
    assert client.delete(f"/api/raids/{rid}", headers=h).status_code == 403
    assert client.delete(f"/api/raids/{rid}", headers=ah).status_code == 200
    assert client.get(f"/api/raids/{rid}", headers=h).status_code == 404

def test_delete_raid_cascades(client):
    ah = _admin(client)
    h, _ = register_user(client, "pDel2", "删乙")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid})
    assert client.delete(f"/api/raids/{rid}", headers=ah).status_code == 200
    # 攻坚已不存在（波次/格子随之级联删除）
    assert client.get(f"/api/raids/{rid}", headers=h).status_code == 404
    # 角色不再被占用格子引用，可以删除
    assert client.delete(f"/api/me/characters/{cid}", headers=h).status_code == 200

def test_delete_raid_not_found(client):
    ah = _admin(client)
    assert client.delete("/api/raids/999", headers=ah).status_code == 404
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd /Users/able/toys/dnfer/backend && ./.venv/bin/python -m pytest tests/test_raids.py -v`
Expected: FAIL（3 个新测试 405/404 无 DELETE 路由）

- [ ] **Step 3: 新增 DELETE 端点**

`backend/app/routers/raids.py`，在 `update_raid` 之后（或 lock 端点之前）新增：

```python
@router.delete("/{rid}")
def delete_raid(rid: int, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    db.delete(raid)  # waves/slots 经级联一并清理
    db.commit()
    return {"ok": True}
```

> 无需 WS 广播：删除后详情页下次刷新会 404（规格明确不改 WebSocket）。

- [ ] **Step 4: 运行全部后端测试验证通过**

Run: `cd /Users/able/toys/dnfer/backend && ./.venv/bin/python -m pytest`
Expected: 全部通过（新增 3 个删除测试 + 既有测试）

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/routers/raids.py backend/tests/test_raids.py
git commit -m "[fet] 管理员删除攻坚（级联清理波次/格子）"
```

---

## Task 2: 前端攻坚列表删除按钮

**Files:**
- Modify: `frontend/src/views/RaidListView.vue`
- Modify: `frontend/src/views/RaidListView.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/views/RaidListView.spec.ts` 的 `describe('RaidListView create form', ...)` 块内追加两个测试。现有 mock：`vi.hoisted` 的 `apiMock`（含 `del`）、`beforeEach` 里 `apiMock.get` 返回 `[]` 给 `/api/raids`。测试内覆盖该默认：

```ts
it('admin can delete a raid after confirming', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 1, username: 'a', nickname: 'A', is_admin: true }
  const raid: RaidListItem = { id: 3, name: '巴卡尔', dungeon_id: 7, dungeon_name: '巴卡尔',
    size: 16, locked: false, starts_at: '2026-09-20T14:00:00', wave_count: 1 }
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/raids') return [raid] as RaidListItem[]
    if (url === '/api/dungeons') return dungeons
    return []
  })
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const wrapper = mount(RaidListView, {
    global: { plugins: [pinia], stubs: ['router-link'] },
  })
  await flushPromises()
  const delBtn = wrapper.findAll('button').find(b => b.text().includes('删除'))
  expect(delBtn).toBeTruthy()
  await delBtn!.trigger('click')
  expect(confirmSpy).toHaveBeenCalled()
  expect(apiMock.del).toHaveBeenCalledWith('/api/raids/3')
  confirmSpy.mockRestore()
})

it('does not show delete button for non-admin', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 2, username: 'm', nickname: 'M', is_admin: false }
  const raid: RaidListItem = { id: 3, name: '巴卡尔', dungeon_id: 7, dungeon_name: '巴卡尔',
    size: 16, locked: false, starts_at: '2026-09-20T14:00:00', wave_count: 1 }
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/raids') return [raid] as RaidListItem[]
    return []
  })
  const wrapper = mount(RaidListView, {
    global: { plugins: [pinia], stubs: ['router-link'] },
  })
  await flushPromises()
  expect(wrapper.text()).not.toContain('删除')
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd /Users/able/toys/dnfer/frontend && npm run test`
Expected: FAIL（组件无删除按钮）

- [ ] **Step 3: script 增加删除处理**

`frontend/src/views/RaidListView.vue` script 内（`create()` 之后）新增：

```ts
async function onDelete(r: RaidListItem) {
  if (!confirm(`确认删除攻坚「${r.name}」？该操作不可恢复`)) return
  try { await api.del(`/api/raids/${r.id}`); await load() }
  catch (e: any) { alert(e.message) }
}
```

- [ ] **Step 4: template 列表条目加删除按钮**

列表条目 div（第 75-81 行）末尾、锁定状态 span 之后新增（`margin-left:auto` 右对齐，`@click.stop` 防止误触跳转）：

```html
<button v-if="auth.isAdmin" @click.stop="onDelete(r)" style="margin-left:auto">删除</button>
```

- [ ] **Step 5: 运行测试与类型检查验证通过**

Run: `cd /Users/able/toys/dnfer/frontend && npm run test && npm run build`
Expected: 全部通过（含新增 2 个删除测试）、无类型错误

- [ ] **Step 6: 提交**

```bash
cd /Users/able/toys/dnfer && git add frontend/src/views/RaidListView.vue frontend/src/views/RaidListView.spec.ts
git commit -m "[fet] 攻坚列表管理员删除按钮"
```

---

## 最终验证

- [ ] 后端：`cd backend && ./.venv/bin/python -m pytest` — 全部通过
- [ ] 前端：`cd frontend && npm run test && npm run build` — 全部通过、无类型错误
- [ ] 手动冒烟：管理员在攻坚列表删除一个攻坚 → 确认框 → 列表移除；普通成员看不到删除按钮
