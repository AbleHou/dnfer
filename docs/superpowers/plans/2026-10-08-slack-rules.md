# 划水位计算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 攻坚详情新增「划水规则设置」，管理员配置判定/兑换规则，按报名角色计算每人可兑换的划水位置，超出额度的划水角色在报名弹框与攻坚表格灰显（仅参考，不影响编队）。

**Architecture:** 后端新增 `raid_slack_rules` 表存规则（JSON，每攻坚一行），`PUT /{rid}/slack-rules`（仅管理员）upsert 并广播 WS；攻坚详情新增 `slack_rules` 字段且报名角色升级为完整 `CharacterOut`（含数值）、团长行填充全部角色。前端 `lib/slack.ts` 纯函数 `computeSlack` 由 store 数据 + 规则派生每人灰色角色 id，经 computed 传给 `MemberCharactersModal`/`WaveSection`→`SlotCell` 灰显。

**Tech Stack:** FastAPI + SQLAlchemy 2 + SQLite（后端）；Vue 3 `<script setup>` + Pinia + naive-ui + Vitest（前端）。设计规格：`docs/superpowers/specs/2026-10-08-slack-rules-design.md`。

---

## 任务总览（文件结构）

### 后端

| 文件 | 职责 |
|---|---|
| `backend/app/models.py` | 新增 `RaidSlackRule` 表 + `Raid.slack_rule` 关系（级联删除） |
| `backend/app/schemas.py` | 新增 `SlackRuleCriterion`/`SlackRuleExchange`/`SlackRuleSet`（校验 metric 与职业兼容）；`RaidSignupOut.characters`→`list[CharacterOut]`；`RaidDetail.slack_rules`；删 `SignupCharacterOut` |
| `backend/app/routers/raids.py` | `_signup_characters` 改全量 `character_out`（删 `_signup_char_out`）；`_detail` 团长行填充全部角色 + 带 `slack_rules`；`PUT /{rid}/slack-rules` + WS 广播 |
| `backend/tests/test_slack_rules.py` | 模型/校验/端点/WS/详情断言 |

### 前端

| 文件 | 职责 |
|---|---|
| `frontend/src/types.ts` | Slack 类型；`RaidSignup.characters`→`Character[]`；`Raid.slack_rules` 必填；删 `SignupCharacter` |
| `frontend/src/lib/slack.ts` (+`.spec.ts`) | `metricValue`/`isSlackingChar`/`charExchangeCount`/`computeSlack` 纯函数 |
| `frontend/src/stores/raid.ts` | WS 事件 `raid:signup`/`raid:signup_chars_changed` 的 characters 改 `Character[]`；新增 `raid:slack_rules_changed` 处理 |
| `frontend/src/components/SlackRulesModal.vue` (+`.spec.ts`) | 规则设置弹框（两节动态行 + 清空/提交） |
| `frontend/src/components/MemberCharactersModal.vue` | 加 `grayIds` prop → `CharacterCard` |
| `frontend/src/components/CharacterCard.vue` | 加 `grayed` prop → 灰显 class |
| `frontend/src/components/WaveSection.vue` | 加 `slackCharIds` prop → `SlotCell` |
| `frontend/src/components/SlotCell.vue` | 加 `grayed` prop → 灰显 class |
| `frontend/src/views/RaidDetailView.vue` | 划水规则设置按钮、`grayByUser`/`grayCharIds` computed、submit 调 PUT、透传 props |

---

## Task 1: 后端模型 `RaidSlackRule`

**Files:**
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_slack_rules.py`（新建）

- [ ] **Step 1: 写失败测试（模型往返 + 唯一 + 级联）**

`backend/tests/test_slack_rules.py` 开头：

```python
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Dungeon, Raid, RaidSlackRule, User


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_slack_rule_model_roundtrip_unique_cascade(db):
    admin = db.query(User).filter(User.username == "admin").one()
    d = Dungeon(name="副本", size=12)
    db.add(d)
    db.flush()
    r = Raid(name="x", dungeon_id=d.id, size=12, locked=False,
             starts_at=_now(), created_by=admin.id)
    db.add(r)
    db.flush()

    db.add(RaidSlackRule(raid_id=r.id, rules={"criteria": [], "exchange": []}))
    db.commit()
    assert db.query(RaidSlackRule).count() == 1

    # 同 raid 唯一
    db.add(RaidSlackRule(raid_id=r.id, rules={"criteria": [], "exchange": []}))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # 删团级联清规则
    db.delete(db.get(Raid, r.id))
    db.commit()
    assert db.query(RaidSlackRule).count() == 0
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_slack_rules.py::test_slack_rule_model_roundtrip_unique_cascade -v`
Expected: FAIL（ImportError: cannot import name `RaidSlackRule` from `app.models`）

- [ ] **Step 3: 实现模型**

`models.py`：
- import 行加 `JSON`：`from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint`
- `Raid` 加关系（在 `signups` 关系后）：

```python
    slack_rule: Mapped["RaidSlackRule | None"] = relationship(back_populates="raid",
                                                              cascade="all, delete-orphan")
```

- 在 `RaidSignupCharacter` 类后新增：

```python
class RaidSlackRule(Base):
    __tablename__ = "raid_slack_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id"), unique=True, index=True)
    rules: Mapped[dict] = mapped_column(JSON)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    raid: Mapped[Raid] = relationship(back_populates="slack_rule")
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_slack_rules.py -v`
Expected: PASS（1 passed）

- [ ] **Step 5: 提交**

```bash
git add backend/app/models.py backend/tests/test_slack_rules.py
git commit -m "feat: RaidSlackRule 模型（每攻坚一行 JSON 规则，级联删除）"
```

---

## Task 2: schema + 路由改型（报名角色全量 + 团长行填充 + 详情带规则）

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/raids.py`
- Test: `backend/tests/test_slack_rules.py`

- [ ] **Step 1: 写失败测试（SlackRuleSet 校验）**

`test_slack_rules.py` 追加 import 与用例：

```python
from pydantic import ValidationError

from app.schemas import SlackRuleCriterion, SlackRuleExchange, SlackRuleSet


def test_slack_rule_set_metric_compatibility():
    # 输出职业不能选辅助指标
    with pytest.raises(ValidationError):
        SlackRuleSet(criteria=[SlackRuleCriterion(class_type="输出", metric="buff_amount", value=100)])
    # 辅助职业不能选输出指标
    with pytest.raises(ValidationError):
        SlackRuleSet(exchange=[SlackRuleExchange(class_type="辅助", metric="fame", value=1, count=1)])
    # 合法：输出用秒伤 + 辅助用增益量
    s = SlackRuleSet(
        criteria=[SlackRuleCriterion(class_type="输出", metric="sustained_dps", value=50)],
        exchange=[SlackRuleExchange(class_type="辅助", metric="buff_amount", value=40000, count=1)])
    assert len(s.criteria) == 1 and len(s.exchange) == 1
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_slack_rules.py::test_slack_rule_set_metric_compatibility -v`
Expected: FAIL（ImportError: cannot import name `SlackRuleSet`）

- [ ] **Step 3: 实现 schema**

`schemas.py`（`Literal` 已在文件顶部 import）在 `RaidSignupOut` 之前新增：

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

    @model_validator(mode="after")
    def _metric_compatible(self):
        output = {"fame", "simulated_damage", "sustained_dps"}
        for row in [*self.criteria, *self.exchange]:
            if (row.class_type == "输出" and row.metric not in output) or \
               (row.class_type == "辅助" and row.metric in output):
                raise ValueError(f"数值类型与职业不匹配: {row.class_type}/{row.metric}")
        return self
```

- 删除 `SignupCharacterOut` 类。
- `RaidSignupOut.characters` 类型改为 `list[CharacterOut]`：

```python
class RaidSignupOut(BaseModel):
    user: UserOut
    created_at: datetime | None
    characters: list[CharacterOut] = []
```

- `RaidDetail` 加字段：

```python
    slack_rules: SlackRuleSet = SlackRuleSet()
```

- [ ] **Step 4: 实现路由改型**

`raids.py`：
- import 行改：models 加 `RaidSlackRule`；schemas 去掉 `SignupCharacterOut`、加 `CharacterOut`、`SlackRuleSet`。
- 删除 `_signup_char_out` 函数（70-74 行）。
- 改 `_signup_characters`：

```python
def _signup_characters(rs: RaidSignup) -> list[CharacterOut]:
    """报名行勾选的角色（完整 CharacterOut，保持插入顺序）。"""
    return [character_out(rsc.character) for rsc in rs.characters]
```

- 加 `_load_slack_rules`（放在 `_signup_characters` 附近）：

```python
def _load_slack_rules(db: Session, raid: Raid) -> SlackRuleSet:
    row = db.query(RaidSlackRule).filter(RaidSlackRule.raid_id == raid.id).first()
    return SlackRuleSet.model_validate(row.rules) if row else SlackRuleSet()
```

- 改 `_detail` 团长行填充全部角色 + 返回带 `slack_rules`：

```python
def _detail(db: Session, raid: Raid) -> RaidDetail:
    waves = []
    for w in raid.waves:
        waves.append(WaveOut(id=w.id, index=w.index,
                             slots=[_slot_out(s) for s in w.slots]))
    leader = db.get(User, raid.created_by)
    leader_chars = db.scalars(select(Character).where(Character.user_id == raid.created_by)
                              .order_by(Character.id)).all()
    signups = [RaidSignupOut(user=UserOut.model_validate(leader), created_at=None,
                             characters=[character_out(c) for c in leader_chars])]
    for rs in db.query(RaidSignup).options(selectinload(RaidSignup.user),
                                           selectinload(RaidSignup.characters)) \
            .filter(RaidSignup.raid_id == raid.id,
                    RaidSignup.user_id != raid.created_by) \
            .order_by(RaidSignup.created_at).all():
        signups.append(_signup_out(rs))
    return RaidDetail(id=raid.id, name=raid.name, dungeon_id=raid.dungeon_id,
                      dungeon_name=raid.dungeon.name, size=raid.size,
                      locked=raid.locked, starts_at=raid.starts_at, waves=waves,
                      signups=signups, slack_rules=_load_slack_rules(db, raid))
```

- [ ] **Step 5: 运行确认通过（新测试 + 既有回归）**

Run: `cd backend && .venv/bin/python -m pytest tests/test_slack_rules.py tests/test_raid_signup.py tests/test_raid_signup_characters.py tests/test_public_raids.py -q`
Expected: 全 PASS（既有测试只断言 signup `characters` 的 `id`/`created_at`，不校验键集，改型安全）

- [ ] **Step 6: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/raids.py backend/tests/test_slack_rules.py
git commit -m "feat: Slack 规则 schema；报名角色详情升级为完整数值，团长行填充全部角色"
```

---

## Task 3: `PUT /{rid}/slack-rules` 端点 + WS 广播

**Files:**
- Modify: `backend/app/routers/raids.py`
- Test: `backend/tests/test_slack_rules.py`

- [ ] **Step 1: 写失败测试（端点行为）**

`test_slack_rules.py` 追加 helpers 与用例（顶部已 import `Dungeon/Raid/RaidSlackRule/User/pytest/IntegrityError/ValidationError/SlackRuleSet/...`）：

```python
from .helpers import make_raid, register_user, signup


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _rules():
    return {
        "criteria": [{"class_type": "输出", "metric": "fame", "value": 125000},
                     {"class_type": "辅助", "metric": "buff_amount", "value": 40000}],
        "exchange": [{"class_type": "输出", "metric": "fame", "value": 130000, "count": 1},
                     {"class_type": "输出", "metric": "fame", "value": 141000, "count": 3}],
    }


def test_set_slack_rules_requires_admin(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    h, _ = register_user(client, "sru1", "甲")
    r = client.put(f"/api/raids/{rid}/slack-rules", headers=h, json=_rules())
    assert r.status_code == 403


def test_set_and_read_slack_rules(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.put(f"/api/raids/{rid}/slack-rules", headers=ah, json=_rules())
    assert r.status_code == 200
    assert r.json() == _rules()
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert detail["slack_rules"] == _rules()


def test_set_empty_slack_rules_clears(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    client.put(f"/api/raids/{rid}/slack-rules", headers=ah, json=_rules())
    r = client.put(f"/api/raids/{rid}/slack-rules", headers=ah,
                   json={"criteria": [], "exchange": []})
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert detail["slack_rules"] == {"criteria": [], "exchange": []}


def test_set_slack_rules_rejects_incompatible_metric(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.put(f"/api/raids/{rid}/slack-rules", headers=ah, json={
        "criteria": [{"class_type": "输出", "metric": "buff_amount", "value": 100}],
        "exchange": []})
    assert r.status_code == 422


def test_set_slack_rules_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert client.put(f"/api/raids/{rid}/slack-rules", headers=ah, json=_rules()).status_code == 200
        ev = ws.receive_json()
        assert ev["type"] == "raid:slack_rules_changed"
        assert ev["slack_rules"]["criteria"][0]["value"] == 125000


def test_detail_signup_characters_full_and_leader_filled(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    admin_char = client.post("/api/me/characters", headers=ah, json={
        "name": "团长角色", "job_name": "weapon_master", "fame": 52000,
        "simulated_damage": 5}).json()["id"]
    h, _ = register_user(client, "srd2", "乙")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 100000,
        "sustained_dps": 30}).json()["id"]
    signup(client, rid, h)
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    # 团长行填充全部角色（含数值）
    leader = detail["signups"][0]
    assert leader["created_at"] is None
    assert [c["id"] for c in leader["characters"]] == [admin_char]
    assert leader["characters"][0]["fame"] == 52000
    # 成员行角色为完整 CharacterOut（含数值）
    member = detail["signups"][1]
    assert [c["id"] for c in member["characters"]] == [cid]
    assert member["characters"][0]["sustained_dps"] == 30
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_slack_rules.py -v`
Expected: FAIL（404/405：`PUT /api/raids/{rid}/slack-rules` 尚未注册）

- [ ] **Step 3: 实现端点**

`raids.py` 在 `update_raid`（`PUT /{rid}`）附近新增（`{rid}/slack-rules` 两段路径，与 `/{rid}` 不冲突）：

```python
@router.put("/{rid}/slack-rules", response_model=SlackRuleSet)
async def set_slack_rules(rid: int, body: SlackRuleSet, admin: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    row = db.query(RaidSlackRule).filter(RaidSlackRule.raid_id == rid).first()
    if row is None:
        row = RaidSlackRule(raid_id=rid)
        db.add(row)
    row.rules = body.model_dump()
    row.updated_by = admin.id
    row.updated_at = _now()
    db.commit()
    await manager.broadcast(rid, {"type": "raid:slack_rules_changed",
                                  "slack_rules": body.model_dump()})
    return body
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/bin/python -m pytest tests/test_slack_rules.py -v`
Expected: 全 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/raids.py backend/tests/test_slack_rules.py
git commit -m "feat: PUT /raids/{rid}/slack-rules（仅管理员）upsert 并广播 WS"
```

---

## Task 4: 前端类型 + `lib/slack.ts` 纯函数

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/lib/slack.ts`
- Create: `frontend/src/lib/slack.spec.ts`

- [ ] **Step 1: 写失败测试（纯函数）**

`frontend/src/lib/slack.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { metricValue, isSlackingChar, charExchangeCount, computeSlack } from './slack'
import type { Character, SlackRuleSet } from '../types'

const output: Character = { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: '鬼剑士', class_type: '输出', fame: 52000, simulated_damage: 5,
  sustained_dps: 2, buff_amount: null, sun_buff: null }
const support: Character = { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士',
  parent_name: '圣职者', class_type: '辅助', fame: 40000, simulated_damage: null,
  sustained_dps: null, buff_amount: 3000, sun_buff: 500 }

describe('slack 判定', () => {
  it('metricValue 取对应数值', () => {
    expect(metricValue(output, 'fame')).toBe(52000)
    expect(metricValue(support, 'buff_amount')).toBe(3000)
    expect(metricValue(output, 'buff_amount')).toBeNull()
  })
  it('isSlackingChar：类型匹配且数值小于阈值', () => {
    expect(isSlackingChar(output, [{ class_type: '输出', metric: 'fame', value: 60000 }])).toBe(true)
    expect(isSlackingChar(output, [{ class_type: '输出', metric: 'fame', value: 52000 }])).toBe(false) // 不小于
    expect(isSlackingChar(output, [{ class_type: '辅助', metric: 'fame', value: 60000 }])).toBe(false) // 职业不匹配
    expect(isSlackingChar(output, [{ class_type: '输出', metric: 'buff_amount', value: 999 }])).toBe(false) // null 不满足
  })
  it('charExchangeCount：取满足行最大 count，无则 0', () => {
    expect(charExchangeCount(output, [
      { class_type: '输出', metric: 'fame', value: 50000, count: 1 },
      { class_type: '输出', metric: 'fame', value: 51000, count: 3 }, // 52000 同时 > 两行阈值 → 取最大 3
    ])).toBe(3)
    expect(charExchangeCount(support, [{ class_type: '输出', metric: 'fame', value: 50000, count: 1 }])).toBe(0)
    expect(charExchangeCount(output, [{ class_type: '输出', metric: 'buff_amount', value: 1, count: 1 }])).toBe(0) // null
  })
})

describe('computeSlack', () => {
  // 判定：名望 < 60000 划水；兑换：模拟伤害 > 8 兑 1 个（跨指标，便于同一角色既划水又贡献额度）
  const rules: SlackRuleSet = {
    criteria: [{ class_type: '输出', metric: 'fame', value: 60000 }],
    exchange: [{ class_type: '输出', metric: 'simulated_damage', value: 8, count: 1 }],
  }
  it('超额划水角色靠后灰显', () => {
    // a/b/c 名望均 < 60000（划水）；仅 a 模拟伤害 9 > 8 贡献额度 1；excess=2 → 靠后 b/c 灰显
    const a: Character = { ...output, id: 1, fame: 50000, simulated_damage: 9 }
    const b: Character = { ...output, id: 2, fame: 30000, simulated_damage: 3 }
    const c: Character = { ...output, id: 3, fame: 20000, simulated_damage: 1 }
    expect(computeSlack(rules, { 5: [a, b, c] })).toEqual({ 5: [2, 3] })
  })
  it('额度覆盖的角色不灰，空规则无灰', () => {
    const a: Character = { ...output, id: 1, fame: 50000, simulated_damage: 9 } // 划水但被额度 1 覆盖
    const d: Character = { ...output, id: 4, fame: 30000, simulated_damage: 3 } // 划水无额度 → 灰
    expect(computeSlack(rules, { 5: [a, d] })).toEqual({ 5: [4] })
    expect(computeSlack({ criteria: [], exchange: [] }, { 5: [a] })).toEqual({ 5: [] })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/slack.spec.ts`
Expected: FAIL（Cannot find module `./slack`）

- [ ] **Step 3: 实现 types + 纯函数**

`types.ts`：
- 删 `SignupCharacter`。
- `RaidSignup.characters` 类型改 `Character[]`。
- `Raid` 加必填 `slack_rules: SlackRuleSet`。
- 新增：

```ts
export type SlackMetric = 'fame' | 'simulated_damage' | 'sustained_dps' | 'buff_amount' | 'sun_buff'
export interface SlackRuleCriterion { class_type: ClassType; metric: SlackMetric; value: number }
export interface SlackRuleExchange { class_type: ClassType; metric: SlackMetric; value: number; count: number }
export interface SlackRuleSet { criteria: SlackRuleCriterion[]; exchange: SlackRuleExchange[] }
```

`lib/slack.ts`：

```ts
import type { Character, SlackMetric, SlackRuleSet } from '../types'

export function metricValue(c: Character, m: SlackMetric): number | null {
  return c[m]
}

export function isSlackingChar(c: Character, criteria: SlackRuleSet['criteria']): boolean {
  return criteria.some(cr => c.class_type === cr.class_type && metricValue(c, cr.metric) != null
    && (metricValue(c, cr.metric) as number) < cr.value)
}

export function charExchangeCount(c: Character, exchange: SlackRuleSet['exchange']): number {
  let best = 0
  for (const ex of exchange) {
    if (c.class_type === ex.class_type && metricValue(c, ex.metric) != null
        && (metricValue(c, ex.metric) as number) > ex.value) {
      best = Math.max(best, ex.count)
    }
  }
  return best
}

export function computeSlack(
  rules: SlackRuleSet,
  charsByUser: Record<number, Character[]>,
): Record<number, number[]> {
  const out: Record<number, number[]> = {}
  for (const [uid, chars] of Object.entries(charsByUser)) {
    const slacking = chars.filter(c => isSlackingChar(c, rules.criteria))
    const allowance = chars.reduce((acc, c) => acc + charExchangeCount(c, rules.exchange), 0)
    const excess = slacking.length - allowance
    out[Number(uid)] = excess > 0 ? slacking.slice(-excess) : []
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/slack.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/types.ts frontend/src/lib/slack.ts frontend/src/lib/slack.spec.ts
git commit -m "feat: 划水计算纯函数 lib/slack（判定/兑换取最高/靠后灰显）"
```

---

## Task 5: WS 事件改型 + `raid:slack_rules_changed`

**Files:**
- Modify: `frontend/src/stores/raid.ts`
- Test: `frontend/src/stores/raid.spec.ts`

- [ ] **Step 1: 改 store**

`stores/raid.ts`：
- `WsEvent` 中两个既有变体 characters 改 `Character[]`：

```ts
  | { type: 'raid:signup'; user: User; created_at: string | null; characters: Character[] }
  | { type: 'raid:signup_chars_changed'; user_id: number; characters: Character[] }
```

- 新增变体：

```ts
  | { type: 'raid:slack_rules_changed'; slack_rules: SlackRuleSet }
```

- import 改（`Character` 现未导入、`SignupCharacter` 删除、加 `SlackRuleSet`）：

```ts
import type { Character, Raid, RaidSignup, SlackRuleSet, Slot, User } from '../types'
```

- `applyEvent` 加 case：

```ts
    case 'raid:slack_rules_changed':
      raid.slack_rules = ev.slack_rules
      break
```

- [ ] **Step 2: 更新既有 fixture 并新增用例**

`stores/raid.spec.ts`：
- `makeRaid` 加 `slack_rules: { criteria: [], exchange: [] }`。
- `raid:signup_chars_changed` 用例（原 104 行）的 `chars` 改为完整 Character：

```ts
    const chars = [{ id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: '鬼剑士', class_type: '输出' as const, fame: 1, simulated_damage: 2,
      sustained_dps: 3, buff_amount: null, sun_buff: null }]
```

- 新增用例：

```ts
  it('applies raid:slack_rules_changed', () => {
    setActivePinia(createPinia())
    const store = useRaidStore()
    store.raid = makeRaid()
    applyEvent(store, { type: 'raid:slack_rules_changed', slack_rules: {
      criteria: [{ class_type: '输出', metric: 'fame', value: 125000 }], exchange: [] } })
    expect(store.raid!.slack_rules.criteria[0].value).toBe(125000)
  })
```

- [ ] **Step 3: 运行确认通过**

Run: `cd frontend && npx vitest run src/stores/raid.spec.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/stores/raid.ts frontend/src/stores/raid.spec.ts
git commit -m "feat: WS 事件报名角色改完整 Character，新增 slack_rules_changed 处理"
```

---

## Task 6: `SlackRulesModal.vue`

**Files:**
- Create: `frontend/src/components/SlackRulesModal.vue`
- Create: `frontend/src/components/SlackRulesModal.spec.ts`

- [ ] **Step 1: 写失败测试**

`SlackRulesModal.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlackRulesModal from './SlackRulesModal.vue'
import type { SlackRuleSet } from '../types'

const rules: SlackRuleSet = {
  criteria: [{ class_type: '输出', metric: 'fame', value: 125000 }],
  exchange: [{ class_type: '输出', metric: 'fame', value: 130000, count: 1 }],
}

function mountModal(open: boolean, r: SlackRuleSet = rules) {
  return mount(SlackRulesModal, { props: { open, rules: r },
    global: { stubs: { teleport: true } } })
}

describe('SlackRulesModal', () => {
  it('渲染两节规则行并预填', () => {
    const w = mountModal(true)
    expect(w.text()).toContain('划水名望')
    expect(w.text()).toContain('兑换标准')
    expect(w.find('[data-field="criteria-value-0"]').element as HTMLInputElement).toHaveProperty('value', '125000')
    expect(w.find('[data-field="exchange-count-0"]').element as HTMLInputElement).toHaveProperty('value', '1')
  })
  it('职业切换后数值下拉选项变化（辅助无 fame）', async () => {
    const w = mountModal(true)
    const job = w.find('[data-field="criteria-job-0"]')
    await job.setValue('辅助')
    const opts = w.findAll('[data-field="criteria-metric-0"] option').map(o => o.element.value)
    expect(opts).toEqual(['buff_amount', 'sun_buff'])
  })
  it('添加/删除行与清空', async () => {
    const w = mountModal(true)
    await w.find('[data-act="add-criterion"]').trigger('click')
    expect(w.findAll('[data-field^="criteria-value-"]')).toHaveLength(2)
    await w.find('[data-act="clear"]').trigger('click')
    expect(w.findAll('[data-field^="criteria-value-"]')).toHaveLength(0)
  })
  it('提交 emit 当前规则', async () => {
    const w = mountModal(true)
    await w.find('[data-act="submit"]').trigger('click')
    expect(w.emitted('submit')?.[0][0]).toEqual(rules)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/SlackRulesModal.spec.ts`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现组件**

`SlackRulesModal.vue`：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import type { ClassType, SlackMetric, SlackRuleCriterion, SlackRuleExchange, SlackRuleSet } from '../types'

const props = defineProps<{ open: boolean; rules: SlackRuleSet }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'submit', rules: SlackRuleSet): void }>()

const METRICS: Record<ClassType, { value: SlackMetric; label: string }[]> = {
  '输出': [
    { value: 'fame', label: '名望' },
    { value: 'simulated_damage', label: '模拟伤害' },
    { value: 'sustained_dps', label: '秒伤' },
  ],
  '辅助': [
    { value: 'buff_amount', label: '增益量' },
    { value: 'sun_buff', label: '太阳增益量' },
  ],
}

const criteria = ref<SlackRuleCriterion[]>([])
const exchange = ref<SlackRuleExchange[]>([])

watch(() => props.open, (v) => {
  if (!v) return
  criteria.value = props.rules.criteria.map(c => ({ ...c }))
  exchange.value = props.rules.exchange.map(e => ({ ...e }))
}, { immediate: true }) // immediate：测试直接以 open:true 挂载即预填；关闭态不渲染无害

function addCriterion() { if (criteria.value.length < 20) criteria.value.push({ class_type: '输出', metric: 'fame', value: 0 }) }
function removeCriterion(i: number) { criteria.value.splice(i, 1) }
function addExchange() { if (exchange.value.length < 20) exchange.value.push({ class_type: '输出', metric: 'fame', value: 0, count: 1 }) }
function removeExchange(i: number) { exchange.value.splice(i, 1) }
function onJobChange(row: { class_type: ClassType; metric: SlackMetric }) {
  if (!METRICS[row.class_type].some(m => m.value === row.metric)) row.metric = METRICS[row.class_type][0].value
}
function clearAll() { criteria.value = []; exchange.value = [] }
function submit() {
  emit('submit', {
    criteria: criteria.value.filter(r => r.value > 0),
    exchange: exchange.value.filter(r => r.value > 0 && r.count > 0),
  })
}
</script>

<template>
  <n-modal :show="open" preset="card" title="划水规则设置" style="width:min(560px,94vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div class="slack-form">
      <div class="slack-section">
        <div class="slack-sec-head"><b>划水名望</b>
          <span class="slack-sec-hint">数值小于输入值的角色视为划水</span></div>
        <div v-for="(row, i) in criteria" :key="i" class="slack-row">
          <select v-model="row.class_type" class="dnf-input" :data-field="'criteria-job-' + i"
                  @change="onJobChange(row)">
            <option value="输出">输出</option><option value="辅助">辅助</option>
          </select>
          <select v-model="row.metric" class="dnf-input" :data-field="'criteria-metric-' + i">
            <option v-for="m in METRICS[row.class_type]" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <input v-model.number="row.value" type="number" min="0" class="dnf-input"
                 :data-field="'criteria-value-' + i" />
          <button v-if="criteria.length > 1" class="dnf-btn dnf-btn-sm" type="button"
                  :data-act="'rm-criterion-' + i" @click="removeCriterion(i)">删除</button>
        </div>
        <button v-if="criteria.length < 20" class="dnf-btn dnf-btn-sm" type="button"
                data-act="add-criterion" @click="addCriterion">＋ 添加一行</button>
      </div>
      <div class="slack-section">
        <div class="slack-sec-head"><b>兑换标准</b>
          <span class="slack-sec-hint">数值大于输入值的角色可兑换对应划水位</span></div>
        <div v-for="(row, i) in exchange" :key="i" class="slack-row">
          <select v-model="row.class_type" class="dnf-input" :data-field="'exchange-job-' + i"
                  @change="onJobChange(row)">
            <option value="输出">输出</option><option value="辅助">辅助</option>
          </select>
          <select v-model="row.metric" class="dnf-input" :data-field="'exchange-metric-' + i">
            <option v-for="m in METRICS[row.class_type]" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <input v-model.number="row.value" type="number" min="0" class="dnf-input"
                 :data-field="'exchange-value-' + i" />
          <input v-model.number="row.count" type="number" min="1" class="dnf-input"
                 :data-field="'exchange-count-' + i" style="width:72px" />
          <button v-if="exchange.length > 1" class="dnf-btn dnf-btn-sm" type="button"
                  :data-act="'rm-exchange-' + i" @click="removeExchange(i)">删除</button>
        </div>
        <button v-if="exchange.length < 20" class="dnf-btn dnf-btn-sm" type="button"
                data-act="add-exchange" @click="addExchange">＋ 添加一行</button>
      </div>
      <div class="slack-actions">
        <button class="dnf-btn" data-act="clear" @click="clearAll">清空</button>
        <button class="dnf-btn dnf-btn-primary" data-act="submit" @click="submit">提交</button>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.slack-form { display: flex; flex-direction: column; gap: 16px }
.slack-section { display: flex; flex-direction: column; gap: 8px }
.slack-sec-head { display: flex; align-items: baseline; gap: 8px }
.slack-sec-hint { font-size: 12px; color: var(--dnf-text-muted,#9aa3b2) }
.slack-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
.slack-actions { display: flex; justify-content: center; gap: 12px }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/SlackRulesModal.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/SlackRulesModal.vue frontend/src/components/SlackRulesModal.spec.ts
git commit -m "feat: 划水规则设置弹框（判定/兑换动态行 + 清空/提交）"
```

---

## Task 7: `CharacterCard` + `MemberCharactersModal` 灰显

**Files:**
- Modify: `frontend/src/components/CharacterCard.vue`
- Modify: `frontend/src/components/MemberCharactersModal.vue`
- Test: `frontend/src/components/MemberCharactersModal.spec.ts`

- [ ] **Step 1: 写失败测试（MemberCharactersModal 传 grayIds）**

`MemberCharactersModal.spec.ts` 追加：

```ts
  it('grayIds 命中的角色灰显', async () => {
    apiMock.get.mockResolvedValue({ user, characters })
    const wrapper = mount(MemberCharactersModal, {
      props: { open: true, rid: 1, user, placed: {}, grayIds: [11] },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.find('.char-pick.grayed').exists()).toBe(true)
    expect(wrapper.text()).toContain('剑魂')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/MemberCharactersModal.spec.ts`
Expected: FAIL（`.char-pick.grayed` 不存在）

- [ ] **Step 3: 实现**

`CharacterCard.vue`：
- props 加 `grayed?: boolean`。
- 根元素 class 加灰显：

```html
  <div class="char-pick" :class="{ active, readonly, grayed }" @click="!readonly && emit('click', character)">
```

- style 追加：

```css
.char-pick.grayed { opacity: .45; filter: grayscale(1); }
```

`MemberCharactersModal.vue`：
- props 加 `grayIds?: number[]`。
- 传 `CharacterCard`：

```html
      <CharacterCard v-for="c in characters" :key="c.id" :character="c"
                     :placement="placed[c.id] ?? null" :grayed="grayIds?.includes(c.id) ?? false" readonly />
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/MemberCharactersModal.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/CharacterCard.vue frontend/src/components/MemberCharactersModal.vue frontend/src/components/MemberCharactersModal.spec.ts
git commit -m "feat: 报名弹框灰显超额划水角色（CharacterCard grayed）"
```

---

## Task 8: `SlotCell` + `WaveSection` 灰显

**Files:**
- Modify: `frontend/src/components/SlotCell.vue`
- Modify: `frontend/src/components/WaveSection.vue`
- Test: `frontend/src/components/SlotCell.spec.ts`

- [ ] **Step 1: 写失败测试**

`SlotCell.spec.ts` 追加：

```ts
  it('grayed 占位格灰显', () => {
    const wrapper = mount(SlotCell, { props: { slot: occupied(1), squadIndex: 0, editable: false, pickable: false, grayed: true } })
    expect(wrapper.find('.slot-cell.grayed').exists()).toBe(true)
  })
  it('未 grayed 不加 class', () => {
    const wrapper = mount(SlotCell, { props: { slot: occupied(1), squadIndex: 0, editable: false, pickable: false } })
    expect(wrapper.find('.slot-cell.grayed').exists()).toBe(false)
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/SlotCell.spec.ts`
Expected: FAIL（`.slot-cell.grayed` 不存在）

- [ ] **Step 3: 实现**

`SlotCell.vue`：
- props 加 `grayed?: boolean`。
- 根元素 class 绑定加 `grayed`：

```html
  <div class="slot-cell" :class="[
    { occupied, pickable, empty: !occupied && !pickable, manageable, 'move-target': moveMode && !isMoving, moving: isMoving, grayed },
    `squad-${squadIndex}`,
  ]" @click="onCellClick">
```

- style 追加：

```css
.slot-cell.grayed { opacity: .45; filter: grayscale(1); }
```

`WaveSection.vue`：
- props 加 `slackCharIds?: Set<number>`。
- 传 `SlotCell`：

```html
          <SlotCell v-for="slot in g" :key="slot.id" :slot="slot" :squad-index="i"
                    :editable="editable && (isAdmin || slot.owner_id === currentUserId)"
                    :pickable="editable && slot.character_id == null && !moveMode"
                    :is-admin="isAdmin" :move-mode="moveMode" :moving="slot.id === movingSlotId"
                    :grayed="slackCharIds?.has(slot.character_id ?? -1) ?? false"
                    @pick="emit('pick', $event)" @duty="(s, d) => emit('duty', s, d)"
                    @remove="emit('remove', $event)" @manage="emit('manage', $event)"
                    @moveTo="emit('moveTo', $event)" />
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/SlotCell.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/SlotCell.vue frontend/src/components/WaveSection.vue frontend/src/components/SlotCell.spec.ts
git commit -m "feat: 攻坚表格灰显超额划水角色（SlotCell grayed）"
```

---

## Task 9: `RaidDetailView` 接线（按钮 + computed + 提交）

**Files:**
- Modify: `frontend/src/views/RaidDetailView.vue`
- Test: `frontend/src/views/RaidDetailView.spec.ts`

- [ ] **Step 1: 更新 fixture 并写失败测试**

`RaidDetailView.spec.ts`：
- imports 加 `SlackRulesModal`、`WaveSection`（已在 stubs）、`SlackRuleSet`/`Character` 类型。
- `memberChars` 改完整 Character（须含 `job_name`/`parent_name`/`fame`/数值）：

```ts
const memberChars = [
  { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂', parent_name: '鬼剑士',
    class_type: '输出' as const, fame: 52000, simulated_damage: 5, sustained_dps: 2,
    buff_amount: null, sun_buff: null },
  { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士', parent_name: '圣职者',
    class_type: '辅助' as const, fame: 40000, simulated_damage: null, sustained_dps: null,
    buff_amount: 3000, sun_buff: 500 },
]
```

- `makeRaid` 加 `slack_rules: { criteria: [], exchange: [] }`。
- stubs 加 `SlackRulesModal: true`。

追加用例：

```ts
describe('RaidDetailView slack rules', () => {
  it('仅管理员可见划水规则设置按钮', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="slack-rules"]').exists()).toBe(true)
    const { wrapper: w2 } = await mountView([adminRow, memberRow], member)
    await flushPromises()
    expect(w2.find('[data-test="slack-rules"]').exists()).toBe(false)
  })

  it('提交规则调用 PUT', async () => {
    apiMock.put.mockResolvedValue({})
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    await wrapper.find('[data-test="slack-rules"]').trigger('click')
    const modal = wrapper.findComponent(SlackRulesModal)
    const rules = { criteria: [{ class_type: '输出' as const, metric: 'fame' as const, value: 125000 }], exchange: [] }
    modal.vm.$emit('submit', rules)
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/raids/1/slack-rules', rules)
    expect(notifyMock.success).toHaveBeenCalled()
  })

  it('灰色角色 id 传递到 WaveSection', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = {
      criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }],
      exchange: [{ class_type: '输出', metric: 'fame', value: 300000, count: 1 }],
    }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    const ws = wrapper.findComponent(WaveSection)
    expect((ws.props('slackCharIds') as Set<number>).has(10)).toBe(true)  // id10 fame 52000 划水且无兑换额度
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: FAIL（按钮不存在 / `slack-rules` data-test 缺失）

- [ ] **Step 3: 实现**

`RaidDetailView.vue`：
- imports：`SlackRulesModal`、`computeSlack`、类型 `SlackRuleSet`、`Character`。
- state：`const showSlackRules = ref(false)`。
- 顶栏操作组加按钮（`修改` 按钮前）：

```html
        <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-sm" data-test="slack-rules"
                @click="showSlackRules = true">划水规则设置</button>
```

- computed：

```ts
const charsByUser = computed<Record<number, Character[]>>(() => {
  const m: Record<number, Character[]> = {}
  for (const s of store.raid?.signups ?? []) m[s.user.id] = s.characters
  return m
})
const grayByUser = computed(() => computeSlack(
  store.raid?.slack_rules ?? { criteria: [], exchange: [] }, charsByUser.value))
const grayCharIds = computed(() => new Set(Object.values(grayByUser.value).flat()))
```

- handler：

```ts
async function onSlackRulesSubmit(rules: SlackRuleSet) {
  try {
    await api.put(`/api/raids/${rid}/slack-rules`, rules)
    notifySuccess('划水规则已保存')
    showSlackRules.value = false
  } catch (e: any) { notifyError(e.message) }
}
```

- 模板尾部（`SignupModal` 附近）加：

```html
    <SlackRulesModal :open="showSlackRules" :rules="store.raid.slack_rules"
                     @close="showSlackRules = false" @submit="onSlackRulesSubmit" />
```

- `WaveSection` 传 `:slack-char-ids="grayCharIds"`。
- `MemberCharactersModal` 传 `:gray-ids="memberModalUser ? (grayByUser[memberModalUser.id] ?? []) : []"`。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RaidDetailView.spec.ts`
Expected: PASS（既有用例 + 新增用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RaidDetailView.vue frontend/src/views/RaidDetailView.spec.ts
git commit -m "feat: 攻坚详情划水规则设置入口与灰色 computed 接线"
```

---

## Task 10: fixture 全量补齐 + vue-tsc 构建

**Files:**
- Modify: `frontend/src/lib/placement.spec.ts`（及其他构造 `Raid` 字面量的 spec）
- 验证：`npm run build`

- [ ] **Step 1: 补齐 `Raid.slack_rules` fixture**

`lib/placement.spec.ts` 的 `makeRaid`（约 15-16 行）加 `slack_rules: { criteria: [], exchange: [] }`。

其他按需修复：先全局搜哪些 spec 构造完整 `Raid` 字面量并缺 `slack_rules`：

Run: `cd frontend && grep -rln "signups:" src --include=*.spec.ts`
Expected 输出：`src/views/RaidDetailView.spec.ts`、`src/stores/raid.spec.ts`、`src/lib/placement.spec.ts`（均已在本计划处理/将处理）。若有遗漏文件，给其 `Raid` 字面量补 `slack_rules: { criteria: [], exchange: [] }`。

- [ ] **Step 2: 运行前端全量单测**

Run: `cd frontend && npx vitest run`
Expected: 全 PASS

- [ ] **Step 3: vue-tsc 构建**

Run: `cd frontend && npm run build`
Expected: 构建成功（vue-tsc 类型全通过）。若报 `RaidSignup.characters`/`slack_rules` 相关类型错，逐个补 fixture 字段。

- [ ] **Step 4: 提交**

```bash
git add -A frontend/src
git commit -m "test: 补齐 Raid.slack_rules fixture，vue-tsc 构建通过"
```

---

## Task 11: CHANGELOG + 收尾

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新 CHANGELOG**

`CHANGELOG.md` 顶部 `## [Unreleased]` 段（若无则新建）加：

```markdown
## [Unreleased]

### 新增

- **攻坚划水位计算**：攻坚详情新增「划水规则设置」（仅管理员），配置两类规则——「划水名望」按 职业+数值类型+阈值 判定划水角色、「兑换标准」按数值兑换划水位置；系统按每人报名角色计算可兑换划水位，超出额度的划水角色在报名弹框与攻坚表格灰显（仅参考，不影响编队）
```

- [ ] **Step 2: 后端全量回归 + 前端全量回归**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全 PASS

Run: `cd frontend && npx vitest run && npm run build`
Expected: 全 PASS + 构建成功

- [ ] **Step 3: 提交**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 新增划水位计算"
```
