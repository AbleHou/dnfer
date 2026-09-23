# 我的角色页排序 — 设计规格

日期：2026-09-23
状态：已确认
上游：无（纯前端小功能，`frontend/src/views/MyCharactersView.vue` 单视图改造）
需求来源：用户口头需求——「我的角色」界面展示角色时默认按类型（输出/辅助）排序，用户可切换按名望排序。

## 1. 目标

「我的角色」页（`/characters`，`MyCharactersView.vue`）目前按后端返回顺序平铺展示所有角色。本功能：

1. **默认按类型排序**：先分「输出 / 辅助」两大组（输出在前、辅助在后），组内再按名望降序。
2. **可切换按名望排序**：用户点按钮切到「按名望」后，全列表按名望降序。

已确认的约束与决策：

- **名望方向**：降序（名望高在前）。
- **类型组内**：也按名望降序。
- **确定性 tie-break**：名望相同按 `id` 升序（避免同值角色顺序不稳定）。
- **不排序源数组**：对 `list.value` 取排序副本（`[...list].sort(...)`），不改 `list`。
- **UI**：头部两个小按钮（`按类型` / `按名望`），复用现有 `dnf-btn dnf-btn-sm` 样式，激活态高亮；默认激活「按类型」。
- **不改后端、不加新文件**：排序逻辑两行，直接在组件 `computed` 内实现；靠组件渲染顺序测试覆盖（不引入纯函数 lib）。

## 2. 前端改动（`frontend/src/views/MyCharactersView.vue`）

### 2.1 状态与计算

```ts
import { computed, onMounted, ref } from 'vue'   // 追加 computed

type SortMode = 'type' | 'fame'
const sortMode = ref<SortMode>('type')

// 输出=0、辅助=1
const TYPE_RANK: Record<Character['class_type'], number> = { 输出: 0, 辅助: 1 }

const sorted = computed(() =>
  [...list.value].sort((a, b) => {
    if (sortMode.value === 'fame') return b.fame - a.fame || a.id - b.id
    return TYPE_RANK[a.class_type] - TYPE_RANK[b.class_type] || b.fame - a.fame || a.id - b.id
  }))
```

### 2.2 模板

- 角色卡片与内联编辑表单共用一个 `<template v-for="c in list">`，改为 `v-for="c in sorted"` 即可同时覆盖两者。
- 头部「添加角色」按钮**保持在最前**（既有测试 `wrapper.find('button')` 依赖第一个按钮是添加按钮，不得改变顺序），在其后加排序切换：

```html
<div class="page-head">
  <h2>我的角色</h2>
  <div style="display:flex;align-items:center;gap:8px">
    <button class="dnf-btn dnf-btn-primary" @click="startCreate">＋ 添加角色</button>
    <button class="dnf-btn dnf-btn-sm" :class="{ 'dnf-btn-primary': sortMode === 'type' }"
            @click="sortMode = 'type'">按类型</button>
    <button class="dnf-btn dnf-btn-sm" :class="{ 'dnf-btn-primary': sortMode === 'fame' }"
            @click="sortMode = 'fame'">按名望</button>
  </div>
</div>
```

- 激活态：用 `dnf-btn-primary` 高亮当前排序模式（对象语法 `:class="{...}"`，与代码库既有模式一致）；其余为普通 `dnf-btn-sm`。

## 3. 测试（`frontend/src/views/MyCharactersView.spec.ts` 追加）

- 默认（`type`）：返回顺序混合（如 `[奶(辅助,200), 剑魂(输出,100), 鬼泣(输出,300)]`）时，渲染卡片顺序应为「输出组在前、组内名望降序、辅助在后」→ `鬼泣(300) → 剑魂(100) → 奶(200)`。
- 切换 `按名望`：点「按名望」按钮后，顺序按名望降序（如 `[剑魂(100), 奶(200), 鬼泣(300)]` → `鬼泣(300) → 奶(200) → 剑魂(100)`）。
- 按钮激活态：默认「按类型」高亮；点「按名望」后高亮切到「按名望」。
- 断言方式：读 `wrapper.findAll('.dnf-panel')` 中角色卡片的角色名文本顺序。
- **注意**：既有 4 个测试（添加角色/保存守卫等）用 `wrapper.find('button')` 点「添加角色」——保持添加按钮在第一个即可不改这些断言。

## 4. 文档

- `CHANGELOG.md` [v1.7]（当前版本未发布，功能并入 v1.7「新增」块）→ 追加：「我的角色」页支持按类型（输出/辅助）默认排序、可切换按名望排序。
- 根 `README.md`：功能清单如提及「我的角色」可补一句（可选，视现有清单结构）。

## 5. 变更文件范围

- `frontend/src/views/MyCharactersView.vue` — 排序 computed + 切换按钮 + 模板循环改 `sorted`
- `frontend/src/views/MyCharactersView.spec.ts` — 新增排序用例
- `CHANGELOG.md` — [Unreleased] 新增

不改后端、不加迁移、无新增依赖。
