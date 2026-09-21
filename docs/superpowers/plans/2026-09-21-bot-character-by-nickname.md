# 机器人 skill 支持按昵称添加/查询角色 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AstrBot skill（`skills/dnfer-characters`）与后端 bot 接口支持按**昵称**（以及账号）添加/查询角色，群友只说「帮xxx添加角色」时自动昵称优先、404 回退账号。

**Architecture:** 后端 `BotCharactersIn` 增加可选 `nickname`（与 `account` 恰好二选一），`_get_user` 按账号或昵称查用户（昵称唯一），`BotCharactersOut` 回填解析出的 username+nickname；skill 脚本 `add`/`list` 支持默认自动解析 + `--by-nickname`/`--by-account` 强制模式，SKILL.md/README 同步更新。

**Tech Stack:** FastAPI + Pydantic v2 + SQLAlchemy 2（后端）；纯 stdlib `urllib` Python 脚本 + Anthropic Skills（skill）。

---

## 文件结构

- `backend/app/schemas.py` — `BotCharactersIn` 身份二选一校验、`BotCharactersOut` 加 `nickname`
- `backend/app/routers/bot.py` — `_get_user` 按账号/昵称查询；POST/GET 支持 nickname；GET 二选一校验
- `backend/tests/test_bot_characters.py` — 按昵称与校验用例
- `skills/dnfer-characters/scripts/dnfer_api.py` — 三种身份模式
- `skills/dnfer-characters/SKILL.md` — 身份规则/命令/回复示例更新
- `skills/dnfer-characters/README.md` — 用法与自测示例更新

参考 spec：`docs/superpowers/specs/2026-09-21-bot-character-by-nickname-design.md`

---

### Task 1: 后端 schema — `BotCharactersIn` 身份二选一校验

**Files:**
- Modify: `backend/app/schemas.py`（`BotCharactersIn`，约 172-174 行）
- Test: `backend/tests/test_bot_characters.py`

- [ ] **Step 1: 写失败测试**（追加到 `test_bot_characters.py` 末尾）

```python
def test_add_both_account_and_nickname(client):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "x", "nickname": "y", "characters": [{"name": "剑魂"}]})
    assert r.status_code == 422

def test_add_missing_both_identities(client):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "characters": [{"name": "剑魂"}]})
    assert r.status_code == 422
```

- [ ] **Step 2: 运行验证失败**

Run: `cd backend && .venv/bin/pytest tests/test_bot_characters.py::test_add_both_account_and_nickname -v`
Expected: FAIL（现状：`nickname` 被 pydantic 忽略、`account="x"` 查无用户 → 404，断言期望 422）。
（`test_add_missing_both_identities` 现在已因 `account` 必填而 422，属回归守卫，改 schema 后仍应 422。）

- [ ] **Step 3: 改 schema**（`backend/app/schemas.py`）

`BotCharactersIn` 改为：

```python
from pydantic import BaseModel, ConfigDict, Field, model_validator
```

```python
class BotCharactersIn(BaseModel):
    account: str | None = Field(default=None, min_length=1, max_length=64)
    nickname: str | None = Field(default=None, min_length=1, max_length=64)
    characters: list[BotCharacterIn]

    @model_validator(mode="after")
    def _exactly_one_identity(self):
        if (self.account is None) == (self.nickname is None):
            raise ValueError("account 与 nickname 必须恰好提供一个")
        return self
```

- [ ] **Step 4: 运行验证通过 + 回归**

Run: `cd backend && .venv/bin/pytest tests/test_bot_characters.py -v`
Expected: 两个新用例 PASS，现有账号用例全部 PASS（`test_requires_token` 发空 body 先被路由级鉴权 401 拦截，不受影响）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/schemas.py backend/tests/test_bot_characters.py
git commit -m "feat: BotCharactersIn 支持按昵称（account/nickname 恰好二选一）"
```

---

### Task 2: 后端 — `BotCharactersOut.nickname` + bot.py 按昵称查询

**Files:**
- Modify: `backend/app/schemas.py`（`BotCharactersOut`，约 183-185 行）
- Modify: `backend/app/routers/bot.py`（`_get_user`、POST、GET）
- Test: `backend/tests/test_bot_characters.py`

- [ ] **Step 1: 写失败测试**（追加）

```python
def test_create_by_nickname(client):
    h, _ = register_user(client, "n1", "昵称甲")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "nickname": "昵称甲", "characters": [{"name": "剑魂", "fame": 15000}]})
    assert r.status_code == 200
    body = r.json()
    assert body["account"] == "n1"
    assert body["nickname"] == "昵称甲"
    res = body["results"][0]
    assert res["ok"] is True and res["action"] == "created"
    assert res["character"]["fame"] == 15000
    assert client.get("/api/me/characters", headers=h).json()[0]["name"] == "剑魂"

def test_get_by_nickname(client):
    register_user(client, "n2", "昵称乙")
    client.post("/api/public/characters", headers=TOKEN, json={
        "nickname": "昵称乙", "characters": [{"name": "鬼泣", "job_name": "soul_bender"}]})
    r = client.get("/api/public/characters", params={"nickname": "昵称乙"}, headers=TOKEN)
    assert r.status_code == 200
    body = r.json()
    assert body["account"] == "n2"
    assert body["nickname"] == "昵称乙"
    assert [c["name"] for c in body["characters"]] == ["鬼泣"]

def test_post_nonexistent_nickname(client):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "nickname": "不存在", "characters": [{"name": "剑魂"}]})
    assert r.status_code == 404

def test_get_nonexistent_nickname(client):
    r = client.get("/api/public/characters", params={"nickname": "不存在"}, headers=TOKEN)
    assert r.status_code == 404

def test_get_missing_both_params(client):
    assert client.get("/api/public/characters", headers=TOKEN).status_code == 400

def test_get_both_params(client):
    r = client.get("/api/public/characters", params={"account": "x", "nickname": "y"},
                   headers=TOKEN)
    assert r.status_code == 400
```

- [ ] **Step 2: 运行验证失败**

Run: `cd backend && .venv/bin/pytest tests/test_bot_characters.py -v`
Expected: 新用例 FAIL。注意此时 `account` 已可选但 handler 未改，真实失败模式是——按昵称 POST 走 `_get_user(db, None)`（`username IS NULL` 查无用户）→ 404（期望 200）；按昵称 GET 因 `account` 查询参数仍必填 → 422（期望 200）；GET 无参数 → 422（期望 400）；GET 都填 → 用 `account="x"` 查无 → 404（期望 400）。其中 `test_post_nonexistent_nickname` 此刻会**巧合地** 404 通过（原因错误），改 handler 后才真正生效。现有用例保持 PASS。

- [ ] **Step 3: 改 schema + handler**

`schemas.py` 的 `BotCharactersOut`：

```python
class BotCharactersOut(BaseModel):
    account: str
    nickname: str
    results: list[BotCharacterResult]
```

`bot.py`：

```python
def _get_user(db, account: str | None = None,
              nickname: str | None = None) -> User:
    if account is not None:
        user = db.scalars(select(User).where(User.username == account)).first()
    else:
        users = db.scalars(select(User).where(User.nickname == nickname)).all()
        if len(users) > 1:  # 防御：昵称唯一被破坏（正常不应发生）
            raise HTTPException(500, "昵称重复，数据异常")
        user = users[0] if users else None
    if user is None:
        raise HTTPException(404, "账号或昵称不存在")
    return user
```

POST handler 开头改为 `user = _get_user(db, body.account, body.nickname)`，返回改为：

```python
    return BotCharactersOut(account=user.username, nickname=user.nickname,
                            results=results)
```

GET handler 改为：

```python
@router.get("/characters", response_model=BotCharacterList)
def list_characters(account: str | None = None, nickname: str | None = None,
                    db: Session = Depends(get_db)):
    if (account is None) == (nickname is None):
        raise HTTPException(400, "account 与 nickname 必须二选一")
    user = _get_user(db, account, nickname)
    chars = db.scalars(select(Character).where(Character.user_id == user.id)
                       .order_by(Character.id)).all()
    return BotCharacterList(account=user.username, nickname=user.nickname,
                            characters=[_character_out(c) for c in chars])
```

注意：现有 GET 返回的是 `BotCharacterList(account=account, ...)` 直接把查询参数透传，必须改成 `user.username`，否则按昵称查询时 `account` 会错填成昵称。

- [ ] **Step 4: 运行验证通过 + 全量后端回归**

Run: `cd backend && .venv/bin/pytest -q`
Expected: 全部 PASS（现有 14 个 bot 用例 + 新增 7 个；其余测试文件不受影响）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/bot.py backend/tests/test_bot_characters.py
git commit -m "feat: bot 接口按昵称查用户（POST/GET 支持 nickname，响应回填账号+昵称）"
```

---

### Task 3: skill 脚本 — `dnfer_api.py` 三种身份模式

**Files:**
- Modify: `skills/dnfer-characters/scripts/dnfer_api.py`

（无自动化测试框架；验证用 `py_compile` + README 冒烟命令，符合项目既有约定。）

- [ ] **Step 1: 重写脚本**（完整替换 `dnfer_api.py`）

```python
#!/usr/bin/env python3
"""DNfer 机器人 API 助手（仅 Python 标准库，零第三方依赖）。

用法：
  DNFER_API_TOKEN=xxx python dnfer_api.py add <identifier> '<characters_json>'
  DNFER_API_TOKEN=xxx python dnfer_api.py list <identifier>

身份解析（identifier 可为账号 username 或昵称）：
  默认：昵称优先，404 回退账号
  --by-nickname：强制按昵称（不回退）
  --by-account：强制按账号（不回退）

环境变量：
  DNFER_API_BASE   后端地址，默认 http://127.0.0.1:8000（同机部署直连内网端口）
  DNFER_API_TOKEN  DNfer 机器人 API Token，必填

输出约定：stdout 只输出机器可读 JSON（模型据此解析）；人读中文摘要写到 stderr。
非 2xx / 网络错误时 stdout 为 {"ok": false, "status": ..., "error": ...}。
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000"


def _base() -> str:
    return os.environ.get("DNFER_API_BASE", DEFAULT_BASE).rstrip("/")


def _token() -> str:
    token = os.environ.get("DNFER_API_TOKEN", "")
    if not token:
        print(json.dumps({"ok": False, "error": "未设置环境变量 DNFER_API_TOKEN"},
                         ensure_ascii=False))
        sys.exit(2)
    return token


def _request(method: str, url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {_token()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8"))
        except Exception:
            detail = {}
        return {"ok": False, "status": e.code,
                "error": detail.get("detail") or f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"网络错误：{e.reason}"}


def _resolve(by_nickname: bool, by_account: bool, identifier: str, lookup) -> dict:
    """按模式解析身份并返回 API 结果。

    - 强制模式（--by-nickname / --by-account）：只查一次，不回退。
    - 自动模式：昵称优先，仅 404（用户不存在）时回退账号。
    """
    if by_nickname or by_account:
        field = "nickname" if by_nickname else "account"
        return lookup(field, identifier)
    result = lookup("nickname", identifier)
    if result.get("ok") is False and result.get("status") == 404:
        result = lookup("account", identifier)
    return result


def cmd_add(identifier: str, characters_json: str, by_nickname: bool,
            by_account: bool) -> int:
    try:
        characters = json.loads(characters_json)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"characters JSON 解析失败：{e}"},
                         ensure_ascii=False))
        return 2
    if not isinstance(characters, list):
        print(json.dumps({"ok": False, "error": "characters 必须是数组"}, ensure_ascii=False))
        return 2

    def post(field: str, value: str) -> dict:
        return _request("POST", f"{_base()}/api/public/characters",
                        {field: value, "characters": characters})

    result = _resolve(by_nickname, by_account, identifier, post)
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok") is False:
        print(f"[dnfer] 录入失败：{result.get('error')}", file=sys.stderr)
        return 1
    for r in result.get("results", []):
        mark = "✓" if r.get("ok") else "✗"
        action = f"（{r.get('action')}）" if r.get("action") else ""
        reason = f"：{r.get('error')}" if not r.get("ok") else ""
        print(f"[dnfer] {mark} {r.get('name')}{action}{reason}", file=sys.stderr)
    return 0


def cmd_list(identifier: str, by_nickname: bool, by_account: bool) -> int:
    def get(field: str, value: str) -> dict:
        url = f"{_base()}/api/public/characters?{field}={urllib.parse.quote(value)}"
        return _request("GET", url)

    result = _resolve(by_nickname, by_account, identifier, get)
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok") is False:
        print(f"[dnfer] 查询失败：{result.get('error')}", file=sys.stderr)
        return 1
    chars = result.get("characters", [])
    print(f"[dnfer] 账号 {result.get('account')}（{result.get('nickname')}）"
          f"共 {len(chars)} 个角色", file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="DNfer 机器人 API 助手")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add", help="批量添加/编辑角色")
    add_grp = p_add.add_mutually_exclusive_group()
    add_grp.add_argument("--by-nickname", action="store_true",
                         help="强制按昵称查询用户（默认昵称优先，404 回退账号）")
    add_grp.add_argument("--by-account", action="store_true",
                         help="强制按账号 username 查询用户")
    p_add.add_argument("identifier", help="DNfer 账号 username 或昵称")
    p_add.add_argument("characters_json",
                       help='角色数组 JSON，如 \'[{"name":"剑魂","fame":210000}]\'')

    p_list = sub.add_parser("list", help="按账号或昵称查询角色")
    list_grp = p_list.add_mutually_exclusive_group()
    list_grp.add_argument("--by-nickname", action="store_true",
                          help="强制按昵称查询（默认昵称优先，404 回退账号）")
    list_grp.add_argument("--by-account", action="store_true",
                          help="强制按账号 username 查询")
    p_list.add_argument("identifier", help="DNfer 账号 username 或昵称")

    args = parser.parse_args()
    if args.cmd == "add":
        return cmd_add(args.identifier, args.characters_json,
                       args.by_nickname, args.by_account)
    if args.cmd == "list":
        return cmd_list(args.identifier, args.by_nickname, args.by_account)
    return 2


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: 语法自检**

Run: `cd skills/dnfer-characters && python3 -m py_compile scripts/dnfer_api.py`
Expected: 无输出，退出码 0。

- [ ] **Step 3: 提交**

```bash
git add skills/dnfer-characters/scripts/dnfer_api.py
git commit -m "feat: dnfer_api 脚本支持默认昵称优先/--by-nickname/--by-account"
```

---

### Task 4: SKILL.md 更新

**Files:**
- Modify: `skills/dnfer-characters/SKILL.md`（frontmatter description、重要前提、调用方式、录入示例、查询示例、回复群友）

- [ ] **Step 1: 更新 frontmatter description**

```yaml
description: 录入与查询 DNF 角色到 DNfer 系统。当群友发送账号或昵称及角色截图/文字描述请求记录角色，或要求按账号/昵称查询角色时使用。
```

（必须在 description 提及「昵称」，否则 AstrBot 按 description 选 skill 时会漏触发仅含昵称的消息，如「帮张三添加角色」。）

- [ ] **Step 2: 更新「重要前提」**

`账号 = DNfer 系统登录用户名（username），不是游戏账号` 之后补充：
`**昵称** = 系统内全局唯一的昵称（群昵称通常是它），因此可按昵称无歧义定位用户。群友消息通常只说「帮xxx添加角色 / 为xxx更新信息」，不标注类型——此时用默认模式（昵称优先，404 回退账号）即可；若群友明确说「账号 xxx」或「昵称 xxx」，用对应强制模式。`

- [ ] **Step 3: 更新「调用方式」**（命令三模式）

```bash
# 录入/编辑角色：默认昵称优先，404 回退账号
python scripts/dnfer_api.py add <昵称或账号> '<角色数组json>'
# 强制按昵称 / 强制按账号
python scripts/dnfer_api.py add --by-nickname <昵称> '<角色数组json>'
python scripts/dnfer_api.py add --by-account <账号> '<角色数组json>'

# 查询角色（同样支持默认 / --by-nickname / --by-account）
python scripts/dnfer_api.py list <昵称或账号>
python scripts/dnfer_api.py list --by-nickname <昵称>
python scripts/dnfer_api.py list --by-account <账号>
```

- [ ] **Step 4: 更新「录入示例」「查询示例」**——各补一个昵称示例（例：`add 张三 '[...]'` 与 `add --by-account zhangsan '[...]'`），并说明录入响应含 `account`/`nickname` 供回显核对。

- [ ] **Step 5: 更新「回复群友」**——录入成功改为逐角色回显 + 解析到的身份（例：「剑魂 已录入（created），账号 zhangsan（昵称 张三）」）；404 提示语改为「这个账号/昵称还没在系统注册，请先用注册码注册（找管理员要码）。」

- [ ] **Step 6: 提交**

```bash
git add skills/dnfer-characters/SKILL.md
git commit -m "docs: SKILL.md 支持按昵称录入/查询（含 frontmatter description）"
```

---

### Task 5: README.md 更新

**Files:**
- Modify: `skills/dnfer-characters/README.md`（「自测」章节）

- [ ] **Step 1: 更新「自测」示例**——补上昵称与回退示例：

```bash
cd dnfer-characters
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py add zhangsan '[{"name":"剑魂","fame":210000}]'
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py add 张三 '[{"name":"鬼泣","job_name":"soul_bender"}]'
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py add --by-nickname 张三 '[{"name":"奶妈","job_name":"crusader_female"}]'
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py add --by-account zhangsan '[{"name":"狂战","job_name":"berserker"}]'
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py list 张三
```

- [ ] **Step 2: 在 README 开头功能简介补一句「支持按账号或昵称录入/查询角色」。**

- [ ] **Step 3: 提交**

```bash
git add skills/dnfer-characters/README.md
git commit -m "docs: README 补按昵称录入/查询自测示例"
```

---

### Task 6: 全量回归

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/pytest -q`
Expected: 全部 PASS。

- [ ] **Step 2: skill 脚本手动冒烟（可选，需后端已启动）**——按 Task 5 README 自测命令验证默认昵称回退、`--by-account` 两种路径。

- [ ] **Step 3: 确认 git 状态干净**

Run: `git status --short`
Expected: 无未提交改动（所有任务均已 commit）。
