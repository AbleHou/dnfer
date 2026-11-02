<script setup lang="ts">
import { DnfButton, DnfDialog } from '@dnftools/ui'
import type { Slot } from '../types'

const props = defineProps<{ open: boolean; slot: Slot | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'replace', s: Slot): void
  (e: 'pickUp', s: Slot): void
  (e: 'remove', s: Slot): void
}>()
</script>

<template>
  <DnfDialog :open="open" title="角色操作" width="min(340px,92vw)" modal close-on-outside
             @update:open="(s: boolean) => { if (!s) emit('close') }">
    <div v-if="slot" style="margin-bottom:12px;color:var(--dnf-text-muted)">
      <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
      （{{ slot.character_name }} · {{ slot.duty }}）
      <p v-if="slot.adventure_party_name" style="margin-top:4px;color:var(--dnf-text-faint);font-size:12px">
        冒险团：{{ slot.adventure_party_name }}
      </p>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <DnfButton @click="slot && emit('replace', slot)">换人</DnfButton>
      <DnfButton @click="slot && emit('pickUp', slot)">拿起移动</DnfButton>
      <DnfButton tone="orange" @click="slot && emit('remove', slot)">撤下</DnfButton>
    </div>
    <template #footer>
      <div style="display:flex;justify-content:flex-end">
        <DnfButton @click="emit('close')">关闭</DnfButton>
      </div>
    </template>
  </DnfDialog>
</template>
