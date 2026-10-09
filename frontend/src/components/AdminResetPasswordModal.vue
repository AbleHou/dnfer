<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { validatePassword } from '../utils/password'
import { notifyError, notifySuccess } from '../lib/notify'
import type { User } from '../types'

const props = defineProps<{ open: boolean; user: User | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const newPw = ref('')
const confirmPw = ref('')
const error = ref('')
const saving = ref(false)

watch(() => props.open, (o) => { if (o) { newPw.value = ''; confirmPw.value = ''; error.value = '' } })

async function submit() {
  if (saving.value) return
  if (!props.user) return   // 弹窗仅在有目标用户时打开；兜底避免空 id 请求
  error.value = ''
  const err = validatePassword(newPw.value)
  if (err) { error.value = err; return }
  if (newPw.value !== confirmPw.value) { error.value = '两次输入的密码不一致'; return }
  saving.value = true
  try {
    await api.post(`/api/admin/users/${props.user.id}/password`, { password: newPw.value })
    notifySuccess('密码已重置')
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { saving.value = false }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="重置密码" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="color:var(--dnf-text-muted);font-size:12px">
        为 {{ props.user?.nickname }}（{{ props.user?.username }}）设置新密码
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">新密码</div>
        <input v-model="newPw" type="password" class="dnf-input" data-field="new-pw" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">确认新密码</div>
        <input v-model="confirmPw" type="password" class="dnf-input" data-field="confirm-pw"
               @keyup.enter="submit" />
      </div>
      <p v-if="error" class="form-error" style="margin:0">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-act="submit" :disabled="saving"
              @click="submit">确认重置</button>
    </div>
  </n-modal>
</template>
