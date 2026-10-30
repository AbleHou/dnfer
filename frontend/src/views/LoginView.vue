<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NInput } from 'naive-ui'
import { DnfButton, DnfFrame } from '@dnftools/ui'
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
  <div class="auth-wrap">
    <DnfFrame surface="panel" class="auth-card">
      <h2 style="margin-top:0">登录</h2>
      <form @submit.prevent="submit">
        <div style="margin:10px 0"><n-input v-model:value="username" placeholder="账号" /></div>
        <div style="margin:10px 0"><n-input v-model:value="password" type="password" placeholder="密码" /></div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <DnfButton type="submit" tone="gold" style="width:100%" :loading="loading">登录</DnfButton>
      </form>
      <p style="margin-top:12px">还没有账号？<router-link to="/register">凭注册码注册</router-link></p>
    </DnfFrame>
  </div>
</template>
