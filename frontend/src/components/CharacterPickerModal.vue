<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { DnfButton, DnfDialog, DnfInput, DnfSelect } from '@dnftools/ui'
import type { DnfValue } from '@dnftools/ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { defaultDuty, dutyOptions } from '../lib/duty'
import CharacterCard from './CharacterCard.vue'
import type { Character, Duty, PlayerCharacters, CharacterPlacement } from '../types'

const props = withDefaults(defineProps<{
  open: boolean; adminMode?: boolean; signupUserIds?: number[]
  signupCharsByUser?: Record<number, number[]>
  placed?: Record<number, CharacterPlacement>
  grayByUser?: Record<number, number[]>
}>(), { placed: () => ({}), signupCharsByUser: () => ({}), grayByUser: () => ({}) })
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', c: Character, duty: Duty): void }>()
const auth = useAuthStore()
const characters = ref<Character[]>([])
const players = ref<PlayerCharacters[]>([])
const playerId = ref<number | null>(null)
const playerQuery = ref('')
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
    characters.value = filterBySignup(mine?.characters ?? [])
  } else {
    characters.value = filterBySignup(await api.get<Character[]>('/api/me/characters'))
  }
}, { immediate: true })

function filterBySignup(list: Character[]): Character[] {
  const ids = props.signupCharsByUser[currentPlayerId.value]
  return ids ? list.filter(c => ids.includes(c.id)) : list
}
function onPlayerChange(v: DnfValue | undefined) {
  const id = typeof v === 'number' ? v : null
  playerId.value = id
  selected.value = null
  characters.value = filterBySignup(players.value.find(p => p.user.id === id)?.characters ?? [])
}
const currentPlayerId = computed(() =>
  props.adminMode ? (playerId.value ?? -1) : (auth.user?.id ?? -1))
function choose(c: Character) { selected.value = c; duty.value = defaultDuty(c.class_type) }
function confirmPick() { if (selected.value) emit('select', selected.value, duty.value) }
const playerOptions = computed(() => players.value.map(p => ({
  label: `${p.user.nickname}（${p.user.username}）`, value: p.user.id })))
// filterable 降级：DnfSelect 无搜索能力，用上方原生搜索框按昵称过滤玩家下拉
const filteredPlayerOptions = computed(() => {
  const q = playerQuery.value.trim()
  return q ? playerOptions.value.filter(o => o.label.includes(q)) : playerOptions.value
})
const options = computed(() =>
  selected.value ? dutyOptions(selected.value.class_type).map(v => ({ label: v, value: v })) : [])
function onDutyChange(v: DnfValue | undefined) {
  if (typeof v === 'string' && options.value.some(o => o.value === v)) duty.value = v as Duty
}
</script>

<template>
  <DnfDialog :open="open" title="选择角色" width="min(420px,92vw)" modal close-on-outside
             @update:open="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="adminMode && !players.length" style="color:var(--dnf-text-faint)">还没有人报名</p>
      <template v-else-if="adminMode">
        <DnfInput v-model="playerQuery" placeholder="搜索玩家昵称" data-test="player-search"
                  style="margin-bottom:6px" />
        <DnfSelect class="player-select" :options="filteredPlayerOptions"
                   :model-value="playerId ?? undefined" @update:model-value="onPlayerChange"
                   placeholder="选择玩家" label="选择玩家" style="margin-bottom:10px" />
      </template>
      <CharacterCard v-for="c in characters" :key="c.id" :character="c"
                     :placement="placed[c.id] ?? null" :active="selected?.id === c.id"
                     :grayed="(grayByUser?.[currentPlayerId] ?? []).includes(c.id)"
                     @click="choose(c)" />
      <p v-if="!characters.length" style="color:var(--dnf-text-faint)">还没有角色，去「我的角色」添加</p>
      <div v-if="selected" style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <span>职责：</span>
        <DnfSelect style="flex:1" :options="options" :model-value="duty" label="职责"
                   @update:model-value="onDutyChange" />
      </div>
    </div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <DnfButton @click="emit('close')">关闭</DnfButton>
        <DnfButton v-if="selected" tone="gold" @click="confirmPick">确定</DnfButton>
      </div>
    </template>
  </DnfDialog>
</template>
