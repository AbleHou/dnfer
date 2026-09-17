<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const nickname = ref('')
const code = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true; error.value = ''
  try {
    await auth.register({ username: username.value, password: password.value,
                          nickname: nickname.value, code: code.value })
    router.push('/')
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div style="max-width:320px;margin:80px auto">
    <h2>注册</h2>
    <form @submit.prevent="submit">
      <div style="margin:8px 0"><input v-model="username" placeholder="账号（登录用）" /></div>
      <div style="margin:8px 0"><input v-model="password" type="password" placeholder="密码（≥6位）" /></div>
      <div style="margin:8px 0"><input v-model="nickname" placeholder="群昵称" /></div>
      <div style="margin:8px 0"><input v-model="code" placeholder="注册码" /></div>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="loading">{{ loading ? '注册中…' : '注册' }}</button>
    </form>
    <p style="margin-top:12px">已有账号？<router-link to="/login">登录</router-link></p>
  </div>
</template>
