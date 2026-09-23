<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { NModal, NSelect } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { defaultDuty, dutyOptions } from '../lib/duty'
import CharacterCard from './CharacterCard.vue'
import type { Character, Duty, PlayerCharacters, CharacterPlacement } from '../types'

const props = withDefaults(defineProps<{
  open: boolean; adminMode?: boolean; signupUserIds?: number[]
  placed?: Record<number, CharacterPlacement>
}>(), { placed: () => ({}) })
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', c: Character, duty: Duty): void }>()
const auth = useAuthStore()
const characters = ref<Character[]>([])
const players = ref<PlayerCharacters[]>([])
const playerId = ref<number | null>(null)
const selected = ref<Character | null>(null)
const duty = ref<Duty>('主C')

watch(() => props.open, async (open) => {
  if (!open) { selected.value = null; return }
  if (props.adminMode) {
    const ids = new Set(props.signupUserIds ?? [])
    players.value = (await api.get<PlayerCharacters[]>('/api/admin/characters'))
      .filter(p => ids.has(p.user.id))
    const mine = players.value.find(p => p.user.id === auth.user?.id) ?? players.value[0]
    playerId.value = mine?.user.id ?? null
    characters.value = mine?.characters ?? []
  } else {
    characters.value = await api.get<Character[]>('/api/me/characters')
  }
}, { immediate: true })

function onPlayerChange(id: number) {
  playerId.value = id
  selected.value = null
  characters.value = players.value.find(p => p.user.id === id)?.characters ?? []
}
function choose(c: Character) { selected.value = c; duty.value = defaultDuty(c.class_type) }
function confirmPick() { if (selected.value) emit('select', selected.value, duty.value) }
const playerOptions = computed(() => players.value.map(p => ({
  label: `${p.user.nickname}（${p.user.username}）`, value: p.user.id })))
const options = computed(() =>
  selected.value ? dutyOptions(selected.value.class_type).map(v => ({ label: v, value: v })) : [])
</script>

<template>
  <n-modal :show="open" preset="card" title="选择角色" style="width:min(420px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="adminMode && !players.length" style="color:var(--dnf-text-faint)">还没有人报名</p>
      <n-select v-else-if="adminMode" class="player-select" size="small" filterable
                :options="playerOptions" :value="playerId"
                @update:value="onPlayerChange" placeholder="选择玩家"
                style="margin-bottom:10px" />
      <CharacterCard v-for="c in characters" :key="c.id" :character="c"
                     :placement="placed[c.id] ?? null" :active="selected?.id === c.id"
                     @click="choose(c)" />
      <p v-if="!characters.length" style="color:var(--dnf-text-faint)">还没有角色，去「我的角色」添加</p>
      <div v-if="selected" style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <span>职责：</span>
        <n-select size="small" style="flex:1" :options="options" v-model:value="duty" />
      </div>
    </div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="dnf-btn" @click="emit('close')">关闭</button>
        <button v-if="selected" class="dnf-btn dnf-btn-primary" @click="confirmPick">确定</button>
      </div>
    </template>
  </n-modal>
</template>
