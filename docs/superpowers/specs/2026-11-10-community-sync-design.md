# 社区ID 同步角色 · 设计文档

日期：2026-11-10
状态：设计已确认，待实现

## 背景与目标

群友录入 DNF 角色目前靠手动（机器人截图/文字解析，或管理员代录）。DNF 助手「社区ID」可一次性拿到某玩家**全部**角色（角色名/职业/名望/等级/服务器/形象图），数据源自第三方 `dnfbbz.online` 服务端（`/Users/able/Seep-work/dnf-token/dnfbbz_query.py` 已探明协议：登录 → 换绑社区ID → sync）。

用户不希望把 dnfbbz 这套「投机取巧」的协议融入 DNfer 现有架构，也不想要 AstrBot skill（此前已评估放弃）。最终方案：

1. **独立 web 服务**（sibling 项目 `../dnfer-community-sync/`）封装 dnfbbz 协议，作为**内网**服务仅被 DNfer 后端调用；
2. DNfer 后端新增「社区同步」**异步任务**（每用户每天一次，遇换绑限流自动等待重试），任务完成后端完成全部角色创建/更新与形象导入；
3. 前端「我的角色」新增「同步社区」内联面板（输入社区ID + 确定 + 上次同步结果表格）。

## 设计决策（已与用户确认）

| 决策点 | 结论 |
| --- | --- |
| 形态 | 独立 FastAPI web 服务（sibling 项目），不做 skill、不并入 DNfer 架构 |
| 服务可达性 | 纯内网（DNfer 后端 worker → `127.0.0.1:8100`）；浏览器不经代理直连 |
| 同步方式 | 异步任务（后端 `asyncio`），遇换绑限流 `sleep(retryAfterSec)` 重试（上限 3 次） |
| 每日限制 | 每用户每天一次（今天已有**成功**任务则 400「今日已同步」；进行中任务重复发起幂等返回既有 taskId；失败可重发） |
| 角色创建 | 后端任务完成一切：查询 → 解析职业 → 创建/更新 → 形象 best-effort |
| 职业解析 | 后端 `job_data`：title 去 `(男)/(女)` 后缀 → 按 title 匹配 job_name；多候选**默认男版**；未收录返回 None（该角色跳过标记） |
| 更新语义 | 同名已存在 → 只更新 `fame` + 重新导入形象，**其余字段（job/DPS/装备/冒险团）全部保留** |
| 形象图 | v1 导入但 best-effort：后端任务下载 APNG → `s3.upload_profile` 写 `c.profile`；失败忽略并标记，不阻断角色 |
| 前端 UI | 页头「同步社区」按钮 → 内联面板（输入 + 确定 + 上次同步结果表格，结果落 DB 跨刷新保留） |
| 错误文案 | 前端任务失败统一「查询失败，请联系管理员」；「今日已同步」单独提示 |
| HTTP 客户端 | 后端调 web 服务用 stdlib `urllib`（生产依赖无 httpx/requests，零新增依赖；复用 dnfbbz_query.py 模式） |
| dnfbbz 脆弱性 | 接受为临时方案（域名被 ICP 拦截、直连 IP、证书不校验、会话内存态）；失败给出可读错误而非静默 |

## 架构与组件

```
dnfer-community-sync/          ← sibling 项目（内网服务 :8100，仅 DNfer 后端调用）
    app/main.py        FastAPI：POST /sync、GET /portrait
    app/dnfbbz.py      dnfbbz 客户端（登录/换绑/同步/形象），内存会话 + 换绑锁 + 限流错误
    tests/             client 单测（mock urllib）
    requirements.txt / README.md

DNfer backend（新增「社区同步」模块）
    models.py                     + CommunitySyncTask 表
    routers/members.py            + POST /api/me/characters/sync、GET /api/me/characters/sync/latest
    services/community_sync.py    任务执行器 + resolve_job 纯函数 + web 服务客户端
    config.py                     + community_sync_base / community_sync_max_retry

DNfer frontend
    views/MyCharactersView.vue    页头 + 「同步社区」按钮（切换内联面板）
    components/CommunitySyncPanel.vue  输入/轮询/结果表格
    api/client.ts                 + syncCreate / syncLatest
    types.ts                      + SyncTask / SyncRoleResult
```

### 1. community-sync web 服务（sibling 项目）

**API 契约（内网）**：

| 端点 | 请求 | 成功响应 | 失败 |
| --- | --- | --- | --- |
| `POST /sync` | `{"communityId": "329230843"}` | `200 {"ok":true,"roles":[{"roleName","job","level","fame","server","originalRoleId","isMain"}]}`（`job` 为 dnfbbz 原始中文职业串，含 `(男)/(女)` 后缀） | `429 {"detail":"换绑限流，请稍后重试","retryAfterSec":300}`；`502 {"detail":...}` dnfbbz 不可达 |
| `GET /portrait?communityId&originalRoleId` | — | `200` APNG 字节流（`image/apng`） | `404` 无形象 |

- **会话管理**：登录（env `DNFBBZ_USER`/`DNFBBZ_PASS`，默认 `1010268482/123456`）→ 内存 token；维护「当前绑定社区ID + 上次换绑时间戳」。
- **换绑串行化**：全局锁保证同一时刻最多一个换绑请求；若目标社区ID ≠ 当前绑定且距上次换绑 < 5 分钟 → `429 retryAfterSec`（不实际请求 dnfbbz）。
- **portrait**：按 `originalRoleId` 调 dnfbbz 形象接口，字节透传。
- 不感知 DNfer 职业体系（`job` 原样返回）。

### 2. 后端「社区同步」模块

**模型** `CommunitySyncTask`（create_all 自动建表，零迁移）：

| 列 | 类型 |
| --- | --- |
| id | int PK |
| user_id | int FK index |
| community_id | str |
| status | str：`pending` / `running` / `success` / `failed` |
| message | str null（失败原因 / 限流提示） |
| result | JSON null（success 时的逐角色结果数组） |
| created_at / updated_at | datetime naive UTC |

**端点**（`routers/members.py`，`/api/me/characters` 下，需登录）：

- `POST /api/me/characters/sync` `{"communityId": "..."}`：
  1. 校验社区ID：`^\d{1,20}$`，否则 400「社区ID格式不正确」；
  2. 幂等/每日限制：
     - 本人存在 `pending/running` 任务 → 返回该任务 `{taskId}`（幂等，防并发重复）；
     - 本人今天（UTC 自然日 `created_at`）已有 `success` 任务 → 400「今日已同步，请明天再试」；
     - 否则创建新任务（`pending`），`db.commit`；
  3. 启动后台任务 `asyncio.create_task(run_sync_task(task_id))`，返回 `{taskId}`。
- `GET /api/me/characters/sync/latest`：
  - 返回本人最近一次任务 `{taskId, status, communityId, message, result, createdAt}`；无任务 → 404「还没有同步记录」。前端打开面板 + 轮询均打此端点。

**任务执行器** `services/community_sync.py`：

```
run_sync_task(task_id):
  置 status=running
  for attempt in 1..MAX_RETRY:
    调 web 服务 POST /sync（urllib，asyncio.to_thread 避免阻塞事件循环）
    ├─ 429 → 置 message=「换绑限流，等待重试」; await asyncio.sleep(retryAfterSec); 继续
    ├─ 其他错误 → status=failed; 写 message; return
    └─ 200 → 逐个角色处理; status=success; 写 result; return
  超限 → status=failed; message=「多次换绑限流，请稍后再试」
```

角色处理（对每个 role）：
1. `resolve_job(role.job)` → None → result 项 `action=skipped, reason=职业未收录`（跳过，不阻断）；
2. 查本人 `user_id + name == role.roleName`：
   - 已存在 → 仅 `c.fame = role.fame`，其余字段**不动**；`action=updated`；
   - 不存在 → 创建 `Character(user_id, name, job_name, class_type=job_data.class_type_for(job_name), fame, adventure_party_id=ensure_default_party(...))`；`action=created`；
3. **形象 best-effort**：调 web 服务 `GET /portrait` 拿 APNG 字节 → `s3.upload_profile(user_id, c.id, "png", data, "image/png")` → 写 `c.profile`；成功 → `profileImported=true`；任一异常 → `profileImported=false`（忽略，不阻断）；
4. result 项：`{roleName, job, jobName, level, fame, server, action, reason?, characterId, profileImported}`。

每角色独立 try/except，单个失败不阻断整体。任务内 SQLAlchemy 用独立 Session。

**纯函数** `resolve_job(dnfbbz_job: str) -> str | None`（TDD）：
- 去掉末尾 `(男)`/`(女)`/`（男）`/`（女）` → base title；
- 遍历 `job_data.job_tree()`：children 中 `title == base` 的候选；
  - 1 个 → 该 `job_name`；
  - 多个（男女双版）→ 取所在大类 title 以「男」结尾的那个；
  - 0 个 → `None`。

**配置** `config.py`：`community_sync_base: str = "http://127.0.0.1:8100"`、`community_sync_max_retry: int = 3`（env `COMMUNITY_SYNC_BASE` / `COMMUNITY_SYNC_MAX_RETRY`）。

**启动恢复**：`main.py` lifespan 把残留 `running/pending` 任务置 `failed`（重启丢内存任务，状态回填，避免卡死）。

### 3. 前端「同步社区」面板

- `MyCharactersView.vue` 页头「＋ 添加角色」旁新增「同步社区」按钮（`data-act="sync-community"`），点击切换内联面板显隐。
- `CommunitySyncPanel.vue`（新组件）：
  - `onMounted` 即 `GET sync/latest` → 展示上次同步结果表格；404 → 空态「还没有同步记录」；
  - 输入社区ID（`data-act="community-id-input"`）+「确定」（`data-act="sync-submit"`）→ `POST sync`：
    - 400「今日已同步」→ 直接 `notifyWarning` 提示；
    - 200 得 `taskId` → 进入轮询态：每 5s `GET sync/latest`；
      - `running` → 显示「同步中…」；`message` 含「限流」→「换绑限流等待中，约 N 分钟后继续」；
      - `failed` → 显示「查询失败，请联系管理员」（可附 message）；
      - `success` → 渲染结果表格 + `notifySuccess` + `emit('changed')`（父级 `load()` 刷新角色列表）→ 停止轮询；
  - 结果表格列：角色名 / 职业 / 名望 / 等级 / 服务器 / 结果（已创建·已更新·跳过·失败原因）/ 形象（已导入·导入失败·—）；
  - 组件卸载（`onUnmounted`）停止轮询。
- `api/client.ts`：`syncCreate(body: {communityId})`、`syncLatest()`。
- `types.ts`：`SyncTask`、`SyncRoleResult`。

## 错误处理

| 场景 | 处理 |
| --- | --- |
| 社区ID 非纯数字 | 400「社区ID格式不正确」 |
| 今天已成功同步 | 400「今日已同步，请明天再试」→ 前端 `notifyWarning` |
| 任务进行中 / 限流等待 | 轮询态文案（同步中 / 换绑限流等待中） |
| 任务失败（dnfbbz 不可用、社区ID无角色、多次限流） | 任务 `failed`；前端统一「查询失败，请联系管理员」 |
| 单角色职业未收录 | `action=skipped, reason=职业未收录`，表格显示，不阻断 |
| 形象导入失败 | `profileImported=false`，表格标注，忽略 |
| web 服务未部署 | 后端调 web 服务连接失败 → 任务 `failed` → 前端同上 |

## 测试

- **后端** `tests/test_community_sync.py`：
  - `resolve_job` 纯函数：唯一 title → job_name；`重霄·漫游枪手(男)` → `ranger_male`、`(女)` → 也默认 `ranger_male`；`光启·蓝拳圣使(男)` → `infighter`；未收录 → None；
  - `POST sync`：社区ID 校验、每日一次（今天成功 → 400；失败后重发 → 允许）、进行中幂等返回 taskId、返回 `{taskId}`；
  - `GET sync/latest`：无任务 404、返回本人最近任务、不可见他人任务；
  - 执行器（mock web 服务客户端）：429 重试 → 成功后处理；角色创建/更新（更新只改 fame 保留其余）/跳过未收录/形象 best-effort；每角色独立异常不阻断；状态流转。
  - mock 方式：`community_client.sync_roles()` / `fetch_portrait()` 模块级函数，monkeypatch；异步执行器以同步方式直接调用测试。
- **web 服务（sibling 项目）**：dnfbbz client 单测（mock urllib，解析 roles/错误映射）；换绑锁 + 限流判定；`/sync`、`/portrait` 端点（TestClient）。
- **前端**：
  - `CommunitySyncPanel.spec.ts`：打开加载 latest（无记录空态/有记录表格）；提交创建任务 → 轮询 running（限流文案）/failed（统一文案）/success（表格 + emit changed）；每日已同步提示；卸载停止轮询；
  - `MyCharactersView.spec.ts`：补「同步社区」按钮 + 面板切换（stub CommunitySyncPanel）；
  - 全量 `npm run build`（vue-tsc）保持绿。

## 跨仓库实施边界

- **本 repo 提交**：backend 同步模块（模型/端点/执行器/解析/配置）+ 前端同步面板 + 测试。后端生产依赖零新增。
- **sibling 项目** `../dnfer-community-sync/`：独立项目（用户明确不在本 repo 内），代码不进本 repo git；按本 spec §1 契约实现，含自身 requirements.txt / README / 单测。
- **部署**：web 服务与 DNfer 后端同机运行（后端经 `COMMUNITY_SYNC_BASE=http://127.0.0.1:8100` 内网调用）；浏览器与 nginx **无需**任何 `/community-sync` 代理配置（此前的同源代理方案因改为后端 worker 调用而废弃）。
- 实现顺序：① sibling web 服务（含自测）→ ② 后端模块（TDD）→ ③ 前端面板 → ④ 端到端手测（本机起 web 服务 + 后端）。

## 不做的事（明确非目标）

- 不做 AstrBot skill（本轮已放弃该方向）
- 不把 dnfbbz 协议融入 DNfer 后端（hacky 部分隔离在独立 web 服务）
- 不做「帮别人同步」：仅成员在自己的「我的角色」自录自
- 不做 dnfbbz 账号池 / 多账号负载均衡
- 不做任务队列持久化：内存 `asyncio` 调度，重启丢失进行中任务（启动时残留任务置 failed 兜底）
- 形象图长期稳定性/维护 v1 不解决（best-effort 导入，失败忽略）
- 不解析 dnfbbz 的 DPS/装备数据（只取 name/job/fame/level/server/形象）
