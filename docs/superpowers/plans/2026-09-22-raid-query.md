# 机器人攻坚信息查询 skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 群友对机器人发送「打团信息 / 排表信息 / 第 n 波 / 前 n 波 / 查找一下周六下午的团」等文本，机器人定位一场攻坚并回复其排表/波次详情（每人一行：昵称 · 角色名 · 职责，按红/黄/绿/蓝/紫小队分组）。

**Architecture:** 后端新增 `GET /api/public/raids/{rid}` 一次返回完整攻坚详情（复用 `raids.py:_detail`）。机器人侧新增独立 skill `skills/dnfer-raids/`：`scripts/dnfer_raid.py`（纯 stdlib）负责取数、时间匹配、选团、切波等**确定性**逻辑（`raids` / `pick` / `detail` 三个子命令，stdout 只输出 JSON）；`SKILL.md` 让模型负责中文解析（含时间表达式）、调用脚本、组装回复。时区固定 +8（Asia/Shanghai，中国无夏令时）：后端 `starts_at` 为 naive UTC，脚本统一按 UTC 读取后转 +8 展示与匹配。**不用 `zoneinfo`**：中国无夏令时，固定 `timedelta(hours=8)` 与 spec 的「转 +8」决策一致，且避免 Windows 上 tzdata 缺失问题。

**Tech Stack:** Python FastAPI · SQLAlchemy 2 · SQLite · 标准库 urllib 脚本（Python 3.10+，用了 `dict | None` 注解）· AstrBot Anthropic Skills

**Spec:** `docs/superpowers/specs/2026-09-22-raid-query-design.md`

**测试环境：** 后端测试用 `cd backend && .venv/bin/python -m pytest <file> -v`。仓库工作流直接提交到 `main` 分支，不做 worktree（沿用既有 `2026-09-22-bot-register.md` 约定）。skills 脚本在本仓库没有单测框架，沿用既有 `dnfer-characters` 的 CLI 冒烟 + 连后端 E2E 方式验证。

---

### Task 1: 后端 `GET /api/public/raids/{rid}`（schema import + 端点 + 测试）

**Files:**
- Create: `backend/tests/test_public_raids.py`
- Modify: `backend/app/routers/public.py`

- [ ] **Step 1: 写失败测试** `backend/tests/test_public_raids.py`

```python
from .helpers import make_raid, register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_public_raid_detail_requires_token(client):
    assert client.get("/api/public/raids/1").status_code == 401
    assert client.get("/api/public/raids/1",
                      headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_public_raid_detail(client):
    ah = _admin(client)
    rid = make_raid(client, ah, name="巴卡尔", size=12)["id"]
    h, _ = register_user(client, "p1", "甲")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1}).json()["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid, "duty": "主C"})

    r = client.get(f"/api/public/raids/{rid}", headers=TOKEN)
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "巴卡尔"
    assert body["dungeon_name"] == "副本"          # make_dungeon 默认名
    assert body["size"] == 12
    assert body["locked"] is False
    assert len(body["waves"]) == 1                 # make_raid 自带 1 个波次
    slots = body["waves"][0]["slots"]
    assert len(slots) == 12                        # 12 人 = 3 队 × 4 格
    filled = [s for s in slots if s["character_name"]]
    assert filled[0]["owner_nickname"] == "甲"
    assert filled[0]["character_name"] == "剑魂"
    assert filled[0]["duty"] == "主C"
    assert filled[0]["job_title"]                  # weapon_master → 极诣·剑魂
    empty = [s for s in slots if not s["character_name"]]
    assert empty and empty[0]["character_name"] is None


def test_public_raid_detail_404(client):
    r = client.get("/api/public/raids/999999", headers=TOKEN)
    assert r.status_code == 404
    assert r.json()["detail"] == "攻坚不存在"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_public_raids.py -v`
Expected: FAIL —— `/api/public/raids/{rid}` 未定义时，未匹配路径被 `app/main.py` 根挂载的 SPA 静态托管（`SpaStaticFiles`）兜底返回 `index.html`（HTTP **200**），**不会触发路由级 `require_api_token` 依赖**。因此三个测试都失败：`test_public_raid_detail_requires_token` 期待 401 实得 200；`test_public_raid_detail` 期待 200 实得 HTML（JSONDecodeError）；`test_public_raid_detail_404` 期待 404 实得 200。**全部 3 个测试失败**，红阶段即验证测试可用（401 失败是路由不存在的正常表现，不是鉴权配置问题）。

- [ ] **Step 3: `public.py` import 补 `RaidDetail`**

将 `backend/app/routers/public.py` 第 7 行：

```python
from ..schemas import RaidListItem
```

改为：

```python
from ..schemas import RaidDetail, RaidListItem
```

- [ ] **Step 4: `public.py` 新增端点**

在 `public_wave` 端点之后、文件末尾追加：

```python
@router.get("/raids/{rid}", response_model=RaidDetail)
def public_raid(rid: int, db: Session = Depends(get_db)):
    raid = db.get(Raid, rid)
    if raid is None:
        raise HTTPException(404, "攻坚不存在")
    return _detail(db, raid)
```

（`_detail` 已从 `..routers.raids` 导入；`Raid` 已在 import 中。路由 `GET /raids` → `/raids/{rid}` → `/raids/{rid}/waves/{index}` 路径互不冲突。）

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_public_raids.py -v`
Expected: PASS —— 3 tests passed。

- [ ] **Step 6: 跑相关回归**

Run: `cd backend && .venv/bin/python -m pytest tests/test_public.py tests/test_raids.py -q`
Expected: PASS —— 不影响既有公开端点与攻坚接口。

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/public.py backend/tests/test_public_raids.py
git commit -m "feat: 机器人查询完整攻坚详情接口 GET /api/public/raids/{rid}"
```

---

### Task 2: 脚本 `skills/dnfer-raids/scripts/dnfer_raid.py`

**Files:**
- Create: `skills/dnfer-raids/scripts/dnfer_raid.py`

本仓库 skills 脚本无单测框架，沿用既有 `dnfer-characters` 约定（CLI 冒烟 + 可选 E2E）。脚本核心时间逻辑拆成可注入 `now` 的纯函数，Task 3 用 `python3 -c` 做确定性验证。

- [ ] **Step 1: 写完整脚本**

新建 `skills/dnfer-raids/scripts/dnfer_raid.py`：

```python
#!/usr/bin/env python3
"""DNfer 机器人攻坚信息查询助手（仅 Python 标准库，零第三方依赖）。

用法：
  DNFER_API_TOKEN=xxx python dnfer_raid.py raids
  DNFER_API_TOKEN=xxx python dnfer_raid.py pick \
      [--weekday 0-6] [--period morning|afternoon|evening] \
      [--from 'YYYY-MM-DD HH:MM'] [--to 'YYYY-MM-DD HH:MM']
  DNFER_API_TOKEN=xxx python dnfer_raid.py detail <raid_id> [--wave n | --waves n | --all]

时区：后端 starts_at 为 naive UTC，脚本统一按 UTC 读取并转为固定 +8
（Asia/Shanghai，中国无夏令时）进行展示与匹配。

输出约定：stdout 只输出机器可读 JSON（模型据此解析）；人读中文摘要写到 stderr。
非 2xx / 网络错误时 stdout 为 {"ok": false, "status": ..., "error": ...}。

环境变量：
  DNFER_API_BASE   后端地址，默认 http://127.0.0.1:8000（同机部署直连内网端口）
  DNFER_API_TOKEN  DNfer 机器人 API Token，必填
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000"
TZ_OFFSET = timedelta(hours=8)          # Asia/Shanghai 固定 +8（无夏令时）
SQUAD_NAMES = ["红", "黄", "绿", "蓝", "紫"]
PERIODS = {"morning": (6, 12), "afternoon": (12, 18), "evening": (18, 24)}
_WEEKDAYS_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


# ---------- 网络 ----------

def _base() -> str:
    return os.environ.get("DNFER_API_BASE", DEFAULT_BASE).rstrip("/")


def _token() -> str:
    token = os.environ.get("DNFER_API_TOKEN", "")
    if not token:
        print(json.dumps({"ok": False, "error": "未设置环境变量 DNFER_API_TOKEN"},
                         ensure_ascii=False))
        sys.exit(2)
    return token


def _request(method: str, url: str, body: dict | None = None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
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


# ---------- 时间（纯函数，now 可注入便于测试） ----------

def _now_local() -> datetime:
    # 服务器存 naive UTC，取当前 UTC 再转 +8 得到本地 naive
    return datetime.now(timezone.utc).replace(tzinfo=None) + TZ_OFFSET


def _to_local(dt_utc: datetime) -> datetime:
    return dt_utc + TZ_OFFSET


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)   # 后端序列化如 2026-09-20T14:00:00


def _fmt_local(dt: datetime) -> str:
    return f"{dt.strftime('%Y-%m-%d %H:%M')} {_WEEKDAYS_CN[dt.weekday()]}"


def _period_window(period: str, now: datetime) -> tuple[datetime, datetime]:
    """period 单独使用：下一个该时段（今天若窗口起点未过则取今天，否则明天）。
    窗口终点 = 起点 + 时段时长（不能用 replace(hour=24)，会抛 ValueError）。"""
    start_hour, end_hour = PERIODS[period]
    start = datetime(now.year, now.month, now.day, start_hour, 0)
    if start <= now:
        start += timedelta(days=1)
    return start, start + timedelta(hours=end_hour - start_hour)


def _weekday_window(weekday: int, period: str | None, now: datetime) -> tuple[datetime, datetime]:
    """下一个出现的该星期（今天算）；period 非空且窗口起点未过则取该星期，否则下一周。
    period 为空 → 整天 00:00-24:00（今天若已是该星期则取今天）。
    窗口终点 = 起点 + 时段时长（不能用 replace(hour=24)，会抛 ValueError）。"""
    days_ahead = (weekday - now.weekday()) % 7
    base = (now + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)
    if period is None:
        return base, base + timedelta(days=1)
    start_hour, end_hour = PERIODS[period]
    start = base.replace(hour=start_hour)
    if start <= now:
        start += timedelta(days=7)
    return start, start + timedelta(hours=end_hour - start_hour)


def _pick_core(raids: list, weekday: int | None, period: str | None,
               from_dt: datetime | None, to_dt: datetime | None,
               now: datetime) -> tuple[dict | None, dict]:
    """确定性选团核心（纯函数）。返回 (选中 raid 或 None, 输出 meta)。"""
    items = [{"raid": r, "dt": _to_local(_parse_iso(r["starts_at"]))} for r in raids]
    if not items:
        return None, {"ok": True, "selected": None, "reason": "no_raids"}

    meta = {"ok": True, "matched_by": "closest", "matches": [],
            "fallback": False, "range": None}
    candidates = items

    if from_dt is not None or to_dt is not None:
        meta["matched_by"] = "range"
        meta["range"] = [_fmt_local(from_dt) if from_dt else None,
                         _fmt_local(to_dt) if to_dt else None]
        candidates = [it for it in items
                      if (from_dt is None or it["dt"] >= from_dt)
                      and (to_dt is None or it["dt"] <= to_dt)]
    elif weekday is not None or period is not None:
        if weekday is not None:
            meta["matched_by"] = "weekday" if period is None else "weekday_period"
            lo, hi = _weekday_window(weekday, period, now)
        else:
            meta["matched_by"] = "period"
            lo, hi = _period_window(period, now)
        meta["range"] = [_fmt_local(lo), _fmt_local(hi)]
        candidates = [it for it in items if lo <= it["dt"] < hi]

    if candidates:
        sel = min(candidates, key=lambda it: (abs(it["dt"] - now), it["dt"]))
        meta["selected"] = sel["raid"]
        meta["matches"] = [it["raid"]["id"] for it in candidates]
        return sel["raid"], meta
    # 时间过滤无命中 → 回退离当前时间最近的一场
    sel = min(items, key=lambda it: (abs(it["dt"] - now), it["dt"]))
    meta["selected"] = sel["raid"]
    meta["fallback"] = True
    return sel["raid"], meta


# ---------- 命令 ----------

def _shape_wave(wave: dict) -> dict:
    by_squad: dict[int, list] = {}
    for s in wave["slots"]:
        by_squad.setdefault(s["squad_index"], []).append({
            "row_index": s["row_index"],
            "is_empty": s["character_name"] is None,
            "owner_nickname": s.get("owner_nickname"),
            "character_name": s.get("character_name"),
            "duty": s.get("duty"),
            "job_title": s.get("job_title"),
        })
    squads = [{"squad_index": idx,
               "squad_name": SQUAD_NAMES[idx % len(SQUAD_NAMES)],
               "slots": by_squad[idx]} for idx in sorted(by_squad)]
    return {"index": wave["index"], "squads": squads}


def _fail(out: dict) -> int:
    print(json.dumps(out, ensure_ascii=False))
    print(f"[dnfer-raid] {out.get('error')}", file=sys.stderr)
    return 1


def cmd_raids(args) -> int:
    result = _request("GET", f"{_base()}/api/public/raids")
    if isinstance(result, list):
        for r in result:
            r["starts_at_local"] = _fmt_local(_to_local(_parse_iso(r["starts_at"])))
        out = {"ok": True, "raids": result}
    elif isinstance(result, dict) and result.get("ok") is False:
        return _fail(result)
    else:
        return _fail({"ok": False, "error": "响应格式异常"})
    print(json.dumps(out, ensure_ascii=False))
    return 0


def cmd_pick(args) -> int:
    if (args.from_dt or args.to_dt) and (args.weekday is not None or args.period):
        return _fail({"ok": False, "error": "--weekday/--period 与 --from/--to 不能同时使用"})
    try:
        from_dt = datetime.strptime(args.from_dt, "%Y-%m-%d %H:%M") if args.from_dt else None
        to_dt = datetime.strptime(args.to_dt, "%Y-%m-%d %H:%M") if args.to_dt else None
    except ValueError:
        return _fail({"ok": False, "error": "--from/--to 格式应为 'YYYY-MM-DD HH:MM'"})
    if from_dt and to_dt and from_dt > to_dt:
        return _fail({"ok": False, "error": "--from 不能晚于 --to"})

    result = _request("GET", f"{_base()}/api/public/raids")
    if isinstance(result, list):
        _, out = _pick_core(result, args.weekday, args.period, from_dt, to_dt, _now_local())
    elif isinstance(result, dict) and result.get("ok") is False:
        return _fail(result)
    else:
        return _fail({"ok": False, "error": "响应格式异常"})
    print(json.dumps(out, ensure_ascii=False))
    if out.get("selected") is None:
        print("[dnfer-raid] 当前没有任何攻坚计划", file=sys.stderr)
    else:
        tag = "回退最近" if out.get("fallback") else out.get("matched_by")
        print(f"[dnfer-raid] 选中：{out['selected']['name']}（{tag}）", file=sys.stderr)
    return 0


def cmd_detail(args) -> int:
    result = _request("GET", f"{_base()}/api/public/raids/{args.raid_id}")
    if isinstance(result, dict) and result.get("ok") is False:
        return _fail(result)
    if not isinstance(result, dict) or "waves" not in result:
        return _fail({"ok": False, "error": "响应格式异常"})

    raid = result
    waves = raid["waves"]
    wave_count = len(waves)
    if args.wave is not None:
        if args.wave < 1:
            return _fail({"ok": False, "status": 400, "error": "波次号不合法"})
        if args.wave > wave_count:
            return _fail({"ok": False, "status": 400, "error": f"该团只有 {wave_count} 波"})
        waves = [w for w in waves if w["index"] == args.wave]
    elif args.waves is not None:
        if args.waves < 1:
            return _fail({"ok": False, "status": 400, "error": "波次号不合法"})
        waves = [w for w in waves if w["index"] <= args.waves]   # 超量自动钳制为全部

    out = {"ok": True,
           "raid": {"id": raid["id"], "name": raid["name"],
                    "dungeon_name": raid["dungeon_name"], "size": raid["size"],
                    "locked": raid["locked"],
                    "starts_at": _fmt_local(_to_local(_parse_iso(raid["starts_at"]))),
                    "wave_count": wave_count},
           "waves": [_shape_wave(w) for w in waves]}
    print(json.dumps(out, ensure_ascii=False))
    print(f"[dnfer-raid] {out['raid']['name']} 共 {wave_count} 波，返回 {len(out['waves'])} 波",
          file=sys.stderr)
    return 0


# ---------- 入口 ----------

def main() -> int:
    parser = argparse.ArgumentParser(description="DNfer 机器人攻坚信息查询助手")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_raids = sub.add_parser("raids", help="列出全部攻坚（含本地时间）")
    p_raids.set_defaults(func=cmd_raids)

    p_pick = sub.add_parser("pick", help="选一场攻坚（默认离当前时间最近；可按时段过滤）")
    p_pick.add_argument("--weekday", type=int, choices=range(7),
                        help="0=周一 … 6=周日，取下一个出现的该星期")
    p_pick.add_argument("--period", choices=sorted(PERIODS),
                        help="morning=06-12 / afternoon=12-18 / evening=18-24")
    p_pick.add_argument("--from", dest="from_dt", metavar="YYYY-MM-DD HH:MM",
                        help="本地时间范围起点（可与 --to 同时给）")
    p_pick.add_argument("--to", dest="to_dt", metavar="YYYY-MM-DD HH:MM",
                        help="本地时间范围终点（可与 --from 同时给）")
    p_pick.set_defaults(func=cmd_pick)

    p_detail = sub.add_parser("detail", help="查询攻坚详情（本地切波）")
    p_detail.add_argument("raid_id", type=int, help="攻坚 id")
    grp = p_detail.add_mutually_exclusive_group()
    grp.add_argument("--wave", type=int, help="只返回第 n 波")
    grp.add_argument("--waves", type=int, help="只返回前 n 波（超量钳制为全部）")
    grp.add_argument("--all", action="store_true", help="返回全部波次（缺省）")
    p_detail.set_defaults(func=cmd_detail)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: 语法与用法验证（无需后端）**

Run: `cd skills/dnfer-raids && python3 scripts/dnfer_raid.py --help`
Expected: 子命令列表 `{detail,pick,raids}`；无 traceback。

Run: `cd skills/dnfer-raids && python3 scripts/dnfer_raid.py raids`
Expected: stdout `{"ok": false, "error": "未设置环境变量 DNFER_API_TOKEN"}`，exit code 2。

- [ ] **Step 3: Commit**

```bash
git add skills/dnfer-raids/scripts/dnfer_raid.py
git commit -m "feat: 攻坚查询脚本 dnfer_raid.py（raids/pick/detail）"
```

---

### Task 3: 脚本确定性验证（时间纯函数 + CLI + 可选 E2E）

**Files:**
- 无新增（验证 Task 2 产出）

- [ ] **Step 1: 时间纯函数断言（确定性，无需后端）**

Run:

```bash
cd skills/dnfer-raids && python3 -c "
from datetime import datetime
from scripts.dnfer_raid import _period_window, _weekday_window, _pick_core

# 周二 10:00 查 '下午' → 当天下午
lo, hi = _period_window('afternoon', datetime(2026, 9, 22, 10, 0))
assert (lo, hi) == (datetime(2026, 9, 22, 12, 0), datetime(2026, 9, 22, 18, 0)), (lo, hi)
# 周二 19:00 查 '下午' → 明天下午
lo, hi = _period_window('afternoon', datetime(2026, 9, 22, 19, 0))
assert (lo, hi) == (datetime(2026, 9, 23, 12, 0), datetime(2026, 9, 23, 18, 0)), (lo, hi)
# 周二查 '周六下午' → 本周六下午
lo, hi = _weekday_window(5, 'afternoon', datetime(2026, 9, 22, 10, 0))
assert lo == datetime(2026, 9, 26, 12, 0), lo
# 周六 19:00 查 '周六下午' → 下周六下午
lo, hi = _weekday_window(5, 'afternoon', datetime(2026, 9, 26, 19, 0))
assert lo == datetime(2026, 10, 3, 12, 0), lo
# 周二查 '周三'（整天）→ 明天 00:00
lo, hi = _weekday_window(2, None, datetime(2026, 9, 22, 10, 0))
assert lo == datetime(2026, 9, 23, 0, 0), lo
# 周三 10:00 查 '晚上' → 当天晚上 [18:00, 24:00)（end 为次日 00:00）
lo, hi = _period_window('evening', datetime(2026, 9, 23, 10, 0))
assert (lo, hi) == (datetime(2026, 9, 23, 18, 0), datetime(2026, 9, 24, 0, 0)), (lo, hi)
# 周二查 '周六晚上' → 本周六晚上 [18:00, 24:00)（覆盖 evening + weekday 组合）
lo, hi = _weekday_window(5, 'evening', datetime(2026, 9, 22, 10, 0))
assert (lo, hi) == (datetime(2026, 9, 26, 18, 0), datetime(2026, 9, 27, 0, 0)), (lo, hi)

# pick：离当前最近
now = datetime(2026, 9, 22, 10, 0)
raids = [
    {'id': 1, 'starts_at': '2026-09-01T02:00:00'},   # +8 = 09-01 10:00（过去较远）
    {'id': 2, 'starts_at': '2026-09-26T06:30:00'},   # +8 = 09-26 14:30 周六下午
    {'id': 3, 'starts_at': '2030-01-01T00:00:00'},   # 极远未来
]
sel, meta = _pick_core(raids, None, None, None, None, now)
assert sel['id'] == 2 and meta['matched_by'] == 'closest', (sel, meta)
# 周六下午过滤命中 id=2
sel, meta = _pick_core(raids, 5, 'afternoon', None, None, now)
assert sel['id'] == 2 and meta['matched_by'] == 'weekday_period' and not meta['fallback'], meta
# 周二上午过滤无命中 → fallback 最近
sel, meta = _pick_core(raids, 1, 'morning', None, None, now)
assert meta['fallback'] is True and sel['id'] == 2, meta
# 显式范围命中
sel, meta = _pick_core(raids, None, None, datetime(2026, 9, 26, 12, 0), datetime(2026, 9, 26, 18, 0), now)
assert sel['id'] == 2 and meta['matched_by'] == 'range', meta
# 空列表
sel, meta = _pick_core([], None, None, None, None, now)
assert sel is None and meta['reason'] == 'no_raids', meta
print('time helpers OK')
"
```

Expected: 输出 `time helpers OK`，无断言失败。

- [ ] **Step 2: CLI 参数冲突与格式校验**

Run:

```bash
cd skills/dnfer-raids
python3 scripts/dnfer_raid.py pick --weekday 5 --period afternoon --from '2026-09-26 12:00'
```

Expected: stdout `{"ok": false, "error": "--weekday/--period 与 --from/--to 不能同时使用"}`, exit 1。

Run:

```bash
cd skills/dnfer-raids
python3 scripts/dnfer_raid.py pick --from '26号下午'
```

Expected: stdout `{"ok": false, "error": "--from/--to 格式应为 'YYYY-MM-DD HH:MM'"}`, exit 1。

- [ ] **Step 3: 连后端做端到端自测（可选，需本地后端运行）**

启动后端（`cd backend && .venv/bin/uvicorn app.main:app --port 8000`，另开终端），用管理员建几场已知时间的团（本机开发库即可），再直跑脚本：

```bash
cd skills/dnfer-raids
export DNFER_API_BASE=http://127.0.0.1:8000
export DNFER_API_TOKEN=change-me-bot-token    # 本地 .env 已设真实 Token 则用其替换；勿写入敏感值
python3 scripts/dnfer_raid.py raids
python3 scripts/dnfer_raid.py pick
python3 scripts/dnfer_raid.py pick --weekday 5 --period afternoon
python3 scripts/dnfer_raid.py detail 1 --all
python3 scripts/dnfer_raid.py detail 1 --wave 1
python3 scripts/dnfer_raid.py detail 1 --wave 99     # → {"ok":false,"status":400,"error":"该团只有 N 波"}
```

Expected: `raids`/`pick`/`detail` 输出合法 JSON；`--wave 99` 正确报「该团只有 N 波」。若没条件起后端可跳过本步（Step 1/2 已覆盖核心逻辑）。

---

### Task 4: `SKILL.md`

**Files:**
- Create: `skills/dnfer-raids/SKILL.md`

- [ ] **Step 1: 写 SKILL.md**

```markdown
---
name: dnfer-raids
description: 查询 DNfer 攻坚排表与波次信息。当群友发送「打团信息」「排表信息」「第 n 波」「前 n 波」「查找一下（某时间）的团」等文本时使用。
---

# DNfer 攻坚信息查询

群友在群里发送攻坚查询（「打团信息 / 排表信息 / 第 n 波 / 前 n 波 / 查找一下周六下午的团」等）时，用本技能定位一场攻坚并回复其排表/波次详情。

## 重要前提

- **攻坚（团）= Raid**：一场团有名称、副本、规模、发起时间 `starts_at`、多个波次；每个波次分红/黄/绿/蓝/紫小队，每格一个人（昵称 + 角色 + 职责）。
- **选团规则**：消息带时间 → 按时间匹配；不带时间 → 取 `starts_at` 离当前时间最近的一场（「离当前最近」由脚本 `pick` 计算，不要自己猜）。
- 脚本所需环境变量（`DNFER_API_BASE`、`DNFER_API_TOKEN`）已由运行环境提供，直接调用脚本即可，不要自己拼接地址或 Token。

## 调用方式

在技能目录下执行（`scripts/dnfer_raid.py`）：

```bash
# 列出全部攻坚（含本地时间）
python scripts/dnfer_raid.py raids

# 选一场团：默认离当前时间最近
python scripts/dnfer_raid.py pick
# 按时间过滤：周X（--weekday 0=周一 … 6=周日）+ 时段（morning/afternoon/evening）
python scripts/dnfer_raid.py pick --weekday 5 --period afternoon
# 显式本地时间范围（可与 --to 同时给）
python scripts/dnfer_raid.py pick --from '2026-09-26 14:00' --to '2026-09-26 18:00'

# 查询详情：--all 全部 / --wave n 第 n 波 / --waves n 前 n 波
python scripts/dnfer_raid.py detail <id> --all
python scripts/dnfer_raid.py detail <id> --wave 3
python scripts/dnfer_raid.py detail <id> --waves 3
```

stdout 只输出 JSON，直接解析它。`pick` 输出 `selected` 里的 `id`，再调 `detail`。

## 触发映射

| 群友消息 | 动作 |
|---|---|
| 「打团信息 / 排表信息」（无波次） | `pick` 选团 → `detail <id> --all` → 回复概览 + 各波简短列表 |
| 「第 n 波」 | `pick` 选团 → `detail <id> --wave n` |
| 「前 n 波」 | `pick` 选团 → `detail <id> --waves n` |
| 消息含时间（今天/明天/周X/星期X/几点/上午/下午/晚上） | 解析成 `--weekday/--period/--from/--to` → `pick` 过滤 → 再 `detail` |

- 解析「今天/明天/周X/星期X」时换算成具体 `--from/--to` 或 `--weekday`；「上午/下午/晚上」对应 `morning/afternoon/evening`。
- 「周六下午」→ `--weekday 5 --period afternoon`。注意：**0=周一**，周六是 `5`，周日是 `6`。
- 无数字的「下一波」不要瞎猜，回复「发我波次号，如『第 3 波』」。

## 回复格式

- **概览**单行式：`名称（副本）｜时间｜规模｜n 波｜已锁定/未锁定`（时间用 `pick`/`detail` 给的 `YYYY-MM-DD HH:MM 周X`，可转述为「周六 14:30」）。
- **波次详情**：每波一个小节 `【第 n 波】`，按 `squad_name`（红/黄/绿/蓝/紫）分组，每人一行：
  - 有角色：`昵称 · 角色名 · 职责`（如 `张三 · 剑魂 · 主C`）
  - 空位：`（空）`
- 「打团信息/排表信息」：先给概览，再给各波人数概要（如 `第1波 满 12/12`、`第2波 8/12`），不逐人展开，除非群友要求。

## 回执映射（stdout 判断）

| stdout | 回复 |
|---|---|
| `{"ok":true,"selected":null,"reason":"no_raids"}` | 「当前还没有攻坚计划」 |
| `pick` 输出 `"fallback":true` | 「没有匹配《range 里的时间》的团，最近的一场是《selected.name》（《starts_at》）」 |
| `detail` 返回 `{"ok":false,"status":400,"error":"该团只有 N 波"}` | 「该团只有 N 波」 |
| `{"ok":false,"status":404,"error":"攻坚不存在"}` | 「这个团不存在或已删除」 |
| `{"ok":false,"error":...}`（无 status，Token/网络） | 「系统暂时不可用，稍后再试」 |
| `{"ok":false,"status":401,...}` | 「机器人还没配好 Token，找管理员」 |
```

- [ ] **Step 2: 校验 frontmatter**

Run: `cd skills/dnfer-raids && python3 -c "s=open('SKILL.md',encoding='utf-8').read(300); print('name' in s, 'description' in s)"`
Expected: `True True`

- [ ] **Step 3: Commit**

```bash
git add skills/dnfer-raids/SKILL.md
git commit -m "feat: 攻坚查询 SKILL.md（触发映射/回复格式/回执映射）"
```

---

### Task 5: 文档与变更日志

**Files:**
- Create: `skills/dnfer-raids/README.md`
- Modify: `README.md`（机器人 API 表 + curl 示例）
- Modify: `CHANGELOG.md`（[Unreleased]）

- [ ] **Step 1: skill README** 新建 `skills/dnfer-raids/README.md`

```markdown
# dnfer-raids · AstrBot 技能

让 AstrBot 机器人按群友消息（「打团信息 / 排表信息 / 第 n 波 / 前 n 波 / 查找一下周六下午的团」）查询 DNfer 攻坚排表并回复波次详情。

要求 **AstrBot v4.13.0+**（支持 Anthropic Skills）。

## 安装

1. 把 `dnfer-raids/` 目录打成 zip（zip 内须含 `SKILL.md`，文件名大小写完全一致）。
2. AstrBot 管理面板 → 插件 → 技能（`/extension/skills`）→ 上传技能，选择该 zip。
3. 按需重载/启用。

## 环境变量

在 AstrBot 运行环境设置：

| 变量 | 说明 | 默认 |
|---|---|---|
| `DNFER_API_BASE` | DNfer 后端地址 | `http://127.0.0.1:8000` |
| `DNFER_API_TOKEN` | DNfer 机器人 API Token（与仓库 `.env` 的 `DNFER_API_TOKEN` 一致） | 必填 |

## 同机部署说明

DNfer 后端容器绑定 `127.0.0.1:8000`（仅宿主机可达）。AstrBot 须以**宿主机进程**（或 host 网络）运行，`127.0.0.1:8000` 才能直达后端内网端口，从而绕过 nginx 的 UA 拦截与限流。若 AstrBot 本身容器化，需把 `DNFER_API_BASE` 改为宿主机 IP，或改走 `https://<域名>`。

## 自测

先启动 DNfer 后端，再直跑脚本：

```bash
cd dnfer-raids
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py raids
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py pick
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py pick --weekday 5 --period afternoon
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py detail 1 --all
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py detail 1 --wave 1
```

- stdout 为机器可读 JSON；stderr 为中文摘要。
- 命令失败时退出码非 0，stdout 为 `{"ok":false,...}`。

## 目录结构

```
dnfer-raids/
├── SKILL.md              # Anthropic Skills 指令（frontmatter: name + description）
├── scripts/dnfer_raid.py # 自包含 Python 助手（仅 stdlib urllib，零依赖）
└── README.md             # 本文档
```
```

- [ ] **Step 2: 根 README 机器人 API 表补端点**

在 `README.md` 机器人 API 表 `GET /api/public/raids/{id}/waves/{index}` 行之后追加：

```markdown
| `GET /api/public/raids/{id}` | 完整攻坚详情：名称、副本、规模、锁定状态、时间、全部波次（每格含群昵称、角色名、职责、职业） |
```

- [ ] **Step 3: 根 README 补 curl 示例**

在 `README.md` 的 curl 代码块 `waves/1` 那行之后追加：

```bash
curl -H "Authorization: Bearer $DNFER_API_TOKEN" http://127.0.0.1:8000/api/public/raids/1
```

- [ ] **Step 4: CHANGELOG [Unreleased] 新增条目**

在 `CHANGELOG.md` 的 `[Unreleased]` → `### 新增` 下追加：

```markdown
- **机器人攻坚信息查询**：`GET /api/public/raids/{id}` 返回完整攻坚详情；AstrBot skill「dnfer-raids」支持「打团信息 / 排表信息 / 第 n 波 / 前 n 波 / 查找某时间（周X/上午下午晚上）的团」，按时间匹配或取离当前最近的一场，回复按小队分组的昵称·角色·职责
```

- [ ] **Step 5: Commit**

```bash
git add skills/dnfer-raids/README.md README.md CHANGELOG.md
git commit -m "docs: 攻坚查询 skill 的接口/自测/CHANGELOG"
```

---

### Task 6: 全量验证

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全量通过（存量 + 本次新增 3 个），无失败。

- [ ] **Step 2: 复核变更文件清单**

Run: `git status --short`
Expected: 工作区干净；`git log --oneline -6` 显示本特性 5 个提交（Task 1–5）。

- [ ] **Step 3: 复核新 skill 目录结构**

Run: `find skills/dnfer-raids -type f`
Expected:

```
skills/dnfer-raids/README.md
skills/dnfer-raids/SKILL.md
skills/dnfer-raids/scripts/dnfer_raid.py
```
