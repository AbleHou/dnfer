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
const busy = ref(false)

const candidates = computed(() =>
  users.value.filter(u => !props.excludeUserIds.includes(u.id)))

watch(() => props.open, async (open) => {
  if (!open) return
  busy.value = false
  users.value = await api.get<User[]>('/api/admin/users')
}, { immediate: true }) // immediate：测试挂载 open:true 即触发 fetch（与 CharacterPickerModal 一致）

async function onPick(u: User) {
  const ok = await confirmDialog({ content: `确认帮「${u.nickname}」报名？` })
  if (!ok) return
  busy.value = true
  try {
    await api.post(`/api/raids/${props.rid}/signups`, { user_id: u.id })
    notifySuccess('报名成功')
    emit('signedUp')
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { busy.value = false }
}
</script>

<template>
  <n-modal :show="open" preset="card" title="帮成员报名" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:60vh;overflow:auto">
      <p v-if="!candidates.length" style="color:var(--dnf-text-faint)">所有人都已报名</p>
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
