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
