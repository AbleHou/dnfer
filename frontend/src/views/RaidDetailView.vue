<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useRaidStore, applyEvent } from '../stores/raid'
import { connectRaidWs } from '../api/ws'
import WaveSection from '../components/WaveSection.vue'
import UserAvatar from '../components/UserAvatar.vue'
import SlackRulesModal from '../components/SlackRulesModal.vue'
import { formatDateTime } from '../utils/datetime'
import CharacterPickerModal from '../components/CharacterPickerModal.vue'
import SlotActionModal from '../components/SlotActionModal.vue'
import { useSlotMove } from '../composables/useSlotMove'
import { confirmDialog, notifyError, notifySuccess, notifyWarning } from '../lib/notify'
import { buildPlacementMap } from '../lib/placement'
import MemberCharactersModal from '../components/MemberCharactersModal.vue'
import SignupMemberPicker from '../components/SignupMemberPicker.vue'
import SignupModal from '../components/SignupModal.vue'
import { NDatePicker, NInput, NModal } from 'naive-ui'
import { computeSlack, slackCountByUser } from '../lib/slack'
import type { Character, CharacterPlacement, Duty, RaidSignup, SlackRuleSet, Slot, User, Wave } from '../types'

const route = useRoute()
const auth = useAuthStore()
const store = useRaidStore()
const rid = Number(route.params.id)

const pickSlot = ref<Slot | null>(null)
const manageSlot = ref<Slot | null>(null)
const { movingSlot, pickUp, cancel, moveTo } = useSlotMove(rid, load)
let disconnect: (() => void) | null = null

const editable = computed(() => !store.raid?.locked || auth.isAdmin)
const mySignedUp = computed(() =>
  store.raid?.signups.some(s => s.user.id === auth.user?.id) ?? false)
const signupUserIds = computed(() => store.raid?.signups.map(s => s.user.id) ?? [])
const placed = computed<Record<number, CharacterPlacement>>(() =>
  store.raid ? buildPlacementMap(store.raid) : {})
const showMemberPicker = ref(false)
const memberModalUser = ref<User | null>(null)
const showSlackRules = ref(false)
const showEditRaid = ref(false)
const editName = ref('')
const editStartsAt = ref<string | null>(null)
const showSignupModal = ref(false)
const signupMode = ref<'signup' | 'manage'>('signup')
const signupSelected = ref<number[]>([])
const myRow = computed(() =>
  store.raid?.signups.find(s => s.user.id === auth.user?.id) ?? null)
const signupCharsByUser = computed<Record<number, number[]>>(() => {
  const m: Record<number, number[]> = {}
  for (const s of store.raid?.signups ?? []) {
    if (s.created_at === null) continue  // 团长固定行跳过（否则空数组会过滤掉团长全部角色）
    m[s.user.id] = s.characters.map(c => c.id)
  }
  return m
})
const charsByUser = computed<Record<number, Character[]>>(() => {
  const m: Record<number, Character[]> = {}
  for (const s of store.raid?.signups ?? []) m[s.user.id] = s.characters
  return m
})
const grayByUser = computed(() => computeSlack(
  store.raid?.slack_rules ?? { criteria: [], exchange: [] }, charsByUser.value))
const grayCharIds = computed(() => new Set(Object.values(grayByUser.value).flat()))
const slackCounts = computed(() =>
  slackCountByUser(store.raid?.slack_rules ?? { criteria: [], exchange: [] }, charsByUser.value))

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

function openSignupModal() {
  signupMode.value = 'signup'
  showSignupModal.value = true
}
async function onSignupSubmit(ids: number[]) {
  if (!store.raid) return
  try {
    await api.post(`/api/raids/${store.raid.id}/signup`, { character_ids: ids })
    notifySuccess('报名成功')
    showSignupModal.value = false
    await load()
  } catch (e: any) { notifyError(e.message) }
}
function openManageSignup() {
  if (!myRow.value) return
  signupMode.value = 'manage'
  signupSelected.value = myRow.value.characters.map(c => c.id)
  showSignupModal.value = true
}
async function onToggleSignupChar(cid: number, checked: boolean) {
  if (!store.raid) return
  if (!checked && placed.value[cid]) {
    const ok = await confirmDialog({ content: '该角色已占位，取消勾选将撤销其占位，确认？' })
    if (!ok) return
  }
  try {
    if (checked) await api.post(`/api/raids/${store.raid.id}/signup/characters/${cid}`)
    else await api.del(`/api/raids/${store.raid.id}/signup/characters/${cid}`)
    await load()
    // 同步本地勾选态，让管理弹窗复选框即时反映（API 失败则不更新 → 自动还原）
    signupSelected.value = checked
      ? [...signupSelected.value, cid]
      : signupSelected.value.filter(x => x !== cid)
  } catch (e: any) { notifyError(e.message) }
}
async function onCancelSelf() {
  if (!store.raid) return
  const ok = await confirmDialog({ content: '确认取消本次报名？将撤下你已占位的角色' })
  if (!ok) return
  try { await api.del(`/api/raids/${store.raid.id}/signup`); notifySuccess('已取消报名'); await load() }
  catch (e: any) { notifyError(e.message) }
}
function placedCount(s: RaidSignup): number {
  return s.characters.filter(c => placed.value[c.id]).length
}
async function onCancelUser(s: RaidSignup) {
  if (!store.raid) return
  const ok = await confirmDialog({ content: `确认取消「${s.user.nickname}」的报名？将撤下其已占位的角色` })
  if (!ok) return
  try { await api.del(`/api/raids/${store.raid.id}/signups/${s.user.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
async function onPick(slot: Slot) {
  if (!store.raid) return
  if (!auth.isAdmin && !mySignedUp.value && !store.raid.locked) {
    const ok = await confirmDialog({ content: '你还没有报名本次攻坚，是否先报名？' })
    if (!ok) return
    try { await api.post(`/api/raids/${store.raid.id}/signup`); await load() }
    catch (e: any) { notifyError(e.message); return }
  }
  pickSlot.value = slot
}
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
const parallelizeWave = ref<Wave | null>(null)
const showParallelModal = computed(() => parallelizeWave.value != null)
const otherWaves = computed(() =>
  store.raid?.waves.filter(w => w.id !== parallelizeWave.value?.id) ?? [])
function waveLabel(w: Wave): string {
  return w.group_id == null ? `第 ${w.round_index} 波` : `第 ${w.round_index} 波 ${w.group_index} 团`
}
async function onParallelize(w: Wave) { parallelizeWave.value = w }
async function onParallelTo(target: Wave) {
  if (!store.raid || !parallelizeWave.value) return
  try {
    await api.post(`/api/raids/${store.raid.id}/waves/${parallelizeWave.value.index}/parallel`,
                   { target_index: target.index })
    parallelizeWave.value = null
    await load()
  } catch (e: any) { notifyError(e.message) }
}
async function onUnparallelize(w: Wave) {
  if (!store.raid) return
  try { await api.del(`/api/raids/${store.raid.id}/waves/${w.index}/parallel`); await load() }
  catch (e: any) { notifyError(e.message) }
}
function openEditRaid() {
  if (!store.raid) return
  editName.value = store.raid.name
  editStartsAt.value = store.raid.starts_at
  showEditRaid.value = true
}
async function onSaveRaid() {
  if (!store.raid) return
  try {
    await api.put(`/api/raids/${store.raid.id}`, {
      name: editName.value || undefined,
      starts_at: editStartsAt.value ?? undefined,
    })
    showEditRaid.value = false
    await load()
  } catch (e: any) { notifyError(e.message) }
}
async function onSlackRulesSubmit(rules: SlackRuleSet) {
  try {
    await api.put(`/api/raids/${rid}/slack-rules`, rules)
    notifySuccess('划水规则已保存')
    showSlackRules.value = false
    await load()  // WS 断连时兜底刷新（正常时 WS 已 patch slack_rules）
  } catch (e: any) { notifyError(e.message) }
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
        <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-sm" data-test="slack-rules"
                @click="showSlackRules = true">划水规则设置</button>
        <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-sm" data-test="edit-raid" @click="openEditRaid">修改</button>
        <button v-if="auth.isAdmin" class="dnf-btn" @click="onToggleLock">{{ store.raid.locked ? '解锁' : '锁定' }}</button>
        <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-primary" data-test="add-wave" @click="onAddWave">＋ 添加一波</button>
      </span>
    </div>

    <div class="dnf-panel" style="margin:10px 0;padding:12px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <b>已报名</b>
        <span style="color:var(--dnf-text-faint)">{{ store.raid.signups.length }} 人（含团长）</span>
        <span style="margin-left:auto;display:flex;gap:8px">
          <button v-if="!store.raid.locked && !mySignedUp" class="dnf-btn dnf-btn-sm dnf-btn-primary"
                  data-test="signup" @click="openSignupModal">报名</button>
          <button v-if="auth.isAdmin && !store.raid.locked" class="dnf-btn dnf-btn-sm"
                  data-test="signup-plus" @click="showMemberPicker = true">＋</button>
        </span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        <template v-for="s in store.raid.signups" :key="s.user.id">
          <div v-if="s.created_at === null" class="signup-leader"
               style="display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--dnf-border,#3a3f4b);border-radius:4px">
            <button class="avatar-btn" @click="memberModalUser = s.user">
              <UserAvatar :nickname="s.user.nickname" :avatar="s.user.avatar" :size="24" />
            </button>
            <span>{{ s.user.nickname }}</span>
            <span class="dnf-badge dnf-badge-ok">团长</span>
          </div>
          <div v-else class="signup-group">
            <button class="avatar-btn signup-user" @click="memberModalUser = s.user">
              <UserAvatar :nickname="s.user.nickname" :avatar="s.user.avatar" :size="24" />
              <span class="signup-nick">{{ s.user.nickname }}</span>
              <span class="signup-count">{{ placedCount(s) }}/{{ s.characters.length }}<template v-if="(slackCounts[s.user.id] ?? 0) > 0"> · 划水 {{ slackCounts[s.user.id] }}</template></span>
            </button>
            <button v-if="s.user.id === auth.user?.id && !store.raid.locked"
                    class="dnf-btn dnf-btn-sm" data-act="manage-chars"
                    @click="openManageSignup">角色变更</button>
            <button v-if="auth.isAdmin && s.created_at !== null"
                    class="dnf-btn dnf-btn-sm dnf-btn-danger" @click="onCancelUser(s)">取消报名</button>
            <button v-else-if="s.created_at !== null && s.user.id === auth.user?.id && !store.raid.locked"
                    class="dnf-btn dnf-btn-sm dnf-btn-danger" @click="onCancelSelf">取消报名</button>
          </div>
        </template>
      </div>
    </div>

    <div v-if="movingSlot" class="move-hint" style="display:flex;align-items:center;gap:10px;margin:10px 0">
      <span style="color:var(--dnf-gold-hi)">移动中：{{ movingSlot.owner_nickname }}（{{ movingSlot.character_name }}）→ 点击目标格</span>
      <button class="dnf-btn dnf-btn-sm" @click="cancel()">取消移动（Esc）</button>
    </div>

    <WaveSection v-for="w in store.raid.waves" :key="w.id"
                 :wave="w" :editable="editable" :is-admin="auth.isAdmin"
                 :can-delete="auth.isAdmin"
                 :current-user-id="auth.user?.id ?? null"
                 :move-mode="movingSlot != null" :moving-slot-id="movingSlot?.id ?? null"
                 :slack-char-ids="grayCharIds"
                 @pick="onPick" @duty="onDuty" @remove="onRemove"
                 @delete-wave="onDeleteWave" @manage="onManage" @moveTo="onMoveTo"
                 @parallelize="onParallelize" @unparallelize="onUnparallelize" />

    <SlotActionModal :open="manageSlot != null" :slot="manageSlot"
                     @close="manageSlot = null" @replace="onReplace"
                     @pickUp="onPickUp" @remove="onRemoveFromMenu" />

    <CharacterPickerModal :open="pickSlot != null" :admin-mode="auth.isAdmin"
                          :signup-user-ids="signupUserIds" :signup-chars-by-user="signupCharsByUser"
                          :placed="placed" :gray-by-user="grayByUser"
                          @close="pickSlot = null" @select="onSelectCharacter" />

    <n-modal :show="showEditRaid" preset="card" title="修改攻坚" style="width:min(360px,92vw)"
             @update:show="(s: boolean) => { if (!s) showEditRaid = false }">
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="margin-bottom:4px">名称</div>
          <n-input v-model:value="editName" data-test="edit-name" />
        </div>
        <div>
          <div style="margin-bottom:4px">时间</div>
          <n-date-picker v-model:formatted-value="editStartsAt" type="datetime"
                         value-format="yyyy-MM-dd'T'HH:mm:ss" style="width:100%" />
        </div>
      </div>
      <template #footer>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="dnf-btn" @click="showEditRaid = false">取消</button>
          <button class="dnf-btn dnf-btn-primary" data-test="save-raid" @click="onSaveRaid">保存</button>
        </div>
      </template>
    </n-modal>

    <MemberCharactersModal :open="memberModalUser != null" :rid="rid" :user="memberModalUser"
                           :placed="placed" :gray-ids="memberModalUser ? (grayByUser[memberModalUser.id] ?? []) : []"
                           :slack-count="memberModalUser ? (slackCounts[memberModalUser.id] ?? 0) : 0"
                           @close="memberModalUser = null" />

    <SignupMemberPicker :open="showMemberPicker" :rid="rid" :exclude-user-ids="signupUserIds"
                        @close="showMemberPicker = false" @signedUp="load" />

    <SignupModal :open="showSignupModal" :mode="signupMode" :selected-ids="signupSelected"
                 @close="showSignupModal = false"
                 @submit="onSignupSubmit" @toggle="onToggleSignupChar" />

    <SlackRulesModal :open="showSlackRules" :rules="store.raid.slack_rules"
                     @close="showSlackRules = false" @submit="onSlackRulesSubmit" />

    <n-modal :show="showParallelModal" preset="card" title="并行到哪一波？" style="width:min(360px,92vw)"
             @update:show="(s: boolean) => { if (!s) parallelizeWave = null }">
      <div style="display:flex;flex-direction:column;gap:8px">
        <button v-for="t in otherWaves" :key="t.id" class="dnf-btn"
                :data-test="`parallel-target-${t.id}`" @click="onParallelTo(t)">
          {{ waveLabel(t) }}
        </button>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.avatar-btn {
  display: inline-flex; padding: 0; margin: 0;
  background: none; border: none; cursor: pointer;
  /* 重置浏览器默认 button 排版（黑底小字），使内部文本与普通 span 一致地继承主题字体/颜色 */
  font: inherit; color: inherit; line-height: inherit;
}
.signup-group {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--dnf-border,#3a3f4b); border-radius: 8px;
  min-width: 0;
}
.signup-user {
  flex: 1; justify-content: flex-start;
  align-items: center;   /* 头像/昵称/计数垂直居中，避免 stretch 把文本顶到顶部 */
  gap: 6px; min-width: 0; text-align: left;
}
.signup-nick { white-space: nowrap; }
.signup-count { font-size: 12px; color: var(--dnf-text-muted,#9aa3b2); white-space: nowrap; }
</style>
