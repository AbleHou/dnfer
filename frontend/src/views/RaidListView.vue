<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NSelect, NDatePicker, NInput } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { formatDateTime } from '../utils/datetime'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
import { clearTargets } from '../lib/roster'
import SignupModal from '../components/SignupModal.vue'
import type { Dungeon, RaidListItem } from '../types'

const auth = useAuthStore()
const raids = ref<RaidListItem[]>([])
const showCreate = ref(false)
const name = ref('')
const dungeonId = ref<number | null>(null)
const startsAt = ref<string | null>(null)
const dungeons = ref<Dungeon[]>([])
const sizeLocked = ref<number | null>(null)
const error = ref('')
const creating = ref(false)

const dungeonOptions = computed(() =>
  dungeons.value.map(d => ({ label: `${d.name}（${d.size} 人）`, value: d.id })))

async function load() {
  raids.value = await api.get<RaidListItem[]>('/api/raids')
  if (auth.isAdmin) dungeons.value = await api.get<Dungeon[]>('/api/dungeons')
}
onMounted(load)

function onDungeonChange(v: number | null) {
  const d = dungeons.value.find(x => x.id === v)
  sizeLocked.value = d ? d.size : null
  if (d && !name.value) name.value = d.name
}

async function create() {
  if (!dungeonId.value || !startsAt.value) {
    error.value = '请选择副本并填写发起时间'; return
  }
  creating.value = true; error.value = ''
  try {
    await api.post('/api/raids', {
      name: name.value || undefined,
      dungeon_id: dungeonId.value,
      starts_at: startsAt.value,
    })
    showCreate.value = false; name.value = ''; dungeonId.value = null
    startsAt.value = null; sizeLocked.value = null
    await load()
  } catch (e: any) { error.value = e.message }
  finally { creating.value = false }
}

async function onDelete(r: RaidListItem) {
  const ok = await confirmDialog({ content: `确认删除攻坚「${r.name}」？该操作不可恢复` })
  if (!ok) return
  try { await api.del(`/api/raids/${r.id}`); clearTargets(r.id); await load() }
  catch (e: any) { notifyError(e.message) }
}

const signupTarget = ref<RaidListItem | null>(null)
const submitting = ref(false)
function onSignup(r: RaidListItem) { signupTarget.value = r }
async function onSignupSubmit(ids: number[]) {
  if (!signupTarget.value || submitting.value) return
  const rid = signupTarget.value.id
  submitting.value = true
  try {
    await api.post(`/api/raids/${rid}/signup`, { character_ids: ids })
    signupTarget.value = null // 仅成功后关闭
    notifySuccess('报名成功')
    await load()
  } catch (e: any) { notifyError(e.message) }
  finally { submitting.value = false }
}
</script>

<template>
  <div class="dnf-page">
    <div class="page-head">
      <h2 style="margin:0">攻坚列表</h2>
      <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-primary" data-test="create-toggle"
              @click="showCreate = !showCreate">＋ 发起攻坚</button>
    </div>

    <div v-if="showCreate" class="dnf-panel create-form">
      <div style="margin:8px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <n-select data-test="dungeon-select" style="flex:1;min-width:220px"
                  v-model:value="dungeonId" :options="dungeonOptions" placeholder="选择副本"
                  @update:value="onDungeonChange" />
        <span v-if="sizeLocked" style="color:var(--dnf-text-muted)">规模锁定：{{ sizeLocked }} 人</span>
      </div>
      <div style="margin:8px 0">
        <n-date-picker data-test="starts-at" type="datetime" value-format="yyyy-MM-dd'T'HH:mm:ss"
                       :actions="null" clearable update-value-on-close placeholder="发起时间" v-model:formatted-value="startsAt" />
      </div>
      <div style="margin:8px 0">
        <n-input data-test="name-input" v-model:value="name" placeholder="攻坚名称（默认副本名）" />
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-test="create-submit" :disabled="creating" @click="create">
        {{ creating ? '创建中…' : '创建' }}
      </button>
    </div>

    <div v-for="r in raids" :key="r.id" class="dnf-panel raid-card">
      <router-link :to="`/raids/${r.id}`" class="raid-link">
        <span class="raid-name">{{ r.name }}</span>
        <span class="raid-meta">{{ r.dungeon_name }} · {{ r.size }} 人 · {{ r.wave_count }} 波 · {{ formatDateTime(r.starts_at) }}</span>
        <span class="dnf-badge" :class="r.locked ? 'dnf-badge-danger' : 'dnf-badge-ok'">
          {{ r.locked ? '已锁定' : '未锁定' }}
        </span>
        <span v-if="r.closed" class="dnf-badge dnf-badge-danger">已关闭</span>
        <span class="raid-meta" style="color:var(--dnf-text-faint)">
          已报名 {{ r.signup_count + 1 }} 人
        </span>
      </router-link>
      <button v-if="!r.locked && !r.my_signed_up && !r.closed" class="dnf-btn dnf-btn-sm dnf-btn-primary"
              data-test="signup" @click="onSignup(r)">报名</button>
      <span v-else-if="!r.locked && r.my_signed_up" class="dnf-badge dnf-badge-ok">已报名</span>
      <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-sm" @click="onDelete(r)">删除</button>
    </div>
    <p v-if="!raids.length" style="color:var(--dnf-text-faint)">还没有攻坚，管理员可点击「＋ 发起攻坚」</p>
    <SignupModal :open="!!signupTarget" mode="signup" :selected-ids="[]"
                 @close="signupTarget = null" @submit="onSignupSubmit" />
  </div>
</template>

<style scoped>
/* 整卡可点：.raid-link 拉伸占满卡片主体（排除 报名/删除 按钮），点击任意信息区进入详情 */
.raid-link {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  text-decoration: none;
  cursor: pointer;
}
/* 悬浮「选中」：默认 .dnf-panel 边框已是金色，hover 提亮 + 外发光以区分 */
.raid-card:hover {
  border-color: var(--dnf-gold-hi);
  box-shadow: inset 0 0 0 1px var(--dnf-gold-deep), 0 0 14px rgba(255,213,74,.55), 0 4px 12px rgba(0,0,0,.5);
}
.raid-card:hover .raid-name { text-decoration: underline; }
</style>
