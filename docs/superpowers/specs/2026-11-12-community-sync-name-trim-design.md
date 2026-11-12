# 社区同步角色名首尾去空格 · 设计文档

日期：2026-11-12
状态：设计已确认，待实现

## 背景与目标

DNF 游戏昵称体系历史允许昵称中包含空格，因此「同步社区」（dnfbbz 社区数据）获取到的角色名可能带首尾空格；而游戏现已不允许昵称带空格。当前 `_process_one` 直接用社区返回的 `roleName` 做精确匹配与创建，导致带空格的名字无法命中库里同名的无空格角色（产生近似重复），或把空格直接写进新建角色名。

目标：**对社区获取的角色名做首尾去空格**，再用于比对与录入；不动库内已有角色的名字。

## 设计决策（已与用户确认）

| 决策点 | 结论 |
| --- | --- |
| 去空格范围 | **首尾任意空白均可去**（含全角空格 `\u3000`、NBSP 等 Unicode 空白），**中间空白不去** |
| 实现 | `re.sub(r"^\s+|\s+$", "", role_name)`（Python `re` 的 `\s` 默认 Unicode 语义，覆盖 `\u3000`/NBSP；模块已 `import re`） |
| 空名处理 | 去空后为空串 → `action=skipped, reason=角色名为空`，不创建空名角色，不阻断其余角色 |
| 匹配语义 | 匹配查询 `Character.name == 去空后名字` 保持**精确匹配**，**不归一化库侧**（历史带空格角色可能产生近似重复，接受） |
| 创建 | 新建角色名用去空后的值 |
| 结果展示 | 结果表格 `roleName` 展示去空后的值 |
| 空名检查位置 | 在职业解析**之前**（与「职业未收录」平级） |
| 前端 | **零改动**（结果表格本就渲染 `roleName`） |

## 改动点

`backend/app/services/community_sync.py` → `_process_one`（约 4 行）：

```
role_name = re.sub(r"^\s+|\s+$", "", role.get("roleName") or "")
if not role_name:
    return {roleName: role_name, job, jobName: None, action: "skipped",
            reason: "角色名为空", characterId: None, profileImported: False}
# 之后 resolve_job → 匹配 → 创建/更新 全部用去空后的 role_name
```

## 测试（后端 `tests/test_community_sync.py` 新增）

1. 社区返回 `" 剑魂 "`（前后空格）→ 创建 `剑魂`，`action=created`，结果 `roleName="剑魂"`；
2. 社区返回 `"\u3000剑魂\u3000"`（全角空格）→ 同样创建 `剑魂`；
3. 社区返回 `"   "`（全空格）→ `action=skipped, reason=角色名为空`，不建角色；
4. 预置 `剑魂`，社区返回 `" 剑魂 "` → 命中更新（`action=updated`），不重复新建。

## 非目标

- 不归一化库内已有角色名（历史带空格角色不去动）
- 不动中间空格
- 不改前端 / sibling 项目
