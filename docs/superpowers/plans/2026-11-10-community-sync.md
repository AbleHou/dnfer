# 社区ID 同步角色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「我的角色」通过 DNF 助手社区ID 同步角色（异步任务 + 独立 web 服务 + 前端同步面板）。

**Architecture:** 独立 sibling 项目 `../dnfer-community-sync/`（FastAPI 内网服务，封装 dnfbbz 协议，仅被 DNfer 后端调用）；DNfer 后端新增「社区同步」模块（`CommunitySyncTask` 表 + 异步任务执行器 + 两个端点）；前端「我的角色」页头新增「同步社区」内联面板（输入社区ID → 建任务 → 轮询状态 → 展示上次结果表格）。角色创建/更新/形象导入全部由后端任务完成，前端零直连 web 服务。

**Tech Stack:** FastAPI / uvicorn（后端与 sibling 服务）、SQLAlchemy 2、stdlib urllib（调 web 服务，零新增依赖）、Vue 3 + Vitest。

**跨仓库说明**：Phase A 的文件建在 sibling 项目 `../dnfer-community-sync/`（**不属于本 repo git，不在此提交**）；Phase B/C 在本 repo，各任务末尾 commit。

**与原 spec 的两处小修正**（实现时以此为准）：
1. web 服务 `GET /portrait` 需 `roleId` + `originalRoleId` 两个参数（dnfbbz 的 portrait-sync 两个都要）；DNfer 执行器从角色 dict 传 `roleId`/`originalRoleId`。
2. config 字段名是 `community_sync_base`（非 spec 写的 `dnfer_community_sync_base`），因 `env_prefix="DNFER_"`，字段 `community_sync_base` → 环境变量 `DNFER_COMMUNITY_SYNC_BASE`（与 spec 的环境变量名一致）。

---

## Phase A：sibling web 服务（`../dnfer-community-sync/`）

### Task A1: 项目脚手架

**Files:**
- Create: `../dnfer-community-sync/requirements.txt`
- Create: `../dnfer-community-sync/README.md`
- Create: `../dnfer-community-sync/.gitignore`
- Create: `../dnfer-community-sync/tests/.keep`

- [ ] **Step 1: 创建目录与 requirements**

```bash
mkdir -p /Users/able/dnfer-community-sync/app /Users/able/dnfer-community-sync/tests
```

`requirements.txt`：
```
fastapi>=0.115
uvicorn[standard]>=0.30
```
（dev 测试用 `pytest`、`httpx`，见 README）

- [ ] **Step 2: 建 venv 并安装依赖**

```bash
cd /Users/able/dnfer-community-sync && python3 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest httpx
```

> 若网络不可用，可临时用 DNfer 后端 venv 跑测试：`/Users/able/toys/dnfer/backend/.venv/bin/python -m pytest`（含 fastapi/uvicorn/httpx/pytest）。

- [ ] **Step 3: README.md**（环境变量与运行方式）

```markdown
# dnfer-community-sync

DNF 助手社区ID → 角色数据的独立内网服务，封装 dnfbbz 协议，仅被 DNfer 后端 worker 调用（不经浏览器）。

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `DNFBBZ_USER` | dnfbbz 登录账号 | `1010268482` |
| `DNFBBZ_PASS` | dnfbbz 登录密码 | `123456` |
| `PORT` | 监听端口 | `8100` |

## 运行

```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${PORT:-8100}
```

## API

- `POST /sync` `{"communityId": "..."}` → `200 {"ok":true,"roles":[...]}`；换绑限流 → `429 {"detail":"换绑限流，请稍后重试","retryAfterSec":300}`；dnfbbz 不可达 → `502 {"detail":...}`
- `GET /portrait?communityId&roleId&originalRoleId` → `200 image/apng`；无形象 → `404`

## 自测

```bash
.venv/bin/python -m pytest
```
```

- [ ] **Step 4: 提交（sibling 项目不在此 repo 提交，跳过）**

---

### Task A2: dnfbbz 客户端 `app/dnfbbz.py`（TDD）

**Files:**
- Create: `../dnfer-community-sync/app/dnfbbz.py`
- Test: `../dnfer-community-sync/tests/test_dnfbbz.py`

- [ ] **Step 1: 写失败测试**（`tests/test_dnfbbz.py`）

```python
import time
from app.dnfbbz import Session, RateLimited

def test_same_community_no_rebind():
    s = Session(user="u", pwd="p")
    s.bound_community = "1"
    calls: list[str] = []
    s._request = lambda method, path, body=None, timeout=20: calls.append(path) or {"ok": True, "roles": []}
    s.sync("1")
    assert "/api/assistant/bind" not in calls

def test_rebind_within_cooldown_raises_rate_limited():
    s = Session(user="u", pwd="p")
    s.bound_community = "1"
    s.last_bind_ts = time.time()  # 刚换绑过
    try:
        s.sync("2")
        assert False, "应抛 RateLimited"
    except RateLimited as e:
        assert 0 < e.retry_after <= 300

def test_rebind_after_cooldown_login_and_bind():
    s = Session(user="u", pwd="p")
    s.bound_community = "1"
    s.last_bind_ts = time.time() - 301
    s.token = None
    calls: list[str] = []
    def fake(method, path, body=None, timeout=20):
        calls.append(path)
        if path == "/api/login": return {"ok": True, "token": "t"}
        if path == "/api/assistant/bind": return {"ok": True, "roleCount": 1}
        if path == "/api/assistant/sync": return {"ok": True, "roles": [{"roleName": "剑魂"}]}
        return {"ok": True}
    s._request = fake
    roles = s.sync("2")
    assert roles == [{"roleName": "剑魂"}]
    assert "/api/login" in calls and "/api/assistant/bind" in calls
    assert s.bound_community == "2"
    assert s.token == "t"

def test_portrait_no_image_returns_none():
    s = Session(user="u", pwd="p")
    s.bound_community = "1"
    s._request = lambda method, path, body=None, timeout=20: {"ok": True, "portrait": {"portrait": None}}
    assert s.portrait("1", "2", "3") is None
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/able/dnfer-community-sync && .venv/bin/python -m pytest tests/test_dnfbbz.py -v
```
Expected: FAIL（`ModuleNotFoundError: No module named 'app'`）

- [ ] **Step 3: 实现 `app/dnfbbz.py`**

```python
"""dnfbbz 协议客户端：登录/换绑/同步/形象。仅标准库。会话为内存态（临时方案）。"""
import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.request

BASE = "https://182.92.225.233:9163"   # 域名 dnfbbz.online 被 ICP 拦截，直连 IP
BBZ_HOST = "dnfbbz.online"
DEFAULT_USER = "1010268482"
DEFAULT_PASS = "123456"
BIND_COOLDOWN_SEC = 300

# 直连 IP，证书为域名签发，这里不校验（自签/域名证书，临时方案）
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


class DnfBbzError(Exception):
    pass


class RateLimited(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = int(retry_after)
        super().__init__(f"换绑限流，请 {self.retry_after} 秒后重试")


class Session:
    """单个共享账号会话；内存 token + 当前绑定社区ID + 上次换绑时间。"""
    def __init__(self, user: str | None = None, pwd: str | None = None, now=None):
        self.user = user or os.environ.get("DNFBBZ_USER", DEFAULT_USER)
        self.pwd = pwd or os.environ.get("DNFBBZ_PASS", DEFAULT_PASS)
        self._now = now or time.time
        self.token: str | None = None
        self.bound_community: str | None = None
        self.last_bind_ts: float = 0.0
        self._lock = threading.Lock()

    def _request(self, method: str, path: str, body=None, timeout: int = 20) -> dict:
        url = BASE + path
        headers = {"User-Agent": "Mozilla/5.0 community-sync", "Host": BBZ_HOST}
        if self.token:
            headers["authorization"] = "Bearer " + self.token
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, context=_CTX, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            raise DnfBbzError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")

    def _login(self) -> None:
        j = self._request("POST", "/api/login", {"username": self.user, "password": self.pwd})
        if not j.get("ok"):
            raise DnfBbzError("登录失败: " + str(j))
        self.token = j["token"]

    def ensure_bound(self, community_id: str) -> None:
        with self._lock:
            if self.bound_community == community_id:
                return
            wait = BIND_COOLDOWN_SEC - (self._now() - self.last_bind_ts)
            if wait > 0:
                raise RateLimited(wait)
            if self.token is None:
                self._login()
            j = self._request("POST", "/api/assistant/bind", {"communityId": community_id})
            if not j.get("ok"):
                raise DnfBbzError("绑定失败: " + str(j.get("error", j)))
            self.bound_community = community_id
            self.last_bind_ts = self._now()

    def sync(self, community_id: str) -> list[dict]:
        self.ensure_bound(community_id)
        j = self._request("POST", "/api/assistant/sync", {"refresh": False})
        if not j.get("ok"):
            raise DnfBbzError("同步失败: " + str(j))
        return j.get("roles", [])

    def portrait(self, community_id: str, role_id: str, original_role_id: str) -> bytes | None:
        self.ensure_bound(community_id)
        j = self._request("POST", "/api/assistant/portrait-sync",
                          {"roleId": str(role_id), "originalRoleId": str(original_role_id)})
        rel = (j.get("portrait") or {}).get("portrait")
        if not rel:
            return None
        req = urllib.request.Request(BASE + rel,
                                     headers={"User-Agent": "Mozilla/5.0", "Host": BBZ_HOST})
        with urllib.request.urlopen(req, context=_CTX, timeout=30) as r:
            return r.read()
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /Users/able/dnfer-community-sync && .venv/bin/python -m pytest tests/test_dnfbbz.py -v
```
Expected: 4 passed

---

### Task A3: FastAPI 应用 `app/main.py`（TDD）

**Files:**
- Create: `../dnfer-community-sync/app/main.py`
- Test: `../dnfer-community-sync/tests/test_api.py`

- [ ] **Step 1: 写失败测试**（`tests/test_api.py`）

```python
from fastapi.testclient import TestClient
from app.main import app, _sess
from app.dnfbbz import RateLimited

client = TestClient(app)

def test_sync_ok(monkeypatch):
    monkeypatch.setattr(_sess, "sync", lambda cid: [{"roleName": "剑魂", "job": "极诣·剑魂"}])
    r = client.post("/sync", json={"communityId": "329230843"})
    assert r.status_code == 200
    assert r.json()["roles"] == [{"roleName": "剑魂", "job": "极诣·剑魂"}]

def test_sync_bad_community_id():
    r = client.post("/sync", json={"communityId": "abc"})
    assert r.status_code == 400

def test_sync_rate_limited(monkeypatch):
    def boom(cid):
        raise RateLimited(120)
    monkeypatch.setattr(_sess, "sync", boom)
    r = client.post("/sync", json={"communityId": "1"})
    assert r.status_code == 429
    assert r.json()["retryAfterSec"] == 120

def test_portrait_ok(monkeypatch):
    monkeypatch.setattr(_sess, "portrait", lambda cid, rid, oid: b"\x89PNG\r\n\x1a\npayload")
    r = client.get("/portrait", params={"communityId": "1", "roleId": "2", "originalRoleId": "3"})
    assert r.status_code == 200
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

def test_portrait_404(monkeypatch):
    monkeypatch.setattr(_sess, "portrait", lambda cid, rid, oid: None)
    r = client.get("/portrait", params={"communityId": "1", "roleId": "2", "originalRoleId": "3"})
    assert r.status_code == 404
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/able/dnfer-community-sync && .venv/bin/python -m pytest tests/test_api.py -v
```
Expected: FAIL（`ModuleNotFoundError: No module named 'app.main'`）

- [ ] **Step 3: 实现 `app/main.py`**

```python
"""内网服务：社区ID → 角色数据（dnfbbz 网关）。仅供 DNfer 后端 worker 调用。"""
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response

from .dnfbbz import DnfBbzError, RateLimited, Session

_sess = Session()
app = FastAPI(title="dnfer-community-sync")


@app.post("/sync")
def sync_roles(body: dict):
    community_id = str(body.get("communityId", ""))
    if not community_id.isdigit():
        raise HTTPException(400, "communityId 必须为纯数字")
    try:
        roles = _sess.sync(community_id)
    except RateLimited as e:
        return JSONResponse(status_code=429,
                            content={"detail": "换绑限流，请稍后重试", "retryAfterSec": e.retry_after})
    except DnfBbzError as e:
        return JSONResponse(status_code=502, content={"detail": str(e)})
    return {"ok": True, "roles": roles}


@app.get("/portrait")
def portrait(communityId: str, roleId: str = "", originalRoleId: str = ""):
    try:
        data = _sess.portrait(communityId, roleId, originalRoleId)
    except RateLimited as e:
        return JSONResponse(status_code=429,
                            content={"detail": "换绑限流，请稍后重试", "retryAfterSec": e.retry_after})
    except DnfBbzError as e:
        return JSONResponse(status_code=502, content={"detail": str(e)})
    if data is None:
        raise HTTPException(404, "无形象图")
    return Response(content=data, media_type="image/apng")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8100")))
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /Users/able/dnfer-community-sync && .venv/bin/python -m pytest tests/ -v
```
Expected: 9 passed（4 + 5）

---

## Phase B：DNfer 后端「社区同步」模块（本 repo）

### Task B1: 模型 + 配置

**Files:**
- Modify: `backend/app/models.py`（文件末尾追加 CommunitySyncTask）
- Modify: `backend/app/config.py:10-22`
- Modify: `.env.example`（仓库根，`DNFER_COMMUNITY_SYNC_BASE` / `DNFER_COMMUNITY_SYNC_MAX_RETRY`）

- [ ] **Step 1: models.py 追加表**

```python
class CommunitySyncTask(Base):
    __tablename__ = "community_sync_tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    community_id: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending/running/success/failed
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
```

- [ ] **Step 2: config.py 追加设置**

```python
    # 社区同步（独立 web 服务，DNfer 后端 worker 内网调用）
    community_sync_base: str = "http://127.0.0.1:8100"
    community_sync_max_retry: int = 3
```

- [ ] **Step 2b: `.env.example`（仓库根）追加**

```
DNFER_COMMUNITY_SYNC_BASE=http://127.0.0.1:8100
DNFER_COMMUNITY_SYNC_MAX_RETRY=3
```

- [ ] **Step 3: 验证无回归**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -c "from app.main import app; print('ok')"
```
Expected: `ok`（create_all 尚未跑，表在首次 init_db 时建）

- [ ] **Step 4: 提交**

```bash
git add backend/app/models.py backend/app/config.py
git commit -m "[feat] 社区同步：CommunitySyncTask 表 + community_sync 配置"
```

---

### Task B2: schemas

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: 追加 schema**（在文件末尾、`class BotRegisterIn` 之后均可）

```python
class CommunitySyncIn(BaseModel):
    communityId: str

class CommunitySyncOut(BaseModel):
    taskId: int

class CommunitySyncTaskOut(BaseModel):
    taskId: int
    status: str
    communityId: str
    message: str | None = None
    result: dict | None = None
    createdAt: str
```

- [ ] **Step 2: 提交**

```bash
git add backend/app/schemas.py
git commit -m "[feat] 社区同步：CommunitySyncIn/Out/TaskOut schemas"
```

---

### Task B3: 职业解析 + web 服务客户端（TDD）

**Files:**
- Create: `backend/app/services/community_sync.py`
- Test: `backend/tests/test_community_sync.py`

- [ ] **Step 1: 写失败测试**（`tests/test_community_sync.py`，先测 `resolve_job`）

```python
from app.services.community_sync import resolve_job

def test_resolve_job_unique_title():
    assert resolve_job("极诣·剑魂") == "weapon_master"
    assert resolve_job("知源·召唤师") == "summoner"
    assert resolve_job("千魂·狩猎者") == "dragoon"
    assert resolve_job("隐夜·暗星") == "rogue"

def test_resolve_job_gender_split_defaults_male():
    assert resolve_job("重霄·漫游枪手(男)") == "ranger_male"
    assert resolve_job("重霄·漫游枪手(女)") == "ranger_male"
    assert resolve_job("光启·光明骑士(男)") == "crusader_male"
    assert resolve_job("光启·蓝拳圣使(男)") == "infighter"
    assert resolve_job("归元·气功师（女）") == "nenmaster_male"

def test_resolve_job_unknown_returns_none():
    assert resolve_job("不存在的职业") is None
    assert resolve_job("") is None
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v
```
Expected: FAIL（`ModuleNotFoundError` / `resolve_job not defined`）

- [ ] **Step 3: 实现 `services/community_sync.py` 前半部分**（resolve_job + 错误类型 + web 客户端）

```python
"""社区同步任务执行器与职业解析。"""
import asyncio
import json
import re
import urllib.error
import urllib.request
from urllib.parse import quote

from .. import jobs as job_data
from ..config import settings
from ..db import SessionLocal
from ..models import Character, CommunitySyncTask, User
from ..s3 import delete_profile, upload_profile
from ..services.parties import ensure_default_party


class CommunitySyncError(Exception):
    pass


class CommunitySyncRateLimited(CommunitySyncError):
    def __init__(self, retry_after_sec: int):
        self.retry_after_sec = int(retry_after_sec)
        super().__init__(f"换绑限流，请 {self.retry_after_sec} 秒后重试")


def resolve_job(dnfbbz_job: str) -> str | None:
    """dnfbbz 中文职业串 → job_name。去 (男)/(女) 后缀；多候选（男女双版）默认男版；未收录 None。"""
    base = re.sub(r"[（(](男|女)[)）]$", "", dnfbbz_job or "")
    cands: list[tuple[str, str]] = []  # (parent title, job_name)
    for cat in job_data.job_tree():
        for c in cat["children"]:
            if c["title"] == base:
                cands.append((cat["title"], c["name"]))
    if not cands:
        return None
    if len(cands) == 1:
        return cands[0][1]
    male = next((name for parent, name in cands if "(男)" in parent), None)
    return male or cands[0][1]


def _community_request(method: str, path: str, body=None, timeout: int = 20) -> tuple[int, bytes]:
    base = settings.community_sync_base.rstrip("/")
    headers = {"Content-Type": "application/json"} if body is not None else {}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError as e:
        raise CommunitySyncError(f"同步服务不可用：{e.reason}")


def _detail_text(raw: bytes, status: int) -> str:
    try:
        d = json.loads(raw)
        if isinstance(d, dict):
            return d.get("detail") or str(d)
        return str(d)
    except Exception:
        return f"同步服务 HTTP {status}"


def sync_roles(community_id: str) -> list[dict]:
    status, raw = _community_request("POST", "/sync", {"communityId": community_id})
    if status == 429:
        retry = 300
        try:
            retry = int(json.loads(raw).get("retryAfterSec", 300))
        except Exception:
            pass
        raise CommunitySyncRateLimited(retry)
    if status != 200:
        raise CommunitySyncError(_detail_text(raw, status))
    return json.loads(raw).get("roles", [])


def fetch_portrait(community_id: str, role_id: str | None, original_role_id: str | None) -> bytes | None:
    if not original_role_id:
        return None
    path = (f"/portrait?communityId={quote(community_id)}"
            f"&roleId={quote(role_id or '')}&originalRoleId={quote(original_role_id)}")
    status, raw = _community_request("GET", path, timeout=30)
    if status == 404:
        return None
    if status != 200:
        raise CommunitySyncError(_detail_text(raw, status))
    return raw
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v
```
Expected: 3 passed

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/community_sync.py backend/tests/test_community_sync.py
git commit -m "[feat] 社区同步：resolve_job 职业解析（默认男）+ web 服务客户端"
```

---

### Task B4: 任务执行器（TDD）

**Files:**
- Modify: `backend/app/services/community_sync.py`
- Test: `backend/tests/test_community_sync.py`（追加）

- [ ] **Step 1: 追加失败测试**（executor：创建/更新/跳过/形象/限流重试/失败）

```python
import asyncio

from app.models import Character, CommunitySyncTask
from app.services.community_sync import (CommunitySyncError, CommunitySyncRateLimited,
                                         run_sync_task)


def _mk_task(db, user_id, community_id="1"):
    t = CommunitySyncTask(user_id=user_id, community_id=community_id, status="pending")
    db.add(t)
    db.commit()
    db.refresh(t)
    return t.id


def _executor(db):
    """把执行器内部的 SessionLocal 指向测试会话（StaticPool 共享连接，避免双会话冲突）。"""
    db.close()  # 关闭当前事务，让执行器接管该会话
    from app.services import community_sync
    community_sync.SessionLocal = lambda: db


def test_run_creates_and_skips(client, db, monkeypatch):
    h, u = register_user(client, "csA", "同步甲")
    roles = [
        {"roleName": "剑魂", "job": "极诣·剑魂", "level": 115, "fame": 133227, "server": "山西",
         "roleId": "1", "originalRoleId": "2"},
        {"roleName": "奶妈", "job": "知源·小魔女", "level": 115, "fame": 129780, "server": "山西",
         "roleId": "3", "originalRoleId": "4"},
        {"roleName": "新职业甲", "job": "未来·新职业", "fame": 1},
    ]
    monkeypatch.setattr("app.services.community_sync.sync_roles", lambda cid: roles)
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "success"
    chars = {c.name: c for c in db.query(Character).filter(Character.user_id == u["id"]).all()}
    assert chars["剑魂"].job_name == "weapon_master"
    assert chars["剑魂"].fame == 133227
    assert chars["奶妈"].job_name == "enchantress"
    assert "新职业甲" not in chars
    skipped = task.result["roles"][2]
    assert skipped["action"] == "skipped" and skipped["reason"] == "职业未收录"
    assert task.result["roles"][0]["action"] == "created"
    assert task.result["roles"][0]["profileImported"] is False


def test_run_updates_fame_keeps_job(client, db, monkeypatch):
    h, u = register_user(client, "csB", "同步乙")
    db.add(Character(user_id=u["id"], name="剑魂", job_name="crusader_female",
                     class_type="辅助", fame=100))  # 预置同名，职业是奶
    db.commit()
    roles = [{"roleName": "剑魂", "job": "极诣·剑魂", "fame": 200}]
    monkeypatch.setattr("app.services.community_sync.sync_roles", lambda cid: roles)
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    char = db.query(Character).filter(Character.user_id == u["id"]).first()
    assert char.job_name == "crusader_female"   # 更新不碰职业
    assert char.fame == 200
    task = db.get(CommunitySyncTask, task_id)
    assert task.result["roles"][0]["action"] == "updated"


def test_run_imports_portrait(client, db, monkeypatch):
    h, u = register_user(client, "csC", "同步丙")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": "剑魂", "job": "极诣·剑魂", "fame": 1, "originalRoleId": "9"}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait",
                        lambda cid, rid, oid: b"\x89PNG\r\n\x1a\npayload")
    monkeypatch.setattr("app.services.community_sync.upload_profile",
                        lambda uid, cid, ext, data, ct: "https://cdn.example.com/p.png")
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    char = db.query(Character).filter(Character.user_id == u["id"]).first()
    assert char.profile == "https://cdn.example.com/p.png"
    task = db.get(CommunitySyncTask, task_id)
    assert task.result["roles"][0]["profileImported"] is True


def test_run_retries_on_rate_limit(client, db, monkeypatch):
    h, u = register_user(client, "csD", "同步丁")
    calls = {"n": 0}
    def flaky(cid):
        calls["n"] += 1
        if calls["n"] == 1:
            raise CommunitySyncRateLimited(1)
        return [{"roleName": "剑魂", "job": "极诣·剑魂", "fame": 1}]
    monkeypatch.setattr("app.services.community_sync.sync_roles", flaky)
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    monkeypatch.setattr("app.config.settings", "community_sync_max_retry", 3)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "success" and calls["n"] == 2


def test_run_fails_after_max_retry(client, db, monkeypatch):
    h, u = register_user(client, "csE", "同步戊")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: (_ for _ in ()).throw(CommunitySyncRateLimited(1)))
    monkeypatch.setattr("app.config.settings", "community_sync_max_retry", 2)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "failed" and "多次换绑限流" in task.message


def test_run_fails_on_service_error(client, db, monkeypatch):
    h, u = register_user(client, "csF", "同步己")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: (_ for _ in ()).throw(CommunitySyncError("同步服务不可用")))
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "failed" and "同步服务不可用" in task.message
```

> 注意：测试顶部需补 `from .helpers import register_user`（conftest 同目录）。`register_user` 返回 `(headers, user_dict)`，`u["id"]` 是用户 id。

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v
```
Expected: FAIL（`run_sync_task not defined`）

- [ ] **Step 3: 实现执行器**（追加到 `services/community_sync.py`）

```python
def _base_result(role: dict) -> dict:
    return {"roleName": role.get("roleName") or "", "job": role.get("job") or None,
            "level": role.get("level"), "fame": role.get("fame"), "server": role.get("server")}


def _import_profile(db, user: User, char: Character, role: dict, community_id: str) -> bool:
    original_role_id = role.get("originalRoleId")
    if not original_role_id:
        return False
    try:
        data = fetch_portrait(community_id, role.get("roleId"), original_role_id)
        if not data:
            return False
        url = upload_profile(user.id, char.id, "png", data, "image/png")
        if char.profile:
            delete_profile(char.profile)
        char.profile = url
        return True
    except Exception:
        return False


def _process_one(db, user: User, community_id: str, role: dict) -> dict:
    role_name = role.get("roleName") or ""
    fame = role.get("fame")
    job_name = resolve_job(role.get("job") or "")
    if job_name is None:
        return {**_base_result(role), "jobName": None, "action": "skipped",
                "reason": "职业未收录", "characterId": None, "profileImported": False}
    c = db.query(Character).filter(Character.user_id == user.id,
                                   Character.name == role_name).order_by(Character.id).first()
    if c is None:
        c = Character(user_id=user.id, name=role_name, job_name=job_name,
                      class_type=job_data.class_type_for(job_name),
                      fame=fame if fame is not None else 100000,
                      adventure_party_id=ensure_default_party(db, user).id)
        db.add(c)
        db.flush()
        action = "created"
    else:
        if fame is not None:
            c.fame = fame
        action = "updated"
    profile_ok = _import_profile(db, user, c, role, community_id)
    return {**_base_result(role), "jobName": job_name, "action": action,
            "characterId": c.id, "profileImported": profile_ok}


def _process_roles(db, user_id: int, community_id: str, roles: list[dict]) -> list[dict]:
    user = db.get(User, user_id)
    if user is None:
        raise CommunitySyncError("用户不存在")
    results: list[dict] = []
    for role in roles:
        try:
            r = _process_one(db, user, community_id, role)
        except Exception as e:
            r = {**_base_result(role), "jobName": None, "action": "failed",
                 "reason": str(e), "characterId": None, "profileImported": False}
        results.append(r)
        db.commit()  # 逐角色提交，单个失败不丢前面已建角色
    return results


async def run_sync_task(task_id: int) -> None:
    """异步执行器：调 web 服务 → 限流重试 → 逐角色 upsert + 形象 best-effort。"""
    db = SessionLocal()
    try:
        task = db.get(CommunitySyncTask, task_id)
        if task is None:
            return
        task.status = "running"
        db.commit()
        community_id = task.community_id
        max_retry = settings.community_sync_max_retry
        for attempt in range(1, max_retry + 1):
            try:
                roles = await asyncio.to_thread(sync_roles, community_id)
                break
            except CommunitySyncRateLimited as e:
                task.message = f"换绑限流，等待 {e.retry_after_sec} 秒后重试"
                db.commit()
                if attempt >= max_retry:
                    task.status = "failed"
                    task.message = "多次换绑限流，请稍后再试"
                    db.commit()
                    return
                await asyncio.sleep(e.retry_after_sec)
            except CommunitySyncError as e:
                task.status = "failed"
                task.message = str(e)
                db.commit()
                return
        results = _process_roles(db, task.user_id, community_id, roles)
        task.status = "success"
        task.result = {"roles": results}
        db.commit()
    finally:
        db.close()
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v
```
Expected: 9 passed（3 解析 + 6 执行器）

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/community_sync.py backend/tests/test_community_sync.py
git commit -m "[feat] 社区同步：异步执行器（限流重试/逐角色 upsert/形象 best-effort）"
```

---

### Task B5: 端点（TDD）

**Files:**
- Modify: `backend/app/routers/members.py`
- Test: `backend/tests/test_community_sync.py`（追加）

- [ ] **Step 1: 追加失败测试**

```python
def test_sync_create_task_and_idempotent(client, db, monkeypatch):
    h, u = register_user(client, "csG", "同步庚")
    async def noop(task_id): pass
    monkeypatch.setattr("app.routers.members.run_sync_task", noop)
    r1 = client.post("/api/me/characters/sync", headers=h, json={"communityId": "329230843"})
    assert r1.status_code == 200
    task = db.query(CommunitySyncTask).filter(CommunitySyncTask.user_id == u["id"]).first()
    assert task is not None and task.status == "pending"
    # 进行中幂等：再发返回同一 taskId
    r2 = client.post("/api/me/characters/sync", headers=h, json={"communityId": "111"})
    assert r2.status_code == 200 and r2.json()["taskId"] == task.id


def test_sync_daily_limit(client, db, monkeypatch):
    h, u = register_user(client, "csH", "同步辛")
    async def noop(task_id): pass
    monkeypatch.setattr("app.routers.members.run_sync_task", noop)
    db.add(CommunitySyncTask(user_id=u["id"], community_id="1", status="success"))
    db.commit()
    r = client.post("/api/me/characters/sync", headers=h, json={"communityId": "2"})
    assert r.status_code == 400 and "今日已同步" in r.json()["detail"]


def test_sync_bad_community_id(client, db, monkeypatch):
    h, u = register_user(client, "csI", "同步壬")
    r = client.post("/api/me/characters/sync", headers=h, json={"communityId": "abc"})
    assert r.status_code == 400 and "社区ID格式" in r.json()["detail"]


def test_sync_latest_404_and_visible_only_to_self(client, db):
    h, u = register_user(client, "csJ", "同步癸")
    h2, u2 = register_user(client, "csK", "同步子")
    assert client.get("/api/me/characters/sync/latest", headers=h).status_code == 404
    db.add(CommunitySyncTask(user_id=u2["id"], community_id="1", status="success",
                             result={"roles": []}))
    db.commit()
    assert client.get("/api/me/characters/sync/latest", headers=h).status_code == 404
    r = client.get("/api/me/characters/sync/latest", headers=h2)
    assert r.status_code == 200 and r.json()["status"] == "success"
    assert r.json()["result"] == {"roles": []}
    assert "communityId" in r.json()
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v
```
Expected: FAIL（POST /api/me/characters/sync → 404）

- [ ] **Step 3: 实现端点**（`members.py` 追加 import 与两个端点；`CommunitySyncIn/Out/TaskOut` 从 schemas 导入）

```python
import asyncio
import re
from datetime import datetime, timezone

# 顶部 import 追加：
from ..models import Character, CommunitySyncTask, User
from ..schemas import (CommunitySyncIn, CommunitySyncOut, CommunitySyncTaskOut,
                       CharacterIn, CharacterOut)
from ..services.community_sync import run_sync_task

_COMMUNITY_ID_RE = re.compile(r"^\d{1,20}$")


def _start_of_today_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day)


@router.post("/sync", response_model=CommunitySyncOut)
async def create_sync_task(body: CommunitySyncIn, user: User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    if not _COMMUNITY_ID_RE.fullmatch(body.communityId):
        raise HTTPException(400, "社区ID格式不正确")
    running = db.query(CommunitySyncTask).filter(
        CommunitySyncTask.user_id == user.id,
        CommunitySyncTask.status.in_(("pending", "running")),
    ).order_by(CommunitySyncTask.id.desc()).first()
    if running:
        return CommunitySyncOut(taskId=running.id)  # 幂等
    today_ok = db.query(CommunitySyncTask).filter(
        CommunitySyncTask.user_id == user.id,
        CommunitySyncTask.status == "success",
        CommunitySyncTask.created_at >= _start_of_today_utc(),
    ).first()
    if today_ok:
        raise HTTPException(400, "今日已同步，请明天再试")
    task = CommunitySyncTask(user_id=user.id, community_id=body.communityId, status="pending")
    db.add(task)
    db.commit()
    db.refresh(task)
    task_id = task.id
    asyncio.create_task(run_sync_task(task_id))
    return CommunitySyncOut(taskId=task_id)


@router.get("/sync/latest", response_model=CommunitySyncTaskOut)
def latest_sync_task(user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    task = db.query(CommunitySyncTask).filter(
        CommunitySyncTask.user_id == user.id).order_by(CommunitySyncTask.id.desc()).first()
    if task is None:
        raise HTTPException(404, "还没有同步记录")
    return CommunitySyncTaskOut(taskId=task.id, status=task.status,
                                communityId=task.community_id, message=task.message,
                                result=task.result, createdAt=task.created_at.isoformat())
```

> 注意：`members.py` 顶部现有 `from ..models import Character, User`——把 `CommunitySyncTask` 加进同一行，避免重复 import。`User` 已存在。

- [ ] **Step 4: 运行确认通过（含全量后端测试）**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v && .venv/bin/python -m pytest -q
```
Expected: 新增 4 例通过；全量无回归

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/members.py backend/tests/test_community_sync.py
git commit -m "[feat] 社区同步：POST /sync 异步建任务 + GET /sync/latest（每用户每天一次）"
```

---

### Task B6: lifespan 残留任务恢复

**Files:**
- Modify: `backend/app/main.py:29-35`

- [ ] **Step 1: 修改 lifespan**（在 admin bootstrap 与 `db.close()` 之间）

```python
    db = SessionLocal()
    if not db.query(User).filter(User.username == settings.admin_username).first():
        db.add(User(username=settings.admin_username,
                    password_hash=hash_password(settings.admin_password),
                    nickname=settings.admin_nickname, is_admin=True))
        db.commit()
    # 重启后内存 asyncio 任务已丢失：残留 pending/running 任务置 failed，避免卡死每日一次判定
    from .models import CommunitySyncTask
    for t in db.query(CommunitySyncTask).filter(
            CommunitySyncTask.status.in_(("pending", "running"))).all():
        t.status = "failed"
        t.message = "服务重启，任务中断"
    db.commit()
    db.close()
```

- [ ] **Step 2: 冒烟验证**

```bash
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_smoke.py -q
```
Expected: pass

- [ ] **Step 3: 提交**

```bash
git add backend/app/main.py
git commit -m "[feat] 社区同步：lifespan 残留任务置 failed 兜底"
```

---

## Phase C：前端「同步社区」面板（本 repo）

### Task C1: 类型 + API 客户端

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: types.ts 追加**

```ts
export type SyncAction = 'created' | 'updated' | 'skipped' | 'failed'
export interface SyncRoleResult {
  roleName: string; job: string | null; jobName: string | null;
  level: number | null; fame: number | null; server: string | null;
  action: SyncAction; reason: string | null; characterId: number | null;
  profileImported: boolean
}
export interface SyncTask {
  taskId: number; status: 'pending' | 'running' | 'success' | 'failed';
  communityId: string; message: string | null;
  result: { roles: SyncRoleResult[] } | null; createdAt: string
}
```

- [ ] **Step 2: client.ts 追加方法**（`api` 对象内；同时把顶部 `import type { JobCategory } from '../types'` 改为 `import type { JobCategory, SyncTask } from '../types'`，否则 vue-tsc 报 `Cannot find name 'SyncTask'`）

```ts
  syncCreate: (body: { communityId: string }) =>
    request<{ taskId: number }>('POST', '/api/me/characters/sync', body),
  syncLatest: () => request<SyncTask>('GET', '/api/me/characters/sync/latest'),
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/types.ts frontend/src/api/client.ts
git commit -m "[feat] 社区同步：SyncTask 类型 + syncCreate/syncLatest API"
```

---

### Task C2: CommunitySyncPanel 组件（TDD）

**Files:**
- Create: `frontend/src/components/CommunitySyncPanel.vue`
- Test: `frontend/src/components/CommunitySyncPanel.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CommunitySyncPanel from './CommunitySyncPanel.vue'
import type { SyncTask } from '../types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { syncCreate: vi.fn(), syncLatest: vi.fn() },
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(),
}))
const notifyMock = vi.hoisted(() => ({
  notifyWarning: vi.fn(), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))
vi.mock('../lib/notify', () => notifyMock)

function mkTask(status: SyncTask['status'], result: SyncTask['result'] = null): SyncTask {
  return { taskId: 1, status, communityId: '329230843', message: null, result, createdAt: 'x' }
}

beforeEach(() => { vi.clearAllMocks() })

describe('CommunitySyncPanel', () => {
  it('挂载加载最近同步；无记录显示空态', async () => {
    apiMock.syncLatest.mockRejectedValue(new Error('还没有同步记录'))
    const w = mount(CommunitySyncPanel)
    await flushPromises()
    expect(w.text()).toContain('还没有同步记录')
  })

  it('有记录时渲染结果表格', async () => {
    apiMock.syncLatest.mockResolvedValue(mkTask('success', {
      roles: [{ roleName: '剑魂', job: '极诣·剑魂', jobName: 'weapon_master', level: 115,
                fame: 133227, server: '山西一区', action: 'created', reason: null,
                characterId: 1, profileImported: true }],
    }))
    const w = mount(CommunitySyncPanel)
    await flushPromises()
    expect(w.text()).toContain('剑魂')
    expect(w.text()).toContain('已创建')
    expect(w.text()).toContain('已导入')
  })

  it('提交→轮询到 success→通知+emit changed', async () => {
    apiMock.syncCreate.mockResolvedValue({ taskId: 1 })
    apiMock.syncLatest.mockResolvedValue(mkTask('success', { roles: [] }))
    const w = mount(CommunitySyncPanel)
    await flushPromises()
    await w.find('[data-act="community-id-input"]').setValue('329230843')
    await w.find('[data-act="sync-submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.syncCreate).toHaveBeenCalledWith({ communityId: '329230843' })
    expect(notifyMock.notifySuccess).toHaveBeenCalledWith('同步完成')
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('今日已同步→notifyWarning', async () => {
    apiMock.syncCreate.mockRejectedValue(new Error('今日已同步，请明天再试'))
    const w = mount(CommunitySyncPanel)
    await flushPromises()
    await w.find('[data-act="community-id-input"]').setValue('1')
    await w.find('[data-act="sync-submit"]').trigger('click')
    await flushPromises()
    expect(notifyMock.notifyWarning).toHaveBeenCalledWith('今日已同步，请明天再试')
  })

  it('failed 状态→统一失败文案', async () => {
    apiMock.syncCreate.mockResolvedValue({ taskId: 1 })
    apiMock.syncLatest.mockResolvedValue(mkTask('failed'))
    const w = mount(CommunitySyncPanel)
    await flushPromises()
    await w.find('[data-act="community-id-input"]').setValue('1')
    await w.find('[data-act="sync-submit"]').trigger('click')
    await flushPromises()
    expect(notifyMock.notifyError).toHaveBeenCalledWith('查询失败，请联系管理员')
  })

  it('卸载停止轮询', async () => {
    vi.useFakeTimers()
    apiMock.syncCreate.mockResolvedValue({ taskId: 1 })
    apiMock.syncLatest.mockResolvedValue(mkTask('running'))
    const w = mount(CommunitySyncPanel)
    await flushPromises()
    await w.find('[data-act="community-id-input"]').setValue('1')
    await w.find('[data-act="sync-submit"]').trigger('click')
    await flushPromises()
    const callsBefore = apiMock.syncLatest.mock.calls.length
    w.unmount()
    await vi.advanceTimersByTimeAsync(6000)
    expect(apiMock.syncLatest.mock.calls.length).toBe(callsBefore)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/CommunitySyncPanel.spec.ts
```
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现组件**

```vue
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { DnfButton, DnfFrame, DnfInput } from '@dnftools/ui'
import { api } from '../api/client'
import { notifyError, notifySuccess, notifyWarning } from '../lib/notify'
import type { SyncRoleResult, SyncTask } from '../types'

const emit = defineEmits<{ (e: 'changed'): void }>()

const communityId = ref('')
const task = ref<SyncTask | null>(null)
const submitting = ref(false)
const noRecord = ref(false)
let timer: number | undefined

const roles = computed(() => task.value?.result?.roles ?? [])

function stopPolling() { if (timer !== undefined) { clearInterval(timer); timer = undefined } }

async function loadLatest(): Promise<SyncTask | null> {
  try {
    const t = await api.syncLatest()
    task.value = t
    noRecord.value = false
    return t
  } catch {
    task.value = null
    noRecord.value = true
    return null
  }
}

function tick() {
  void loadLatest().then((t) => {
    if (t && (t.status === 'success' || t.status === 'failed')) {
      stopPolling()
      if (t.status === 'success') { notifySuccess('同步完成'); emit('changed') }
      else notifyError('查询失败，请联系管理员')
    }
  })
}

async function submit() {
  const cid = communityId.value.trim()
  if (!cid) { notifyError('请输入社区ID'); return }
  submitting.value = true
  try {
    await api.syncCreate({ communityId: cid })
    await tick()
    if (task.value && (task.value.status === 'pending' || task.value.status === 'running')) {
      stopPolling()
      timer = window.setInterval(() => { void tick() }, 5000)
    }
  } catch (e: any) {
    if (e.message === '今日已同步，请明天再试') notifyWarning(e.message)
    else notifyError('查询失败，请联系管理员')
  } finally {
    submitting.value = false
  }
}

function actionText(r: SyncRoleResult): string {
  if (r.action === 'created') return '已创建'
  if (r.action === 'updated') return '已更新'
  if (r.action === 'skipped') return `跳过：${r.reason ?? '职业未收录'}`
  return `失败：${r.reason ?? ''}`
}
function profileText(r: SyncRoleResult): string {
  if (r.action === 'skipped' || r.action === 'failed') return '—'
  return r.profileImported ? '已导入' : '导入失败'
}

onMounted(() => { void loadLatest() })
onUnmounted(stopPolling)
</script>

<template>
  <div class="dnf-panel" data-test="sync-panel" style="margin:12px 0;padding:14px">
    <div style="display:flex;align-items:center;gap:8px">
      <DnfInput v-model="communityId" data-act="community-id-input"
                placeholder="DNF助手社区ID（纯数字）" style="flex:1" />
      <DnfButton tone="gold" data-act="sync-submit" :disabled="submitting" @click="submit">
        {{ submitting ? '提交中…' : '确定' }}</DnfButton>
    </div>
    <p v-if="task?.status === 'running'" class="sync-status">
      {{ task.message ? '换绑限流等待中，约数分钟后继续…' : '同步中…' }}</p>
    <p v-if="task?.status === 'failed'" class="form-error" style="margin:6px 0 0">查询失败，请联系管理员</p>

    <DnfFrame v-if="roles.length" surface="panel" style="margin-top:12px;padding:12px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="color:var(--dnf-text-muted);text-align:left">
            <th style="padding:4px">角色</th><th style="padding:4px">职业</th>
            <th style="padding:4px">名望</th><th style="padding:4px">等级</th>
            <th style="padding:4px">服务器</th><th style="padding:4px">结果</th><th style="padding:4px">形象</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in roles" :key="r.roleName" style="border-top:1px solid var(--dnf-border,#3a3f4b)">
            <td style="padding:4px">{{ r.roleName }}</td>
            <td style="padding:4px">{{ r.job ?? '—' }}</td>
            <td style="padding:4px">{{ r.fame ?? '—' }}</td>
            <td style="padding:4px">{{ r.level ?? '—' }}</td>
            <td style="padding:4px">{{ r.server ?? '—' }}</td>
            <td style="padding:4px">{{ actionText(r) }}</td>
            <td style="padding:4px">{{ profileText(r) }}</td>
          </tr>
        </tbody>
      </table>
    </DnfFrame>
    <p v-if="noRecord" style="color:var(--dnf-text-faint);margin:8px 0 0">还没有同步记录</p>
  </div>
</template>
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/CommunitySyncPanel.spec.ts
```
Expected: 6 passed

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/CommunitySyncPanel.vue frontend/src/components/CommunitySyncPanel.spec.ts
git commit -m "[feat] 社区同步：CommunitySyncPanel 输入/轮询/结果表格"
```

---

### Task C3: MyCharactersView 集成 + 全量验证

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`
- Test: `frontend/src/views/MyCharactersView.spec.ts`（追加）

- [ ] **Step 1: 集成**（script 加 import/state；template 加按钮与面板）

script（顶部 import 处追加）：
```ts
import CommunitySyncPanel from '../components/CommunitySyncPanel.vue'
```
state（`const partyModalOpen = ref(false)` 后）：
```ts
const syncPanelOpen = ref(false)
```
template：在「冒险团管理」按钮之后加同步按钮：
```html
<DnfButton class="dnf-btn-sm" data-act="sync-community" @click="syncPanelOpen = !syncPanelOpen">
  同步社区</DnfButton>
```
在 `</DnfDialog>` 之后、`<AdventurePartyModal ...>` 之前加面板：
```html
<CommunitySyncPanel v-if="syncPanelOpen" @changed="load" />
```

- [ ] **Step 2: 追加测试**（`MyCharactersView.spec.ts`，文件末尾追加 describe）

```ts
describe('MyCharactersView community sync entry', () => {
  it('点「同步社区」切换内联面板', async () => {
    const wrapper = mount(MyCharactersView, {
      global: {
        stubs: { teleport: true,
                 CommunitySyncPanel: { template: '<div data-test="sync-panel" />' } },
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-test="sync-panel"]').exists()).toBe(false)
    await wrapper.find('[data-act="sync-community"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="sync-panel"]').exists()).toBe(true)
    await wrapper.find('[data-act="sync-community"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="sync-panel"]').exists()).toBe(false)
  })
})
```

> 面板内容（轮询/表格）由 CommunitySyncPanel.spec 覆盖；此处只验证入口显隐。

- [ ] **Step 3: 全量前端测试 + 构建**

```bash
cd /Users/able/toys/dnfer/frontend && npx vitest run && npm run build
```
Expected: 全量通过（原 414 + 新增）；vue-tsc + vite 构建通过

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/MyCharactersView.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "[feat] 社区同步：我的角色页头「同步社区」入口 + 面板"
```

---

## Phase D：端到端手测（本机）

### Task D1: 起 web 服务 + 后端，验证链路

- [ ] **Step 1: 起 web 服务**

```bash
cd /Users/able/dnfer-community-sync && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100
```
（后台运行）

- [ ] **Step 2: 起后端（带同步基址环境变量）**

```bash
cd /Users/able/toys/dnfer/backend && DNFER_COMMUNITY_SYNC_BASE=http://127.0.0.1:8100 .venv/bin/uvicorn app.main:app --port 8000
```

- [ ] **Step 3: curl 冒烟**

```bash
# 登录拿 token → 建角色 → 调同步
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST http://127.0.0.1:8000/api/me/characters/sync -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"communityId":"329230843"}'
curl -s http://127.0.0.1:8000/api/me/characters/sync/latest -H "Authorization: Bearer $TOKEN"
```
Expected：建任务返回 taskId；latest 状态 running（若 dnfbbz 换绑限流则 message 提示）→ 数分钟后 success，result 含角色。

- [ ] **Step 4: 手测说明**：dnfbbz 换绑限流可能让首次同步等待 ~5 分钟，属预期。

---

## 命令速查

```bash
# sibling 测试
cd /Users/able/dnfer-community-sync && .venv/bin/python -m pytest tests/ -v
# 后端测试（单文件 / 全量）
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest tests/test_community_sync.py -v
cd /Users/able/toys/dnfer/backend && .venv/bin/python -m pytest -q
# 前端测试 + 构建
cd /Users/able/toys/dnfer/frontend && npx vitest run src/components/CommunitySyncPanel.spec.ts
cd /Users/able/toys/dnfer/frontend && npx vitest run && npm run build
```
