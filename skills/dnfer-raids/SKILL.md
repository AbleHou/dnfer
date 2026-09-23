---
name: dnfer-raids
description: 查询 DNfer 攻坚排表与波次信息，或替玩家报名/取消报名。当群友发送「打团信息」「排表信息」「第 n 波」「前 n 波」「查找一下（某时间）的团」「（账号或昵称）报名」「（账号或昵称）取消报名」等文本时使用。
---

# DNfer 攻坚信息查询

群友在群里发送攻坚查询（「打团信息 / 排表信息 / 第 n 波 / 前 n 波 / 查找一下周六下午的团」等）时，用本技能定位一场攻坚并回复其排表/波次详情。

## 重要前提

- **攻坚（团）= Raid**：一场团有名称、副本、规模、发起时间 `starts_at`、多个波次；每个波次分红/黄/绿/蓝/紫小队，每格一个人（昵称 + 角色 + 职责）。
- **选团规则**：消息带时间 → 按时间匹配；不带时间 → 取未锁定团里 `starts_at` 离当前时间最近的一场（「离当前最近」由脚本 `pick` 计算，不要自己猜）；全部已锁定时才取最近的锁定团。
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

# 替玩家报名/取消报名：目标团为「当前时间下一次的团」，无则回退「当天未锁定的团」
python scripts/dnfer_raid.py signup 872557240
python scripts/dnfer_raid.py signup 龙应藏进云里
python scripts/dnfer_raid.py unsign 872557240
```

stdout 只输出 JSON，直接解析它。`pick` 输出 `selected` 里的 `id`，再调 `detail`。

## 触发映射

| 群友消息 | 动作 |
|---|---|
| 「打团信息 / 排表信息」（无波次） | `pick` 选团 → `detail <id> --all` → 回复概览 + 各波简短列表 |
| 「第 n 波」 | `pick` 选团 → `detail <id> --wave n` |
| 「前 n 波」 | `pick` 选团 → `detail <id> --waves n` |
| 消息含时间（今天/明天/周X/星期X/几点/上午/下午/晚上） | 解析成 `--weekday/--period/--from/--to` → `pick` 过滤 → 再 `detail` |
| 「（QQ号或昵称）报名」 | `signup <QQ号或昵称>` |
| 「（QQ号或昵称）取消报名」 | `unsign <QQ号或昵称>` |

- 解析「今天/明天/周X/星期X」时换算成具体 `--from/--to` 或 `--weekday`；「上午/下午/晚上」对应 `morning/afternoon/evening`。
- 「周六下午」→ `--weekday 5 --period afternoon`。注意：**0=周一**，周六是 `5`，周日是 `6`。
- 无数字的「下一波」不要瞎猜，回复「发我波次号，如『第 3 波』」。
- 报名/取消报名的目标团：脚本自动取「当前时间下一次的团」（`starts_at` 未过且最早），仅当没有未来未锁定团时回退「当天未锁定的团」。标识（QQ 号或昵称均可）按原样传给脚本即可；脚本自动昵称优先、404 回退账号，模型无需判断。

## 回复格式

- **概览**单行式：`名称（副本）｜时间｜规模｜n 波｜已锁定/未锁定`（展示时间用 `pick`/`raids` 的 `starts_at_local`、`detail` 的 `starts_at`，均为 `YYYY-MM-DD HH:MM 周X`，可转述为「周六 14:30」；底层 `starts_at` 字段本身已是本地时间，无需再做时区转换）。
- **波次详情**：每波一个小节 `【第 n 波】`，按 `squad_name`（红/黄/绿/蓝/紫）分组，每人一行：
  - 有角色：`昵称 · 角色名 · 职责`（如 `张三 · 剑魂 · 主C`）
  - 空位：`（空）`
- 「打团信息/排表信息」：先给概览，再给各波人数概要（如 `第1波 满 12/12`、`第2波 8/12`），不逐人展开，除非群友要求。

## 回执映射（stdout 判断）

| stdout | 回复 |
|---|---|
| `{"ok":true,"selected":null,"reason":"no_raids"}` | 「当前还没有攻坚计划」 |
| `signup` 成功 `{"ok":true,"action":"signup",...}` | 「已帮 昵称（账号）报名《名称》 周六 14:30」 |
| `unsign` 成功 `{"ok":true,"action":"unsign",...}` | 「已帮 昵称（账号）取消报名《名称》」 |
| `{"ok":true,"selected":null,"reason":"no_target"}` | 「当前没有可报名的团」（跑的是 `unsign` 时改说「当前没有可取消报名的团」） |
| `{"ok":false,"status":400,"error":"该用户已报名"}` | 「该成员已报名该团」 |
| `{"ok":false,"status":400,"error":"该用户尚未报名"}` | 「该成员尚未报名」 |
| `{"ok":false,"status":400,"error":"团长无需报名"}` | 「团长无需报名」 |
| `{"ok":false,"status":400,"error":"攻坚已锁定，无法报名"}` | 「该团已锁定，无法报名」 |
| `{"ok":false,"status":403,"error":"攻坚已锁定，无法取消报名"}` | 「该团已锁定，无法取消报名」 |
| `{"ok":false,"status":404,"error":"账号或昵称不存在"}` | 「这个账号/昵称还没注册，请发送『你的QQ号注册』自助注册」 |
| `pick` 输出 `"preferred_unlocked": true` | 概览里自然带一句「最近的一场已锁定，已改为最近未锁定的一场」，随后照常给《selected》的概览 |
| `pick` 输出 `"fallback":true` | 「没有匹配《range 里的时间》的团，最近的一场是《selected.name》（《selected.starts_at_local》）」；随后照常 `detail <id> --all` 给出该团概览 |
| `detail` 返回 `{"ok":false,"status":400,"error":"该团只有 N 波"}` | 「该团只有 N 波」 |
| `{"ok":false,"status":404,"error":"攻坚不存在"}` | 「这个团不存在或已删除」 |
| `{"ok":false,"error":...}`（无 status，Token/网络） | 「系统暂时不可用，稍后再试」 |
| `{"ok":false,"status":401,...}` | 「机器人还没配好 Token，找管理员」 |

- 若 stdout 为 `--from/--to 格式应为...` / `--weekday/--period 与 --from/--to 不能同时使用` / `--from 不能晚于 --to` 这类**参数错误**：是模型自己解析时间表达式出错，应重新推导时间后再调 `pick`，不要回复「系统暂时不可用」。
