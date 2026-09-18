<script setup lang="ts">
import { computed } from 'vue'
import type { Wave } from '../types'
import SlotCell from './SlotCell.vue'
import { SQUAD_NAMES } from '../lib/colors'

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
  squads.value.map(g => ({ filled: g.filter(s => s.character_id != null).length, total: g.length })))
</script>

<template>
  <div class="dnf-panel" style="margin:20px 0;padding:14px">
    <div class="wave-head">
      <b class="dnf-title">第 {{ wave.index }} 波</b>
      <a v-if="canDelete" href="#" class="wave-delete" @click.prevent="emit('deleteWave', wave.index)">删除本波</a>
    </div>
    <div class="squad-grid">
      <div v-for="(g, i) in squads" :key="i" class="squad-col" :class="'squad-' + i">
        <div class="squad-head">{{ SQUAD_NAMES[i] }} · {{ counts[i].filled }}/{{ counts[i].total }}</div>
        <div class="squad-cells">
          <SlotCell v-for="slot in g" :key="slot.id" :slot="slot" :squad-index="i"
                    :editable="editable && (isAdmin || slot.owner_id === currentUserId)"
                    :pickable="editable && slot.character_id == null"
                    @pick="emit('pick', $event)" @duty="(s, d) => emit('duty', s, d)"
                    @remove="emit('remove', $event)" />
        </div>
      </div>
    </div>
  </div>
</template>
