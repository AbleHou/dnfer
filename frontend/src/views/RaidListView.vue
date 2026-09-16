<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import type { RaidListItem } from '../types'

const auth = useAuthStore()
const raids = ref<RaidListItem[]>([])
const showCreate = ref(false)
const name = ref('')
const dungeon = ref('')
const size = ref(12)
const error = ref('')
const creating = ref(false)

async function load() { raids.value = await api.get<RaidListItem[]>('/api/raids') }
onMounted(load)

async function create() {
  creating.value = true; error.value = ''
  try {
    await api.post('/api/raids', { name: name.value, dungeon: dungeon.value, size: size.value })
    showCreate.value = false; name.value = ''; dungeon.value = ''
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
      <input v-model="name" placeholder="攻坚名称" style="margin-right:8px" />
      <input v-model="dungeon" placeholder="副本（可选）" style="margin-right:8px" />
      <select v-model.number="size">
        <option v-for="s in [4,8,12,16,20]" :key="s" :value="s">{{ s }} 人</option>
      </select>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="creating" @click="create">{{ creating ? '创建中…' : '创建' }}</button>
    </div>

    <div v-for="r in raids" :key="r.id" style="border:1px solid #eee;padding:12px;margin:8px 0;
         display:flex;align-items:center;gap:12px">
      <router-link :to="`/raids/${r.id}`" style="font-weight:bold">{{ r.name }}</router-link>
      <span v-if="r.dungeon" style="color:#666">{{ r.dungeon }}</span>
      <span style="color:#999">{{ r.size }} 人 · {{ r.wave_count }} 波</span>
      <span :style="{color: r.locked ? '#c62828' : '#2e7d32'}">{{ r.locked ? '已锁定' : '未锁定' }}</span>
    </div>
    <p v-if="!raids.length" style="color:#999">还没有攻坚，管理员可点击「＋ 发起攻坚」</p>
  </div>
</template>
