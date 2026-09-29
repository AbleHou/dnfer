<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import type { Character } from '../types'
import { jobIcon, handleIconError as onIconError } from '../lib/job'

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

function fmtPower(n: number | null): string { return n == null ? '—' : String(n) }
function powerText(c: Character): string {
  return c.class_type === '输出'
    ? `${fmtPower(c.simulated_damage)}/${fmtPower(c.sustained_dps)}`
    : fmtPower(c.buff_amount)
}

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
      <template v-else>
        <div class="signup-head">
          <span></span><span>角色</span><span>职业</span><span>伤害/增益</span><span>名望</span>
        </div>
        <label v-for="c in characters" :key="c.id" class="signup-char"
               :class="{ selected: isChecked(c.id) }">
          <input type="checkbox" :checked="isChecked(c.id)" :data-act="'char-' + c.id"
                 @change="toggle(c.id)" />
          <span class="c-name">{{ c.name }}</span>
          <span class="c-job">
            <img :src="jobIcon(c.job_name)" @error="onIconError" class="job-icon" />
            {{ c.job_title }}
          </span>
          <span class="c-power">{{ powerText(c) }}</span>
          <span class="c-fame">{{ c.fame }}</span>
        </label>
      </template>
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
.signup-head, .signup-char {
  display: grid;
  grid-template-columns: auto minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto;
  gap: 8px; align-items: center;
}
.signup-head {
  font-size: 12px; color: var(--dnf-text-faint,#7a8291);
  padding: 4px 8px;
}
.signup-char {
  padding: 6px 8px; margin: 6px 0;
  border: 1px solid var(--dnf-border,#3a3f4b); border-radius: 6px;
  cursor: pointer;
}
.signup-char.selected { border-color: var(--dnf-accent,#ffd54a); }
.c-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-job {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--dnf-text-muted,#9aa3b2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.job-icon { width: 20px; height: 20px; flex-shrink: 0; }
.c-power { font-size: 12px; color: var(--dnf-text-muted,#9aa3b2); }
.c-fame { font-size: 12px; color: var(--dnf-text-muted,#9aa3b2); text-align: right; }
</style>
