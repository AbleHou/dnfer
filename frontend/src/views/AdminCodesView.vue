<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import type { CodeItem } from '../types'
import AdminNav from '../components/AdminNav.vue'

const codes = ref<CodeItem[]>([])
const singleUse = ref(true)
const expireDays = ref(7)
const error = ref('')
const generating = ref(false)

async function load() {
  codes.value = await api.get<CodeItem[]>('/api/admin/codes')
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
  <div class="dnf-page">
    <AdminNav />
    <h2>邀请码管理</h2>
    <section class="dnf-panel dnf-section">
      <h3>生成注册码</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label class="form-label" style="width:auto"><input type="checkbox" v-model="singleUse" /> 一次性</label>
        <input v-model.number="expireDays" type="number" min="0" placeholder="有效期(天,0=不限)" class="dnf-input" />
        <button class="dnf-btn" data-act="gen" :disabled="generating" @click="genCode">{{ generating ? '生成中…' : '生成' }}</button>
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <table class="dnf-table">
        <thead>
          <tr><th scope="col">注册码</th><th scope="col">状态</th><th scope="col">过期</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in codes" :key="c.id">
            <td><code>{{ c.code }}</code></td>
            <td>{{ c.single_use ? (c.used_by ? '已使用' : '未使用') : '多用户' }}</td>
            <td>{{ c.expires_at ? new Date(c.expires_at + 'Z').toLocaleString() : '不限' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
