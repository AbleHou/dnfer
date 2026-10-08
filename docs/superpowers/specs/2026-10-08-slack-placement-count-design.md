# DNfer 划水位计算·占位灰显与划水数显示 — 设计规格

日期：2026-10-08
状态：已确认
上游：`2026-10-08-slack-rules-design.md`（划水位计算：判定/兑换规则、`lib/slack.ts` 纯函数、`grayByUser` computed、弹框/表格灰显）。
需求来源：用户口述——①占位选人时也能看见灰色（划水）角色；②有一个显示每个人划水数的地方。

## 1. 目标与已确认规则

- **占位选人灰显**：`CharacterPickerModal`（占位选人弹框）中，当前所选玩家的超额划水角色与既有弹框/表格一致地灰显（仅视觉参考，不阻止占位）。
- **划水数（已确认）**：指该用户**划水总数**（符合判定规则的角色数，不扣除兑换额度）。
- **划水数显示位置（已确认）**：①报名面板每个用户行（非团长）计数旁；②MemberCharactersModal（报名角色弹框）列表上方。团长报名行不显示，但打开团长弹框时显示其划水数（团长参与计算）。
- **显示条件（已确认）**：「划水 N」仅在该用户划水总数 > 0 时显示（避免无规则时大量「划水 0」噪音）。
- **实现方案（已确认）**：方案 A——纯前端派生 + prop 传递；`lib/slack.ts` 内部抽共享 `slackingByUser`，新增 `slackCountByUser`，`computeSlack` 契约不变。

## 2. 计算层（`frontend/src/lib/slack.ts`）

内部共享函数（不导出）：

```ts
function slackingByUser(rules: SlackRuleSet, charsByUser: Record<number, Character[]>): Record<number, Character[]> {
  const out: Record<number, Character[]> = {}
  for (const [uid, chars] of Object.entries(charsByUser)) {
    out[Number(uid)] = chars.filter(c => isSlackingChar(c, rules.criteria))
  }
  return out
}
```

- `computeSlack` 改为复用 `slackingByUser`（allowance 仍为 `Σ charExchangeCount`），返回契约不变（灰色角色 id 数组）。
- 新增导出：

```ts
export function slackCountByUser(rules: SlackRuleSet, charsByUser: Record<number, Character[]>): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [uid, chars] of Object.entries(slackingByUser(rules, charsByUser))) {
    out[Number(uid)] = chars.length
  }
  return out
}
```

## 3. 占位选人灰显

### 3.1 `frontend/src/components/CharacterPickerModal.vue`

- props 加 `grayByUser?: Record<number, number[]>`（withDefaults 默认 `{}`）。
- 新增 computed：

```ts
const currentPlayerId = computed(() =>
  props.adminMode ? (playerId.value ?? -1) : (auth.user?.id ?? -1))
```

- `CharacterCard` 加 `:grayed="(grayByUser?.[currentPlayerId] ?? []).includes(c.id)"`（保留既有 `placement`/`active`/`@click`）。

### 3.2 `frontend/src/views/RaidDetailView.vue`

- `CharacterPickerModal` 传 `:gray-by-user="grayByUser"`。

## 4. 划水数显示

### 4.1 `frontend/src/views/RaidDetailView.vue`

- import 改名避免与 computed 同名：`import { computeSlack, slackCountByUser as countSlackByUser } from '../lib/slack'`。
- 新增 computed：

```ts
const slackCounts = computed(() =>
  countSlackByUser(store.raid?.slack_rules ?? { criteria: [], exchange: [] }, charsByUser.value))
```

- 报名行（非团长 `.signup-group`）的 `signup-count` 后追加（仅 >0 显示）：

```html
<span class="signup-count">{{ placedCount(s) }}/{{ s.characters.length }}<template v-if="(slackCounts[s.user.id] ?? 0) > 0"> · 划水 {{ slackCounts[s.user.id] }}</template></span>
```

- `MemberCharactersModal` 传 `:slack-count="memberModalUser ? (slackCounts[memberModalUser.id] ?? 0) : 0"`。

### 4.2 `frontend/src/components/MemberCharactersModal.vue`

- props 加 `slackCount?: number`。
- 列表上方显示（仅 >0）：

```html
<p v-if="(slackCount ?? 0) > 0" style="color:var(--dnf-text-muted,#9aa3b2);font-size:12px">划水 {{ slackCount }}</p>
```

## 5. 测试

### 5.1 `lib/slack.spec.ts`

- 新增 `slackCountByUser` 用例：总数统计正确（多角色）、null/职业不匹配不计入、空规则为 0。

### 5.2 `CharacterPickerModal.spec.ts`

- `grayByUser` prop 传递：管理员模式选某玩家时该玩家灰色 id 的角色灰显、非灰色不灰；成员模式按自己 id 灰显。（现有 spec 若 stub CharacterCard 则改断言 stub props。）

### 5.3 `MemberCharactersModal.spec.ts`

- `slackCount: 2` → 显示「划水 2」；`slackCount: 0`/缺省 → 不显示。

### 5.4 `RaidDetailView.spec.ts`

- 报名行：有划水角色的成员行显示「· 划水 N」；无则无。
- `CharacterPickerModal` stub 收到 `grayByUser` prop。
- `MemberCharactersModal` stub 收到 `slackCount` prop。

### 5.5 构建

- `cd frontend && npx vitest run`（全量）+ `cd frontend && npm run build`（vue-tsc）通过。

## 6. 文档

- `CHANGELOG.md` [Unreleased]「攻坚划水位计算」条目补充：占位选人时超额划水角色灰显；报名行与角色弹框显示每人划水总数。

## 7. 变更文件范围

### 前端

- `frontend/src/lib/slack.ts` + `slack.spec.ts`
- `frontend/src/components/CharacterPickerModal.vue` + `.spec.ts`
- `frontend/src/components/MemberCharactersModal.vue` + `.spec.ts`
- `frontend/src/views/RaidDetailView.vue` + `.spec.ts`

### 文档

- `CHANGELOG.md`
