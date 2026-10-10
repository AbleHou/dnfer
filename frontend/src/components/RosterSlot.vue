<script setup lang="ts">
import { computed } from 'vue'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Slot } from '../types'
import DutySelect from './DutySelect.vue'

const props = withDefaults(defineProps<{
  slot: Slot
  canEdit: boolean
  dropTarget: boolean   // 拿起态下空格为可放入目标
}>(), {})
const emit = defineEmits<{
  (e: 'place', slot: Slot): void
  (e: 'manage', slot: Slot): void
  (e: 'remove', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'pickUp', slot: Slot): void
}>()

const occupied = computed(() => props.slot.character_id != null)
const attrs = computed(() => {
  const s = props.slot
  if (s.character_class === '输出') return `模拟 ${fmt(s.simulated_damage)} · 秒伤 ${fmt(s.sustained_dps)}`
  if (s.character_class === '辅助') return `增益 ${fmt(s.buff_amount)} · 太阳 ${fmt(s.sun_buff)}`
  return ''
})
function fmt(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function onCellClick() {
  if (occupied.value) { if (props.canEdit) emit('manage', props.slot); return }
  if (props.dropTarget) emit('place', props.slot)
}
</script>

<template>
  <div class="roster-slot" :class="{ occupied, empty: !occupied, 'drop-target': dropTarget && !occupied }"
       @click="onCellClick">
    <template v-if="occupied">
      <div>
        <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
        <span style="color:var(--dnf-text-muted);font-size:12px">（{{ slot.character_name }}）</span>
        <img v-if="slot.job_name" :src="jobIcon(slot.job_name)" @error="onIconError"
             style="width:18px;height:18px;margin-left:6px;vertical-align:middle">
        <DutySelect v-if="canEdit" :class-type="slot.character_class!" :model-value="slot.duty"
                    @click.stop @update:model-value="(d) => emit('duty', slot, d)" />
        <span v-else class="dnf-badge" style="font-size:11px;color:var(--dnf-gold-hi);border-color:var(--dnf-gold-deep)">
          {{ slot.duty }}
        </span>
      </div>
      <div style="color:var(--dnf-text-faint);font-size:12px;margin-top:2px">
        {{ attrs }}
        <template v-if="canEdit">
          <a href="#" style="margin-left:8px;color:var(--dnf-danger)"
             data-act="roster-remove" @click.prevent.stop="emit('remove', slot)">撤下</a>
          <a href="#" style="margin-left:8px;color:var(--dnf-gold-hi)"
             data-act="roster-pickup" @click.prevent.stop="emit('pickUp', slot)">拿起</a>
        </template>
      </div>
    </template>
    <button v-else-if="dropTarget" class="pick-btn" @click.stop="emit('place', slot)">＋ 放入</button>
    <span v-else>—</span>
  </div>
</template>

<style scoped>
.roster-slot { border: 1px solid var(--dnf-border,#3a3f4b); border-radius: 6px; padding: 6px 8px; min-height: 52px; }
.roster-slot.drop-target { cursor: pointer; border-style: dashed; border-color: var(--dnf-accent,#ffd54a); }
.roster-slot.occupied { cursor: pointer; }
.pick-btn { background: none; border: none; color: var(--dnf-accent,#ffd54a); cursor: pointer; font: inherit; }
</style>
