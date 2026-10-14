# dnfer-raids 多团报名询问 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当存在多个未锁定攻坚且玩家未指定报/退哪个时，dnfer-raids skill 返回全部候选让玩家选择，模型将玩家回复（序号/团名）映射为团 id 后用新增的 `--raid <id>` 精确定位报名/取消报名。

**Architecture:** 纯 skill 侧改动（脚本 + SKILL.md + README + 测试），不动后端/DB。脚本新增纯函数 `_signup_targets`（单团沿用现有 `_pick_signup_target` 自动语义；多团返回 `ambiguous` + 全部未锁定候选，按 starts_at asc、id 次 key 排序）与 `_candidate_out`（候选输出形状）；`signup`/`unsign` 子命令新增可选 `--raid <id>`，给定则跳过选团直接 `_signup_call`，未给则走 `_signup_targets` 判定（no_target / 自动 / ambiguous 三种 stdout）。SKILL.md 增加询问流程与回执映射。

**Tech Stack:** Python 3（纯标准库 urllib/argparse）、AstrBot Anthropic Skill、pytest（importlib 加载脚本做纯函数单测）。

**Spec:** `docs/superpowers/specs/2026-10-14-dnfer-raids-signup-ambiguous-design.md`

**约定：** 按仓库既定约定直接提交 `main`，不做 worktree。提交信息用 `[feat]/[fix]/[test]/[docs]` + 中文描述 + `Co-Authored-By` 尾注。

---

### Task 1: 脚本纯函数 `_signup_targets` + `_candidate_out`（TDD，含旧用例迁移）

**Files:**
- Modify: `skills/dnfer-raids/scripts/dnfer_raid.py`（在 `_pick_signup_target` 之后新增两函数）
- Modify: `backend/tests/test_dnfer_raid_script.py`（删除 5 个旧 `_pick_signup_target` 用例，新增 `_signup_targets`/`_candidate_out` 用例）

- [ ] **Step 1: 改写测试文件——删旧用例、写失败的新用例**

删除以下 5 个直接测 `_pick_signup_target` 的用例（多团自动选团行为已废弃）：
`test_signup_target_prefers_next_future`、`test_signup_target_today_future_is_next`、`test_signup_target_today_unlocked_fallback`、`test_signup_target_excludes_locked_future`、`test_signup_target_none`。

新增用例（沿用 `_raid(id_, starts_at, locked=False)` fixture；`datetime` 已导入）：

```python
def test_signup_targets_no_unlocked():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [_raid(1, "2026-09-23T10:00:00", locked=True)]
    assert dnfer_raid._signup_targets(raids, now) == (None, [], "no_target")


def test_signup_targets_single_future_next():
    now = datetime(2026, 9, 23, 10, 0)
    target, cands, reason = dnfer_raid._signup_targets(
        [_raid(1, "2026-09-23T20:00:00")], now)
    assert target["id"] == 1 and cands == [] and reason == "next"


def test_signup_targets_single_today_unlocked():
    now = datetime(2026, 9, 23, 15, 0)
    target, cands, reason = dnfer_raid._signup_targets(
        [_raid(1, "2026-09-23T14:00:00")], now)
    assert target["id"] == 1 and cands == [] and reason == "today_unlocked"


def test_signup_targets_single_stale_past_no_target():
    now = datetime(2026, 9, 23, 10, 0)
    # 唯一未锁定团是非当天的已过团 → 沿用旧逻辑 no_target
    assert dnfer_raid._signup_targets(
        [_raid(1, "2026-09-20T14:00:00")], now) == (None, [], "no_target")


def test_signup_targets_multiple_unlocked_ambiguous_sorted():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [
        _raid(3, "2026-09-26T15:00:00"),
        _raid(1, "2026-09-26T14:00:00"),
        _raid(2, "2026-09-26T14:00:00"),
        _raid(9, "2026-09-27T10:00:00", locked=True),  # 锁定 → 排除
    ]
    target, cands, reason = dnfer_raid._signup_targets(raids, now)
    assert target is None and reason == "ambiguous"
    assert [c["id"] for c in cands] == [1, 2, 3]  # starts_at asc, id 次 key


def test_signup_targets_multiple_but_one_unlocked_auto():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [
        _raid(1, "2026-09-26T14:00:00"),
        _raid(2, "2026-09-27T10:00:00", locked=True),
    ]
    target, cands, reason = dnfer_raid._signup_targets(raids, now)
    assert target["id"] == 1 and cands == [] and reason == "next"


def test_candidate_out_shape_minimal_fixture():
    r = {"id": 3, "name": "周本", "starts_at": "2026-10-18T20:00:00", "locked": False}
    out = dnfer_raid._candidate_out(r)
    assert out["id"] == 3 and out["name"] == "周本"
    assert out["dungeon_name"] is None and out["size"] is None
    assert out["locked"] is False
    assert out["starts_at_local"] == "2026-10-18 20:00 周日"


def test_candidate_out_passes_dungeon_and_size():
    r = {"id": 3, "name": "周本", "dungeon_name": "雾神", "size": 12,
         "locked": False, "starts_at": "2026-10-18T20:00:00"}
    out = dnfer_raid._candidate_out(r)
    assert out["dungeon_name"] == "雾神" and out["size"] == 12
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
Expected: 新用例 FAIL——`AttributeError: module 'dnfer_raid' has no attribute '_signup_targets'`（模块 importlib 加载时这些函数尚不存在）。

- [ ] **Step 3: 实现两个纯函数**

在 `_pick_signup_target` 函数结束处（`skills/dnfer-raids/scripts/dnfer_raid.py` 第 178-194 行，追加到第 194 行之后、`# ---------- 命令 ----------` 分隔线之前）追加：

```python
def _signup_targets(raids: list, now: datetime) -> tuple[dict | None, list, str]:
    """报名/取消报名的目标判定（纯函数）。
    返回 (target, candidates, reason)：
    - 未锁定团 == 0            → (None, [], "no_target")
    - 未锁定团 == 1            → 沿用 _pick_signup_target：
                                未来→next / 当天→today_unlocked / 陈旧过去→no_target
    - 未锁定团 >= 2            → (None, 全部未锁定团, "ambiguous")
                                candidates 按 (starts_at asc, id asc) 排序
    """
    unlocked = [r for r in raids if not r["locked"]]
    if not unlocked:
        return None, [], "no_target"
    if len(unlocked) > 1:
        candidates = sorted(unlocked,
                            key=lambda r: (_parse_iso(r["starts_at"]), r["id"]))
        return None, candidates, "ambiguous"
    target, reason = _pick_signup_target(raids, now)
    if target is None:
        return None, [], "no_target"
    return target, [], reason


def _candidate_out(r: dict) -> dict:
    """候选输出形状；可选字段 .get() 宽容（测试 fixture 字段集不同）。"""
    return {"id": r["id"], "name": r["name"],
            "dungeon_name": r.get("dungeon_name"), "size": r.get("size"),
            "locked": r["locked"],
            "starts_at_local": _fmt_local(_parse_iso(r["starts_at"]))}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
Expected: 全部 PASS（含既有 `_pick_core`/`_signup_call` 等未受影响用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/tests/test_dnfer_raid_script.py skills/dnfer-raids/scripts/dnfer_raid.py
git commit -m "$(cat <<'EOF'
[test] dnfer_raid 脚本：_signup_targets/_candidate_out 纯函数（多团 ambiguous 候选）+ 旧用例迁移

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `cmd_signup` 重构 + `--raid` 参数（TDD）

**Files:**
- Modify: `skills/dnfer-raids/scripts/dnfer_raid.py`（模块 docstring 用法、`cmd_signup`、signup/unsign argparse）
- Modify: `backend/tests/test_dnfer_raid_script.py`（顶部补 `import argparse` / `import json`，新增两个 `cmd_signup` 走通用例）

- [ ] **Step 1: 写失败用例**

测试文件顶部把 `import importlib.util` 段下方补：

```python
import argparse
import json
```

文件末尾新增：

```python
def test_cmd_signup_raid_specified(monkeypatch, capsys):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url, body))
        return {"ok": True,
                "user": {"account": "872557240", "nickname": "帅哥"},
                "raid": {"id": 3, "name": "周本",
                         "starts_at": "2026-10-18T20:00:00"}}
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    args = argparse.Namespace(identifier="872557240", raid_id=3, cancel=False)
    code = dnfer_raid.cmd_signup(args)
    out = json.loads(capsys.readouterr().out)
    assert code == 0 and out["ok"] is True
    assert out["reason"] == "specified"
    assert out["raid"] == {"id": 3, "name": "周本",
                           "starts_at_local": "2026-10-18 20:00 周日"}
    assert len(calls) == 1
    assert calls[0][1].endswith("/api/public/raids/3/signup")


def test_cmd_signup_ambiguous_outputs_candidates(monkeypatch, capsys):
    monkeypatch.setattr(dnfer_raid, "_now_local",
                        lambda: datetime(2026, 9, 23, 10, 0))
    def fake_request(method, url, body=None):
        return [
            {"id": 1, "name": "团1", "dungeon_name": "雾神", "size": 12,
             "locked": False, "starts_at": "2026-10-18T20:00:00"},
            {"id": 2, "name": "团2", "dungeon_name": "雾神", "size": 12,
             "locked": False, "starts_at": "2026-10-18T21:00:00"},
        ]
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    args = argparse.Namespace(identifier="872557240", raid_id=None, cancel=False)
    code = dnfer_raid.cmd_signup(args)
    out = json.loads(capsys.readouterr().out)
    assert code == 0 and out["ok"] is True
    assert out["selected"] is None and out["reason"] == "ambiguous"
    assert [c["id"] for c in out["candidates"]] == [1, 2]
    assert out["candidates"][0]["starts_at_local"] == "2026-10-18 20:00 周日"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -k "cmd_signup" -v`
Expected: FAIL——`cmd_signup` 尚未读 `raid_id`，ambiguous 分支不存在（`AttributeError: 'Namespace' object has no attribute 'raid_id'`，或断言失败）。

- [ ] **Step 3: 实现**

**模块 docstring**（第 10-11 行用法）改为：

```
  DNFER_API_TOKEN=xxx python dnfer_raid.py signup <identifier> [--raid <id>]
  DNFER_API_TOKEN=xxx python dnfer_raid.py unsign <identifier> [--raid <id>]
```

**`cmd_signup`** 整体替换为（保留未变逻辑，新增 `--raid` 快路径与 ambiguous 分支）：

```python
def cmd_signup(args) -> int:
    action = "unsign" if getattr(args, "cancel", False) else "signup"
    identifier = args.identifier

    # 玩家已指定团（多团询问后模型映射的 --raid）：跳过选团与拉列表
    if getattr(args, "raid_id", None) is not None:
        resp = _signup_call(args.raid_id, identifier, action)
        if resp.get("ok") is False:
            return _fail(resp)
        raid = resp.get("raid") or {}
        starts_at = raid.get("starts_at")
        out = {"ok": True, "action": action, "reason": "specified",
               "raid": {"id": raid.get("id"), "name": raid.get("name"),
                        "starts_at_local": _fmt_local(_parse_iso(starts_at))
                        if starts_at else None},
               "user": resp.get("user")}
        print(json.dumps(out, ensure_ascii=False))
        who = (resp.get("user") or {}).get("nickname") or identifier
        print(f"[dnfer-raid] {action}：{who} → {raid.get('name')}（specified）",
              file=sys.stderr)
        return 0

    result = _request("GET", f"{_base()}/api/public/raids")
    if isinstance(result, dict) and result.get("ok") is False:
        return _fail(result)
    if not isinstance(result, list):
        return _fail({"ok": False, "error": "响应格式异常"})

    target, candidates, reason = _signup_targets(result, _now_local())
    if reason == "ambiguous":
        out = {"ok": True, "selected": None, "reason": "ambiguous",
               "candidates": [_candidate_out(c) for c in candidates]}
        print(json.dumps(out, ensure_ascii=False))
        print(f"[dnfer-raid] 有 {len(candidates)} 个未锁定团，待玩家选择",
              file=sys.stderr)
        return 0
    if target is None:
        out = {"ok": True, "selected": None, "reason": "no_target"}
        print(json.dumps(out, ensure_ascii=False))
        print("[dnfer-raid] 当前没有可报名/取消的团", file=sys.stderr)
        return 0
    resp = _signup_call(target["id"], identifier, action)
    if resp.get("ok") is False:
        return _fail(resp)
    out = {"ok": True, "action": action, "reason": reason,
           "raid": {"id": target["id"], "name": target["name"],
                    "starts_at_local": _fmt_local(_parse_iso(target["starts_at"]))},
           "user": resp.get("user")}
    print(json.dumps(out, ensure_ascii=False))
    who = (resp.get("user") or {}).get("nickname") or identifier
    print(f"[dnfer-raid] {action}：{who} → {target['name']}（{reason}）",
          file=sys.stderr)
    return 0
```

**signup/unsign argparse**（`main()` 内，第 367-373 行附近）改为：

```python
    p_signup = sub.add_parser("signup", help="替玩家报名（单团自动；多团列出候选；--raid 指定）")
    p_signup.add_argument("identifier", help="DNfer 账号 username 或昵称")
    p_signup.add_argument("--raid", dest="raid_id", type=int, default=None,
                          help="指定团 id（跳过自动选团）")
    p_signup.set_defaults(func=cmd_signup, cancel=False)

    p_unsign = sub.add_parser("unsign", help="替玩家取消报名（单团自动；多团列出候选；--raid 指定）")
    p_unsign.add_argument("identifier", help="DNfer 账号 username 或昵称")
    p_unsign.add_argument("--raid", dest="raid_id", type=int, default=None,
                          help="指定团 id（跳过自动选团）")
    p_unsign.set_defaults(func=cmd_signup, cancel=True)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
Expected: 全部 PASS（含 Task 1 用例与既有用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/tests/test_dnfer_raid_script.py skills/dnfer-raids/scripts/dnfer_raid.py
git commit -m "$(cat <<'EOF'
[feat] dnfer_raid 脚本：signup/unsign 支持 --raid 指定团，多团输出 ambiguous 候选

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SKILL.md 更新

**Files:**
- Modify: `skills/dnfer-raids/SKILL.md`

- [ ] **Step 1: 调用方式新增 `--raid` 示例**

`## 调用方式` 块内报名/取消注释行下追加：

```bash
# 多团时玩家已选择：按候选 id 精确定位报名/取消
python scripts/dnfer_raid.py signup 872557240 --raid 3
python scripts/dnfer_raid.py unsign 龙应藏进云里 --raid 3
```

- [ ] **Step 2: 选团规则改写**

「报名/取消报名的目标团」一段（现为「脚本自动取当前时间下一次的团…」）改写为：

> 报名/取消报名的目标团：
> - 恰好一个未锁定团 → 脚本自动操作（未来优先，当天未锁定回退）；
> - **多个未锁定团 → 脚本输出全部候选，列出询问玩家报/退哪个**；
> - 无未锁定团 → 无可报名团。
> 玩家回复候选的序号或团名后，把它映射到候选的 `id`，再用 `--raid <id>` 精确定位（不要自行猜测团 id）。

- [ ] **Step 3: 触发映射改写**

表内报名/取消报名两行改为：

| `（QQ号或昵称）报名` | `signup <QQ号或昵称>`；stdout 为 `ambiguous` → 列出候选问「报哪个？」，玩家回序号或团名 → 映射为候选 `id` → `signup <QQ号或昵称> --raid <id>` |
| `（QQ号或昵称）取消报名` | `unsign <QQ号或昵称>`；stdout 为 `ambiguous` → 列出候选问「取消哪个？」，同上用 `--raid` 定位 |

并在表格下方补一句：**玩家回复序号或团名都接受**，一律映射回候选 `id` 再带 `--raid` 调用；首条消息若自带目标（如「报名周六的团」）仍走「先 `signup` 拿候选 → 映射 → `--raid`」同一路径，不引入 `pick` 定位。

- [ ] **Step 4: 回执映射新增两行**

| `{"ok":true,"selected":null,"reason":"ambiguous","candidates":[...]}` | 「有 N 个未锁定的团，报哪个？\n1.《A》（雾神）周日 20:00\n…\n回复序号或团名」（`unsign` 时「取消哪个？」） |
| `--raid` 指定成功 | 同 signup/unsign 成功回执（「已帮 昵称 报名《名称》 周六 14:30」） |

并补一行说明：玩家回复的序号/团名匹配不到候选（如团刚被锁定）→ 告知「这个团不存在或已锁定，重新列出候选」并重跑 `signup <标识>` 刷新。

- [ ] **Step 5: 提交**

```bash
git add skills/dnfer-raids/SKILL.md
git commit -m "$(cat <<'EOF'
[docs] dnfer-raids SKILL.md：多团报名/取消询问流程（ambiguous 候选 + --raid 定位）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: README 更新

**Files:**
- Modify: `skills/dnfer-raids/README.md`

- [ ] **Step 1: 自测命令追加 `--raid` 示例**

`## 自测` 代码块 `signup`/`unsign` 行后追加：

```bash
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py signup 872557240 --raid 3
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_raid.py unsign 872557240 --raid 3
```

- [ ] **Step 2: 增补多团行为说明**

在自测代码块后追加一段：

> **多团报名/取消**：恰好一个未锁定团时脚本自动操作；存在多个未锁定团时脚本输出全部候选（stdout `reason:"ambiguous"` + `candidates`），模型列出候选询问玩家报/退哪个，玩家回复序号或团名后模型映射为候选 `id` 再以 `signup/unsign <标识> --raid <id>` 精确定位。

- [ ] **Step 3: 提交**

```bash
git add skills/dnfer-raids/README.md
git commit -m "$(cat <<'EOF'
[docs] dnfer-raids README：多团报名/取消行为说明与 --raid 自测示例

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: CHANGELOG + 全量验证

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 新建 `[Unreleased]` 小节并追加**

`CHANGELOG.md` 顶部（当前最新为 `[v1.14] - 2026-10-14`，其上无 Unreleased）新建：

```markdown
## [Unreleased]

- 修复：dnfer-raids skill 多个未锁定团时报名/取消报名会固定落到自动选中的一场；现改为列出全部未锁定候选让玩家选择（脚本新增 `--raid <id>` 精确定位，`signup`/`unsign` 支持）。
```

- [ ] **Step 2: 全量测试验证**

Run: `cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`
Expected: 全部 PASS（无回归）。

- [ ] **Step 3: 脚本自检（直跑 --help 与单团/多团直跑为可选，若后端未启动则跳过）**

Run: `cd skills/dnfer-raids && DNFER_API_TOKEN=x python scripts/dnfer_raid.py signup --help 2>&1 | grep -- --raid`
Expected: 输出含 `--raid RAID_ID` 行（验证 argparse 装配无误，不依赖后端）。

- [ ] **Step 4: 提交**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
[docs] CHANGELOG 记录多团报名询问（--raid 定位 / ambiguous 候选）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```
