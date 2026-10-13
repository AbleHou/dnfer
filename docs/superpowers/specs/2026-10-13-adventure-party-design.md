# 冒险团（多账号角色归属）— 设计规格

日期：2026-10-13
状态：已确认
需求来源：用户口述——个别玩家有多个游戏账号，现有角色管理无法区分角色属于哪个账号，攻坚排表时玩家需频繁切换账号登录。新增「冒险团」概念，让每个账号的角色归属到一个团，编队按团划分、用户管理展示团字段。已确认的决策：**初始冒险团用昵称命名（`{nickname}的冒险团`）**；**编队角色池按「用户组 → 团内小节」划分**；**编辑角色时可改所属冒险团**；**方案 A（独立 `adventure_parties` 表 + `characters.adventure_party_id` 外键）**。

## 1. 目标

新增「冒险团」概念，用于把同一玩家的角色按游戏账号分组：

- 玩家在角色管理模块可创建/改名/删除冒险团；
- 所有用户有一个初始冒险团「`{nickname}的冒险团`」，存量角色默认归属之（兼容旧数据）；
- 用户至少保留一个冒险团；删除冒险团时该团必须无角色；
- 添加/编辑角色时可指定所属冒险团，缺省属于第一个（最早创建的）团；
- 编队角色池按冒险团划分；用户管理角色查询展示冒险团字段。

**范围**：后端（数据模型 + 迁移 + 成员/管理/机器人三处角色创建路径 + 冒险团 CRUD 端点）+ 前端（MyCharactersView 冒险团管理、CharacterForm 团下拉、RosterPool 团小节、AdminUsersView 团列）。**不含** bot 技能侧展示冒险团、用户管理侧冒险团 CRUD、冒险团名称与昵称联动。

## 2. 数据模型与迁移

### 2.1 新表 `adventure_parties`

| 列 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| user_id | FK users.id, index=True | 归属玩家 |
| name | String(64) | 团名 |
| created_at | DateTime, default `_now()` | naive UTC |

- `UniqueConstraint(user_id, name)`：团名按用户唯一，避免同名团混淆。
- 关系：`User.adventure_parties`（back_populates owner）、`AdventureParty.owner`、`AdventureParty.characters`（back_populates adventure_party）。
- 新表由 `init_db()` 的 `create_all` 自动创建，无需 ALTER。

### 2.2 `characters.adventure_party_id`

- FK → adventure_parties.id，`index=True`，**nullable**。
- 为什么 nullable：SQLite 对已有行 `ALTER ADD COLUMN NOT NULL` 必须带默认值，而存量角色要回填后才能确定值；故列可空，但**应用层保证所有角色都有团**（角色创建/机器人路径一律走 `ensure_default_party` 兜底）。
- 关系：`Character.adventure_party`（back_populates characters）。**不设级联删除**，删除拦截靠应用层「先查团内角色数」。

### 2.3 迁移 `migrate_adventure_parties`（幂等，挂到 `init_db()`）

1. `Base.metadata.create_all(bind=engine)` 建新表（若缺）；
2. `characters` 缺 `adventure_party_id` 列 → `ALTER TABLE characters ADD COLUMN adventure_party_id INTEGER REFERENCES adventure_parties(id)`；
3. **回填**：遍历所有用户，凡「没有任何冒险团」的用户都创建 `{nickname}的冒险团`，并把该用户全部角色挂到该团下。
   - 幂等：第二次运行时所有用户都有团，回填空转；
   - **0 角色的用户也建团**（满足「所有用户有一个初始冒险团」）；
   - 每用户先查「是否已有任意团」再决定是否建，团名按用户唯一不冲突。

### 2.4 注册即建团

- `auth.py register`：创建 User 后建 `{nickname}的冒险团`；
- `bot.py register`（QQ 免码注册）：同样创建。

## 3. 后端 API

### 3.1 schemas.py

- `AdventurePartyOut`：`id, name, created_at, character_count`（带角色数，前端据此判断能否删除）。
- `AdventurePartyIn`：`name`（min_length=1, max_length=64）。
- `CharacterIn` 加 `adventure_party_id: int | None = None`（None → 缺省第一个团）。
- `CharacterOut` 加 `adventure_party_id: int | None`、`adventure_party_name: str | None`。

**序列化传播**：所有角色序列化都走 `character_out(c)`（raid 详情/报名、bot、admin 查询复用），`character_out` 补上两个新字段后各路径自动携带团信息，编队池与用户管理无需额外接口。`adventure_party_name` 取自 `c.adventure_party.name`（lazy，本工具规模下可接受，同现有 N+1 风格）。

### 3.2 service `services/parties.py`

- `ensure_default_party(db, user) -> AdventureParty`：返回该用户第一个团（按 id 升序）；不存在则创建 `{nickname}的冒险团` 并返回（兜底，供角色创建/机器人路径）。
- `list_parties(db, user) -> list[AdventureParty]`：按 id 升序，附角色数。
- `create_party(db, user, name) -> AdventureParty`：校验非空 + 按用户唯一；重复 400「冒险团已存在」。
- `rename_party(db, user, pid, name) -> AdventureParty`：校验归属（非本人 404）+ 唯一；成功即改。
- `delete_party(db, user, pid) -> None`：
  - 校验归属（非本人 404）；
  - 团内有角色 → 400「请先转移或删除该团角色」；
  - 用户仅剩这一个团 → 400「至少保留一个冒险团」；
  - 否则删除。

### 3.3 新路由 `routers/parties.py`（prefix `/api/me/adventure-parties`，鉴权 `get_current_user`）

| 端点 | 说明 |
|---|---|
| GET `` | 我的冒险团列表（list_parties） |
| POST `` | 创建（create_party） |
| PUT `/{pid}` | 改名（rename_party） |
| DELETE `/{pid}` | 删除（delete_party） |

### 3.4 admin 端点（加到 `admin.py`）

- `GET /api/admin/users/{uid}/adventure-parties` → `list[AdventurePartyOut]`：目标用户的团列表（供管理员给该用户建角色时选团）；`_user_or_404(db, uid)` 校验用户存在。

### 3.5 角色端点改造（三个创建/编辑路径）

统一规则：`CharacterIn.adventure_party_id` 缺省（None）→ `ensure_default_party(db, owner)` 得第一个团；显式传入 → 校验该团属于 owner（否则 400「冒险团不存在」），写入 `Character.adventure_party_id`。

- `members.py` create/update：owner = 当前用户。
- `admin.py` create/update：owner = `uid` 目标用户。
- `bot.py` 建角色（`upsert_characters`）：直接 `ensure_default_party(db, user)` 落到第一个团（机器人不感知团）。编辑（已存在同名角色）不动团归属。

## 4. 前端

### 4.1 types.ts

- 新增 `AdventureParty { id, name, created_at, character_count }`。
- `Character` 加 `adventure_party_id: number | null`、`adventure_party_name: string | null`。
- 注意：`Character` 是必填字段在多个 fixture（RaidList/RaidDetail/stores/raid/各 spec）里被字面量构造，**新字段带默认值的构造点不受影响；手写字面量缺字段会过不了 vue-tsc**，需按需补。

### 4.2 MyCharactersView（角色管理模块）

- 页头加「冒险团管理」按钮 → 打开 `AdventurePartyModal`：
  - 列出我的团（团名 + 角色数）；
  - 支持**创建**（输入框 + 按钮）、**改名**（行内或弹窗）、**删除**（confirmDialog）；
  - 删除按钮：团内有角色或只剩一个团时置灰，后端同样 400 兜底；
  - 创建按钮常驻（允许建多个团）。
- 角色卡片副标题加一行团名（`c.adventure_party_name`），方便核对角色所在账号。

### 4.3 CharacterForm（添加/编辑共用）

- 加「冒险团」下拉，默认选中**第一个团**（`list[0]`）；编辑时回填 `editing.adventure_party_id`。
- 数据来源：按 `baseUrl` 解析上下文——
  - 未传 baseUrl（我的角色，默认 `/api/me/characters`）→ `/api/me/adventure-parties`；
  - `baseUrl` 形如 `/api/admin/users/{uid}/characters`（管理员）→ `/api/admin/users/{uid}/adventure-parties`（从 baseUrl 正则取 uid，不加新 prop）。
- 保存 payload 增加 `adventure_party_id`。

### 4.4 RosterPool（编队角色池）

- 结构改为：**用户组（保留现有折叠/搜索，按昵称过滤）→ 冒险团小节 → 角色**。
- 小节头：团名 + 角色数；**小节本身也可折叠**（内存态，同现有 collapsed 模式），多账号玩家可收起次要团。
- 团按 id 升序；团内角色按现有 `sortByPower` 排序；`adventure_party_id` 为 null 的角色（理论不会出现）归「未分组」小节。
- 现有 RosterPool.spec（10 例依赖用户组直接渲染角色）需同步更新为两层结构。

### 4.5 AdminUsersView（用户管理）

- 角色查询表加「冒险团」列，显示 `c.adventure_party_name`。

### 4.6 AdminUserCharactersModal

- 复用 CharacterForm，自动获得冒险团下拉（走 admin 团列表接口）；角色列表沿用 CharacterCard 不变。

## 5. 测试

### 5.1 后端（pytest）

- **迁移**：存量库（已有用户 + 角色）跑 `migrate_adventure_parties` → 每用户一个 `{nickname}的冒险团`、角色全挂该团；幂等（跑两次不重复建团）；0 角色用户也建团。
- **冒险团 CRUD**：GET 列表带 character_count；POST 创建；PUT 改名（重名/他人团 400/404）；DELETE——有角色 400、只剩一个团 400、空团且非最后一个成功。
- **成员角色创建/编辑**：缺省 `adventure_party_id` → 归第一个团；显式传他人团 400「冒险团不存在」；编辑可改团。
- **admin**：`GET /api/admin/users/{uid}/adventure-parties`；admin 建角色显式指定团（校验属于 uid）。
- **bot**：`upsert_characters` 新角色归用户第一个团；已存在角色编辑不动团。
- **序列化**：`character_out` 带 `adventure_party_id/adventure_party_name`；raid 详情报名角色带团字段。
- 注册（web/QQ）后该用户已有初始团。

### 5.2 前端（Vitest）

- **RosterPool.spec**：更新为两层结构——用户组下出现团小节头（团名+计数）；小节折叠/展开；团内角色渲染；用户组折叠/搜索仍生效；无团角色归「未分组」。
- **MyCharactersView.spec / AdminUsersView.spec**：冒险团列/管理入口相关断言。
- **CharacterForm**：团下拉默认第一个团、编辑回填、payload 带 `adventure_party_id`；admin 上下文正确请求 `/api/admin/users/{uid}/adventure-parties`。
- 相关 spec 手写字面量 Character 缺新字段的补字段。

### 5.3 构建

- `npm run build`（vue-tsc + vite）通过。

## 6. 风险

- 中：`Character` 加必填 TS 字段牵连多处 fixture，需一并补（记忆库已注明同类坑）。
- 中：RosterPool 结构升级，现有 10 例 spec 需改写，编队交互（推荐/划水/拿起）测试受影响面需回归。
- 低：`character_out` 加字段会改变 bot/公开 API 返回体——向后兼容（只加字段），bot 技能不受影响。
- 低：N+1（每角色 lazy 取团名）——本工具规模（数十用户、百级角色）可接受，同现有 admin 列表风格。

## 7. 范围外

- bot 技能侧（AstrBot）不展示/不管理冒险团；
- 管理员不改名/不删除用户冒险团（仅读：admin 建角色选团）；
- 冒险团名称不与用户昵称联动（初始团名在注册/迁移时定死，昵称变更不自动改团名）；
- 不提供角色批量迁移到另一团（删团前需逐角色转移或删除）。
