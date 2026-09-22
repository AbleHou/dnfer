# 机器人自注册（按 QQ 号） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 群友对机器人发送「QQ号注册 / 注册 QQ号」，机器人免注册码创建用户：账号=密码=昵称=该 QQ 号，随后可用同一 QQ 号录入/查询角色。

**Architecture:** 在既有 `bot.py` 路由（`/api/public`，固定 Token 鉴权）上新增 `POST /api/public/register`，处理器内校验纯数字 6–64 位并做 username/nickname 去重，创建 User 后返回 `{"account","nickname"}`。机器人侧 `dnfer_api.py` 新增 `register` 子命令调用该接口；AstrBot `SKILL.md` 补充注册意图与回执映射。网页端注册仍走注册码，语义不变。

**Tech Stack:** Python FastAPI · SQLAlchemy 2 · SQLite · 标准库 urllib 脚本 · AstrBot Anthropic Skills

**Spec:** `docs/superpowers/specs/2026-09-22-bot-register-design.md`

**测试环境：** 后端测试用 `cd backend && .venv/bin/python -m pytest <file> -v`。全量现有测试 110 passed（约 70s）。仓库工作流直接提交到 `main` 分支，不做 worktree。

---

### Task 1: 后端 `POST /api/public/register`（schema + 端点 + 测试）

**Files:**
- Create: `backend/tests/test_bot_register.py`
- Modify: `backend/app/schemas.py`（新增 `BotRegisterIn`）
- Modify: `backend/app/routers/bot.py`（新增端点）

- [ ] **Step 1: 写失败测试** `backend/tests/test_bot_register.py`

```python
from .helpers import register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}


def test_requires_token(client):
    assert client.post("/api/public/register",
                       json={"identifier": "872557240"}).status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.post("/api/public/register", json={"identifier": "872557240"},
                       headers=bad).status_code == 401


def test_register_success(client):
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "872557240"})
    assert r.status_code == 200
    assert r.json() == {"account": "872557240", "nickname": "872557240"}
    # 可用 QQ 号作为账号密码登录
    login = client.post("/api/auth/login", json={
        "username": "872557240", "password": "872557240"})
    assert login.status_code == 200
    assert login.json()["user"]["is_admin"] is False
    # 注册后即可按账号录入角色
    add = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "872557240", "characters": [{"name": "剑魂"}]})
    assert add.status_code == 200
    assert add.json()["results"][0]["ok"] is True


def test_register_non_numeric(client):
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "abc"})
    assert r.status_code == 400
    assert r.json()["detail"] == "QQ号仅支持 6-64 位纯数字"


def test_register_too_short(client):
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "12345"})
    assert r.status_code == 400
    assert r.json()["detail"] == "QQ号仅支持 6-64 位纯数字"


def test_register_duplicate_username(client):
    register_user(client, "872557240", "别的昵称")  # 占用 username
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "872557240"})
    assert r.status_code == 400
    assert r.json()["detail"] == "用户名已存在"


def test_register_duplicate_nickname(client):
    register_user(client, "someone_else", "872557240")  # 占用 nickname
    r = client.post("/api/public/register", headers=TOKEN,
                    json={"identifier": "872557240"})
    assert r.status_code == 400
    assert r.json()["detail"] == "昵称已存在"


def test_register_round_trip_empty_characters(client):
    client.post("/api/public/register", headers=TOKEN,
                json={"identifier": "872557240"})
    r = client.get("/api/public/characters", params={"account": "872557240"},
                   headers=TOKEN)
    assert r.status_code == 200
    assert r.json()["characters"] == []
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_register.py -v`
Expected: FAIL —— `/api/public/register` 尚不存在时 FastAPI 返回 404，路由级 `require_api_token` 不触发，**全部 7 个测试失败**（`test_requires_token` 期待 401 实得 404，同样失败）。红阶段即验证测试可用。

- [ ] **Step 3: `schemas.py` 新增 `BotRegisterIn`**

在 `backend/app/schemas.py` 的 `BotCharacterIn` 之前（或 `BotCharacterList` 之后）追加：

```python
class BotRegisterIn(BaseModel):
    identifier: str = Field(min_length=1)
```

- [ ] **Step 4: `bot.py` 新增端点**

修改 `backend/app/routers/bot.py` 顶部 import：

```python
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import jobs as job_data
from ..auth import hash_password, require_api_token
from ..db import get_db
from ..models import Character, User
from ..schemas import (BotCharacterList, BotCharacterResult, BotCharactersIn,
                       BotCharactersOut, BotRegisterIn)
from .members import _character_out
```

在模块常量区（`DEFAULT_FAME = 100000` 附近）加：

```python
_QQ_RE = re.compile(r"^\d{6,64}$")
```

在文件末尾追加端点：

```python
@router.post("/register")
def register(body: BotRegisterIn, db: Session = Depends(get_db)):
    """按 QQ 号免码注册：账号=密码=昵称=QQ号。网页端注册仍走注册码。"""
    identifier = body.identifier
    if _QQ_RE.fullmatch(identifier) is None:
        raise HTTPException(400, "QQ号仅支持 6-64 位纯数字")
    if db.scalars(select(User).where(User.username == identifier)).first():
        raise HTTPException(400, "用户名已存在")
    if db.scalars(select(User).where(User.nickname == identifier)).first():
        raise HTTPException(400, "昵称已存在")
    user = User(username=identifier, password_hash=hash_password(identifier),
                nickname=identifier, is_admin=False)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "用户名已存在")
    return {"account": identifier, "nickname": identifier}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_register.py -v`
Expected: PASS —— 7 tests passed。

- [ ] **Step 6: 跑现有相关测试确认无回归**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py tests/test_bot_characters.py tests/test_profile.py -q`
Expected: PASS —— 不破坏注册码流程与角色接口。

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/routers/bot.py backend/tests/test_bot_register.py
git commit -m "feat: 机器人按 QQ 号免码注册接口 POST /api/public/register"
```

---

### Task 2: 脚本新增 `register` 子命令

**Files:**
- Modify: `skills/dnfer-characters/scripts/dnfer_api.py`

- [ ] **Step 1: 模块 docstring 补 `register` 用法**

`backend` 之外的脚本，`skills/dnfer-characters/scripts/dnfer_api.py` 顶部 docstring（`用法：` 块）当前只列 `add`/`list`，追加一行：

```
  DNFER_API_TOKEN=xxx python dnfer_api.py register <QQ号>
```

并把 docstring 里 `身份解析` 之前的说明保持不动。

- [ ] **Step 2: 新增 `cmd_register` 函数**

在 `cmd_list` 函数之后追加：

```python
def cmd_register(identifier: str) -> int:
    result = _request("POST", f"{_base()}/api/public/register",
                      {"identifier": identifier})
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok") is False:
        print(f"[dnfer] 注册失败：{result.get('error')}", file=sys.stderr)
        return 1
    print(f"[dnfer] 注册成功：{result.get('account')}", file=sys.stderr)
    return 0
```

- [ ] **Step 3: 解析器注册 `register` 子命令**

在 `main()` 中 `p_list` 定义之后追加：

```python
    p_register = sub.add_parser("register", help="按 QQ 号免码注册（账号=密码=昵称=QQ号）")
    p_register.add_argument("identifier", help="纯数字 QQ 号，如 872557240")
```

- [ ] **Step 4: `main()` 分发**

把 `main()` 末尾的：

```python
    if args.cmd == "list":
        return cmd_list(args.identifier, args.by_nickname, args.by_account)
    return 2
```

改为：

```python
    if args.cmd == "list":
        return cmd_list(args.identifier, args.by_nickname, args.by_account)
    if args.cmd == "register":
        return cmd_register(args.identifier)
    return 2
```

- [ ] **Step 5: 语法与用法验证**

Run: `cd skills/dnfer-characters && python3 scripts/dnfer_api.py --help`
Expected: 子命令列表 `{add,list,register}` 中出现 `register`；无 traceback。

Run: `cd skills/dnfer-characters && python3 scripts/dnfer_api.py register --help`
Expected: 显示 `usage: ... register [-h] identifier` 及「按 QQ 号免码注册」说明。

Run: `cd skills/dnfer-characters && python3 scripts/dnfer_api.py register 872557240`
Expected: stdout 为 `{"ok": false, "error": "未设置环境变量 DNFER_API_TOKEN"}`（无 Token 时的既有约定），exit code 2。

- [ ] **Step 6: 连后端做端到端自测（可选，需本地后端运行）**

启动后端（`cd backend && .venv/bin/uvicorn app.main:app --port 8000`，另开终端），然后：

```bash
cd skills/dnfer-characters
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=change-me-bot-token \
  python3 scripts/dnfer_api.py register 872557240
```

Expected: stderr `[dnfer] 注册成功：872557240`，exit 0。（若本地 `.env` 已设真实 Token，用它替换 `change-me-bot-token`；注意别写入敏感值。）

- [ ] **Step 7: Commit**

```bash
git add skills/dnfer-characters/scripts/dnfer_api.py
git commit -m "feat: dnfer_api.py 新增 register 子命令"
```

---

### Task 3: SKILL.md 补注册意图与回执

**Files:**
- Modify: `skills/dnfer-characters/SKILL.md`

- [ ] **Step 1: frontmatter `description` 补注册意图**

将第 3 行的：

```yaml
description: 录入与查询 DNF 角色到 DNfer 系统。当群友发送账号或昵称及角色截图/文字描述请求记录角色，或要求按账号/昵称查询角色时使用。
```

改为：

```yaml
description: 录入与查询 DNF 角色到 DNfer 系统，或按 QQ 号自助注册。当群友发送账号或昵称及角色截图/文字描述请求记录角色、要求按账号/昵称查询角色、或发送「QQ号注册」请求自助注册时使用。
```

- [ ] **Step 2: 「调用方式」补注册命令**

在 `SKILL.md` 的「调用方式」代码块里，`list --by-account` 行之后追加：

```bash
# 按 QQ 号免码注册（账号=密码=昵称=QQ号）
python scripts/dnfer_api.py register <QQ号>
```

- [ ] **Step 3: 新增「## 注册」段落**

在「## 调用方式」段落之后、「## 角色解析规则」之前插入：

```markdown
## 注册

群友发送「QQ号注册」或「注册 QQ号」（QQ 号为纯数字）时，按 QQ 号免注册码自助开户：**账号=密码=昵称=该 QQ 号**。注册后即可用该 QQ 号（账号或昵称）录入/查询角色。

```bash
python scripts/dnfer_api.py register 872557240
```

stdout 成功：`{"account":"872557240","nickname":"872557240"}`

- 成功 → 回复「注册成功，账号=密码=昵称=872557240，可用 QQ 号登录网站」
- 消息里没有数字 → 回复「请发送你的 QQ 号，格式如 872557240注册」
- 已注册（stdout `{"ok":false,"status":400,"error":"用户名已存在"}`）→ 「这个 QQ 号已经注册过，直接使用即可」
- 昵称被占（`... error:"昵称已存在"`）→ 「这个昵称已被占用，请联系管理员」
- 格式非法（`... error:"QQ号仅支持 6-64 位纯数字"`）→ 「请发送有效的 QQ 号」
- Token/网络错误（stdout `{"ok":false,"error":...}`，无 status）→ 「系统暂时不可用，稍后再试」
```

- [ ] **Step 4: 404 回执改为引导自助注册**

将「回复群友」第 3 条：

```markdown
- **账号/昵称不存在**（stdout 为 `{"ok":false,"status":404,...}`）：回复「这个账号/昵称还没在系统注册，请先用注册码注册（找管理员要码）。」
```

改为：

```markdown
- **账号/昵称不存在**（stdout 为 `{"ok":false,"status":404,...}`）：回复「这个账号/昵称还没注册，请发送『你的QQ号注册』自助注册。」
```

- [ ] **Step 5: 复核渲染**

Run: `cd skills/dnfer-characters && python3 -c "import sys; print('frontmatter 含注册意图:', 'QQ号' in open('SKILL.md', encoding='utf-8').read(400))"`
Expected: `frontmatter 含注册意图: True`

- [ ] **Step 6: Commit**

```bash
git add skills/dnfer-characters/SKILL.md
git commit -m "feat: SKILL.md 支持按 QQ 号自助注册（含回执映射）"
```

---

### Task 4: 文档与变更日志

**Files:**
- Modify: `README.md`（机器人 API 表 + curl 示例）
- Modify: `skills/dnfer-characters/README.md`（自测补注册）
- Modify: `CHANGELOG.md`（[Unreleased]）

- [ ] **Step 1: 根 README 机器人 API 表补端点**

在 `README.md` 机器人 API 表 `GET /api/public/characters?account={账号}` 行之后追加：

```markdown
| `POST /api/public/register` | 按 QQ 号免码注册：账号=密码=昵称=QQ号（纯数字 6-64 位，网页端注册仍走注册码） |
```

- [ ] **Step 2: 根 README 补 curl 示例**

在 `README.md` 的 curl 代码块末尾（`?account=zhangsan` 那行之后）追加：

```bash
curl -X POST -H "Authorization: Bearer $DNFER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"872557240"}' \
  http://127.0.0.1:8000/api/public/register
```

- [ ] **Step 3: skill README 自测补注册**

在 `skills/dnfer-characters/README.md` 自测代码块末尾（`list --by-account` 那行之后）追加：

```bash
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py register 872557240
```

并在自测段落的说明处补一句：

```markdown
注册成功后，该 QQ 号即账号=密码=昵称，可用上述 add/list 命令直接录入/查询角色。
```

- [ ] **Step 4: CHANGELOG [Unreleased] 新增条目**

在 `CHANGELOG.md` 的 `[Unreleased]` → `### 新增` 下追加：

```markdown
- **机器人自助注册**：`POST /api/public/register` 按 QQ 号免码注册（账号=密码=昵称=QQ号，纯数字 6-64 位）；AstrBot skill 支持「QQ号注册 / 注册 QQ号」消息
```

- [ ] **Step 5: Commit**

```bash
git add README.md skills/dnfer-characters/README.md CHANGELOG.md
git commit -m "docs: 机器人自助注册的接口/自测/CHANGELOG"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 117 passed（110 存量 + 7 新增），无失败。

- [ ] **Step 2: 复核变更文件清单**

Run: `git status --short`
Expected: 工作区干净；`git log --oneline -6` 显示本特性 4 个提交（Task 1–4）。
