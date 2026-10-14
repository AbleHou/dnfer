# dnfer-raids skill 多团报名询问 — 设计规格

日期：2026-10-14
状态：已确认（草稿待审）
上游：`2026-09-23-dnfer-raids-fix-and-bot-signup-design.md`（skill 报名/选团机制与脚本范式）
需求来源：用户口头需求——存在多个未锁定攻坚且玩家未指定报/退哪个时，机器人询问玩家选择哪个团。

## 1. 目标

修复 dnfer-raids skill 的报名/取消报名在「多个未锁定团」场景下的盲区：

- **现状缺陷**：`signup`/`unsign` 由 `_pick_signup_target` 自动锁定一个团（未来团优先、当天未锁定回退）。存在多个未锁定团时：
  - 只报进自动选中的那一场，其余团被忽略；
  - 再次调用仍选同一场 → 后端 400「该用户已报名」/「该用户尚未报名」，其余团通过 skill 不可达；
  - `unsign` 同理，无法指定退哪一场。
- **目标行为**：
  - 恰好一个未锁定团 → 维持现状自动操作（不询问）；
  - 零个未锁定团 → 维持 `no_target`；
  - **多个未锁定团 → 返回全部候选让玩家自行选择**（脚本输出结构化候选，模型列出并询问，玩家回序号或团名后由模型映射为团 id 再精确定位报名/取消）。

## 2. 已确认决策（用户拍板）

1. **纯 skill 侧改动**：只改 `skills/dnfer-raids/`（脚本 + SKILL.md + README）与测试。**不动后端、不动 DB、不加迁移**。
2. **候选口径 = 全部未锁定团**：不关心玩家已报名哪些团；不排除已报名的团。
3. **单团自动操作语义完全保留**：唯一未锁定团为未来 → `next` 自动操作；唯一未锁定团为当天已过 → `today_unlocked` 自动操作；唯一未锁定团为陈旧过去（非当天）→ `no_target`。
4. **指定方式**：玩家回复「序号」或「团名/关键词」均可；**由模型凭会话记忆把回复映射到脚本输出的候选 `id`**，脚本不做名称/序号解析，只新增 `--raid <id>` 精确定位。
5. 多团候选按 `(starts_at asc, id asc)` 确定性排序。
6. **首条消息直接指定团不在本次范围**（如「报名周六的团」「报名《雾神》」）：本次只覆盖「未指定 → 询问 → 按序号/团名回执映射」的完整流程；`--raid` 参数同样服务于该询问流程的二次调用。若后续需要首条消息直接指定，再单独排期。

## 3. 脚本改动（`skills/dnfer-raids/scripts/dnfer_raid.py`）

### 3.1 新增纯函数 `_signup_targets(raids, now)`

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
```

- `unlocked = [r for r in raids if not r["locked"]]`。
- 单团路径直接委托现有 `_pick_signup_target(raids, now)`（内部同样只考虑未锁定团），保持既有单团语义与 reason；**`_pick_signup_target` 返回 `(None, None)`（陈旧过去团）须显式转成 `(None, [], "no_target")`**，返回值类型恒为 `(dict | None, list, str)`。
- 多团路径：`candidates = sorted(unlocked, key=lambda r: (_parse_iso(r["starts_at"]), r["id"]))`。
- 这是**有意的行为变更**：现有 `_pick_signup_target` 在多个未锁定团时会自动挑「下一次团」，新逻辑改为返回候选询问。

### 3.2 候选输出形状 `_candidate_out(r)`

```python
def _candidate_out(r: dict) -> dict:
    return {"id": r["id"], "name": r["name"],
            "dungeon_name": r.get("dungeon_name"), "size": r.get("size"),
            "locked": r["locked"],
            "starts_at_local": _fmt_local(_parse_iso(r["starts_at"]))}
```

可选字段用 `.get()`（测试 fixture 与真实 `/api/public/raids` 字段集不同，保持宽容）。

### 3.3 `--raid` 参数

`signup` / `unsign` 子命令新增可选 `--raid <id>`（`type=int`，缺省 None）：

```bash
python scripts/dnfer_raid.py signup 872557240 --raid 3
python scripts/dnfer_raid.py unsign 龙应藏进云里 --raid 3
```

- 给定 `--raid`：跳过选团与拉取列表，直接 `_signup_call(raid_id, ...)`。
  - 成功 stdout `reason:"specified"`；raid 信息取后端响应（后端本就返回 `raid: {id, name, starts_at}`），`starts_at_local = _fmt_local(_parse_iso(resp["raid"]["starts_at"]))`；stderr 摘要沿用现格式（`[dnfer-raid] {action}：{who} → {name}（specified）`）。
  - 后端 400/404 透传（锁定/不存在由 SKILL.md 既有回执映射兜住，脚本不预检）。
  - 注意：`--raid` 指向不存在团时后端 404 会触发 `_signup_call` 的昵称→账号回退，产生一次冗余二次请求；功能无害（404 仍透传），实现时无须特判。
- 未给 `--raid`：`GET /api/public/raids` → `_signup_targets` 判定：
  - `reason == "ambiguous"` → stdout `{"ok": true, "selected": null, "reason": "ambiguous", "candidates": [<candidate_out>...]}`，stderr 摘要「有 N 个未锁定团，待玩家选择」，退出 0。
  - `target is None`（no_target）→ 维持现状 stdout `{"ok": true, "selected": null, "reason": "no_target"}`。
  - 否则自动 `_signup_call(target["id"], ...)`，成功 stdout 沿用现契约（`reason` 为 next/today_unlocked）。

stdout 契约汇总（新增/变更行加粗）：

| 情形 | stdout |
|---|---|
| 单团自动报名/取消成功 | `{"ok":true,"action":...,"reason":"next"\|"today_unlocked","raid":{...},"user":{...}}`（不变） |
| **`--raid` 指定报名/取消成功** | `{"ok":true,"action":...,"reason":"specified","raid":{...},"user":{...}}` |
| **多未锁定团** | `{"ok":true,"selected":null,"reason":"ambiguous","candidates":[{id,name,dungeon_name,size,locked,starts_at_local},...]}` |
| 无可报名团 | `{"ok":true,"selected":null,"reason":"no_target"}`（不变） |
| 后端 400/403/404 | `{"ok":false,"status":...,"error":...}`（透传，不变） |
| Token/网络 | `{"ok":false,"error":...}`（透传，不变） |

## 4. SKILL.md 更新（`skills/dnfer-raids/SKILL.md`）

### 4.1 调用方式新增

```bash
python scripts/dnfer_raid.py signup 872557240 --raid 3
python scripts/dnfer_raid.py unsign 龙应藏进云里 --raid 3
```

### 4.2 选团规则改写

「报名/取消报名的目标团」改为：

- 恰好一个未锁定团 → 自动操作（未来优先，当天未锁定回退，维持现状）；
- **多个未锁定团 → 列出全部候选并询问玩家报/退哪个**；
- 无未锁定团 → 无可报名团。

### 4.3 触发映射新增/改写

| 群友消息 | 动作 |
|---|---|
| `（QQ号或昵称）报名` | `signup <标识>`；stdout 为 `ambiguous` → 列出候选问「报哪个？」，玩家回序号或团名 → 映射为候选 `id` → `signup <标识> --raid <id>` |
| `（QQ号或昵称）取消报名` | `unsign <标识>`；stdout 为 `ambiguous` → 列出候选问「取消哪个？」，同上用 `--raid` 定位 |

- 明确指示模型：**玩家回复序号或团名都接受**，一律由模型映射回脚本输出的候选 `id`，再带 `--raid` 调用；不要自行猜测团 id。
- **首条消息的「报名 1」「报名《团名》」等直接指定形式不在本次范围**（见决策 6）；若玩家在询问前就带目标，模型仍走「先 `signup <标识>` 拿候选 → 映射 → `--raid`」的同一路径即可，不引入 `pick` 定位。

### 4.4 回执映射新增

| stdout | 回复 |
|---|---|
| `{"ok":true,"selected":null,"reason":"ambiguous","candidates":[...]}` | 「有 N 个未锁定的团，报哪个？\n1.《A》（雾神）周日 20:00\n…\n回复序号或团名」（`unsign` 时「取消哪个？」） |
| `--raid` 指定成功 | 同 signup/unsign 成功回执（「已帮 昵称 报名《名称》 周六 14:30」） |

- 玩家回复的序号/团名匹配不到候选（如团刚被锁定）→ 告知「这个团不存在或已锁定，重新列出候选」并重跑 `signup <标识>` 刷新。

## 5. README 更新（`skills/dnfer-raids/README.md`）

- 自测命令追加 `--raid` 示例。
- 增补一段多团行为说明：恰好一个未锁定团自动操作；多个未锁定团返回候选，模型询问玩家选择后再以 `--raid` 精确定位。

## 6. 测试（`backend/tests/test_dnfer_raid_script.py`）

沿用 `importlib` 加载脚本、`_raid(id_, starts_at, locked=False)` fixture 的既有范式。

### 新增 `_signup_targets` 用例

- 无未锁定团 → `(None, [], "no_target")`。
- 单团未来 → `(raid, [], "next")`。
- 单团当天已过 → `(raid, [], "today_unlocked")`。
- 单团陈旧过去（非当天）→ `(None, [], "no_target")`。
- **多团（均未锁定）→ `(None, candidates, "ambiguous")`**；断言 `candidates` 按 starts_at 升序、同时间按 id 升序、锁定团被排除。
- 多团但其中仅一个未锁定 → 走单团自动（不 ambiguous）。

### 更新受影响用例

现有 `_pick_signup_target` 多团自动选团用例改为断言新语义：

- `test_signup_target_prefers_next_future`（两个未锁定 → 原来选 future）→ 改为 `_signup_targets` 返回 `ambiguous` 且候选含两团。
- `test_signup_target_today_future_is_next`（单团未来）→ 迁移为 `_signup_targets` 仍 `next`。
- `test_signup_target_today_unlocked_fallback`（一团未锁定当天已过 + 一团锁定）→ 单团路径仍 `today_unlocked`。
- `test_signup_target_excludes_locked_future`（一团未锁定未来 + 一团锁定）→ 单团路径仍 `next`。
- `test_signup_target_none`（全锁定）→ 仍 `no_target`。

### 可选：`cmd_signup` 走通（monkeypatch `_request` + `capsys`）

- 带 `--raid`：直接调用对应 `/api/public/raids/{id}/signup`，stdout `reason:"specified"`。
- 不带 `--raid` 且 `_request` 返回多未锁定团：stdout 为 `ambiguous` + `candidates` JSON（锁定 `_signup_targets` 与 stdout 发射之间的胶水，防纯函数单测通过但输出契约漂移）。
- `--raid` 成功路径访问 `resp["raid"]` 时用 `.get()` 取（与脚本既有防御式风格一致）。

## 7. CHANGELOG

`CHANGELOG.md` 当前最新为 `[v1.14] - 2026-10-14`、尚无 `[Unreleased]`，计划须**新建 `[Unreleased]` 小节**并追加：

- 修复：dnfer-raids skill 多个未锁定团时报名/取消报名会固定落到自动选中的一场；现改为列出全部未锁定候选让玩家选择（脚本新增 `--raid <id>` 精确定位，`signup`/`unsign` 支持）。

## 8. 变更文件范围

- `skills/dnfer-raids/scripts/dnfer_raid.py` — `_signup_targets` / `_candidate_out` / `--raid` / `cmd_signup` 重构
- `skills/dnfer-raids/SKILL.md` — 选团规则 / 触发映射 / 回执映射 / 调用方式
- `skills/dnfer-raids/README.md` — 自测命令 / 多团行为说明
- `backend/tests/test_dnfer_raid_script.py` — 新增与更新用例
- `CHANGELOG.md` — [Unreleased] 新增
- `docs/superpowers/specs/2026-10-14-dnfer-raids-signup-ambiguous-design.md` — 本文档

不改 DB 模型、不加迁移、无前端改动、不动后端。
