# 角色装备配置与装备属性计算 — 设计规格

日期：2026-11-04
状态：已确认
需求来源：用户口述——为「我的角色」模块中每个角色配置装备，参考计算器项目 `~/toys/dcalc/` 的数据与计算逻辑，记录装备并计算装备属性（不考虑角色技能）。

已确认的决策：
- **目标**：记录装备配置 + 计算装备属性面板，**不考虑角色技能**（不做技能循环/伤害模拟）。
- **数据与计算位置**：DNfer 后端内置 dcalc 装备静态数据（JSON 数据文件，启动加载内存）+ Python 计算；前端只负责配置交互与结果展示。
- **配置结构（4 页 tab）**：① 装备页 = 12 槽（武器+防具5+首饰3+特殊3）+ 称号；② 誓约页 = 12 星蕴石 + 1 誓约；③ 徽章页暂不考虑（占位）；④ 宠物页 = 1 宠物 + 3 宠物装备（红/绿/蓝）。
- **可配属性**：第一页装备与宠物本体可**附魔**（宠物装备不含）；第一页除称号外的 12 槽可**调试**；第二页所有星蕴石可**调试**；第一页 12 槽可**强化或增幅**（武器多一个锻造）。
- **计算保真度**：核心公式移植——装备基础属性 + 调试档位 + 强化技攻表 + 增幅四维 + 武器强化/锻造攻击 + 耳环/左右槽强化 + 套装效果 + 附魔解析。**不含**防具精通（需按职业甲类）与誓约补足主套装。
- **结果用途**：装备属性面板展示；装备名望作为**参考名望**展示，与现有 `fame` 字段**共存不回填**；`simulated_damage`/`buff_amount` 等不受影响。
- **数据层选型**：持久化用 `characters.equipment_config` **JSON 列**；计算结果**实时计算**（不存快照）；静态数据打包为 **JSON 数据文件**。
- **不做**职业→武器类型自动过滤（需引入 dcalc 职业武器映射数据，列为后续增强）。

## 1. 背景与现状

DNfer `Character` 模型（`backend/app/models.py:35-50`）现存的数值字段 `fame`/`simulated_damage`/`sustained_dps`/`buff_amount`/`sun_buff` 均为**手动填写**（或 bot 写入）的裸数值，与装备无任何关联。项目内无装备概念（grep `装备|equipment|gear|增幅|强化` 仅命中前端 @dnftools/ui 图标资源）。

参考项目 dcalc（`~/toys/dcalc`）是完整伤害计算器：FastAPI 后端 + SQLite 静态装备库（`dataFiles/dcalc_0.db`：`equ` 1160 件 / `suit` 60 / `oath` 49 / `primer` 51 / `enchant` 175）+ Redis + 每职业 Python 模块 + 技能循环。其装备相关机制经核实：

- **equ 表**统计列（STR/INT/Vitality/Spirit/AtkP/AtkM/AtkI/SkillAttack/Attack/Buffer/fame）是逗号分隔的**调适档数组**（如 `SkillAttack='0.93,1.03,1.13,1.24'` 4 档）；`Equ.adapt(adaptation)` 取档。
- **强化/增幅**（`backend/core/basic/formula.py`）：
  - `强化技攻(等级,类型,部位)`：强化（type 0）仅武器/耳环从 12 级起给技攻；增幅（type 1）全部位从 10 级起给技攻（0.2% 起逐级 +0.2）。
  - `增幅计算(装备等级,品质,强化等级)`：给 STR/INT/Spirit/Vitality（装备等级取 115，史诗）。
  - `武器强化计算`→AtkP/AtkM、`锻造计算`→AtkI（独立）、`耳环计算`→AtkP/AtkM/AtkI、`左右计算`→四维。
  - 防具精通 `精通计算` 按甲类/部位给四维（本次**不做**）。
- **附魔**：dcalc **没有通用解析器**，效果为 200+ 手写 `enchant_{id}` 函数直接 `SetStatus(...)`；但 `detail` 文本格式规整（`三攻(110)|力智(90)|技攻(2%)`），**可写解析器**提取三攻/四维/技攻/属强/攻击强化%/三速/技能等级。宠物装备（红/绿/蓝）与宠物本体附魔也都在 enchant 表（itemType `宠物装备-红/绿/蓝`、`宠物`）。
- **套装** `suit` 表按点数分档给 SkillAttack/Attack/Buffer/fame；装备 `suit` 字段（逗号分隔 suitId 列表）累加点数匹配档位。
- **誓约体系**：`oath`（position 11，统计列+调试数组）+ `primer` 星蕴石（position 0-10，Attack/Point 调试数组）＋ `oathSuit` 套装；本次简化——誓约点数只用于自身套装档位匹配，**不做**补足主套装。

## 2. 装备静态数据（数据工程）

从 `dcalc_0.db` 抽取 5 张表，精简为 JSON 数据文件（`backend/data/equipment/`，启动懒加载进内存 dict）：

| 文件 | 内容 | 说明 |
|---|---|---|
| `equ.json` | 装备本体 | 槽位裁剪：防具5/首饰3/特殊3/称号/宠物 + 武器（按 `itemDetailType` 区分武器类型）。每件 `{id, name, rarity, itemDetailType, categorize, suit, detail, 统计列数组}` |
| `suit.json` | 套装效果 | `{suitId, name, rarity, point[], SkillAttack[], Attack[], Buffer[], fame[]}` |
| `oath.json` | 誓约本体 | position 11，统计列 + 调试数组 |
| `primer.json` | 星蕴石 | position 0-10，Attack/Point 调试数组 |
| `enchant.json` | 附魔 + 宠物装备 | 槽位附魔（第一页 12槽+称号）、宠物本体附魔、宠物装备本体（红/绿/蓝） |

要点：
- 统计列直接存**调适档数组**，计算时按 `adaptation` 取档（`min(adaptation, len-1)` 夹紧，对齐 `equ.adapt`）。
- `equ` 表无属强列——属强来自附魔/宠物装备。
- 数据生成脚本一次性执行，产物入库提交；后续 dcalc 更新时重跑脚本 + 人工校验。

## 3. 计算引擎

`backend/app/services/equipment.py` 纯函数 `compute_equipment(job_name, config) -> EquipmentPanel`，按序累加：

1. **12 槽 + 称号基础属性**：每槽 `equ.adapt(adaptation)` 取档 → 累加 STR/INT/AtkP/AtkM/AtkI/SkillAttack/Attack/Buffer。
2. **强化/增幅**：强化技攻表（强化仅武器/耳环 12 级起；增幅全部位 10 级起）→ SkillAttack；增幅 → STR/INT/Spirit/Vitality（`增幅计算` 公式，装备等级 115）；武器强化 → AtkP/AtkM、锻造 → AtkI；耳环/左右槽强化 → 对应攻/四维。
3. **套装效果**：同套装点数匹配 `suit` 档位 → SkillAttack/Attack/Buffer/fame。
4. **附魔解析**：每槽附魔 `detail` 文本解析 → 属性；按职业输出类型取攻击力（物理→AtkP，魔法→AtkM，独立→AtkI）。
5. **誓约体系**：誓约本体 + 12 星蕴石（调试档）→ 属性 + 誓约套装效果。
6. **宠物**：宠物本体（附魔）+ 3 宠物装备（红/绿/蓝）→ 属性。
7. **输出面板**：按 `job` 的 class_type 组面板——
   - 输出：力智、攻击力（物/魔/独立）、技攻、攻击强化、属强、参考名望
   - 辅助：四维、增益量、参考名望

附魔解析器（`services/enchant_parser.py` 纯函数）：解析 `三攻(N)|四维(N)|技攻(N%)|全属强(N)|火强(N)|攻击强化(N%)|三速(N%)|...` → 结构化属性。技能等级类词条（`LvXX主动+N`）只记录不参与计算（无技能模拟）。

## 4. 数据模型与 API

**数据模型**：
- `characters` 加 `equipment_config` JSON 列（`nullable=True`），迁移 `migrate_characters_equipment`（幂等 ALTER，对齐 `migrate_characters_sun_buff` 模式，`backend/app/migrations.py`）。
- 配置 JSON 形状：

```json
{
  "slots": {
    "武器":  {"id": 1, "adaptation": 0, "reinforce": 12, "reinforce_type": 0, "refine": 0, "enchant_id": "100"},
    "头肩":  {"id": 2, "adaptation": 1, "reinforce": 10, "reinforce_type": 1, "enchant_id": "1"},
    "称号":  {"id": 3, "enchant_id": "1200"},
    "宠物":  {"id": 4, "enchant_id": "1300"}
  },
  "oaths": {
    "0":  {"id": "2010201", "adaptation": 0},
    "11": {"id": "2010200"}
  },
  "pets": {
    "red": "2500", "green": "2600", "blue": "2606"
  }
}
```

（`slots` 覆盖 12 槽 + 称号；`oaths` key = 槽位 0-10 星蕴石 + 11 誓约；`pets` 三个宠物装备 = enchant 表 id。）

**后端 API**（`routers/members.py`，沿用 `/api/me/characters` 前缀）：
- `GET /api/me/characters/{cid}/equipment` → `{config, panel}`（config 为存库原样，panel 为实时计算结果）。
- `PUT /api/me/characters/{cid}/equipment` → 校验后保存 config，返回 `{config, panel}`。
- 校验：槽位 key 合法（14 标准槽 + 誓约槽 + 宠物槽）、`equ_id` 存在、强化/增幅等级 0-30、调试档位 ≤ 该装备最大档。
- `_own_character` 鉴权（非本人 404）；admin 走 `/api/admin/users/{uid}/characters/{cid}/equipment` 同构（对齐角色 CRUD 双路由模式）。
- `character_out` **不**内嵌 config/panel（保持轻量，装备详情单独端点拉取）。
- 装备数据未加载（文件缺失）时相关端点 400「装备数据未加载」。

**装备静态数据加载**：`services/equipment_data.py` 启动时懒加载 JSON → 内存 dict，模块级单例（对齐 `useTheme` 模块级单例测试注意）。

## 5. 前端

- **入口**：「我的角色」卡片新增「装备」按钮（`data-act="equip"`）→ 打开装备配置视图（DnfFrame 风格弹窗，宽屏）。
- **装备配置视图**（`EquipmentModal.vue`，4 tab）：
  - **Tab 装备**：13 槽位块（武器/防具5/首饰3/特殊3/称号），每槽显示当前装备图标+名，点击打开选择器；已选槽显示 附魔/调试/强化增幅 子控件（称号无调试强化，武器多一个锻造）。
  - **Tab 誓约**：13 槽位块（12 星蕴石 + 誓约），每槽选星蕴石 + 调试档。
  - **Tab 徽章**：占位空页（"开发中"）。
  - **Tab 宠物**：宠物本体 + 附魔 + 红/绿/蓝 3 宠物装备。
- **装备选择器**（`EquipPickerModal.vue`，通用）：按槽位过滤 + 品质筛选 + 关键词搜索；武器槽多一个武器类型筛选；选中回填配置。
- **属性面板**：弹窗底部固定展示计算结果——参考名望徽章（与角色名望并列）+ 输出/辅助属性行。
- **保存**：`保存` 按钮 PUT → 成功 toast + 刷新；未配置角色显示「未配置装备」空态。

**类型**：`types.ts` 新增 `EquipmentConfig`/`EquipmentPanel`/`EquipmentSlot` 等类型。

## 6. 测试

### 后端（`backend/tests/`）
- 附魔解析器纯函数单测（各 detail 文本变体）。
- `compute_equipment` 计算引擎单测（装备基础/调试档/强化技攻表/增幅四维/套装/誓约/宠物，含跨系统累加）。
- API 测试：GET/PUT 正常、非本人 404、非法槽位/equ_id 400、调试档超限 400。
- 迁移幂等测试（`test_migrations.py` 补例）。

### 前端
- `EquipmentModal.spec.ts`：tab 切换、槽位点击、保存调用。
- `EquipPickerModal.spec.ts`：筛选/搜索/选中。
- 类型 fixture 补齐（vue-tsc 为准）。

## 7. CHANGELOG

Unreleased「新增」一条：**角色装备配置**——每个角色可配置装备（装备页 12 槽+称号 / 誓约页星蕴石+誓约 / 宠物页宠物+宠物装备，徽章页预留），后端内置 dcalc 装备数据并计算装备属性面板（力智/攻击力/技攻/攻击强化/属强、参考名望），参考名望与现有名望共存。

## 8. 非目标 / 后续

- 徽章（第三页）系统。
- 职业→武器类型自动过滤（需引入 dcalc 职业武器映射）。
- 防具精通计算（需职业甲类数据）。
- 誓约补足主套装效果。
- 技能等级附魔的实际效果计算（无技能模拟）。
- 装备数据自动同步 dcalc 新版本（当前为一次性抽取 + 人工重跑脚本）。
- 参考名望回填 `fame` 字段。
