<script setup lang="ts">
import { NModal } from 'naive-ui'
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
  <n-modal :show="open" preset="card" title="角色操作" style="width:min(340px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div v-if="slot" style="margin-bottom:12px;color:var(--dnf-text-muted)">
      <b style="color:var(--dnf-text)">{{ slot.owner_nickname }}</b>
      （{{ slot.character_name }} · {{ slot.duty }}）
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="dnf-btn" @click="slot && emit('replace', slot)">换人</button>
      <button class="dnf-btn" @click="slot && emit('pickUp', slot)">拿起移动</button>
      <button class="dnf-btn dnf-btn-danger" @click="slot && emit('remove', slot)">撤下</button>
    </div>
    <template #footer>
      <div style="display:flex;justify-content:flex-end">
        <button class="dnf-btn" @click="emit('close')">关闭</button>
      </div>
    </template>
  </n-modal>
</template>
