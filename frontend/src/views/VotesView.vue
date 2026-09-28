<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import type { VoteDetail, VoteListItem } from '../types'
import VoteCard from '../components/VoteCard.vue'
import VoteCreateModal from '../components/VoteCreateModal.vue'

const auth = useAuthStore()
const votes = ref<VoteDetail[]>([])
const showCreate = ref(false)
let timer: number | undefined

async function load() {
  try {
    const list = await api.get<VoteListItem[]>('/api/votes')
    votes.value = await Promise.all(
      list.map(v => api.get<VoteDetail>(`/api/votes/${v.id}`)))
  } catch { /* 轮询失败静默，保留旧数据 */ }
}
function startPolling() { timer = window.setInterval(load, 5000) }
function stopPolling() { if (timer) { clearInterval(timer); timer = undefined } }

onMounted(() => { load(); startPolling() })
onUnmounted(stopPolling)
</script>

<template>
  <div class="dnf-page">
    <div class="page-head">
      <h2 style="margin:0">秘党会议</h2>
      <button v-if="auth.isAdmin" class="dnf-btn dnf-btn-primary" data-act="create-toggle"
              @click="showCreate = !showCreate">＋ 发起投票</button>
    </div>
    <VoteCard v-for="v in votes" :key="v.id" :vote="v" :is-admin="auth.isAdmin" @refresh="load" />
    <p v-if="!votes.length" style="color:var(--dnf-text-faint)">还没有投票，管理员可点击「＋ 发起投票」</p>
    <VoteCreateModal :open="showCreate" @close="showCreate = false" @created="load" />
  </div>
</template>
