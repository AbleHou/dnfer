# DNfer 机器人角色录入/查询 — 设计规格

日期：2026-09-18
状态：已确认
上游：`2026-09-16-dnfer-raid-scheduler-design.md`（在既有机器人 API 之上新增角色录入与查询，不改攻坚排表语义）
需求来源：`接口更新.md`

## 1. 目标

群友发送自己账号及角色截图或直接描述角色信息，群机器人通过 skills 自动录入系统。为此新增两个机器人接口（沿用固定 Token 鉴权）：

1. **添加/编辑角色**（批量）：按账号批量 upsert 角色，只有名称是必填项；名望缺省 `100000`，职业缺省 `极诣·剑魂`（`weapon_master`）；返回每个角色的添加情况。
2. **查询角色**：根据账号（系统登录用户名 username）查询其全部角色。

已确认的约束与决策：

- **账号 = 系统登录账号 username**（非游戏账号、非群昵称）。角色挂在该 `User` 下，与现有 `Character.user_id` 结构一致。
- **账号不存在时报错**：机器人向不存在的 username 录入/查询时返回 404「账号不存在」，不自动创建账号（避免绕过注册码流程创建无主账号）。
- **角色名唯一键 upsert**：每位玩家角色名不重复，添加时以角色名为唯一标识，在同一账号下（`user_id`, `name`）存在则更新、否则新建。
- 批量录入接口需返回每个角色的添加情况（成功/失败、创建/更新），单角色失败不影响其余角色。
- 默认职业常量 `weapon_master`（极诣·剑魂）、默认名望 `100000`。
- 不改 DB 模型，不加唯一约束（沿用现有无约束结构；应用层按 `user_id + name` 查首条 upsert）。
- 接口只录入能从对话中获得的信息：名称必填；职业、名望、模拟伤害/秒伤/增益量可选。

## 2. API 表面

新增路由文件 `backend/app/routers/bot.py`，`prefix="/api/public"`，路由级 `dependencies=[Depends(require_api_token)]`（与现有 `public.py` 相同鉴权语义）。在 `main.py` 注册。

### 2.1 `POST /api/public/characters` — 批量添加/编辑角色

请求体：

```json
{
  "account": "zhangsan",
  "characters": [
    {"name": "剑魂"},
    {"name": "鬼泣", "job_name": "soul_bender", "fame": 65000},
    {"name": "奶妈", "job_name": "crusader_female", "buff_amount": 2000}
  ]
}
```

- 每角色：`name` 必填（`min_length=1, max_length=64`）；`job_name` / `fame` 缺省或为 `null` 时分别默认 `weapon_master` / `100000`；`simulated_damage` / `sustained_dps` / `buff_amount` 可选透传。
- upsert 键 `(user_id, name)`：已存在则更新全部字段（含 `class_type` 按新 `job_name` 推导），否则新建。
- 响应（逐角色结果）：

```json
{
  "account": "zhangsan",
  "results": [
    {"name": "剑魂", "ok": true, "action": "created", "error": null, "character": {...CharacterOut}},
    {"name": "奶妈", "ok": false, "action": null, "error": "职业不存在", "character": null}
  ]
}
```

### 2.2 `GET /api/public/characters?account=xxx` — 查询账号角色

```json
{
  "account": "zhangsan",
  "nickname": "张三",
  "characters": [{...CharacterOut}]
}
```

`CharacterOut` 复用现有 schema（含 `job_title` / `parent_name` / `class_type` / `fame` 等）。

## 3. Schema 变更（`backend/app/schemas.py`）

新增 5 个模型：

- `BotCharacterIn`：`name`（必填）、`job_name: str | None = None`、`fame: int | None = None`、`simulated_damage`/`sustained_dps`/`buff_amount`（`int | None = None`）
- `BotCharactersIn`：`account`（`min_length=1`）、`characters: list[BotCharacterIn]`
- `BotCharacterResult`：`name`、`ok: bool`、`action: Literal["created","updated"] | None = None`、`error: str | None = None`、`character: CharacterOut | None = None`
- `BotCharactersOut`：`account`、`results: list[BotCharacterResult]`
- `BotCharacterList`：`account`、`nickname`、`characters: list[CharacterOut]`

默认值处理：`BotCharacterIn.job_name/fame` 缺省即 `None`，在 `bot.py` 处理器内统一 `job_name or "weapon_master"`、`fame if fame is not None else 100000`（区分「未提供」与「显式 0」）。

## 4. 错误处理与边界

- 账号不存在：POST / GET 均整体失败，404「账号不存在」。
- 批量内单角色职业非法（`jobs.job_meta` 返回 `None`）：仅该角色 `ok:false, error:"职业不存在"`，其余角色继续处理。
- 单次请求内重名角色：后一个覆盖前一个（同一 upsert 键再次命中更新）。
- 事务：全部角色校验后统一 `db.commit()`；单角色失败不触发整体回滚（跳过非法项继续）。
- 空 `characters` 列表：允许，返回空 `results`。

## 5. 组件与复用

- `bot.py` 内的角色序列化复用 `members.py` 的 `_character_out`（跨模块引用现有私有助手，避免重复实现）。
- 职业校验复用 `jobs.job_meta` 与 `jobs.class_type_for`。
- 默认常量在 `bot.py` 内定义为模块级：`DEFAULT_JOB = "weapon_master"`、`DEFAULT_FAME = 100000`。

## 6. 测试（`backend/tests/test_bot_characters.py`）

- token 缺失 / 错误 → 401（POST 与 GET 均验证）。
- POST 默认值：无 `job_name` / `fame` → 落库 `weapon_master` / `100000`，响应 `action=created`。
- POST 同名 upsert：再次提交同名角色 → `action=updated`，字段更新。
- POST 非法职业：该角色 `ok:false, error:"职业不存在"`，同批其余角色成功落库。
- POST 不存在的账号 → 404。
- POST 批量多个角色 → 每个角色各有一条 result。
- GET 按账号返回角色与昵称；GET 不存在账号 → 404。

## 7. 变更文件范围

- `backend/app/routers/bot.py` — 新路由（两个端点）
- `backend/app/schemas.py` — 新增 5 个模型
- `backend/app/main.py` — 注册 bot 路由
- `backend/tests/test_bot_characters.py` — 新增测试
- `README.md` — 机器人 API 表格补充两个端点（可选，随实现更新）

不改 DB 模型、不改迁移、无前端改动。
