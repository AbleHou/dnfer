<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NInput } from 'naive-ui'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { validateNickname } from '../utils/nickname'
import { notifyError, notifySuccess } from '../lib/notify'
import UserAvatar from './UserAvatar.vue'
import type { User } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const auth = useAuthStore()
const nickname = ref(auth.user?.nickname ?? '')
const nicknameError = ref('')
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

watch(() => props.open, (o) => { if (o) nickname.value = auth.user?.nickname ?? '' })

async function saveNickname() {
  if (saving.value) return
  const err = validateNickname(nickname.value)
  nicknameError.value = err ?? ''
  if (err || !auth.user) return
  if (nickname.value === auth.user.nickname) return  // 昵称未变化，不发请求
  saving.value = true
  try {
    const user = await api.put<User>('/api/me/profile', { nickname: nickname.value })
    auth.updateProfile(user)
    notifySuccess('昵称已更新')
  } catch (e: any) { nicknameError.value = e.message }
  finally { saving.value = false }
}

async function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  uploading.value = true
  try {
    const user = await api.upload<User>('/api/me/avatar', f)
    auth.updateProfile(user)
    notifySuccess('头像已更新')
  } catch (e: any) { notifyError(e.message) }
  finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="个人信息" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div v-if="auth.user" style="display:flex;flex-direction:column;gap:14px;align-items:center">
      <button class="dnf-btn" style="padding:4px;border-radius:50%" title="点击更换头像"
              :disabled="uploading" @click="fileInput?.click()">
        <UserAvatar :nickname="auth.user.nickname" :avatar="auth.user.avatar" :size="72" />
      </button>
      <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileChange">
      <div style="width:100%">
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">账号（登录用）</div>
        <div style="color:var(--dnf-text)">{{ auth.user.username }}</div>
      </div>
      <div style="width:100%">
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">昵称</div>
        <n-input v-model:value="nickname" type="text" placeholder="昵称（中文/字母/数字）"
                 @keyup.enter="saveNickname" />
        <p v-if="nicknameError" class="form-error" style="margin:4px 0 0">{{ nicknameError }}</p>
      </div>
      <button class="dnf-btn dnf-btn-primary save-nickname" style="width:100%"
              :disabled="saving" @click="saveNickname">保存</button>
    </div>
  </n-modal>
</template>
