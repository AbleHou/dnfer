# DNfer 编队总览页（RosterView）— 设计规格

日期：2026-10-09
状态：已确认
需求来源：用户口述——报名 12+ 人、每人多角色时，团长手工编队两个痛点：①「怎么排最优费神」（要按每队角色目标：几输出/总模拟伤害区间/主奶增益区间去凑人）；②「想不起谁还没排」（十几个用户来回对照会漏人）。攻坚可多波、人数多时可并行开团（同轮多团），原则是「让报名的人都有团打」。

## 1. 目标

新增独立编队总览页 `/raids/:id/roster`，供团长在一页内完成整场攻坚的排表。已确认的决策：

- **独立页**：详情页给管理员加「编队」按钮跳转；非管理员访问只读（仅管理员可编辑）。
- **布局**：左侧固定「角色池」（按报名用户分组），右侧「波×团×队」格子矩阵。
- **交互**：**点选拿起 → 点格放下**（不拖拽）。点池中可用角色进入「拿起」态，点右侧目标格填入。
- **多波**：顶部**波标签**切换当前波；波内并行团（同 round_index）并排显示，每团一列队组。
- **最优辅助三件套（都做）**：①每队位目标模板（localStorage 存，不落后端）；②每队达标实时徽章；③角色池推荐排序 + 「推荐」角标。**推荐功能带开关**（默认开；关 → 退回纯战力/增益排序、无角标，回归纯手动）。
- **后端零改动**：填格/撤格/改职责全部复用现有端点 + `replace:true` 自动撤冲突格。
- **范围**：仅 Web 前端；AstrBot skill 本轮不改。

## 2. 前端

### 2.1 路由与入口

- `router/index.ts` 新增：`{ path: '/raids/:id/roster', component: () => import('../views/RosterView.vue') }`（守卫与现有路由一致，登录态校验）。
- `RaidDetailView.vue` 顶栏管理员按钮组追加「编队」按钮（`v-if="auth.isAdmin"`），`router.push(`/raids/${rid}/roster`)`。

### 2.2 RosterView.vue 总体结构

- 复用 `useRaidStore` + `connectRaidWs`（与 RaidDetailView 相同：WS 增量合并 + 断线重连全量刷新）。
- 页面分区：
  - **顶部栏**：返回详情链接 · 波标签（raid.waves，后端已按 round_index/group_index 排序）· 推荐开关 · 未排状态条。
  - **主体**：左侧角色池（可滚动）+ 右侧当前波网格。
- 只读：`canEdit = store.raid && (auth.isAdmin || !store.raid.locked)`；非管理员时隐藏拿起/菜单/模板编辑，仅查看。

### 2.3 角色池（左侧）

- **数据源**：`store.raid.signups` 的 `characters`（即「已勾选报名角色」，与详情页 `charsByUser` 一致——后端 fill 对管理员也要求角色已勾选）。
- **每角色卡**：职业图标（`jobIcon`）/ 名字 / 战力文本（复用 SlotCell 语义：输出 `模拟 X · 秒伤 Y`，辅助 `增益 X · 太阳 Y`，null → `暂无`）。
- **状态**：
  - 本波已用：该角色已占本波**或**其 owner 本波（含并行团）已有占位 → 置灰不可拿（防同轮限一）。
  - 可用：可点击拿起。
  - 拿起中：高亮。
- **排序**：
  - 推荐开关**开**：按推荐得分 desc（见 §2.5），前 1-3 名标「推荐」角标 + 推荐目标队色（`→红队`）。
  - 推荐开关**关**：输出按 `simulated_damage` desc（null 后）、辅助按 `buff_amount` desc（沿用管理端排序语义：数值 NULLS LAST）。
- **点击**：点可用角色 → 进入/切换/取消拿起态。

### 2.4 格子网格（右侧）

- 当前波内并行团并排（`waves.filter(w => w.round_index === current.round_index)`，每团一列）；团内 `squad_index` 0..n 排成队组（红/黄/绿，`SQUAD_NAMES`），每队 4 格。
- **每格**：
  - 空：「＋」——仅拿起态下可点（填入目标）。
  - 已占：owner / 角色名 / 职业 / 职责 / 数值（复用 SlotCell 展示样式，抽公共子组件 `RosterSlot.vue` 或内联）；点击 → 小菜单：撤下 / 改职责 / 拿起（再移动）。
- **每队头部**：`已填 x/y` + 达标徽章（见 §2.5）+ 「编辑目标」按钮（仅管理员）。

### 2.5 拿起/放下状态机 + 模板/达标/推荐

**拿起/放下**（`holding = ref<Character | null>`）：
1. 点池可用角色 → `holding = char`；顶部提示条 `拿起中：{name} → 点击右侧目标格`；Esc / 再点其他角色 / 再点当前角色 → 取消。
2. 拿起态点**空格** → `POST /api/raids/{rid}/slots/{sid}/fill { character_id, duty, replace: true }`；`duty` 按该队模板推断（缺输出补输出、缺主奶补主奶；未设模板按职业默认 `defaultDuty(class_type)`）。
3. 拿起态点**已占格** → `confirmDialog` 确认「将替换 X 的原角色」→ fill `replace:true`；返回 `removed_slots` 非空时顶部提示「已替换原占位角色」。
4. 拿起态点格后无论成败均退出拿起态；`fill` 抛 400（硬规则：满员主奶超限 / 满员缺输出等）→ `notifyError` 后端文案，格子不动。
5. 已占格菜单「拿起」= `holding = 该格角色`，原格保留；点新格 fill 时 `replace:true` 自动撤下原格（同角色他格），行为等同移动，无需专门移动端点。
6. 后端 `fill` 的 `replace:true` 自动撤冲突格（同角色他格 / 同玩家同轮他格），前端无需预判冲突，失败兜底。

**目标模板**（localStorage）：
- key `dnfer-roster-targets-{raidId}`，值 `Record<number /* squad_index 队位 */, SquadTarget>`。
- `SquadTarget`：`{ outputs?: { count?: number; simMin?: number | null; simMax?: number | null }; mainHeal?: { buffMin?: number | null; buffMax?: number | null }; sunHeal?: { count?: number }; slack?: boolean }`。
- 模板按**队位**（squad_index）存，跨团共享（并行团里每个红队同目标）。
- 编辑：每队头部「编辑目标」→ 弹窗表单（几输出 / 总模拟伤害区间 / 主奶增益区间 / 太阳奶个数 / 划水豁免），保存写 localStorage。

**达标徽章**（每队头部，始终显示，与推荐开关无关）：
- 计算：对该队已占 slots 汇总——输出数 / 输出总模拟伤害 / 主奶 buff_amount / 太阳奶数；有任一成员 duty=划水 → 组成类要求豁免（对齐后端 `check_composition` 语义）。
- 渲染：`红队 输出 1/2 · 总伤 12800/20000-25000 · 主奶增益 46000/45000-48000 ✓`；缺口项红字；达标 ✓ / 未达 ⚠。
- 仅设单边区间（只 simMin）则单向判断。

**推荐**（开关开启时，纯前端纯函数）：
- 候选：已勾选、未占任何格、owner 本波未用。
- 目标队判定：对当前波每个队实例按模板算「缺口分」（缺输出数、总伤低于下限的量、缺主奶、缺太阳奶，各权重），取缺口最大的队实例为该候选的推荐目标（要求 class_type 匹配模板所需角色类型；无模板 → 缺口分按 0，退化为战力排序）。
- 排序：候选按「推荐目标队的缺口分」desc，同分按战力/增益 desc。
- 推荐开关存储：localStorage `dnfer-roster-recommend`（布尔，默认 true），团长偏好持久。

**未排状态条**（顶部，始终显示）：
- 本波未排 N：当前波（含并行团）无任何占位的**报名用户**数；全局未排 M：全 raid 无任何占位的报名用户数。
- 点击展开列出玩家 + 各自可用角色数。

## 3. 测试

### 3.1 lib 纯函数（新建 `frontend/src/lib/roster.ts` + `roster.spec.ts`）

- **达标计算** `computeSquadStatus(slots, target)`：输出数/总伤区间/主奶增益区间/太阳奶数/划水豁免 各缺口判断；单边区间；无模板时返回基础信息不报错。
- **推荐排序** `rankCandidates(candidates, squads, targets, wave)`：开 → 缺口分排序 + 前 N 标记 + 推荐目标队；关 → 纯战力/增益排序；无模板退化。
- **模板读写** `loadTargets(raidId)` / `saveTargets(raidId, targets)`：localStorage 编解码、缺省空对象。
- 同类纯函数抽离便于单测（达标/推荐逻辑不进组件）。

### 3.2 组件测试（新建 `RosterView.spec.ts`）

- 沿用 `RaidDetailView.spec` 的 `mountView(signups, user, snapshot=...)` 约定 + mock `api`。
- 用例：波标签切换渲染；拿起→点空格触发 `api.post` fill 且 payload 含 `replace:true`；点已占格替换（`confirmDialog` 确认后 fill）；菜单撤下触发 `api.del`；改职责触发 `api.put`；推荐开关切换后角色池排序变化；未排状态条计数（本波/全局）；非管理员只读（无拿起/菜单/编辑目标）。

### 3.3 类型与构建

- 不改 `types.ts`（新类型 `SquadTarget` 等放 `lib/roster.ts` 内），无既有 fixture 涟漪。
- `npm run build`（vue-tsc）验证类型。

## 4. 不做的事（YAGNI）

- 不做后端改动 / 新端点（fill/remove/duty 全复用）。
- 不做拖拽交互（仅点选拿起→点格放下）。
- 不做跨波一键自动编排 / 全自动配队。
- 不把模板存后端（本地 localStorage，符合用户选择）。
- 不做全波横排视图（波标签切换）。
- 不改 AstrBot skill（dnfer-raids）。
