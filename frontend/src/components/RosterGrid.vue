<script setup lang="ts">
import type { Character, Slot, Wave } from '../types'
import RosterSlot from './RosterSlot.vue'
import { SQUAD_NAMES } from '../lib/colors'
import { squadOverview, squadSlotsOf } from '../lib/roster'
import type { SquadOverview, SquadTargets } from '../lib/roster'

const props = defineProps<{
  groups: Wave[]           // 当前轮所有并行团
  targets: SquadTargets
  canEdit: boolean
  holding: Character | null
}>()
const emit = defineEmits<{
  (e: 'place', slot: Slot): void
  (e: 'manage', slot: Slot): void
  (e: 'remove', slot: Slot): void
  (e: 'duty', slot: Slot, duty: string): void
  (e: 'pickUp', slot: Slot): void
  (e: 'editTarget', squadIndex: number): void
}>()

function groupLabel(w: Wave): string {
  return w.group_id == null ? `第 ${w.round_index} 波` : `第 ${w.round_index} 波 ${w.group_index} 团`
}
function squadsOf(w: Wave): { index: number; slots: Slot[]; overview: SquadOverview }[] {
  return squadSlotsOf(w).map((slots, i) => ({ index: i, slots, overview: squadOverview(slots, props.targets[i]) }))
}
function dimText(d: SquadOverview['dims'][number], slack: boolean): string {
  const tgt = d.min != null && d.max != null ? `${d.min}~${d.max}` : (d.min ?? d.max) != null ? `${d.min ?? d.max}` : ''
  let margin = ''
  // slack 时 squadOverview 强制 ok=true 但保留原始 diff——不输出 margin，避免「✓(差N)」矛盾
  if (!slack && d.diff != null && d.diff !== 0 && (d.key === 'simDamage' || d.key === 'mainHealBuff')) {
    margin = d.diff > 0 ? `(+${d.diff})` : `(差${-d.diff})`
  }
  return `${d.label} ${d.actual ?? '—'}/${tgt} ${d.ok ? '✓' : '✗'}${margin}`
}
</script>

<template>
  <div class="roster-grid">
    <div v-for="g in groups" :key="g.id" class="roster-group">
      <div class="roster-group-label">{{ groupLabel(g) }}</div>
      <div v-for="sq in squadsOf(g)" :key="sq.index" class="roster-squad">
        <div class="roster-squad-head">
          <b>{{ SQUAD_NAMES[sq.index] ?? `队${sq.index + 1}` }}</b>
          <span style="color:var(--dnf-text-faint)">
            {{ sq.slots.filter(s => s.character_id != null).length }}/{{ sq.slots.length }}
          </span>
          <button v-if="canEdit" class="dnf-btn dnf-btn-sm"
                  :data-act="`edit-target-${sq.index}`" @click="emit('editTarget', sq.index)">目标</button>
        </div>
        <div class="roster-squad-status"
             :class="sq.overview.slack || sq.overview.ok ? 'ok' : 'warn'">
          <template v-if="!targets[sq.index] || sq.overview.dims.length === 0">未设目标</template>
          <template v-else>
            <span v-if="sq.overview.slack" class="dim-slack">划水豁免</span>
            <span v-if="sq.overview.ok && !sq.overview.slack">达标 ✓ </span>
            <span v-for="d in sq.overview.dims" :key="d.key"
                  :class="d.ok ? 'dim-ok' : 'dim-warn'">{{ dimText(d, sq.overview.slack) }}</span>
          </template>
        </div>
        <RosterSlot v-for="s in sq.slots" :key="s.id" :slot="s" :can-edit="canEdit"
                    :drop-target="holding != null && s.character_id == null"
                    @place="emit('place', $event)" @manage="emit('manage', $event)"
                    @remove="emit('remove', $event)" @duty="(s2, d) => emit('duty', s2, d)"
                    @pickUp="emit('pickUp', $event)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.roster-grid { display: flex; gap: 16px; flex-wrap: wrap; }
.roster-group { flex: 1; min-width: 280px; }
.roster-group-label { font-weight: bold; margin-bottom: 8px; }
.roster-squad { margin-bottom: 14px; }
.roster-squad-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.roster-squad-status { font-size: 12px; padding: 2px 6px; border-radius: 4px; margin-bottom: 6px; }
.roster-squad-status.warn { color: var(--dnf-danger); }
.roster-squad-status.ok { color: var(--dnf-ok); }
.dim-ok { color: var(--dnf-ok, #34c759); }
.dim-warn { color: var(--dnf-danger, #e5484d); }
</style>
