<script setup lang="ts">
import { computed } from 'vue'
import type { Wave } from '../types'
import SlotCell from './SlotCell.vue'
import { SQUAD_NAMES } from '../lib/colors'
import { sumSquadDamage } from '../lib/damage'

const props = defineProps<{
  wave: Wave
  editable: boolean
  isAdmin: boolean
  canDelete: boolean
  currentUserId: number | null
  moveMode?: boolean
  movingSlotId?: number | null
  slackCharIds?: Set<number>
}>()
const emit = defineEmits<{
  (e: 'pick', slot: any): void
  (e: 'duty', slot: any, duty: string): void
  (e: 'remove', slot: any): void
  (e: 'deleteWave', index: number): void
  (e: 'manage', slot: any): void
  (e: 'moveTo', slot: any): void
  (e: 'parallelize', wave: Wave): void
  (e: 'unparallelize', wave: Wave): void
}>()

const squads = computed(() => {
  const n = Math.max(...props.wave.slots.map(s => s.squad_index)) + 1
  return Array.from({ length: n }, (_, sq) => props.wave.slots.filter(s => s.squad_index === sq))
})
const counts = computed(() =>
  squads.value.map(g => ({ filled: g.filter(s => s.character_id != null).length, total: g.length })))
const totals = computed(() => squads.value.map(sumSquadDamage))
const waveLabel = computed(() =>
  props.wave.group_id == null
    ? `第 ${props.wave.round_index} 波`
    : `第 ${props.wave.round_index} 波 ${props.wave.group_index} 团`)
</script>

<template>
  <div class="dnf-panel" style="margin:20px 0;padding:14px">
    <div class="wave-head">
      <b class="dnf-title">{{ waveLabel }}</b>
      <span style="margin-left:auto;display:flex;gap:12px;align-items:center">
        <a v-if="isAdmin && wave.group_id == null" href="#" class="wave-link"
           data-act="parallelize" @click.prevent="emit('parallelize', wave)">并行到…</a>
        <a v-if="isAdmin && wave.group_id != null" href="#" class="wave-link"
           data-act="unparallelize" @click.prevent="emit('unparallelize', wave)">取消并行</a>
        <a v-if="canDelete" href="#" class="wave-delete"
           @click.prevent="emit('deleteWave', wave.index)">删除本波</a>
      </span>
    </div>
    <div class="squad-grid">
      <div v-for="(g, i) in squads" :key="i" class="squad-col" :class="'squad-' + i">
        <div class="squad-head">{{ SQUAD_NAMES[i] }} · {{ counts[i].filled }}/{{ counts[i].total }}</div>
        <div v-if="totals[i].hasOutput && (totals[i].simulated > 0 || totals[i].sustained > 0)" class="squad-stats">
          总输出 {{ totals[i].simulated }}亿 · 秒伤 {{ totals[i].sustained }}亿
        </div>
        <div class="squad-cells">
          <SlotCell v-for="slot in g" :key="slot.id" :slot="slot" :squad-index="i"
                    :editable="editable && (isAdmin || slot.owner_id === currentUserId)"
                    :pickable="editable && slot.character_id == null && !moveMode"
                    :is-admin="isAdmin" :move-mode="moveMode" :moving="slot.id === movingSlotId"
                    :grayed="slackCharIds?.has(slot.character_id ?? -1) ?? false"
                    @pick="emit('pick', $event)" @duty="(s, d) => emit('duty', s, d)"
                    @remove="emit('remove', $event)" @manage="emit('manage', $event)"
                    @moveTo="emit('moveTo', $event)" />
        </div>
      </div>
    </div>
  </div>
</template>
