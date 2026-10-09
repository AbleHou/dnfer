# DNfer 并行攻坚（波次并行 / 团号显示）— 设计规格

日期：2026-10-09
状态：已确认
需求来源：用户口述 `并行攻坚.md`——副本限制 12 人但报名 16/24 人时需同时开多个团（如 2×8、3×8）。需支持「指定某波与某波并行」，并行波显示为 `第X波Y团`，并可取消并行。

## 1. 目标

为攻坚波次引入「并行团」概念：同一轮次可并行多个团。已确认的决策：

- **显示**：按并行组重排。并行波共享基波轮次并加团号；轮次号按并行组重新顺排（无空洞）。单波轮 → `第{round}波`；多波轮 → `第{round}波{group}团`。场景：w1/w2/w3 默认第1/2/3波，w2‖w1 后 → 第1波1团(w1)、第1波2团(w2)、第2波(w3)。
- **操作**：指定目标波加入——选中某波「与哪一波并行」，即加入目标波所在轮次、成为下一个团号。支持任意波之间与连续链（w2‖w1 后再 w3‖w2 → 三者同轮）。
- **占位约束**：同轮限一占位——把现有「同波同玩家仅一占位」扩展为「同轮次仅一占位」（并行团同时开，玩家无法分身）。
- **规模**：并行团沿用攻坚规模（raid.size），不新增每波自定义人数。
- **权限（本轮一并收紧）**：加波/删波从「未锁定任意成员」收紧为**仅管理员**；并行/取消并行同为仅管理员。原因：并行会重组轮次、影响比加删波更大，权限收紧一致更合理（用户 2026-10-09 追加确认）。占位/职责等其余操作保持 `_can_edit`（未锁定任意成员，锁定后仅管理员）不变。
- **范围**：仅 Web 前端；AstrBot skill（dnfer-raids）本轮不改。
- **建模方案 A**：`Wave.group_id` 可空列 + 后端计算显示轮次/团号；`index` 保持稳定内部顺序键。

## 2. 后端

### 2.1 数据模型与迁移（models.py / migrations.py）

- `Wave` 加列 `group_id: Mapped[int | None] = mapped_column(Integer, index=True)`——同轮并行波共享同一非空值，NULL=独立波。
- `index` **不重排**：保持稳定内部顺序键，public `/raids/{rid}/waves/{index}` 与 bot 按 index 寻址不受影响。
- 迁移：`migrations.py` 新增幂等 `migrate_waves_group`（仿 `migrate_users_ban`）——`ALTER TABLE waves ADD COLUMN group_id INTEGER`，且 `CREATE INDEX ix_waves_group_id`（若不存在）。**须在 `init_db()`（db.py）注册执行**；`create_all` 不会对已存在的 `waves` 表 ALTER 加列，这正是需要迁移的原因。

### 2.2 Schemas（schemas.py）

```python
class WaveOut(BaseModel):
    id: int
    index: int
    group_id: int | None = None
    round_index: int      # 1 起始，轮次显示号
    group_index: int      # 1 起始，轮内团号
    slots: list[SlotOut]

class ParallelIn(BaseModel):
    target_index: int     # 目标波 index
```

### 2.3 显示计算（routers/raids.py `_detail`）

`_detail` 构建 `WaveOut` 时统一计算并**按 (round_index, group_index) 排序返回**：

1. 以 `raid.waves`（已按 index 排序）为输入。
2. 分区为轮次：`group_id is None` → 单波轮；共享 `group_id` → 同轮。
3. 轮次按 `min(index)` 排序 → `round_index` 1..N。
4. 轮内按 `index` 排序 → `group_index` 1..M。
5. 显示标签（前端据此渲染）：轮内 1 波 → `第{round_index}波`；轮内 >1 波 → `第{round_index}波{group_index}团`。

### 2.4 并行端点（routers/raids.py，均 `Depends(require_admin)`）

**加波/删波权限收紧**（本轮独立小改动，先于并行落地）：
- `add_wave`：`Depends(get_current_user)` + `_can_edit` → `Depends(require_admin)`；删除失效的 `_can_edit` 校验与「攻坚已锁定」403。
- `delete_wave`：改为 `Depends(require_admin)`；删除原有非管理员分支（锁定 403 + 本人角色校验），仅保留 404 / 至少保留一波 400 校验。`_can_edit` 仍被 `fill_slot`/`change_duty` 使用，保留不动。
- `create_wave`/`delete_wave` 现有 WS 事件（`wave:added/removed`）不变。

```python
@router.post("/{rid}/waves/{index}/parallel")
async def parallelize_wave(rid: int, index: int, body: ParallelIn,
                           admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    # 仅管理员（require_admin，与加/删波收紧一致）
    # wave、target 均为本 raid 的波，否则 404「波次不存在」
    # target == wave（自身）→ 400
    # wave 若已在某轮 → 先退出（group_id=NULL），且退出后原轮若仅剩 1 波 → 该波 group_id 也置 NULL（单波自动转独立）
    # target.group_id 为 None（目标独立）→ 以 target.id 为轮键，双方 group_id = target.id
    # target 已在轮 → wave.group_id = target.group_id（加入目标轮）
    # 加入后（目标轮 ∪ {W}）用 _validate_one_char_per_round 校验：
    #   若同一玩家在新轮内两个不同波占位 → 400「同一轮次中一个玩家只能上一个角色」（拒绝加入，保持不变量）
    # commit 后 broadcast wave:parallelized {index}
    # 返回 _detail(db, raid)

@router.delete("/{rid}/waves/{index}/parallel")
async def unparallelize_wave(rid: int, index: int, admin: User = Depends(require_admin),
                             db: Session = Depends(get_db)):
    # 仅管理员
    # wave 不存在 → 404；wave 未在轮（group_id is None）→ 400「该波未并行」
    # wave.group_id = NULL；若原轮内除 wave 外仅剩 1 波 → 该波 group_id 也置 NULL（单波自动转独立）
    # commit 后 broadcast wave:parallel_removed {index}
    # 返回 _detail(db, raid)
```

- WS 事件：`wave:parallelized`（`{index}`）/ `wave:parallel_removed`（`{index}`）。
- 删除波（`delete_wave`）补充：被删波若在轮内，删除后原轮若仅剩 1 波 → 其 `group_id` 置 NULL。
- **全局不变量（三处变更点都要保持）**：单波轮恒为 `group_id == null`。即并行退出路径、取消并行、删除轮中波，任一操作后若某轮仅剩 1 波，其 `group_id` 一律置 NULL。前端 §3.2 的标签规则（`group_id == null` ↔ 第X波）依赖此不变量，否则会出现「单人轮却显示 1团」的矛盾。

### 2.5 占位约束扩展（同轮限一占位）

- 新增 helper：`_round_wave_ids(db, wave) -> set[int]`——按 `wave.group_id` 返回同轮所有 wave.id（独立波 → `{wave.id}`）。
- 新增 helper：`_validate_one_char_per_round(db, round_wave_ids: set[int])`——**跨轮内所有波聚合**：把 `round_wave_ids` 全部 slot 的 owner 收进一个集合，同一 owner 出现两次即 400「同一轮次中一个玩家只能上一个角色」（同时覆盖「同团内两角色」与「跨并行团两角色」）。
- `fill_slot`：`same_owner` 冲突查询 `Slot.wave_id == slot.wave_id` 改为 `Slot.wave_id.in_(_round_wave_ids(db, slot.wave))`（replace 撤下冲突格同理按同轮判定）。
- `move_slot`：`_validate_one_char_per_wave(db, {source.wave_id, target.wave_id})` 改为对受影响轮分别调用 `_validate_one_char_per_round(db, _round_wave_ids(db, source.wave))` 与 `_validate_one_char_per_round(db, _round_wave_ids(db, target.wave))`（双向校验覆盖整轮）。旧的 `_validate_one_char_per_wave` 仅 move_slot 一处调用，替换后删除。
- 报错文案「同一波次中一个玩家只能上一个角色」→「**同一轮次**中一个玩家只能上一个角色」。

## 3. 前端

### 3.1 types.ts

```ts
export interface Wave { id: number; index: number; group_id: number | null; round_index: number; group_index: number; slots: Slot[] }
```

### 3.2 WaveSection.vue

- 头部标题改为 computed 标签：`wave.group_id == null` → `第{{ wave.round_index }}波`；否则 `第{{ wave.round_index }}波{{ wave.group_index }}团`。
- 并行操作入口（头部，**`isAdmin` 时显示**，与加/删波收紧一致）：
  - 独立波（`group_id == null`）→「并行到…」按钮，emit `parallelize(wave)`。
  - 轮内波（`group_id != null`）→「取消并行」链接，emit `unparallelize(wave)`。
- **权限收紧连带**：删除本波入口原 `canDelete`（`auth.isAdmin || waves.length > 1`）→ 改为 `auth.isAdmin`（删波仅管理员）。

### 3.3 RaidDetailView.vue

- 新增状态：`parallelizeWave = ref<Wave | null>(null)`（驱动并行目标弹窗）。
- 「并行到…」点击 → 打开 NModal 列出 raid 内**其他**波（含各自当前标签），选中后调 `api.post('/api/raids/{rid}/waves/{index}/parallel', { target_index })`，成功后 `load()`。
- 「取消并行」→ `api.del('/api/raids/{rid}/waves/{index}/parallel')`，成功后 `load()`。
- 失败均 `notifyError(e.message)`。
- waves 渲染顺序由后端 (round_index, group_index) 排序保证，前端无需重排。
- **权限收紧连带**：「＋ 添加一波」按钮 `v-if="editable"` → `v-if="auth.isAdmin"`（加波仅管理员）；WaveSection 的 `can-delete` 传参改为 `auth.isAdmin`。

### 3.4 store / ws

- **`api/ws.ts`**：`onmessage` 的全量刷新条件（现为 `ev.type === 'wave:added' || ev.type === 'wave:removed'` → `cb.onRefresh()`）增补 `'wave:parallelized'` / `'wave:parallel_removed'`——**全量刷新在此层路由，不经过 `applyEvent`**（`applyEvent` 的 `wave:added/removed` 分支仅置 `needRefresh`，无消费者）。
- **`stores/raid.ts`**：仅把 `WsEvent` 联合类型增补 `| { type: 'wave:parallelized'; index: number } | { type: 'wave:parallel_removed'; index: number }` 供 `ws.ts` 判别；`applyEvent` **不加**新分支（新事件被 `ws.ts` 截走触发刷新）。

## 4. 测试

### 4.1 后端

- `tests/test_raid_parallel.py`（新建）：
  - 并行：独立→独立（入同轮，round_index/group_index 正确）；加入已有轮（成为下一团号）；跨 raid target → 404；target=自身 → 400；**非管理员（无论锁定与否）→ 403**。
  - **合并冲突**：wave 原在轮 A 且与目标轮 B 合并后同一玩家跨两波占位 → 400「同一轮次中一个玩家只能上一个角色」，且两轮保持原状（事务回滚）。
  - **单波标签不变量**：w1‖w2 后 w1 再‖w3（w2 被留在旧轮只剩自身）→ w2 的 `group_id` 归 NULL、显示「第X波」（无 1团）；w1‖w3 显示「第X波1团/2团」。
  - 显示计算：w1‖w2 + w3 → `round_index=[1,1,2]`、`group_index=[1,2,1]`，返回顺序 w1,w2,w3。
  - **非连续轮次**：w1‖w2、w3 独立、w4‖w1 → 轮 {w1,w2,w4} 且 w3 夹在中间；round_index 仍为 [1,1,2,1]、group_index=[1,2,1,3]，返回顺序 w1,w2,w4,w3（强制「分区后排序」而非朴素顺序分组）。
  - 取消并行：退出后 `group_id=NULL`；轮内仅剩 1 波时其 `group_id` 置 NULL；重编号正确。
  - 删除轮中波：剩余单波 `group_id` 归 NULL。
  - WS：broadcast 收到 `wave:parallelized` / `wave:parallel_removed`。
  - 占位：同一玩家占并行两团 → 400「同一轮次中一个玩家只能上一个角色」；`replace` 自动撤下并行团冲突格；`move_slot` 跨并行团移动造成同轮同玩家 → 400。
- **文案改动无既有测试断言影响**：已 grep 确认 backend/tests 下无任何用例断言旧文案「同一波次中一个玩家只能上一个角色」，文案改动安全、无需同步改既有用例（避免规划者白费功夫）。
- **权限收紧**（改既有用例 + 补 403 断言）：
  - `test_raids.py::test_wave_add_and_delete_rules`（成员加波 200 / 删自己角色波 200）→ 改为管理员操作，并补非管理员加/删 → 403。
  - `test_admin_adjust.py::test_owner_can_delete_wave_with_only_own_chars_admin_placed`（成员删波 200）→ 改管理员操作，非管理员删 → 403。
  - 新增：非管理员 `POST /{rid}/waves` → 403、`DELETE /{rid}/waves/{index}` → 403；管理员加/删 → 200。
- `tests/test_migrations.py`：`migrate_waves_group` 幂等（执行两次无异常），断言 `group_id` 列存在且 `ix_waves_group_id` 索引存在。

### 4.2 前端

- `WaveSection.spec.ts`（**新建**，当前无此 spec）：单波/团标签渲染；独立波显示「并行到…」、轮内波显示「取消并行」。
- `RaidDetailView.spec.ts`：并行到弹窗打开、选择目标触发 `api.post` 对应 payload 并刷新；取消并行触发 `api.del` 并刷新。
- `stores/raid.spec.ts`：`WsEvent` 类型增补后编译通过（新事件被 `ws.ts` 截走，`applyEvent` 无新分支，可加类型层用例）。
- **Fixture 涟漪**：`Wave` 类型新增 `group_id`/`round_index`/`group_index` 必填字段，需同步补现有 Wave 字面量 fixture——`RaidDetailView.spec.ts:56`、`lib/placement.spec.ts:22-23`、`stores/raid.spec.ts:10`。

## 5. 不做的事（YAGNI）

- 不做每团自定义规模（沿用 raid.size）。
- 不改 AstrBot skill（dnfer-raids）的波次显示/查询（并行字段已带上，适配后续迭代）。
- 不做 `index` 重排（保持稳定内部顺序键，显示号由计算得出）。
- 不改 `wave_count` 语义（仍计波数而非轮数）。
- 不做并行波之间的拖拽/移动特殊规则（沿用现有 move_slot 逻辑 + 同轮校验）。
