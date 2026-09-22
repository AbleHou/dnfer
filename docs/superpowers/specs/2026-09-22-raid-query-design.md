# DNfer 机器人攻坚信息查询 skill — 设计规格

日期：2026-09-22
状态：已确认
上游：`2026-09-18-dnfer-bot-skill-design.md`（既有 AstrBot skill 模式）与 `2026-09-22-bot-register-design.md`（机器人接口/脚本/文档变更范式）
需求来源：用户口头需求——群友对机器人发送「打团信息 / 排表信息 / 第 n 波 / 前 n 波 / 查找一下周六下午的团」等文本，机器人查询攻坚详情并回复

## 1. 目标

为 AstrBot（多平台聊天机器人框架，v4.13.0+ 支持 Anthropic Skills）新增一个攻坚信息查询 skill，让群机器人能根据消息里的时间等信息定位一场攻坚并回复其排表/波次详情。

已确认的约束与决策：

- **新增独立 skill 目录** `skills/dnfer-raids/`，与既有 `skills/dnfer-characters/` 并列，一 skill 一职责（攻坚查询 vs 角色录入）。
- **新增一个后端公开端点** `GET /api/public/raids/{rid}` 返回完整攻坚详情（含全部波次与格子），一次拉取，供「打团信息/排表信息」使用；不动 DB 模型、不加迁移、无前端改动。
- **默认目标团选择**：消息带时间 → 按时间匹配；不带时间 → 取 `starts_at` 离当前时间最近的一场（绝对差值，兼容「开团前查前几波」「进行中查下一波」「开团前几天查团信息」三类场景）。
- **回复粒度**：波次详情每人一行「昵称 · 角色名 · 职责」（不含伤害数值），按红/黄/绿/蓝/紫小队分组；概览用单行式。
- **确定性脚本**：脚本负责取数、时间匹配、选团、切波等**确定性**逻辑；模型只负责中文解析（含时间表达式）、调用脚本、组装回复。脚本沿用 `dnfer_api.py` 约定：**stdout 只输出 JSON，人读摘要写 stderr，非 2xx 输出 `{"ok":false,"status":...,"error":...}`**；纯 stdlib，零第三方依赖。
- **时区固定 Asia/Shanghai（UTC+8）**：库里 `starts_at` 为 naive UTC，脚本统一按 UTC 读取、转 +8 展示与匹配。
- 环境变量 `DNFER_API_BASE`（默认 `http://127.0.0.1:8000`）与 `DNFER_API_TOKEN`（必填）由运行环境提供，脚本不硬编码。

## 2. 后端接口（`backend/app/routers/public.py`）

在既有攻坚公开端点旁新增：

```
GET /api/public/raids/{rid}
```

- 鉴权沿用路由级 `Depends(require_api_token)`。
- `rid` 不存在 → `HTTPException(404, "攻坚不存在")`。
- 实现：`db.get(Raid, rid)` + 复用 `raids.py:_detail(db, raid)`（与现有 `public_wave` 一致），`response_model=RaidDetail`。
- 返回完整 `RaidDetail`：id、name、dungeon_id、dungeon_name、size、locked、starts_at、全部 waves → 每波 slots → 每格 character_name/job_title/class_type/fame/owner_nickname/duty 等。

## 3. 脚本 `skills/dnfer-raids/scripts/dnfer_raid.py`

纯 stdlib（`urllib.request` / `argparse` / `json` / `os` / `sys` / `zoneinfo`）。环境变量与 `dnfer_api.py` 同款。

### 子命令

| 命令 | 行为 | 输出要点 |
|---|---|---|
| `raids` | `GET /api/public/raids` | 每场：id、name、dungeon_name、size、locked、wave_count、`starts_at`（已转 +8 的 `YYYY-MM-DD HH:MM 周X`） |
| `pick` | 选一场团；默认取 starts_at 离当前时间最近（绝对差值）；可选 `--weekday/--period` 或 `--from/--to` 过滤 | 选中 raid 的 id 与概览 + 匹配说明（`matched_by: closest` / `weekday=..,period=..` / `range=..`）；时间过滤无命中时回退最近一场并标 `"fallback": true` 与命中的时间范围 |
| `detail <id> [--wave n \| --waves n \| --all]` | 拉一次 `GET /api/public/raids/{rid}` 完整详情，**本地切波**（单波 / 前 n 波 / 全部，缺省 `--all`） | 该场完整信息 + 请求波次；每波按 squad_index 分组，每格输出 `squad_name`（红/黄/绿/蓝/紫）、`owner_nickname`、`character_name`、`duty`、`job_title`、`is_empty` |

- `--period` 窗口：`morning` 06:00–12:00 / `afternoon` 12:00–18:00 / `evening` 18:00–24:00（半开区间 `[start, end)`）。
- `--weekday`：0=周一 … 6=周日（Python `weekday()` 语义）；解析为「下一个出现的该星期」，若该星期就是今天且窗口起点未过则取今天，否则下一周。
- `--from/--to`：显式本地 `YYYY-MM-DD HH:MM`，与 `--weekday/--period` 互斥，优先级最高。
- 输出约定与错误包装完全对齐 `dnfer_api.py`（stdout 仅 JSON；401/404/网络错误分别落到 `status` / `error`）。

## 4. SKILL.md（`skills/dnfer-raids/SKILL.md`）

frontmatter：

```yaml
---
name: dnfer-raids
description: 查询 DNfer 攻坚排表与波次信息。当群友发送「打团信息」「排表信息」「第 n 波」「前 n 波」「查找一下（某时间）的团」等文本时使用。
---
```

### 触发 → 动作映射

| 消息意图 | 动作 |
|---|---|
| 「打团信息 / 排表信息」（无波次） | `pick` 选团 → `detail <id> --all` → 回复概览 + 各波简短列表 |
| 「第 n 波」 | `pick` 选团 → `detail <id> --wave n` |
| 「前 n 波」 | `pick` 选团 → `detail <id> --waves n` |
| 消息含时间（今天/明天/周X/星期X/几点/上午/下午/晚上） | 模型解析为 `--weekday/--period/--from/--to` → `pick` 过滤 → 再 `detail` |

### 回复格式（模型组装）

- 每波一个小节 `【第 n 波】`，按 `squad_name`（红/黄/绿/蓝/紫）分组。
- 每人一行 `昵称 · 角色名 · 职责`（例：`张三 · 剑魂 · 主C`）；空位显示 `（空）`。
- 概览单行式：`名称（副本）｜时间｜规模｜n 波｜已锁定/未锁定`。

### 边界文案（SKILL.md 给模型的回执映射）

| 情形 | 回复 |
|---|---|
| 无任何团 | 「当前还没有攻坚计划」 |
| `pick` 带时间过滤但 `fallback:true` | 「没有匹配《时间》的团，最近的一场是…」 |
| `--wave n` 但 n > wave_count | 「该团只有 n 波」 |
| `{"ok":false,"status":404,"error":"攻坚不存在"}` | 「这个团不存在或已删除」 |
| `{"ok":false,"error":...}`（无 status，Token/网络） | 「系统暂时不可用，稍后再试」 |
| 「下一波」等无数字波次（不在本次范围） | 提示「发我波次号，如『第 3 波』」 |

## 5. README.md（`skills/dnfer-raids/README.md`）

- 安装：目录打 zip（含 SKILL.md，大小写一致）→ AstrBot 管理面板「插件 → 技能」上传。
- 环境变量：`DNFER_API_BASE`（默认 `http://127.0.0.1:8000`）、`DNFER_API_TOKEN`（与 .env 一致）。
- 同机部署前提与 `dnfer-characters` 一致（AstrBot 宿主机进程或 host 网络，直连内网端口）。
- 自测：给出 `raids` / `pick` / `detail` 的直跑命令与 curl 等价示例。

## 6. 文档与变更日志

- 根 `README.md`：机器人 API 表补 `GET /api/public/raids/{rid}`（说明：完整攻坚详情，含全部波次）与 curl 示例。
- `CHANGELOG.md` [Unreleased] → 新增：机器人攻坚信息查询 skill。

## 7. 测试

### 后端（`backend/tests/test_public_raids.py` 新增）

- token 缺失 / 错误 → 401。
- 正常：发起一场攻坚（走测试 fixture）后 `GET /api/public/raids/{id}` 返回完整详情，波次/格子字段齐全（含昵称、角色、职责、job_title）。
- `rid` 不存在 → 404 `攻坚不存在`。
- 与现有 `test_public.py` 中列表/单波测试相互独立。

### 脚本（CLI 冒烟，可 mock HTTP 或对本地测试库）

- `raids` 列表字段与本地时间格式。
- `pick` 默认取离当前最近的一场；`--weekday/--period` 命中；带时间但无命中时 `fallback:true` 且回退最近。
- `detail --wave n` / `--waves n` / `--all` 切波正确；`n > wave_count` 报错输出。
- 401 / 404 / 网络错误分别输出 `{"ok":false,...}`。

### SKILL.md 校验

- frontmatter 含 `name`/`description`；目录名 `dnfer-raids` 合法。

## 8. 变更文件范围

- `backend/app/routers/public.py` — 新增 `GET /api/public/raids/{rid}`
- `skills/dnfer-raids/SKILL.md` — 新建
- `skills/dnfer-raids/scripts/dnfer_raid.py` — 新建
- `skills/dnfer-raids/README.md` — 新建
- `README.md` — 机器人 API 表补端点与 curl 示例
- `CHANGELOG.md` — [Unreleased] 新增
- `backend/tests/test_public_raids.py` — 新增

不改 DB 模型、不改迁移、无前端改动。
