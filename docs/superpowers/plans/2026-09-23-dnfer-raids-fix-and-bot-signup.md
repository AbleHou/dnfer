# dnfer-raids skill 修复 + 机器人报名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 dnfer-raids skill 两个 bug（时间偏移 +8、选团不优先未锁定），并为机器人新增「替玩家报名/取消报名」能力。

**Architecture:** 后端 `bot.py`（前缀 `/api/public`，API Token 鉴权）新增 2 个端点替指定用户（account|nickname）报名/取消；脚本 `dnfer_raid.py` 删除对库值的 +8 转换（`starts_at` 即本地时间）、`pick` 选团改未锁定优先、新增 `signup`/`unsign` 子命令（选团规则：下一次团优先、当天未锁定回退）。

**Tech Stack:** FastAPI / SQLAlchemy 2 / SQLite（后端），Python stdlib（脚本，零依赖）。

**Spec:** `docs/superpowers/specs/2026-09-23-dnfer-raids-fix-and-bot-signup-design.md`

---

## 仓库约定（重要）

- 提交直接到 main（不做 worktree）。提交信息 `[feat]/[fix]/[docs]/[test]` 风格 + 中文描述 + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。
- 后端测试：`cd backend && .venv/bin/python -m pytest <file> -v`
- 脚本测试（放 backend/tests 复用同一 harness）：`cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
- 不涉及前端，无需 `npm run build`；但改动后端后跑全量后端测试：`cd backend && .venv/bin/python -m pytest -q`

---

## 文件结构

**后端**
- Modify: `backend/app/schemas.py` — 新增 `BotSignupIn`
- Modify: `backend/app/routers/bot.py` — 新增 2 端点 + import
- Create: `backend/tests/test_bot_raid_signup.py`

**脚本（skill）**
- Modify: `skills/dnfer-raids/scripts/dnfer_raid.py` — Bug1/Bug2 + `signup`/`unsign` + `_pick_signup_target`
- Create: `backend/tests/test_dnfer_raid_script.py`（importlib 加载脚本）

**文档**
- Modify: `skills/dnfer-raids/SKILL.md`
- Modify: `skills/dnfer-raids/README.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

---

### Task 1: 后端 — `BotSignupIn` schema + 报名端点

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/bot.py`
- Test: `backend/tests/test_bot_raid_signup.py`（新）

- [ ] **Step 1: 写失败的测试**

新建 `backend/tests/test_bot_raid_signup.py`：

```python
from .helpers import make_raid, register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_bot_signup_requires_token(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/public/raids/{rid}/signup",
                       json={"account": "x"}).status_code == 401
    assert client.post(f"/api/public/raids/{rid}/signup",
                       headers={"Authorization": "Bearer wrong"},
                       json={"account": "x"}).status_code == 401


def test_bot_signup_by_account(client):
    ah = _admin(client)
    h, u = register_user(client, "sig1", "甲")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                    json={"account": "sig1"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["user"]["id"] == u["id"]
    assert body["raid"]["id"] == rid
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert any(s["user"]["id"] == u["id"] for s in detail["signups"])


def test_bot_signup_by_nickname(client):
    ah = _admin(client)
    h, u = register_user(client, "sig2", "乙")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                    json={"nickname": "乙"})
    assert r.status_code == 200
    assert r.json()["user"]["id"] == u["id"]


def test_bot_signup_duplicate(client):
    ah = _admin(client)
    h, u = register_user(client, "sig3", "丙")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN, json={"account": "sig3"})
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN, json={"account": "sig3"})
    assert r.status_code == 400
    assert r.json()["detail"] == "该用户已报名"


def test_bot_signup_locked(client):
    ah = _admin(client)
    h, u = register_user(client, "sig4", "丁")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN, json={"account": "sig4"})
    assert r.status_code == 400
    assert r.json()["detail"] == "攻坚已锁定，无法报名"


def test_bot_signup_creator_blocked(client):
    ah = _admin(client)
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    admin_id = login.json()["user"]["id"]
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                    json={"account": "admin"})
    assert r.status_code == 400
    assert r.json()["detail"] == "团长无需报名"


def test_bot_signup_user_not_found(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                    json={"account": "nobody"})
    assert r.status_code == 404
    assert r.json()["detail"] == "账号或昵称不存在"


def test_bot_signup_body_requires_exactly_one(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                       json={}).status_code == 422
    assert client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                       json={"account": "a", "nickname": "b"}).status_code == 422


def test_bot_signup_raid_404(client):
    assert client.post("/api/public/raids/99999/signup", headers=TOKEN,
                       json={"account": "x"}).status_code == 404


def test_bot_signup_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h, u = register_user(client, "sigws1", "甲")
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN,
                           json={"account": "sigws1"}).status_code == 200
        ev = ws.receive_json()
        assert ev["type"] == "raid:signup"
        assert ev["user"]["id"] == u["id"]
        assert ev["created_at"]
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_raid_signup.py -v`
Expected: FAIL（`POST /api/public/raids/{rid}/signup` 404/405，`BotSignupIn` 不存在）

- [ ] **Step 3: 实现 schema**

`backend/app/schemas.py` 末尾（`BotRegisterIn` 之后）新增：

```python
class BotSignupIn(BaseModel):
    account: str | None = Field(default=None, min_length=1, max_length=64)
    nickname: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def _exactly_one_identity(self):
        if (self.account is None) == (self.nickname is None):
            raise ValueError("account 与 nickname 必须恰好提供一个")
        return self
```

`schemas.py` 已 import `BaseModel, ConfigDict, Field, model_validator`（`model_validator` 第 4 行已存在），无需新增 import。

- [ ] **Step 4: 实现报名端点**

`backend/app/routers/bot.py`：

（a）顶部 import 追加：

```python
from ..models import Character, RaidSignup, User
from ..schemas import (BotCharacterList, BotCharacterResult, BotCharactersIn,
                       BotCharactersOut, BotRegisterIn, BotSignupIn, UserOut)
from ..routers.raids import _raid_or_404, _remove_signup
from ..ws import manager
```

（b）在 `register` 端点后新增：

```python
@router.post("/raids/{rid}/signup")
async def bot_signup(rid: int, body: BotSignupIn, db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    user = _get_user(db, body.account, body.nickname)
    if user.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if raid.locked:
        raise HTTPException(400, "攻坚已锁定，无法报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first():
        raise HTTPException(400, "该用户已报名")
    rs = RaidSignup(raid_id=rid, user_id=user.id)
    db.add(rs)
    try:
        db.commit()
    except IntegrityError:  # 并发重复报名兜底
        db.rollback()
        raise HTTPException(400, "该用户已报名")
    db.refresh(rs)
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(user).model_dump(),
                                  "created_at": rs.created_at.isoformat()})
    return {"ok": True,
            "user": UserOut.model_validate(user).model_dump(),
            "raid": {"id": raid.id, "name": raid.name,
                     "starts_at": raid.starts_at.isoformat()}}
```

注意：`_remove_signup` 在本 Task 未用到但下一 Task 用，import 可留待 Task 2 再加（避免未使用告警）。若本步想精简，可只在 import 处加 `_raid_or_404`，`_remove_signup` 等到 Task 2 再加。

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_raid_signup.py -v`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/bot.py backend/tests/test_bot_raid_signup.py
git commit -m "$(cat <<'EOF'
feat: 机器人替玩家报名端点 POST /api/public/raids/{rid}/signup

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 后端 — 取消报名端点

**Files:**
- Modify: `backend/app/routers/bot.py`
- Test: `backend/tests/test_bot_raid_signup.py`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_bot_raid_signup.py` 末尾追加：

```python
def _mkchar(client, h, name="C", job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]


def test_bot_cancel_removes_placements(client):
    ah = _admin(client)
    h, u = register_user(client, "sig5", "戊")
    cid = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN, json={"account": "sig5"})
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid})
    r = client.post(f"/api/public/raids/{rid}/signup/cancel", headers=TOKEN,
                    json={"account": "sig5"})
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) == 1  # 仅剩团长固定行
    assert all(s["character_id"] is None for s in detail["waves"][0]["slots"])


def test_bot_cancel_not_signed_up(client):
    ah = _admin(client)
    h, u = register_user(client, "sig6", "己")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/public/raids/{rid}/signup/cancel", headers=TOKEN,
                    json={"account": "sig6"})
    assert r.status_code == 400
    assert r.json()["detail"] == "该用户尚未报名"


def test_bot_cancel_locked_blocked(client):
    ah = _admin(client)
    h, u = register_user(client, "sig7", "庚")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/public/raids/{rid}/signup", headers=TOKEN, json={"account": "sig7"})
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.post(f"/api/public/raids/{rid}/signup/cancel", headers=TOKEN,
                    json={"account": "sig7"})
    assert r.status_code == 403
    assert r.json()["detail"] == "攻坚已锁定，无法取消报名"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_raid_signup.py -k cancel -v`
Expected: FAIL（`/signup/cancel` 404）

- [ ] **Step 3: 实现取消端点**

`backend/app/routers/bot.py` import 追加 `_remove_signup`（若 Task 1 未加）：

```python
from ..routers.raids import _raid_or_404, _remove_signup
```

在 `bot_signup` 后新增：

```python
@router.post("/raids/{rid}/signup/cancel")
async def bot_cancel_signup(rid: int, body: BotSignupIn, db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    user = _get_user(db, body.account, body.nickname)
    if raid.locked:
        raise HTTPException(403, "攻坚已锁定，无法取消报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first() is None:
        raise HTTPException(400, "该用户尚未报名")
    await _remove_signup(db, raid, user.id)
    return {"ok": True,
            "user": UserOut.model_validate(user).model_dump(),
            "raid": {"id": raid.id, "name": raid.name,
                     "starts_at": raid.starts_at.isoformat()}}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_raid_signup.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/bot.py backend/tests/test_bot_raid_signup.py
git commit -m "$(cat <<'EOF'
feat: 机器人替玩家取消报名端点 POST /api/public/raids/{rid}/signup/cancel

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 脚本 — Bug1 时间口径修复 + 测试基座

**Files:**
- Modify: `skills/dnfer-raids/scripts/dnfer_raid.py`
- Create: `backend/tests/test_dnfer_raid_script.py`

- [ ] **Step 1: 建脚本测试基座并写失败测试**

新建 `backend/tests/test_dnfer_raid_script.py`：

```python
"""dnfer_raid.py 纯函数单测（importlib 加载 skill 脚本，零依赖）。"""
import importlib.util
from datetime import datetime
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "dnfer-raids" / "scripts" / "dnfer_raid.py"
_spec = importlib.util.spec_from_file_location("dnfer_raid", _SCRIPT)
dnfer_raid = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dnfer_raid)


def _raid(id_, starts_at, locked=False):
    return {"id": id_, "name": f"团{id_}", "starts_at": starts_at, "locked": locked}


def test_parse_iso_local_no_offset():
    # Bug 1：starts_at 即本地时间，直接解析展示，不得 +8 变 22:00
    out = dnfer_raid._fmt_local(dnfer_raid._parse_iso("2026-09-26T14:00:00"))
    assert out == "2026-09-26 14:00 周六"


def test_raids_starts_at_local_is_local():
    raids = [_raid(1, "2026-09-26T14:00:00")]
    # 模拟 cmd_raids 的 starts_at_local 计算（本地直读）
    assert dnfer_raid._fmt_local(dnfer_raid._parse_iso(raids[0]["starts_at"])) == "2026-09-26 14:00 周六"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
Expected: FAIL（当前脚本 `_parse_iso` 后展示为 `2026-09-26 22:00 周六`）

- [ ] **Step 3: 修改脚本（Bug1）**

`skills/dnfer-raids/scripts/dnfer_raid.py`：

（a）删除 `_to_local` 函数：

```python
def _to_local(dt_utc: datetime) -> datetime:
    return dt_utc + TZ_OFFSET
```
（整段删除）

（b）替换全部 `_to_local(_parse_iso(...))` 为 `_parse_iso(...)`，共 4 处：
- `_pick_core` 内：`items = [{"raid": r, "dt": _to_local(_parse_iso(r["starts_at"]))} for r in raids]` → `items = [{"raid": r, "dt": _parse_iso(r["starts_at"])} for r in raids]`
- `cmd_raids` 内：`r["starts_at_local"] = _fmt_local(_to_local(_parse_iso(r["starts_at"])))` → `r["starts_at_local"] = _fmt_local(_parse_iso(r["starts_at"]))`
- `cmd_pick` 内：`_to_local(_parse_iso(out["selected"]["starts_at"]))` → `_parse_iso(out["selected"]["starts_at"])`
- `cmd_detail` 内：`"starts_at": _fmt_local(_to_local(_parse_iso(raid["starts_at"]))),` → `"starts_at": _fmt_local(_parse_iso(raid["starts_at"])),`

（c）更新注释/文档串（去掉「naive UTC」假设）：
- 文件头 docstring 的时区行改为：
  ```
  时区：后端 starts_at 存的是本地时间（前端直传 naive 本地串，如 2026-09-26T14:00:00），
  脚本按本地时间直接读取、比较与展示；`_now_local` 取当前中国本地时间（UTC+8）用于匹配。
  ```
- `_now_local` 内部注释 `# 服务器存 naive UTC，取当前 UTC 再转 +8 得到本地 naive` 改为 `# 当前中国本地时间（UTC+8 固定，无夏令时），用于与库值（本地时间）比较`。
- `cmd_pick` 选中团处注释 `# 与 raids/detail 一致：给选中团补 +8 本地时间，模型直接回显，不用裸 UTC` 改为 `# 与 raids/detail 一致：给选中团补本地时间展示串，模型直接回显`。

（d）`_now_local()` 实现保持不动（已返回中国本地当前时间）；`TZ_OFFSET` 常量**必须保留**（`_now_local` 仍引用它），只删 `_to_local` 函数。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
Expected: PASS

- [ ] **Step 5: 冒烟（可选，需后端在跑）**

若后端已启动：`cd skills/dnfer-raids && DNFER_API_TOKEN=<token> python scripts/dnfer_raid.py pick`，stderr 摘要应显示本地时间（不再偏 8 小时）。

- [ ] **Step 6: 提交**

```bash
git add skills/dnfer-raids/scripts/dnfer_raid.py backend/tests/test_dnfer_raid_script.py
git commit -m "$(cat <<'EOF'
fix: dnfer-raids skill 时间口径——starts_at 即本地时间，去掉 +8 偏移

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 脚本 — Bug2 pick 未锁定优先

**Files:**
- Modify: `skills/dnfer-raids/scripts/dnfer_raid.py`
- Test: `backend/tests/test_dnfer_raid_script.py`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_dnfer_raid_script.py` 末尾追加：

```python
def test_pick_prefers_unlocked_over_closer_locked():
    now = datetime(2026, 9, 21, 10, 0)  # 周一
    raids = [
        _raid(1, "2026-09-20T14:00:00", locked=True),  # 昨天（周日）已锁定，离当前最近
        _raid(2, "2026-09-26T14:00:00"),               # 下周六未锁定
    ]
    sel, meta = dnfer_raid._pick_core(raids, None, None, None, None, now)
    assert sel["id"] == 2
    assert meta.get("preferred_unlocked") is True


def test_pick_all_locked_takes_closest():
    now = datetime(2026, 9, 21, 10, 0)
    raids = [
        _raid(1, "2026-09-20T14:00:00", locked=True),
        _raid(2, "2026-09-26T14:00:00", locked=True),
    ]
    sel, meta = dnfer_raid._pick_core(raids, None, None, None, None, now)
    assert sel["id"] == 1
    assert "preferred_unlocked" not in meta


def test_pick_time_filter_prefers_unlocked():
    now = datetime(2026, 9, 21, 10, 0)
    raids = [
        _raid(1, "2026-09-26T14:00:00", locked=True),
        _raid(2, "2026-09-26T15:00:00"),
    ]
    sel, meta = dnfer_raid._pick_core(raids, 5, None, None, None, now)  # 周六
    assert sel["id"] == 2


def test_pick_range_no_match_fallback_prefers_unlocked():
    now = datetime(2026, 9, 21, 10, 0)
    raids = [
        _raid(1, "2026-09-20T14:00:00", locked=True),
        _raid(2, "2026-09-26T14:00:00"),
    ]
    sel, meta = dnfer_raid._pick_core(raids, None, None,
                                      datetime(2026, 9, 22, 10, 0),
                                      datetime(2026, 9, 22, 12, 0), now)
    assert meta["fallback"] is True
    assert sel["id"] == 2
    assert meta.get("preferred_unlocked") is True
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -k pick -v`
Expected: FAIL（当前选昨天锁定团 id=1）

- [ ] **Step 3: 实现**

`skills/dnfer-raids/scripts/dnfer_raid.py` 的 `_pick_core` 上方新增纯函数：

```python
def _closest_prefer_unlocked(items: list, now: datetime) -> tuple[dict, bool]:
    """离 now 最近的 item；未锁定优先。返回 (item, skipped_locked)。
    skipped_locked=True：为选未锁定而跳过了绝对距离更近的锁定团。"""
    unlocked = [it for it in items if not it["raid"]["locked"]]
    if unlocked:
        sel = min(unlocked, key=lambda it: (abs(it["dt"] - now), it["dt"]))
    else:
        sel = min(items, key=lambda it: (abs(it["dt"] - now), it["dt"]))
    closest = min(items, key=lambda it: (abs(it["dt"] - now), it["dt"]))
    skipped = closest["raid"]["locked"] and sel["raid"]["id"] != closest["raid"]["id"]
    return sel, skipped
```

`_pick_core` 内两处选团逻辑替换：

（a）候选命中处：

```python
    if candidates:
        sel, skipped = _closest_prefer_unlocked(candidates, now)
        meta["selected"] = sel["raid"]
        meta["matches"] = [it["raid"]["id"] for it in candidates]
        if skipped:
            meta["preferred_unlocked"] = True
        return sel["raid"], meta
```

（b）回退处：

```python
    # 时间过滤无命中 → 回退离当前时间最近的一场（同样未锁定优先）
    sel, skipped = _closest_prefer_unlocked(items, now)
    meta["selected"] = sel["raid"]
    meta["fallback"] = True
    if skipped:
        meta["preferred_unlocked"] = True
    return sel["raid"], meta
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add skills/dnfer-raids/scripts/dnfer_raid.py backend/tests/test_dnfer_raid_script.py
git commit -m "$(cat <<'EOF'
fix: dnfer-raids skill 选团未锁定优先（含时间过滤与回退），meta 加 preferred_unlocked

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 脚本 — `_pick_signup_target` + `signup`/`unsign` 命令

**Files:**
- Modify: `skills/dnfer-raids/scripts/dnfer_raid.py`
- Test: `backend/tests/test_dnfer_raid_script.py`

- [ ] **Step 1: 写失败的测试（`_pick_signup_target`）**

`backend/tests/test_dnfer_raid_script.py` 末尾追加：

```python
def test_signup_target_prefers_next_future():
    now = datetime(2026, 9, 23, 10, 0)  # 周三
    raids = [
        _raid(1, "2026-09-23T09:00:00"),   # 今天已过
        _raid(2, "2026-09-26T14:00:00"),   # 下周六
    ]
    raid, reason = dnfer_raid._pick_signup_target(raids, now)
    assert raid["id"] == 2
    assert reason == "next"


def test_signup_target_today_future_is_next():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [_raid(1, "2026-09-23T20:00:00")]
    raid, reason = dnfer_raid._pick_signup_target(raids, now)
    assert raid["id"] == 1
    assert reason == "next"


def test_signup_target_today_unlocked_fallback():
    now = datetime(2026, 9, 23, 15, 0)
    raids = [
        _raid(1, "2026-09-23T14:00:00"),              # 今天已过但未锁定
        _raid(2, "2026-09-23T09:00:00", locked=True),  # 今天锁定 → 排除
    ]
    raid, reason = dnfer_raid._pick_signup_target(raids, now)
    assert raid["id"] == 1
    assert reason == "today_unlocked"


def test_signup_target_excludes_locked_future():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [
        _raid(1, "2026-09-26T14:00:00", locked=True),  # 最近的下一次团已锁定 → 跳过
        _raid(2, "2026-09-27T14:00:00"),               # 更远的未锁定团
    ]
    raid, reason = dnfer_raid._pick_signup_target(raids, now)
    assert raid["id"] == 2
    assert reason == "next"


def test_signup_target_none():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [_raid(1, "2026-09-20T14:00:00", locked=True)]
    assert dnfer_raid._pick_signup_target(raids, now) == (None, None)
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -k signup_target -v`
Expected: FAIL（`_pick_signup_target` 不存在）

- [ ] **Step 3: 实现 `_pick_signup_target`**

`skills/dnfer-raids/scripts/dnfer_raid.py` 的 `_pick_core` 后新增：

```python
def _pick_signup_target(raids: list, now: datetime) -> tuple[dict | None, str | None]:
    """报名/取消报名的目标团：只看未锁定团。
    优先「当前时间下一次的团」（starts_at >= now 取最早）；
    无未来未锁定团时回退「当天未锁定的团」（同日期取最早）；
    再无 → (None, None)。"""
    items = [{"raid": r, "dt": _parse_iso(r["starts_at"])} for r in raids if not r["locked"]]
    if not items:
        return None, None
    future = [it for it in items if it["dt"] >= now]
    if future:
        sel = min(future, key=lambda it: it["dt"])
        return sel["raid"], "next"
    today = [it for it in items if it["dt"].date() == now.date()]
    if today:
        sel = min(today, key=lambda it: it["dt"])
        return sel["raid"], "today_unlocked"
    return None, None
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -k signup_target -v`
Expected: PASS

- [ ] **Step 5: 实现 `signup`/`unsign` 命令**

（a）`cmd_pick` 后新增辅助与命令函数：

```python
def _signup_call(raid_id: int, identifier: str, action: str) -> dict:
    """昵称优先、404 回退账号（仿 dnfer_api._resolve）。"""
    suffix = "signup/cancel" if action == "unsign" else "signup"
    url = f"{_base()}/api/public/raids/{raid_id}/{suffix}"
    def call(field: str, value: str) -> dict:
        return _request("POST", url, {field: value})
    result = call("nickname", identifier)
    if result.get("ok") is False and result.get("status") == 404:
        result = call("account", identifier)
    return result


def cmd_signup(args) -> int:
    action = "unsign" if getattr(args, "cancel", False) else "signup"
    result = _request("GET", f"{_base()}/api/public/raids")
    if isinstance(result, dict) and result.get("ok") is False:
        return _fail(result)
    if not isinstance(result, list):
        return _fail({"ok": False, "error": "响应格式异常"})
    raid, reason = _pick_signup_target(result, _now_local())
    if raid is None:
        out = {"ok": True, "selected": None, "reason": "no_target"}
        print(json.dumps(out, ensure_ascii=False))
        print("[dnfer-raid] 当前没有可报名/取消的团", file=sys.stderr)
        return 0
    resp = _signup_call(raid["id"], args.identifier, action)
    if resp.get("ok") is False:
        return _fail(resp)
    out = {"ok": True, "action": action, "reason": reason,
           "raid": {"id": raid["id"], "name": raid["name"],
                    "starts_at_local": _fmt_local(_parse_iso(raid["starts_at"]))},
           "user": resp.get("user")}
    print(json.dumps(out, ensure_ascii=False))
    who = (resp.get("user") or {}).get("nickname") or args.identifier
    print(f"[dnfer-raid] {action}：{who} → {raid['name']}（{reason}）", file=sys.stderr)
    return 0
```

（b）`main()` 中 `p_detail` 之后新增两个子命令：

```python
    p_signup = sub.add_parser("signup", help="替玩家报名下一次/当天未锁定的团")
    p_signup.add_argument("identifier", help="DNfer 账号 username 或昵称")
    p_signup.set_defaults(func=cmd_signup, cancel=False)

    p_unsign = sub.add_parser("unsign", help="替玩家取消报名下一次/当天未锁定的团")
    p_unsign.add_argument("identifier", help="DNfer 账号 username 或昵称")
    p_unsign.set_defaults(func=cmd_signup, cancel=True)
```

- [ ] **Step 6: 全量跑脚本测试确认**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
Expected: PASS（全部）

- [ ] **Step 7: 提交**

```bash
git add skills/dnfer-raids/scripts/dnfer_raid.py backend/tests/test_dnfer_raid_script.py
git commit -m "$(cat <<'EOF'
feat: dnfer-raids skill 新增 signup/unsign 命令替玩家报名/取消报名

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: SKILL.md 更新

**Files:**
- Modify: `skills/dnfer-raids/SKILL.md`

- [ ] **Step 1: frontmatter description 追加报名能力**

`skills/dnfer-raids/SKILL.md` 第 3 行 description 改为：

```yaml
description: 查询 DNfer 攻坚排表与波次信息，或替玩家报名/取消报名。当群友发送「打团信息」「排表信息」「第 n 波」「前 n 波」「查找一下（某时间）的团」「（账号或昵称）报名」「（账号或昵称）取消报名」等文本时使用。
```

- [ ] **Step 2: 选团规则更新（第 13 行附近）**

「选团规则」条目改为：

```
- **选团规则**：消息带时间 → 按时间匹配；不带时间 → 取未锁定团里 `starts_at` 离当前时间最近的一场（「离当前最近」由脚本 `pick` 计算，不要自己猜）；全部已锁定时才取最近的锁定团。
```

- [ ] **Step 3: 调用方式新增示例（第 34 行 `detail` 示例后）**

```bash
# 替玩家报名/取消报名：目标团为「当前时间下一次的团」，无则回退「当天未锁定的团」
python scripts/dnfer_raid.py signup 872557240
python scripts/dnfer_raid.py signup 龙应藏进云里
python scripts/dnfer_raid.py unsign 872557240
```

- [ ] **Step 4: 触发映射表新增行（第 45-46 行附近）**

| 群友消息 | 动作 |
|---|---|
| 「（QQ号或昵称）报名」 | `signup <QQ号或昵称>` |
| 「（QQ号或昵称）取消报名」 | `unsign <QQ号或昵称>` |

并补一行说明：

```
- 报名/取消报名的目标团：脚本自动取「当前时间下一次的团」（`starts_at` 未过且最早），仅当没有未来未锁定团时回退「当天未锁定的团」。标识 `872557240` 这类纯数字按 QQ 号（账号）、`龙应藏进云里` 这类中文按昵称；脚本自动昵称优先、404 回退账号，模型无需判断。
```

- [ ] **Step 5: 回复格式时间措辞更新（第 54 行）**

`starts_at_local` 描述中的「**别用 `pick`/`raids` 里的裸 UTC 字段 `starts_at`**」删去，改为「`starts_at` 本身即本地时间，直接用即可」。

- [ ] **Step 6: 回执映射表新增报名相关行（第 61 行附近，`no_raids` 行后）**

| stdout | 回复 |
|---|---|
| `signup` 成功 `{"ok":true,"action":"signup",...}` | 「已帮 昵称（账号）报名《名称》 周六 14:30」 |
| `unsign` 成功 `{"ok":true,"action":"unsign",...}` | 「已帮 昵称（账号）取消报名《名称》」 |
| `{"ok":true,"selected":null,"reason":"no_target"}` | 「当前没有可报名的团」（unsign 时：「当前没有可取消报名的团」） |
| `{"ok":false,"status":400,"error":"该用户已报名"}` | 「该成员已报名该团」 |
| `{"ok":false,"status":400,"error":"该用户尚未报名"}` | 「该成员尚未报名」 |
| `{"ok":false,"status":400,"error":"团长无需报名"}` | 「团长无需报名」 |
| `{"ok":false,"status":400,"error":"攻坚已锁定，无法报名"}` | 「该团已锁定，无法报名」 |
| `{"ok":false,"status":403,"error":"攻坚已锁定，无法取消报名"}` | 「该团已锁定，无法取消报名」 |
| `{"ok":false,"status":404,"error":"账号或昵称不存在"}` | 「这个账号/昵称还没注册，请发送『你的QQ号注册』自助注册」 |

- [ ] **Step 7: 提交**

```bash
git add skills/dnfer-raids/SKILL.md
git commit -m "$(cat <<'EOF'
docs: dnfer-raids SKILL.md 报名/取消报名触发映射与回执、选团未锁定优先、时间措辞

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: README 与 CHANGELOG

**Files:**
- Modify: `skills/dnfer-raids/README.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: skill README 自测追加**

`skills/dnfer-raids/README.md` 自测代码块末尾追加：

```bash
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py signup 872557240
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py unsign 872557240
```

- [ ] **Step 2: 根 README 机器人 API 表补端点**

在根 `README.md` 机器人 API 表中新增（找到攻坚查询端点所在行附近）：

```
| `POST /api/public/raids/{rid}/signup` | 替玩家报名（body `{"account" 或 "nickname"}`，目标团由调用方选定） |
| `POST /api/public/raids/{rid}/signup/cancel` | 替玩家取消报名（body 同上，自动撤下该玩家全部占位） |
```

并在 curl 示例区追加：

```bash
curl -X POST https://<域名>/api/public/raids/1/signup \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"account":"872557240"}'
curl -X POST https://<域名>/api/public/raids/1/signup/cancel \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"nickname":"龙应藏进云里"}'
```

（先在根 README.md 中找到机器人 API 表与 curl 示例的实际位置再插入。）

- [ ] **Step 3: CHANGELOG [Unreleased]**

`CHANGELOG.md` [Unreleased] 的「新增」块追加：

```
- **机器人报名/取消**：`POST /api/public/raids/{rid}/signup` 与 `/signup/cancel`（按账号或昵称替玩家报名/取消，取消自动撤下占位）；AstrBot skill「dnfer-raids」支持「（QQ号或昵称）报名 / 取消报名」消息，目标团取「当前时间下一次的团」，无则回退「当天未锁定的团」
```

「变更/修复」块新增（若无「修复」块则新建）：

```
### 修复

- **dnfer-raids skill 时间口径**：库 `starts_at` 实为本地时间，去掉脚本 +8 偏移（不再偏 8 小时）
- **dnfer-raids skill 选团**：`pick` 优先未锁定团，避免「昨天已锁定团」因离当前最近被误选
```

- [ ] **Step 4: 提交**

```bash
git add skills/dnfer-raids/README.md README.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: 机器人报名端点 README + CHANGELOG 记录修复与新增

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 全量验证

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部 PASS（含新增 `test_bot_raid_signup.py`、`test_dnfer_raid_script.py`）

- [ ] **Step 2: 确认无遗漏**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_raid_signup.py tests/test_dnfer_raid_script.py -v`
Expected: 两文件全部 PASS

- [ ] **Step 3: 语法/导入检查**

Run: `cd skills/dnfer-raids && python -m py_compile scripts/dnfer_raid.py && python scripts/dnfer_raid.py --help`
Expected: `--help` 列出 `raids/pick/detail/signup/unsign` 子命令

- [ ] **Step 4: git 状态确认**

Run: `git status --short`
Expected: 工作区干净（所有改动已提交）

---

## 关键实现要点回顾

- `bot.py` 复用 `_raid_or_404` / `_remove_signup`（raids.py）/ `_get_user`（bot.py 自身），`_remove_signup` 为 async，端点须 `async def`。
- 广播 `raid:signup` 的 `user` 是**目标用户**（非机器人）。
- 脚本 stdout 契约：成功 `{"ok":true,"action":...,"raid":{...},"user":{...}}`；无目标团 `{"ok":true,"selected":null,"reason":"no_target"}`；后端错误透传 `{"ok":false,"status":...,"error":...}`。
- 脚本测试用 importlib 绝对路径加载 `skills/dnfer-raids/scripts/dnfer_raid.py`（`parents[2]` = 仓库根）。
