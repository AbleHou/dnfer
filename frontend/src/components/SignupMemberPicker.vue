<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import UserAvatar from './UserAvatar.vue'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
import type { User } from '../types'

const props = defineProps<{ open: boolean; rid: number; excludeUserIds: number[] }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'signedUp'): void }>()
const users = ref<User[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const busy = ref(false)

const candidates = computed(() =>
  users.value.filter(u => !props.excludeUserIds.includes(u.id)))

watch(() => props.open, async (open) => {
  if (!open) return
  loading.value = true
  loadFailed.value = false
  try {
    users.value = await api.get<User[]>('/api/admin/users')
  } catch {
    loadFailed.value = true
    users.value = []
  } finally {
    loading.value = false
  }
}, { immediate: true })

async function onPick(u: User) {
  if (busy.value) return
  busy.value = true
  try {
    const ok = await confirmDialog({ content: `确认帮「${u.nickname}」报名？` })
    if (!ok) return
    await api.post(`/api/raids/${props.rid}/signups`, { user_id: u.id })
    notifySuccess('报名成功')
    emit('signedUp')
    emit('close')
  } catch (e: any) { notifyError(String(e?.message ?? '操作失败')) }
  finally { busy.value = false }
}
</script>

<template>
  <n-modal :show="open" preset="card" title="帮成员报名" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="loadFailed" style="color:var(--dnf-text-faint)">加载失败，请重试</p>
      <p v-else-if="loading" style="color:var(--dnf-text-faint)">加载中…</p>
      <p v-else-if="!candidates.length" style="color:var(--dnf-text-faint)">所有人都已报名</p>
      <div v-for="u in candidates" :key="u.id" class="member-row" @click="onPick(u)">
        <UserAvatar :nickname="u.nickname" :avatar="u.avatar" :size="24" />
        <span>{{ u.nickname }}</span>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.member-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; margin: 6px 0;
  border: 1px solid var(--dnf-border); border-radius: 4px;
  cursor: pointer;
}
.member-row:hover { border-color: var(--dnf-gold); }
</style>
