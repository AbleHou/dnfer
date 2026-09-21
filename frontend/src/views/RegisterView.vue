<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, NButton } from 'naive-ui'
import { useAuthStore } from '../stores/auth'
import { validateNickname } from '../utils/nickname'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const nickname = ref('')
const code = ref('')
const error = ref('')
const nicknameError = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''  // 先清空服务端错误，非法昵称早退也不会残留上一次的报错
  nicknameError.value = validateNickname(nickname.value) ?? ''
  if (nicknameError.value) return
  loading.value = true
  try {
    await auth.register({ username: username.value, password: password.value,
                          nickname: nickname.value, code: code.value })
    router.push('/')
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div class="auth-wrap">
    <div class="dnf-panel auth-card">
      <h2 style="margin-top:0">注册</h2>
      <form @submit.prevent="submit">
        <div style="margin:10px 0"><n-input v-model:value="username" placeholder="账号（登录用）" /></div>
        <div style="margin:10px 0"><n-input v-model:value="password" type="password" placeholder="密码（≥6位）" /></div>
        <div style="margin:10px 0"><n-input v-model:value="nickname" placeholder="群昵称（中文/字母/数字）" /></div>
        <p v-if="nicknameError" class="form-error" style="margin:-6px 0 6px">{{ nicknameError }}</p>
        <div style="margin:10px 0"><n-input v-model:value="code" placeholder="注册码" /></div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <n-button type="primary" attr-type="submit" block :loading="loading">注册</n-button>
      </form>
      <p style="margin-top:12px">已有账号？<router-link to="/login">登录</router-link></p>
    </div>
  </div>
</template>
