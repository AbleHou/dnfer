<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NModal, NSwitch } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useRaidStore, applyEvent } from '../stores/raid'
import { connectRaidWs } from '../api/ws'
import { buildPlacementMap } from '../lib/placement'
import { computeSlack } from '../lib/slack'
import {
  inferFillDuty, loadTargets, placementByChar, recommendFillers, saveTargets, squadSlotsOf,
  RECOMMEND_KEY,
} from '../lib/roster'
import type { CharPlacement, SquadTarget, SquadTargets } from '../lib/roster'
import RosterPool from '../components/RosterPool.vue'
import RosterGrid from '../components/RosterGrid.vue'
import RosterTargetModal from '../components/RosterTargetModal.vue'
import GuestCreateModal from '../components/GuestCreateModal.vue'
import { SQUAD_NAMES } from '../lib/colors'
import { confirmDialog, notifyError, notifySuccess, notifyWarning } from '../lib/notify'
import type { Character, Slot, User, Wave } from '../types'

const route = useRoute()
const auth = useAuthStore()
const store = useRaidStore()
const rid = Number(route.params.id)
const canEdit = computed(() => auth.isAdmin && !store.raid?.closed)

const currentIndex = ref(1)
const holding = ref<Character | null>(null)
const recommendOn = ref(localStorage.getItem(RECOMMEND_KEY) !== '0')
const targets = ref<SquadTargets>(loadTargets(rid))
const targetModal = ref<{ open: boolean; squadIndex: number }>({ open: false, squadIndex: 0 })
const guestOpen = ref(false)
const poolOpen = ref(false)
let disconnect: (() => void) | null = null

const currentWave = computed<Wave | null>(() =>
  store.raid?.waves.find(w => w.index === currentIndex.value) ?? null)
watch(currentWave, (w) => {
  if (!w && store.raid?.waves.length) currentIndex.value = store.raid.waves[0].index
})
const currentGroups = computed<Wave[]>(() => {
  const cw = currentWave.value
  if (!store.raid || !cw) return []
  return store.raid.waves.filter(w => w.round_index === cw.round_index)
})
const placed = computed(() => store.raid ? buildPlacementMap(store.raid) : {})
const charPlacement = computed(() => placementByChar(store.raid?.waves ?? []))
const roundUserPos = computed<Map<number, CharPlacement>>(() => {
  const m = new Map<number, CharPlacement>()
  for (const w of currentGroups.value) {
    for (const s of w.slots) {
      if (s.character_id == null || s.owner_id == null) continue
      m.set(s.owner_id, { roundIndex: w.round_index, groupId: w.group_id, groupIndex: w.group_index,
                          squadIndex: s.squad_index, duty: s.duty, userId: s.owner_id })
    }
  }
  return m
})
const currentRound = computed(() => currentGroups.value[0]?.round_index ?? 0)

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
const suggestions = computed(() => recommendOn.value ? recommendFillers({
  candidates: candidates.value, groups: currentGroups.value, targets: targets.value,
}) : [])
const recommend = computed<Record<number, { roundIndex: number; groupIndex: number | null; squadIndex: number }>>(() => {
  const m: Record<number, { roundIndex: number; groupIndex: number | null; squadIndex: number }> = {}
  for (const s of suggestions.value) m[s.character.id] = { roundIndex: s.roundIndex, groupIndex: s.groupIndex, squadIndex: s.squadIndex }
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
  poolOpen.value = false
}
function onPickUp(slot: Slot) {
  const c = allChars.value.find(x => x.id === slot.character_id)
  if (c) holding.value = c
}
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && holding.value) holding.value = null }
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

async function load() {
  await store.load(rid)
  // 已关闭攻坚为只读快照：拉取后立即断开 WS（覆盖直链进入已关闭页面的场景）
  if (store.raid?.closed) disconnect?.()
}
async function onGuestCreated(u: User, charCount: number) {
  guestOpen.value = false
  if (!store.raid) return
  if (charCount === 0) {
    notifyWarning('已创建临时用户，但未填角色，请先在角色管理添加角色后再代报名')
    return
  }
  try {
    await api.post(`/api/raids/${store.raid.id}/signups`, { user_id: u.id })
    notifySuccess('已代报名')
    await load()
  } catch (e: any) { notifyError(e.message) }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  disconnect = connectRaidWs(rid, {
    onEvent: (ev) => {
      // 已被他人关闭 → 断开 WS 并全量刷新为只读快照（覆盖「停留在开放页时被关闭」场景）
      if (ev.type === 'raid:closed') { disconnect?.(); holding.value = null; void load() }
      else applyEvent(store, ev)                  // slot/锁定事件增量合并
    },
    onRefresh: async () => { await load() },
    onReconnect: async () => { await load() },
  })
  void load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  disconnect?.()
})
</script>

<template>
  <div v-if="store.raid" class="dnf-page">
    <div class="page-head" style="flex-wrap:wrap;gap:10px">
      <router-link :to="`/raids/${rid}`" class="dnf-btn dnf-btn-sm" style="text-decoration:none">← 返回</router-link>
      <h2 style="margin:0">{{ store.raid.name }} · 编队</h2>
      <span v-if="store.raid?.closed" class="dnf-badge dnf-badge-danger">攻坚已关闭，仅查看</span>
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
      <main style="flex:1;min-width:0" data-test="roster-grid">
        <RosterGrid :groups="currentGroups" :targets="targets" :can-edit="canEdit"
                    :holding="holding" @place="onPlace" @manage="onManage"
                    @remove="onRemove" @duty="onDuty" @pickUp="onPickUp"
                    @editTarget="openTarget" />
      </main>
    </div>

    <button class="roster-fab" data-test="pool-fab" title="打开角色池" @click="poolOpen = true">选人</button>

    <n-modal :show="poolOpen" preset="card" title="角色池" style="width:min(380px,92vw)"
             @update:show="(s: boolean) => { if (!s) poolOpen = false }">
      <RosterPool :signups="store.raid.signups" :blocked-char-ids="blockedCharIds"
                  :slack-char-ids="slackCharIds" :recommend="recommend" :holding-id="holding?.id ?? null"
                  :can-edit="canEdit" :round-user-pos="roundUserPos"
                  :char-placement="charPlacement" :current-round="currentRound"
                  @pick="onPick">
        <template #toolbar-extra>
          <button v-if="canEdit && !store.raid.locked" class="dnf-btn dnf-btn-sm"
                  data-test="add-guest" @click="guestOpen = true">＋临时</button>
        </template>
      </RosterPool>
    </n-modal>

    <RosterTargetModal :open="targetModal.open"
                       :squad-label="SQUAD_NAMES[targetModal.squadIndex] ?? `队${targetModal.squadIndex + 1}`"
                       :target="targets[targetModal.squadIndex] ?? null"
                       @close="targetModal.open = false"
                       @save="onSaveTarget" />

    <GuestCreateModal v-if="guestOpen" :open="guestOpen" :require-character="true"
                      @close="guestOpen = false" @created="onGuestCreated" />
  </div>
</template>

<style scoped>
.move-hint { border: 1px dashed var(--dnf-accent,#ffd54a); border-radius: 6px; padding: 8px 10px; }
.roster-fab {
  position: fixed; right: 20px; bottom: 20px; z-index: 50;
  width: 52px; height: 52px; border-radius: 50%;
  border: 1px solid var(--dnf-gold-deep); background: linear-gradient(180deg, var(--dnf-panel-inner), var(--dnf-panel));
  color: var(--dnf-gold-hi); font-weight: bold; font-size: 13px; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .45);
}
.roster-fab:hover { border-color: var(--dnf-gold); }
</style>
