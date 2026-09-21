# DNfer 机器人 skill 支持按昵称添加/查询角色 — 设计规格

日期：2026-09-21
状态：已确认
上游：`2026-09-18-dnfer-bot-skill-design.md`（AstrBot skill）、`2026-09-18-bot-characters-design.md`（机器人接口）
需求来源：用户口头确认

## 1. 目标

让 AstrBot skill（`skills/dnfer-characters`）除按**账号（username）**外，也能按**昵称**录入与查询角色，以匹配群友的常见表达——群友通常说「帮xxx添加角色 / 为xxx更新信息」，很少明确标注「账号 xxx」或「昵称 xxx」。

已确认的前提与决策：

- **昵称全局唯一**（注册 / 改昵称强制唯一，`backend/app/routers/auth.py` 已实现），因此按昵称查用户无歧义，正常最多命中 1 人。
- 昵称唯一性是本功能的前提，**保持现状**，不放开。
- 群友消息里身份词通常不标注类型：**自动解析默认昵称优先，404 回退账号**；若群友明确指明账号或昵称，则用对应模式（强制指定，不做回退）。
- 后端 `POST /api/public/characters` 与 `GET /api/public/characters` 保持**向后兼容**：原有 `account` 用法不变，新增可选 `nickname`。

## 2. 交付物 / 变更文件范围

- `backend/app/schemas.py` — `BotCharactersIn` 增加可选 `nickname`（account/nickname 恰好二选一）；`BotCharactersOut` 增加 `nickname` 字段
- `backend/app/routers/bot.py` — `_get_user` 支持按 nickname 查询；POST/GET 支持 nickname
- `backend/tests/test_bot_characters.py` — 新增按昵称与校验用例
- `skills/dnfer-characters/scripts/dnfer_api.py` — `add`/`list` 支持默认自动解析 + `--by-nickname`/`--by-account` 强制模式
- `skills/dnfer-characters/SKILL.md` — 身份规则与命令示例更新
- `skills/dnfer-characters/README.md` — 用法与自测示例更新

不改前端、不改部署、不改昵称唯一性校验。

## 3. 后端设计

### 3.1 schemas.py

`BotCharactersIn` 的 `account` 由必填改为可选，新增可选 `nickname`，用 pydantic `model_validator` 强制**恰好二选一**（都缺或都填 → 422）：

```python
from pydantic import model_validator

class BotCharactersIn(BaseModel):
    account: str | None = Field(default=None, min_length=1, max_length=64)
    nickname: str | None = Field(default=None, min_length=1, max_length=64)
    characters: list[BotCharacterIn]

    @model_validator(mode="after")
    def _exactly_one_identity(self):
        if (self.account is None) == (self.nickname is None):
            raise ValueError("account 与 nickname 必须恰好提供一个")
        return self
```

- `BotCharactersOut` **新增 `nickname: str`**，`account` 与 `nickname` 均回填解析出的值（按昵称录入时，机器人能回显「账号 zhangsan（昵称 张三）」）。`BotCharacterList` 本就有 `account` + `nickname`，同样回填解析值。

### 3.2 bot.py

`_get_user` 改为按账号或昵称查用户：

```python
def _get_user(db, account=None, nickname=None) -> User:
    if account is not None:
        user = db.scalars(select(User).where(User.username == account)).first()
    else:
        users = db.scalars(select(User).where(User.nickname == nickname)).all()
        if len(users) > 1:  # 防御：昵称唯一被破坏（正常不应发生）
            raise HTTPException(500, "昵称重复，数据异常")
        user = users[0] if users else None
    if user is None:
        raise HTTPException(404, "账号或昵称不存在")
    return user
```

- `POST /characters`：`user = _get_user(db, body.account, body.nickname)`，响应 `BotCharactersOut(account=user.username, nickname=user.nickname, results=...)`
- `GET /characters`：查询参数同时接受 `account` / `nickname`；两者都缺或都填 → 400「account 与 nickname 必须二选一」。响应**必须改为** `BotCharacterList(account=user.username, nickname=user.nickname, ...)`——不能把查询参数 `account` 直接透传，否则按昵称查询时 `account` 会错填成昵称

## 4. skill 设计

### 4.1 dnfer_api.py

`add` / `list` 位置参数由 `account` 改为 `identifier`，支持三种模式：

```bash
# 默认：昵称优先，404 回退账号（群友只说「帮xxx添加角色」的常见场景）
python scripts/dnfer_api.py add 张三 '[{"name":"剑魂","fame":210000}]'
python scripts/dnfer_api.py list 张三

# 强制昵称（群友明确说「昵称 xxx」）
python scripts/dnfer_api.py add --by-nickname 张三 '[...]'
# 强制账号（群友明确说「账号 xxx」）
python scripts/dnfer_api.py add --by-account zhangsan '[...]'
```

- 自动模式：先发 `nickname`，仅当 404（账号/昵称不存在）时回退重发 `account`；401 / 500 / 网络错误不重试
- 自动模式下**两次都 404**：报告最后一次（账号回退）的 `{"ok":false,"status":404}`，模型按 SKILL.md 的 404 规则回复
- `--by-nickname` / `--by-account`：只发对应字段，不做回退
- 后端响应回填了解析出的 `account` 与 `nickname`。`list` 的 stderr 摘要沿用「账号 X（昵称 Y）共 N 个角色」；`add` 不新增 stderr 行，模型以 stdout JSON 里的 `account`/`nickname` 为回显依据
- 查询参数 `nickname`（中文）须经 `urllib.parse.quote` 编码，与现有 `account` 的处理一致

### 4.2 SKILL.md

身份规则更新为：

- **账号** = DNfer 系统登录用户名（username）
- **昵称** = 系统内全局唯一的昵称（群昵称通常是它）
- 群友**明确指明**账号或昵称 → 用 `--by-account` / `--by-nickname` 对应模式
- 只说「帮xxx添加角色 / 为xxx更新信息」等**未指明类型** → 用默认模式（昵称优先，404 回退账号）
- 录入成功时向群友回显解析到的账号+昵称（例：「已录入到账号 zhangsan（昵称 张三）」）
- 404 提示语更新为「这个账号/昵称还没在系统注册，请先用注册码注册（找管理员要码）。」

命令示例、查询示例、回复规则同步更新；frontmatter `description` 同步提及「按昵称录入/查询」，避免 AstrBot 按 description 选择 skill 时漏触发仅含昵称的消息（如「帮张三添加角色」）。

### 4.3 README.md

用法与自测示例补上三种模式（默认昵称优先回退账号、`--by-nickname`、`--by-account`）。

## 5. 测试

### 5.1 后端 test_bot_characters.py

现有账号用例保持不动（向后兼容）；新增：

- `POST` 按昵称创建 → `created`，响应 `account` 为解析出的 username 且 `nickname` 为该昵称
- `GET` 按昵称查询 → 返回该用户角色，响应 `account` 为解析出的 username 且 `nickname` 为该昵称
- `POST` 缺 account 且缺 nickname → 422；两者都填 → 422
- `GET` 两者都缺 / 都填 → 400
- 按不存在的昵称查 → 404

注：`test_requires_token` 发空 body 仍先被路由级鉴权 401 拦截，不受 schema 改为可选影响。

### 5.2 skill 脚本

延续现有做法：README 自测章节补三种模式的冒烟命令（含昵称→账号回退），无自动化测试。

## 6. 非目标

- 不放开昵称唯一性校验（注册 / 改昵称仍强制唯一）
- 不改前端、不改部署、不改既有账号流程
- 不新增独立接口（复用 `POST/GET /api/public/characters`，加可选 `nickname`）
