# 临时用户（Guest）— 设计规格

日期：2026-10-15
状态：已确认
需求来源：用户口述——偶尔有群友的朋友来打一两波攻坚，对方注册意愿不强，希望在排表占位与编队时能由管理员添加「临时选手」，指定昵称与角色即可排表，不用对方自行注册。
已确认的决策：**方案 1（`User.is_guest` 标记，复用现有 User/Character/报名/占位机制）**；**持久临时用户（角色数据跨攻坚保留，下次再来直接复用）**；**转正 = 管理员设用户名+密码 + 清除 is_guest 标记（转正后对方可自行登录管理）**；**管理员网页表单录入角色信息（职业/名望/战力）**；**guest 无登录能力（随机不可知密码），全程由管理员代办**；**删除仅限 guest（清理占位/报名/角色/冒险团）**。

## 1. 目标

新增「临时用户（guest）」：由管理员代建、本身不注册不登录、但可被排表占位与编队的用户。

- 管理员创建临时用户（昵称 + 可选角色列表），系统自动生成内部用户名与不可知密码；
- 临时用户有默认冒险团「`{nickname}的冒险团`」，角色挂该团（对齐注册流程）；
- 管理员把临时用户代报名到具体攻坚后，即可走现有占位/编队流程（复用 `admin_signup` + `fill_slot`）；
- 管理员可把临时用户「转正」：设置用户名+密码、清除临时标记，之后对方可自行登录管理；
- 管理员可删除临时用户（非临时用户不可删），删除时清理其全部占位/报名/角色/冒险团并广播 WS；
- 攻坚详情页、编队页、用户管理页三处入口，均复用同一创建弹窗。

**范围**：后端（`User.is_guest` 列 + 迁移 + admin 3 个新端点）+ 前端（`User.is_guest` 类型 + 创建/转正/删除弹窗 + 三处入口 + 临时徽章）。**不含**：机器人技能侧对 guest 的特殊处理（机器人按昵称/账号查找对 guest 同样生效，无需改动）、guest 自动过期/自动清理、普通用户的删除端点。

## 2. 数据模型与迁移

### 2.1 `users.is_guest`

- `User.is_guest: Mapped[bool] = mapped_column(Boolean, default=False)`：True = 管理员代建的临时用户。
- 无新表；复用现有 User/Character/RaidSignup/AdventureParty 全部机制。
- 关系/级联不变（User 下无自动级联删除，删除端点手动清理，见 3.2）。

### 2.2 迁移 `migrate_users_guest`（幂等，挂到 `init_db()`）

对齐 `migrate_users_ban` 模式：

1. `users` 缺 `is_guest` 列 → `ALTER TABLE users ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT 0`；
2. 幂等：第二次运行时列已存在，空转。

### 2.3 guest 创建时的账号与冒险团

- `username`：管理员可指定（须全局唯一）；缺省自动生成 `guest_<uuid4().hex[:10]>`（唯一性用查询循环兜底）。
- `password_hash`：`hash_password(secrets.token_urlsafe(24))`——随机不可猜，guest 无法登录；转正时才由管理员设置真实密码。
- 默认冒险团 `{nickname}的冒险团`：创建 User 后建团，再把角色挂到该团（对齐 `auth.py register` 流程）。

## 3. 后端 API

### 3.1 schemas.py

- `UserOut` 加必填 `is_guest: bool = False` → `AdminUserOut`（= UserOut + character_count）自动携带。
- `GuestCreate`：`nickname`（必填，`min_length=1,max_length=64`，同 ProfileUpdate 的字符白名单）、`username: str | None`（可选，指定则校验唯一）、`characters: list[CharacterIn] | None = None`（可选，复用 `apply_character_payload`/`validate_job` 校验与写库，`adventure_party_id` 忽略，一律挂默认团）。
- `GuestConvertIn`：`username`（必填）、`password`（`min_length=6,max_length=128`，同 RegisterIn 约束）。
- `AdminCreateUserOut`：返回新建用户完整信息（UserOut + characters + default party id/name），供前端弹窗回填。

### 3.2 端点（`routers/admin.py`，均 `require_admin`）

**`POST /api/admin/users` — 创建临时用户**
- nickname 已存在 → 400「昵称已存在」；指定 username 已存在 → 400「用户名已存在」。
- 流程：建 User(is_guest=True, is_admin=False, username, 随机密码 hash) → flush → 建默认冒险团 → 逐角色 `validate_job` + `apply_character_payload` + 挂默认团。
- 返回 `AdminCreateUserOut`。
- 守卫：admin.is_banned → 403「你已被封禁，无法创建用户」（对齐 create_raid 的封禁拦截）。

**`POST /api/admin/users/{uid}/convert` — 转正**
- 守卫：`target.is_guest` 为 False → 400「该用户不是临时用户」；username 已被他人占用 → 400「用户名已存在」。
- 流程：设 `username`、`password_hash = hash_password(password)`、`is_guest=False`；commit。
- 昵称与冒险团名**不变**（沿用「团名不随昵称变更联动」约定）。
- 返回 `AdminUserOut`。

**`DELETE /api/admin/users/{uid}` — 删除临时用户**
- 守卫：`target.is_guest` 为 False → 400「仅可删除临时用户」。
- 清理顺序（对齐取消报名的撤位语义）：
  1. 对每个含该用户报名行的 raid：撤下该用户全部占位（`_clear_slot`）+ 删报名行（ORM 级联清 `raid_signup_characters`）；
  2. 删除该用户全部角色；
  3. 删除其全部冒险团；
  4. 删除 User。
- 广播：每场 raid 逐个 `slot:removed`（撤位）与 `raid:signup_removed`（删报名）——复用 `_remove_signup` 的广播方式，跨多场循环调用。
- 复用现有 `raids.py` 的 `_clear_slot`/`_remove_signup`；为避免竞态，全程一个事务 commit，广播在 commit 后。

### 3.3 零改动复用

- `POST /api/raids/{rid}/signups`（`admin_signup`）：代报名，勾选 guest 全部角色 → 前端「快速添加」= 创建 guest 后调此端点。
- `POST /api/admin/users/{uid}/characters` / `PUT .../characters/{cid}`：后续补/改角色。
- `POST /api/admin/users/{uid}/password`：既有改密（转正走专用 convert，不重复用）。
- 封禁语义：`ban/unban` 对 guest 与其他用户一致（guest 被禁后无法报名/占位，符合现有拦截路径）。

## 4. 前端

- `types.ts`：`User` 加必填 `is_guest: boolean` → **连带更新所有 User 字面量 fixture**（RaidList/RaidDetail/stores/raid/MemberCharactersModal 等 spec，以 `npm run build` 的 vue-tsc 为准）。`AdminUser` 继承 User 自动携带。
- **`GuestCreateModal`**（新组件，n-modal）：昵称 + 可选用户名 + 角色列表（复用 CharacterForm 的职业/名望/伤害·增益字段）→ `POST /api/admin/users`；成功 emit('created', user)。
- **`GuestConvertModal`**（新组件）：用户名 + 密码（含确认）→ `POST /users/{uid}/convert`。
- **攻坚详情页（RaidDetailView）**：管理员区「添加临时选手」按钮 → `GuestCreateModal` → 成功后调 `admin_signup`（代报名本场）→ 报名面板出现该 guest，立即可排表。
- **编队页（RosterView）**：RosterPool 工具栏「添加临时选手」按钮 → 同一 `GuestCreateModal` + 代报名。
- **AdminUsersView**：用户列表 guest 行标「临时」徽章（`v-if="u.is_guest"`）；「添加临时用户」按钮（GuestCreateModal）；guest 行操作「转正」（GuestConvertModal）、「删除」（confirmDialog → DELETE）。
- **临时徽章**（低成本）：攻坚详情报名面板与编队池的 guest 头像旁标「临时」。
- 权限：创建/转正/删除均为管理员操作（`auth.isAdmin` 判定，与现有管理入口一致）。

## 5. 约束与边界

- guest 无登录能力（随机不可知密码）；转正后凭管理员设置的账号密码登录。
- 转正仅限 `is_guest` 用户；删除仅限 `is_guest` 用户（普通用户无删除端点，保持不变）。
- 删除 guest 会清占位/报名/角色/冒险团并广播 WS，属破坏性操作，前端须 confirmDialog。
- nickname 全局唯一（对齐注册）；username 自动生成或管理员指定，均须唯一。
- 转正不改昵称与冒险团名。
- guest 持久保留直至管理员显式删除（无自动过期）。
- 机器人 `_get_user`（昵称/账号查找）对 guest 同样生效——若朋友角色信息通过机器人导入也兼容，无需改动。
- guest 不自行登录 → 不涉及秘党会议投票、报名勾选等自助流程。

## 6. 测试

### 后端（`backend/tests/`）

- **创建**：成功建 guest（is_guest=True、随机密码不可登录、默认冒险团、角色挂默认团）；昵称重复 400；指定 username 重复 400；自动 username 唯一；角色校验复用（职业不存在 400）；被封禁 admin 403。
- **转正**：成功（设用户名密码、清 is_guest、可用新密码登录）；非 guest 400；username 被占用 400；昵称/冒险团不变。
- **删除**：成功（撤全部 raid 占位+删报名+删角色+删冒险团，广播 slot:removed/raid:signup_removed）；删普通用户 400。
- **端到端**：建 guest → `admin_signup` 代报名 → `fill_slot` 成功占位；guest 取消报名/删除后占位一并撤下。
- **迁移**：`migrate_users_guest` 幂等（老库 ALTER + 二次运行空转）。
- 复用现有 `_signup_user`/`admin_signup` 测试夹具；新增 admin 端点测试文件。

### 前端

- `GuestCreateModal` / `GuestConvertModal` spec（表单校验、成功/失败路径）。
- AdminUsersView：guest 徽章、「添加临时用户」、guest 行「转正/删除」。
- RaidDetailView / RosterView：入口按钮 → 创建 → 代报名联动。
- **User fixture 补 `is_guest`**（所有 User 字面量，vue-tsc 为准）。

## 7. 非目标 / 后续

- guest 自动过期/自动清理（需时再议，当前依赖管理员手动删除）。
- 普通用户删除端点（不在此次范围）。
- bot 技能侧 guest 专属命令（暂不需要）。
