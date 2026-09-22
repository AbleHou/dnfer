---
name: dnfer-characters
description: 录入与查询 DNF 角色到 DNfer 系统，或按 QQ 号自助注册。当群友发送账号或昵称及角色截图/文字描述请求记录角色、要求按账号/昵称查询角色、或发送「QQ号注册」请求自助注册时使用。
---

# DNfer 角色录入与查询

群友把「账号或昵称」+ 角色信息（截图或文字）发到群里时，用本技能把角色录入系统；群友要求查询某账号或昵称的角色时，用本技能查询。

## 重要前提

- **账号 = DNfer 系统登录用户名（username）**，不是游戏账号。群友消息里的「账号」通常指这个用户名。
- **昵称 = 系统内全局唯一的昵称**（群昵称通常是它），因此可按昵称无歧义定位用户。
- 群友消息通常只说「帮 xxx 添加角色 / 为 xxx 更新信息」，不标注类型——此时用**默认模式**（昵称优先，404 回退账号）即可；若群友明确说「账号 xxx」或「昵称 xxx」，用对应的**强制模式**（`--by-account` / `--by-nickname`）。
- 脚本所需的环境变量（`DNFER_API_BASE`、`DNFER_API_TOKEN`）已由运行环境提供，直接调用脚本即可，不要自己拼接地址或 Token。

## 调用方式

在技能目录下执行（`scripts/dnfer_api.py`）：

```bash
# 录入/编辑角色：默认昵称优先，404 回退账号
python scripts/dnfer_api.py add <昵称或账号> '<角色数组json>'
# 强制按昵称 / 强制按账号
python scripts/dnfer_api.py add --by-nickname <昵称> '<角色数组json>'
python scripts/dnfer_api.py add --by-account <账号> '<角色数组json>'

# 查询角色（同样支持默认 / --by-nickname / --by-account）
python scripts/dnfer_api.py list <昵称或账号>
python scripts/dnfer_api.py list --by-nickname <昵称>
python scripts/dnfer_api.py list --by-account <账号>

# 按 QQ 号免码注册（账号=密码=昵称=QQ号）
python scripts/dnfer_api.py register <QQ号>
```

stdout 只输出 JSON，直接解析它。

## 注册

群友发送「QQ号注册」或「注册 QQ号」（QQ 号为纯数字）时，按 QQ 号免注册码自助开户：**账号=密码=昵称=该 QQ 号**。注册后即可用该 QQ 号（账号或昵称）录入/查询角色。

```bash
python scripts/dnfer_api.py register 872557240
```

stdout 成功：`{"account":"872557240","nickname":"872557240"}`

- 成功 → 回复「注册成功，账号=密码=昵称=872557240，可用 QQ 号登录网站」
- 消息里没有数字 → 回复「请发送你的 QQ 号，格式如 872557240注册」
- 已注册（stdout `{"ok":false,"status":400,"error":"用户名已存在"}`）→ 「这个 QQ 号已经注册过，直接使用即可」
- 昵称被占（`... error:"昵称已存在"`）→ 「这个昵称已被占用，请联系管理员」
- 格式非法（`... error:"QQ号仅支持 6-64 位纯数字"`）→ 「请发送有效的 QQ 号」
- Token/网络错误（stdout `{"ok":false,"error":...}`，无 status）→ 「系统暂时不可用，稍后再试」

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

群友消息：「我的账号 zhangsan」+ 一张角色截图（剑魂，名望 21 万）——明确给了账号，用 `--by-account`：

```bash
python scripts/dnfer_api.py add --by-account zhangsan '[{"name":"剑魂","fame":210000}]'
```

群友消息：「帮张三添加角色，剑魂，名望 21 万」——只给了昵称，默认模式（昵称优先）即可：

```bash
python scripts/dnfer_api.py add 张三 '[{"name":"剑魂","fame":210000}]'
```

stdout 返回：`{"account":"zhangsan","nickname":"张三","results":[{"name":"剑魂","ok":true,"action":"created","character":{...}}]}`——响应含解析出的 `account` 与 `nickname`，回复群友时据此回显核对身份。

- 一个请求可提交多个角色：`'[{"name":"剑魂","fame":210000},{"name":"鬼泣","job_name":"soul_bender"}]'`
- `action`：`created`（新建）/ `updated`（编辑，仅更新本次提供的字段，其余保留）
- 某个角色 `ok:false` 且带 `error`（如「职业不存在」）不影响其他角色

## 查询示例

```bash
python scripts/dnfer_api.py list zhangsan
python scripts/dnfer_api.py list 张三   # 昵称同样可用
```

stdout 返回：`{"account":"zhangsan","nickname":"张三","characters":[...]}`

## 回复群友

- **录入后**：逐角色回复结果，并回显解析到的身份（账号与昵称），例如：
  - 「剑魂 已录入（created），账号 zhangsan（昵称 张三）」
  - 「剑魂 已更新（updated），账号 zhangsan（昵称 张三）」
  - 「鬼泣 录入失败：职业不存在」
- **查询后**：列出角色名、职业、名望（及数值）；账号/昵称存在但没有角色时回复「该账号/昵称还没有角色」。
- **账号/昵称不存在**（stdout 为 `{"ok":false,"status":404,...}`）：回复「这个账号/昵称还没注册，请发送『你的QQ号注册』自助注册。」
- **Token/网络错误**（stdout 为 `{"ok":false,"error":...}`）：回复「系统暂时不可用，稍后再试。」
