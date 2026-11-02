<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { DnfButton, DnfFrame, DnfInput, DnfTable } from '@dnftools/ui'
import type { DnfColumn } from '@dnftools/ui'
import { api } from '../api/client'
import type { CodeItem } from '../types'
import AdminNav from '../components/AdminNav.vue'

const codes = ref<CodeItem[]>([])
const singleUse = ref(true)
const expireDays = ref(7)
const error = ref('')
const generating = ref(false)

async function load() {
  codes.value = await api.get<CodeItem[]>('/api/admin/codes')
}
onMounted(load)

const cols: DnfColumn[] = [
  { key: 'code', label: '注册码' },
  { key: 'status', label: '状态' },
  { key: 'expires', label: '过期' },
]

async function genCode() {
  generating.value = true; error.value = ''
  try {
    await api.post('/api/admin/codes', { single_use: singleUse.value, expire_days: expireDays.value || null })
    await load()
  } catch (e: any) { error.value = e.message }
  finally { generating.value = false }
}
</script>

<template>
  <div class="dnf-page">
    <AdminNav />
    <h2>邀请码管理</h2>
    <DnfFrame surface="panel" class="dnf-section">
      <h3>生成注册码</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <label class="form-label" style="width:auto"><input type="checkbox" v-model="singleUse" /> 一次性</label>
        <DnfInput :model-value="expireDays.toString()" type="number" min="0"
                   placeholder="有效期(天,0=不限)"
                   @update:model-value="v => expireDays = v ? Math.trunc(Number(v)) : 0" />
        <DnfButton data-act="gen" :disabled="generating" @click="genCode">{{ generating ? '生成中…' : '生成' }}</DnfButton>
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <DnfTable label="注册码列表" :columns="cols" :rows="codes" :row-key="(r) => r.id">
        <template #cell-code="{ row }"><code>{{ row.code }}</code></template>
        <template #cell-status="{ row }">{{ row.single_use ? (row.used_by ? '已使用' : '未使用') : '多用户' }}</template>
        <template #cell-expires="{ row }">{{ row.expires_at ? new Date(row.expires_at + 'Z').toLocaleString() : '不限' }}</template>
      </DnfTable>
    </DnfFrame>
  </div>
</template>
