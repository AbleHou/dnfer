# 机器人角色录入/查询 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增两个机器人接口——按账号批量添加/编辑角色（名称必填，职业缺省极诣·剑魂、名望缺省 100000，编辑部分更新，逐角色返回结果）与按账号查询角色。

**Architecture:** 新建 `backend/app/routers/bot.py`（`prefix=/api/public`，路由级 `require_api_token` 鉴权，与现有 `public.py` 同语义），复用 `members._character_out` 序列化与 `jobs.job_meta/class_type_for`。POST 按 `(user_id, name)` upsert：创建时缺省字段用默认值，编辑（已存在）时仅写入本次提供（非 None）字段、缺失保留原值；进程内 `name→Character` 映射处理同请求重名（`SessionLocal` 为 `autoflush=False`，避免依赖 flush 后查询）。GET 按 username 查角色，按 id 升序。

**Tech Stack:** Python FastAPI + SQLAlchemy + SQLite + pytest。

**规格参考:** `docs/superpowers/specs/2026-09-18-bot-characters-design.md`

---

## 文件结构

- `backend/app/schemas.py` — 追加 5 个模型（`BotCharacterIn`/`BotCharactersIn`/`BotCharacterResult`/`BotCharactersOut`/`BotCharacterList`）
- `backend/app/routers/bot.py` — 新路由（POST + GET 两个端点）
- `backend/app/main.py` — 注册 bot 路由
- `backend/tests/test_bot_characters.py` — 新测试
- `README.md` — 机器人 API 表格补充两个端点

不改 DB 模型、不改迁移、无前端改动。

运行测试：`cd backend && ./.venv/bin/python -m pytest tests/test_bot_characters.py -v`

提交信息沿用仓库风格：`[fet]` 功能、`docs:` 文档。

---

## Task 1: Bot schemas + 批量录入端点（POST /api/public/characters）

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/bot.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_bot_characters.py`

- [ ] **Step 1: 写失败测试（POST）**

创建 `backend/tests/test_bot_characters.py`：

```python
from .helpers import register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}

def test_requires_token(client):
    assert client.post("/api/public/characters", json={}).status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.post("/api/public/characters", json={}, headers=bad).status_code == 401

def test_create_with_defaults(client):
    register_user(client, "p1", "甲")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p1", "characters": [{"name": "剑魂"}]})
    assert r.status_code == 200
    body = r.json()
    assert body["account"] == "p1"
    res = body["results"][0]
    assert res["ok"] is True and res["action"] == "created"
    assert res["character"]["job_name"] == "weapon_master"
    assert res["character"]["job_title"] == "极诣·剑魂"
    assert res["character"]["fame"] == 100000

def test_upsert_updates_by_name(client):
    h, _ = register_user(client, "p2", "乙")
    url = "/api/public/characters"
    client.post(url, headers=TOKEN, json={"account": "p2", "characters": [
        {"name": "剑魂", "job_name": "weapon_master", "fame": 21000,
         "simulated_damage": 680000}]})
    r = client.post(url, headers=TOKEN, json={"account": "p2", "characters": [
        {"name": "剑魂", "fame": 30000}]})
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["ok"] is True and res["action"] == "updated"
    c = res["character"]
    assert c["fame"] == 30000
    assert c["job_name"] == "weapon_master"      # 职业未提供 → 保留原值
    assert c["simulated_damage"] == 680000        # 数值未提供 → 保留原值

def test_invalid_job_partial_failure(client):
    register_user(client, "p3", "丙")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p3", "characters": [
            {"name": "剑魂"},
            {"name": "乱来", "job_name": "not_a_job"}]})
    assert r.status_code == 200
    results = r.json()["results"]
    assert results[0]["ok"] is True and results[0]["action"] == "created"
    assert results[1]["ok"] is False
    assert results[1]["error"] == "职业不存在"

def test_edit_with_invalid_job_rejected(client):
    h, _ = register_user(client, "p4", "丁")
    client.post("/api/public/characters", headers=TOKEN, json={"account": "p4",
        "characters": [{"name": "剑魂", "job_name": "weapon_master", "fame": 21000}]})
    r = client.post("/api/public/characters", headers=TOKEN, json={"account": "p4",
        "characters": [{"name": "剑魂", "job_name": "not_a_job", "fame": 50000}]})
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["ok"] is False and res["error"] == "职业不存在"
    chars = client.get("/api/me/characters", headers=h).json()
    assert chars[0]["fame"] == 21000 and chars[0]["job_name"] == "weapon_master"

def test_batch_multiple_results(client):
    register_user(client, "p5", "戊")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p5", "characters": [
            {"name": "剑魂"}, {"name": "鬼泣", "job_name": "soul_bender"}]})
    assert r.status_code == 200
    assert len(r.json()["results"]) == 2

def test_duplicate_names_in_one_request(client):
    h, _ = register_user(client, "p6", "己")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p6", "characters": [
            {"name": "剑魂", "fame": 1000},
            {"name": "剑魂", "fame": 2000}]})
    assert r.status_code == 200
    results = r.json()["results"]
    assert [x["action"] for x in results] == ["created", "updated"]
    assert results[1]["character"]["fame"] == 2000
    chars = client.get("/api/me/characters", headers=h).json()
    assert len(chars) == 1 and chars[0]["fame"] == 2000

def test_empty_characters_list(client):
    register_user(client, "p7", "庚")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p7", "characters": []})
    assert r.status_code == 200
    assert r.json()["results"] == []

def test_post_nonexistent_account(client):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "nobody", "characters": [{"name": "x"}]})
    assert r.status_code == 404
```

> 注：POST 失败测试里用现有 `GET /api/me/characters`（`register_user` 返回的登录头）校验落库结果，不依赖尚未实现的 GET `/api/public/characters`。

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_bot_characters.py -v`
Expected: FAIL（POST 路由未注册 → SPA 静态兜底对 POST 返回 405，各用例拿不到 200/401/404 预期状态码）

- [ ] **Step 3: 新增 schema**

`backend/app/schemas.py` 末尾追加：

```python
class BotCharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    job_name: str | None = Field(default=None, min_length=1, max_length=64)
    fame: int | None = Field(default=None, ge=0)
    simulated_damage: int | None = None
    sustained_dps: int | None = None
    buff_amount: int | None = None

class BotCharactersIn(BaseModel):
    account: str = Field(min_length=1, max_length=64)
    characters: list[BotCharacterIn]

class BotCharacterResult(BaseModel):
    name: str
    ok: bool
    action: Literal["created", "updated"] | None = None
    error: str | None = None
    character: CharacterOut | None = None

class BotCharactersOut(BaseModel):
    account: str
    results: list[BotCharacterResult]

class BotCharacterList(BaseModel):
    account: str
    nickname: str
    characters: list[CharacterOut]
```

（`Literal`、`Field`、`BaseModel` 已在 schemas.py 顶部导入。）

- [ ] **Step 4: 新增 bot 路由（POST）**

创建 `backend/app/routers/bot.py`：

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs as job_data
from ..auth import require_api_token
from ..db import get_db
from ..models import Character, User
from ..schemas import (BotCharacterList, BotCharacterResult, BotCharactersIn,
                       BotCharactersOut)
from .members import _character_out

router = APIRouter(prefix="/api/public", tags=["bot"],
                   dependencies=[Depends(require_api_token)])

DEFAULT_JOB = "weapon_master"   # 极诣·剑魂
DEFAULT_FAME = 100000

def _get_user(db: Session, account: str) -> User:
    user = db.scalars(select(User).where(User.username == account)).first()
    if user is None:
        raise HTTPException(404, "账号不存在")
    return user

def _apply_partial(c: Character, body: "BotCharacterIn") -> None:
    """编辑（同名已存在）：仅写入本次提供（非 None）的字段，缺失保留原值。"""
    if body.job_name is not None:
        c.job_name = body.job_name
        c.class_type = job_data.class_type_for(body.job_name)
    if body.fame is not None:
        c.fame = body.fame
    if body.simulated_damage is not None:
        c.simulated_damage = body.simulated_damage
    if body.sustained_dps is not None:
        c.sustained_dps = body.sustained_dps
    if body.buff_amount is not None:
        c.buff_amount = body.buff_amount

@router.post("/characters", response_model=BotCharactersOut)
def upsert_characters(body: BotCharactersIn, db: Session = Depends(get_db)):
    user = _get_user(db, body.account)
    seen: dict[str, Character] = {}
    results: list[BotCharacterResult] = []
    for item in body.characters:
        if item.job_name is not None and job_data.job_meta(item.job_name) is None:
            results.append(BotCharacterResult(name=item.name, ok=False, error="职业不存在"))
            continue
        c = seen.get(item.name)
        if c is None:
            c = db.scalars(select(Character).where(
                Character.user_id == user.id, Character.name == item.name)).first()
        if c is None:
            job = item.job_name or DEFAULT_JOB
            c = Character(user_id=user.id, name=item.name, job_name=job,
                          class_type=job_data.class_type_for(job),
                          fame=item.fame if item.fame is not None else DEFAULT_FAME,
                          simulated_damage=item.simulated_damage,
                          sustained_dps=item.sustained_dps, buff_amount=item.buff_amount)
            db.add(c)
            db.flush()
            seen[item.name] = c
            results.append(BotCharacterResult(name=item.name, ok=True, action="created",
                                              character=_character_out(c)))
        else:
            seen[item.name] = c
            _apply_partial(c, item)
            results.append(BotCharacterResult(name=item.name, ok=True, action="updated",
                                              character=_character_out(c)))
    db.commit()
    return BotCharactersOut(account=body.account, results=results)
```

> 说明：新建后显式 `db.flush()` 以取得 `c.id`（`_character_out` 需要）；`SessionLocal` 为 `autoflush=False`，进程内 `seen` 映射保证同请求重名只更新不建新行。

- [ ] **Step 5: 注册路由**

`backend/app/main.py`：import 行 `from .routers import auth, dungeons, jobs, members, public, raids` 改为 `from .routers import auth, bot, dungeons, jobs, members, public, raids`，并在 `app.include_router(auth.router)` 附近追加 `app.include_router(bot.router)`。

- [ ] **Step 6: 运行测试验证通过**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_bot_characters.py -v`
Expected: 9 passed

> 提示：GET 的 token 401 校验在 Task 2（GET 路由注册后）单独测试。

- [ ] **Step 7: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/schemas.py backend/app/routers/bot.py \
  backend/app/main.py backend/tests/test_bot_characters.py
git commit -m "[fet] 机器人批量录入角色接口"
```

---

## Task 2: 查询端点（GET /api/public/characters）

**Files:**
- Modify: `backend/app/routers/bot.py`
- Modify: `backend/tests/test_bot_characters.py`

- [ ] **Step 1: 写失败测试（GET）**

`backend/tests/test_bot_characters.py` 末尾追加：

```python
def test_get_requires_token(client):
    assert client.get("/api/public/characters").status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.get("/api/public/characters", headers=bad).status_code == 401

def test_get_characters_by_account(client):
    register_user(client, "p8", "辛")
    client.post("/api/public/characters", headers=TOKEN, json={"account": "p8",
        "characters": [{"name": "剑魂"}, {"name": "鬼泣", "job_name": "soul_bender", "fame": 65000}]})
    r = client.get("/api/public/characters", params={"account": "p8"}, headers=TOKEN)
    assert r.status_code == 200
    body = r.json()
    assert body["account"] == "p8"
    assert body["nickname"] == "辛"
    names = [c["name"] for c in body["characters"]]
    assert names == ["剑魂", "鬼泣"]          # 按 id 升序 = 创建顺序
    assert body["characters"][1]["job_name"] == "soul_bender"
    assert body["characters"][1]["fame"] == 65000

def test_get_nonexistent_account(client):
    r = client.get("/api/public/characters", params={"account": "nobody"}, headers=TOKEN)
    assert r.status_code == 404

def test_round_trip(client):
    register_user(client, "p9", "壬")
    client.post("/api/public/characters", headers=TOKEN, json={"account": "p9",
        "characters": [{"name": "奶妈", "job_name": "crusader_female", "buff_amount": 2000}]})
    r = client.get("/api/public/characters", params={"account": "p9"}, headers=TOKEN)
    assert r.status_code == 200
    c = r.json()["characters"][0]
    assert c["name"] == "奶妈"
    assert c["class_type"] == "辅助"
    assert c["buff_amount"] == 2000
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_bot_characters.py -v`
Expected: FAIL（GET 路由未注册 → POST 路由已存在但方法不匹配返回 405，各用例拿不到 401/200/404 预期状态码）

- [ ] **Step 3: 实现 GET 端点**

`backend/app/routers/bot.py` 的 `upsert_characters` 之后追加：

```python
@router.get("/characters", response_model=BotCharacterList)
def list_characters(account: str, db: Session = Depends(get_db)):
    user = _get_user(db, account)
    chars = db.scalars(select(Character).where(Character.user_id == user.id)
                       .order_by(Character.id)).all()
    return BotCharacterList(account=account, nickname=user.nickname,
                            characters=[_character_out(c) for c in chars])
```

- [ ] **Step 4: 运行全部测试验证通过**

Run: `cd backend && ./.venv/bin/python -m pytest`
Expected: 全部通过（新增 13 条 bot 用例 + 既有用例回归）

- [ ] **Step 5: 提交**

```bash
cd /Users/able/toys/dnfer && git add backend/app/routers/bot.py backend/tests/test_bot_characters.py
git commit -m "[fet] 机器人查询角色接口"
```

---

## Task 3: README 文档补充

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新机器人 API 表格**

`README.md` 的「机器人 API」表格（`| 端点 | 说明 |` 下两行之后）追加两行：

```markdown
| `POST /api/public/characters` | 按账号批量添加/编辑角色（名称必填；职业缺省极诣·剑魂、名望缺省 100000；编辑仅更新提供的字段；返回逐角色结果） |
| `GET /api/public/characters?account={账号}` | 查询账号（username）的全部角色 |
```

curl 示例（紧跟现有两条示例之后）追加：

```bash
curl -X POST -H "Authorization: Bearer $DNFER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account":"zhangsan","characters":[{"name":"剑魂"}]}' \
  http://127.0.0.1:8000/api/public/characters
curl -H "Authorization: Bearer $DNFER_API_TOKEN" \
  "http://127.0.0.1:8000/api/public/characters?account=zhangsan"
```

- [ ] **Step 2: 提交**

```bash
cd /Users/able/toys/dnfer && git add README.md
git commit -m "docs: README 补充机器人角色录入/查询接口"
```

---

## 最终验证

- [ ] 后端：`cd backend && ./.venv/bin/python -m pytest` — 全部通过
- [ ] 手动冒烟（dev）：启动后端 → 用 curl 带 `Authorization: Bearer change-me-bot-token` 调 `POST /api/public/characters`（`{"account":"admin","characters":[{"name":"剑魂"}]}`）→ 返回 `action:"created"`、`job_name:"weapon_master"`、`fame:100000` → `GET /api/public/characters?account=admin` 能取回该角色；再 POST 同名角色改 fame → `action:"updated"` 且职业保留
