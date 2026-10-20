# 编队缺口总览 + 推荐修正 —— 设计文档

日期：2026-10-20
状态：设计定稿（brainstorming 三节通过）
范围：前端纯重构（`lib/roster.ts` 引擎 + `RosterGrid`/`RosterPool`/`RosterView` 接线 + 模板生命周期）；后端零改动
前置文档：[2026-10-20-roster-recommend-findings.md](./2026-10-20-roster-recommend-findings.md)（排查清单 P1-P5）

## 1. 背景与目标

用户反馈编队「推荐」模块基本不可用。brainstorming 确认实际诉求：

1. **缺口总览为主**：每队状态条要能看清模板各维度「实际/目标 + ✓/✗ + 差值」，**达标也保留数值**（现在一达标就显示「✅」把数值藏了，看不出超过多少）。
2. **推荐角标为辅**：保留「推荐→X队」角标但修好（findings P1-P5）。
3. **模板生命周期**：模板前端 per-raid 缓存（现状 localStorage 已缓存），**关闭或删除攻坚时主动清除**（现状从不清除，永久泄漏）。

设计定位：统一「总览引擎」作为单一事实来源，同时喂给网格状态条与推荐打分；推荐方向改为「队 → 最佳候选」，天然分散覆盖各缺人队。

## 2. 非目标（YAGNI）

- 不做一键自动填表（用户未选）。
- 不做后端存模板（用户明确要「缓存在前端」）。
- 不迁移 findCandidates 为跨 raid 复用模板。
- 不改后端任何逻辑/端点。

## 3. 核心逻辑层重构（`frontend/src/lib/roster.ts`）

### 3.1 新增 `squadOverview(slots, target): SquadOverview` —— 单一事实来源

```ts
export type OverviewDimKey = 'outputCount' | 'simDamage' | 'mainHealBuff' | 'sunHealCount'

export interface OverviewDim {
  key: OverviewDimKey
  label: string                 // '输出' | '总伤' | '主奶增益' | '太阳奶'
  actual: number | null         // 实际值；主奶无主奶槽时为 null
  min: number | null            // 模板目标下限（simMin / buffMin / count）
  max: number | null            // 模板目标上限（simMax / buffMax；count 类无）
  ok: boolean
  diff: number | null           // 未达标=缺口（低于 min 记负 / 高于 max 记正）；达标=超出量（对 min 记正）
}

export interface SquadOverview {
  filled: number
  total: number
  dims: OverviewDim[]           // 只含模板里设了的维度
  slack: boolean                // 划水豁免（target.slack 或队内有人 duty==='划水'）
  ok: boolean                   // dims 全 ok（或 slack 豁免）
  issues: string[]              // 未达标摘要：'缺1输出' / '总伤差8000' / '总伤超3000' / '缺主奶' / '缺太阳奶'
}
```

- `squadOverview(slots, undefined)` → `{ dims: [], ok: true, issues: [], slack: false }`（无模板=无要求=ok）。
- 维度计算：
  - `outputCount`：actual=已填输出数，min=target.outputs.count；ok=actual>=count；diff=actual-count。
  - `simDamage`：actual=`sumSquadDamage(filled).simulated`；min/max 来自 simMin/simMax；ok=在 [min,max] 内；diff 取被违反的边界方向（低于 min 记负、高于 max 记正），达标时记 actual-min 作为超出量。
  - `mainHealBuff`：actual=主奶槽（duty==='主奶'）buff_amount，无主奶槽→null 视为未达标；min/max 来自 buffMin/buffMax。
  - `sunHealCount`：actual=太阳奶槽数，min=target.sunHeal.count；ok=actual>=count。
- 双界显示：simMin+simMax（或 buffMin+buffMax）同时设时状态条显示 `[min~max]`。

### 3.2 替换 `computeSquadStatus` / `SquadStatus`

- 删除 `computeSquadStatus` 与 `SquadStatus` 接口，避免两套并行状态系统。
- **一并删除旧的推荐路径**：`rankCandidates`/`RankedCandidate`/`squadGap`/`candidateFitsSquad` 全部废弃（其唯一调用方 `RosterView` 改接 `squadOverview` + `recommendFillers`，见 §3.3/§4.2），不留死代码。
- 对外调用点：`RosterGrid.vue`（45-47）改接 `squadOverview`。
- `roster.spec.ts` 现有 computeSquadStatus 约 10 例迁移到 `squadOverview` 断言（`SquadStatus` 字段均能从 overview 推导：filled/total/slack/issues 直取，outputCount=outputCount.actual、outputTotal=simDamage.actual、mainHealBuff=mainHealBuff.actual、sunHealCount=sunHealCount.actual）。`sortByPower` 保留（RosterPool 仍在用）。

### 3.3 推荐逻辑：`recommendFillers(opts): SquadSuggestion[]`（队 → 最佳候选）

```ts
export interface SquadSuggestion {
  character: Character
  waveId: number
  roundIndex: number             // 展示用波数（round_index，并行团角标显示需要）
  groupIndex: number | null      // 并行团号；null=独立单波
  squadIndex: number
  gap: number                    // 该队缺口分（供排序/展示）
}
```

对当前轮每个（波 × 队）：
1. 算 `squadOverview(slots, targets[si])`，直接取 `filled/total` 判满员。
2. 跳过条件：无模板 / slack 豁免 / `ok`（无缺口）/ **`filled >= total`（满员，P1）**。
3. 判定该队所需角色类型（按**实际需求**，P2）：
   - 输出适合：「输出数 < 目标」或「总伤 < simMin」或「队内无主C」。
   - 辅助适合：「主奶未达标或缺失」或「太阳奶数 < 目标」。
   - 主奶已达标、纯缺输出的队**不会**把辅助吸过去（P2 核心修复）。
4. **混合需求类型优先级**（队同时适合输出与辅助时，按下列顺序取第一个命中的维度决定推荐类型，保证确定性、避免 sim 与 buff 跨量纲比较）：
   1. 无主奶槽（队内无 duty==='主奶'）→ 辅助
   2. 无主C槽 → 输出
   3. 输出数 < 目标 → 输出
   4. 太阳奶数 < 目标 → 辅助
   5. 总伤 < simMin → 输出
   6. 主奶增益 < buffMin → 辅助
   类型定后，选该类型战力最高者。
5. **跨队角色去重**（防同一角色被多队抢占 → §4.2 的 `Record<charId,…>` 会静默折叠，低缺口队丢角标）：
   - 先按 (gap 降序, 同 gap 按「该队当前类型最强可选候选的战力」降序) 排序各「候选队」，维护 `used: Set<charId>`；
   - 依次为每队选「该类型中未 used 的战力最高者」，选中即加入 `used`；无可选则跳过该队。
   - 保证每角色至多一条建议、且落在缺口最大的队上，覆盖尽可能多的缺人队（P3）。

排序：按 (gap 降序, 战力降序) 输出；设上限（如 6 条）防刷屏。无模板/无缺口 → 空数组（P5）。

建议自带 `waveId`/`roundIndex`/`groupIndex`，供并行团角标区分（P4）。

### 3.4 模板生命周期 helper

```ts
export function clearTargets(raidId: number): void   // localStorage.removeItem，try/catch
```
`saveTargets` 补 try/catch（现状缺，隐私模式会抛）。

## 4. UI 层接线

### 4.1 RosterGrid 状态条（替换「缺口文案 / 达标 ✓」两态）

- 无模板 → 淡色「未设目标」。
- 有模板 → 每维度一段：`输出 1/2 ✗ · 总伤 12000/20000 ✗ · 主奶 52k/45k ✓`；✗ 红 ✓ 绿；双界显示 `[min~max]`。
- 划水豁免 → 维度照显但整行「划水豁免」tag，不标 ✗。
- 全达标 → 各维度 ✓（含超出量）+ 前缀「达标 ✓」。
- 队头保留 `2/4` 计数 + 「目标」按钮（不变）。

### 4.2 RosterPool 角标（props 合并）

- `RosterView` 计算 `suggestions` → 传新 prop `recommend: Record<charId, { roundIndex, groupIndex, squadIndex }>`，仅对有建议的角色打标。`roundIndex` 由 `SquadSuggestion` 携带、自包含，不依赖 RosterPool 的 `currentRound`（避免两处波数来源不一致）。
- 合并删除旧 prop `recommendTop3` / `recommendTarget`。
- 角标文案（对齐代码库 `第 N 波 M 团` 的带空格格式，避免 UI 三种格式并存）：
  - 单波（groupIndex==null）：`推荐→红队`
  - 并行团：`推荐→第 {roundIndex} 波 {groupIndex} 团红队`
- 「推荐」开关保留（`recommendOn`，控制是否计算/显示角标）。

### 4.3 模板生命周期清除（4 处 hook）

1. `RaidDetailView.onCloseRaid` 成功后 `clearTargets(rid)`。
2. WS `raid:closed` handler（`RaidDetailView` 84 行 + `RosterView` 203 行）→ `clearTargets(rid)`。
3. `RaidListView` 删除成功（58 行）→ `clearTargets(rid)`。
4. `RosterView.load()` 发现 `store.raid.closed` → `clearTargets(rid)` 且**同步置 `targets.value = {}`**（覆盖直链进入已关闭编队页；只清 localStorage 而内存 ref 不清会导致只读快照页仍显示旧状态条/角标）。

## 5. 测试

- `roster.spec.ts`：
  - 迁移 computeSquadStatus ~10 例到 `squadOverview`。
  - 新增 `squadOverview`：各维度实际/目标/✓✗/diff、双界（min+max）、主奶无槽（actual null → ✗ + '缺主奶'）、无模板、划水豁免、达标含超出量。
  - 新增 `recommendFillers`：P1（满员队不进）、P2（主奶达标缺输出的队只推输出不推辅助）、P3（覆盖多队、每角色至多一条且落在缺口最大的队——**跨队去重**用例）、P4（并行团带 groupIndex/roundIndex）、P5（无模板 → 空）、**混合需求类型优先级**（既缺输出又缺太阳奶的队按优先级表选类型）。
  - `clearTargets` 往返（存→清→空）。
- `RosterGrid.spec.ts`：状态条新格式（维度 ✓✗+差值、未设目标、划水豁免）。
- `RosterPool.spec.ts`：角标文案（单波/并行团）、无建议不打标、props 从 recommendTop3/recommendTarget 换成 recommend。
- `RosterView.spec.ts`：suggestions 接线（recommend prop 内容）、`load()` 遇 closed 调 `clearTargets`。
- `RaidDetailView.spec.ts` / `RaidListView.spec.ts`：关闭/删除成功后 `clearTargets` 被调用（spy）。

## 6. 验证命令

- 前端单测：`cd frontend && npx vitest run src/lib/roster.spec.ts src/components/RosterGrid.spec.ts src/components/RosterPool.spec.ts src/views/RosterView.spec.ts src/views/RaidDetailView.spec.ts src/views/RaidListView.spec.ts`
- 前端类型/构建：`cd frontend && npm run build`（= vue-tsc -b && vite build）
- 后端不改动，无需跑后端测试。

## 7. 打开问题（实现时确认）

- 推荐建议上限条数（暂定 6）。
- 达标时 `diff` 具体文案格式（如 `(+5000)` / `超5000`）由实现定稿，测试锁格式。
- `recommendOn` 关闭时 `recommendFillers` 直接返回空（RosterView 不计算或函数内短路）。
