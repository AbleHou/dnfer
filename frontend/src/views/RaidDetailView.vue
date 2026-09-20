<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useRaidStore, applyEvent } from '../stores/raid'
import { connectRaidWs } from '../api/ws'
import WaveSection from '../components/WaveSection.vue'
import { formatDateTime } from '../utils/datetime'
import CharacterPickerModal from '../components/CharacterPickerModal.vue'
import SlotActionModal from '../components/SlotActionModal.vue'
import { useSlotMove } from '../composables/useSlotMove'
import { confirmDialog, notifyError, notifySuccess, notifyWarning } from '../lib/notify'
import type { Character, Duty, Slot } from '../types'

const route = useRoute()
const auth = useAuthStore()
const store = useRaidStore()
const rid = Number(route.params.id)

const pickSlot = ref<Slot | null>(null)
const manageSlot = ref<Slot | null>(null)
const { movingSlot, pickUp, cancel, moveTo } = useSlotMove(rid, load)
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
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && movingSlot.value) cancel() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => { disconnect?.(); window.removeEventListener('keydown', onKeydown) })

async function onPick(slot: Slot) { pickSlot.value = slot }
function onManage(slot: Slot) { manageSlot.value = slot }
function onReplace(slot: Slot) { manageSlot.value = null; pickSlot.value = slot }
function onPickUp(slot: Slot) { manageSlot.value = null; pickUp(slot) }
function onRemoveFromMenu(slot: Slot) { manageSlot.value = null; void onRemove(slot) }
async function onMoveTo(target: Slot) {
  try {
    const r = await moveTo(target)
    if (r.warnings.length) notifyWarning(r.warnings.join('；'))
  } catch (e: any) { notifyError(e.message) }
}
async function onSelectCharacter(c: Character, duty: Duty) {
  if (!pickSlot.value) return
  try {
    // replace：遇到角色已占位/同玩家同波已占时自动撤下冲突格子，而非报错
    const r = await api.post<{ slot: Slot; warnings: string[]; removed_slots?: Slot[] }>(
      `/api/raids/${rid}/slots/${pickSlot.value.id}/fill`,
      { character_id: c.id, duty, replace: true })
    const moved = r.removed_slots?.length ? '已替换原占位角色' : ''
    const msg = r.warnings.length ? r.warnings.join('；') + (moved ? '，' + moved : '') : moved
    if (r.warnings.length) notifyWarning(msg)
    else if (moved) notifySuccess(moved)
  } catch (e: any) { notifyError(e.message) }
  pickSlot.value = null
  await load()
}
async function onDuty(slot: Slot, duty: string) {
  try { await api.put(`/api/raids/${rid}/slots/${slot.id}/duty`, { duty }) }
  catch (e: any) { notifyError(e.message) }
  await load()
}
async function onRemove(slot: Slot) {
  try { await api.del(`/api/raids/${rid}/slots/${slot.id}`) }
  catch (e: any) { notifyError(e.message) }
  await load()
}
async function onAddWave() {
  try { await api.post(`/api/raids/${rid}/waves`) } catch (e: any) { notifyError(e.message) }
  await load()
}
async function onToggleLock() {
  const act = store.raid?.locked ? 'unlock' : 'lock'
  try { await api.post(`/api/raids/${rid}/${act}`) } catch (e: any) { notifyError(e.message) }
  await load()
}
async function onDeleteWave(index: number) {
  const ok = await confirmDialog({ content: `确认删除第 ${index} 波？` })
  if (!ok) return
  try { await api.del(`/api/raids/${rid}/waves/${index}`) } catch (e: any) { notifyError(e.message) }
  await load()
}
</script>

<template>
  <div v-if="store.raid" class="dnf-page">
    <div class="page-head" style="flex-wrap:wrap;gap:10px">
      <h2 style="margin:0">{{ store.raid.name }}</h2>
      <span v-if="store.raid.dungeon_name" style="color:var(--dnf-text-muted)">{{ store.raid.dungeon_name }}</span>
      <span style="color:var(--dnf-text-faint)">{{ store.raid.size }} 人 · {{ formatDateTime(store.raid.starts_at) }}</span>
      <span class="dnf-badge" :class="store.raid.locked ? 'dnf-badge-danger' : 'dnf-badge-ok'">
        {{ store.raid.locked ? '已锁定' : '未锁定' }}
      </span>
      <span style="margin-left:auto;display:flex;gap:8px">
        <button v-if="auth.isAdmin" class="dnf-btn" @click="onToggleLock">{{ store.raid.locked ? '解锁' : '锁定' }}</button>
        <button v-if="editable" class="dnf-btn dnf-btn-primary" @click="onAddWave">＋ 添加一波</button>
      </span>
    </div>

    <div v-if="movingSlot" class="move-hint" style="display:flex;align-items:center;gap:10px;margin:10px 0">
      <span style="color:var(--dnf-gold-hi)">移动中：{{ movingSlot.owner_nickname }}（{{ movingSlot.character_name }}）→ 点击目标格</span>
      <button class="dnf-btn dnf-btn-sm" @click="cancel()">取消移动（Esc）</button>
    </div>

    <WaveSection v-for="w in store.raid.waves" :key="w.id"
                 :wave="w" :editable="editable" :is-admin="auth.isAdmin"
                 :can-delete="auth.isAdmin || (store.raid.waves.length > 1)"
                 :current-user-id="auth.user?.id ?? null"
                 :move-mode="movingSlot != null" :moving-slot-id="movingSlot?.id ?? null"
                 @pick="onPick" @duty="onDuty" @remove="onRemove"
                 @delete-wave="onDeleteWave" @manage="onManage" @moveTo="onMoveTo" />

    <SlotActionModal :open="manageSlot != null" :slot="manageSlot"
                     @close="manageSlot = null" @replace="onReplace"
                     @pickUp="onPickUp" @remove="onRemoveFromMenu" />

    <CharacterPickerModal :open="pickSlot != null" :admin-mode="auth.isAdmin"
                          @close="pickSlot = null" @select="onSelectCharacter" />
  </div>
</template>
