<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { formatDateTime } from '../utils/datetime'
import type { Dungeon, RaidListItem } from '../types'

const auth = useAuthStore()
const raids = ref<RaidListItem[]>([])
const showCreate = ref(false)
const name = ref('')
const dungeonId = ref<number | null>(null)
const startsAt = ref('')
const dungeons = ref<Dungeon[]>([])
const sizeLocked = ref<number | null>(null)
const error = ref('')
const creating = ref(false)

async function load() {
  raids.value = await api.get<RaidListItem[]>('/api/raids')
  if (auth.isAdmin) dungeons.value = await api.get<Dungeon[]>('/api/dungeons')
}
onMounted(load)

function onDungeonChange() {
  const d = dungeons.value.find(x => x.id === dungeonId.value)
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
    startsAt.value = ''; sizeLocked.value = null
    await load()
  } catch (e: any) { error.value = e.message }
  finally { creating.value = false }
}
</script>

<template>
  <div style="max-width:800px;margin:24px auto">
    <div style="display:flex;align-items:center;gap:12px">
      <h2>攻坚列表</h2>
      <button v-if="auth.isAdmin" @click="showCreate = !showCreate">＋ 发起攻坚</button>
    </div>

    <div v-if="showCreate" style="border:1px solid #ddd;padding:16px;margin:12px 0">
      <div style="margin:6px 0">
        <select v-model.number="dungeonId" @change="onDungeonChange">
          <option :value="null" disabled>选择副本</option>
          <option v-for="d in dungeons" :key="d.id" :value="d.id">{{ d.name }}（{{ d.size }} 人）</option>
        </select>
        <span v-if="sizeLocked" style="margin-left:8px;color:#666">规模锁定：{{ sizeLocked }} 人</span>
      </div>
      <div style="margin:6px 0">
        <input v-model="startsAt" type="datetime-local" placeholder="发起时间" />
      </div>
      <div style="margin:6px 0">
        <input v-model="name" placeholder="攻坚名称（默认副本名）" />
      </div>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="creating" @click="create">{{ creating ? '创建中…' : '创建' }}</button>
    </div>

    <div v-for="r in raids" :key="r.id" style="border:1px solid #eee;padding:12px;margin:8px 0;
         display:flex;align-items:center;gap:12px">
      <router-link :to="`/raids/${r.id}`" style="font-weight:bold">{{ r.name }}</router-link>
      <span v-if="r.dungeon_name" style="color:#666">{{ r.dungeon_name }}</span>
      <span style="color:#999">{{ r.size }} 人 · {{ r.wave_count }} 波 · {{ formatDateTime(r.starts_at) }}</span>
      <span :style="{color: r.locked ? '#c62828' : '#2e7d32'}">{{ r.locked ? '已锁定' : '未锁定' }}</span>
    </div>
    <p v-if="!raids.length" style="color:#999">还没有攻坚，管理员可点击「＋ 发起攻坚」</p>
  </div>
</template>
