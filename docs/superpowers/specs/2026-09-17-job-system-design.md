# DNfer 职业体系重构 — 设计规格

日期：2026-09-17
状态：已确认
上游：`2026-09-16-dnfer-raid-scheduler-design.md`、`2026-09-17-dungeon-management-design.md`（重构角色职业，不改变攻坚排表语义）

## 1. 目标

把角色职业从「手选 输出/辅助」重构为「按职业树选具体职业」，`class_type` 由后端按固定 5 个辅助职业推导；并在角色管理与攻坚排表显示职业图标。

需求来源：`职业体系变更.md`。

已确认的约束与决策：

- 角色新增必填 `job_name`（`职业信息.json` 中 `children.name`，如 `weapon_master`）。
- `class_type` 不再由用户手选，由后端按 5 个辅助职业推导后写入数据库列。
- 辅助职业（5 个，硬编码后端常量）：`crusader_male`（神启·圣骑士 男）、`crusader_female`（神启·圣骑士 女）、`paramedic`（重霄·协战师）、`enchantress`（知源·小魔女）、`muse`（聆风·缪斯）。其余非空职业均为输出。
- 行为与现状一致：角色管理输入时，辅助职业输增益量、输出职业输模拟伤害与秒伤；攻坚排表辅助显示增益量、输出显示模拟伤害与秒伤。
- **存量角色数据清空重来**：迁移时清空 `characters` 表并清空 `slots` 占位（保留 users / raids / waves / dungeons / registration_codes）。
- 职业数据由后端提供：后端加载仓库根 `职业信息.json`，新增 `GET /api/jobs` 返回过滤后的职业树，前端选职业时拉取。
- 图标由后端托管：`images/adventure` 挂载为 `/images` 静态路由；大类图标 = `/images/sub/{name}.png`，子职业图标 = `/images/jobs/{name}.png`。
- `职业信息.json` 中的 `open` 字段忽略，不参与任何逻辑；`name == "empty"` 的子职业条目不出现在选职业列表中。

## 2. 数据模型

### 2.1 `Character` 修改

| 字段 | 类型 | 说明 |
|---|---|---|
| job_name | str(64) NOT NULL | 具体职业，`职业信息.json` 的 `children.name`，如 `weapon_master` |
| class_type | str(8)（保留列） | 不再手选，创建/更新时由 `job_name` 推导后写入 |

- `job_name` 为唯一权威职业标识；`class_type` 是推导结果的冗余存储，职责校验（`duty_valid_for_class`、`check_composition`）、`SlotOut` 序列化、公共 API 等既有读取点全部不改。
- 不落库 `job_title` / `parent_name`：序列化时经 `job_name` 查 `职业信息.json` 得出（与 `dungeon_name` 同模式，追溯反映后续 JSON 修改）。

## 3. 职业数据模块（后端）

新增 `backend/app/jobs.py`：

- 加载 `职业信息.json`（路径来自 `Settings.job_data_path`，模块级惰性加载 + 缓存）。
- `SUPPORT_JOBS: frozenset[str]` = 上述 5 个辅助职业。
- `class_type_for(job_name: str) -> str`：`"辅助"` 若在 `SUPPORT_JOBS`，否则 `"输出"`。
- `job_meta(job_name: str) -> dict | None`：返回 `{title, parent_name}`，未知职业返回 `None`。
- `job_tree() -> list[dict]`：过滤掉 `name == "empty"` 子职业后的职业树。

## 4. 后端 API

### 4.1 新增 `GET /api/jobs`（登录可见）

返回 `job_tree()`（大类 `{id, name, title, children}`，子项 `{id, name, title}`）。前端选职业用。

### 4.2 Schema 变更

- `CharacterIn`：删除 `class_type`，新增 `job_name: str`（必填）。
- `CharacterOut`：保留 `class_type`，新增 `job_name`、`job_title`、`parent_name`。
- `SlotOut`：新增 `job_name`、`job_title`（`character_id` 为空时为 `None`）。
- 新增 `JobChild`、`JobCategory` 响应模型。

### 4.3 校验与错误

- `job_name` 非法（不在 `职业信息.json` 中）→ 400「职业不存在」（`members.py` 路由校验，create/update 共用）。
- `GET /api/jobs` 为只读静态数据，无需管理员权限；沿用 `get_current_user`。
- 职责校验、小队组成规则逻辑不变。

## 5. 前端界面

### 5.1 类型与工具

- `types.ts`：`Character` 增 `job_name`/`job_title`/`parent_name`；`Slot` 增 `job_name`/`job_title`；新增 `JobChild`、`JobCategory`。
- 新增 `src/lib/job.ts`：
  - `SUPPORT_JOBS`（镜像后端 5 个辅助职业）
  - `isSupportJob(job_name)` → 表单据此显示 增益量 / 模拟伤害+秒伤 输入区
  - `jobIcon(job_name)` → `/images/jobs/{job_name}.png`
  - `categoryIcon(parent_name)` → `/images/sub/{parent_name}.png`
- `api/client.ts`：增 `getJobs()`。

### 5.2 `MyCharactersView`（角色管理）

- 列表每行：显示子职业图标（`jobIcon`）+ 职业名（`job_title`）+ 原 class_type / 名望 / 数值展示（行为不变）。
- 添加/编辑表单：职业选择器替换原「输出/辅助」下拉：
  1. 大类图标网格（`categoryIcon` + title），点击选中大类；
  2. 展示该大类子职业图标网格（`jobIcon` + title），点击选中具体职业；
  3. 按选中职业的推导 `class_type` 显示对应输入区（模拟伤害+秒伤 / 增益量），并提示职业类型。
- 编辑回填：根据角色 `job_name` 反推父类并预选。
- 保存提交 `job_name`（不再提交 `class_type`）。

### 5.3 `CharacterPickerModal`（攻坚选角色）

- 每行显示子职业图标 + 职业名（便于辨认），数值展示不变。

### 5.4 `SlotCell`（攻坚排表）

- 占位格显示子职业小图标 + 职业名（在角色名旁），数值/职责展示不变。

## 6. 文件托管与配置

- `Settings` 增 `job_data_path: str = "../职业信息.json"`、`images_dir: str = "../images/adventure"`（相对 cwd，dev 下 `cd backend` 启动即指向仓库根；与既有 `static_dir` 同模式）。
- `backend/app/main.py`：在 SPA 静态挂载（`app.mount("/", ...)`）**之前**注册 `app.mount("/images", StaticFiles(directory=settings.images_dir))`。
- `frontend/vite.config.ts`：dev 代理增 `'/images': 'http://localhost:8000'`。
- `Dockerfile`：增 `COPY 职业信息.json ./`、`COPY images/ ./images/`，并 `ENV DNFER_JOB_DATA_PATH=/app/职业信息.json`、`DNFER_IMAGES_DIR=/app/images/adventure`。
- `.dockerignore` 无需改动（未排除 `images/` 与 `职业信息.json`）。

## 7. 数据迁移

新增 `migrate_jobs(engine)`（幂等，沿用 `init_db` → `migrate_dungeons` 模式）：

1. `ALTER TABLE characters ADD COLUMN job_name VARCHAR(64)`（仅当列不存在时）。
2. 仅在**本次新增该列时**（存量库首次迁移）执行清空：`DELETE FROM characters`；`UPDATE slots SET character_id = NULL, duty = NULL, version = version + 1, updated_by = NULL, updated_at = NULL`。
3. 新库（`create_all` 直接建出 `job_name` NOT NULL 列）不触发清空。

说明：SQLite 无法对已有数据的表直接加 NOT NULL 列，故 `ALTER ADD` 后列为可空；因存量数据已清空、ORM 写入恒提供 `job_name`，可空列无实际影响。清空仅在加列这一次执行，后续启动不重复删除（幂等）。

## 8. 测试

- **后端 pytest**：
  - `class_type_for` 推导：5 个辅助职业 → 辅助，若干输出职业（剑魂/狂战士/元素师等）→ 输出。
  - 创建/更新角色带 `job_name`，响应含 `job_title` / `parent_name` / 推导的 `class_type`。
  - 非法 `job_name` → 400。
  - `GET /api/jobs` 返回职业树且无 `empty` 条目。
  - 回归：辅助职业占位默认职责为主奶、`duty_valid_for_class` 仍生效；`SlotOut` 含 `job_name`/`job_title`。
  - 迁移：`migrate_jobs` 加列 + 清空角色/占位。
- **前端 Vitest**：
  - `lib/job.spec.ts`：`isSupportJob` 推导、图标 URL 拼接。
  - `MyCharactersView` 表单测试：选职业后显示正确输入区、提交 `job_name`。
  - 既有 `RaidListView.spec.ts` 等若因类型变更报错则同步更新。

## 9. 变更文件范围

后端：

- `backend/app/models.py` — `Character` 增 `job_name`
- `backend/app/schemas.py` — `CharacterIn/Out`、`SlotOut`、新增 `JobChild/JobCategory`
- `backend/app/jobs.py` — 新模块（加载 JSON、推导、职业树）
- `backend/app/routers/members.py` — create/update 校验 `job_name`、显式构造 `CharacterOut`
- `backend/app/routers/public.py` 或 `raids.py` — 新增 `GET /api/jobs`
- `backend/app/main.py` — 挂载 `/images`
- `backend/app/config.py` — 增 `job_data_path`、`images_dir`
- `backend/app/migrations.py` — 新增 `migrate_jobs`
- `backend/app/db.py` — `init_db` 调用 `migrate_jobs`

前端：

- `frontend/src/types.ts` — Character/Slot/Job 类型
- `frontend/src/lib/job.ts` — 新工具
- `frontend/src/api/client.ts` — `getJobs()`
- `frontend/src/views/MyCharactersView.vue` — 职业选择器 + 列表图标
- `frontend/src/components/CharacterPickerModal.vue` — 子职业图标
- `frontend/src/components/SlotCell.vue` — 子职业图标 + 职业名
- `frontend/vite.config.ts` — `/images` 代理

部署：

- `Dockerfile` — 复制 `images/` 与 `职业信息.json`，设置 env
