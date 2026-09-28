---
name: dnf-meeting
description: 查询 DNfer 秘党会议当前的投票与结果，或替玩家投当前投票。当群友发送「当前投票」「投票结果」「投（选项）」「（账号或昵称）投（选项）」等文本时使用。
---

# DNfer 秘党会议（当前：投票）

秘党会议用于群成员决定事项，本技能当前覆盖其中的【投票】子功能。群友在群里问当前投票、或要投票时，用本技能查看当前投票信息并代投；后续其它子功能再逐步扩展。

## 重要前提

- **当前投票**：全系统同时最多一个打开的投票。取当前打开的投票用脚本 `current`（脚本自动选打开的那场，不要自己猜）。
- 脚本所需环境变量（`DNFER_API_BASE`、`DNFER_API_TOKEN`）已由运行环境提供，直接调用脚本即可，不要自己拼接地址或 Token。

## 调用方式

在技能目录下执行（`scripts/dnf_meeting.py`）：

```bash
# 查看当前打开的投票（含各选项票数与投票人；无打开时输出 vote=null）
python scripts/dnf_meeting.py current

# 列出全部投票（含已结束）
python scripts/dnf_meeting.py list

# 替玩家投当前投票：<QQ号或昵称> + 一个或多个选项文本（多选用空格分隔）
python scripts/dnf_meeting.py vote 872557240 打
python scripts/dnf_meeting.py vote 龙应藏进云里 周五晚上
python scripts/dnf_meeting.py vote 872557240 打 周六  # 多选
# 投匿名票
python scripts/dnf_meeting.py vote 872557240 打 --anon
```

stdout 只输出 JSON，直接解析它。`current` 的 `vote.options[]` 里有各选项 `text/count/voters`；`vote` 成功时 `vote.picked` 是被投中的选项文本列表。

## 触发映射

| 群友消息 | 动作 |
|---|---|
| 「当前投票 / 投票结果」 | `current` → 回复标题 + 各选项 `选项：n 票（投票人）` |
| 「（QQ号或昵称）投（选项文本）」 | `vote <QQ号或昵称> <选项文本...>` |
| 「（QQ号或昵称）投匿名的（选项）」 | `vote <QQ号或昵称> <选项文本> --anon` |
| 「投票列表 / 历史投票」 | `list` |

- 投票目标一律为「当前打开的投票」；`current` 返回 `vote=null` 时回复「当前没有进行中的投票」。
- 多选投票可投多个选项；单选只投一个。
- 选项文本按 `current` 输出的 `options[].text` 精确匹配，不要改动措辞。

## 回执映射（stdout 判断）

| stdout | 回复 |
|---|---|
| `{"ok":true,"vote":null,"reason":"no_open"}` | 「当前没有进行中的投票」 |
| `vote` 成功 `{"ok":true,"vote":{...}}` | 「已帮 昵称/账号 投了《标题》：选项A、选项B」（`--anon` 时加一句「（匿名）」） |
| `{"ok":false,"status":400,"error":"你已投票"}` | 「该成员已投过这个投票了」 |
| `{"ok":false,"status":400,"error":"投票已结束"}` | 「这个投票已结束」 |
| `{"ok":false,"status":400,"error":"选项「X」不存在，可选：…"}` | 转述可用选项 |
| `{"ok":false,"status":400,"error":"单选投票只能投一个选项"}` | 「单选投票，只投一个选项即可」 |
| `{"ok":false,"status":400,"error":"选项重复"}` | 「选项重复了，一个选项投一次即可」 |
| `{"ok":false,"status":403,"error":"该用户已被封禁"}` | 「该成员已被封禁，无法投票」 |
| `{"ok":false,"status":404,"error":"账号或昵称不存在"}` | 「这个账号/昵称还没注册，请发送『你的QQ号注册』自助注册」 |
| `{"ok":false,"error":...}`（无 status，Token/网络） | 「系统暂时不可用，稍后再试」 |
| `{"ok":false,"status":401,...}` | 「机器人还没配好 Token，找管理员」 |

- `current` 输出的 `voters` 里「匿名」表示匿名票（不暴露是谁投的），照常转述票数与人数。
