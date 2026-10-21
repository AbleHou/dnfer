# dnfer-characters 统计功能 —— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `skills/dnfer-characters` 技能新增统计能力：`stats` 总览（有效用户数 + 每用户角色数 + 输出/辅助·职业大类·具体职业三粒度分布）与 `search` 按职业/大类/输出·辅助查角色清单（可选携带玩家信息）。

**Architecture:** 后端在 bot 路由（`/api/public`，`require_api_token`）新增两个端点：`GET /stats/overview` 与 `GET /stats/characters`；职业/大类解析助手 `_resolve_job`/`_resolve_category` 在 bot.py 内实现（`Character` 表不存 `parent_name`，经 `jobs.job_tree()`/`job_meta()` 内存映射）。脚本 `dnfer_api.py` 新增 `stats`/`search` 子命令。口径统一为有效用户（非封禁、非临时）。

**Tech Stack:** Python 3 + FastAPI + SQLAlchemy 2 + pydantic；skill 脚本为纯标准库（urllib）。测试 pytest。

**Spec:** `docs/superpowers/specs/2026-10-21-dnfer-characters-stats-design.md`

**测试命令（每任务通用）：**
- 后端：`cd backend && .venv/bin/python -m pytest tests/test_bot_stats.py -v`（或指定 `::test_name`）
- 脚本单测：`cd backend && .venv/bin/python -m pytest tests/test_dnfer_api_script.py -v`
- 全量后端：`cd backend && .venv/bin/python -m pytest -v`

**提交约定：** `[feat]/[fix]/[ref]/[test]/[docs]` + 中文描述 + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 尾注。直接提交到 main（项目既定约定，不做 worktree）。只 `git add` 本任务涉及的文件。

---

## 文件结构

| 文件 | 职责 | 改动 |
|------|------|------|
| `backend/app/schemas.py` | Bot* 统计 Schema | 加 `BotUserCharCount`/`BotClassTypeCount`/`BotCategoryCount`/`BotJobCount`/`BotStatsOverview`/`BotSearchItem`/`BotSearchResult` |
| `backend/app/routers/bot.py` | 两个统计端点 + 解析助手 | 加 `_resolve_job`/`_resolve_category`、`stats_overview`、`stats_characters`；import `func` |
| `backend/tests/test_bot_stats.py` | 端点测试 | 新建 |
| `skills/dnfer-characters/scripts/dnfer_api.py` | 脚本子命令 | 加 `stats`/`search` + docstring 用法更新 |
| `backend/tests/test_dnfer_api_script.py` | 脚本纯函数单测 | 新建（importlib 加载） |
| `skills/dnfer-characters/SKILL.md` | 群聊使用说明 | 加「统计」小节 + 职业 code 表补充 |
| `skills/dnfer-characters/README.md` | 自测命令 | 追加 stats/search 示例 |

---

## Task 1: 后端 overview 端点 + Schema（TDD）

**Files:**
- Modify: `backend/app/schemas.py`（在 `BotCharacterList` 之后、`BotRegisterIn` 之前插入）
- Modify: `backend/app/routers/bot.py`（`from sqlalchemy import func, select`；在 `list_characters` 端点之后新增）
- Test: `backend/tests/test_bot_stats.py`（新建）

- [ ] **Step 1: 写失败测试** `backend/tests/test_bot_stats.py`

```python
from .helpers import register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}


def _bot_add(client, account, chars):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": account, "characters": chars})
    assert r.status_code == 200


def test_requires_token(client):
    assert client.get("/api/public/stats/overview").status_code == 401
    assert client.get("/api/public/stats/overview",
                      headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_overview_valid_users_and_distributions(client, admin_headers):
    register_user(client, "u1", "甲")
    register_user(client, "u2", "乙")
    # 临时用户（guest）与封禁用户不计入
    g = client.post("/api/admin/users", headers=admin_headers,
                    json={"nickname": "来客", "characters": [{"name": "奶", "job_name": "crusader_female"}]})
    assert g.status_code == 200
    gu = g.json()["user"]
    client.post(f"/api/admin/users/{gu['id']}/ban", headers=admin_headers)

    _bot_add(client, "u1", [
        {"name": "剑魂", "job_name": "weapon_master", "fame": 210000},
        {"name": "奶妈", "job_name": "crusader_female", "fame": 190000},
    ])
    _bot_add(client, "u2", [
        {"name": "狂战", "job_name": "berserker", "fame": 200000},
        {"name": "气功", "job_name": "nenmaster_male", "fame": 180000},
    ])

    r = client.get("/api/public/stats/overview", headers=TOKEN)
    assert r.status_code == 200
    body = r.json()
    # 有效用户数：3 = 群主(admin 种入，0 角色) + 甲 + 乙（guest 不计、封禁 guest 更不计）
    assert body["total_users"] == 3
    # 每用户角色数（含 0 角色用户），按角色数降序、昵称码点序 tie-break（乙 < 甲）
    assert body["users"] == [
        {"nickname": "乙", "character_count": 2},
        {"nickname": "甲", "character_count": 2},
        {"nickname": "群主", "character_count": 0},
    ]
    # 三粒度分布
    assert body["class_types"] == [
        {"class_type": "输出", "count": 3},   # weapon_master + berserker + nenmaster_male
        {"class_type": "辅助", "count": 1},   # crusader_female
    ]
    cats = {c["name"]: c["count"] for c in body["categories"]}
    # weapon_master+berserker→swordman_male、nenmaster_male→fighter_male、crusader_female→priest_female
    assert cats == {"swordman_male": 2, "fighter_male": 1, "priest_female": 1}
    jobs = {j["job_name"]: (j["job_title"], j["count"]) for j in body["jobs"]}
    assert jobs["weapon_master"] == ("极诣·剑魂", 1)
    assert jobs["berserker"] == ("极诣·狂战士", 1)
    assert jobs["nenmaster_male"] == ("归元·气功师", 1)
    assert jobs["crusader_female"] == ("光启·光明骑士", 1)


def test_overview_users_include_zero_char_user(client):
    register_user(client, "u1", "有角色")
    register_user(client, "u2", "没角色")
    _bot_add(client, "u1", [{"name": "剑魂", "job_name": "weapon_master"}])
    body = client.get("/api/public/stats/overview", headers=TOKEN).json()
    assert body["total_users"] == 3  # 群主(admin) 也是有效用户
    assert body["users"] == [
        {"nickname": "有角色", "character_count": 1},
        {"nickname": "没角色", "character_count": 0},   # 没 < 群（码点序）
        {"nickname": "群主", "character_count": 0},
    ]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_stats.py -v`
Expected: FAIL（`404` route not found —— 端点未实现）

- [ ] **Step 3: 加 Schema（schemas.py）**

在 `class BotCharacterList` 之后插入：

```python
class BotUserCharCount(BaseModel):
    nickname: str
    character_count: int

class BotClassTypeCount(BaseModel):
    class_type: str
    count: int

class BotCategoryCount(BaseModel):
    name: str      # parent_name code，如 swordman_male
    title: str     # 大类 title，如 鬼剑士(男)
    count: int

class BotJobCount(BaseModel):
    job_name: str
    job_title: str
    count: int

class BotStatsOverview(BaseModel):
    total_users: int
    users: list[BotUserCharCount]
    class_types: list[BotClassTypeCount]
    categories: list[BotCategoryCount]
    jobs: list[BotJobCount]
```

- [ ] **Step 4: 实现 overview 端点（bot.py）**

`from sqlalchemy import func, select`（在 bot.py 第 4 行 import 处追加 `func`）；`from ..schemas import ...` 追加 `BotCategoryCount, BotClassTypeCount, BotJobCount, BotStatsOverview, BotUserCharCount`。在 `list_characters` 端点之后新增：

```python
@router.get("/stats/overview", response_model=BotStatsOverview)
def stats_overview(db: Session = Depends(get_db)):
    valid = db.query(User).filter(User.is_banned.is_(False),
                                  User.is_guest.is_(False)).all()
    valid_ids = [u.id for u in valid]

    counts = dict(db.query(Character.user_id, func.count())
                  .filter(Character.user_id.in_(valid_ids))
                  .group_by(Character.user_id).all())
    users = sorted(
        (BotUserCharCount(nickname=u.nickname, character_count=counts.get(u.id, 0))
         for u in valid),
        key=lambda r: (-r.character_count, r.nickname),
    )

    rows = db.query(Character.job_name, Character.class_type, func.count()) \
        .filter(Character.user_id.in_(valid_ids)) \
        .group_by(Character.job_name, Character.class_type).all()
    job_totals: dict[str, int] = {}
    class_totals: dict[str, int] = {}
    cat_totals: dict[str, int] = {}
    for job_name, class_type, cnt in rows:
        job_totals[job_name] = job_totals.get(job_name, 0) + cnt
        class_totals[class_type] = class_totals.get(class_type, 0) + cnt
        meta = job_data.job_meta(job_name)
        parent = meta["parent_name"] if meta else job_name
        cat_totals[parent] = cat_totals.get(parent, 0) + cnt

    cat_titles = {c["name"]: c["title"] for c in job_data.job_tree()}
    jobs = sorted(
        (BotJobCount(job_name=j, job_title=(job_data.job_meta(j) or {"title": j})["title"], count=c)
         for j, c in job_totals.items()),
        key=lambda r: (-r.count, r.job_title))
    categories = sorted(
        (BotCategoryCount(name=p, title=cat_titles.get(p, p), count=c)
         for p, c in cat_totals.items()),
        key=lambda r: (-r.count, r.title))
    class_types = sorted(
        (BotClassTypeCount(class_type=t, count=c) for t, c in class_totals.items()),
        key=lambda r: (-r.count, r.class_type))
    return BotStatsOverview(total_users=len(valid), users=users,
                            class_types=class_types, categories=categories, jobs=jobs)
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_stats.py -v`
Expected: PASS（overview 相关用例）

- [ ] **Step 6: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/bot.py backend/tests/test_bot_stats.py
git commit -m "[feat] bot：新增 GET /api/public/stats/overview 统计总览（有效用户数 + 每用户角色数 + 三粒度职业分布）
（Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com> 尾注，用 heredoc 写完整消息）"
```

---

## Task 2: 后端 characters 端点（TDD）

**Files:**
- Modify: `backend/app/schemas.py`（追加 `BotSearchItem`/`BotSearchResult`）
- Modify: `backend/app/routers/bot.py`（追加 `_resolve_job`/`_resolve_category` + `stats_characters` 端点）
- Test: `backend/tests/test_bot_stats.py`

- [ ] **Step 1: 写失败测试**（追加到 `test_bot_stats.py`）

```python
def _mk_sword(client, account, nickname, job="weapon_master", fame=200000):
    register_user(client, account, nickname)
    _bot_add(client, account, [{"name": "剑", "job_name": job, "fame": fame}])


def test_characters_by_job_code_and_title(client):
    _mk_sword(client, "a1", "甲")
    _mk_sword(client, "a2", "乙", job="berserker", fame=300000)
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"job": "weapon_master"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["job_name"] == "weapon_master"
    assert body["items"][0]["owner_nickname"] is None  # 默认不带玩家信息
    # title 精确匹配同样命中
    r2 = client.get("/api/public/stats/characters", headers=TOKEN,
                    params={"job": "极诣·剑魂"})
    assert r2.json()["total"] == 1


def test_characters_gender_split_title(client):
    _mk_sword(client, "a1", "甲", job="crusader_male", fame=100000)
    _mk_sword(client, "a2", "乙", job="crusader_female", fame=100000)
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"job": "光启·光明骑士"})
    assert r.status_code == 200
    assert r.json()["total"] == 2  # 男+女两个 code 都命中
    jobs = {i["job_name"] for i in r.json()["items"]}
    assert jobs == {"crusader_male", "crusader_female"}


def test_characters_by_category_name_and_prefix(client):
    _mk_sword(client, "a1", "甲", job="weapon_master", fame=100000)   # swordman_male 鬼剑士(男)
    _mk_sword(client, "a2", "乙", job="sword_master", fame=100000)    # swordman_female 鬼剑士(女)
    _mk_sword(client, "a3", "丙", job="berserker", fame=100000)       # swordman_male
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"category": "swordman_female"})
    assert r.json()["total"] == 1
    # title 前缀「鬼剑士」命中男女两个大类
    r2 = client.get("/api/public/stats/characters", headers=TOKEN,
                    params={"category": "鬼剑士"})
    assert r2.json()["total"] == 3


def test_characters_by_class_type(client):
    _mk_sword(client, "a1", "甲", job="weapon_master", fame=100000)   # 输出
    _mk_sword(client, "a2", "乙", job="crusader_female", fame=100000) # 辅助
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"class_type": "输出"})
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["job_name"] == "weapon_master"


def test_characters_filters_combine_with_and(client):
    _mk_sword(client, "a1", "甲", job="weapon_master", fame=100000)    # swordman_male/输出
    _mk_sword(client, "a2", "乙", job="crusader_female", fame=100000)  # priest_female/辅助
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"category": "swordman_male", "class_type": "输出"})
    assert r.json()["total"] == 1  # AND：大类与输出 同时命中才计入
    r2 = client.get("/api/public/stats/characters", headers=TOKEN,
                    params={"category": "swordman_male", "class_type": "辅助"})
    assert r2.json()["total"] == 0  # swordman_male 无辅助 → 交集为空


def test_characters_with_owner_flag(client):
    _mk_sword(client, "a1", "甲")
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"job": "weapon_master", "with_owner": "true"})
    body = r.json()
    assert body["items"][0]["owner_nickname"] == "甲"


def test_characters_sorted_by_fame_desc(client):
    _mk_sword(client, "a1", "甲", fame=100000)
    _mk_sword(client, "a2", "乙", fame=500000)
    _mk_sword(client, "a3", "丙", fame=300000)
    body = client.get("/api/public/stats/characters", headers=TOKEN,
                      params={"job": "weapon_master"}).json()
    fames = [i["fame"] for i in body["items"]]
    assert fames == [500000, 300000, 100000]


def test_characters_excludes_guest_and_banned(client, admin_headers):
    _mk_sword(client, "a1", "甲")
    g = client.post("/api/admin/users", headers=admin_headers,
                    json={"nickname": "来客", "characters": [{"name": "剑", "job_name": "weapon_master"}]})
    gu = g.json()["user"]
    b = client.post("/api/admin/users", headers=admin_headers,
                    json={"nickname": "封客", "characters": [{"name": "剑2", "job_name": "weapon_master"}]})
    bu = b.json()["user"]
    client.post(f"/api/admin/users/{bu['id']}/ban", headers=admin_headers)
    body = client.get("/api/public/stats/characters", headers=TOKEN,
                      params={"job": "weapon_master"}).json()
    assert body["total"] == 1  # guest 与封禁用户的角色都被排除


def test_characters_validation_errors(client):
    assert client.get("/api/public/stats/characters", headers=TOKEN).status_code == 400
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"class_type": "坦克"})
    assert r.status_code == 400 and r.json()["detail"] == "职业类别无效"
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"job": "nope"})
    assert r.status_code == 400 and r.json()["detail"] == "职业不存在"
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"category": "nope"})
    assert r.status_code == 400 and r.json()["detail"] == "职业类别不存在"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_stats.py -v`
Expected: FAIL（`404` —— characters 端点未实现）

- [ ] **Step 3: 加 Schema（schemas.py）**

在 `BotStatsOverview` 之后追加：

```python
class BotSearchItem(CharacterOut):
    owner_nickname: str | None = None   # 仅 with_owner=True 时填充

class BotSearchResult(BaseModel):
    items: list[BotSearchItem]
    total: int
```

- [ ] **Step 4: 实现解析助手 + characters 端点（bot.py）**

`from ..schemas import ...` 追加 `BotSearchItem, BotSearchResult`。在 `stats_overview` 之前新增两个解析助手：

```python
def _resolve_job(job: str) -> list[str] | None:
    """按职业 code 或精确 title 解析为 job_name code 列表（性别双职业 title 命中多个）。"""
    if job_data.job_meta(job) is not None:
        return [job]
    codes = [c["name"] for cat in job_data.job_tree()
             for c in cat["children"] if c["title"] == job]
    return codes or None


def _resolve_category(category: str) -> list[str] | None:
    """按大类 code 或 title 前缀解析为一组 job_name code（鬼剑士 → 男/女两个大类）。"""
    codes: list[str] = []
    for cat in job_data.job_tree():
        if cat["name"] == category or cat["title"].startswith(category):
            codes.extend(c["name"] for c in cat["children"])
    return codes or None
```

在 `stats_overview` 端点之后新增：

```python
@router.get("/stats/characters", response_model=BotSearchResult)
def stats_characters(job: str | None = None, category: str | None = None,
                     class_type: str | None = None, with_owner: bool = False,
                     db: Session = Depends(get_db)):
    if job is None and category is None and class_type is None:
        raise HTTPException(400, "job/category/class_type 至少提供一个")
    if class_type is not None and class_type not in ("输出", "辅助"):
        raise HTTPException(400, "职业类别无效")
    q = db.query(Character).join(Character.owner).filter(
        User.is_banned.is_(False), User.is_guest.is_(False))
    if job is not None:
        codes = _resolve_job(job)
        if not codes:
            raise HTTPException(400, "职业不存在")
        q = q.filter(Character.job_name.in_(codes))
    if category is not None:
        codes = _resolve_category(category)
        if not codes:
            raise HTTPException(400, "职业类别不存在")
        q = q.filter(Character.job_name.in_(codes))
    if class_type is not None:
        q = q.filter(Character.class_type == class_type)
    rows = q.order_by(Character.fame.desc(), Character.id.asc()).all()
    items = [BotSearchItem(**character_out(c).model_dump(),
                           owner_nickname=c.owner.nickname if with_owner else None)
             for c in rows]
    return BotSearchResult(items=items, total=len(items))
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_bot_stats.py -v`
Expected: PASS（全部用例）

- [ ] **Step 6: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/bot.py backend/tests/test_bot_stats.py
git commit -m "[feat] bot：新增 GET /api/public/stats/characters 按职业/大类/输出·辅助查角色（with_owner 开关）
（Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com> 尾注）"
```

---

## Task 3: 脚本 stats/search 子命令（TDD）

**Files:**
- Modify: `skills/dnfer-characters/scripts/dnfer_api.py`
- Test: `backend/tests/test_dnfer_api_script.py`（新建）

- [ ] **Step 1: 写失败测试** `backend/tests/test_dnfer_api_script.py`

```python
"""dnfer_api.py 纯函数单测（importlib 加载 skill 脚本，零依赖）。"""
import importlib.util
from pathlib import Path
import urllib.parse

_SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "dnfer-characters" / "scripts" / "dnfer_api.py"
_spec = importlib.util.spec_from_file_location("dnfer_api", _SCRIPT)
dnfer_api = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dnfer_api)

DEFAULT_BASE = "http://127.0.0.1:8000"


def test_stats_calls_overview(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url))
        return {"total_users": 3, "users": [], "class_types": [], "categories": [], "jobs": []}
    monkeypatch.setattr(dnfer_api, "_request", fake_request)
    assert dnfer_api.cmd_stats() == 0
    assert calls == [("GET", f"{DEFAULT_BASE}/api/public/stats/overview")]


def test_search_builds_query(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append(url)
        return {"items": [], "total": 0}
    monkeypatch.setattr(dnfer_api, "_request", fake_request)
    dnfer_api.cmd_search(job="weapon_master", category=None,
                         class_type="输出", with_owner=True)
    url = calls[0]
    assert url.startswith(f"{DEFAULT_BASE}/api/public/stats/characters?")
    qs = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    assert qs["job"] == ["weapon_master"]
    assert qs["class_type"] == ["输出"]
    assert qs["with_owner"] == ["true"]


def test_search_chinese_category_quoted(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append(url)
        return {"items": [], "total": 0}
    monkeypatch.setattr(dnfer_api, "_request", fake_request)
    dnfer_api.cmd_search(job=None, category="鬼剑士", class_type=None, with_owner=False)
    url = calls[0]
    assert "鬼剑士" in urllib.parse.unquote(url)


def test_search_no_filter_passes_through(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append(url)
        return {"ok": False, "status": 400, "error": "job/category/class_type 至少提供一个"}
    monkeypatch.setattr(dnfer_api, "_request", fake_request)
    assert dnfer_api.cmd_search(None, None, None, False) == 1
    assert calls[0].endswith("/api/public/stats/characters?")
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_api_script.py -v`
Expected: FAIL（`AttributeError: module has no attribute 'cmd_stats'` / `cmd_search`）

- [ ] **Step 3: 实现脚本子命令（dnfer_api.py）**

在 `cmd_register` 之后新增两个命令函数：

```python
def cmd_stats() -> int:
    result = _request("GET", f"{_base()}/api/public/stats/overview")
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok") is False:
        print(f"[dnfer] 统计失败：{result.get('error')}", file=sys.stderr)
        return 1
    print(f"[dnfer] 共 {result.get('total_users', 0)} 名有效用户", file=sys.stderr)
    return 0


def cmd_search(job: str | None, category: str | None, class_type: str | None,
               with_owner: bool) -> int:
    params = []
    if job:
        params.append(("job", job))
    if category:
        params.append(("category", category))
    if class_type:
        params.append(("class_type", class_type))
    if with_owner:
        params.append(("with_owner", "true"))
    query = "&".join(f"{k}={urllib.parse.quote(v)}" for k, v in params)
    result = _request("GET", f"{_base()}/api/public/stats/characters?{query}")
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok") is False:
        print(f"[dnfer] 查询失败：{result.get('error')}", file=sys.stderr)
        return 1
    print(f"[dnfer] 找到 {result.get('total', 0)} 个匹配角色", file=sys.stderr)
    return 0
```

在 `main()` 中注册子命令（`p_register` 之后）：

```python
    sub.add_parser("stats", help="统计总览（有效用户数 + 每用户角色数 + 职业分布）")

    p_search = sub.add_parser("search", help="按职业/大类/输出·辅助查询角色清单")
    p_search.add_argument("--job", help="职业 code 或精确 title，如 weapon_master / 极诣·剑魂")
    p_search.add_argument("--category", help="职业大类 code 或 title 前缀，如 swordman_male / 鬼剑士")
    p_search.add_argument("--class-type", help="输出 或 辅助")
    p_search.add_argument("--with-owner", action="store_true", help="携带所属玩家昵称")
```

分派处（`if args.cmd == "register"` 之后）：

```python
    if args.cmd == "stats":
        return cmd_stats()
    if args.cmd == "search":
        return cmd_search(args.job, args.category, args.class_type, args.with_owner)
```

更新模块顶部 docstring「用法」块：

```
  DNFER_API_TOKEN=xxx python dnfer_api.py stats
  DNFER_API_TOKEN=xxx python dnfer_api.py search --job weapon_master [--category 鬼剑士] [--class-type 输出] [--with-owner]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_api_script.py -v`
Expected: PASS

- [ ] **Step 5: 全量后端回归**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全 PASS（确认 bot.py import/schema 改动没破坏其他用例）

- [ ] **Step 6: 提交**

```bash
git add skills/dnfer-characters/scripts/dnfer_api.py backend/tests/test_dnfer_api_script.py
git commit -m "[feat] dnfer-characters：脚本新增 stats/search 子命令（对齐后端统计端点）
（Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com> 尾注）"
```

---

## Task 4: SKILL.md / README 更新（docs）

**Files:**
- Modify: `skills/dnfer-characters/SKILL.md`
- Modify: `skills/dnfer-characters/README.md`

- [ ] **Step 1: SKILL.md 加「统计」小节**

在「## 查询示例」之后新增（**外层 ` ```markdown ` 是计划文档标记，粘贴到 SKILL.md 时只保留 `## 统计` 起的正文**，内层 ```bash 代码块照抄）：

```markdown
## 统计

群友问「统计 / 有多少人 / 角色分布」时，调用总览；问「统计<职业> / 谁在玩<职业> / 统计输出」时，按职业查角色。

```bash
# 总览：有效用户数 + 每用户角色数 + 输出/辅助·职业大类·具体职业分布
python scripts/dnfer_api.py stats

# 按职业 / 职业大类 / 输出·辅助查角色清单；默认不带玩家信息，--with-owner 携带
python scripts/dnfer_api.py search --job weapon_master
python scripts/dnfer_api.py search --job 极诣·剑魂
python scripts/dnfer_api.py search --category 鬼剑士
python scripts/dnfer_api.py search --category swordman_male
python scripts/dnfer_api.py search --class-type 输出 --with-owner
```

- **统计后**：回复有效用户数、输出/辅助各多少、职业大类分布（可补具体职业分布）；群友要时可以列出每用户角色数。
- **按职业查询后**：列出匹配角色名（默认不带玩家信息）；群友需要知道是谁时用 `--with-owner` 再查；结果为 0 时回复「没有符合条件的角色」。
- **职业参数**：用职业 code（`weapon_master` 剑魂、`berserker` 狂战、`soul_bender` 鬼泣、`crusader_female` 圣骑士·女、`crusader_male` 圣骑士·男 等）或精确 title（如 `极诣·剑魂`）最稳妥；大类用 code（`swordman_male`）或 title 前缀（`鬼剑士` 会命中男/女两个大类）。
```

同时在「## 角色解析规则」职业 code 示例附近补充常用映射（若原文已有则核对补充 `crusader_male` 圣骑士·男）。

- [ ] **Step 2: README.md 自测命令追加**

在「## 自测」代码块末尾（`register 872557240` 之后）追加：

```bash
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py stats
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py search --job weapon_master --with-owner
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py search --category 鬼剑士
```

- [ ] **Step 3: 人工核对**

Read `skills/dnfer-characters/SKILL.md` 全文，确认新小节与既有「回复群友」「职业 code 表」无矛盾、命令示例与脚本实际参数一致（`--job/--category/--class-type/--with-owner`）。

- [ ] **Step 4: 提交**

```bash
git add skills/dnfer-characters/SKILL.md skills/dnfer-characters/README.md
git commit -m "[docs] dnfer-characters：SKILL.md/README 补统计与按职业查角色用法
（Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com> 尾注）"
```

---

## 收尾验收

- [ ] `cd backend && .venv/bin/python -m pytest tests/test_bot_stats.py tests/test_dnfer_api_script.py -v` 全 PASS。
- [ ] `cd backend && .venv/bin/python -m pytest -v` 全量回归 PASS。
- [ ] 手工冒烟（可选，需起后端）：`stats` 与 `search --job weapon_master --with-owner` 输出合理 JSON。
