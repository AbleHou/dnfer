<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { NModal, NSelect } from 'naive-ui'
import { api } from '../api/client'
import { defaultDuty, dutyOptions } from '../lib/duty'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character, Duty } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', c: Character, duty: Duty): void }>()
const characters = ref<Character[]>([])
const selected = ref<Character | null>(null)
const duty = ref<Duty>('主C')
onMounted(async () => { characters.value = await api.get<Character[]>('/api/me/characters') })

function choose(c: Character) {
  selected.value = c
  duty.value = defaultDuty(c.class_type)
}
function confirmPick() { if (selected.value) emit('select', selected.value, duty.value) }
const options = computed(() =>
  selected.value ? dutyOptions(selected.value.class_type).map(v => ({ label: v, value: v })) : [])
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <n-modal :show="open" preset="card" title="选择角色" style="width:min(420px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <div v-for="c in characters" :key="c.id" class="char-pick"
           :class="{ active: selected?.id === c.id }" @click="choose(c)">
        <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:28px;height:28px;margin-right:8px">
        <div>
          <b>{{ c.name }}</b>
          <span style="color:var(--dnf-text-muted);font-size:12px">{{ c.job_title }} · {{ c.class_type }} · 名望 {{ c.fame }}</span>
          <div style="color:var(--dnf-text-faint);font-size:12px">
            {{ c.class_type === '输出' ? `模拟 ${fmtDps(c.simulated_damage)} · 秒伤 ${fmtDps(c.sustained_dps)}` : `增益 ${fmtBuff(c.buff_amount)}` }}
          </div>
        </div>
      </div>
      <p v-if="!characters.length" style="color:var(--dnf-text-faint)">还没有角色，去「我的角色」添加</p>
      <div v-if="selected" style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <span>职责：</span>
        <n-select size="small" style="flex:1" :options="options" v-model:value="duty" />
      </div>
    </div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="dnf-btn" @click="emit('close')">关闭</button>
        <button v-if="selected" class="dnf-btn dnf-btn-primary" @click="confirmPick">确定</button>
      </div>
    </template>
  </n-modal>
</template>
