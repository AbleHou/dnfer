<script setup lang="ts">
import { reactive, watch } from 'vue'
import { DnfButton, DnfCheckbox, DnfDialog, DnfNumberInput } from '@dnftools/ui'
import type { SquadTarget } from '../lib/roster'

const props = defineProps<{ open: boolean; squadLabel: string; target: SquadTarget | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'save', t: SquadTarget): void }>()

interface Draft {
  outCount: number | null; simMin: number | null; simMax: number | null
  buffMin: number | null; buffMax: number | null; sunCount: number | null; slack: boolean
}
const draft = reactive<Draft>({ outCount: null, simMin: null, simMax: null,
  buffMin: null, buffMax: null, sunCount: null, slack: false })

watch(() => props.open, (open) => {
  if (!open) return
  const t = props.target ?? {}
  draft.outCount = t.outputs?.count ?? null
  draft.simMin = t.outputs?.simMin ?? null
  draft.simMax = t.outputs?.simMax ?? null
  draft.buffMin = t.mainHeal?.buffMin ?? null
  draft.buffMax = t.mainHeal?.buffMax ?? null
  draft.sunCount = t.sunHeal?.count ?? null
  draft.slack = t.slack ?? false
}, { immediate: true })  // immediate：测试直接以 open:true 挂载也要预填

function num(n: number | null): number | undefined { return n == null ? undefined : n }
function toTarget(): SquadTarget {
  const t: SquadTarget = {}
  if (draft.outCount != null || draft.simMin != null || draft.simMax != null) {
    t.outputs = { count: num(draft.outCount), simMin: num(draft.simMin), simMax: num(draft.simMax) }
  }
  if (draft.buffMin != null || draft.buffMax != null) {
    t.mainHeal = { buffMin: num(draft.buffMin), buffMax: num(draft.buffMax) }
  }
  if (draft.sunCount != null) t.sunHeal = { count: num(draft.sunCount) }
  if (draft.slack) t.slack = true
  return t
}
</script>

<template>
  <DnfDialog :open="open" :title="`${squadLabel} 编队目标`" width="min(380px,92vw)" modal close-on-outside
             @update:open="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="tgt-row"><span class="tgt-label">输出个数</span>
        <DnfNumberInput :model-value="draft.outCount ?? 0" @update:model-value="v => draft.outCount = v" :min="0" data-test="tgt-out-count" style="width:90px" /></div>
      <div class="tgt-row"><span class="tgt-label">总模拟伤害下限</span>
        <DnfNumberInput :model-value="draft.simMin ?? 0" @update:model-value="v => draft.simMin = v" :min="0" data-test="tgt-sim-min" style="width:140px" /></div>
      <div class="tgt-row"><span class="tgt-label">总模拟伤害上限</span>
        <DnfNumberInput :model-value="draft.simMax ?? 0" @update:model-value="v => draft.simMax = v" :min="0" data-test="tgt-sim-max" style="width:140px" /></div>
      <div class="tgt-row"><span class="tgt-label">主奶增益下限</span>
        <DnfNumberInput :model-value="draft.buffMin ?? 0" @update:model-value="v => draft.buffMin = v" :min="0" data-test="tgt-buff-min" style="width:140px" /></div>
      <div class="tgt-row"><span class="tgt-label">主奶增益上限</span>
        <DnfNumberInput :model-value="draft.buffMax ?? 0" @update:model-value="v => draft.buffMax = v" :min="0" data-test="tgt-buff-max" style="width:140px" /></div>
      <div class="tgt-row"><span class="tgt-label">太阳奶个数</span>
        <DnfNumberInput :model-value="draft.sunCount ?? 0" @update:model-value="v => draft.sunCount = v" :min="0" data-test="tgt-sun-count" style="width:90px" /></div>
      <DnfCheckbox :model-value="draft.slack" @update:model-value="v => draft.slack = v === true" data-test="tgt-slack">划水豁免（不计较输出/奶量）</DnfCheckbox>
    </div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <DnfButton data-test="tgt-close" @click="emit('close')">取消</DnfButton>
        <DnfButton tone="gold" data-test="tgt-save" @click="emit('save', toTarget())">保存</DnfButton>
      </div>
    </template>
  </DnfDialog>
</template>

<style scoped>
.tgt-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tgt-label { color: var(--dnf-text-muted,#9aa3b2); }
</style>
