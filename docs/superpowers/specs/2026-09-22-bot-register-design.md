# DNfer 机器人自注册（按 QQ 号） — 设计规格

日期：2026-09-22
状态：已确认
上游：`2026-09-18-bot-characters-design.md`（在既有机器人 API 与 AstrBot skill 之上新增自注册，不改攻坚排表语义）
需求来源：群友直接对机器人发送「QQ号注册 / 注册 QQ号」，机器人免码注册账号

## 1. 目标

群友在群里对机器人发送 `872557240注册` 或 `注册 872557240`，机器人据此**免注册码**注册一个用户：账号（username）= 密码 = 昵称 = 该数字。方便群友自助开户后立即用 skill 录入/查询角色。

已确认的约束与决策：

- **账号 = 密码 = 昵称 = 群友发送的数字（QQ 号）**。账号即 DNfer 系统登录用户名 username。
- **免注册码**：机器人注册不校验 `RegistrationCode`，身份门槛是「能往群里发消息的人 + QQ 号即身份」。**网页端注册仍走注册码**，语义不变。
- **仅接受纯数字**（QQ 号）：非数字或长度不在 6–64 位直接 400。6 位下限与现有 `RegisterIn.password` 的 `min_length=6` 一致；5 位老 QQ 号走管理员发码路径。
- **已有则报错**：username 或 nickname 已存在时分别返回 400（昵称全局唯一，见 v1.5）。不自动登录、不改写已有用户。
- **沿用固定 Token 鉴权**：`POST /api/public/register` 挂在 `bot.py` 现有路由级 `require_api_token` 下。
- 成功响应沿用现有 bot 接口约定：**成功直接返回模型 JSON（无 `ok` 包装），失败走 HTTP 错误由脚本包装为 `{"ok":false,"status":...,"error":...}`**。
- 不改 DB 模型、不加迁移、无前端改动。前端注册表单维持注册码流程。

## 2. API 表面

新增端点 `backend/app/routers/bot.py`：

### `POST /api/public/register`

请求体：

```json
{"identifier": "872557240"}
```

- 新增 schema `BotRegisterIn`：`identifier: str = Field(min_length=1)`。
- 校验在**处理器内**完成（`HTTPException(400, "单字符串")`，保证脚本 `_request` 拿到的 `detail` 是可直接回显的字符串，而非 pydantic 422 的数组）：

| 条件 | 响应 |
|---|---|
| 非纯数字（正则 `^\d+$`）或长度不在 6–64 | 400 `QQ号仅支持 6-64 位纯数字` |
| `User.username` 已存在 | 400 `用户名已存在` |
| `User.nickname` 已存在 | 400 `昵称已存在` |
| `db.commit()` 抛 `IntegrityError`（并发竞态） | 兜底 400 `用户名已存在` |

- 成功创建：`User(username=identifier, password_hash=hash_password(identifier), nickname=identifier, is_admin=False)`。
- 成功响应：

```json
{"account": "872557240", "nickname": "872557240"}
```

## 3. Schema 变更（`backend/app/schemas.py`）

新增 1 个模型：

- `BotRegisterIn`：`identifier: str = Field(min_length=1)`（具体数字/长度校验在处理器内，见 §2）

## 4. 脚本变更（`skills/dnfer-characters/scripts/dnfer_api.py`）

新增 `register` 子命令：

```bash
python scripts/dnfer_api.py register <数字>
```

- POST 到 `{base}/api/public/register`，请求体 `{"identifier": <数字>}`。
- stdout 沿用既有约定：成功输出 API 返回的 JSON；失败沿用 `_request` 包装的 `{"ok":false,"status":...,"error":...}`；stderr 输出中文摘要（成功「注册成功：872557240」/ 失败原因）。

## 5. SKILL.md 变更（`skills/dnfer-characters/SKILL.md`）

- frontmatter `description` 补注册意图：「……或发送『QQ号注册』请求自助注册时使用」。
- 「调用方式」补充注册命令；新增「## 注册」段落：
  - 解析：`<数字>注册` 与 `注册 <数字>` 两种形态，提取纯数字 QQ 号；无数字则回复请发送 QQ 号。
  - 调用：`python scripts/dnfer_api.py register <数字>`
  - 回执映射：
    - 成功（`{"account":..., "nickname":...}`）→ 「注册成功，账号=密码=昵称=<QQ号>，可用 QQ 号登录网站」
    - `status:400, error:"用户名已存在"` → 「这个 QQ 号已经注册过，直接使用即可」
    - `status:400, error:"昵称已存在"` → 「这个昵称已被占用，请联系管理员」
    - `status:400, error:"QQ号仅支持 6-64 位纯数字"` → 「请发送有效的 QQ 号」
    - `error:"系统暂时不可用"` 类 → 「系统暂时不可用，稍后再试」
- 「回复群友」第 3 条（账号/昵称不存在）改文案：由「请先用注册码注册（找管理员要码）」改为「这个账号/昵称还没注册，请发送『你的QQ号注册』自助注册」。

## 6. 文档与变更日志

- 根 `README.md`：机器人 API 表补 `POST /api/public/register` 一行（说明：按 QQ 号免码注册，账号=密码=昵称=QQ号）+ 一个 curl 示例。
- skill `README.md`：自测部分补注册示例（`python scripts/dnfer_api.py register 872557240`），并注明注册后可继续用角色录入/查询。
- `CHANGELOG.md` [Unreleased] → 新增：机器人自注册。

## 7. 测试（`backend/tests/test_bot_register.py`）

- token 缺失 / 错误 → 401。
- 非法标识符：非纯数字（`abc`）→ 400；长度不足 6（`12345`）→ 400。
- 成功注册：`register 872557240` → `account`/`nickname` 均为 `872557240`；该 username/password 可登录；`is_admin=False`；随后可对其按账号录入角色。
- 重复 username：同一数字再注册 → 400 `用户名已存在`。
- 重复 nickname：先注册另一用户名但昵称为某数字，再以此数字注册 → 400 `昵称已存在`。
- round-trip：注册后按账号 `GET /api/public/characters` 返回空列表（或 POST 后能取回）。

## 8. 变更文件范围

- `backend/app/routers/bot.py` — 新增 `POST /api/public/register`
- `backend/app/schemas.py` — 新增 `BotRegisterIn`
- `skills/dnfer-characters/scripts/dnfer_api.py` — 新增 `register` 子命令
- `skills/dnfer-characters/SKILL.md` — 注册段落 + description + 404 文案
- `skills/dnfer-characters/README.md` — 自测补注册
- `README.md` — 机器人 API 表补端点
- `CHANGELOG.md` — [Unreleased] 新增
- `backend/tests/test_bot_register.py` — 新增测试

不改 DB 模型、不改迁移、无前端改动。
