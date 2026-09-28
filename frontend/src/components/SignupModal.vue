<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import type { Character } from '../types'

const props = withDefaults(defineProps<{
  open: boolean
  mode: 'signup' | 'manage'
  selectedIds: number[]
}>(), { selectedIds: () => [] })
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', ids: number[]): void
  (e: 'toggle', cid: number, checked: boolean): void
}>()

const characters = ref<Character[]>([])
const loading = ref(false)
const localSelected = ref<number[]>([])
const error = ref('')

watch(() => props.open, async (open) => {
  if (!open) return
  loading.value = true
  error.value = ''
  try {
    characters.value = await api.get<Character[]>('/api/me/characters')
    if (props.mode === 'signup') {
      localSelected.value = characters.value.map(c => c.id)  // 默认全部勾选
    }
  } catch {
    characters.value = []
  } finally {
    loading.value = false
  }
}, { immediate: true })

function isChecked(cid: number): boolean {
  return props.mode === 'manage'
    ? props.selectedIds.includes(cid)
    : localSelected.value.includes(cid)
}
function toggle(cid: number) {
  if (props.mode === 'manage') {
    emit('toggle', cid, !props.selectedIds.includes(cid))
  } else {
    localSelected.value = localSelected.value.includes(cid)
      ? localSelected.value.filter(x => x !== cid)
      : [...localSelected.value, cid]
  }
}
function submit() {
  if (!localSelected.value.length) { error.value = '至少选择一个角色'; return }
  emit('submit', [...localSelected.value])
}
</script>

<template>
  <n-modal :show="open" preset="card"
           :title="mode === 'signup' ? '报名选角色' : '管理报名角色'"
           style="width:min(420px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="loading" style="color:var(--dnf-text-faint)">加载中…</p>
      <p v-else-if="!characters.length" style="color:var(--dnf-text-faint)">
        还没有角色，去「我的角色」添加
      </p>
      <label v-for="c in characters" :key="c.id" class="signup-char">
        <input type="checkbox" :checked="isChecked(c.id)" :data-act="'char-' + c.id"
               @change="toggle(c.id)" />
        <span>{{ c.name }}</span>
        <span style="color:var(--dnf-text-faint);font-size:12px">{{ c.job_title }}</span>
        <span style="margin-left:auto;color:var(--dnf-text-muted);font-size:12px">名望 {{ c.fame }}</span>
      </label>
      <p v-if="error" style="color:var(--dnf-danger)">{{ error }}</p>
    </div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <template v-if="mode === 'signup'">
          <button class="dnf-btn" @click="emit('close')">取消</button>
          <button class="dnf-btn dnf-btn-primary" data-act="submit" @click="submit">确认报名</button>
        </template>
        <button v-else class="dnf-btn" @click="emit('close')">关闭</button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.signup-char {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; margin: 6px 0;
  border: 1px solid var(--dnf-border); border-radius: 4px;
  cursor: pointer;
}
</style>
