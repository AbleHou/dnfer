# DNfer 辅助职业「太阳增益」字段 — 设计规格

日期：2026-09-29
状态：已确认
上游：`2026-09-18-job-system-design.md`（职业体系：`Character.class_type` 为 `输出/辅助`，`buff_amount` 为辅助增益量）。相关既有约定见 `2026-09-29-signup-ui-design.md`（报名战力列）与 `2026-09-24-admin-split-design.md`（管理角色富查询）。
需求来源：用户口述——现有衡量输出职业的数值为「模拟伤害/秒伤」、辅助职业为「增益量」，现为辅助职业新增「太阳增益」字段（「太阳」为游戏里对辅助职业短时效强力增益技能的统称）。

## 1. 目标与已确认规则

- 为辅助职业新增「太阳增益」数值字段，与既有 `buff_amount`（增益量）并列。
- **取值格式（已确认）**：裸数字（同增益量），展示为 `太阳 3000` 这类裸数值，null 显示「暂无/—」。
- **适用职业（已确认）**：所有 `class_type=辅助` 职业。
- **展示范围（已确认）**：全链路——表单录入、角色卡片、我的角色、报名战力列、占位格、管理查询表；管理查询表排序同步新增「太阳增益」项。
- **机器人接口（已确认）**：`POST /api/public/characters` 的 `BotCharacterIn` 支持可选 `sun_buff` 字段。
- **实现方案（已确认）**：方案 A——新增专用列 `sun_buff`，完全镜像 `buff_amount` 模式。
- 纯展示字段，不参与任何计算（小队伤害统计 `damage.ts` 只聚合输出职业，不涉及）。
- 后端不做按职业的强制校验（与 `buff_amount` 一致）：前端按职业显隐输入框，后端只存透传。

## 2. 字段命名

- DB 列 / JSON 字段：`sun_buff`（`Integer | None`）。
- 展示缩写统一用「太阳」（紧凑场景，如卡片/占位格/战力列）；表单标签用完整「太阳增益」。

## 3. 后端实现

### 3.1 数据模型与迁移

`backend/app/models.py` — `Character` 在 `buff_amount` 后新增：

```python
sun_buff: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 辅助：太阳增益
```

`backend/app/migrations.py` — 新增幂等迁移（模式照抄 `migrate_users_ban`）：

```python
def migrate_characters_sun_buff(engine: Engine) -> None:
    """为存量库补建 characters.sun_buff 列（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(characters)")).all()}
        if "sun_buff" not in cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN sun_buff INTEGER"))
```

`backend/app/db.py` — `init_db()` 的 migrations import 与调用列表各加 `migrate_characters_sun_buff`。

- 新库：`create_all` 自动建列；存量库：`ALTER ... ADD COLUMN` 幂等补齐，无需数据回填（存量辅助角色 `sun_buff=NULL`，展示「暂无」）。

### 3.2 schema（`backend/app/schemas.py`）

| schema | 改动 |
|---|---|
| `CharacterIn` | 加 `sun_buff: int | None = None` |
| `CharacterOut` | 加 `sun_buff: int | None` |
| `SlotOut` | 加 `sun_buff: int | None` |
| `BotCharacterIn` | 加 `sun_buff: int | None = None` |

### 3.3 共享服务（`backend/app/services/characters.py`）

- `character_out`：返回参数加 `sun_buff=c.sun_buff`
- `apply_character_payload`：加 `c.sun_buff = body.sun_buff`

### 3.4 端点（`backend/app/routers/`）

| 文件 | 改动 |
|---|---|
| `members.py` | 走共享 `apply_character_payload`/`character_out`，无需改动 |
| `admin.py` | 用户角色创建/编辑走共享函数，无需改动；`_SORT_COLS` 加 `"sun_buff": Character.sun_buff` |
| `raids.py` | `_slot_out` 加 `sun_buff=c.sun_buff if c else None` |
| `bot.py` | 创建分支 `Character(... sun_buff=item.sun_buff)`；`_apply_partial` 加 `if body.sun_buff is not None: c.sun_buff = body.sun_buff` |

## 4. 前端实现

### 4.1 类型（`frontend/src/types.ts`）

- `Character` 加 `sun_buff: number | null`（`AdminCharacterRow` 继承自动带上）
- `Slot` 加 `sun_buff: number | null`

### 4.2 store（`frontend/src/stores/raid.ts`）

`slot:removed` 清理行（raid.ts:46-49）补 `slot.sun_buff = null`。

### 4.3 表单（`frontend/src/components/CharacterForm.vue`）

- `form` 初值加 `sun_buff: props.editing?.sun_buff ?? null as number | null`
- 职业切换 watch：输出职业清 `form.value.sun_buff = null`（与 buff_amount 对称）
- 辅助分支加输入框：

```html
<div style="display:flex;align-items:center;gap:8px;margin:8px 0">
  <label for="char-sun-buff" class="form-label">太阳增益：</label>
  <input id="char-sun-buff" v-model.number="form.sun_buff" type="number" class="dnf-input" style="flex:1" />
</div>
```

- save payload 加 `sun_buff: form.value.sun_buff`

### 4.4 展示（辅助统一为 `增益 X · 太阳 Y`）

| 文件 | 改动 |
|---|---|
| `components/CharacterCard.vue` | 辅助分支 `增益 ${fmtBuff(buff_amount)}` → `增益 ${fmtBuff(buff_amount)} · 太阳 ${fmtBuff(sun_buff)}` |
| `views/MyCharactersView.vue` | 同上 |
| `components/SlotCell.vue` | 辅助 attrs `增益 ${fmtBuff(...)}` → `增益 ${fmtBuff(...)} · 太阳 ${fmtBuff(...)}` |
| `components/SignupModal.vue` | `powerText` 辅助分支 `fmtPower(buff_amount)` → `fmtPower(buff_amount)/fmtPower(sun_buff)`（null→`—`，与输出 `模拟/秒伤` 对齐）；表头「伤害/增益」不动 |
| `views/AdminUsersView.vue` | 查询表加「太阳增益」列（`c.class_type === '辅助' ? fmtNum(c.sun_buff) : '—'`）；排序下拉加 `<option value="sun_buff">太阳增益</option>` |

- `fmtBuff`/`fmtPower`/`fmtNum` 均复用既有助手，不新建格式化函数。

## 5. 测试

### 5.1 后端（pytest）

- `test_members.py`：创建/编辑角色携带 `sun_buff`，`CharacterOut` 返回含该值；不带则 null
- `test_admin_management.py`：admin 为用户建/改角色带 sun_buff；`/api/admin/characters/query?sort=sun_buff` 正常返回且排序生效
- `test_bot_characters.py`：机器人录入/编辑角色 sun_buff（创建分支 + `_apply_partial` 分支）
- `test_raids.py` / `test_smoke.py`：填角色后 slot 响应带出 `sun_buff`
- `test_migrations.py`：`migrate_characters_sun_buff` 幂等（重复调用不报错、列存在）

### 5.2 前端（vitest + vue-tsc）

- 所有 `Character`/`Slot` 字面量 fixture 补 `sun_buff` 字段（`types.ts` 加必填会牵连 RaidList/RaidDetail/stores/components/views 各 spec）
- `CharacterForm.spec`：选辅助显示太阳增益输入、选输出不显示、切换清空
- `CharacterCard.spec`/`MyCharactersView.spec`/`SlotCell.spec`：辅助行显示「太阳」、输出行不显示
- `SignupModal.spec`：辅助行战力列含 `增益/太阳` 双值
- `AdminUsersView.spec`：查询表太阳增益列 + 排序下拉含 sun_buff
- `npm run build`（vue-tsc）确保类型通过

## 6. 文档

- `CHANGELOG.md` [Unreleased] → 新增：辅助角色新增「太阳增益」字段（表单录入；角色卡片/我的角色/报名战力列/占位格展示；管理查询表与排序；机器人接口支持）。

## 7. 变更文件范围

### 后端

- `backend/app/models.py`
- `backend/app/migrations.py`
- `backend/app/db.py`
- `backend/app/schemas.py`
- `backend/app/services/characters.py`
- `backend/app/routers/admin.py`
- `backend/app/routers/raids.py`
- `backend/app/routers/bot.py`
- `backend/tests/test_members.py`、`test_admin_management.py`、`test_bot_characters.py`、`test_raids.py`、`test_smoke.py`、`test_migrations.py`

### 前端

- `frontend/src/types.ts`
- `frontend/src/stores/raid.ts`
- `frontend/src/components/CharacterForm.vue`
- `frontend/src/components/CharacterCard.vue`
- `frontend/src/components/SlotCell.vue`
- `frontend/src/components/SignupModal.vue`
- `frontend/src/views/MyCharactersView.vue`
- `frontend/src/views/AdminUsersView.vue`
- 相关组件/视图/库 spec（补 fixture 字段 + 新增用例）

### 文档

- `CHANGELOG.md`
