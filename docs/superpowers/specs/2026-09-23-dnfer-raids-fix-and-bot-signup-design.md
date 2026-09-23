# DNfer raids skill 修复（时间/选团）+ 机器人报名 — 设计规格

日期：2026-09-23
状态：已确认
上游：`2026-09-22-raid-query-design.md`（dnfer-raids skill）、`2026-09-22-raid-signup-design.md`（报名机制）、`2026-09-22-bot-register-design.md`（机器人接口/脚本范式）
需求来源：用户口头需求——① 修复 dnfer-raids skill 两个 bug（时间偏移、选团不优先未锁定）；② 新增机器人替群友报名/取消报名功能。

## 1. 目标

修复 AstrBot 攻坚信息查询 skill（`skills/dnfer-raids/`）的两个 bug，并为机器人新增「替玩家报名/取消报名」能力：

1. **Bug 1（时间偏移）**：库里 `starts_at` 实际存的是**本地时间**（前端 `NDatePicker` 直传 naive 本地串 `2026-09-26T14:00:00`，后端 `RaidCreate.starts_at` 原样入库），并非文档假设的 naive UTC。脚本对存量团时间做了 `+8` 偏移，导致展示与匹配全部偏早 8 小时。
2. **Bug 2（选团不优先未锁定）**：`pick` 按 `abs(dt - now)` 取离当前最近的一场，未优先未锁定——「昨天打过的副本」因离当前最近反而被选中，用户想查的「下周团本」被忽略。
3. **新功能（机器人报名）**：群友发送 `872557240报名` 或 `龙应藏进云里报名` 等文本，机器人替该玩家报名；发送 `xxx取消报名` 则取消报名。报名/取消的团本规则：**优先「当前时间下一次的团本」，仅当无未来未锁定团时才回退「当天未锁定的团本」**（用户已确认此优先级）。

已确认的约束与决策：

- **范围仅 skill 侧**：两个 bug 都在 `scripts/dnfer_raid.py` 修复；不动后端时间存储模型（前端、后端、skill 三方统一按本地时间解读 `starts_at`，全系统口径一致即可），不改 DB 模型、不加迁移。
- **方案 A（机器人报名实现）**：后端在 `/api/public`（API Token 鉴权）新增两个端点替指定用户报名/取消；脚本负责选团（确定性逻辑）并调用端点。与现有「公开端点 + 脚本做选团」的架构一致。
- **身份解析**：脚本按 `dnfer_api.py` 既有约定——**昵称优先，404 回退账号**（用户经 `/api/public/register` 注册时账号=昵称=QQ 号，两种写法皆可命中）。
- **选团规则**：只看**未锁定**团；`starts_at >= now` 中取最早 → 「下一次团」；否则取当天（`dt.date() == now.date()`）最早 → 「当天未锁定」；再无 → 无可报名团。
- **确定性脚本**：脚本继续遵循 stdout 只输出 JSON、人读摘要写 stderr、非 2xx 输出 `{"ok":false,"status":...,"error":...}` 的约定；纯 stdlib 零依赖。
- **时区**：继续固定 Asia/Shanghai（UTC+8）语义计算「当前本地时间」（`_now_local` 不变），只是不再对库值做 `+8` 转换。

## 2. Bug 1 修复：时间处理（`scripts/dnfer_raid.py`）

现状：`_to_local(dt) = dt + 8h`，所有展示/匹配都套 `_to_local(_parse_iso(starts_at))`；`_now_local()` 为「当前 UTC + 8h」（= 中国本地当前时间）。

修复：

- **删除 `_to_local`**（不再有「转本地」语义）；所有 `_to_local(_parse_iso(...))` 改为 `_parse_iso(...)`，把库值**直接当本地 naive 时间**解读：
  - `cmd_raids`：`starts_at_local = _fmt_local(_parse_iso(r["starts_at"]))`
  - `_pick_core`：`items = [{"raid": r, "dt": _parse_iso(r["starts_at"])}]`
  - `cmd_pick`：`out["selected"]["starts_at_local"] = _fmt_local(_parse_iso(...))`
  - `cmd_detail`：`"starts_at": _fmt_local(_parse_iso(raid["starts_at"]))`
- `_now_local()` **保持不变**（返回中国本地当前 naive 时间，供比较）。
- 更新文件头 docstring 与相关注释：`starts_at` 为「本地时间（前端直传 naive 本地串）」，脚本按本地时间直接读取、比较、展示；不再声称「后端 naive UTC」。**注释清理范围明确包括**：文件头 docstring、`_now_local()` 内部注释（「服务器存 naive UTC，取当前 UTC 再转 +8」）、`cmd_pick` 选中团处的「不用裸 UTC 字段」注释、`_to_local` 定义处注释。

## 3. Bug 2 修复：pick 优先未锁定（`scripts/dnfer_raid.py`）

`_pick_core` 的选团逻辑改为**未锁定优先**：

- 在候选（时间过滤后）里，若存在未锁定团 → 取 `abs(dt - now)` 最小（次 key `dt`）的**未锁定**团；全部锁定才取最近的锁定团。
- 时间过滤无命中 → 回退路径同样应用未锁定优先（在所有团中）。
- 抽出纯函数，如：
  ```python
  def _closest_prefer_unlocked(items, now):
      """items: [{raid, dt}]；未锁定优先，返回 (item, skipped_locked)。
      skipped_locked=True 表示：为选未锁定而跳过了绝对距离更近的锁定团。"""
  ```
- meta 新增字段：当 `skipped_locked` 为真时置 `"preferred_unlocked": true`，供模型解释「昨天的团已锁定，最近未锁定的是这场」。其余 meta（`matched_by` / `matches` / `fallback` / `range`）语义不变。

## 4. 后端接口（`backend/app/routers/bot.py`、`schemas.py`）

`bot.py` 路由前缀为 `/api/public`，路由级 `Depends(require_api_token)`（沿用）。

### 4.1 `schemas.py` 新增 `BotSignupIn`

```python
class BotSignupIn(BaseModel):
    account: str | None = Field(default=None, min_length=1, max_length=64)
    nickname: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def _exactly_one_identity(self):
        if (self.account is None) == (self.nickname is None):
            raise ValueError("account 与 nickname 必须恰好提供一个")
        return self
```

与 `BotCharactersIn` 的校验模式一致。

### 4.2 `POST /api/public/raids/{rid}/signup` — 替玩家报名

- 复用 `raids._raid_or_404(db, rid)` 与 `bot._get_user(db, body.account, body.nickname)`（账号或昵称不存在 → `404 "账号或昵称不存在"`）。
- 校验（顺序与既有报名端点一致）：
  - `user.id == raid.created_by` → `400 "团长无需报名"`
  - `raid.locked` → `400 "攻坚已锁定，无法报名"`
  - 已存在报名行 → `400 "该用户已报名"`
- 新增 `RaidSignup(raid_id=rid, user_id=user.id)`，`commit` 后 `db.refresh(rs)`；`IntegrityError` 兜底（并发重复）→ 回滚 + `400 "该用户已报名"`。
- 广播 `raid:signup { user: <目标用户 UserOut>, created_at: rs.created_at.isoformat() }`（注意是**目标用户**，非机器人）。
- 返回（比既有报名端点多带 user/raid，便于模型回显）：
  ```python
  {"ok": True,
   "user": UserOut.model_validate(user).model_dump(),
   "raid": {"id": raid.id, "name": raid.name, "starts_at": raid.starts_at.isoformat()}}
  ```

### 4.3 `POST /api/public/raids/{rid}/signup/cancel` — 替玩家取消报名

- 复用 `raids._raid_or_404`、`bot._get_user`。
- `raid.locked` → `403 "攻坚已锁定，无法取消报名"`（与自取消 `cancel_self` 一致）。
- 无报名行 → `400 "该用户尚未报名"`。
- 复用 `raids._remove_signup(db, raid, user.id)`（删报名行 + 撤下该用户全部占位 + 广播 `slot:removed` 与 `raid:signup_removed`；为 async 函数，端点须 `async def`）。
- 返回：`{"ok": True, "user": UserOut.model_validate(user).model_dump(), "raid": {"id": raid.id, "name": raid.name, "starts_at": raid.starts_at.isoformat()}}`。

## 5. 脚本新增命令（`scripts/dnfer_raid.py`）

### 5.1 选团纯函数 `_pick_signup_target(raids, now)`

```python
def _pick_signup_target(raids, now):
    """返回 (raid 或 None, reason)。
    reason: "next"（下一次团）/ "today_unlocked"（当天未锁定）/ None（无可报名团）。
    只看未锁定团；优先 starts_at >= now 中最早；否则当天（同日期）最早。"""
```

- 输入 `raids` 为 `/api/public/raids` 列表（含 `starts_at`、`locked`）。
- `locked` 过滤后 `items = [{"raid": r, "dt": _parse_iso(r["starts_at"])}]`。
- `future = [it for it in items if it["dt"] >= now]` → 有则 `min(future, key=dt)`，`reason="next"`。
- 否则 `today = [it for it in items if it["dt"].date() == now.date()]` → 有则 `min(today, key=dt)`，`reason="today_unlocked"`。
- 否则返回 `(None, None)`。

### 5.2 子命令 `signup <标识>` / `unsign <标识>`

流程（两命令共享一个 `_cmd_signup(args, action)`）：

1. `GET /api/public/raids` → 全部团；失败透传 `{"ok":false,...}`。
2. `_pick_signup_target(raids, _now_local())` → `(raid, reason)`；`raid is None` → stdout `{"ok": true, "selected": null, "reason": "no_target"}`（stderr 摘要「当前没有可报名的团」）→ 退出 0。
3. 身份解析：昵称优先、404 回退账号（仿 `dnfer_api._resolve`）：
   ```python
   def _signup_call(raid_id, identifier, action):
       url = f"{_base()}/api/public/raids/{raid_id}/signup"  # action=="unsign" 时结尾为 /signup/cancel
       def call(field, value):
           return _request("POST", url, {field: value})
       result = call("nickname", identifier)
       if result.get("ok") is False and result.get("status") == 404:
           result = call("account", identifier)
       return result
   ```
4. 后端错误透传（stdout `{"ok":false,"status":...,"error":...}`，退出非 0）；成功则 stdout：
   ```python
   {"ok": True, "action": "signup"|"unsign", "reason": <next|today_unlocked>,
    "raid": {"id": ..., "name": ..., "starts_at_local": <_fmt_local(_parse_iso(...))>},
    "user": {"account": ..., "nickname": ...}}
   ```
   `user` 取自后端响应的 `user` 字段。

stdout 契约汇总：

| 情形 | stdout |
|---|---|
| 报名/取消成功 | `{"ok":true,"action":...,"reason":...,"raid":{...},"user":{...}}` |
| 无可报名团 | `{"ok":true,"selected":null,"reason":"no_target"}` |
| 后端 400/403/404 | `{"ok":false,"status":...,"error":...}`（透传） |
| Token/网络 | `{"ok":false,"error":...}`（透传） |

## 6. SKILL.md（`skills/dnfer-raids/SKILL.md`）

- frontmatter `description` 追加：`「...报名 / 取消报名」`。
- **触发映射新增**：

| 群友消息 | 动作 |
|---|---|
| `<QQ号或昵称>报名` | `signup <QQ号或昵称>` |
| `<QQ号或昵称>取消报名` | `unsign <QQ号或昵称>` |

- 调用方式新增示例：
  ```bash
  python scripts/dnfer_raid.py signup 872557240
  python scripts/dnfer_raid.py signup 龙应藏进云里
  python scripts/dnfer_raid.py unsign 872557240
  ```
- **选团规则更新**：`pick` 改为「未锁定优先、离当前最近」；`signup/unsign` 的目标团规则（下一次团优先、当天未锁定回退）写明。
- **时间措辞更新**：回复格式一节去掉「别用裸 UTC 字段 `starts_at`」的表述（`starts_at` 现为本地 ISO 串，直接按本地解读；`starts_at_local` 仍为 `YYYY-MM-DD HH:MM 周X`）。
- **回执映射新增**（stdout 判断）：

| stdout | 回复 |
|---|---|
| signup 成功 | 「已帮 昵称（账号）报名《名称》 周六 14:30」 |
| unsign 成功 | 「已帮 昵称（账号）取消报名《名称》」 |
| `{"ok":true,"selected":null,"reason":"no_target"}` | 「当前没有可报名的团」（unsign 时：「当前没有可取消报名的团」） |
| `{"ok":false,"status":400,"error":"该用户已报名"}` | 「该成员已报名该团」 |
| `{"ok":false,"status":400,"error":"该用户尚未报名"}` | 「该成员尚未报名」 |
| `{"ok":false,"status":400,"error":"团长无需报名"}` | 「团长无需报名」 |
| `{"ok":false,"status":400,"error":"攻坚已锁定，无法报名"}` | 「该团已锁定，无法报名」 |
| `{"ok":false,"status":403,"error":"攻坚已锁定，无法取消报名"}` | 「该团已锁定，无法取消报名」 |
| `{"ok":false,"status":404,"error":"账号或昵称不存在"}` | 「这个账号/昵称还没注册，请发送『你的QQ号注册』自助注册」 |

- 标识解析说明：`872557240` 这类纯数字按 QQ 号（账号），`龙应藏进云里` 这类中文按昵称；脚本自动昵称优先、404 回退账号，模型无需判断。

## 7. README（skill 与根）

- `skills/dnfer-raids/README.md`：自测部分追加 `signup`/`unsign` 直跑命令。
- 根 `README.md`：机器人 API 表补两个新端点与 curl 示例：
  ```bash
  curl -X POST https://<域名>/api/public/raids/1/signup \
       -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
       -d '{"account":"872557240"}'
  curl -X POST https://<域名>/api/public/raids/1/signup/cancel \
       -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
       -d '{"nickname":"龙应藏进云里"}'
  ```

## 8. CHANGELOG

`CHANGELOG.md` [Unreleased]：

- 新增：机器人替玩家报名/取消报名（`POST /api/public/raids/{rid}/signup` 与 `/signup/cancel`，按账号或昵称）；AstrBot skill 支持「xxx报名 / xxx取消报名」消息。
- 修复：dnfer-raids skill 时间口径（库值即本地时间，不再 +8）与选团优先未锁定。

## 9. 测试

### 后端 `backend/tests/test_bot_raid_signup.py`（新）

- 鉴权：无 Token / 错 Token → 401。
- 报名成功（按 account / 按 nickname 各一），`raid_signups` 有行、广播 `raid:signup` 目标为用户。
- 重复报名 → 400「该用户已报名」；锁定 → 400「攻坚已锁定，无法报名」；团长 → 400「团长无需报名」；用户不存在 → 404。
- 取消成功：撤下该用户全部占位 + 广播 `slot:removed` / `raid:signup_removed`；未报名 → 400「该用户尚未报名」；锁定 → 403。
- `account`/`nickname` 都缺或都给 → 422。

### 脚本 `backend/tests/test_dnfer_raid_script.py`（新，`importlib` 加载纯 stdlib 脚本）

- **导入策略**：`importlib.util.spec_from_file_location` + `module_from_spec` + `exec_module` 按绝对路径加载 `skills/dnfer-raids/scripts/dnfer_raid.py`（不依赖 sys.path / 不装包），放 `backend/tests/` 复用既有 pytest 运行方式（`cd backend && .venv/bin/python -m pytest tests/test_dnfer_raid_script.py -v`）。

- `_parse_iso` 解析；`_fmt_local` 输出 `YYYY-MM-DD HH:MM 周X`。
- `_pick_core`：未锁定优先——近处锁定团 + 远处未锁定团 → 选未锁定且 `preferred_unlocked:true`；全部锁定 → 选最近；时间过滤后同样未锁定优先；无命中回退也未锁定优先。
- 时间口径：给定 `starts_at="2026-09-26T14:00:00"`（本地）的团，`pick`/`raids` 的 `starts_at_local` 应为 `2026-09-26 14:00 周六`（不出现 `22:00`）。
- `_pick_signup_target`：未来团优先；无未来回退当天未锁定；锁定团被排除；全无 → `(None, None)`。

## 10. 变更文件范围

- `backend/app/schemas.py` — 新增 `BotSignupIn`
- `backend/app/routers/bot.py` — 新增 2 端点（复用 `raids._raid_or_404` / `raids._remove_signup` / `bot._get_user`）
- `skills/dnfer-raids/scripts/dnfer_raid.py` — Bug1/Bug2 修复 + `signup`/`unsign` 命令 + `_pick_signup_target`
- `skills/dnfer-raids/SKILL.md` — 触发映射/选团规则/时间措辞/回执映射
- `skills/dnfer-raids/README.md` — 自测命令
- `README.md` — 机器人 API 表 + curl
- `CHANGELOG.md` — [Unreleased] 新增 + 修复
- `backend/tests/test_bot_raid_signup.py` — 新增
- `backend/tests/test_dnfer_raid_script.py` — 新增

不改 DB 模型、不加迁移、无前端改动。
