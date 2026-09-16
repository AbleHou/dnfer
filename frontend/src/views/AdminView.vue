<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import type { CodeItem, User } from '../types'

const codes = ref<CodeItem[]>([])
const users = ref<User[]>([])
const singleUse = ref(true)
const expireDays = ref(7)
const error = ref('')
const generating = ref(false)

async function load() {
  codes.value = await api.get<CodeItem[]>('/api/admin/codes')
  users.value = await api.get<User[]>('/api/admin/users')
}
onMounted(load)

async function genCode() {
  generating.value = true; error.value = ''
  try {
    await api.post('/api/admin/codes', { single_use: singleUse.value, expire_days: expireDays.value || null })
    await load()
  } catch (e: any) { error.value = e.message }
  finally { generating.value = false }
}
</script>

<template>
  <div style="max-width:700px;margin:24px auto">
    <h2>管理面板</h2>
    <section style="margin:16px 0">
      <h3>生成注册码</h3>
      <label><input type="checkbox" v-model="singleUse" /> 一次性</label>
      <input v-model.number="expireDays" type="number" min="0" placeholder="有效期(天,0=不限)" />
      <button :disabled="generating" @click="genCode">{{ generating ? '生成中…' : '生成' }}</button>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px">
        <tr><th style="text-align:left">注册码</th><th>状态</th><th>过期</th></tr>
        <tr v-for="c in codes" :key="c.id">
          <td><code>{{ c.code }}</code></td>
          <td>{{ c.used_by ? '已使用' : '未使用' }}</td>
          <td>{{ c.expires_at ? new Date(c.expires_at).toLocaleString() : '不限' }}</td>
        </tr>
      </table>
    </section>
    <section>
      <h3>成员</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="text-align:left">群昵称</th><th>用户名</th><th>角色</th></tr>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.nickname }}</td>
          <td>{{ u.username }}</td>
          <td>{{ u.is_admin ? '管理员' : '成员' }}</td>
        </tr>
      </table>
    </section>
  </div>
</template>
