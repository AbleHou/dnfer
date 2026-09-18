# DNfer 机器人 skill（AstrBot）— 设计规格

日期：2026-09-18
状态：已确认
上游：`2026-09-18-bot-characters-design.md`（机器人接口）与 `接口更新.md`（核心需求：群友发账号+角色截图或文字描述，机器人通过 skills 自动录入）
需求来源：`接口更新.md` + 用户口头确认

## 1. 目标

为 AstrBot（多平台聊天机器人框架，v4.13.0+ 支持 Anthropic Skills）编写一个 skill，让群机器人能：
- 解析群友发送的「账号 + 角色截图/文字描述」，自动录入角色到 DNfer（调用 `POST /api/public/characters`）
- 按账号查询角色（调用 `GET /api/public/characters?account=`）

已确认的约束与决策：

- **机器人运行环境 = AstrBot**，skill 按 Anthropic Skills 规范（目录含 `SKILL.md`，zip 上传）。
- **模型为多模态**（以图片为主、偶有文字描述）：skill 指示模型直接读图提取角色信息。
- **API 调用方式 = 附带自包含 Python 脚本**（仅 stdlib `urllib.request`，零第三方依赖），不依赖 AstrBot 是否内置 HTTP 工具。
- **API 地址默认 `http://127.0.0.1:8000`**：后端 `dnfer` 容器绑定 `127.0.0.1:8000`（仅宿主机可达），机器人同机部署可直接访问内网端口，绕过 nginx 的 UA 拦截/限流。基址与 Token 均通过环境变量注入，不硬编码。
- 字段规则沿用机器人接口语义：名称必填；职业/名望提取不到时省略（API 侧默认极诣·剑魂 `weapon_master` / `100000`）；编辑部分更新；逐角色返回结果。
- 不编造信息：只提交截图/文字中确定可见的字段。

## 2. 交付物

仓库根新建 `skills/dnfer-characters/`：

```
skills/dnfer-characters/
├── SKILL.md              # Anthropic Skills 规范（frontmatter + 指令正文）
├── scripts/dnfer_api.py  # 自包含 Python 助手（仅 stdlib）
└── README.md             # 安装（zip 上传 AstrBot「插件 → 技能」）、环境变量、测试
```

## 3. SKILL.md 设计

frontmatter：

```yaml
---
name: dnfer-characters
description: 录入与查询 DNF 角色到 DNfer 系统。当群友发送自己账号及角色截图/文字描述请求记录角色，或要求按账号查询角色时使用。
---
```

正文章节：

1. **目的与触发**：何时使用本 skill。
2. **API 调用**：`python scripts/dnfer_api.py add <账号> '<角色数组json>'` 与 `list <账号>`；说明 env `DNFER_API_BASE`/`DNFER_API_TOKEN` 已由运行环境提供，无需关心。
3. **角色解析规则**：
   - 名称必填（从截图角色名或文字提取）。
   - 职业：截图/文字可见则给 `job_name`（如 `weapon_master`、`soul_bender`、`crusader_female`），不可见则省略（API 默认极诣·剑魂）。
   - 名望：可见则给 `fame`，不可见则省略（API 默认 100000）。
   - 可选字段：`simulated_damage` / `sustained_dps`（输出职业）、`buff_amount`（辅助职业），仅当可见时提供。
   - **绝不编造**未在截图/文字中出现的信息。
4. **录入命令示例**：展示 body 结构（`{"account":"...","characters":[...]}`）与逐角色结果含义（created/updated/error）。
5. **查询命令示例**：展示响应结构（account/nickname/characters）。
6. **回复格式**：录入 → 逐角色报告成功/失败；查询 → 列出角色（职业、名望、数值）。
7. **边界情况**：账号不存在（404「账号不存在」）→ 提示群友先凭注册码注册；职业非法 → 报告该角色失败、其余继续；token/网络错误 → 提示稍后再试；同消息多角色 → 一次批量提交。

## 4. dnfer_api.py 设计

- **仅 stdlib**：`urllib.request` / `json` / `sys` / `os` / `argparse`。
- **环境变量**：`DNFER_API_BASE`（默认 `http://127.0.0.1:8000`）、`DNFER_API_TOKEN`（必填，缺失时报错提示）。
- **命令**：
  - `add <account> <characters_json>` → `POST {base}/api/public/characters`，body `{"account":..., "characters":[...]}`，`Authorization: Bearer <token>`。
  - `list <account>` → `GET {base}/api/public/characters?account=<account>`。
- **输出**：机器可读 JSON（stdout）＋ 简明摘要；非 2xx 输出 `{"ok":false,"error":...,"status":...}`，含 404/401/网络异常区分。
- 请求头 `Content-Type: application/json`；`Accept: application/json`。

## 5. README.md 设计

- 安装：将 `dnfer-characters/` 目录打成 zip（含 `SKILL.md`，大小写一致）→ AstrBot 管理面板「插件 → 技能」→ 上传。
- 环境变量：在 AstrBot 运行环境设置 `DNFER_API_BASE=http://127.0.0.1:8000`（默认即此值）、`DNFER_API_TOKEN=<与 .env 的 DNFER_API_TOKEN 一致>`。
- 自测：给出直跑脚本的 curl 等价示例与脚本自测命令。
- 同机便利说明：后端绑定 `127.0.0.1:8000`，走内网端口不受 nginx 限流/UA 拦截影响。

## 6. 测试

- 脚本单测：对 `dnfer_api.py` 做 CLI 冒烟——先手工在本地起后端（或对测试库），验证 `add` 成功、`list` 回读、404 账号不存在、401 错误 token、网络错误。
- `SKILL.md` 校验：frontmatter 含 `name`/`description`，正文含命令示例；目录名 `dnfer-characters` 合法（英文/数字/点/下划线/短横线）。

## 7. 变更文件范围

- `skills/dnfer-characters/SKILL.md` — 新建
- `skills/dnfer-characters/scripts/dnfer_api.py` — 新建
- `skills/dnfer-characters/README.md` — 新建

不改后端、不改前端、不改部署。
