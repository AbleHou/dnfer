<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useRaidStore, applyEvent } from '../stores/raid'
import { connectRaidWs } from '../api/ws'
import WaveSection from '../components/WaveSection.vue'
import CharacterPickerModal from '../components/CharacterPickerModal.vue'
import type { Character, Duty, Slot } from '../types'

const route = useRoute()
const auth = useAuthStore()
const store = useRaidStore()
const rid = Number(route.params.id)

const pickSlot = ref<Slot | null>(null)
const notice = ref('')
let disconnect: (() => void) | null = null

const editable = computed(() => !store.raid?.locked || auth.isAdmin)

async function load() { await store.load(rid) }

onMounted(() => {
  // 先建 WS 订阅，再拉快照（快照为最终一致性基准）；断线重连后再拉一次
  disconnect = connectRaidWs(rid, {
    onEvent: (ev) => applyEvent(store, ev),       // slot/锁定事件增量合并
    onRefresh: async () => { await load() },      // wave 增删触发全量刷新
    onReconnect: async () => { await load() },    // 重连后快照兜底
  })
  void load()
})
onBeforeUnmount(() => disconnect?.())

async function onPick(slot: Slot) { pickSlot.value = slot }
async function onSelectCharacter(c: Character, duty: Duty) {
  if (!pickSlot.value) return
  try {
    // replace：遇到角色已占位/同玩家同波已占时自动撤下冲突格子，而非报错
    const r = await api.post<{ slot: Slot; warnings: string[]; removed_slots?: Slot[] }>(
      `/api/raids/${rid}/slots/${pickSlot.value.id}/fill`,
      { character_id: c.id, duty, replace: true })
    const moved = r.removed_slots?.length ? '已替换原占位角色' : ''
    notice.value = r.warnings.length
      ? r.warnings.join('；') + (moved ? '，' + moved : '')
      : moved
    setTimeout(() => (notice.value = ''), 5000)
  } catch (e: any) { alert(e.message) }
  pickSlot.value = null
  await load()
}
async function onDuty(slot: Slot, duty: string) {
  try { await api.put(`/api/raids/${rid}/slots/${slot.id}/duty`, { duty }) }
  catch (e: any) { alert(e.message) }
  await load()
}
async function onRemove(slot: Slot) {
  try { await api.del(`/api/raids/${rid}/slots/${slot.id}`) }
  catch (e: any) { alert(e.message) }
  await load()
}
async function onAddWave() {
  try { await api.post(`/api/raids/${rid}/waves`) } catch (e: any) { alert(e.message) }
  await load()
}
async function onToggleLock() {
  const act = store.raid?.locked ? 'unlock' : 'lock'
  try { await api.post(`/api/raids/${rid}/${act}`) } catch (e: any) { alert(e.message) }
  await load()
}
async function onDeleteWave(index: number) {
  if (!confirm(`确认删除第 ${index} 波？`)) return
  try { await api.del(`/api/raids/${rid}/waves/${index}`) } catch (e: any) { alert(e.message) }
  await load()
}
</script>

<template>
  <div v-if="store.raid" style="max-width:900px;margin:24px auto">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <h2 style="margin:0">{{ store.raid.name }}</h2>
      <span v-if="store.raid.dungeon" style="color:#666">{{ store.raid.dungeon }}</span>
      <span style="color:#999">{{ store.raid.size }} 人</span>
      <span :style="{color: store.raid.locked ? '#c62828' : '#2e7d32'}">
        {{ store.raid.locked ? '已锁定' : '未锁定' }}
      </span>
      <span style="margin-left:auto;display:flex;gap:8px">
        <button v-if="auth.isAdmin" @click="onToggleLock">{{ store.raid.locked ? '解锁' : '锁定' }}</button>
        <button v-if="editable" @click="onAddWave">＋ 添加一波</button>
      </span>
    </div>

    <p v-if="notice" style="color:#e65100;background:#fff3e0;padding:8px;border-radius:4px">{{ notice }}</p>

    <WaveSection v-for="w in store.raid.waves" :key="w.id"
                 :wave="w" :editable="editable" :is-admin="auth.isAdmin"
                 :can-delete="auth.isAdmin || (store.raid.waves.length > 1)"
                 :current-user-id="auth.user?.id ?? null"
                 @pick="onPick" @duty="onDuty" @remove="onRemove"
                 @delete-wave="onDeleteWave" />

    <CharacterPickerModal :open="pickSlot != null" @close="pickSlot = null"
                          @select="onSelectCharacter" />
  </div>
</template>
