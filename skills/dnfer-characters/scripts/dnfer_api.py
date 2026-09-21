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
from typing import Callable
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


def _resolve(by_nickname: bool, by_account: bool, identifier: str,
             lookup: Callable[[str, str], dict]) -> dict:
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
