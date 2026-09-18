---
name: dnfer-characters
description: 录入与查询 DNF 角色到 DNfer 系统。当群友发送自己账号及角色截图或文字描述请求记录角色，或要求按账号查询角色时使用。
---

# DNfer 角色录入与查询

群友把「DNfer 系统登录账号」+ 角色信息（截图或文字）发到群里时，用本技能把角色录入系统；群友要求查询某账号角色时，用本技能查询。

## 重要前提

- **账号 = DNfer 系统登录用户名（username）**，不是游戏账号、不是群昵称。群友消息里的「账号」通常指这个用户名。
- 脚本所需的环境变量（`DNFER_API_BASE`、`DNFER_API_TOKEN`）已由运行环境提供，直接调用脚本即可，不要自己拼接地址或 Token。

## 调用方式

在技能目录下执行（`scripts/dnfer_api.py`）：

```bash
# 录入/编辑角色：<characters_json> 是角色数组
python scripts/dnfer_api.py add <账号> '<角色数组json>'

# 查询角色
python scripts/dnfer_api.py list <账号>
```

stdout 只输出 JSON，直接解析它。

## 角色解析规则

从截图（多模态读图）或文字中提取角色信息，**只提取确定可见的字段，绝不编造**：

| 字段 | 规则 |
|---|---|
| name（角色名） | 必填，从截图角色名或文字提取 |
| job_name（职业） | 可见才给（如 `weapon_master` 剑魂、`soul_bender` 鬼泣、`crusader_female` 圣骑士·女）；看不到就**省略**（系统默认极诣·剑魂） |
| fame（名望） | 可见才给；看不到就**省略**（系统默认 100000） |
| simulated_damage / sustained_dps | 输出职业的模拟伤害/秒伤，可见才给 |
| buff_amount | 辅助职业的增益量，可见才给 |

## 录入示例

群友消息：「我的账号 zhangsan」+ 一张角色截图（剑魂，名望 21 万）。

```bash
python scripts/dnfer_api.py add zhangsan '[{"name":"剑魂","fame":210000}]'
```

stdout 返回：`{"account":"zhangsan","results":[{"name":"剑魂","ok":true,"action":"created","character":{...}}]}`

- 一个请求可提交多个角色：`'[{"name":"剑魂","fame":210000},{"name":"鬼泣","job_name":"soul_bender"}]'`
- `action`：`created`（新建）/ `updated`（编辑，仅更新本次提供的字段，其余保留）
- 某个角色 `ok:false` 且带 `error`（如「职业不存在」）不影响其他角色

## 查询示例

```bash
python scripts/dnfer_api.py list zhangsan
```

stdout 返回：`{"account":"zhangsan","nickname":"张三","characters":[...]}`

## 回复群友

- **录入后**：逐角色回复结果，例如：
  - 「剑魂 已录入（created）」
  - 「剑魂 已更新（updated）」
  - 「鬼泣 录入失败：职业不存在」
- **查询后**：列出角色名、职业、名望（及数值）；账号存在但没有角色时回复「该账号还没有角色」。
- **账号不存在**（stdout 为 `{"ok":false,"status":404,...}`）：回复「这个账号还没在系统注册，请先用注册码注册（找管理员要码）。」
- **Token/网络错误**（stdout 为 `{"ok":false,"error":...}`）：回复「系统暂时不可用，稍后再试。」
