# 管理员自由调整站位 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员可以在排表页自由调整玩家站位：往任意空格放任意玩家角色、对已占位格换人、拿起角色后点击目标格移动/对调（跨波次支持）。

**Architecture:** 后端在现有 `fill` 接口上放开管理员的「占位格换人」，新增原子 `move` 端点（move/swap，含组成与同波同玩家校验），新增 `GET /api/admin/characters` 给选人弹窗；同时把非管理员「自己的格子」判定从 `updated_by` 改为按角色归属 `owner_id`（与前端一致）。前端新增 `useSlotMove` 组合式函数管理移动状态机，选人弹窗加管理员模式（玩家选择器），`SlotCell` 加管理员点击交互与移动高亮，新增 `SlotActionModal` 操作菜单。

**Tech Stack:** FastAPI + SQLAlchemy + SQLite（后端）；Vue 3 + TypeScript + Pinia + Naive UI + Vitest（前端）。TDD：先写失败测试，跑失败，实现，跑通过，提交。

**测试命令：**
- 后端（需在 backend 目录，`.venv` 虚拟环境）：
  - 单文件：`.venv/bin/python -m pytest tests/test_admin_adjust.py -v`
  - 全量：`.venv/bin/python -m pytest`
- 前端（需在 frontend 目录）：`npm test`（vitest run）；构建 `npm run build`（vue-tsc + vite）

---

## 任务总览（文件结构）

| 任务 | 文件 | 责任 |
|---|---|---|
| 1 | `backend/app/routers/raids.py` | fill 允许管理员换人（占位格直接放） |
| 2 | `backend/app/routers/raids.py` | 3.4：格子归属判定改 owner_id（remove/duty/删波） |
| 3 | `backend/app/routers/raids.py`、`backend/app/schemas.py` | 新增 move/swap 端点 |
| 4 | `backend/app/routers/auth.py`、`backend/app/schemas.py` | 新增 GET /api/admin/characters |
| 5 | `frontend/src/composables/useSlotMove.ts` | 移动状态机组合式函数 |
| 6 | `frontend/src/components/CharacterPickerModal.vue`、`frontend/src/types.ts` | 选人弹窗管理员模式 |
| 7 | `frontend/src/components/SlotCell.vue`、`frontend/src/components/SlotActionModal.vue`、`frontend/src/components/WaveSection.vue`、`frontend/src/styles/dnf.css` | 格子管理员交互 + 操作菜单 |
| 8 | `frontend/src/views/RaidDetailView.vue` | 集成操作菜单 + 移动状态机 + Esc 取消 |
| 9 | — | 全量验证（后端 pytest + 前端 vitest + 构建） |

后端测试全部放 `backend/tests/test_admin_adjust.py`（新建，按任务追加）。

---

### Task 1: 后端 fill 允许管理员换人

**Files:**
- Modify: `backend/app/routers/raids.py`（`fill_slot` 函数，约 185-253 行）
- Test: `backend/tests/test_admin_adjust.py`（新建）

现状：`fill_slot` 内 `if slot.character_id is not None: raise HTTPException(400, "该格已有人占位")` 无条件拦截占位格。角色归属限制 `if not user.is_admin and char.user_id != user.id` 已允许管理员用任意角色（无需改）。只需放开占位格限制给管理员。

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_admin_adjust.py` 追加：

```python
from .helpers import make_raid, register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def _mkchar(client, h, name, job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]

def test_admin_can_replace_occupied_slot(client):
    ah = _admin(client)
    h1, u1 = register_user(client, "rep1", "甲")
    h2, u2 = register_user(client, "rep2", "乙")
    c1 = _mkchar(client, h1, "C1")
    c2 = _mkchar(client, h2, "C2")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = slots[0]
    # 甲先占 sA
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200
    # 管理员用乙的 C2 直接换掉 sA 上的 C1
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=ah,
                    json={"character_id": c2, "replace": True})
    assert r.status_code == 200
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] == c2
    assert by_id[sA["id"]]["owner_nickname"] == "乙"
    # C1 被换下后可另占其他格
    sB = next(s for s in slots if s["id"] != sA["id"])
    assert client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200

def test_non_admin_cannot_fill_occupied_slot(client):
    ah = _admin(client)
    h1, _ = register_user(client, "rep3", "丙")
    h2, _ = register_user(client, "rep4", "丁")
    c1 = _mkchar(client, h1, "C1")
    c2 = _mkchar(client, h2, "C2")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = slots[0]
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h2,
                    json={"character_id": c2})
    assert r.status_code == 400
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_admin_adjust.py::test_admin_can_replace_occupied_slot -v`
Expected: FAIL（400「该格已有人占位」）

- [ ] **Step 3: 最小实现**

`backend/app/routers/raids.py` 的 `fill_slot` 中，把：

```python
    if slot.character_id is not None:
        raise HTTPException(400, "该格已有人占位")
```

改为：

```python
    if slot.character_id is not None and not user.is_admin:
        raise HTTPException(400, "该格已有人占位")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `.venv/bin/python -m pytest tests/test_admin_adjust.py -v`
Expected: PASS（2 个）

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/raids.py backend/tests/test_admin_adjust.py
git commit -m "[fet] fill 允许管理员直接换人（占位格可覆盖为任意玩家角色）"
```

---

### Task 2: 后端格子归属判定改 owner_id（规格 3.4）

**Files:**
- Modify: `backend/app/routers/raids.py`（`remove_slot` ~264 行、`change_duty` ~286 行、`delete_wave` ~178 行）
- Test: `backend/tests/test_admin_adjust.py`（追加）

现状：非管理员判定「自己的格子」用 `slot.updated_by != user.id`；管理员调整后该玩家界面显示可操作但 403。统一改为按角色归属 `owner_id`（`slot.character.user_id`），与前端 `slot.owner_id === currentUserId` 一致。`updated_by` 保留仅作审计。

- [ ] **Step 1: 写失败测试**

追加：

```python
def test_owner_can_manage_slot_admin_placed(client):
    ah = _admin(client)
    h1, u1 = register_user(client, "own1", "甲")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    # 管理员替甲放置 C1（管理员可用任意角色）
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200
    # 甲本人（非管理员）可改职责、可撤下
    assert client.put(f"/api/raids/{rid}/slots/{slot['id']}/duty", headers=h1,
                      json={"duty": "辅C"}).status_code == 200
    assert client.delete(f"/api/raids/{rid}/slots/{slot['id']}", headers=h1).status_code == 200

def test_non_owner_cannot_manage_others_slot(client):
    ah = _admin(client)
    h1, _ = register_user(client, "own2", "乙")
    h2, _ = register_user(client, "own3", "丙")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h1,
                json={"character_id": c1})
    # 丙无法操作乙的格子（即便该格不是乙放置的也无所谓）
    assert client.delete(f"/api/raids/{rid}/slots/{slot['id']}", headers=h2).status_code == 403

def test_owner_can_delete_wave_with_only_own_chars_admin_placed(client):
    ah = _admin(client)
    h1, _ = register_user(client, "own4", "丁")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    # 加波 2，管理员在波 2 放丁的 C1
    client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    w2 = next(w for w in client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
              if w["index"] == 2)
    s = w2["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200
    # 丁可删除仅含自己角色的波 2
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=h1).status_code == 200
```

- [ ] **Step 2: 跑测试确认失败**

Run: `.venv/bin/python -m pytest tests/test_admin_adjust.py -k "owner_can or non_owner or owner_can_delete_wave" -v`
Expected: FAIL（403「只能操作自己的格子」/「该波次包含他人角色」）

- [ ] **Step 3: 最小实现**

三处替换（`slot.updated_by != user.id` → `slot.character.user_id != user.id`，`s.updated_by != user.id` → `s.character.user_id != user.id`）：

`delete_wave` 内：

```python
        if any(s.updated_by != user.id for s in filled):
```
→
```python
        if any(s.character.user_id != user.id for s in filled):
```

`remove_slot` 内：

```python
        if slot.updated_by != user.id:
```
→
```python
        if slot.character.user_id != user.id:
```

`change_duty` 内（同样的行）：

```python
        if slot.updated_by != user.id:
```
→
```python
        if slot.character.user_id != user.id:
```

注意：这三处 `old_string` 内容相同但出现位置不同，Edit 时需带上下文区分（见各函数所在行）。

- [ ] **Step 4: 跑测试确认通过**

Run: `.venv/bin/python -m pytest tests/test_admin_adjust.py -v`
Expected: PASS（5 个）—— 同时跑一次全量确认无回归：
Run: `.venv/bin/python -m pytest`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/raids.py backend/tests/test_admin_adjust.py
git commit -m "[fix] 格子归属判定改按角色 owner_id，管理员调整后玩家本人可正常操作"
```

---

### Task 3: 后端新增 move/swap 端点

**Files:**
- Modify: `backend/app/schemas.py`（新增 `MoveIn`）
- Modify: `backend/app/routers/raids.py`（新增 `_validate_one_char_per_wave` + `move_slot` 端点）
- Test: `backend/tests/test_admin_adjust.py`（追加）

语义（规格 3.2）：仅管理员；源格必须已占位；目标格同攻坚；目标=源格 400。目标空=搬移，目标占位=对调。校验受影响小队的组成规则（`_raise_if_hard`，空小队跳过）+ 受影响波内同玩家不得出现两次（双向）。复用 WS 事件：move=slot:filled(目标)+slot:removed(源)；swap=两格 slot:filled。返回 `FillResponse`。

- [ ] **Step 1: 写失败测试**

追加：

```python
def test_move_to_empty_slot(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv1", "甲")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                    json={"target_slot_id": sB["id"]})
    assert r.status_code == 200
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] is None
    assert by_id[sB["id"]]["character_id"] == c1
    assert by_id[sB["id"]]["duty"] == "主C"
    assert r.json()["removed_slots"][0]["id"] == sA["id"]

def test_swap_two_slots(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv2", "甲")
    h2, _ = register_user(client, "mv3", "乙")
    c1 = _mkchar(client, h1, "C1")
    c2 = _mkchar(client, h2, "C2")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h2,
                json={"character_id": c2})
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                       json={"target_slot_id": sB["id"]}).status_code == 200
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] == c2
    assert by_id[sB["id"]]["character_id"] == c1

def test_move_across_waves(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv4", "丙")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    w1, w2 = [w for w in client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
              if w["index"] in (1, 2)]
    sA = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    sC = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                       json={"target_slot_id": sC["id"]}).status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
    w1s = {s["id"]: s for s in next(w for w in detail if w["index"] == 1)["slots"]}
    w2s = {s["id"]: s for s in next(w for w in detail if w["index"] == 2)["slots"]}
    assert w1s[sA["id"]]["character_id"] is None
    assert w2s[sC["id"]]["character_id"] == c1

def test_swap_cross_wave_duplicate_player_blocked(client):
    # 评审场景：swap 后源波内出现同玩家两次（目标玩家进入源波的方向）
    ah = _admin(client)
    h1, _ = register_user(client, "mv5", "丁")
    h2, _ = register_user(client, "mv6", "戊")
    c1 = _mkchar(client, h1, "X")   # 丁的 X
    c2 = _mkchar(client, h2, "W")   # 戊的 W
    c3 = _mkchar(client, h2, "Y")   # 戊的 Y
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    w1, w2 = [w for w in client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
              if w["index"] in (1, 2)]
    sA = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in w1["slots"] if s["squad_index"] == 1 and s["row_index"] == 0)
    sC = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    # 波1: A=丁X, B=戊W；波2: C=戊Y
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h2,
                json={"character_id": c2})
    client.post(f"/api/raids/{rid}/slots/{sC['id']}/fill", headers=h2,
                json={"character_id": c3})
    # swap A(X) ↔ C(Y) → 波1 出现 戊 两次 → 400 且状态不变
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                    json={"target_slot_id": sC["id"]})
    assert r.status_code == 400
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] == c1
    assert by_id[sB["id"]]["character_id"] == c2

def test_move_bad_inputs(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv7", "己")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = slots[0]
    # 目标=源格 → 400
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                       json={"target_slot_id": sA["id"]}).status_code == 400
    # 源格为空 → 400
    sB = slots[1]
    assert client.post(f"/api/raids/{rid}/slots/{sB['id']}/move", headers=ah,
                       json={"target_slot_id": slots[2]["id"]}).status_code == 400
    # 目标跨攻坚 → 404
    rid2 = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    s2 = client.get(f"/api/raids/{rid2}", headers=ah).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                       json={"target_slot_id": s2["id"]}).status_code == 404
    # 非管理员 → 403
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=h1,
                       json={"target_slot_id": slots[3]["id"]}).status_code == 403

def test_move_main_healer_limit_rollback(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv8", "庚")
    h2, _ = register_user(client, "mv9", "辛")
    h3, _ = register_user(client, "mv10", "壬")
    c1 = _mkchar(client, h1, "奶1", job="crusader_male")
    c2 = _mkchar(client, h2, "C2")
    c3 = _mkchar(client, h3, "奶3", job="crusader_male")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    sD = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 1)
    # squad0: A=奶1(主奶)；squad1: B=C2, D=奶3(主奶)
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200
    assert client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h2,
                       json={"character_id": c2}).status_code == 200
    assert client.post(f"/api/raids/{rid}/slots/{sD['id']}/fill", headers=h3,
                       json={"character_id": c3, "duty": "主奶"}).status_code == 200
    # 把 D 的奶3(主奶) 移到 squad0 空位 sE → squad0 双主奶 → 400 回滚
    sE = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 1)
    r = client.post(f"/api/raids/{rid}/slots/{sD['id']}/move", headers=ah,
                    json={"target_slot_id": sE["id"]})
    assert r.status_code == 400
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sD["id"]]["character_id"] == c3
    assert by_id[sE["id"]]["character_id"] is None

def test_move_full_squad_composition_rollback(client):
    # squad0 满员且组成合法（3输出+1辅助主奶）；swap 把辅助换成输出 → 满员无辅助 → 400 回滚
    ah = _admin(client)
    hs = [register_user(client, f"fs{i}", f"fs{i}")[0] for i in range(5)]
    outs = [_mkchar(client, hs[i], f"O{i}") for i in range(3)]
    sup = _mkchar(client, hs[3], "S", job="crusader_male")
    out5 = _mkchar(client, hs[4], "O5")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    squad0 = [s for s in slots if s["squad_index"] == 0]
    for i, s in enumerate(squad0[:3]):
        assert client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=hs[i],
                           json={"character_id": outs[i]}).status_code == 200
    assert client.post(f"/api/raids/{rid}/slots/{squad0[3]['id']}/fill", headers=hs[3],
                       json={"character_id": sup}).status_code == 200
    sSrc = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{sSrc['id']}/fill", headers=hs[4],
                       json={"character_id": out5}).status_code == 200
    # swap O5(输出) ↔ 辅助 → squad0 变 4 输出（满员无辅助无主奶）→ 400 回滚
    r = client.post(f"/api/raids/{rid}/slots/{sSrc['id']}/move", headers=ah,
                    json={"target_slot_id": squad0[3]["id"]})
    assert r.status_code == 400
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[squad0[3]["id"]]["character_id"] == sup
    assert by_id[sSrc["id"]]["character_id"] == out5
```

- [ ] **Step 2: 跑测试确认失败**

Run: `.venv/bin/python -m pytest tests/test_admin_adjust.py -k "move or swap" -v`
Expected: FAIL（404 无该端点 / 405）

- [ ] **Step 3: 实现 schemas**

`backend/app/schemas.py` 在 `DutyIn` 附近新增：

```python
class MoveIn(BaseModel):
    target_slot_id: int
```

- [ ] **Step 4: 实现 raids.py**

导入行更新（`..schemas import` 加入 `MoveIn`）：

```python
from ..schemas import (DutyIn, FillIn, FillResponse, MoveIn, RaidCreate,
                       RaidDetail, RaidListItem, RaidUpdate, SlotMutationResult,
                       SlotOut, WaveOut)
```

在 `change_duty` 端点之后追加两个函数：

```python
def _validate_one_char_per_wave(db: Session, wave_ids: set[int]) -> None:
    """跨波 move/swap 后：受影响波内同一玩家不得出现两个角色（双向校验）。"""
    for wid in wave_ids:
        seen: set[int] = set()
        for s in db.query(Slot).filter(Slot.wave_id == wid):
            if s.character_id is not None and s.character is not None:
                uid = s.character.user_id
                if uid in seen:
                    raise HTTPException(400, "同一波次中一个玩家只能上一个角色")
                seen.add(uid)


@router.post("/{rid}/slots/{slot_id}/move", response_model=FillResponse)
async def move_slot(rid: int, slot_id: int, body: MoveIn,
                    admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    source = db.get(Slot, slot_id)
    if source is None or source.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if slot_id == body.target_slot_id:
        raise HTTPException(400, "目标格不能是自身")
    target = db.get(Slot, body.target_slot_id)
    if target is None or target.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if source.character_id is None:
        raise HTTPException(400, "该格为空")
    # 先在内存态完成 move/swap（autoflush=False，后续校验读的是内存态）
    removed: list[Slot] = []
    if target.character_id is None:
        target.character = source.character
        target.character_id = source.character_id
        target.duty = source.duty
        _clear_slot(source)
        removed.append(source)
    else:
        src_char, src_duty = source.character, source.duty
        tgt_char, tgt_duty = target.character, target.duty
        source.character = tgt_char
        source.character_id = tgt_char.id
        source.duty = tgt_duty
        target.character = src_char
        target.character_id = src_char.id
        target.duty = src_duty
    # 校验：受影响小队组成规则（空小队跳过）+ 同波同玩家
    squads = {(source.wave_id, source.squad_index), (target.wave_id, target.squad_index)}
    warnings: list[str] = []
    try:
        for wid, sq in squads:
            wave = db.get(Wave, wid)
            if _squad_occupied(db, wave, sq):
                warnings += _raise_if_hard(db, wave, sq)
        _validate_one_char_per_wave(db, {source.wave_id, target.wave_id})
    except HTTPException:
        db.rollback()
        raise
    # 版本与审计
    for s in (source, target):
        if s.character_id is not None:
            s.version += 1
            s.updated_by = admin.id
            s.updated_at = _now()
    db.commit()
    db.refresh(source)
    db.refresh(target)
    await manager.broadcast(rid, {"type": "slot:filled", "slot": _slot_out(target).model_dump()})
    if removed:
        await manager.broadcast(rid, {"type": "slot:removed", "slot_id": source.id})
    else:
        await manager.broadcast(rid, {"type": "slot:filled", "slot": _slot_out(source).model_dump()})
    return FillResponse(slot=_slot_out(target), warnings=warnings,
                        removed_slots=[_slot_out(s) for s in removed])
```

- [ ] **Step 5: 跑测试确认通过**

Run: `.venv/bin/python -m pytest tests/test_admin_adjust.py -k "move or swap" -v`
Expected: PASS

- [ ] **Step 6: WS 广播测试**

追加（复用 test_ws.py 的连接方式）：

```python
def test_move_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h1, _ = register_user(client, "mvws", "癸")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                    json={"target_slot_id": sB["id"]})
        types = [ws.receive_json()["type"] for _ in range(2)]
        assert types == ["slot:filled", "slot:removed"]
```

Run: `.venv/bin/python -m pytest tests/test_admin_adjust.py -k "move" -v`
Expected: PASS（含 WS 广播）

- [ ] **Step 7: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/raids.py backend/tests/test_admin_adjust.py
git commit -m "[fet] 新增 slot move 端点：移动/对调 + 组成与同波校验 + WS 广播"
```

---

### Task 4: 后端新增 GET /api/admin/characters

**Files:**
- Modify: `backend/app/schemas.py`（新增 `PlayerCharacters`）
- Modify: `backend/app/routers/auth.py`（新增端点）
- Test: `backend/tests/test_admin_adjust.py`（追加）

- [ ] **Step 1: 写失败测试**

追加：

```python
def test_admin_characters_endpoint(client):
    ah = _admin(client)
    h1, u1 = register_user(client, "ach1", "甲")
    h2, _ = register_user(client, "ach2", "乙")
    c1 = client.post("/api/me/characters", headers=h1, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 52000}).json()
    client.post("/api/me/characters", headers=h2, json={
        "name": "奶", "job_name": "crusader_male", "fame": 1, "buff_amount": 9000})
    # 非管理员 403
    assert client.get("/api/admin/characters", headers=h1).status_code == 403
    # 管理员拿到全量（含甲、乙，跳过无角色的管理员自己/其他无角色用户）
    r = client.get("/api/admin/characters", headers=ah)
    assert r.status_code == 200
    by_nick = {p["user"]["nickname"]: p for p in r.json()}
    assert set(by_nick) >= {"甲", "乙"}
    assert {c["name"] for c in by_nick["甲"]["characters"]} == {"剑魂"}
    assert by_nick["甲"]["user"]["id"] == u1["id"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `.venv/bin/python -m pytest tests/test_admin_adjust.py::test_admin_characters_endpoint -v`
Expected: FAIL（404 无该端点）

- [ ] **Step 3: 实现 schemas**

`backend/app/schemas.py` 在 `CharacterOut` 后新增：

```python
class PlayerCharacters(BaseModel):
    user: UserOut
    characters: list[CharacterOut]
```

（`UserOut` 定义在文件后面，但 Pydantic 模型引用晚定义类名在运行时解析，模块加载完成后再实例化，顺序无关——不过为清晰起见放在 `UserOut` 之后。若无 `UserOut` 已定义则放文件末尾。）

- [ ] **Step 4: 实现 auth.py**

`backend/app/routers/auth.py` 更新导入：

```python
from sqlalchemy import select
...
from ..models import Character, RegistrationCode, User
from ..schemas import CodeCreate, CodeOut, LoginIn, PlayerCharacters, RegisterIn, UserOut
from .members import _character_out
```

在 `list_users` 后追加：

```python
@router.get("/admin/characters", response_model=list[PlayerCharacters])
def list_all_characters(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    result = []
    for u in db.scalars(select(User).order_by(User.nickname)).all():
        chars = db.scalars(select(Character).where(Character.user_id == u.id)
                           .order_by(Character.id)).all()
        if not chars:
            continue  # 过滤无角色玩家
        result.append(PlayerCharacters(user=UserOut.model_validate(u),
                                       characters=[_character_out(c) for c in chars]))
    return result
```

- [ ] **Step 5: 跑测试确认通过**

Run: `.venv/bin/python -m pytest tests/test_admin_adjust.py::test_admin_characters_endpoint -v`
Expected: PASS
再跑全量：`.venv/bin/python -m pytest`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/auth.py backend/tests/test_admin_adjust.py
git commit -m "[fet] 新增 GET /api/admin/characters：管理员浏览全部玩家角色（过滤空角色）"
```

---

### Task 5: 前端 useSlotMove 组合式函数

**Files:**
- Create: `frontend/src/composables/useSlotMove.ts`
- Test: `frontend/src/composables/useSlotMove.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { apiMock } = vi.hoisted(() => ({ apiMock: { post: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock }))

import { useSlotMove } from './useSlotMove'
import type { Slot } from '../types'

function makeSlot(id: number): Slot {
  return { id, squad_index: 0, row_index: 0, character_id: 1, character_name: '剑魂',
    character_class: '输出', job_name: 'weapon_master', job_title: '极诣·剑魂', fame: 1,
    simulated_damage: 2, sustained_dps: 3, buff_amount: null,
    owner_id: 1, owner_nickname: '甲', duty: '主C', version: 1 }
}

beforeEach(() => vi.clearAllMocks())

describe('useSlotMove', () => {
  it('pickUp 记录移动源', () => {
    const { movingSlot, pickUp } = useSlotMove(1, async () => {})
    pickUp(makeSlot(1))
    expect(movingSlot.value?.id).toBe(1)
  })

  it('cancel 清空移动源', () => {
    const { movingSlot, pickUp, cancel } = useSlotMove(1, async () => {})
    pickUp(makeSlot(1))
    cancel()
    expect(movingSlot.value).toBeNull()
  })

  it('moveTo 目标格发起 move 并清空、刷新', async () => {
    const after = vi.fn(async () => {})
    const { movingSlot, pickUp, moveTo } = useSlotMove(7, after)
    pickUp(makeSlot(1))
    apiMock.post.mockResolvedValue({ slot: makeSlot(2), warnings: [], removed_slots: [] })
    await moveTo(makeSlot(2))
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/7/slots/1/move', { target_slot_id: 2 })
    expect(movingSlot.value).toBeNull()
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('moveTo 点源格自身：不发请求、仅取消', async () => {
    const after = vi.fn(async () => {})
    const { pickUp, moveTo } = useSlotMove(7, after)
    pickUp(makeSlot(1))
    await moveTo(makeSlot(1))
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it('moveTo 失败也清空移动源并刷新', async () => {
    const after = vi.fn(async () => {})
    const { movingSlot, pickUp, moveTo } = useSlotMove(7, after)
    pickUp(makeSlot(1))
    apiMock.post.mockRejectedValue(new Error('boom'))
    await expect(moveTo(makeSlot(2))).rejects.toThrow('boom')
    expect(movingSlot.value).toBeNull()
    expect(after).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/able/toys/dnfer/frontend && npm test -- composables/useSlotMove`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```ts
import { ref } from 'vue'
import { api } from '../api/client'
import type { Slot } from '../types'

export interface FillResponse { slot: Slot; warnings: string[]; removed_slots: Slot[] }

export function useSlotMove(rid: number, after: () => Promise<void>) {
  const movingSlot = ref<Slot | null>(null)
  function pickUp(slot: Slot) { movingSlot.value = slot }
  function cancel() { movingSlot.value = null }
  async function moveTo(target: Slot): Promise<FillResponse> {
    const from = movingSlot.value
    if (!from || from.id === target.id) { cancel(); return { slot: target, warnings: [], removed_slots: [] } }
    try {
      return await api.post<FillResponse>(`/api/raids/${rid}/slots/${from.id}/move`, { target_slot_id: target.id })
    } finally {
      cancel()
      await after()
    }
  }
  return { movingSlot, pickUp, cancel, moveTo }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- composables/useSlotMove`
Expected: PASS（5 个）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/composables/useSlotMove.ts frontend/src/composables/useSlotMove.spec.ts
git commit -m "[fet] useSlotMove 组合式函数：移动状态机（拿起/移动/取消/对调）"
```

---

### Task 6: 前端 CharacterPickerModal 管理员模式

**Files:**
- Modify: `frontend/src/types.ts`（新增 `PlayerCharacters`）
- Modify: `frontend/src/components/CharacterPickerModal.vue`
- Test: `frontend/src/components/CharacterPickerModal.spec.ts`（新建）

- [ ] **Step 1: 类型**

`frontend/src/types.ts` 在 `Character` 后新增：

```ts
export interface PlayerCharacters { user: User; characters: Character[] }
```

- [ ] **Step 2: 写失败测试**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CharacterPickerModal from './CharacterPickerModal.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 9, username: 'admin', nickname: '群主', is_admin: true } }),
}))

beforeEach(() => vi.clearAllMocks())

const playerA = { user: { id: 1, username: 'hong', nickname: '小红', is_admin: false },
  characters: [{ id: 11, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 52000, simulated_damage: 5, sustained_dps: 2, buff_amount: null }] }
const mine = { user: { id: 9, username: 'admin', nickname: '群主', is_admin: true },
  characters: [{ id: 12, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 1, simulated_damage: null, sustained_dps: null, buff_amount: 9000 }] }

describe('CharacterPickerModal admin mode', () => {
  it('管理员模式拉全玩家角色，默认选中管理员自己', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, { props: { open: true, adminMode: true } })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/admin/characters')
    // 默认选中管理员自己的角色「奶」
    expect(wrapper.text()).toContain('奶')
    expect(wrapper.text()).toContain('神启·圣骑士')
    expect(wrapper.text()).not.toContain('剑魂')
  })

  it('切换玩家后列出该玩家角色', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, { props: { open: true, adminMode: true } })
    await flushPromises()
    // 沿用仓库既有模式（RaidListView.spec.ts）：通过 Select 组件实例 $emit update:value
    await wrapper.findComponent({ name: 'Select' }).vm.$emit('update:value', playerA.user.id)
    await flushPromises()
    expect(wrapper.text()).toContain('剑魂')
    expect(wrapper.text()).toContain('极诣·剑魂')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -- components/CharacterPickerModal`
Expected: FAIL（无管理员模式）

- [ ] **Step 4: 实现**

重写 `frontend/src/components/CharacterPickerModal.vue` 的 `<script setup>` 部分：

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { NModal, NSelect } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { defaultDuty, dutyOptions } from '../lib/duty'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character, Duty, PlayerCharacters } from '../types'

const props = defineProps<{ open: boolean; adminMode?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', c: Character, duty: Duty): void }>()
const auth = useAuthStore()
const characters = ref<Character[]>([])
const players = ref<PlayerCharacters[]>([])
const playerId = ref<number | null>(null)
const selected = ref<Character | null>(null)
const duty = ref<Duty>('主C')

watch(() => props.open, async (open) => {
  if (!open) { selected.value = null; return }
  if (props.adminMode) {
    players.value = await api.get<PlayerCharacters[]>('/api/admin/characters')
    const mine = players.value.find(p => p.user.id === auth.user?.id) ?? players.value[0]
    playerId.value = mine?.user.id ?? null
    characters.value = mine?.characters ?? []
  } else {
    characters.value = await api.get<Character[]>('/api/me/characters')
  }
}, { immediate: true })

function onPlayerChange(id: number) {
  playerId.value = id
  selected.value = null
  characters.value = players.value.find(p => p.user.id === id)?.characters ?? []
}
function choose(c: Character) { selected.value = c; duty.value = defaultDuty(c.class_type) }
function confirmPick() { if (selected.value) emit('select', selected.value, duty.value) }
const playerOptions = computed(() => players.value.map(p => ({
  label: `${p.user.nickname}（${p.user.username}）`, value: p.user.id })))
const options = computed(() =>
  selected.value ? dutyOptions(selected.value.class_type).map(v => ({ label: v, value: v })) : [])
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>
```

模板：在角色列表 `<div v-for="c in characters" ...>` 之前插入玩家选择器：

```vue
    <div style="max-height:60vh;overflow:auto">
      <n-select v-if="adminMode" class="player-select" size="small" filterable
                :options="playerOptions" :value="playerId"
                @update:value="onPlayerChange" placeholder="选择玩家"
                style="margin-bottom:10px" />
      <div v-for="c in characters" :key="c.id" class="char-pick"
           :class="{ active: selected?.id === c.id }" @click="choose(c)">
```

空态文案保持：普通模式 `v-if="!characters.length"` →「还没有角色，去「我的角色」添加」；管理员模式可在 players 为空时显示「还没有任何玩家有角色」——为简单起见两种都复用现有 `v-if="!characters.length"` 段落即可（管理员模式选中玩家必有角色，因接口已过滤）。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- components/CharacterPickerModal`
Expected: PASS（2 个）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/types.ts frontend/src/components/CharacterPickerModal.vue frontend/src/components/CharacterPickerModal.spec.ts
git commit -m "[fet] 选人弹窗管理员模式：玩家选择器 + 全玩家角色浏览"
```

---

### Task 7: 前端 SlotCell 管理员交互 + SlotActionModal + WaveSection 透传

**Files:**
- Modify: `frontend/src/components/SlotCell.vue`
- Create: `frontend/src/components/SlotActionModal.vue`
- Modify: `frontend/src/components/WaveSection.vue`
- Modify: `frontend/src/styles/dnf.css`
- Test: `frontend/src/components/SlotCell.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlotCell from './SlotCell.vue'
import type { Slot } from '../types'

function occupied(id: number): Slot {
  return { id, squad_index: 0, row_index: 0, character_id: 1, character_name: '剑魂',
    character_class: '输出', job_name: 'weapon_master', job_title: '极诣·剑魂', fame: 1,
    simulated_damage: 2, sustained_dps: 3, buff_amount: null,
    owner_id: 1, owner_nickname: '甲', duty: '主C', version: 1 }
}
function empty(id: number): Slot {
  return { id, squad_index: 0, row_index: 0, character_id: null, character_name: null,
    character_class: null, job_name: null, job_title: null, fame: null,
    simulated_damage: null, sustained_dps: null, buff_amount: null,
    owner_id: null, owner_nickname: null, duty: null, version: 0 }
}

describe('SlotCell admin interactions', () => {
  it('管理员点击已占位格 emit manage', async () => {
    const s = occupied(1)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: false, isAdmin: true } })
    await wrapper.find('.slot-cell').trigger('click')
    expect(wrapper.emitted('manage')?.[0][0].id).toBe(1)
  })

  it('非管理员点击已占位格不 emit manage', async () => {
    const s = occupied(1)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: false, isAdmin: false } })
    await wrapper.find('.slot-cell').trigger('click')
    expect(wrapper.emitted('manage')).toBeUndefined()
  })

  it('移动态下点击任意格 emit moveTo', async () => {
    const s = empty(2)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 1, editable: true, pickable: true, isAdmin: true, moveMode: true } })
    await wrapper.find('.slot-cell').trigger('click')
    expect(wrapper.emitted('moveTo')?.[0][0].id).toBe(2)
  })

  it('移动源格显示「移动中」且点击 emit moveTo（由组合式函数处理取消）', async () => {
    const s = occupied(1)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: false, isAdmin: true, moveMode: true, moving: true } })
    expect(wrapper.text()).toContain('移动中')
    await wrapper.find('.slot-cell').trigger('click')
    expect(wrapper.emitted('moveTo')?.[0][0].id).toBe(1)
  })

  it('移动态下占位格点击 emit moveTo 而非 pick', async () => {
    const s = empty(3)
    const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: true, pickable: true, isAdmin: true, moveMode: true } })
    await wrapper.find('.slot-cell').trigger('click')
    expect(wrapper.emitted('pick')).toBeUndefined()
    expect(wrapper.emitted('moveTo')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- components/SlotCell`
Expected: FAIL（无 manage/moveTo 事件）

- [ ] **Step 3: 实现 SlotCell.vue**

`<script setup>` 改为：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Slot } from '../types'
import DutySelect from './DutySelect.vue'

const props = defineProps<{
  slot: Slot
  squadIndex: number
  editable: boolean
  pickable: boolean
  isAdmin?: boolean
  moveMode?: boolean
  moving?: boolean
}>()
const emit = defineEmits<{
  (e: 'pick', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'remove', slot: Slot): void
  (e: 'manage', slot: Slot): void
  (e: 'moveTo', slot: Slot): void
}>()

const occupied = computed(() => props.slot.character_id != null)
const manageable = computed(() => occupied.value && !!props.isAdmin && !props.moveMode)
const isMoving = computed(() => !!props.moveMode && !!props.moving)

function onCellClick() {
  if (props.moveMode) { emit('moveTo', props.slot); return }
  if (manageable.value) emit('manage', props.slot)
}
const attrs = computed(() => {
  const s = props.slot
  if (s.character_class === '输出') return `模拟 ${fmtDps(s.simulated_damage)} · 秒伤 ${fmtDps(s.sustained_dps)}`
  if (s.character_class === '辅助') return `增益 ${fmtBuff(s.buff_amount)}`
  return ''
})
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>
```

模板根元素加 class 与点击：

```vue
  <div class="slot-cell" :class="[
    { occupied, pickable, empty: !occupied && !pickable, manageable, 'move-target': moveMode && !isMoving, moving: isMoving },
    `squad-${squadIndex}`,
  ]" @click="onCellClick">
    <template v-if="occupied">
      <span v-if="isMoving" class="moving-badge">移动中</span>
      <div>
        <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
        <span style="color:var(--dnf-text-muted);font-size:12px">（{{ slot.character_name }}）</span>
        <img v-if="slot.job_name" :src="jobIcon(slot.job_name)" @error="onIconError"
             style="width:20px;height:20px;margin-left:6px;vertical-align:middle">
        <span v-if="slot.job_title" style="color:var(--dnf-text-muted);font-size:12px;margin-left:6px">{{ slot.job_title }}</span>
        <DutySelect v-if="editable" :class-type="slot.character_class!" :model-value="slot.duty"
                    @update:model-value="(d) => emit('duty', slot, d)" />
        <span v-else class="dnf-badge" style="font-size:11px;color:var(--dnf-gold-hi);border-color:var(--dnf-gold-deep)">{{ slot.duty }}</span>
      </div>
      <div style="color:var(--dnf-text-faint);font-size:12px;margin-top:2px">
        {{ attrs }}
        <a v-if="editable" href="#" style="margin-left:8px;color:var(--dnf-danger)"
           @click.prevent="emit('remove', slot)">撤下</a>
      </div>
    </template>
    <button v-else-if="pickable" class="pick-btn" @click.stop="emit('pick', slot)">＋ 点击占位</button>
    <span v-else>—</span>
  </div>
```

注意：占位按钮 `@click.stop` 阻止冒泡到根，避免移动态下点空格同时触发根 moveTo。移动态下空格没有 pick 按钮（仍显示按钮但点它走根 moveTo）——为清晰，移动态下 `pickable` 传 false（由调用方 WaveSection 控制），空格显示「—」但整格可点。

- [ ] **Step 4: 实现 SlotActionModal.vue**

```vue
<script setup lang="ts">
import { NModal } from 'naive-ui'
import type { Slot } from '../types'

const props = defineProps<{ open: boolean; slot: Slot | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'replace', s: Slot): void
  (e: 'pickUp', s: Slot): void
  (e: 'remove', s: Slot): void
}>()
</script>

<template>
  <n-modal :show="open" preset="card" title="角色操作" style="width:min(340px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div v-if="slot" style="margin-bottom:12px;color:var(--dnf-text-muted)">
      <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
      （{{ slot.character_name }} · {{ slot.duty }}）
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="dnf-btn" @click="slot && emit('replace', slot)">换人</button>
      <button class="dnf-btn" @click="slot && emit('pickUp', slot)">拿起移动</button>
      <button class="dnf-btn dnf-btn-danger" @click="slot && emit('remove', slot)">撤下</button>
    </div>
    <template #footer>
      <div style="display:flex;justify-content:flex-end">
        <button class="dnf-btn" @click="emit('close')">关闭</button>
      </div>
    </template>
  </n-modal>
</template>
```

- [ ] **Step 5: 实现 WaveSection.vue 透传**

`props` 增加：

```ts
const props = defineProps<{
  wave: Wave
  editable: boolean
  isAdmin: boolean
  canDelete: boolean
  currentUserId: number | null
  moveMode?: boolean
  movingSlotId?: number | null
}>()
```

`emit` 增加 `manage`、`moveTo`：

```ts
const emit = defineEmits<{
  (e: 'pick', slot: any): void
  (e: 'duty', slot: any, duty: string): void
  (e: 'remove', slot: any): void
  (e: 'deleteWave', index: number): void
  (e: 'manage', slot: any): void
  (e: 'moveTo', slot: any): void
}>()
```

`SlotCell` 绑定更新：

```vue
<SlotCell v-for="slot in g" :key="slot.id" :slot="slot" :squad-index="i"
          :editable="editable && (isAdmin || slot.owner_id === currentUserId)"
          :pickable="editable && slot.character_id == null && !moveMode"
          :is-admin="isAdmin" :move-mode="moveMode" :moving="slot.id === movingSlotId"
          @pick="emit('pick', $event)" @duty="(s, d) => emit('duty', s, d)"
          @remove="emit('remove', $event)" @manage="emit('manage', $event)"
          @moveTo="emit('moveTo', $event)" />
```

- [ ] **Step 6: 样式**

`frontend/src/styles/dnf.css` 在 `.slot-cell.empty` 后追加：

```css
.slot-cell.manageable { cursor: pointer; }
.slot-cell.manageable:hover { border-color: var(--dnf-gold-hi); box-shadow: 0 0 0 1px var(--dnf-gold-hi); }
.slot-cell.move-target { cursor: copy; }
.slot-cell.move-target:hover { border-color: var(--dnf-gold-hi); box-shadow: 0 0 0 1px var(--dnf-gold-hi); }
.slot-cell.moving { border-color: var(--dnf-gold-hi); box-shadow: 0 0 8px rgba(212,165,60,.6); cursor: not-allowed; }
.moving-badge { display:inline-block; color: var(--dnf-gold-hi); font-size: 11px; border: 1px solid var(--dnf-gold-deep); padding: 0 4px; border-radius: 4px; }
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npm test -- components/SlotCell`
Expected: PASS（5 个）

- [ ] **Step 8: 提交**

```bash
git add frontend/src/components/SlotCell.vue frontend/src/components/SlotActionModal.vue frontend/src/components/WaveSection.vue frontend/src/styles/dnf.css frontend/src/components/SlotCell.spec.ts
git commit -m "[fet] 格子管理员交互：点击已占位格弹操作菜单、移动态高亮可落格"
```

---

### Task 8: 前端 RaidDetailView 集成

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`

- [ ] **Step 1: 实现脚本改动**

`<script setup>` 顶部导入与状态：

```ts
import SlotActionModal from '../components/SlotActionModal.vue'
import { useSlotMove } from '../composables/useSlotMove'
```

```ts
const pickSlot = ref<Slot | null>(null)
const manageSlot = ref<Slot | null>(null)
const { movingSlot, pickUp, cancel, moveTo } = useSlotMove(rid, load)

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && movingSlot.value) cancel() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => { disconnect?.(); window.removeEventListener('keydown', onKeydown) })
```

现有 `onBeforeUnmount(() => disconnect?.())` 改为上面的合并版本。

处理器：

```ts
function onManage(slot: Slot) { manageSlot.value = slot }
function onReplace(slot: Slot) { manageSlot.value = null; pickSlot.value = slot }
function onPickUp(slot: Slot) { manageSlot.value = null; pickUp(slot) }
function onRemoveFromMenu(slot: Slot) { manageSlot.value = null; void onRemove(slot) }
async function onMoveTo(target: Slot) {
  try {
    const r = await moveTo(target)
    if (r.warnings.length) notifyWarning(r.warnings.join('；'))
  } catch (e: any) { notifyError(e.message) }
}
```

- [ ] **Step 2: 模板改动**

`WaveSection` 调用处加透传与事件：

```vue
<WaveSection v-for="w in store.raid.waves" :key="w.id"
             :wave="w" :editable="editable" :is-admin="auth.isAdmin"
             :can-delete="auth.isAdmin || (store.raid.waves.length > 1)"
             :current-user-id="auth.user?.id ?? null"
             :move-mode="movingSlot != null" :moving-slot-id="movingSlot?.id ?? null"
             @pick="onPick" @duty="onDuty" @remove="onRemove"
             @delete-wave="onDeleteWave" @manage="onManage" @moveTo="onMoveTo" />
```

移动提示条（页面头部按钮组之后）与操作菜单、选人弹窗：

```vue
    <div v-if="movingSlot" class="move-hint" style="display:flex;align-items:center;gap:10px;margin:10px 0">
      <span style="color:var(--dnf-gold-hi)">移动中：{{ movingSlot.owner_nickname }}（{{ movingSlot.character_name }}）→ 点击目标格</span>
      <button class="dnf-btn dnf-btn-sm" @click="cancel()">取消移动（Esc）</button>
    </div>
```

```vue
    <SlotActionModal :open="manageSlot != null" :slot="manageSlot"
                     @close="manageSlot = null" @replace="onReplace"
                     @pickUp="onPickUp" @remove="onRemoveFromMenu" />

    <CharacterPickerModal :open="pickSlot != null" :admin-mode="auth.isAdmin"
                          @close="pickSlot = null" @select="onSelectCharacter" />
```

- [ ] **Step 3: 类型检查 + 全量前端测试**

Run: `cd /Users/able/toys/dnfer/frontend && npm run build`
Expected: 构建通过（vue-tsc 无类型错误 + vite build）
Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/RaidDetailView.vue
git commit -m "[fet] 排表页集成管理员站位调整：操作菜单 + 移动状态机 + Esc 取消"
```

---

### Task 9: 全量验证

- [ ] **Step 1: 后端全量测试**

Run: `cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest`
Expected: 全部 PASS（含新增 test_admin_adjust.py 与既有测试无回归）

- [ ] **Step 2: 前端全量测试 + 构建**

Run: `cd /Users/able/toys/dnfer/frontend && npm test && npm run build`
Expected: 全部 PASS + 构建成功

- [ ] **Step 3: 人工冒烟（可选）**

`docker compose up --build` 或本地起前后端，以管理员登录进入排表页手动验证：
1. 管理员点已占位格 → 弹「换人/拿起移动/撤下」
2. 换人 → 选人弹窗玩家选择器可见、可选中他玩家角色替换
3. 拿起 → 目标格高亮 → 点空格搬移、点占位格对调（跨波次也可）
4. Esc / 点源格取消移动
5. 管理员放置/移动后，该玩家本人仍可撤下/改职责自己角色
6. 普通玩家视角交互与原先一致

- [ ] **Step 4: 更新 CHANGELOG**

`CHANGELOG.md` 追加 v1.4 记录（可选，若仓库当前约定如此），格式参照现有条目。

- [ ] **Step 5: 提交（如有改动）**

```bash
git add CHANGELOG.md
git commit -m "[docs] 新增 CHANGELOG，v1.4 版本记录"
```
