<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NSelect, NDatePicker, NInput } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { formatDateTime } from '../utils/datetime'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
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
  try { await api.del(`/api/raids/${r.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}

async function onSignup(r: RaidListItem) {
  try {
    await api.post(`/api/raids/${r.id}/signup`)
    notifySuccess('报名成功')
    await load()
  } catch (e: any) { notifyError(e.message) }
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
      <router-link :to="`/raids/${r.id}`" class="raid-name">{{ r.name }}</router-link>
      <span class="raid-meta">{{ r.dungeon_name }} · {{ r.size }} 人 · {{ r.wave_count }} 波 · {{ formatDateTime(r.starts_at) }}</span>
      <span class="dnf-badge" :class="r.locked ? 'dnf-badge-danger' : 'dnf-badge-ok'">
        {{ r.locked ? '已锁定' : '未锁定' }}
      </span>
      <span class="raid-meta" style="color:var(--dnf-text-faint)">
        已报名 {{ r.signup_count }} 人
      </span>
      <button v-if="!r.locked && !r.my_signed_up" class="dnf-btn dnf-btn-sm dnf-btn-primary"
              data-test="signup" style="margin-left:auto"
              @click="onSignup(r)">报名</button>
      <span v-else-if="!r.locked && r.my_signed_up" class="dnf-badge dnf-badge-ok"
            style="margin-left:auto">已报名</span>
      <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-sm" style="margin-left:auto" @click="onDelete(r)">删除</button>
    </div>
    <p v-if="!raids.length" style="color:var(--dnf-text-faint)">还没有攻坚，管理员可点击「＋ 发起攻坚」</p>
  </div>
</template>
