# DNfer 攻坚排表

DNF 游戏群团队成员管理 + 攻坚队排表工具。管理员发起攻坚，成员协同填写排表，多端实时同步，并提供群机器人可调用的公共 API。

## 功能

- **管理员体系**：首次启动自动创建管理员；管理员生成注册码，新用户凭码注册（支持一次性 / 多用户 / 有效期）；管理员可重置任意用户密码，用户也可在个人信息面板自助修改密码
- **管理面板**：邀请码 / 用户管理 / 副本管理 三页 + 子导航；用户管理拆「角色查询 / 账号管理」双 tab——角色富查询（职业类别 / 具体职业 / 角色名 / 归属玩家筛选，名望 / 战斗力 / 增益等排序，分页），账号管理（昵称 / 用户名搜索、软封禁、按玩家管理角色、重置密码、临时用户）
- **成员与角色管理**：每个成员有群昵称 + 多个游戏角色；输出角色含模拟伤害、秒伤，辅助角色含增益量与太阳增益；男女双版职业显示「（男）/（女）」后缀；输出职业可配置伤害构成（三攻 / 力智 / 属强 / 攻强 / 攻强增幅 / 技攻），后端计算并压缩为「战斗力」展示
- **我的角色**：九宫格海报网格展示角色（3:4 职业 profile 图 + 底部信息条），点击海报进编辑弹窗；可为角色上传自定义形象（S3）或一键恢复职业默认图；支持按类型 / 名望 / 冒险团排序；内置「冒险团管理」弹窗（增 / 改 / 删）
- **冒险团（多账号角色归属）**：多账号玩家将角色归属到游戏账号，排表时按账号识别、避免频繁切号；注册自动创建「{昵称}的冒险团」，存量用户由迁移回填；角色创建 / 编辑可指定所属团（默认第一团）；攻坚详情占位弹窗与选人面板显示所属冒险团，编队角色池按冒险团分小节展示（可折叠）
- **社区同步**：玩家在「我的角色」页输入 DNF 助手「社区ID」，后台自动同步全部角色（每 3 小时冷却）——自动创建 / 更新角色并导入形象图，职业自动映射；同步结果以弹窗表格展示；独立容器服务（`community-sync`）封装 dnfbbz 协议
- **我的群友**：登录用户均可按职业 / 名望 / 战斗力查询群内角色（归属玩家显示昵称、不暴露用户名）；查询结果前三条以「领奖台」展示（用户头像 + 昵称 + 角色卡片，第 1 名居中），表格不再重复展示前三名
- **职业体系**：角色按职业树（17 大类 × 子职业，含男女双版）选择具体职业，`输出/辅助` 由 5 个辅助职业（男女圣骑士、协战师、小魔女、缪斯）自动推导；职业图标与角色海报 profile 图，缺失时回退占位
- **攻坚排表**：
  - 管理员发起攻坚（规模 4/8/12/16/20 人，默认 12，从副本预设带入）
  - 波次表格纵向堆叠，红/黄/绿等明亮配色区分小队；加波 / 删波 / 并行调整仅管理员
  - 报名制 + 报名强制选角色：报名时弹出角色选择框勾选愿意上场的角色（默认全部，可随时追加 / 取消勾选，取消自动撤下占位）；未锁定攻坚可报名 / 取消报名；团长（发起人）免报名恒参与；管理员可帮成员报名（锁定后不可）；未报名用户占位时先引导报名，管理员仅能排已报名用户的角色；报名人数含团长（列表 / 详情口径一致）
  - 职责按职业过滤（输出→主C/辅C/划水，辅助→主奶/太阳奶/划水，默认主C/主奶）；校验规则：每小队至多 1 名主奶、满员小队组成硬校验（未满员仅警告）；同一角色在一场攻坚内一格（**可跨多场攻坚同时占位**）
  - 并行攻坚：波次可并行（共享轮次、显示「第X波 N 团」），同一玩家不可同时在并行团占位
  - 划水位：管理员配置「划水名望」与「兑换标准」规则，超出额度的划水角色在报名弹框与攻坚表格灰显
  - 攻坚关闭（快照归档）：管理员可关闭一场攻坚，关闭瞬间把整场排表与参与角色冻结为不可变快照，之后查看即快照、不受角色后续编辑影响；关闭不可逆（只读 + 可删除），关闭后不再占用角色引用
  - 攻坚信息：名称 / 时间可修改，WebSocket 实时同步
  - **编队总览页 `/raids/:id/roster`**：一页完成整场攻坚排表——左侧报名角色池（按用户 / 冒险团分组、搜索、折叠）+ 右侧「波×团×队」格子网格，点选角色「拿起」、点目标格「放下」，已占格可 撤下 / 改职责 / 拿起移动；每队目标模板（输出数 / 总伤区间 / 主奶增益区间 / 太阳奶 / 划水豁免）与**缺口总览**（实际/目标 + ✓/✗ + 差值）及达标徽章、推荐配队（可开关，模板随攻坚关闭 / 删除清除）、未排追踪（本波 / 全局未排）
  - 非锁定状态下任何成员可编辑自己角色所在格；管理员可锁定 / 解锁、编辑任意格子
- **临时用户（Guest）**：管理员代建「临时用户」（昵称 + 角色，免注册即可占位 / 编队），攻坚详情与编队页可「添加临时选手」并代报名当场；可转正（设置用户名 + 密码）或删除（自动撤下占位并清理角色 / 冒险团）；报名面板与编队角色池昵称旁标「临时」徽章
- **群会议（投票）**：管理员发起 / 关闭 / 删除投票（单选 / 多选、同时仅一个打开），成员实名或匿名投票、实时查看票数与投票人；关闭的投票默认收起、可展开查看；机器人 skill「dnfer-meeting」可查询与代投
- **实时同步**：WebSocket 增量广播，断线自动重连
- **机器人 API**：固定 Token 供群机器人调用——按账号 / 昵称查询与录入角色、按 QQ 号自助注册、查询攻坚列表与完整波次详情、替玩家报名 / 取消、角色统计（总览 + 按职业 / 类别筛选）、查询与代投投票（配套 AstrBot skill：dnfer-characters / dnfer-raids / dnfer-meeting）

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 | Vue 3 · TypeScript · Vite · Pinia · Vue Router · @dnftools/ui（vendored DNF 贴图组件库，暗色鎏金风格） |
| 后端 | Python FastAPI · SQLAlchemy 2 · SQLite |
| 部署 | Docker Compose（`dnfer` 应用容器 + `community-sync` 社区查询服务 + `nginx` 反向代理，静态前端由后端托管） |

## 快速开始

### 方式一：Docker 部署（推荐）

架构：`nginx` 反向代理（80/443 + TLS）→ `dnfer` 应用容器（后端 + 静态前端，端口仅绑定 `127.0.0.1`）；另起 `community-sync` 社区查询容器（不对外暴露端口，后端 worker 内网调用）。

```bash
# 1. 准备环境变量
cp .env.example .env
# 编辑 .env，务必设置 DNFER_SECRET_KEY / DNFER_ADMIN_PASSWORD / DNFER_API_TOKEN
# S3 相关留空则头像 / 角色形象上传不可用（返回 503）

# 2. 准备 TLS 证书（nginx 必需）
# 把证书放到 ssl/www.yblhxqh.xyz/server.crt 与 server.key（docker-compose 已挂载 ./ssl）
# 并把 nginx.conf 里的 server_name 换成你的域名

# 3. 准备静态资源目录（不入库）
# images/ 需存在且含 images/adventure/{jobs,sub}/*.png（职业图标）与
# images/characters/<大类>/<子职业>/profile.png（角色海报图）；compose 已挂载 ./images:/app/images:ro

# 4. 准备社区查询服务（可选）
# 社区同步需 sibling 仓库 ../dnfer-community-sync 构建镜像（docker-compose 已编排）；
# 登录凭据 DNFBBZ_USER / DNFBBZ_PASS 可用 .env 覆盖（默认 1010268482 / 123456）

# 5. 构建并启动
docker compose up -d --build

# 6. 访问
open https://your-domain        # 80 端口自动 301 到 https
# 直连后端（仅本机）：http://127.0.0.1:8000
```

首次启动自动建表并运行幂等迁移，并自动创建管理员（账号见环境变量）。

### 方式二：本地开发

需要 Python 3.12+ 与 Node 20+。

```bash
# 后端（端口 8000）
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --port 8000

# 前端（端口 5173，代理 /api /ws /images 到 8000）
cd frontend
npm install
npm run dev
```

开发默认管理员：`admin` / `admin123`（生产务必用环境变量覆盖）。

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DNFER_SECRET_KEY` | JWT 签名密钥 | `change-me` |
| `DNFER_ADMIN_USERNAME` | 初始管理员用户名 | `admin` |
| `DNFER_ADMIN_PASSWORD` | 初始管理员密码 | `admin123` |
| `DNFER_ADMIN_NICKNAME` | 初始管理员群昵称 | `群主` |
| `DNFER_API_TOKEN` | 机器人 API Token | `change-me-bot-token` |
| `DNFER_DATABASE_URL` | SQLite 连接串 | `sqlite:///./data/dnfer.db` |
| `DNFER_STATIC_DIR` | 前端静态目录 | `../frontend/dist` |
| `DNFER_JOB_DATA_PATH` | 职业数据文件（`职业信息.json`）路径 | `../职业信息.json` |
| `DNFER_IMAGES_DIR` | 职业图标目录 | `../images/adventure` |
| `DNFER_CHARACTERS_DIR` | 角色海报图目录（`/characters-images` 静态挂载） | `../images/characters` |
| `DNFER_S3_ENDPOINT` 等 | S3 头像 / 形象存储（公开读桶，共 6 个 `DNFER_S3_*` 变量，见 `.env.example`） | 留空则上传不可用 |
| `DNFER_COMMUNITY_SYNC_BASE` | 社区查询服务地址 | `http://127.0.0.1:8100` |
| `DNFER_COMMUNITY_SYNC_MAX_RETRY` | 社区同步限流重试次数 | `3` |
| `DNFBBZ_USER` / `DNFBBZ_PASS` | 社区查询服务的 dnfbbz 登录凭据（compose 传给 `community-sync` 容器） | `1010268482` / `123456` |

> Docker 镜像内已通过 Dockerfile `ENV` 预设 `DNFER_JOB_DATA_PATH=/app/职业信息.json`、`DNFER_IMAGES_DIR=/app/images/adventure` 与 `DNFER_CHARACTERS_DIR=/app/images/characters`（对应镜像内文件与卷挂载路径），`.env` 无需重复设置；仅自定义目录布局时才覆盖。

## 机器人 API

请求头携带固定 Token：`Authorization: Bearer <DNFER_API_TOKEN>`

| 端点 | 说明 |
|---|---|
| `GET /api/public/raids` | 列出攻坚计划（id、名称、副本、规模、波次数、锁定状态） |
| `GET /api/public/raids/{id}/waves/{index}` | 第 n 波配置：各小队每格含群昵称、角色名、职责、属性 |
| `GET /api/public/raids/{id}` | 完整攻坚详情：名称、副本、规模、锁定状态、时间、全部波次（每格含群昵称、角色名、职责、职业） |
| `POST /api/public/characters` | 按账号或昵称批量添加/编辑角色（`account`/`nickname` 恰好二选一；名称必填；职业缺省极诣·剑魂、名望缺省 100000；编辑仅更新提供的字段；返回逐角色结果） |
| `GET /api/public/characters?account={账号}` | 查询账号（username）的全部角色；`?nickname={昵称}` 等价查询 |
| `GET /api/public/stats/overview` | 角色统计总览：有效用户数、每用户角色数、输出/辅助分布、职业大类与具体职业分布 |
| `GET /api/public/stats/characters?job={职业}&category={大类}&class_type={输出\|辅助}` | 按职业/大类/类别筛选角色（至少提供一个），可携带 `with_owner` 展示归属者 |
| `POST /api/public/register` | 按 QQ 号免码注册：账号=密码=昵称=QQ号（纯数字 6-64 位，网页端注册仍走注册码） |
| `POST /api/public/raids/{rid}/signup` | 替玩家报名（body `{"account" 或 "nickname"}`，目标团由调用方选定） |
| `POST /api/public/raids/{rid}/signup/cancel` | 替玩家取消报名（body 同上，自动撤下该玩家全部占位） |
| `GET /api/public/votes` | 列出投票（含打开/关闭状态） |
| `GET /api/public/votes/{vid}` | 投票详情：各选项票数与投票人（匿名票显示「匿名」） |
| `POST /api/public/votes/{vid}/ballots` | 替玩家投票（body `{"account" 或 "nickname"}`，恒实名） |

```bash
curl -H "Authorization: Bearer $DNFER_API_TOKEN" http://127.0.0.1:8000/api/public/raids
curl -H "Authorization: Bearer $DNFER_API_TOKEN" http://127.0.0.1:8000/api/public/raids/1/waves/1
curl -H "Authorization: Bearer $DNFER_API_TOKEN" http://127.0.0.1:8000/api/public/raids/1
curl -X POST -H "Authorization: Bearer $DNFER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account":"zhangsan","characters":[{"name":"剑魂"}]}' \
  http://127.0.0.1:8000/api/public/characters
curl -H "Authorization: Bearer $DNFER_API_TOKEN" \
  "http://127.0.0.1:8000/api/public/characters?account=zhangsan"
curl -H "Authorization: Bearer $DNFER_API_TOKEN" \
  "http://127.0.0.1:8000/api/public/stats/overview"
curl -H "Authorization: Bearer $DNFER_API_TOKEN" \
  "http://127.0.0.1:8000/api/public/stats/characters?class_type=输出"
curl -X POST -H "Authorization: Bearer $DNFER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"872557240"}' \
  http://127.0.0.1:8000/api/public/register
curl -X POST -H "Authorization: Bearer $DNFER_API_TOKEN" \
  -H "Content-Type: application/json" -d '{"account":"872557240"}' \
  http://127.0.0.1:8000/api/public/raids/1/signup
curl -X POST -H "Authorization: Bearer $DNFER_API_TOKEN" \
  -H "Content-Type: application/json" -d '{"nickname":"龙应藏进云里"}' \
  http://127.0.0.1:8000/api/public/raids/1/signup/cancel
```

## 测试

```bash
# 后端
cd backend && .venv/bin/python -m pytest

# 前端
cd frontend && npm run test && npm run build
```

## 项目结构

```
职业信息.json        # 职业体系数据（17 大类 × 子职业），已入库
images/              # 职业图标 + 角色海报图（不入库，部署经卷挂载）
backend/
  app/
    main.py           # 应用入口、路由注册、/images 与 SPA 静态托管、管理员初始化
    config.py         # 环境变量
    db.py             # SQLite 连接
    models.py         # ORM 模型（User/Character/Party/Raid/Wave/Slot/Vote/注册码）
    jobs.py           # 职业数据加载、输出/辅助推导（职业信息.json）
    auth.py           # 密码哈希、JWT、认证依赖
    ws.py             # WebSocket 连接管理与端点
    migrations.py     # 幂等迁移（副本/职业/冒险团/投票/封禁/快照等）
    services/         # 角色/投票/冒险团/编队/伤害构成/图片/社区同步等共享逻辑
    routers/          # auth / admin / bot / dungeons / friends / jobs / members / parties / public / raids / votes
  tests/              # pytest 测试
frontend/
  src/
    api/              # REST/WS 客户端
    stores/           # Pinia（auth / raid）
    lib/              # job.ts（图标 URL）、roster.ts（编队纯函数）、duty.ts、colors.ts
    views/            # 登录/注册/攻坚列表/攻坚详情/编队/我的角色/我的群友/群会议/管理
    components/       # 海报卡片、编队组件、投票卡片、报名/角色弹窗等
docker-compose.yml    # dnfer + community-sync + nginx 服务编排
nginx.conf            # 反向代理 / TLS / 限流配置
docs/                 # 使用文档 + superpowers 设计规格与实现计划
```

## 说明

- 排表状态以服务器为权威；客户端乐观更新、按版本号合并，冲突以服务器为准
- SQLite 数据文件位于 `backend/data/dnfer.db`（Docker 下挂载在 `dnfer-data` 卷）
- 前端为 history 路由，SPA 深链（如直接刷新 `/raids/5`）由后端兜底返回 `index.html`
- 职业体系数据源为仓库根 `职业信息.json`（已入库）；`images/` 图标目录不入库，Docker 部署经 `./images:/app/images:ro` 卷挂载提供，本机开发直接读仓库根目录
- 职业图标缺失时前端回退 `empty.png` 占位；角色海报缺 profile 图的职业（如 帝国骑士·破浪者、圣职者(女)·蓝拳圣使）自动显示深色底 + 职业图标兜底，补图即自动显示
