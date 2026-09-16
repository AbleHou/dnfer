<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true; error.value = ''
  try { await auth.login(username.value, password.value); router.push('/') }
  catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div style="max-width:320px;margin:80px auto">
    <h2>登录</h2>
    <form @submit.prevent="submit">
      <div style="margin:8px 0"><input v-model="username" placeholder="用户名" /></div>
      <div style="margin:8px 0"><input v-model="password" type="password" placeholder="密码" /></div>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="loading">{{ loading ? '登录中…' : '登录' }}</button>
    </form>
    <p style="margin-top:12px">还没有账号？<router-link to="/register">凭注册码注册</router-link></p>
  </div>
</template>
