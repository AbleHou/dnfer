<script setup lang="ts">
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import { SQUAD_NAMES } from '../lib/colors'
import type { Character, CharacterPlacement } from '../types'

defineProps<{ character: Character; placement: CharacterPlacement | null; active?: boolean }>()
const emit = defineEmits<{ (e: 'click', c: Character): void }>()

function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <div class="char-pick" :class="{ active }" @click="emit('click', character)">
    <img :src="jobIcon(character.job_name)" @error="onIconError"
         style="width:28px;height:28px;margin-right:8px">
    <div style="flex:1">
      <b>{{ character.name }}</b>
      <span style="color:var(--dnf-text-muted);font-size:12px">
        {{ character.job_title }} · {{ character.class_type }} · 名望 {{ character.fame }}
      </span>
      <div style="color:var(--dnf-text-faint);font-size:12px">
        {{ character.class_type === '输出'
          ? `模拟 ${fmtDps(character.simulated_damage)} · 秒伤 ${fmtDps(character.sustained_dps)}`
          : `增益 ${fmtBuff(character.buff_amount)}` }}
      </div>
    </div>
    <span v-if="placement" class="placed-badge">
      已占位 · 第{{ placement.wave_index }}波 · {{ SQUAD_NAMES[placement.squad_index] ?? `队${placement.squad_index + 1}` }}
    </span>
  </div>
</template>

<style scoped>
.placed-badge {
  flex-shrink: 0; align-self: flex-start;
  background: var(--dnf-gold); color: #1a1205;
  border-radius: 4px; padding: 2px 6px;
  font-size: 11px; font-weight: bold;
}
</style>
