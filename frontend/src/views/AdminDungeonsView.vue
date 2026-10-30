<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { DnfButton, DnfFrame, DnfInput, DnfSelect, DnfTable } from '@dnftools/ui'
import type { DnfColumn } from '@dnftools/ui'
import { api } from '../api/client'
import { confirmDialog, notifyError } from '../lib/notify'
import type { Dungeon } from '../types'
import AdminNav from '../components/AdminNav.vue'

const dungeons = ref<Dungeon[]>([])
const dgName = ref('')
const dgSize = ref(12)
const dgDesc = ref('')
const editingId = ref<number | null>(null)
const dgError = ref('')
const dgBusy = ref(false)
const sizeOptions = [4, 8, 12, 16, 20].map(s => ({ value: s, label: `${s} 人` }))
function onSizeChange(v: unknown) {
  if (typeof v === 'number') dgSize.value = v
}

async function load() {
  dungeons.value = await api.get<Dungeon[]>('/api/dungeons')
}
onMounted(load)

const cols: DnfColumn[] = [
  { key: 'name', label: '副本' },
  { key: 'size', label: '人数' },
  { key: 'description', label: '描述' },
  { key: 'actions', label: '操作' },
]

async function saveDungeon() {
  dgBusy.value = true; dgError.value = ''
  try {
    if (editingId.value) {
      await api.put(`/api/dungeons/${editingId.value}`,
        { name: dgName.value, size: dgSize.value, description: dgDesc.value })
    } else {
      await api.post('/api/dungeons',
        { name: dgName.value, size: dgSize.value, description: dgDesc.value })
    }
    editingId.value = null; dgName.value = ''; dgSize.value = 12; dgDesc.value = ''
    await load()
  } catch (e: any) { dgError.value = e.message }
  finally { dgBusy.value = false }
}

function editDungeon(d: Dungeon) {
  editingId.value = d.id; dgName.value = d.name; dgSize.value = d.size; dgDesc.value = d.description
}

async function delDungeon(d: Dungeon) {
  const ok = await confirmDialog({ content: `确认删除副本「${d.name}」？` })
  if (!ok) return
  try { await api.del(`/api/dungeons/${d.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
</script>

<template>
  <div class="dnf-page">
    <AdminNav />
    <h2>副本管理</h2>
    <DnfFrame surface="panel" class="dnf-section">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <DnfInput v-model="dgName" placeholder="副本名称" />
        <DnfSelect :model-value="dgSize" :options="sizeOptions" label="人数"
                   @update:model-value="onSizeChange" />
        <DnfInput v-model="dgDesc" placeholder="描述（可选）" />
        <DnfButton tone="gold" data-act="save" :disabled="dgBusy" @click="saveDungeon">{{ editingId ? '保存' : '新增' }}</DnfButton>
      </div>
      <p v-if="dgError" class="form-error">{{ dgError }}</p>
      <DnfTable label="副本列表" :columns="cols" :rows="dungeons" :row-key="(r) => r.id">
        <template #cell-actions="{ row }">
          <div style="display:flex;gap:8px;white-space:nowrap">
            <DnfButton class="dnf-btn-sm" @click="editDungeon(row)">编辑</DnfButton>
            <DnfButton tone="orange" class="dnf-btn-sm" :data-act="'del-' + row.id" @click="delDungeon(row)">删除</DnfButton>
          </div>
        </template>
      </DnfTable>
    </DnfFrame>
  </div>
</template>
