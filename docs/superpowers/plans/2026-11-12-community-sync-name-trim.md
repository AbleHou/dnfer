# 社区同步角色名首尾去空格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 社区同步时对社区获取的角色名做首尾去空白（含全角空格），空名跳过，再用于比对与录入。

**Architecture:** 仅动 `backend/app/services/community_sync.py`：新增 `_trim_role_name` 纯函数（`re.sub(r"^\s+|\s+$", "", ...)` 覆盖全部 Unicode 空白）；`_base_result` 增加必填 `role_name` 参数（3 个调用点全在本模块，已确认无外部引用）；`_process_one` 去空后判空跳过（放在职业解析之前），匹配/创建统一用去空后的名字；`_process_roles` 异常分支同样透传去空名。前端与 sibling 项目零改动。

**Tech Stack:** Python / FastAPI / SQLAlchemy 2 / pytest（后端 venv `backend/.venv`）。

---

### Task 1: 角色名首尾去空白 + 空名跳过

**Files:**
- Modify: `backend/app/services/community_sync.py:94-155`（`_base_result`、`_process_one`、`_process_roles` 异常分支 ~151）
- Test: `backend/tests/test_community_sync.py`

- [ ] **Step 1: 写失败测试（4 例）**

在 `tests/test_community_sync.py` 末尾追加（复用既有 `_executor`/`_mk_task`/monkeypatch 模式）：

```python
def test_run_trims_role_name_whitespace(client, db, monkeypatch):
    h, u = register_user(client, "csTrim", "同步空边")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": "  剑魂  ", "job": "极诣·剑魂", "fame": 100}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    char = db.query(Character).filter(Character.user_id == u["id"]).first()
    assert char.name == "剑魂"
    task = db.get(CommunitySyncTask, task_id)
    assert task.result["roles"][0]["action"] == "created"
    assert task.result["roles"][0]["roleName"] == "剑魂"


def test_run_trims_fullwidth_space(client, db, monkeypatch):
    h, u = register_user(client, "csTrimFw", "同步全角")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": "\u3000剑魂\u3000", "job": "极诣·剑魂", "fame": 100}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    char = db.query(Character).filter(Character.user_id == u["id"]).first()
    assert char.name == "剑魂"


def test_run_skips_empty_name(client, db, monkeypatch):
    h, u = register_user(client, "csTrimEmpty", "同步空名")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": "   ", "job": "极诣·剑魂", "fame": 100}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "success"
    assert task.result["roles"][0]["action"] == "skipped"
    assert task.result["roles"][0]["reason"] == "角色名为空"
    assert db.query(Character).filter(Character.user_id == u["id"]).count() == 0


def test_run_trims_matches_updated(client, db, monkeypatch):
    h, u = register_user(client, "csTrimUpd", "同步更新")
    db.add(Character(user_id=u["id"], name="剑魂", job_name="crusader_female",
                     class_type="辅助", fame=100))
    db.commit()
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": " 剑魂 ", "job": "极诣·剑魂", "fame": 200}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    chars = db.query(Character).filter(Character.user_id == u["id"]).all()
    assert len(chars) == 1          # 去空后命中既有角色，不重复新建
    assert chars[0].fame == 200
    task = db.get(CommunitySyncTask, task_id)
    assert task.result["roles"][0]["action"] == "updated"
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v
```

Expected: 4 个新测试失败——去空前 `"  剑魂  "` 会创建带空格名字的角色，断言 `char.name == "剑魂"` 失败；全角空格 `\u3000` 原样入库失败；全空格 `"   "` 会创建空名角色而非跳过；`" 剑魂 "` 查不到 `剑魂` 会新建（`len(chars) == 1` 失败）。

- [ ] **Step 3: 实现**

`backend/app/services/community_sync.py` 修改 4 处：

① `_base_result` 增加必填 `role_name` 参数：

```python
def _base_result(role: dict, role_name: str) -> dict:
    return {"roleName": role_name, "job": role.get("job") or None,
            "level": role.get("level"), "fame": role.get("fame"), "server": role.get("server")}
```

② 新增 `_trim_role_name` 纯函数（放在 `_base_result` 上方）：

```python
def _trim_role_name(role_name: str) -> str:
    """社区角色名去首尾空白（含全角空格等 Unicode 空白），不动中间。"""
    return re.sub(r"^\s+|\s+$", "", role_name)
```

③ `_process_one` 开头去空 + 空名跳过（放在 `resolve_job` 之前），并给各返回透传 `role_name`：

```python
def _process_one(db, user: User, community_id: str, role: dict) -> dict:
    role_name = _trim_role_name(role.get("roleName") or "")
    fame = role.get("fame")
    if not role_name:
        return {**_base_result(role, role_name), "jobName": None, "action": "skipped",
                "reason": "角色名为空", "characterId": None, "profileImported": False}
    job_name = resolve_job(role.get("job") or "")
    if job_name is None:
        return {**_base_result(role, role_name), "jobName": None, "action": "skipped",
                "reason": "职业未收录", "characterId": None, "profileImported": False}
    # ... 原有匹配/创建/更新逻辑不变，都用去空后的 role_name
    return {**_base_result(role, role_name), "jobName": job_name, "action": action,
            "characterId": c.id, "profileImported": profile_ok}
```

④ `_process_roles` 异常分支同步透传去空名：

```python
r = {**_base_result(role, _trim_role_name(role.get("roleName") or "")),
     "jobName": None, "action": "failed", "reason": str(e),
     "characterId": None, "profileImported": False}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v
```

Expected: 全部通过（含原有 11 例，无回归）。

- [ ] **Step 5: 全量后端测试确认无回归**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest -v
```

Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
cd /Users/able/toys/dnfer
git add backend/app/services/community_sync.py backend/tests/test_community_sync.py
git commit -m "$(cat <<'EOF'
[feat] 社区同步角色名首尾去空白后比对录入，空名跳过

社区返回的角色名可能带首尾空格（历史昵称允许空格），去空白
（含全角空格）后再用于匹配与创建；全空格名跳过标记「角色名为空」。

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```
