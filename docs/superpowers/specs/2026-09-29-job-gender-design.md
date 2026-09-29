# DNfer 职业性别显示 — 设计规格

日期：2026-09-29
状态：已确认
上游：`2026-09-18-job-system-design.md`（职业数据：`/api/jobs` 返回 `JobCategory[]`，`Character.parent_name` 为职业大类）。
需求来源：用户口述——部分职业分男女（如 漫游枪手、光明骑士），希望在**纯前端**给男女双版职业的职业名后追加性别后缀，例如 `光启·光明骑士（男）`、`重霄·漫游枪手（女）`；不动后端与源数据（`职业信息.json`）。

## 1. 目标

- 在职业名展示处，对「男女双版」职业追加 `（男）`/`（女）` 后缀。
- **纯前端**：不改后端、不改 `职业信息.json`、不改数据模型/接口。
- 判定规则（已确认）：**仅当同一职业名在男女两版职业大类中都存在**（共享相同 title）时才显示后缀；单性别职业（如 剑魂、驭剑士）不加。
- 显示范围（已确认）：**字符/职业展示处**（我的角色、成员角色弹窗、报名弹窗、管理角色查询、职业选择器）；排表格子（SlotCell，无 `parent_name`）不改。

## 2. 判定依据（源自 `职业信息.json` 分析）

性别信息编码在职业大类 `parent_name`（如 `swordman_male`/`gunner_female`），但「是否男女双版」需要跨男女大类比对。逐 title 比对后，**男女双版职业共 10 对**，且每对恰好能用唯一 `job_name` 标识：

| title（示例） | 男 job_name | 女 job_name |
|---|---|---|
| 归元·气功师 | nenmaster_male | nenmaster_female |
| 归元·散打 | striker_male | striker_female |
| 归元·街霸 | brawler_male | brawler_female |
| 归元·柔道家 | grappler_male | grappler_female |
| 重霄·漫游枪手 | ranger_male | ranger_female |
| 重霄·枪炮师 | launcher_male | launcher_female |
| 重霄·机械师 | mechanic_male | mechanic_female |
| 重霄·弹药专家 | spitfire_male | spitfire_female |
| 光启·光明骑士 | crusader_male | crusader_female |
| 光启·蓝拳圣使 | infighter | infighter_female |

注意：`infighter`（男版）无 `_male` 后缀，因此**不能**靠 `job_name` 后缀规则判定，必须用显式映射。

非双版示例（不加后缀）：`weapon_master`（剑魂，仅男）、`sword_master`（驭剑士，仅女）、`elemental_bomber`（元素爆破师，仅男）、`assault`（合金战士，仅男）、`paramedic`（协战师，仅女）等。

## 3. 实现

### 3.1 `frontend/src/lib/job.ts` — 新增静态映射 + 助手

```ts
// 男女双版职业：job_name → 性别（纯前端展示层；对应职业信息.json 中 title 同时存在于男女大类的职业）
const GENDER_SPLIT: Record<string, '男' | '女'> = {
  ranger_male: '男', ranger_female: '女',
  launcher_male: '男', launcher_female: '女',
  mechanic_male: '男', mechanic_female: '女',
  spitfire_male: '男', spitfire_female: '女',
  crusader_male: '男', crusader_female: '女',
  infighter: '男', infighter_female: '女',
  nenmaster_male: '男', nenmaster_female: '女',
  striker_male: '男', striker_female: '女',
  brawler_male: '男', brawler_female: '女',
  grappler_male: '男', grappler_female: '女',
}

/** 男女双版职业在 title 后追加（男）/（女）；单性别或未知返回原 title。 */
export function jobGenderTitle(jobName: string | null | undefined, title: string | null | undefined): string {
  if (!jobName || !title) return title ?? ''
  const g = GENDER_SPLIT[jobName]
  return g ? `${title}（${g}）` : title
}
```

### 3.2 应用点（5 处，均有 `job_name`）

| 文件 | 现状 | 改为 |
|---|---|---|
| `components/CharacterCard.vue:20` | `{{ character.job_title }}` | `{{ jobGenderTitle(character.job_name, character.job_title) }}` |
| `components/SignupModal.vue:88` | `{{ c.job_title }}` | `{{ jobGenderTitle(c.job_name, c.job_title) }}` |
| `views/MyCharactersView.vue:83` | `{{ c.job_title }}` | `{{ jobGenderTitle(c.job_name, c.job_title) }}` |
| `views/AdminUsersView.vue:148` | `<td>{{ c.job_title }}</td>` | `<td>{{ jobGenderTitle(c.job_name, c.job_title) }}</td>` |
| `components/CharacterForm.vue:73`（职业按钮）与 `:77`（已选行） | `{{ child.title }}` / `已选：{{ selectedJob.title }}` | `{{ jobGenderTitle(child.name, child.title) }}` / `已选：{{ jobGenderTitle(selectedJob.name, selectedJob.title) }}` |

- `CharacterCard`/`SignupModal`/`MyCharactersView`/`AdminUsersView` 需新增 `import { jobGenderTitle } from '../lib/job'`（`CharacterCard` 已有 `jobIcon` import，合并即可）。
- `CharacterForm` 已 import `categoryIcon, jobIcon, handleIconError`，补 `jobGenderTitle`。

## 4. 测试

- `lib/job.spec.ts`：新增 `jobGenderTitle` 单测——
  - `ranger_female` + `重霄·漫游枪手` → `重霄·漫游枪手（女）`
  - `crusader_male` + `光启·光明骑士` → `光启·光明骑士（男）`
  - `infighter` + `光启·蓝拳圣使` → `光启·蓝拳圣使（男）`（男版无 `_male` 后缀，验证显式映射）
  - 单性别 `weapon_master` + `极诣·剑魂` → 原样
  - `null`/`undefined` jobName 或 title → 容错返回 title
- 组件 spec：核对 `SignupModal.spec` / `MyCharactersView.spec` / `CharacterPickerModal.spec` / `MemberCharactersModal.spec` / `AdminUsersView.spec` / `CharacterForm.spec` 中是否有对 job_title 的**精确**断言（`toBe`/`toContain` 精确串）会因加后缀受影响；`toContain('神启·圣骑士')` 仍成立（子串），仅需补后缀出现/不出现的用例。
  - 新增用例示例（以 SignupModal 为例，fixture 已有 `crusader_male` 的奶）：职业列显示 `神启·圣骑士（男）`；`weapon_master` 的剑魂仍 `极诣·剑魂` 不带后缀。

## 5. 文档

- `CHANGELOG.md` [Unreleased] → 新增：男女双版职业显示性别后缀（纯前端展示）。

## 6. 变更文件范围

- `frontend/src/lib/job.ts` — `GENDER_SPLIT` 映射 + `jobGenderTitle`
- `frontend/src/components/CharacterCard.vue`
- `frontend/src/components/SignupModal.vue`
- `frontend/src/views/MyCharactersView.vue`
- `frontend/src/views/AdminUsersView.vue`
- `frontend/src/components/CharacterForm.vue`
- `frontend/src/lib/job.spec.ts` + 相关组件 spec（如有精确断言需适配）
- `CHANGELOG.md`

无后端改动。
