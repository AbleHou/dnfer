<script setup lang="ts">
import { computed } from 'vue'
import type { Slot } from '../types'
import DutySelect from './DutySelect.vue'

const props = defineProps<{
  slot: Slot
  color: string
  editable: boolean      // 是管理员或自己占的格
  pickable: boolean      // 空格且可占
}>()
const emit = defineEmits<{
  (e: 'pick', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'remove', slot: Slot): void
}>()

const bg = computed(() => props.color)
const occupied = computed(() => props.slot.character_id != null)
const attrs = computed(() => {
  const s = props.slot
  if (s.character_class === '输出') return `模拟 ${fmt(s.simulated_damage)} · 秒伤 ${fmt(s.sustained_dps)}`
  if (s.character_class === '辅助') return `增益 ${fmt(s.buff_amount)}`
  return ''
})
function fmt(n: number | null): string { return n ? String(Math.round(n / 10000)) + 'w' : '-' }
</script>

<template>
  <td :style="{ background: bg, border: '1px solid #ddd', padding: '8px', height: '60px',
                verticalAlign: 'middle', textAlign: occupied ? 'left' : 'center' }">
    <template v-if="occupied">
      <div style="color:#333">
        <b>{{ slot.owner_nickname }}</b>
        <span style="color:#777;font-size:12px">（{{ slot.character_name }}）</span>
        <DutySelect v-if="editable" :class-type="slot.character_class!"
                    :model-value="slot.duty" @update:model-value="(d) => emit('duty', slot, d)" />
        <span v-else style="background:#eee;border-radius:3px;padding:1px 5px;font-size:11px">{{ slot.duty }}</span>
      </div>
      <div style="color:#666;font-size:12px;margin-top:2px">
        {{ attrs }}
        <a v-if="editable" href="#" style="margin-left:8px;color:#c62828"
           @click.prevent="emit('remove', slot)">撤下</a>
      </div>
    </template>
    <button v-else-if="pickable" style="border:none;background:transparent;color:#888;cursor:pointer"
            @click="emit('pick', slot)">＋ 点击占位</button>
    <span v-else style="color:#ddd">—</span>
  </td>
</template>
