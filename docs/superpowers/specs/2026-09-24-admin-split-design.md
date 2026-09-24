# 管理功能拆分 + 用户管理增强 设计规格

日期：2026-09-24
状态：待审阅

## 1. 背景与目标

现状：`frontend/src/views/AdminView.vue` 一个页面混着「生成注册码 / 成员 / 副本管理」三块；后端管理端点（codes / users / characters）散在 `routers/auth.py`。角色只有玩家自助维护，没有管理员的按玩家维护能力；没有封禁概念；没有跨玩家的角色查询/排序。

目标：
1. 前端把管理面板拆成三个独立页面 + 子导航：**邀请码管理 / 用户管理 / 副本管理**。
2. 用户管理支持：搜索用户、查看某玩家角色、为玩家添加/修改/删除角色、封禁/解封。
3. 角色富查询（内嵌用户管理页）：筛选——具体职业、职业类别（输出/辅助）、角色名关键词、归属玩家；排序——名望、模拟伤害、增益量、持续输出、角色名。
4. 后端管理端点收敛到新路由 `routers/admin.py`。

## 2. 需求确认（与用户澄清结论）

- **封禁 = 软封禁**：被禁用户可登录查看，但禁止报名攻坚、禁止被排进位置、禁止新建攻坚；解封后恢复。
- **封禁时保留**该用户已有的报名与占位（不撤、不广播）。
- **不可封禁管理员**。
- 「职业类别」= 输出/辅助（`Character.class_type`）。
- 页面结构 = **三页 + 角色查询内嵌用户管理页**。
- 查询功能面 = **丰富型**（筛选四类 + 排序五种）。

## 3. 数据模型与迁移

### 3.1 模型（`models.py`）
`User` 新增列：
```python
is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
```

### 3.2 迁移（`migrations.py` + `db.py`）
新增幂等迁移 `migrate_users_ban(engine)`：
- `PRAGMA table_info(users)` 若无 `is_banned` 列，则
  `ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT 0`。
- 在 `db.py:init_db()` 末尾追加调用（现有模式：`create_all` + 三个存量迁移）。

### 3.3 Schema（`schemas.py`）
- `UserOut` 加 `is_banned: bool = False`（带默认，`RaidSignupOut`、bot、public 等所有复用点不受影响）。
- 新增 `AdminUserOut(UserOut)`：加 `character_count: int`（用户列表用）。
- 新增 `AdminCharacterRow(CharacterOut)`：加 `owner_id / owner_nickname / owner_username / owner_is_banned`（角色查询平铺行用）。
- 新增 `CharacterQueryResult { items: list[AdminCharacterRow], total: int }`。
- 角色查询入参走 Query 参数，不建 body schema。

## 4. 后端 API（新路由 `routers/admin.py`）

`prefix="/api/admin"`、`require_admin` 保护。把下列端点从 `auth.py` 迁入（URL 不变），其余 auth 端点留在 `auth.py`（回归纯认证）：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/admin/codes` | 生成注册码（迁移） |
| GET | `/api/admin/codes` | 注册码列表（迁移） |
| GET | `/api/admin/users?q=` | 用户列表；`q` 可选，昵称/用户名模糊；返回 `AdminUserOut[]`，按昵称排序（改造） |
| GET | `/api/admin/characters` | 分组 `PlayerCharacters[]`，**保持不变**（排表选人 `CharacterPickerModal` 依赖） |

新增端点：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/characters/query` | 角色富查询，见 4.1 |
| GET | `/api/admin/users/{uid}/characters` | 该玩家角色列表 `CharacterOut[]` |
| POST | `/api/admin/users/{uid}/characters` | 为玩家添加角色 |
| PUT | `/api/admin/users/{uid}/characters/{cid}` | 修改玩家角色（校验 `cid` 归属 `uid`） |
| DELETE | `/api/admin/users/{uid}/characters/{cid}` | 删除角色（占用校验同成员自助删除） |
| POST | `/api/admin/users/{uid}/ban` | 封禁；禁封管理员、禁封自己 |
| POST | `/api/admin/users/{uid}/unban` | 解封 |

### 4.1 角色富查询 `GET /api/admin/characters/query`
Query 参数：
- `job_name: str | None` —— 具体职业（精确匹配 `job_name`）。
- `class_type: Literal["输出","辅助"] | None` —— 输出/辅助（精确匹配）。
- `keyword: str | None` —— 角色名模糊（`Character.name contains`）。
- `owner: str | None` —— 归属玩家模糊（`User.nickname contains OR User.username contains`）。
- `sort: "fame"|"simulated_damage"|"sustained_dps"|"buff_amount"|"name" = "fame"`。
- `order: "asc"|"desc" = "desc"`。
- `limit: int = 100`（上限 200）、`offset: int = 0`。

语义：
- 返回 `CharacterQueryResult{ items, total }`；`total` 为**过滤后**总数（忽略 limit/offset）。
- 数值排序列（fame/simulated_damage/sustained_dps/buff_amount）统一 `NULLS LAST`（输出/辅助角色对应字段互斥为 NULL，避免 NULL 排位抖动）；`name` 走普通排序。
- 辅助排序键固定 `Character.id`，保证相同排序值下结果稳定。
- 用 join 取 owner（`User.nickname/username/is_banned`）。

### 4.2 共享角色逻辑
把 `members.py` 中 `_character_out`、职业校验、增改字段赋值、删除占用校验抽到 `services/characters.py`：
- `character_out(c) -> CharacterOut`
- `validate_job(job_name)`（职业不存在 400）
- `apply_character_payload(c, body)`（赋值 name/job_name/class_type/fame/damage/buff）
- `delete_character_if_free(db, cid)`（占用则 400）

`members.py` 与 `admin.py` 共同复用；`auth.py` 不再直接依赖 `members._character_out`。

### 4.3 封禁校验点
- `raids.py: signup`（自报名）：`if user.is_banned: 403 "你已被封禁，无法报名"`。
- `raids.py: fill_slot`：取到 `char` 后 `if char.owner.is_banned: 403 "该用户已被封禁，无法排表"`（独立于 `_participates`）。
- `raids.py: admin_signup`：目标用户 `is_banned` → 403。
- `raids.py: create_raid`：`if admin.is_banned: 403`（防御；规则上不允许封管理员）。
- `bot.py: POST /api/bot/raids/{rid}/signup`：目标用户 `is_banned` → 403（cancel 不拦）。
- `get_current_user` **不拦截**（软封禁可登录查看）。
- 封禁动作**不改动**现有报名与占位，**不广播** WS 事件。

## 5. 前端

### 5.1 路由与导航
- 新增路由：`/admin/codes`、`/admin/users`、`/admin/dungeons`；`/admin` 重定向到 `/admin/codes`。
- 新增 `components/AdminNav.vue`：三个 `router-link` 子导航（邀请码管理 / 用户管理 / 副本管理），激活态高亮。
- 新视图：
  - `views/AdminCodesView.vue` —— 从现有 AdminView 抽出「生成注册码」段。
  - `views/AdminDungeonsView.vue` —— 抽出「副本管理」段。
  - `views/AdminUsersView.vue` —— 新建，含角色查询区 + 用户管理区。
- 删除 `views/AdminView.vue`；`App.vue`「管理」链接保持指向 `/admin`（重定向生效）。

### 5.2 AdminUsersView（用户管理页）
**角色查询区（顶部）**：
- 筛选栏：职业类别下拉（输出/辅助/全部）、具体职业下拉（数据来自 `GET /api/jobs`，`JobCategory[]`）、角色名关键词输入、归属玩家输入。
- 排序：下拉（名望/模拟伤害/增益量/持续输出/角色名）+ 升降序切换。
- 结果表：角色名、职业（icon+title）、职业类别、名望、模拟伤害、持续输出、增益量（输出/辅助显示对应列）、归属玩家（昵称+用户名）。支持点击归属玩家 → 打开该玩家角色管理弹窗。
- 数据源 `GET /api/admin/characters/query`；分页用返回的 `total`。

**用户管理区（下方）**：
- 搜索框（昵称/用户名，`GET /api/admin/users?q=`）。
- 用户表：昵称、用户名、管理员标记、角色数、封禁状态标签、操作（查看/管理角色、封禁/解封）。
- 封禁/解封：confirm 弹窗 → `POST /api/admin/users/{id}/ban|unban` → 刷新。

### 5.3 按玩家管理角色弹窗（`AdminUserCharactersModal.vue`）
- 打开时拉 `GET /api/admin/users/{uid}/characters`，列该玩家角色（`CharacterCard` 只读列表 + 编辑/删除按钮）。
- 添加/编辑复用 `CharacterForm.vue`，加 `baseUrl` prop（默认 `/api/me/characters`；管理员场景传 `/api/admin/users/{uid}/characters`），增改走新端点。
- 删除：confirm → `DELETE /api/admin/users/{uid}/characters/{cid}`（占用时后端 400 提示）。

## 6. 测试

### 6.1 后端（新增 `tests/test_admin_management.py`）
- **封禁**：ban 后自报名 403 / 被排表 403 / 管理员替人报名 403 / 机器人报名 403 / 解封恢复 / 封禁管理员 403 / 自封 403；封禁时既有占位与报名保留（slot 仍指向该角色、signup 行仍在）。
- **角色查询**：job_name / class_type / keyword / owner 四类筛选；5 种排序方向；NULLS LAST；limit/offset 分页；`total` 正确。
- **按玩家管理角色**：add / edit / delete（归属校验、占用删除 400、`cid` 不属于 `uid` 400/404）。
- **用户搜索**：`?q=` 命中昵称/用户名，返回 `character_count` 与 `is_banned`。

### 6.2 既有测试不破坏
- `tests/test_auth.py`（codes / register）、`tests/helpers.py:make_code`（POST /api/admin/codes）URL 不变。
- `tests/test_raid_signup.py`（admin_signup / member_characters / fill 参与校验）不变。
- `tests/test_members.py`（角色 CRUD）逻辑抽到 services 后行为不变。
- `tests/test_migrations.py`：补 `is_banned` 迁移幂等用例。

### 6.3 前端（vitest）
- `AdminUsersView.spec.ts`：查询区渲染、筛选/排序参数拼进 query URL、封禁/解封调用、用户搜索、角色管理弹窗联动。
- `AdminNav.spec.ts`：三个链接与激活态。
- `CharacterForm`（或新弹窗）spec：`baseUrl` prop 下 post/put 走管理员路径。
- 既有 `CharacterPickerModal.spec.ts`（分组 `/api/admin/characters`）、`SignupMemberPicker.spec.ts`（`/api/admin/users`）不受影响。

## 7. 兼容性与影响面

- `/api/admin/codes`、`/api/admin/users`、`/api/admin/characters` **URL 与响应结构保持兼容**（`AdminUserOut` 在 `UserOut` 之上加字段，TS 结构类型兼容既有 `User[]` 用法）。
- `UserOut.is_banned` 带默认值，`RaidSignupOut`、bot 回执、public 等复用点不受影响。
- 删除 `AdminView.vue`（无既有测试引用它）。
- 无 WS 协议变更；无新的 WS 事件。
