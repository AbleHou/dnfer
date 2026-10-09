# DNfer 攻坚「划水位计算」功能 — 设计规格

日期：2026-10-08
状态：已确认
上游：`2026-09-29-signup-ui-design.md`（报名 UI：`RaidSignup.characters` 为报名勾选角色列表，团长固定行 `created_at=null`）；`2026-09-29-sun-buff-design.md`（辅助数值 `buff_amount`/`sun_buff`）；`2026-09-24-admin-split-design.md`（admin 端点模式、`require_admin`）；`2026-09-18-job-system-design.md`（`Character.class_type` 为 `输出/辅助`）。
需求来源：`划水位计算.md`——攻坚详情新增「划水规则设置」，按规则计算每个人可兑换的划水位置，将超出额度的划水角色灰显（仅参考，不影响编队）。

## 1. 目标与已确认规则

- 攻坚详情新增「划水规则设置」按钮，弹框配置两类规则，纯前端交互、后端持久化共享。
- **存储（已确认）**：规则按攻坚存储在后端，全团查看一致的灰色效果。
- **权限（已确认）**：仅管理员可设置/修改规则（团长必为管理员，故涵盖团长）；普通成员只读灰色效果。
- **判定规则「划水名望」**：每行 `职业(输出/辅助) + 数值类型 + 数值`；角色 `class_type` 匹配且对应数值**小于**输入值 → 划水角色。
- **多行判定（2026-10-09 优化）**：同一职业存在多条判定行时，**满足任意一条**（数值 ≥ 阈值）即**不算划水**；仅当**全部**适用行数值都小于阈值才判划水。例如「辅助增益量 < 41000」与「辅助太阳增益 < 400000」两条同时配置时，太阳增益达标即可豁免增益量不达标。
- **兑换规则「兑换标准」**：每行 `职业 + 数值类型 + 数值 + 划水数`；角色匹配且数值**大于**输入值 → 可兑换该行 `划水数` 个划水位置。
- **兑换叠加（已确认）**：同一角色满足多条兑换标准时**只取最高一条**（不叠加），各角色贡献求和为该人总额度。
- **空值（已确认）**：数值为 `null`（如秒伤/增益未填）时**不满足**——不判划水，也不计入兑换；多行判定下适用行指标为 `null` 视为「不满足」，按宽松语义不判划水（与单行 null 行为一致）。
- **灰色判定**：某人划水角色数 > 兑换额度时，把列表**靠后**的（划水数 − 额度）个划水角色灰显；否则不灰显。
- 灰色仅视觉参考，不影响编队/占位/换人逻辑。
- 数值类型映射：`fame`(名望)/`simulated_damage`(模拟伤害)/`sustained_dps`(秒伤)/`buff_amount`(增益量)/`sun_buff`(太阳增益量)。输出职业可选前三者，辅助职业可选后两者。

## 2. 计算语义（前端纯函数，单一实现）

对每个已报名用户（**含团长**，团长用其全部角色，列表顺序即详情中角色顺序）：

```
metric_value(c, m) = c[m]，null 直接视为不满足（不参与比较）

slacking[u] = [c for c in chars[u] if 存在适用规则行（c.class_type 匹配）
    且 对每条适用规则行 cr：
       metric_value(c, cr.metric) != null 且 metric_value(c, cr.metric) < cr.value]
    # 2026-10-09 优化：满足任意一条适用规则即豁免；适用指标为 null 不判（宽松）

allowance[u] = Σ_{c in chars[u]} max(
    [ex.count for ex in exchange 行 if c.class_type == ex.class_type
     且 metric_value(c, ex.metric) != null 且 metric_value(c, ex.metric) > ex.value]
    or [0])        # 无满足行 → 该角色贡献 0；多行满足 → 取最大 count

excess = len(slacking[u]) - allowance[u]
gray[u] = slacking[u][-excess:] if excess > 0 else []   # 靠后的超额划水角色
```

- 规则为空（无判定行）→ 所有人无灰色。
- 兑换额度与划水判定互相独立（同一角色可因某指标判划水、又因另一指标贡献额度）。

## 3. 后端实现

### 3.1 数据模型（`backend/app/models.py`）

新增表 `RaidSlackRule`（`__tablename__ = "raid_slack_rules"`）：

```python
class RaidSlackRule(Base):
    __tablename__ = "raid_slack_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id", ondelete="CASCADE"),
                                         unique=True, index=True)
    rules: Mapped[dict] = mapped_column(JSON)      # {"criteria": [...], "exchange": [...]}
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
```

- 新表由 `init_db()` 的 `create_all` 自动创建，**无需迁移**。
- `Raid` 加关系 `slack_rule: Mapped[RaidSlackRule | None] = relationship(..., cascade="all, delete-orphan")`。

### 3.2 schema（`backend/app/schemas.py`）

```python
SlackMetric = Literal["fame", "simulated_damage", "sustained_dps", "buff_amount", "sun_buff"]

class SlackRuleCriterion(BaseModel):
    class_type: Literal["输出", "辅助"]
    metric: SlackMetric
    value: int = Field(ge=0)

class SlackRuleExchange(BaseModel):
    class_type: Literal["输出", "辅助"]
    metric: SlackMetric
    value: int = Field(ge=0)
    count: int = Field(ge=1)

class SlackRuleSet(BaseModel):
    criteria: list[SlackRuleCriterion] = Field(default_factory=list, max_length=20)
    exchange: list[SlackRuleExchange] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")   # 校验 metric 与 class_type 兼容
    def _metric_compatible(self):
        output = {"fame", "simulated_damage", "sustained_dps"}
        for row in [*self.criteria, *self.exchange]:
            if (row.class_type == "输出" and row.metric not in output) or \
               (row.class_type == "辅助" and row.metric in output):
                raise ValueError(f"数值类型与职业不匹配: {row.class_type}/{row.metric}")
        return self
```

- `RaidSignupOut.characters`：`list[SignupCharacterOut]` → **`list[CharacterOut]`**（复用 `character_out`，含 fame/伤害/增益全量数值）。
- `RaidDetail` 新增 `slack_rules: SlackRuleSet = SlackRuleSet()`。

### 3.3 端点（`backend/app/routers/raids.py`）

- `PUT /{rid}/slack-rules`（`require_admin`）：body `SlackRuleSet` → upsert 该攻坚的 `RaidSlackRule` 行（`updated_by=admin.id`），提交后
  `await manager.broadcast(rid, {"type": "raid:slack_rules_changed", "slack_rules": body.model_dump()})`，返回 body。
- `_detail`：
  - 加 `slack_rules=_load_slack_rules(db, raid)`（读行 → 解析 JSON → `SlackRuleSet`，无行返回空集）。
  - `_signup_characters` 改为返回 `[character_out(rsc.character) ...]`（保持插入顺序）。
  - 团长固定行 `characters` 由 `[]` 改为团长全部角色（`Character.id` 升序，与 `get_member_characters` 一致），保证团长也能算灰色。
- **注意 `_signup_characters` 的复用面**：除 `_detail` 外，现有 `raid:signup`、`raid:signup_chars_changed` 广播与 `bot.py` 的报名广播都经 `_signup_characters` 构造——改型后这些 WS 负载自动变为完整 `CharacterOut`（后端测试只断言 `id`，不受影响；前端 WS 事件类型需同步改型，见 §4.5）。
- 检查所有直接构造 `RaidDetail`/`RaidSignupOut` 的位置（`public.py` 复用 `_detail`，`RaidListItem` 不含 slack 不涉及）。

### 3.4 无需改动

- `services/characters.py`（`character_out` 已返回全量数值）；`migrations.py`/`db.py`（新表 create_all 自动建）。
- 删除不再使用的 `SignupCharacterOut`（确认无其他引用后）；`_signup_char_out` 助手在 `_signup_characters` 改用 `character_out` 后成死代码，一并删除。

## 4. 前端实现

### 4.1 类型（`frontend/src/types.ts`）

```ts
export type SlackMetric = 'fame' | 'simulated_damage' | 'sustained_dps' | 'buff_amount' | 'sun_buff'
export interface SlackRuleCriterion { class_type: ClassType; metric: SlackMetric; value: number }
export interface SlackRuleExchange { class_type: ClassType; metric: SlackMetric; value: number; count: number }
export interface SlackRuleSet { criteria: SlackRuleCriterion[]; exchange: SlackRuleExchange[] }
```

- `RaidSignup.characters`：`SignupCharacter[]` → **`Character[]`**；`SignupCharacter` 随之删除（§4.5 的 WS 事件改型后确认无引用）。
- `Raid` 加必填 `slack_rules: SlackRuleSet`。

### 4.2 计算库（`frontend/src/lib/slack.ts` + `slack.spec.ts`）

- `metricValue(c: Character, m: SlackMetric): number | null`
- `isSlackingChar(c, criteria): boolean`（null → false；多规则同职业时满足任意一条即 false，全部低于阈值才 true）
- `charExchangeCount(c, exchange): number`（取满足行最大 count，无则 0）
- `computeSlack(rules: SlackRuleSet, charsByUser: Record<number, Character[]>): Record<number, number[]>`
  （返回每人灰色角色 id 数组，顺序=输入顺序靠后）

### 4.3 规则设置弹框（新 `frontend/src/components/SlackRulesModal.vue`）

- Props：`open: boolean`、`rules: SlackRuleSet`；Emits：`close`、`submit(rules: SlackRuleSet)`。
- 打开时 watch 深拷贝 `rules` 到本地行数组。
- 两部分（每部分「＋添加一行」）：
  - **划水名望**：行 `职业下拉(输出/辅助) + 数值下拉 + 数值输入`。
  - **兑换标准**：行 `职业下拉 + 数值下拉 + 数值输入 + 划水数输入`。
  - 数值下拉选项随职业切换：输出→名望/模拟伤害/秒伤；辅助→增益量/太阳增益量。
- 底部居中按钮：`清空`（本地行全部清空）、`提交`（emit 当前行 → 由 RaidDetailView 调 PUT；成功后关闭）。
- 复用现有 `dnf-btn`/naive-ui `NModal` 样式。

### 4.4 攻坚详情（`frontend/src/views/RaidDetailView.vue`）

- 顶栏操作组加「划水规则设置」按钮（`auth.isAdmin` 才显示）→ `SlackRulesModal`。
- 计算（全部为 `computed`，随 store 数据派生 → **WS 增量自动保持新鲜**，无需重拉）：
  - `charsByUser = Record<user_id, Character[]>`（由 `store.raid.signups` 各行的 `characters` 建立，含团长行）。
  - `grayByUser = computeSlack(store.raid.slack_rules, charsByUser)`。
  - `grayCharIds = Set<number>`（所有灰色角色 id 并集）。
- `onSlackRulesSubmit(rules)`：`api.put(/api/raids/{rid}/slack-rules, rules)` → notifySuccess → 关弹框（`load()` 可选，因 WS 已 patch）。
- `MemberCharactersModal` 传 `:gray-ids="grayByUser[user.id] ?? []"`。
- `WaveSection` 传 `:slack-char-ids="grayCharIds"`。

### 4.5 WS（`frontend/src/stores/raid.ts`）

- `WsEvent` 新增 `{ type: 'raid:slack_rules_changed'; slack_rules: SlackRuleSet }`。
- **既有事件改型**：`{ type: 'raid:signup'; characters: SignupCharacter[] }` 与 `{ type: 'raid:signup_chars_changed'; characters: SignupCharacter[] }` 中的 `characters` 一并改为 **`Character[]`**（后端广播已随之变完整 `CharacterOut`），否则 `applyEvent` 中 `raid.signups.push(...)`/`row.characters = ev.characters` 会 vue-tsc 类型不匹配。
- `applyEvent` 新增处理：`raid.slack_rules = ev.slack_rules`（灰度随之刷新）。`api/ws.ts` 泛型分发无需改动（计划阶段确认）。

### 4.6 灰显展示

| 文件 | 改动 |
|---|---|
| `components/MemberCharactersModal.vue` | 加 prop `grayIds?: number[]`；`CharacterCard` 传 `:grayed="grayIds.includes(c.id)"` |
| `components/CharacterCard.vue` | 加 prop `grayed?: boolean`；根元素加 class `grayed` |
| `components/WaveSection.vue` | 加 prop `slackCharIds?: Set<number>`；`SlotCell` 传 `:grayed="slackCharIds.has(slot.character_id ?? -1)"` |
| `components/SlotCell.vue` | 加 prop `grayed?: boolean`；`occupied` 且 `grayed` 时加 class `grayed` |

- 样式（scoped）：`.grayed { opacity: .45; filter: grayscale(1); }`（占位格/角色卡片均适用，不新增主题变量）。

## 5. 测试

### 5.1 后端（pytest，新增 `backend/tests/test_slack_rules.py`）

- PUT 需管理员：普通用户 403。
- PUT 合法规则 upsert 并返回；GET 攻坚详情 `slack_rules` 带出。
- PUT 空规则（清空）→ 详情 `slack_rules` 为空集。
- PUT 校验：metric 与 class_type 不兼容 → 422。
- PUT 后 WS 广播 `raid:slack_rules_changed`（`receive_json` 断言 type 与 slack_rules）。
- 详情报名角色为完整 `CharacterOut`（含 fame/伤害/增益数值）；团长行 `characters` 已填充全部角色。
- 并发/级联：删除攻坚级联删规则行（可选）。

### 5.2 前端（vitest + vue-tsc）

- `lib/slack.spec.ts`：metric 取值、判定（null 不满足/跨职业不匹配）、兑换取最高、`computeSlack` 灰色（超额靠后/额度内不灰/空规则无灰）。
- `SlackRulesModal.spec.ts`：两节渲染、职业切换数值下拉选项、增删行、清空、提交 emit 规则。
- `RaidDetailView.spec.ts`：管理员见「划水规则设置」、非管理员不见；提交调 PUT 并刷新；`grayByUser`/`grayCharIds` 传递到弹框与占位格。
- `SlotCell.spec.ts`/`CharacterCard.spec.ts`：`grayed` 灰显 class。
- **fixture 同步**：`RaidSignup.characters` 改 `Character[]` 后，构造 `RaidSignup` 的 spec（`RaidDetailView.spec.ts`、`stores/raid.spec.ts`）fixture 需含全量数值字段；**`stores/raid.spec.ts` 的 WS 事件 fixture 也要改**（`raid:signup`/`raid:signup_chars_changed` 的 `characters` 现为 `Character[]`，需含 `job_name`/`parent_name`/`fame` 等字段）；**所有构造完整 `Raid` 字面量的 spec（含 `lib/placement.spec.ts` 的 `makeRaid(waves)`）都需补 `slack_rules` 必填字段**。`SignupModal`/`CharacterPickerModal` 不构造 `RaidSignup` fixture，不受影响。
- `MemberCharactersModal.spec.ts` 补 `grayIds` prop 用例（灰显角色正确传入 `CharacterCard`）。
- `npm run build`（vue-tsc）通过。

## 6. 文档

- `CHANGELOG.md` [Unreleased] 新增：攻坚新增「划水规则设置」——管理员配置判定/兑换规则，按报名角色计算划水位置，超出额度的划水角色在报名弹框与攻坚表格灰显（仅参考，不影响编队）。

## 7. 变更文件范围

### 后端

- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/raids.py`
- `backend/tests/test_slack_rules.py`（新）

### 前端

- `frontend/src/types.ts`
- `frontend/src/lib/slack.ts`（新）+ `slack.spec.ts`（新）
- `frontend/src/components/SlackRulesModal.vue`（新）+ `.spec.ts`（新）
- `frontend/src/views/RaidDetailView.vue`
- `frontend/src/components/MemberCharactersModal.vue`
- `frontend/src/components/CharacterCard.vue`
- `frontend/src/components/WaveSection.vue`
- `frontend/src/components/SlotCell.vue`
- `frontend/src/stores/raid.ts`
- 相关组件/视图/库 spec（补 fixture 字段 + 新增用例）

### 文档

- `CHANGELOG.md`
