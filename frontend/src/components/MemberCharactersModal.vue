<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import CharacterCard from './CharacterCard.vue'
import type { Character, CharacterPlacement, PlayerCharacters, User } from '../types'

const props = defineProps<{
  open: boolean; rid: number; user: User | null
  placed: Record<number, CharacterPlacement>
}>()
const emit = defineEmits<{ (e: 'close'): void }>()
const characters = ref<Character[]>([])

watch(() => props.open, async (open) => {
  if (!open || !props.user) return
  characters.value = []
  try {
    const res = await api.get<PlayerCharacters>(
      `/api/raids/${props.rid}/signups/${props.user.id}/characters`)
    characters.value = res.characters
  } catch { /* 只读查看失败静默，可关闭重试 */ }
}, { immediate: true }) // immediate：测试挂载 open:true 即触发 fetch（与 CharacterPickerModal 一致）
</script>

<template>
  <n-modal :show="open" preset="card"
           :title="user ? `${user.nickname} 的角色` : ''"
           style="width:min(420px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="!characters.length" style="color:var(--dnf-text-faint)">还没有角色</p>
      <CharacterCard v-for="c in characters" :key="c.id" :character="c"
                     :placement="placed[c.id] ?? null" readonly />
    </div>
  </n-modal>
</template>
