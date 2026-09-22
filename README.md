# DNfer 攻坚排表

DNF 游戏群团队成员管理 + 攻坚队排表工具。管理员发起攻坚，成员协同填写排表，多端实时同步，并提供群机器人可调用的公共 API。

## 功能

- **管理员体系**：首次启动自动创建管理员；管理员生成注册码，新用户凭码注册（支持一次性 / 多用户 / 有效期）
- **成员管理**：每个成员有群昵称 + 多个游戏角色；输出角色含模拟伤害、秒伤，辅助角色含增益量
- **职业体系**：角色按职业树（16 大类 × 子职业）选择具体职业，`输出/辅助` 由 5 个辅助职业（男女圣骑士、协战师、小魔女、缪斯）自动推导；角色管理与攻坚排表展示职业图标，职业图标缺失时回退占位图
- **攻坚排表**：
  - 管理员发起攻坚（规模 4/8/12/16/20 人，默认 12，从副本预设带入）
  - 波次表格纵向堆叠，红/黄/绿等明亮配色区分小队，12 人规模恒为 3 队 × 4 格
  - 成员点空格选自己的角色占位；职责下拉按职业过滤（输出→主C/辅C/划水，辅助→主奶/太阳奶/划水，默认主C/主奶）
  - 校验规则：角色全攻坚唯一、每小队至多 1 名主奶、满员小队组成规则硬校验（未满员仅警告）
  - 非锁定状态下任何成员可加波、删除仅含自己角色的波；管理员可锁定/解锁、编辑任意格子
- **实时同步**：WebSocket 增量广播，断线自动重连
- **机器人 API**：固定 Token 查询攻坚列表与单波配置，方便群机器人播报

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 | Vue 3 · TypeScript · Vite · Pinia · Vue Router · Naive UI |
| 后端 | Python FastAPI · SQLAlchemy 2 · SQLite |
| 部署 | Docker Compose（`dnfer` 应用容器 + `nginx` 反向代理，静态前端由后端托管） |

## 快速开始

### 方式一：Docker 部署（推荐）

架构：`nginx` 反向代理（80/443 + TLS）→ `dnfer` 应用容器（后端 + 静态前端，端口仅绑定 `127.0.0.1`）。

```bash
# 1. 准备环境变量
cp .env.example .env
# 编辑 .env，务必设置 DNFER_SECRET_KEY / DNFER_ADMIN_PASSWORD / DNFER_API_TOKEN

# 2. 准备 TLS 证书（nginx 必需）
# 把证书放到 ssl/www.yblhxqh.xyz/server.crt 与 server.key（docker-compose 已挂载 ./ssl）
# 并把 nginx.conf 里的 server_name 换成你的域名

# 3. 准备职业图标目录（不入库）
# images/ 需存在且含 images/adventure/{jobs,sub}/*.png；compose 已挂载 ./images:/app/images:ro

# 4. 构建并启动
docker compose up -d --build

# 5. 访问
open https://your-domain        # 80 端口自动 301 到 https
# 直连后端（仅本机）：http://127.0.0.1:8000
```

首次启动自动建表并运行迁移（职业体系重构会**清空存量角色数据**，需重新录入角色并选择职业），并自动创建管理员（账号见环境变量）。

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

> Docker 镜像内已通过 Dockerfile `ENV` 预设 `DNFER_JOB_DATA_PATH=/app/职业信息.json` 与 `DNFER_IMAGES_DIR=/app/images/adventure`（对应镜像内文件与卷挂载路径），`.env` 无需重复设置；仅自定义目录布局时才覆盖。

## 机器人 API

请求头携带固定 Token：`Authorization: Bearer <DNFER_API_TOKEN>`

| 端点 | 说明 |
|---|---|
| `GET /api/public/raids` | 列出攻坚计划（id、名称、副本、规模、波次数、锁定状态） |
| `GET /api/public/raids/{id}/waves/{index}` | 第 n 波配置：各小队每格含群昵称、角色名、职责、属性 |
| `POST /api/public/characters` | 按账号批量添加/编辑角色（名称必填；职业缺省极诣·剑魂、名望缺省 100000；编辑仅更新提供的字段；返回逐角色结果） |
| `GET /api/public/characters?account={账号}` | 查询账号（username）的全部角色 |
| `POST /api/public/register` | 按 QQ 号免码注册：账号=密码=昵称=QQ号（纯数字 6-64 位，网页端注册仍走注册码） |

```bash
curl -H "Authorization: Bearer $DNFER_API_TOKEN" http://127.0.0.1:8000/api/public/raids
curl -H "Authorization: Bearer $DNFER_API_TOKEN" http://127.0.0.1:8000/api/public/raids/1/waves/1
curl -X POST -H "Authorization: Bearer $DNFER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account":"zhangsan","characters":[{"name":"剑魂"}]}' \
  http://127.0.0.1:8000/api/public/characters
curl -H "Authorization: Bearer $DNFER_API_TOKEN" \
  "http://127.0.0.1:8000/api/public/characters?account=zhangsan"
curl -X POST -H "Authorization: Bearer $DNFER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"872557240"}' \
  http://127.0.0.1:8000/api/public/register
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
职业信息.json        # 职业体系数据（16 大类 × 子职业），已入库
images/              # 职业图标（不入库，部署经卷挂载）
backend/
  app/
    main.py           # 应用入口、路由注册、/images 与 SPA 静态托管、管理员初始化
    config.py         # 环境变量
    db.py             # SQLite 连接
    models.py         # ORM 模型（User/Character/Raid/Wave/Slot/注册码）
    jobs.py           # 职业数据加载、输出/辅助推导（职业信息.json）
    auth.py           # 密码哈希、JWT、认证依赖
    ws.py             # WebSocket 连接管理与端点
    migrations.py     # 幂等迁移（副本/职业）
    services/
      raid_validator.py   # 职责/小队规则纯函数
      raid_builder.py     # 攻坚/波次/格子结构构建
    routers/          # auth / dungeons / jobs / members / raids / public
  tests/              # pytest 测试
frontend/
  src/
    api/              # REST/WS 客户端
    stores/           # Pinia（auth / raid）
    lib/              # job.ts（图标 URL）、duty.ts、colors.ts
    views/            # 登录/注册/攻坚列表/排表页/我的角色/管理
    components/       # 网格、格子、波次、角色选择等组件
docker-compose.yml    # dnfer + nginx 服务编排
nginx.conf            # 反向代理 / TLS / 限流配置
docs/superpowers/     # 设计规格与实现计划
```

## 说明

- 排表状态以服务器为权威；客户端乐观更新、按版本号合并，冲突以服务器为准
- SQLite 数据文件位于 `backend/data/dnfer.db`（Docker 下挂载在 `dnfer-data` 卷）
- 前端为 history 路由，SPA 深链（如直接刷新 `/raids/5`）由后端兜底返回 `index.html`
- 职业体系数据源为仓库根 `职业信息.json`（已入库）；`images/` 图标目录不入库，Docker 部署经 `./images:/app/images:ro` 卷挂载提供，本机开发直接读仓库根目录
- 职业图标缺失时前端回退 `empty.png` 占位（当前 `breaker`、`infighter_female`、`imperialknight` 缺图，补图即自动显示）
