# 「我的角色」九宫格海报改造 · 设计文档

日期：2026-11-06
状态：设计已确认，待实现

## 背景与目标

「我的角色」页当前是 640px 宽的横向条卡片列表（32px 职业图标 + 名字 + 明细文字）。
本次改造以 **3:4 竖版海报** 形式展示每个角色：职业 profile 图铺满卡片，整体以
**九宫格**（响应式网格）呈现，每行列数随界面宽度自适应。profile 图路径沿用
「按职业信息.json 结构拼接」的既有模式（同 `images/adventure` 下图片的用法）。

## 设计决策（已与用户确认）

| 决策点 | 结论 |
| --- | --- |
| 卡片样式 | 方案 A：满图海报 + 底部渐变信息条 |
| 底部信息条 | 第一行：职业图标 + 角色名 + 名望/战斗力 + 冒险团名（有则显示）；第二行：输出显示模拟/秒伤，辅助显示增益量/太阳增益 |
| 删除按钮 | 右上角仅删除按钮，图标 `npc-close`（无编辑按钮） |
| 点击交互 | 点击海报任意处 → 打开编辑弹窗（n-modal CharacterForm） |
| 创建表单 | 「＋添加角色」也改为弹窗打开 |
| 网格宽度 | 页宽 640px → 900px；`repeat(auto-fill, minmax(110px,1fr))` 自适应列数 |
| 缺图兜底 | profile 缺失 → 深色底 + 职业图标居中（object-fit: contain） |
| 静态挂载 | 新增独立前缀 `/characters-images` → `images/characters` |

## 架构与组件

### 静态资源

- 后端 `backend/app/config.py`：新增 `characters_dir: str = "../images/characters"`，对齐既有 `images_dir` 模式。
- 后端 `backend/app/main.py`：新增 `app.mount("/characters-images", StaticFiles(directory=settings.characters_dir), name="characters-images")`，与现有 `/images` 并列；沿用同款 try/except，目录不存在时 warning 跳过。
- `frontend/vite.config.ts`：proxy 增加 `'/characters-images': 'http://localhost:8000'`。

### 路径拼接

`frontend/src/lib/job.ts` 新增：

```ts
export function characterProfile(parentName: string, jobName: string): string {
  return `/characters-images/${parentName}/${jobName}/profile.png`
}
```

与 `jobIcon` / `categoryIcon` 风格一致，纯函数可单测。

### 组件

1. **`CharacterPoster.vue`（新增）**：纯展示海报卡片。
   - props：`Character`
   - 内部拼 profile URL（用 `character.parent_name` / `character.job_name`）
   - 主图 `<img>` 用 `object-fit: cover` 铺满 3:4 卡片（profile 源图比例各异，cover 裁剪，视觉统一）
   - `<img>` 带 `@error` 兜底：加载失败 → 切为深色底 + 职业图标居中（`jobIcon(job_name)`，`object-fit: contain`）；用局部 state flag 保证只替换一次，防循环替换
   - 底部信息条两行：
     - 第一行：`jobIcon`（20px）+ 名字 + `名望 N`（输出 `· 战斗力 X` 用 `toLocaleString('en-US')` 千分位，有冒险团 `· 团名`）
     - 第二行（小号字）：输出 `模拟 X · 秒伤 Y`（复用 `fmtDps`，null → 暂无）；辅助 `增益 X · 太阳 Y`（复用 `fmtBuff`，null → 暂无）
   - emit：`click`（编辑）、`delete`
   - 删除按钮 `@click.stop`，图标 `npc-close`，`confirmDialog` 强确认后 `api.del` → 父级 `load()`

2. **`MyCharactersView.vue`（重构）**：
   - `dnf-page` `max-width` 640px → 900px
   - 卡片循环从 `<DnfFrame>` 横向条改为 grid 容器内渲染 `CharacterPoster`
   - `sorted` computed 不变（type/fame/party 三种排序仍作用于网格顺序）
   - 创建/编辑均用 n-modal 弹窗承载现有 `CharacterForm`（复用，不改其内部逻辑）
   - 页头保留：「＋添加角色」（改为弹窗）、「冒险团管理」、排序下拉

### 数据流

- 编辑：点海报 → `editing = c` → n-modal 打开 `CharacterForm` → `saved` → 关弹窗 + `load()`
- 创建：点「＋添加角色」→ n-modal 打开 `CharacterForm(editing=null)` → `saved` → 关弹窗 + `load()`
- 删除：点 `npc-close` → `confirmDialog` → `api.del('/api/me/characters/{id}')` → `load()`；失败 `notifyError`（现有逻辑复用）

### 缺图覆盖缺口

`imperialknight/breaker`、`priest_female/infighter_female` 两个职业无 profile 图，
恰好走缺图兜底路径（深色底 + 职业图标居中）。

## 错误处理

- profile 图 404：`@error` 切换兜底，不阻断页面；两次失败不再递归（防循环替换，参照现有 `handleIconError` 的判重思路）。
- 删除失败：`notifyError` 展示，不清除列表。
- 静态目录不存在：后端启动 warning 跳过挂载（同 `/images` 现状），页面只走兜底图。

## 测试

- **`lib/job.spec.ts`**：`characterProfile('archer','hunter')` → `'/characters-images/archer/hunter/profile.png'`
- **`CharacterPoster.spec.ts`（新）**：正常 URL 拼接；缺图兜底（触发 img `error` 事件后 src 切换为 jobIcon）；底部信息条文案（名望/战斗力/冒险团名、辅助不显示战斗力；第二行输出显示模拟/秒伤、辅助显示增益/太阳、null 显示暂无）
- **`MyCharactersView.spec.ts`（改）**：
  - 现有排序/性别/战斗力等断言从 DnfFrame 内 `<b>` 定位改为海报卡片内名字元素定位
  - 新增：点海报 → 编辑弹窗打开；右上角 `npc-close` 删除按钮 → confirmDialog → `api.del` 调用；「＋添加角色」→ 创建弹窗
  - 移除不再适用的「点 DnfFrame 关编辑框」「编辑表单内联于卡片下方」等旧交互用例
- 类型检查：`npm run build`（vue-tsc）通过

## 不做的事（明确非目标）

- 不改其他展示角色的模块（SignupModal / RosterPool / CharacterCard 等）——它们仍用 32px 职业图标
- 不引入角色个人自定义头像（仍只用职业默认 profile）
- 不把 profile 图并入 `images/adventure` 或改 `images_dir` 指向（避免回归）
