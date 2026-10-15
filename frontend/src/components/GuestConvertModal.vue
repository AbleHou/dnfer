<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { validatePassword } from '../utils/password'
import { notifyError, notifySuccess } from '../lib/notify'
import type { User } from '../types'

const props = defineProps<{ open: boolean; user: User | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const username = ref('')
const password = ref('')
const confirmPw = ref('')
const error = ref('')
const saving = ref(false)

watch(() => props.open, (o) => {
  if (o) { username.value = ''; password.value = ''; confirmPw.value = ''; error.value = ''; saving.value = false }
})

async function submit() {
  if (saving.value) return
  if (!props.user) return
  error.value = ''
  if (!username.value.trim()) { error.value = '请填写用户名'; return }
  const err = validatePassword(password.value)
  if (err) { error.value = err; return }
  if (password.value !== confirmPw.value) { error.value = '两次输入的密码不一致'; return }
  saving.value = true
  try {
    await api.post(`/api/admin/users/${props.user.id}/convert`,
                   { username: username.value.trim(), password: password.value })
    notifySuccess('已转正，该用户可自行登录')
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { saving.value = false }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="临时用户转正" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="color:var(--dnf-text-muted);font-size:12px">
        为 {{ props.user?.nickname }}（{{ props.user?.username }}）设置用户名与密码，转正后可自行登录
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">用户名</div>
        <input v-model="username" class="dnf-input" data-field="username" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">密码</div>
        <input v-model="password" type="password" class="dnf-input" data-field="password" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">确认密码</div>
        <input v-model="confirmPw" type="password" class="dnf-input" data-field="confirm-pw"
               @keyup.enter="submit" />
      </div>
      <p v-if="error" class="form-error" style="margin:0">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-act="submit" :disabled="saving"
              @click="submit">{{ saving ? '转正中…' : '确认转正' }}</button>
    </div>
  </n-modal>
</template>
