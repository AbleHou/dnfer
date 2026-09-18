<script setup lang="ts">
import { computed } from 'vue'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Slot } from '../types'
import DutySelect from './DutySelect.vue'

const props = defineProps<{
  slot: Slot
  squadIndex: number
  editable: boolean
  pickable: boolean
}>()
const emit = defineEmits<{
  (e: 'pick', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'remove', slot: Slot): void
}>()

const occupied = computed(() => props.slot.character_id != null)
const attrs = computed(() => {
  const s = props.slot
  if (s.character_class === '输出') return `模拟 ${fmtDps(s.simulated_damage)} · 秒伤 ${fmtDps(s.sustained_dps)}`
  if (s.character_class === '辅助') return `增益 ${fmtBuff(s.buff_amount)}`
  return ''
})
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <div class="slot-cell" :class="[
    { occupied, pickable, empty: !occupied && !pickable },
    `squad-${squadIndex}`,
  ]">
    <template v-if="occupied">
      <div>
        <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
        <span style="color:var(--dnf-text-muted);font-size:12px">（{{ slot.character_name }}）</span>
        <img v-if="slot.job_name" :src="jobIcon(slot.job_name)" @error="onIconError"
             style="width:20px;height:20px;margin-left:6px;vertical-align:middle">
        <span v-if="slot.job_title" style="color:var(--dnf-text-muted);font-size:12px;margin-left:6px">{{ slot.job_title }}</span>
        <DutySelect v-if="editable" :class-type="slot.character_class!" :model-value="slot.duty"
                    @update:model-value="(d) => emit('duty', slot, d)" />
        <span v-else class="dnf-badge" style="font-size:11px;color:var(--dnf-gold-hi);border-color:var(--dnf-gold-deep)">{{ slot.duty }}</span>
      </div>
      <div style="color:var(--dnf-text-faint);font-size:12px;margin-top:2px">
        {{ attrs }}
        <a v-if="editable" href="#" style="margin-left:8px;color:var(--dnf-danger)"
           @click.prevent="emit('remove', slot)">撤下</a>
      </div>
    </template>
    <button v-else-if="pickable" class="pick-btn" @click="emit('pick', slot)">＋ 点击占位</button>
    <span v-else>—</span>
  </div>
</template>
