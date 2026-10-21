# dnfer-characters 技能统计功能（设计规格）

日期：2026-10-21
状态：设计已获用户确认
范围：后端新增 bot 路由统计端点（`/api/public/stats/*`）+ skill 脚本 `dnfer_api.py` 新增 `stats`/`search` 子命令 + SKILL.md/README 更新 + 测试。不改数据模型、不改前端。

## 1. 背景与目标

`skills/dnfer-characters` 目前只有 `add`/`list`/`register` 三个子命令，无法回答群友的统计类问题。用户希望新增：

1. **总览统计**：有效用户数、每用户角色数、职业分布。
2. **按职业查角色清单**：按具体职业 / 职业大类 / 输出·辅助筛选角色。

## 2. 关键领域事实（已核实）

- **有效用户口径**：用户明确 = 排除封禁（`User.is_banned`）与临时用户（`User.is_guest`）后的正常账号；三个统计口径一致。
- **职业数据结构**（`职业信息.json`，`app/jobs.py`）：两级——17 个**大类**（`parent_name` code 如 `swordman_male`，title 如 `鬼剑士(男)`）+ **具体职业**（`job_name` code 如 `weapon_master`，title 如 `极诣·剑魂`）。`Character` 表存 `job_name` 与冗余快照 `class_type`（输出/辅助），**不存 parent_name**，大类需由 `job_meta(job_name)` 推导。
- **角色必属有效职业**：写库经 `validate_job`/`job_meta` 校验，故 `job_name` 均在职业数据内。
- **`CharacterOut`**（schemas.py）已含 `job_name/job_title/parent_name/class_type/fame/...`，且 `character_out(c)` 自动补冒险团字段。
- **机器人认证**：bot 路由 `/api/public` 统一 `require_api_token`（脚本用 `DNFER_API_TOKEN`）。
- **现有测试模式**：后端端点测试用 `client` fixture + `register_user` helper；skill 脚本纯函数单测用 importlib 加载（对齐 `test_dnf_meeting_script.py`）。

## 3. 后端设计（bot 路由 `/api/public`）

### 3.1 端点 1：`GET /api/public/stats/overview` — 总览

**返回**（全部基于有效用户）：
```json
{
  "total_users": 12,
  "users": [{"nickname": "张三", "character_count": 3}, ...],
  "class_types": [{"class_type": "输出", "count": 20}, {"class_type": "辅助", "count": 8}],
  "categories": [{"name": "swordman_male", "title": "鬼剑士(男)", "count": 5}, ...],
  "jobs": [{"job_name": "weapon_master", "job_title": "极诣·剑魂", "count": 3}, ...]
}
```

- `users`：**含 0 角色用户**；按角色数降序、昵称升序 tie-break。
- `class_types`：按 `Character.class_type` 分组计数（输出/辅助）。
- `categories`：按 `job_name` → `parent_name` 聚合（**只有有角色的大类才出现**），title 由职业数据映射；按 count 降序、title 升序。
- `jobs`：按 `job_name` 分组计数，title 由 `job_meta(job_name)` 映射；按 count 降序、title 升序。
- `job_meta(job_name)` 为 None 的防御处理：title 用 `job_name` 兜底（正常不应发生）。

### 3.2 端点 2：`GET /api/public/stats/characters` — 按职业/类别查角色

**查询参数**：
| 参数 | 说明 |
|---|---|
| `job` | 职业 code（`weapon_master`）**或**精确 title（`极诣·剑魂`）；解析为 **job_name 列表**后过滤 `Character.job_name.in_(...)`（性别双职业 title 如 `光启·光明骑士` 命中 crusader_male + crusader_female 两个 code） |
| `category` | 大类 code（`swordman_male`）**或** title **前缀**（`鬼剑士` 命中男/女两个大类）；解析为一组 job_name 后过滤 |
| `class_type` | `输出`/`辅助`，非法值 → 400「职业类别无效」（对齐 admin `query_characters`） |
| `with_owner` | bool，默认 false；true 时每个 item 补 `owner_nickname` |

- **至少给一个筛选**（job/category/class_type），否则 400「job/category/class_type 至少提供一个」。
- **多筛选组合为 AND 语义**：同时给 job + category + class_type 时，依次叠加过滤。
- 非法 job → 400「职业不存在」；非法 category → 400「职业类别不存在」。
- 只查有效用户的角色（`Character.user_id.in_(有效用户 id)`）。
- 排序：`fame` 降序、`Character.id` 升序。
- 不翻页，返回全部匹配（游戏群数据量小）。

**返回**：`{"items": [BotSearchItem...], "total": N}`。

### 3.3 新增 Schema（schemas.py，Bot* 命名族）

```python
class BotUserCharCount(BaseModel):
    nickname: str
    character_count: int

class BotClassTypeCount(BaseModel):
    class_type: str
    count: int

class BotCategoryCount(BaseModel):
    name: str      # parent_name code
    title: str     # 大类 title
    count: int

class BotJobCount(BaseModel):
    job_name: str
    job_title: str
    count: int

class BotStatsOverview(BaseModel):
    total_users: int
    users: list[BotUserCharCount]
    class_types: list[BotClassTypeCount]
    categories: list[BotCategoryCount]
    jobs: list[BotJobCount]

class BotSearchItem(CharacterOut):
    owner_nickname: str | None = None   # 仅 with_owner=True 时填充

class BotSearchResult(BaseModel):
    items: list[BotSearchItem]
    total: int
```

### 3.4 职业/类别解析助手（bot.py 内私有函数）

- `_resolve_job(job: str) -> list[str] | None`：返回匹配的 **job_name code 列表**（过滤用 `Character.job_name.in_(codes)`）——
  - `job_meta(job)` 非 None → 是 code，返回 `[job]`；
  - 否则遍历 `job_tree()` 找 title 精确匹配的所有 child，返回全部 code（**性别双职业 title 如 `光启·光明骑士` 命中 crusader_male + crusader_female 两个**）；
  - 都未命中 → None。
- `_resolve_category(category: str) -> list[str] | None`：遍历 `job_tree()`，`cat["name"] == category` 或 `cat["title"].startswith(category)` 的大类，收集其 children 的 `job_name` 列表；无匹配 → None。

## 4. 脚本设计（`scripts/dnfer_api.py` 新增两个子命令）

```bash
# 总览：有效用户数 + 每用户角色数 + 三粒度职业分布
python scripts/dnfer_api.py stats

# 按职业 / 大类 / 输出·辅助查角色清单；默认不带玩家信息，--with-owner 携带
python scripts/dnfer_api.py search --job weapon_master
python scripts/dnfer_api.py search --job 极诣·剑魂
python scripts/dnfer_api.py search --category 鬼剑士
python scripts/dnfer_api.py search --category swordman_male
python scripts/dnfer_api.py search --class-type 输出 --with-owner
```

- `stats`：GET `/api/public/stats/overview`，stdout 全量 JSON，stderr 中文摘要（如 `[dnfer] 共 12 名有效用户，85 个角色`）。
- `search`：`--job`/`--category`/`--class-type` 均为**可选值参数，不做 argparse 互斥、不做 required**（「至少一个筛选」由后端校验，无筛选会到达后端并得 400）；`--with-owner` 布尔开关；GET `/api/public/stats/characters`，stdout 全量 JSON，stderr 中文摘要（如 `[dnfer] 找到 3 个匹配角色`）。
- 沿用现有 `_request`/`_base`/`_token`，零新增依赖；非 2xx 错误沿用 `{"ok": false, ...}` 约定。
- **脚本模块 docstring 顶部「用法」块同步更新**，补 `stats`/`search` 示例（对齐 SKILL.md/README）。

## 5. SKILL.md / README 更新

### SKILL.md
- 新增「统计」小节：
  - 群友问「统计 / 有多少人 / 角色分布」→ `python scripts/dnfer_api.py stats`；回复：有效用户数、输出/辅助数、职业大类分布（可补具体职业分布）、可选列出每用户角色数。
  - 群友问「统计<职业> / 谁在玩<职业> / 统计输出」→ `python scripts/dnfer_api.py search ...`；默认不带玩家信息，需要时加 `--with-owner`；结果为空回复「没有符合条件的角色」。
- 职业 code 表补充常用映射（`weapon_master` 剑魂、`berserker` 狂战、`soul_bender` 鬼泣、`crusader_female` 圣骑士·女 等），并说明「职业用 code 或精确 title（如 `极诣·剑魂`）最稳妥」。

### README.md
- 自测命令追加 `stats` 与 `search` 示例；目录结构说明不变。

## 6. 测试

### 6.1 后端 `backend/tests/test_bot_stats.py`
- 认证：无 token / 错 token → 401。
- **overview**：
  - 有效用户数正确（普通用户计入；guest、封禁用户排除）。
  - `users` 每用户角色数正确（含 0 角色用户），降序排列。
  - `class_types`/`categories`/`jobs` 三粒度计数正确（title 映射正确）。
- **characters**：
  - 按 job code / job title 过滤正确。
  - **性别双职业 title**（如 `--job 光启·光明骑士`）同时命中 crusader_male 与 crusader_female 的角色。
  - 按 category code / title 前缀（`鬼剑士` 命中男女）过滤正确。
  - 按 class_type 过滤正确；非法 class_type → 400。
  - 无筛选 → 400；非法 job → 400「职业不存在」；非法 category → 400「职业类别不存在」。
  - `with_owner=True` 补 `owner_nickname`；默认不携带（owner_nickname 为 null）。
  - guest / 封禁用户的角色被排除。
  - fame 降序排列。
- 建数用 bot `POST /api/public/characters`；**建 guest / 封禁用户需先以 admin 登录**（`register_user` 返回的是新建用户自己的 token，不是 admin 头）——guest 用 admin `POST /api/admin/users`、封禁用 admin `POST /api/admin/users/{uid}/ban`（若 helper 不足，参考现有 guest/ban 测试写法）。

### 6.2 脚本 `backend/tests/test_dnfer_api_script.py`（新增，importlib 加载 `dnfer_api.py`）
- `stats`：monkeypatch `_request` → 断言 URL 为 `/api/public/stats/overview`、GET、返回 overview dict。
- `search`：断言 URL 与 query 拼装正确——`--job weapon_master`、`--category 鬼剑士`、`--class-type 输出`、`--with-owner` 组合；中文参数经 `urllib.parse.quote`（对齐 `test_dnf_meeting_script.py` 的 monkeypatch `_request` 模式，用 `urllib.parse.unquote(url)` 后 `assert "鬼剑士" in url` 校验中文参数）。
- `search` 无筛选参数：脚本允许（不做 argparse required/互斥），后端返回 400 → 断言 `ok:false` 输出；`--job`/`--class-type` 组合参数同时传给后端。

## 7. 非目标（明确排除）
- 不改数据模型、不加迁移。
- 不做模糊职业匹配（如 `剑魂` 命中 `极诣·剑魂`）：职业用精确 code/title，避免歧义（`气功师` 男女同名）。如后续需要可加。
- 不翻页：search 返回全部匹配。
- 不做每角色「所属冒险团」维度的分布统计（`CharacterOut` 已含该字段，脚本/SKILL 可选展示，但不做专门端点）。
- 前端零改动。

## 8. 风险与注意
- `Character` 不存 `parent_name`，大类统计/过滤都要在内存中经 `job_meta`/`job_tree` 映射——数据量小无性能问题；`job_meta(job_name)` 为 None 需兜底。
- 职业 title 前缀匹配只在 `category` 维度用（`鬼剑士` → 男女两个大类），`job` 维度保持精确——避免 `气功师` 男女同名歧义。
- `BotSearchItem` 继承 `CharacterOut`，`character_out(c).model_dump()` 已含冒险团字段，`owner_nickname` 按 `with_owner` 条件填充。
- 测试建 guest/封禁用户依赖 admin 端点，需在 `client` fixture 内先登录 admin（`register_user` helper 已内置 admin 登录模式）。
