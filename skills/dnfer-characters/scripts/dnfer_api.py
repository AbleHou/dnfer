#!/usr/bin/env python3
"""DNfer 机器人 API 助手（仅 Python 标准库，零第三方依赖）。

用法：
  DNFER_API_TOKEN=xxx python dnfer_api.py add <account> '<characters_json>'
  DNFER_API_TOKEN=xxx python dnfer_api.py list <account>

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


def cmd_add(account: str, characters_json: str) -> int:
    try:
        characters = json.loads(characters_json)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"characters JSON 解析失败：{e}"},
                         ensure_ascii=False))
        return 2
    if not isinstance(characters, list):
        print(json.dumps({"ok": False, "error": "characters 必须是数组"}, ensure_ascii=False))
        return 2
    result = _request("POST", f"{_base()}/api/public/characters",
                      {"account": account, "characters": characters})
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok") is False:
        print(f"[dnfer] 录入失败：{result.get('error')}", file=sys.stderr)
        return 1
    else:
        for r in result.get("results", []):
            mark = "✓" if r.get("ok") else "✗"
            action = f"（{r.get('action')}）" if r.get("action") else ""
            reason = f"：{r.get('error')}" if not r.get("ok") else ""
            print(f"[dnfer] {mark} {r.get('name')}{action}{reason}", file=sys.stderr)
    return 0


def cmd_list(account: str) -> int:
    url = f"{_base()}/api/public/characters?account={urllib.parse.quote(account)}"
    result = _request("GET", url)
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok") is False:
        print(f"[dnfer] 查询失败：{result.get('error')}", file=sys.stderr)
        return 1
    else:
        chars = result.get("characters", [])
        print(f"[dnfer] 账号 {result.get('account')}（{result.get('nickname')}）"
              f"共 {len(chars)} 个角色", file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="DNfer 机器人 API 助手")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add", help="批量添加/编辑角色")
    p_add.add_argument("account", help="DNfer 系统登录账号 username")
    p_add.add_argument("characters_json",
                       help='角色数组 JSON，如 \'[{"name":"剑魂","fame":210000}]\'')

    p_list = sub.add_parser("list", help="按账号查询角色")
    p_list.add_argument("account", help="DNfer 系统登录账号 username")

    args = parser.parse_args()
    if args.cmd == "add":
        return cmd_add(args.account, args.characters_json)
    if args.cmd == "list":
        return cmd_list(args.account)
    return 2


if __name__ == "__main__":
    sys.exit(main())
