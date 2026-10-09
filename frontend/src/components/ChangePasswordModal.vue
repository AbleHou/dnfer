<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { validatePassword } from '../utils/password'
import { notifyError, notifySuccess } from '../lib/notify'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const oldPw = ref('')
const newPw = ref('')
const confirmPw = ref('')
const error = ref('')
const saving = ref(false)

watch(() => props.open, (o) => { if (o) { oldPw.value = ''; newPw.value = ''; confirmPw.value = ''; error.value = ''; saving.value = false } })

async function submit() {
  if (saving.value) return
  error.value = ''
  if (!oldPw.value) { error.value = '请输入原密码'; return }
  const err = validatePassword(newPw.value)
  if (err) { error.value = err; return }
  if (newPw.value !== confirmPw.value) { error.value = '两次输入的密码不一致'; return }
  saving.value = true
  try {
    await api.put('/api/me/password', { old_password: oldPw.value, new_password: newPw.value })
    notifySuccess('密码已修改')
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { saving.value = false }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="修改密码" style="width:min(360px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">原密码</div>
        <input v-model="oldPw" type="password" class="dnf-input" data-field="old-pw" />
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
              @click="submit">确认修改</button>
    </div>
  </n-modal>
</template>
