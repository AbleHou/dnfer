#!/usr/bin/env python3
"""DNfer 机器人投票助手（仅 Python 标准库，零第三方依赖）。

用法：
  DNFER_API_TOKEN=xxx python dnf_meeting.py current
  DNFER_API_TOKEN=xxx python dnf_meeting.py list
  DNFER_API_TOKEN=xxx python dnf_meeting.py vote <identifier> <选项文本...>

stdout 只输出机器可读 JSON；人读中文摘要写到 stderr。
非 2xx / 网络错误时 stdout 为 {"ok": false, "status": ..., "error": ...}。
环境变量：DNFER_API_BASE（默认 http://127.0.0.1:8000）、DNFER_API_TOKEN（必填）。
"""

import argparse
import json
import os
import sys
import urllib.error
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
            try:
                return json.loads(raw) if raw else {}
            except ValueError:
                return {"ok": False, "error": "响应不是合法 JSON"}
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8"))
        except Exception:
            detail = {}
        return {"ok": False, "status": e.code,
                "error": detail.get("detail") or f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"网络错误：{e.reason}"}


# ---------- 纯函数（可单测） ----------

def _find_open(votes: list) -> dict | None:
    """取打开的投票（同时仅一个）。"""
    return next((v for v in votes if v.get("open")), None)


def _match_option_ids(options: list, texts: list[str]) -> tuple[list[int], list[str]]:
    """按选项文本精确匹配，返回 (命中的 option_id 列表, 未命中的文本列表)。"""
    by_text = {o["text"]: o["id"] for o in options}
    ids, missing = [], []
    for t in texts:
        if t in by_text:
            ids.append(by_text[t])
        else:
            missing.append(t)
    return ids, missing


def _shape(vote: dict) -> dict:
    return {"id": vote["id"], "title": vote["title"], "multi_choice": vote["multi_choice"],
            "open": vote["open"], "total_voters": vote["total_voters"],
            "options": [{"text": o["text"], "count": o["count"], "voters": o["voters"]}
                        for o in vote["options"]]}


# ---------- 命令 ----------

def _fail(out: dict) -> int:
    print(json.dumps(out, ensure_ascii=False))
    print(f"[dnf-meeting] {out.get('error')}", file=sys.stderr)
    return 1


def cmd_current(args) -> int:
    result = _request("GET", f"{_base()}/api/public/votes")
    if isinstance(result, dict) and result.get("ok") is False:
        return _fail(result)
    if not isinstance(result, list):
        return _fail({"ok": False, "error": "响应格式异常"})
    vote = _find_open(result)
    if vote is None:
        print(json.dumps({"ok": True, "vote": None, "reason": "no_open"}, ensure_ascii=False))
        print("[dnf-meeting] 当前没有进行中的投票", file=sys.stderr)
        return 0
    detail = _request("GET", f"{_base()}/api/public/votes/{vote['id']}")
    if isinstance(detail, dict) and detail.get("ok") is False:
        return _fail(detail)
    out = {"ok": True, "vote": _shape(detail)}
    print(json.dumps(out, ensure_ascii=False))
    print(f"[dnf-meeting] 当前投票：{detail['title']}", file=sys.stderr)
    return 0


def cmd_list(args) -> int:
    result = _request("GET", f"{_base()}/api/public/votes")
    if isinstance(result, dict) and result.get("ok") is False:
        return _fail(result)
    if not isinstance(result, list):
        return _fail({"ok": False, "error": "响应格式异常"})
    print(json.dumps({"ok": True, "votes": result}, ensure_ascii=False))
    return 0


def _ballot_call(vote_id: int, identifier: str, option_ids: list[int]) -> dict:
    """昵称优先、404 回退账号（仿 dnfer_raid._signup_call）。群聊公开，代投恒实名。"""
    url = f"{_base()}/api/public/votes/{vote_id}/ballots"

    def call(field: str, value: str) -> dict:
        return _request("POST", url, {field: value, "option_ids": option_ids})
    result = call("nickname", identifier)
    if result.get("ok") is False and result.get("status") == 404:
        result = call("account", identifier)
    return result


def cmd_vote(args) -> int:
    result = _request("GET", f"{_base()}/api/public/votes")
    if isinstance(result, dict) and result.get("ok") is False:
        return _fail(result)
    if not isinstance(result, list):
        return _fail({"ok": False, "error": "响应格式异常"})
    vote = _find_open(result)
    if vote is None:
        out = {"ok": True, "vote": None, "reason": "no_open"}
        print(json.dumps(out, ensure_ascii=False))
        print("[dnf-meeting] 当前没有进行中的投票", file=sys.stderr)
        return 0
    detail = _request("GET", f"{_base()}/api/public/votes/{vote['id']}")
    if isinstance(detail, dict) and detail.get("ok") is False:
        return _fail(detail)
    ids, missing = _match_option_ids(detail["options"], args.options)
    if missing:
        opts = "、".join(o["text"] for o in detail["options"])
        return _fail({"ok": False, "status": 400,
                      "error": f"选项「{'、'.join(missing)}」不存在，可选：{opts}"})
    if not detail["multi_choice"] and len(ids) != 1:
        return _fail({"ok": False, "status": 400, "error": "单选投票只能投一个选项"})
    resp = _ballot_call(vote["id"], args.identifier, ids)
    if resp.get("ok") is False:
        return _fail(resp)
    picked = [o["text"] for o in detail["options"] if o["id"] in ids]
    out = {"ok": True, "vote": {"id": detail["id"], "title": detail["title"],
                                "picked": picked}}
    print(json.dumps(out, ensure_ascii=False))
    who = args.identifier
    print(f"[dnf-meeting] 已投：{who} → {detail['title']}：{'、'.join(picked)}", file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="DNfer 机器人投票助手")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_cur = sub.add_parser("current", help="查看当前打开的投票")
    p_cur.set_defaults(func=cmd_current)

    p_list = sub.add_parser("list", help="列出全部投票")
    p_list.set_defaults(func=cmd_list)

    p_vote = sub.add_parser("vote", help="替玩家投当前打开的投票")
    p_vote.add_argument("identifier", help="DNfer 账号 username 或昵称")
    p_vote.add_argument("options", nargs="+", help="选项文本（多选用空格分隔多个）")
    p_vote.set_defaults(func=cmd_vote)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
