# DNfer 副本管理 + 攻坚发起时间 — 设计规格

日期：2026-09-17
状态：已确认
上游：`2026-09-16-dnfer-raid-scheduler-design.md`（新增子功能，不修改既有攻坚排表语义）

## 1. 目标

在现有攻坚排表系统上新增两项能力：

1. **副本管理**：管理员维护一组副本预设（名称 / 人数 / 描述），发起攻坚时只能从预设中选择副本。
2. **发起时间**：创建攻坚时必须填写发起时间（精确到分钟）。

已确认的约束：

- 攻坚副本只能从预设中选择，不允许自由输入。
- 攻坚规模（人数）**锁定**为所选副本的预设人数，创建时不可改。
- 发起时间**必填**，精确到分钟。

## 2. 数据模型

### 2.1 新增 `Dungeon`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| name | str(64) unique | 副本名称 |
| size | int | 合法规模 {4, 8, 12, 16, 20}，复用现有校验 |
| description | text | 描述，可为空 |
| created_at | datetime | |

### 2.2 `Raid` 修改

- 删除自由文本 `dungeon`，新增 `dungeon_id` → `dungeons.id`（必填，创建后不可变）。
- 新增 `starts_at` datetime（必填）：用户所选墙上时间（naive，前端 `datetime-local` 直接提交，后端原样存储/返回，不做时区换算）。
- `size`：创建时从副本 `size` 拷贝，创建后不可变（与现状一致）。
- `name`：保留；创建时默认填入副本名，可改。

### 2.3 删除约束

被攻坚引用的副本禁止删除 → `400「该副本已有攻坚记录，无法删除」`。

## 3. 后端 API

### 3.1 副本管理（管理员）

| 端点 | 说明 |
|---|---|
| `GET /api/dungeons` | 副本列表 |
| `POST /api/dungeons` | 新建 `{name, size, description}` |
| `PUT /api/dungeons/{id}` | 编辑 |
| `DELETE /api/dungeons/{id}` | 删除（被引用则 400） |

### 3.2 攻坚端点调整

- `POST /api/raids`：body 改为 `{name?, dungeon_id, starts_at}`；`size` 从 body 移除，由副本带入。
- `GET /api/raids` / `GET /api/raids/{id}`：响应增加 `dungeon_id`、`dungeon_name`、`starts_at`。
- `PUT /api/raids/{id}`：仅可改 `name`、`starts_at`；副本与规模不可变。
- `GET /api/public/raids`：增加副本名与发起时间。

### 3.3 WebSocket

`PUT /api/raids/{id}` 改名/改时间后广播 `raid:updated`，排表页实时更新头部信息。其余事件不变。

## 4. 前端界面

- **AdminView** 新增「副本管理」区块：副本列表表格（名称/人数/描述）+ 新建表单 + 编辑 + 删除。
- **创建攻坚表单**（AdminView）：
  - 副本：下拉选择预设，选中后自动带入并锁定人数（只读展示）。
  - 发起时间：`<input type="datetime-local">` 必填。
  - 攻坚名称：默认自动填入副本名，可改。
  - 移除手动选择规模。
- **攻坚列表 / 详情页**：显示副本名、规模、发起时间（如「9月20日 14:00」）。
- 新增时间格式化工具函数，列表与详情复用。

## 5. 校验与错误

- `starts_at` 缺失 → 400。
- `dungeon_id` 不存在 → 404。
- 副本 `size` 非法（不在合法集合）→ 400。
- 删除被引用副本 → 400。
- 非管理员访问副本管理端点 → 403。

## 6. 数据迁移

现有库中攻坚的 `dungeon` 自由文本字段：

1. 创建 `dungeons` 表。
2. 对现有攻坚的 `dungeon` 文本去重，逐项创建副本预设（size 默认 12、description 空）。
3. 回填 `raid.dungeon_id`。
4. 将 `dungeon_id` 设为非空。

## 7. 测试

- **后端 pytest**：副本 CRUD 与删除约束、创建攻坚（副本带入规模、starts_at 必填）、权限、迁移回填。
- **前端 Vitest**：创建攻坚表单（选副本带入规模）、时间格式化工具。
- 公共 API 响应字段更新。

## 8. 变更文件范围

后端：

- `backend/app/models.py` — 新增 Dungeon、修改 Raid
- `backend/app/schemas.py` — Dungeon 与 Raid 相关 schema
- `backend/app/routers/dungeons.py` — 新路由
- `backend/app/routers/raids.py` — 创建/编辑/列表/详情调整
- `backend/app/routers/public.py` — 公共列表字段
- `backend/app/services/raid_builder.py` — 创建攻坚从副本带入 size
- 迁移脚本

前端：

- `frontend/src/views/AdminView.vue` — 副本管理 + 创建攻坚表单
- `frontend/src/views/RaidListView.vue` — 展示副本名/规模/时间
- `frontend/src/views/RaidDetailView.vue` — 展示副本名/规模/时间，接收 `raid:updated`
- `frontend/src/api/` — 新接口与类型
- 时间格式化工具
