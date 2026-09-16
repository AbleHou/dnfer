# DNfer 攻坚排表系统 — 设计规格

日期：2026-09-16
状态：已确认

## 1. 背景与目标

为 DNF 游戏群构建一套「团队成员管理 + 攻坚队排表」系统：

- 管理员初始化系统，用注册码管理成员加入
- 成员维护自己的多个游戏角色
- 管理员发起攻坚，成员协同填写排表，实时同步
- 提供群机器人可调用的公共 API

## 2. 技术栈与部署

| 项目 | 决策 |
|---|---|
| 前端 | Vue 3 + TypeScript + Pinia + Vue Router + Vite |
| 后端 | Python FastAPI（REST + WebSocket） |
| 数据库 | SQLite（WAL 模式，文件挂 volume） |
| 部署 | Docker Compose 单服务：uvicorn 托管 REST/WS/静态前端 |
| 认证 | 登录用 JWT；群机器人用固定 API Token |

## 3. 数据模型

- **User**：id、username、password_hash、nickname（群昵称）、is_admin、created_at
- **RegistrationCode**：id、code、created_by、used_by(可空)、used_at(可空)、expires_at(可空)、single_use
- **Character**：id、user_id、name、class_type（输出/辅助）、fame（名望值）、simulated_damage（模拟伤害，输出用）、sustained_dps（秒伤，输出用）、buff_amount（增益量，辅助用）
- **Raid**：id、name、副本 dungeon、size（规模，默认 12）、locked、created_by、created_at
- **Wave**：id、raid_id、index（序号，从 1 递增，唯一于 raid 内）
- **Slot**：id、wave_id、squad_index、row_index(0-3)、character_id(可空)、duty(可空)、version、updated_by、updated_at

结构推导：

- 每波 = `size/4` 个小队 × 4 行；**合法规模 = {4, 8, 12, 16, 20}**，默认 12，最小 4（恰好一队），最大 20
- 小队颜色 = 调色板[squad_index % 长度]，12 人即 红/黄/绿 三队
- 不满员也保持完整网格（12 人规模恒为 4×3 = 12 格）
- 角色唯一性：同一角色在**整个攻坚所有波次**中只能出现一次

## 4. 职责与校验规则（raid_validator）

职责下拉按职业过滤：

- 输出 → 主C / 辅C / 划水
- 辅助 → 主奶 / 太阳奶 / 划水
- 默认值：输出=主C，辅助=主奶

**校验模型**（关键）：排表是增量填写的，空格是合法中间态。

- **空格始终被忽略**：空槽不算成员、不算划水，不参与任何组成规则
- **硬性不变量**（任何写入时都是 `400` 阻断）：
  1. 每小队至多 1 名主奶
  2. 同一角色全攻坚唯一（跨波次）
  3. 职责必须与角色职业匹配
  4. 锁定状态下仅管理员可编辑（含加波/删波）
- **组成规则**（仅对已占位成员计算；小队**满员 4/4 时是硬性 400**，未满员时仅作为警告返回给前端展示）：
  - 若小队内**无划水成员**：至少包含 1 名输出 + 1 名辅助，且至少 1 名职责为主C
  - 若小队内**有任一划水成员**：免除上述「≥1 输出 + ≥1 辅助 + ≥1 主C」要求

## 5. 排表界面

- **攻坚排表页**（需登录）：
  - 顶部：攻坚名称、规模、锁定状态 + 锁定/解锁按钮（管理员）
  - 波次表格**纵向堆叠**：无页签；每个波次一个 4×3 表格，上方有「第 N 波」标题 + 各队占用统计
  - 所有表格最下方「＋ 添加一波」按钮，点击在底部新增一个波次表格
  - 颜色：红(#ef5350/#fdecea)、黄(#fbc02d/#fef9e7)、绿(#43a047/#eaf6ec) 明亮色系
- **单元格内容**：
  - 群昵称 + （游戏角色名）+ 职责标签
  - 输出：模拟伤害 + 秒伤（两者都显示）
  - 辅助：增益量
  - 空格显示「+ 点击占位」
- **格子交互**：
  - 点空格 → 弹窗选自己的角色（展示名望值）→ 填入格子
  - 职责下拉按职业过滤，默认主C/主奶；**占位时可一并指定职责**（否则用职业默认值），填入后仍可在格内改
  - 自己的格子可更换角色或撤下；他人格子只读
  - 管理员可编辑任意格子
- 其他页面：登录/注册（含注册码）、攻坚列表、我的角色管理、管理面板（注册码生成、用户管理、创建攻坚）

## 6. 实时同步（WebSocket）

- 连接 `WS /ws/raids/{id}`，每个攻坚一个频道
- 连接流程：先建立 WS 订阅，再拉一次全量快照（REST），此后只收增量事件（快照为最终一致性基准）
- 广播事件：
  - `slot:filled` / `slot:removed` / `slot:duty_changed`（带 slot_id 与版本号）
  - `wave:added` / `wave:removed`
  - `raid:locked` / `raid:unlocked`
- 写入：客户端 REST 提交 → 服务器校验 → 写库 → 广播；客户端乐观更新，收到事件按版本号合并，冲突以服务器为准回滚
- 断线自动重连，重连成功重新拉快照
- **重连竞态**：拉快照与订阅频道之间的时间窗内可能丢失事件；实现时先建立 WS 订阅、再拉快照，并以快照为最终一致性基准（服务器权威），避免旧事件覆盖新快照

## 7. 波次动态管理

- 攻坚创建时：定规模（默认 12），默认 1 个波次；**不预设波次数**
- 非锁定状态：任何成员可点「＋ 添加一波」新增波次表格并填入角色
- 锁定状态：仅管理员可加波
- 波次删除：
  - 硬约束：删除后至少保留 1 个波次
  - 非管理员：仅当该波次所有已占格都属于自己时才能删除
  - 管理员：可删除任意波次
- **波次寻址**：Wave 使用**稳定 index**（创建时递增分配，删除后**不重排号**，允许序号出现空洞）。API 与前端都以该 index 寻址「第 n 波」；删除中间波次后剩余波次的 index 不变。

## 8. 权限模型

| 角色 | 权限 |
|---|---|
| 未登录 | 仅登录/注册 |
| 普通成员 | 查看攻坚列表与详情；编辑自己的格子；添加波次※；删除仅含自己角色的波次；管理自己的角色 |
| 管理员 | 一切：创建/编辑攻坚、锁定/解锁、编辑任意格子、删除任意波次、生成注册码、用户管理 |

※ 普通成员添加/删除波次仅限**非锁定状态**；锁定后仅管理员可加波/删波。

管理员账户：首次部署由环境变量配置，启动时自动创建。

注册：管理员生成注册码（可一次性/设有效期），新用户凭码注册（用户名 + 密码 + 群昵称）。

## 9. 公共 API（群机器人）

固定 Token，请求头 `Authorization: Bearer <API_TOKEN>`。

| 端点 | 说明 |
|---|---|
| `GET /api/public/raids` | 列出攻坚计划（id、名称、副本、规模、波次数、锁定状态） |
| `GET /api/public/raids/{id}/waves/{n}` | 列出第 n 波配置：各小队每格含群昵称、角色名、职责、属性 |

## 10. 错误处理

- 业务校验失败：`400 + 中文错误信息`（如「该角色已在其他波次中」「该小队已有一名主奶」「锁定中，仅管理员可编辑」）
- 权限不足：`401/403`
- 前端对错误弹提示，并回滚本地乐观更新

## 11. 测试

- **后端 pytest**：raid_validator 纯函数单测（覆盖全部小队规则边界）、API 集成测试（认证/注册码/CRUD/权限）、同步广播事件测试
- **前端 Vitest**：排表 store/composable（占位、职责切换、校验提示、版本合并）、组件冒烟
- 可选 Playwright E2E（排表主流程）

## 12. 后端 REST 端点清单

认证端点：

- `POST /api/auth/register` — 注册（body 含注册码）
- `POST /api/auth/login` — 登录（返回 JWT）
- `GET /api/auth/me` — 当前用户信息
- 管理端：`POST /api/admin/codes`（生成注册码）、`GET /api/admin/codes`（列表）、`GET /api/admin/users`（用户列表）

角色管理：

- `GET /api/me/characters` / `POST /api/me/characters` / `PUT /api/me/characters/{id}` / `DELETE /api/me/characters/{id}`
- 删除规则：若该角色当前占用任何攻坚格子，**阻断删除**（400「该角色正在攻坚中，请先撤下」），不做级联清除

攻坚：

- `GET /api/raids` — 攻坚列表
- `POST /api/raids` — 创建攻坚（管理员）
- `GET /api/raids/{id}` — 攻坚详情（含所有波次格子，登录可见）
- `PUT /api/raids/{id}` — 编辑攻坚（管理员；**规模创建后不可变**，仅可改名/副本）
- `POST /api/raids/{id}/lock` / `POST /api/raids/{id}/unlock` — 锁定/解锁（管理员）

波次：

- `POST /api/raids/{id}/waves` — 添加一波（非锁定任何成员；锁定时管理员）
- `DELETE /api/raids/{id}/waves/{index}` — 删除波次（按约定规则）

格子：

- `POST /api/raids/{id}/slots/{slot_id}/fill` — 用自己角色占位
- `DELETE /api/raids/{id}/slots/{slot_id}` — 撤下角色
- `PUT /api/raids/{id}/slots/{slot_id}/duty` — 修改职责

公共（机器人，Bearer Token）：

- `GET /api/public/raids` — 列出攻坚计划
- `GET /api/public/raids/{id}/waves/{index}` — 第 n 波配置

## 13. 后端模块结构

```
backend/app/
  main.py          # 应用入口、路由注册、静态托管
  config.py        # 环境变量
  db.py            # SQLite 连接（WAL）
  models.py        # SQLAlchemy 模型
  schemas.py       # Pydantic
  auth.py          # JWT、注册码、密码哈希
  ws.py            # WebSocket 频道与广播
  services/
    raid_validator.py  # 小队规则校验（纯函数）
    sync.py            # 事件广播
  routers/
    auth.py        # 登录/注册/注册码
    members.py     # 角色 CRUD
    raids.py       # 攻坚 CRUD/锁定/波次
    slots.py       # 占位/撤下/职责
    public.py      # 机器人 API
```

## 14. 前端模块结构

```
frontend/src/
  api/           # REST/WS 客户端封装
  stores/        # Pinia：auth、member、raid（排表状态 + 乐观更新）
  composables/   # useRaidSync（WS 连接与事件合并）
  views/         # Login、Register、RaidList、RaidDetail(排表页)、MyCharacters、Admin
  components/    # RaidGrid、SlotCell、CharacterPicker、WaveSection、DutySelect
```

## 15. 里程碑

1. 后端：认证 + 成员角色管理
2. 后端：攻坚/波次/格子 + 校验规则 + 公共 API
3. 后端：WebSocket 实时同步 + 测试
4. 前端：登录/注册 + 攻坚列表 + 角色管理
5. 前端：排表页（堆叠波次网格 + 交互 + 实时同步）
6. 管理面板 + Docker 部署 + E2E
