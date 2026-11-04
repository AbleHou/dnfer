# 角色伤害构成与战斗力 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为输出职业配置 6 项伤害构成数值，后端按副本面板计算并压缩为「战斗力」存储，攻坚详情与我的角色展示。

**Architecture:** 后端 `services/damage.py` 纯函数计算（buff 加 40000 三攻/220000 力智，公式乘四项，÷100 万取整），保存时在 `apply_character_payload` 计算并落库 `combat_power` 列；`CharacterIn/Out` 与 `SlotOut` 携带新字段。前端 `CharacterForm` 加 6 输入框（仅输出），`MyCharactersView` 卡片与 `SlotCell` 攻坚格展示战斗力。辅助职业后端强制清空。旧字段（模拟伤害/秒伤）与划水/编队逻辑不动。

**Tech Stack:** FastAPI + SQLAlchemy 2 + SQLite（后端）；Vue 3 + TypeScript + Vitest（前端）。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/app/services/damage.py` | 新建 | 公式纯函数 `compute_combat_power` + 常量 |
| `backend/app/models.py` | 修改 | `Character` 加 7 可空 Integer 列 |
| `backend/app/migrations.py` | 修改 | `migrate_characters_damage` 幂等 ALTER |
| `backend/app/db.py` | 修改 | `init_db()` 注册迁移 |
| `backend/app/schemas.py` | 修改 | `CharacterIn`/`CharacterOut`/`SlotOut` 加字段 |
| `backend/app/services/characters.py` | 修改 | `apply_character_payload` 输出/辅助分派 + `character_out` |
| `backend/app/routers/raids.py` | 修改 | `_slot_out` 加 `combat_power` |
| `backend/tests/test_damage.py` | 新建 | 公式单测 + API 往返/转辅助/bot 不清空 |
| `backend/tests/test_migrations.py` | 修改 | `migrate_characters_damage` 幂等测试 |
| `frontend/src/types.ts` | 修改 | `Character` +7 字段、`Slot` +1 字段 |
| 前端各 spec fixture | 修改 | 补新字段（build 驱动） |
| `frontend/src/components/CharacterForm.vue` | 修改 | 6 输入框（仅输出）+ watch 清空 |
| `frontend/src/views/MyCharactersView.vue` | 修改 | 卡片展示战斗力 |
| `frontend/src/components/SlotCell.vue` | 修改 | 攻坚格展示战斗力 |
| `frontend/src/components/CharacterForm.spec.ts` | 修改 | 6 输入显隐/保存/切辅助清空 |
| `frontend/src/views/MyCharactersView.spec.ts` | 修改 | 战斗力展示 |
| `frontend/src/components/SlotCell.spec.ts` | 修改 | 战斗力展示 |
| `CHANGELOG.md` | 修改 | Unreleased 新增一条 |

---

## Task 1: 公式纯函数 + 单测

**Files:**
- Create: `backend/app/services/damage.py`
- Test: `backend/tests/test_damage.py`

- [ ] **Step 1: Write the failing unit tests**

```python
# backend/tests/test_damage.py
from app.services.damage import compute_combat_power

def test_compute_applies_buffs_and_percent():
    # 三攻=10000 力智=5000 属强=300 攻强=100(100%) 攻强增幅=20(20%) 技攻=50(50%)
    # 副本: 三攻=50000 力智=225000 → 50000*901*2.4*2.2*1.5 / 1e6 = 357
    assert compute_combat_power(10000, 5000, 300, 100, 20, 50) == 357

def test_compute_zero_own_stats_only_buffs():
    # 三攻=40000 力智=220000 → 40000*881*1.05 / 1e6 = 37
    assert compute_combat_power(0, 0, 0, 0, 0, 0) == 37

def test_compute_any_none_returns_none():
    assert compute_combat_power(None, 5000, 300, 100, 20, 50) is None
    assert compute_combat_power(10000, None, 300, 100, 20, 50) is None
    assert compute_combat_power(10000, 5000, 300, 100, None, 50) is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_damage.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.damage'`

- [ ] **Step 3: Implement `damage.py`**

```python
# backend/app/services/damage.py
DUNGEON_ATK_BASE_BONUS = 40_000
DUNGEON_STR_INT_BONUS = 220_000
COMBAT_POWER_SCALE = 1_000_000


def compute_combat_power(atk_base, str_int, elemental, atk_power, atk_power_amp, skill_atk) -> int | None:
    if any(v is None for v in (atk_base, str_int, elemental, atk_power, atk_power_amp, skill_atk)):
        return None
    atk = atk_base + DUNGEON_ATK_BASE_BONUS
    si = str_int + DUNGEON_STR_INT_BONUS
    raw = (atk * (1 + si * 0.004)
           * (1.05 + elemental * 0.0045)
           * (1 + (atk_power / 100) * (1 + atk_power_amp / 100))
           * (1 + skill_atk / 100))
    return round(raw / COMBAT_POWER_SCALE)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_damage.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/damage.py backend/tests/test_damage.py
git commit -m "$(cat <<'EOF'
[fet] 伤害构成公式纯函数 compute_combat_power

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 数据模型列 + 迁移注册

**Files:**
- Modify: `backend/app/models.py` (`Character` 类，`sun_buff` 之后)
- Modify: `backend/app/migrations.py`（末尾加函数）
- Modify: `backend/app/db.py:35-47`（`init_db` 注册）
- Test: `backend/tests/test_migrations.py`

- [ ] **Step 1: Write failing migration idempotency test**

```python
# backend/tests/test_migrations.py 末尾追加
def test_migrate_characters_damage_adds_columns():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE characters (
            id INTEGER PRIMARY KEY, user_id INTEGER, name VARCHAR(64),
            job_name VARCHAR(64), class_type VARCHAR(8), fame INTEGER,
            simulated_damage INTEGER, sustained_dps INTEGER, buff_amount INTEGER,
            sun_buff INTEGER)"""))
    from app.migrations import migrate_characters_damage
    migrate_characters_damage(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(characters)")).all()}
        for col in ("atk_base", "str_int", "elemental", "atk_power",
                    "atk_power_amp", "skill_atk", "combat_power"):
            assert col in cols
    migrate_characters_damage(engine)  # 幂等：再次运行不报错
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py::test_migrate_characters_damage_adds_columns -v`
Expected: FAIL with `ImportError: cannot import name 'migrate_characters_damage'`

- [ ] **Step 3: Add model columns**

```python
# backend/app/models.py Character 类，sun_buff 之后插入
    atk_base: Mapped[int | None] = mapped_column(Integer, nullable=True)      # 三攻
    str_int: Mapped[int | None] = mapped_column(Integer, nullable=True)       # 力智
    elemental: Mapped[int | None] = mapped_column(Integer, nullable=True)     # 属强
    atk_power: Mapped[int | None] = mapped_column(Integer, nullable=True)     # 攻强(%)
    atk_power_amp: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 攻强增幅(%)
    skill_atk: Mapped[int | None] = mapped_column(Integer, nullable=True)     # 技攻(%)
    combat_power: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 战斗力
```

- [ ] **Step 4: Add migration**

```python
# backend/app/migrations.py 末尾追加
def migrate_characters_damage(engine: Engine) -> None:
    """为存量库补建角色伤害构成列（三攻/力智/属强/攻强/攻强增幅/技攻/战斗力，幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(characters)")).all()}
        for col in ("atk_base", "str_int", "elemental", "atk_power",
                    "atk_power_amp", "skill_atk", "combat_power"):
            if col not in cols:
                conn.execute(text(f"ALTER TABLE characters ADD COLUMN {col} INTEGER"))
```

- [ ] **Step 5: Register in `db.py` `init_db()`**

```python
# backend/app/db.py:35-38 import 列表加 migrate_characters_damage
# 并在调用链末尾（migrate_raid_close 之后）追加 migrate_characters_damage(engine)
```

- [ ] **Step 6: Run migration test**

Run: `cd backend && .venv/bin/python -m pytest tests/test_migrations.py -v`
Expected: 全部通过（含新增用例，幂等不报错）

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/app/migrations.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "$(cat <<'EOF'
[fet] 角色伤害构成 7 列 + 幂等迁移并注册

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Schema 字段

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: Add fields to `CharacterIn`**（`adventure_party_id` 之后）

```python
    atk_base: int | None = Field(default=None, ge=0)
    str_int: int | None = Field(default=None, ge=0)
    elemental: int | None = Field(default=None, ge=0)
    atk_power: int | None = Field(default=None, ge=0)
    atk_power_amp: int | None = Field(default=None, ge=0)
    skill_atk: int | None = Field(default=None, ge=0)
```

- [ ] **Step 2: Add fields to `CharacterOut`**（`adventure_party_name` 之后）

```python
    atk_base: int | None = None
    str_int: int | None = None
    elemental: int | None = None
    atk_power: int | None = None
    atk_power_amp: int | None = None
    skill_atk: int | None = None
    combat_power: int | None = None
```

- [ ] **Step 3: Add field to `SlotOut`**（`adventure_party_name` 之后）

```python
    combat_power: int | None = None
```

- [ ] **Step 4: Sanity — existing backend tests still pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_members.py tests/test_bot_characters.py -v`
Expected: 全部通过（新字段带默认值，不破坏既有断言）

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py
git commit -m "$(cat <<'EOF'
[fet] Character/Slot schema 补伤害构成与战斗力字段

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Service 分派 + 序列化 + API 测试

**Files:**
- Modify: `backend/app/services/characters.py`
- Modify: `backend/app/routers/raids.py`（`_slot_out`）
- Test: `backend/tests/test_damage.py`（追加 API 用例）

- [ ] **Step 1: Write failing API tests**

```python
# backend/tests/test_damage.py 末尾追加
from .helpers import register_user

def test_character_damage_save_roundtrip(client):
    h, _ = register_user(client, "dmg1", "阿伟")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 20000,
        "simulated_damage": 680000, "sustained_dps": 420000,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50})
    assert r.status_code == 200
    body = r.json()
    assert body["combat_power"] == 357
    assert body["atk_base"] == 10000
    assert body["skill_atk"] == 50
    # 编辑清空某输入 → combat_power 变 None
    cid = body["id"]
    r2 = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 20000,
        "simulated_damage": 680000, "sustained_dps": 420000,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": None, "skill_atk": 50})
    assert r2.status_code == 200
    assert r2.json()["combat_power"] is None

def test_output_to_support_clears_damage_fields(client):
    h, _ = register_user(client, "dmg2", "转职")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50}).json()["id"]
    r = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂", "job_name": "crusader_male", "fame": 1, "buff_amount": 9000})
    assert r.status_code == 200
    body = r.json()
    assert body["class_type"] == "辅助"
    assert body["combat_power"] is None
    assert body["atk_base"] is None and body["skill_atk"] is None

def test_support_character_ignores_damage_fields(client):
    h, _ = register_user(client, "dmg3", "奶")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "小魔女", "job_name": "enchantress", "fame": 1,
        "buff_amount": 9000, "atk_base": 10000, "skill_atk": 50})
    body = r.json()
    assert body["class_type"] == "辅助"
    assert body["combat_power"] is None and body["atk_base"] is None

def test_bot_update_keeps_damage_fields(client):
    h, _ = register_user(client, "dmg4", "阿伟")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50}).json()["id"]
    # bot 按账号更新同名角色（部分字段），不带伤害字段 → 不清空
    # /api/public/* 需要 bot API token（conftest 种入 change-me-bot-token）
    bot_h = {"Authorization": "Bearer change-me-bot-token"}
    r = client.post("/api/public/characters", headers=bot_h, json={
        "account": "dmg4", "characters": [{"name": "剑魂", "fame": 2000}]})
    assert r.status_code == 200
    assert r.json()["results"][0]["ok"] is True
    got = client.get("/api/me/characters", headers=h).json()[0]
    assert got["combat_power"] == 357
    assert got["atk_base"] == 10000

def test_slot_out_carries_combat_power(client):
    from .helpers import make_dungeon, make_raid, signup
    h, _ = register_user(client, "dmg5", "阿伟")
    ah = {"Authorization": f"Bearer {client.post('/api/auth/login', json={'username':'admin','password':'admin123'}).json()['token']}"}
    d = make_dungeon(client, ah)["id"]
    rid = make_raid(client, ah, dungeon_id=d)["id"]
    # 先建角色再 signup：signup 默认勾选全部角色，角色为空会 400「至少选择一个角色」
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50}).json()["id"]
    signup(client, rid, h)
    slot_id = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]["id"]
    r = client.post(f"/api/raids/{rid}/slots/{slot_id}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 200
    slot = r.json()["slot"]
    assert slot["combat_power"] == 357

def test_guest_create_character_computes_combat_power(client):
    ah = {"Authorization": f"Bearer {client.post('/api/auth/login', json={'username':'admin','password':'admin123'}).json()['token']}"}
    r = client.post("/api/admin/users", headers=ah, json={
        "nickname": "临时", "characters": [{
            "name": "剑魂", "job_name": "weapon_master", "fame": 1,
            "atk_base": 10000, "str_int": 5000, "elemental": 300,
            "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50}]})
    assert r.status_code == 200
    chars = r.json()["characters"]
    assert chars[0]["combat_power"] == 357
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_damage.py -v`
Expected: 新 API 用例 FAIL（`combat_power` 不在返回 / KeyError / 断言失败），公式用例仍过

- [ ] **Step 3: Update `apply_character_payload` + `character_out`**

```python
# backend/app/services/characters.py
from .damage import compute_combat_power

def character_out(c: Character) -> CharacterOut:
    meta = job_data.job_meta(c.job_name) or {"title": "", "parent_name": ""}
    party = c.adventure_party
    return CharacterOut(id=c.id, name=c.name, job_name=c.job_name,
                        job_title=meta["title"], parent_name=meta["parent_name"],
                        class_type=c.class_type, fame=c.fame,
                        simulated_damage=c.simulated_damage,
                        sustained_dps=c.sustained_dps, buff_amount=c.buff_amount,
                        sun_buff=c.sun_buff,
                        atk_base=c.atk_base, str_int=c.str_int, elemental=c.elemental,
                        atk_power=c.atk_power, atk_power_amp=c.atk_power_amp,
                        skill_atk=c.skill_atk, combat_power=c.combat_power,
                        adventure_party_id=c.adventure_party_id,
                        adventure_party_name=party.name if party else None)

def apply_character_payload(c: Character, body: CharacterIn) -> None:
    c.name = body.name
    c.job_name = body.job_name
    c.class_type = job_data.class_type_for(body.job_name)
    c.fame = body.fame
    c.simulated_damage = body.simulated_damage
    c.sustained_dps = body.sustained_dps
    c.buff_amount = body.buff_amount
    c.sun_buff = body.sun_buff
    if c.class_type == "输出":
        c.atk_base = body.atk_base
        c.str_int = body.str_int
        c.elemental = body.elemental
        c.atk_power = body.atk_power
        c.atk_power_amp = body.atk_power_amp
        c.skill_atk = body.skill_atk
        c.combat_power = compute_combat_power(body.atk_base, body.str_int, body.elemental,
                                              body.atk_power, body.atk_power_amp, body.skill_atk)
    else:
        c.atk_base = None
        c.str_int = None
        c.elemental = None
        c.atk_power = None
        c.atk_power_amp = None
        c.skill_atk = None
        c.combat_power = None
```

- [ ] **Step 4: Update `_slot_out`**

```python
# backend/app/routers/raids.py _slot_out
        adventure_party_id=c.adventure_party_id if c else None,
        adventure_party_name=party.name if party else None,
        combat_power=c.combat_power if c else None)
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_damage.py tests/test_members.py tests/test_bot_characters.py -v`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/characters.py backend/app/routers/raids.py backend/tests/test_damage.py
git commit -m "$(cat <<'EOF'
[fet] 战斗力计算落库：输出/辅助分派、序列化携带、API 测试

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 前端类型 + fixture 补齐（build 驱动）

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: 所有 vue-tsc 报错的 spec/源文件 fixture

- [ ] **Step 1: Update `types.ts`**

```ts
// Character 接口末尾（adventure_party_name 之后）加：
  atk_base: number | null; str_int: number | null; elemental: number | null;
  atk_power: number | null; atk_power_amp: number | null; skill_atk: number | null;
  combat_power: number | null;

// Slot 接口末尾（adventure_party_name 之后）加：
  combat_power: number | null;
```

- [ ] **Step 2: Run build to find all fixture errors**

Run: `cd frontend && npm run build`
Expected: FAIL —— 一系列「缺少必填字段」的 vue-tsc 错误，逐个列出缺 `combat_power`/`atk_base` 等字面量

- [ ] **Step 3: Fix every reported fixture**（给每个 `Character` 字面量补 7 字段、每个 `Slot` 字面量补 `combat_power`，值填 `null` 或示例值）

Likely files（以 build 输出为准）：
- `src/components/CharacterForm.spec.ts`（`editing` 字面量 ×2）
- `src/components/SlotCell.spec.ts`（`occupied()`/`empty()`）
- `src/components/RosterSlot.spec.ts`、`RosterGrid.spec.ts`、`RosterPool.spec.ts`、`SlotActionModal.spec.ts`、`MemberCharactersModal.spec.ts`、`CharacterPickerModal.spec.ts`
- `src/views/RaidDetailView.spec.ts`、`RaidListView.spec.ts`、`RosterView.spec.ts`、`AdminUsersView.spec.ts`、`MyCharactersView.spec.ts`
- `src/stores/raid.spec.ts`、`src/composables/useSlotMove.spec.ts`
- `src/lib/roster.spec.ts`、`slack.spec.ts`、`placement.spec.ts`、`damage.spec.ts`

规则：**只补字段，不改既有断言与逻辑**；`combat_power` 加进 `Slot` 字面量即可，不用触发任何新行为。

- [ ] **Step 4: Run build to verify pass**

Run: `cd frontend && npm run build`
Expected: PASS（vue-tsc + vite build 无错）

- [ ] **Step 5: Run full frontend test suite (should still pass)**

Run: `cd frontend && npx vitest run`
Expected: 全部通过（现有断言不变，新字段只是类型层）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src
git commit -m "$(cat <<'EOF'
[fet] 前端类型补伤害构成/战斗力字段并修全部 fixture

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CharacterForm 6 输入框 + watch 清空

**Files:**
- Modify: `frontend/src/components/CharacterForm.vue`
- Test: `frontend/src/components/CharacterForm.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
// CharacterForm.spec.ts 末尾追加
it('输出职业显示 6 个伤害构成输入框并提交', async () => {
  apiMock.post.mockResolvedValue({})
  const wrapper = mount(CharacterForm, { props: { categories, editing: null } })
  await wrapper.find('[data-cat="swordman_male"]').trigger('click')
  await wrapper.find('[data-job="weapon_master"]').trigger('click')
  for (const id of ['#char-atk-base', '#char-str-int', '#char-elemental',
                    '#char-atk-power', '#char-atk-power-amp', '#char-skill-atk']) {
    expect(wrapper.find(id).exists()).toBe(true)
  }
  await wrapper.find('#char-name').setValue('剑魂')
  await wrapper.find('#char-fame').setValue(100)
  await wrapper.find('#char-atk-base').setValue(10000)
  await wrapper.find('#char-str-int').setValue(5000)
  await wrapper.find('#char-elemental').setValue(300)
  await wrapper.find('#char-atk-power').setValue(100)
  await wrapper.find('#char-atk-power-amp').setValue(20)
  await wrapper.find('#char-skill-atk').setValue(50)
  await wrapper.find('[data-act="save"]').trigger('click')
  await flushPromises()
  expect(apiMock.post).toHaveBeenCalledWith('/api/me/characters',
    expect.objectContaining({ atk_base: 10000, str_int: 5000, elemental: 300,
      atk_power: 100, atk_power_amp: 20, skill_atk: 50 }))
})

it('输出切辅助清空 6 个伤害构成字段', async () => {
  apiMock.post.mockResolvedValue({})
  const both = [...categories,
    { id: 8, name: 'priest_male', title: '圣职者(男)', children: [
      { id: 0, name: 'crusader_male', title: '神启·圣骑士', class_type: '辅助' as const }] }]
  const wrapper = mount(CharacterForm, { props: { categories: both, editing: null } })
  await wrapper.find('#char-name').setValue('奶')
  await wrapper.find('[data-cat="swordman_male"]').trigger('click')
  await wrapper.find('[data-job="weapon_master"]').trigger('click')
  await wrapper.find('#char-atk-base').setValue(10000)
  await wrapper.find('[data-cat="priest_male"]').trigger('click')
  await wrapper.find('[data-job="crusader_male"]').trigger('click')
  await wrapper.find('#char-sun-buff').setValue(3000)
  await wrapper.find('[data-act="save"]').trigger('click')
  await flushPromises()
  expect(apiMock.post).toHaveBeenCalledWith('/api/me/characters',
    expect.objectContaining({ atk_base: null, str_int: null, elemental: null,
      atk_power: null, atk_power_amp: null, skill_atk: null }))
})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/components/CharacterForm.spec.ts`
Expected: 两个新用例 FAIL（找不到 `#char-atk-base` / payload 缺字段）

- [ ] **Step 3: Implement form fields**

`script` 内：
```ts
const form = ref({ ..., atk_base: props.editing?.atk_base ?? null as number | null,
  str_int: props.editing?.str_int ?? null as number | null,
  elemental: props.editing?.elemental ?? null as number | null,
  atk_power: props.editing?.atk_power ?? null as number | null,
  atk_power_amp: props.editing?.atk_power_amp ?? null as number | null,
  skill_atk: props.editing?.skill_atk ?? null as number | null })

watch(selectedJob, (j) => {
  if (j?.class_type === '输出') { form.value.buff_amount = null; form.value.sun_buff = null }
  else if (j?.class_type === '辅助') {
    form.value.simulated_damage = null; form.value.sustained_dps = null
    form.value.atk_base = null; form.value.str_int = null; form.value.elemental = null
    form.value.atk_power = null; form.value.atk_power_amp = null; form.value.skill_atk = null
  }
})

async function save() {
  ...
  const payload = { ..., atk_base: form.value.atk_base, str_int: form.value.str_int,
    elemental: form.value.elemental, atk_power: form.value.atk_power,
    atk_power_amp: form.value.atk_power_amp, skill_atk: form.value.skill_atk }
  ...
}
```

`template` 内（`!isSupport` 块，`char-dps` 之后追加）：
```html
<div style="display:flex;align-items:center;gap:8px;margin:8px 0">
  <label for="char-atk-base" class="form-label">三攻：</label>
  <DnfInput id="char-atk-base" :model-value="form.atk_base?.toString() ?? ''"
            @update:model-value="v => form.atk_base = v ? Number(v) : null"
            type="number" style="flex:1" />
</div>
<div style="display:flex;align-items:center;gap:8px;margin:8px 0">
  <label for="char-str-int" class="form-label">力智：</label>
  <DnfInput id="char-str-int" :model-value="form.str_int?.toString() ?? ''"
            @update:model-value="v => form.str_int = v ? Number(v) : null"
            type="number" style="flex:1" />
</div>
<div style="display:flex;align-items:center;gap:8px;margin:8px 0">
  <label for="char-elemental" class="form-label">属强：</label>
  <DnfInput id="char-elemental" :model-value="form.elemental?.toString() ?? ''"
            @update:model-value="v => form.elemental = v ? Number(v) : null"
            type="number" style="flex:1" />
</div>
<div style="display:flex;align-items:center;gap:8px;margin:8px 0">
  <label for="char-atk-power" class="form-label">攻强（%）：</label>
  <DnfInput id="char-atk-power" :model-value="form.atk_power?.toString() ?? ''"
            @update:model-value="v => form.atk_power = v ? Number(v) : null"
            type="number" style="flex:1" />
</div>
<div style="display:flex;align-items:center;gap:8px;margin:8px 0">
  <label for="char-atk-power-amp" class="form-label">攻强增幅（%）：</label>
  <DnfInput id="char-atk-power-amp" :model-value="form.atk_power_amp?.toString() ?? ''"
            @update:model-value="v => form.atk_power_amp = v ? Number(v) : null"
            type="number" style="flex:1" />
</div>
<div style="display:flex;align-items:center;gap:8px;margin:8px 0">
  <label for="char-skill-atk" class="form-label">技攻（%）：</label>
  <DnfInput id="char-skill-atk" :model-value="form.skill_atk?.toString() ?? ''"
            @update:model-value="v => form.skill_atk = v ? Number(v) : null"
            type="number" style="flex:1" />
</div>
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/components/CharacterForm.spec.ts`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CharacterForm.vue frontend/src/components/CharacterForm.spec.ts
git commit -m "$(cat <<'EOF'
[fet] 角色表单：输出职业 6 项伤害构成输入，切辅助清空

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 我的角色卡片展示战斗力

**Files:**
- Modify: `frontend/src/views/MyCharactersView.vue`
- Test: `frontend/src/views/MyCharactersView.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
// MyCharactersView.spec.ts 末尾追加
it('输出角色卡片展示战斗力（千分位），辅助不显示', async () => {
  const out = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 20000,
    simulated_damage: 680000, sustained_dps: 60000, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: 10000, str_int: 5000, elemental: 300, atk_power: 100, atk_power_amp: 20,
    skill_atk: 50, combat_power: 250271 }
  const sup = { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 200,
    simulated_damage: null, sustained_dps: null, buff_amount: 9000, sun_buff: 3000,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null }
  apiMock.get.mockResolvedValueOnce([out, sup])
  const wrapper = mount(MyCharactersView)
  await flushPromises()
  expect(wrapper.text()).toContain('名望 20000 · 战斗力 250,271')
  expect(wrapper.text()).not.toContain('战斗力 暂无')   // 辅助卡无战斗力
  expect(wrapper.text()).toContain('名望 200')          // 辅助卡正常
})

it('输出角色战斗力为空显示暂无', async () => {
  const out = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 100,
    simulated_damage: 680000, sustained_dps: 60000, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
    skill_atk: null, combat_power: null }
  apiMock.get.mockResolvedValueOnce([out])
  const wrapper = mount(MyCharactersView)
  await flushPromises()
  expect(wrapper.text()).toContain('名望 100 · 战斗力 暂无')
})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/views/MyCharactersView.spec.ts`
Expected: 两个新用例 FAIL（`不包含 战斗力`）

- [ ] **Step 3: Implement**

`script` 内加：
```ts
function fmtPower(n: number | null): string { return n == null ? '暂无' : n.toLocaleString('en-US') }
```

`template` 第一行副标题（`c.class_type` 之后、冒险团之前）：
```html
<span style="color:var(--dnf-text-muted);font-size:12px">{{ jobGenderTitle(c.job_name, c.job_title) }} · {{ c.class_type }} · 名望 {{ c.fame }}<template v-if="c.class_type === '输出'"> · 战斗力 {{ fmtPower(c.combat_power) }}</template><template v-if="c.adventure_party_name"> · {{ c.adventure_party_name }}</template></span>
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/views/MyCharactersView.spec.ts`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/MyCharactersView.vue frontend/src/views/MyCharactersView.spec.ts
git commit -m "$(cat <<'EOF'
[fet] 我的角色卡：输出角色展示战斗力（千分位）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 攻坚详情格展示战斗力

**Files:**
- Modify: `frontend/src/components/SlotCell.vue`
- Test: `frontend/src/components/SlotCell.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// SlotCell.spec.ts 末尾追加
it('输出占位格在名望后显示战斗力', () => {
  const s: Slot = { ...occupied(1), combat_power: 250271 }
  const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: false, pickable: false } })
  expect(wrapper.text()).toContain('1 · 战斗力 250,271 · 模拟 2亿 · 秒伤 3亿')
})

it('辅助占位格不显示战斗力', () => {
  const s: Slot = { ...occupied(1), character_class: '辅助', job_name: 'crusader_male',
    job_title: '神启·圣骑士', buff_amount: 9000, sun_buff: 3000, combat_power: null }
  const wrapper = mount(SlotCell, { props: { slot: s, squadIndex: 0, editable: false, pickable: false } })
  expect(wrapper.text()).toContain('1 · 增益 9000 · 太阳 3000')
  expect(wrapper.text()).not.toContain('战斗力')
})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/components/SlotCell.spec.ts`
Expected: 新用例 FAIL（不含 `战斗力`）

- [ ] **Step 3: Implement**

`script` 内 `fameRest` 输出分支与 `fmtPower`：
```ts
function fmtPower(n: number | null): string { return n == null ? '暂无' : n.toLocaleString('en-US') }
const fameRest = computed(() => {
  const s = props.slot
  if (s.character_class === '输出') return ` · 战斗力 ${fmtPower(s.combat_power)} · 模拟 ${fmtDps(s.simulated_damage)} · 秒伤 ${fmtDps(s.sustained_dps)}`
  if (s.character_class === '辅助') return ` · 增益 ${fmtBuff(s.buff_amount)} · 太阳 ${fmtBuff(s.sun_buff)}`
  return ''
})
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/components/SlotCell.spec.ts`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SlotCell.vue frontend/src/components/SlotCell.spec.ts
git commit -m "$(cat <<'EOF'
[fet] 攻坚详情格：输出占位展示战斗力

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: CHANGELOG + 全量回归

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update CHANGELOG**

`## [Unreleased]` 的「变更」下追加一条：
```md
- **角色伤害构成与战斗力**：输出职业可在「我的角色」配置 三攻/力智/属强/攻强/攻强增幅/技攻，后端按副本面板（加 40000 三攻、220000 力智）计算伤害构成并 ÷100 万压缩为「战斗力」存储；攻坚详情与我的角色卡片在名望旁展示战斗力（千分位整数）。旧的模拟伤害/秒伤字段保留，划水规则/编队暂不涉及战斗力。
```

- [ ] **Step 2: Backend full test**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部通过

- [ ] **Step 3: Frontend full test + build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: 全部通过、build 无错

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
[docs] CHANGELOG Unreleased 记录角色伤害构成与战斗力

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## 验证命令速查

- 后端单文件：`cd backend && .venv/bin/python -m pytest tests/<file> -v`
- 后端全量：`cd backend && .venv/bin/python -m pytest -v`
- 前端单文件：`cd frontend && npx vitest run <path>`
- 前端全量：`cd frontend && npx vitest run`
- 前端类型+构建：`cd frontend && npm run build`
