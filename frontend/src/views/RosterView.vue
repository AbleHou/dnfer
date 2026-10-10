<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NSwitch } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useRaidStore, applyEvent } from '../stores/raid'
import { connectRaidWs } from '../api/ws'
import { buildPlacementMap } from '../lib/placement'
import { computeSlack } from '../lib/slack'
import {
  inferFillDuty, loadTargets, rankCandidates, saveTargets, squadSlotsOf,
  RECOMMEND_KEY,
} from '../lib/roster'
import type { SquadTarget, SquadTargets } from '../lib/roster'
import RosterPool from '../components/RosterPool.vue'
import RosterGrid from '../components/RosterGrid.vue'
import RosterTargetModal from '../components/RosterTargetModal.vue'
import { confirmDialog, notifyError, notifySuccess, notifyWarning } from '../lib/notify'
import type { Character, Slot, Wave } from '../types'

const route = useRoute()
const auth = useAuthStore()
const store = useRaidStore()
const rid = Number(route.params.id)
const canEdit = computed(() => auth.isAdmin)

const currentIndex = ref(1)
const holding = ref<Character | null>(null)
const recommendOn = ref(localStorage.getItem(RECOMMEND_KEY) !== '0')
const targets = ref<SquadTargets>(loadTargets(rid))
const targetModal = ref<{ open: boolean; squadIndex: number }>({ open: false, squadIndex: 0 })
let disconnect: (() => void) | null = null

const currentWave = computed<Wave | null>(() =>
  store.raid?.waves.find(w => w.index === currentIndex.value) ?? null)
const currentGroups = computed<Wave[]>(() => {
  const cw = currentWave.value
  if (!store.raid || !cw) return []
  return store.raid.waves.filter(w => w.round_index === cw.round_index)
})
const placed = computed(() => store.raid ? buildPlacementMap(store.raid) : {})

const charsByUser = computed<Record<number, Character[]>>(() => {
  const m: Record<number, Character[]> = {}
  for (const s of store.raid?.signups ?? []) m[s.user.id] = s.characters
  return m
})
const allChars = computed<Character[]>(() =>
  Object.values(charsByUser.value).flat())

// 不可拿起：仅已占任何格的角色。
// 不做「owner 当前轮已用」前端拦截：拿起态点已占格（对调/换人）时 owner 必然已占，
// 若在池中一并置灰将无法换人；「同轮限一」由后端 fill replace:true 撤冲突格兜底（spec §2.5.6）。
const blockedCharIds = computed(() => {
  const set = new Set<number>()
  for (const c of allChars.value) if (placed.value[c.id]) set.add(c.id)
  return set
})
const slackCharIds = computed(() =>
  new Set(Object.values(computeSlack(
    store.raid?.slack_rules ?? { criteria: [], exchange: [] }, charsByUser.value)).flat()))

const candidates = computed<Character[]>(() =>
  allChars.value.filter(c => !blockedCharIds.value.has(c.id)))
const ranked = computed(() => rankCandidates({
  candidates: candidates.value, groups: currentGroups.value,
  targets: targets.value, recommendOn: recommendOn.value,
}))
// 推荐 top3：开关开启时取前 3（无模板时 score 全 0，仍标「推荐」但无目标色，对齐 spec）
const recommendTop3 = computed<Set<number>>(() =>
  recommendOn.value ? new Set(ranked.value.slice(0, 3).map(r => r.character.id)) : new Set<number>())
const recommendTarget = computed<Record<number, number | null>>(() => {
  const m: Record<number, number | null> = {}
  for (const r of ranked.value) if (r.score > 0) m[r.character.id] = r.targetSquadIndex
  return m
})

// 未排统计（仅统计报了角色的人；0 角色用户不算「未排」）
const globalUnplaced = computed(() => (store.raid?.signups ?? [])
  .filter(s => s.characters.length > 0 && !s.characters.some(c => placed.value[c.id])).length)
const roundUsedCharIds = computed(() => {
  const set = new Set<number>()
  for (const w of currentGroups.value) for (const s of w.slots) if (s.character_id != null) set.add(s.character_id)
  return set
})
const roundUnplacedUsers = computed(() => (store.raid?.signups ?? [])
  .filter(s => s.characters.length > 0 && !s.characters.some(c => roundUsedCharIds.value.has(c.id))))
const roundUnplaced = computed(() => roundUnplacedUsers.value.length)
const showUnplaced = ref(false)

function waveLabel(w: Wave): string {
  return w.group_id == null ? `第 ${w.round_index} 波` : `第 ${w.round_index} 波 ${w.group_index} 团`
}

function toggleRecommend(v: boolean | string | number) {
  const on = v === true || v === 'true' || v === 1
  recommendOn.value = on
  localStorage.setItem(RECOMMEND_KEY, on ? '1' : '0')
  if (!on) holding.value = null
}

// 拿起/放下
function onPick(c: Character) {
  holding.value = holding.value?.id === c.id ? null : c
}
function onPickUp(slot: Slot) {
  const c = allChars.value.find(x => x.id === slot.character_id)
  if (c) holding.value = c
}
function squadOf(slot: Slot): Slot[] {
  const w = store.raid?.waves.find(x => x.slots.some(s => s.id === slot.id))
  if (!w) return []
  const groups = squadSlotsOf(w)
  return groups[slot.squad_index] ?? []
}
async function fill(slot: Slot, needConfirm: boolean) {
  if (!holding.value) return
  const c = holding.value
  const occupant = slot.character_id != null
  if (needConfirm && occupant) {
    const ok = await confirmDialog({ content: `将替换 ${slot.owner_nickname}（${slot.character_name}），确认？` })
    if (!ok) return
  }
  const duty = inferFillDuty(squadOf(slot), c.class_type)
  try {
    const r = await api.post<{ slot: Slot; warnings?: string[]; removed_slots?: Slot[] }>(
      `/api/raids/${rid}/slots/${slot.id}/fill`, { character_id: c.id, duty, replace: true })
    if (r?.removed_slots?.length) notifySuccess('已替换原占位角色')
    if (r?.warnings?.length) notifyWarning(r.warnings.join('；'))
  } catch (e: any) { notifyError(e.message) }
  holding.value = null
  await load()
}
async function onPlace(slot: Slot) { await fill(slot, false) }
async function onManage(slot: Slot) { await fill(slot, true) }
async function onRemove(slot: Slot) {
  try { await api.del(`/api/raids/${rid}/slots/${slot.id}`) } catch (e: any) { notifyError(e.message) }
  await load()
}
async function onDuty(slot: Slot, duty: string) {
  try { await api.put(`/api/raids/${rid}/slots/${slot.id}/duty`, { duty }) } catch (e: any) { notifyError(e.message) }
  await load()
}

// 模板
function openTarget(si: number) { targetModal.value = { open: true, squadIndex: si } }
function onSaveTarget(t: SquadTarget) {
  const si = targetModal.value.squadIndex
  const next = { ...targets.value }
  if (Object.keys(t).length === 0) delete next[si]
  else next[si] = t
  targets.value = next
  saveTargets(rid, next)
  targetModal.value.open = false
}

async function load() { await store.load(rid) }
onMounted(() => {
  disconnect = connectRaidWs(rid, {
    onEvent: (ev) => applyEvent(store, ev),
    onRefresh: async () => { await load() },
    onReconnect: async () => { await load() },
  })
  void load()
})
onBeforeUnmount(() => { disconnect?.() })
</script>

<template>
  <div v-if="store.raid" class="dnf-page">
    <div class="page-head" style="flex-wrap:wrap;gap:10px">
      <router-link :to="`/raids/${rid}`" class="dnf-btn dnf-btn-sm" style="text-decoration:none">← 返回</router-link>
      <h2 style="margin:0">{{ store.raid.name }} · 编队</h2>
      <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <span v-if="canEdit" style="display:flex;align-items:center;gap:6px">
          推荐 <n-switch data-test="recommend-switch" :value="recommendOn"
                        @update:value="toggleRecommend" size="small" />
        </span>
      </span>
    </div>

    <!-- 波标签 -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
      <button v-for="w in store.raid.waves" :key="w.id" class="dnf-btn dnf-btn-sm"
              :class="{ 'dnf-btn-primary': w.index === currentIndex }"
              :data-test="`wave-tab-${w.index}`" @click="currentIndex = w.index; holding = null">
        {{ waveLabel(w) }}
      </button>
      <!-- 未排状态条 -->
      <span style="margin-left:auto;display:flex;align-items:center;gap:6px">
        <button class="dnf-btn dnf-btn-sm" data-test="unplaced-toggle"
                @click="showUnplaced = !showUnplaced">
          本波未排 {{ roundUnplaced }} · 全局未排 {{ globalUnplaced }}
        </button>
      </span>
    </div>
    <div v-if="showUnplaced" class="dnf-panel" style="margin-bottom:10px;padding:10px" data-test="unplaced-list">
      <div v-for="s in roundUnplacedUsers" :key="s.user.id">
        {{ s.user.nickname }}（可用 {{ s.characters.length }} 角色）
      </div>
      <div v-if="!roundUnplacedUsers.length" style="color:var(--dnf-text-faint)">本波全部已排 ✓</div>
    </div>

    <!-- 拿起提示 -->
    <div v-if="holding" class="move-hint" style="display:flex;align-items:center;gap:10px;margin:8px 0">
      <span style="color:var(--dnf-gold-hi)">拿起中：{{ holding.name }} → 点击右侧目标格</span>
      <button class="dnf-btn dnf-btn-sm" data-test="cancel-holding" @click="holding = null">取消（Esc）</button>
    </div>

    <div style="display:flex;gap:16px;align-items:flex-start">
      <aside style="width:260px;flex-shrink:0;max-height:70vh;overflow:auto" data-test="roster-pool"
             class="dnf-panel" >
        <RosterPool :signups="store.raid.signups" :blocked-char-ids="blockedCharIds"
                    :slack-char-ids="slackCharIds" :recommend-top3="recommendTop3"
                    :recommend-target="recommendTarget" :holding-id="holding?.id ?? null"
                    :can-edit="canEdit" @pick="onPick" />
      </aside>
      <main style="flex:1;min-width:0" data-test="roster-grid">
        <RosterGrid :groups="currentGroups" :targets="targets" :can-edit="canEdit"
                    :holding="holding" @place="onPlace" @manage="onManage"
                    @remove="onRemove" @duty="onDuty" @pickUp="onPickUp"
                    @editTarget="openTarget" />
      </main>
    </div>

    <RosterTargetModal :open="targetModal.open"
                       :squad-label="`${targetModal.squadIndex + 1} 队`"
                       :target="targets[targetModal.squadIndex] ?? null"
                       @close="targetModal.open = false"
                       @save="onSaveTarget" />
  </div>
</template>

<style scoped>
.move-hint { border: 1px dashed var(--dnf-accent,#ffd54a); border-radius: 6px; padding: 8px 10px; }
</style>
