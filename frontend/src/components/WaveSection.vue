<script setup lang="ts">
import { computed } from 'vue'
import type { Wave } from '../types'
import SlotCell from './SlotCell.vue'
import { SQUAD_COLORS, SQUAD_LIGHT, SQUAD_NAMES } from '../lib/colors'

const props = defineProps<{
  wave: Wave
  editable: boolean
  isAdmin: boolean
  canDelete: boolean
  currentUserId: number | null
}>()
const emit = defineEmits<{
  (e: 'pick', slot: any): void
  (e: 'duty', slot: any, duty: string): void
  (e: 'remove', slot: any): void
  (e: 'deleteWave', index: number): void
}>()

const squads = computed(() => {
  const n = Math.max(...props.wave.slots.map(s => s.squad_index)) + 1
  return Array.from({ length: n }, (_, sq) => props.wave.slots.filter(s => s.squad_index === sq))
})
const counts = computed(() =>
  squads.value.map(group => ({ filled: group.filter(s => s.character_id != null).length, total: group.length })))
</script>

<template>
  <div style="margin:24px 0">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <b>第 {{ wave.index }} 波</b>
      <span style="color:#888;font-size:12px">
        {{ squads.map((g, i) => `${SQUAD_NAMES[i]} ${counts[i].filled}/${counts[i].total}`).join(' · ') }}
      </span>
      <a v-if="canDelete" href="#" style="color:#c62828;font-size:12px"
         @click.prevent="emit('deleteWave', wave.index)">删除本波</a>
    </div>
    <table style="border-collapse:collapse;width:100%;min-width:600px">
      <thead>
        <tr>
          <th v-for="(g, i) in squads" :key="i"
              :style="{ background: SQUAD_COLORS[i], color: '#fff', padding: '8px', border: '1px solid #ddd' }">
            {{ SQUAD_NAMES[i] }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in 4" :key="row">
          <SlotCell v-for="(g, i) in squads" :key="g[0].id"
                    :slot="g[row - 1]" :color="SQUAD_LIGHT[i]"
                    :editable="editable && (isAdmin || g[row-1].owner_id === currentUserId)"
                    :pickable="editable && g[row-1].character_id == null"
                    @pick="emit('pick', $event)" @duty="(s, d) => emit('duty', s, d)"
                    @remove="emit('remove', $event)" />
        </tr>
      </tbody>
    </table>
  </div>
</template>
