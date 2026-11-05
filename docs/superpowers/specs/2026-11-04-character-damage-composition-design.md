# 角色伤害构成与战斗力 — 设计规格

日期：2026-11-04
状态：已确认
需求来源：用户口述——为「我的角色」模块中的输出职业配置伤害构成数值，按副本面板计算伤害构成作为「战斗力」存储，并在攻坚详情与我的角色中展示。

已确认的决策：
- **目标**：输出角色配置 6 项数值（三攻/力智/属强/攻强/攻强增幅/技攻），后端按副本面板计算伤害构成并压缩为「战斗力」存储。
- **战斗力语义**：**副本实际伤害**（进入副本后加辅助 buff 面板下的伤害），非装备含金量。
- **公式**：`伤害构成 = 副本三攻 × (1 + 副本力智×0.4%) × (1.05 + 属强×0.45%) × [1 + 攻强×(1+攻强增幅)] × (1 + 技攻)`，其中 副本三攻 = 三攻+40000、副本力智 = 力智+220000；攻强/攻强增幅/技攻 三个百分数项由系统拼 `%`（输入 155 = 155%）。
- **压缩**：`战斗力 = round(伤害构成 / 1_000_000_000_000)`，展示为百万级千分位整数（数值膨胀修正，见 §2）。线性缩放无损相对准确性（比例/排序保留）。
- **与旧字段关系**：`simulated_damage`/`sustained_dps` 等旧字段**保留**（兼容 + 用户习惯），划水规则/编队达标**暂不适配**战斗力。新 6 项输入 + 战斗力本身一并入库。
- **展示范围**：仅攻坚详情格（SlotCell）与我的角色卡额外展示战斗力（与名望并列）；卡片不展示公式输入值（只出现在编辑表单）。
- **不做实时预览**（避免前端重复公式、双源维护）。
- **辅助职业不参与**公式，**后端按职业类型强制拦截**（辅助角色的 6 项输入与战斗力一律清空为 NULL，防输出转辅助后残留战力）；bot 更新角色不清空伤害配置。

## 1. 背景与现状

`Character` 模型（`backend/app/models.py:35-50`）现有数值字段 `fame`/`simulated_damage`/`sustained_dps`/`buff_amount`/`sun_buff` 均为手动填写（或 bot 写入）的裸数值。输出角色当前的伤害展示是「模拟伤害/秒伤」（`fmtDps` 拼 `亿`）。

本次为输出角色新增「伤害构成」体系：6 项输入 + 公式计算 + 压缩「战斗力」。它是**额外的数值指标**，与旧字段共存。

计算公式推导（用户原始公式）：
- `伤害构成 = 三攻*(1+力智*0.4%)*(1.05+属强*0.45%)*[1+攻强*(1+攻强增幅)]*(1+技攻)`
- 辅助职业进本会大幅提升三攻/力智 → 以进本为准，计算时加 `40000 三攻`、`220000 力智`。
- `攻强` `攻强增幅` `技攻` 系统拼 `%`：输入 155 即 155%，换算为 1.55。

已验证的数学结论：
- **压缩无损**：除以常数是纯缩放，角色 A 伤害 2 倍于 B，压缩后战斗力仍恰好 2 倍，排序与比例全保留。
- **加 buff 稀释自身属性**（用户已接受为合理）：`1+力智×0.4%` 在力智 22.5 万时系数约 901，玩家自身力智 5000→6000 的差距被稀释到 0.44%。因战斗力代表「副本实际伤害」，此稀释符合真实——伤害本就主要被辅助提供的基础面板主导。

## 2. 公式与压缩（服务端唯一实现）

`backend/app/services/damage.py` 纯函数（常数集中定义）：

```python
DUNGEON_ATK_BASE_BONUS = 40_000   # 副本三攻加成
DUNGEON_STR_INT_BONUS   = 220_000  # 副本力智加成
COMBAT_POWER_SCALE      = 1_000_000_000_000  # 战斗力压缩常数（÷1e12 → 百万级；数值膨胀修正）

def compute_combat_power(atk_base, str_int, elemental, atk_power, atk_power_amp, skill_atk) -> int | None:
    # 6 项任一为 None → None（未配置，不计算）
    if any(v is None for v in (...)):
        return None
    atk = atk_base + DUNGEON_ATK_BASE_BONUS
    si  = str_int + DUNGEON_STR_INT_BONUS
    raw = atk * (1 + si * 0.004) \
            * (1.05 + elemental * 0.0045) \
            * (1 + (atk_power / 100) * (1 + atk_power_amp / 100)) \
            * (1 + skill_atk / 100)
    return round(raw / COMBAT_POWER_SCALE)
```

- `atk_power`/`atk_power_amp`/`skill_atk` 存**百分数（可带小数）**（155 = 155%），公式内 `/100` 换算。
- 返回值 int 或 None。取整用 Python 内置 `round()`（**半偶舍入** round-half-even，非半进位）；在 ÷1e12 尺度下 .5 边界实际几乎不可能出现，单测断言用非 .5 边界值即可。
- **压缩修正（2026-11-05）**：实际游戏数值膨胀（技攻可达数亿），原 ÷1e6 后仍为万亿级，故总压缩改为 ÷1e12（百万级）。

## 3. 数据模型与迁移

`characters` 新增 **7 个可空列**（`atk_base`/`str_int`/`elemental`/`combat_power` 为 Integer；`atk_power`/`atk_power_amp`/`skill_atk` 为 Float 以支持小数）：

| 列 | 类型 | 含义 | 输入 |
|---|---|---|---|
| `atk_base` | Integer | 三攻 | 裸值 |
| `str_int` | Integer | 力智 | 裸值 |
| `elemental` | Integer | 属强 | 裸值 |
| `atk_power` | Float | 攻强 | 百分数（可带小数，如 72724.5） |
| `atk_power_amp` | Float | 攻强增幅 | 百分数（可带小数，如 155.4） |
| `skill_atk` | Float | 技攻 | 百分数（可带小数，如 583751168.0） |
| `combat_power` | Integer | 战斗力（压缩后整数） | 后端计算 |

迁移 `migrate_characters_damage`（`backend/app/migrations.py`）：幂等 `ALTER TABLE characters ADD COLUMN ... INTEGER/FLOAT` × 7，对齐 `migrate_characters_sun_buff` 模式（`PRAGMA table_info` 检查缺列才加）。SQLite 整数亲和列亦可存浮点，存量库已建的 INTEGER 列无需重建。新库 `create_all` 自动建表。**须同时注册进 `db.py` 的 `init_db()`**（`backend/app/db.py:35-38` 的 import + 调用列表，末尾追加 `migrate_characters_damage(engine)`）。

## 4. 后端逻辑

### 4.1 Schema（`backend/app/schemas.py`）
- `CharacterIn` 加 6 个可选字段：`atk_base: int | None = None`（`ge=0`）等。
- `CharacterOut` 加 6 输入字段 + `combat_power: int | None = None`。
- `SlotOut` 加 `combat_power: int | None = None`（攻坚详情格展示用）。

### 4.2 Service（`backend/app/services/characters.py`）
- `apply_character_payload(c, body)` 按 `job_data.class_type_for(body.job_name)` 分派：
  - **输出**：写 6 输入字段 + `c.combat_power = compute_combat_power(...)`。
  - **辅助**：6 输入字段与 `combat_power` 一律置 None（**后端强制拦截**，防输出转辅助后残留战力）。
  - **仅被 `CharacterIn` 调用**（成员 CRUD `members.py`、admin 角色 CRUD `admin.py`、guest 创建 `admin.py:81`），三者都会带上新字段 → 全部路径一致重算。
  - bot 更新走独立的 `_apply_partial`（`bot.py:44-59`，仅非 None 字段部分更新），`BotCharacterIn` 无新字段 → **不清空伤害配置**，combat_power 原样保留。bot 创建角色新字段默认 None。**已知局限（接受）**：bot 将输出职业切辅助时不会清空 combat_power（`_apply_partial` 不重算），留存的战斗力在辅助角色上不被展示，不构成 UI 问题。
- `character_out(c)` 补 6 输入字段 + `combat_power`。

### 4.3 序列化（`backend/app/routers/raids.py`）
- `_slot_out`（唯一 Slot 序列化点，`raids.py:47`）补 `combat_power=c.combat_power if c else None` → 攻坚详情波格/编队占位/fill 响应/WS 广播自动携带。

## 5. 前端

### 5.1 类型（`frontend/src/types.ts`）
- `Character` 加 6 字段 + `combat_power`（均为 `number | null`）；`Slot` 加 `combat_power`。
- **连带修所有 Character/Slot 字面量 fixture**（vue-tsc 为准）。

### 5.2 表单（`CharacterForm.vue`）
- 输出职业（`!isSupport`）在「模拟伤害/秒伤」后追加 6 个输入框：
  - 三攻 / 力智 / 属强（裸值）
  - 攻强（%）/ 攻强增幅（%）/ 技攻（%）
- 均可选可清空（清空 → null）；`v-model.number` 归一化沿用现有模式（`v ? Number(v) : null`），防空串 422。
- 辅助职业不显示；**切换职业到辅助时，现有 `watch(selectedJob)` 一并清空这 6 个字段**（对齐其清空 simulated_damage/sustained_dps 的既有行为）。
- 保存 payload 带 6 字段；编辑回填 `editing?.atk_base ?? null` 等。

### 5.3 我的角色（`MyCharactersView.vue`）
- 输出角色卡第一行改为 `名望 {{ c.fame }} · 战斗力 {{ fmtPower(c.combat_power) }}`，第二行 `模拟/秒伤` 原样。
- 辅助角色不变。
- `fmtPower(n)`：`n == null ? '暂无' : n.toLocaleString()`（千分位）。

### 5.4 攻坚详情格（`SlotCell.vue`）
- 输出行 `fameRest` 变为 ` · 战斗力 {{ fmtPower(slot.combat_power) }} · 模拟 … · 秒伤 …`，即名望 → 战斗力 → 模拟/秒伤。
- 辅助行不变（增益/太阳）。
- `RosterSlot`（编队总览）**不加**战斗力（划水规则/编队暂不适配，用户已确认）。

## 6. 测试

### 后端（`backend/tests/`）
- `test_damage.py`：`compute_combat_power` 纯函数单测——buff 应用、% 换算（155→1.55）、压缩取整（round）、任一 null → None。
- API 测试：成员保存 6 字段 → `CharacterOut` 携带 `combat_power`；编辑清空某输入 → combat_power 变 None；guest/admin 创建角色带新字段。
- **输出→辅助 职业切换回归**：先存 6 字段 + combat_power，再切辅助保存 → 6 字段与 combat_power 均清为 None。
- bot 更新角色不清空伤害配置（创建后 `_apply_partial` 更新旧字段，新字段原样）；bot 创建角色新字段为 None。
- `_slot_out` 携带 combat_power（fill 占位后 SlotOut 含战斗力）。
- 迁移幂等（`test_migrations.py` 补例）。

### 前端
- `MyCharactersView.spec`：输出卡显示 `战斗力` 千分位、辅助卡不显示、null 显示「暂无」。
- `SlotCell.spec`：输出格 `fameRest` 含战斗力、辅助格不含。
- `CharacterForm.spec`：输出显示 6 输入框、辅助不显示、保存 payload 含 6 字段。
- 类型 fixture 补齐（vue-tsc 为准）。

## 7. CHANGELOG

Unreleased「新增」一条：**角色伤害构成与战斗力**——输出职业可在「我的角色」配置 三攻/力智/属强/攻强/攻强增幅/技攻（攻强/攻强增幅/技攻支持小数），后端按副本面板（加 40000 三攻、220000 力智）计算伤害构成并压缩为「战斗力」（百万级整数，总 ÷1e12）存储；攻坚详情与我的角色卡片在名望旁展示战斗力（千分位整数）。旧的模拟伤害/秒伤字段保留，划水规则/编队暂不涉及战斗力。

## 8. 非目标 / 后续

- 划水规则 / 编队达标切换战斗力指标（已确认暂不做）。
- 前端实时战斗力预览（已确认不做，避免双源公式）。
- 辅助职业伤害构成（无此体系）。
- 战斗力排序（我的角色按名望排序现状保留；后续可加按战斗力排序）。
- 压缩常数 / buff 加成的后续调优（当前为集中常量，改一处重算即可；存量 combat_power 需回填脚本）。
