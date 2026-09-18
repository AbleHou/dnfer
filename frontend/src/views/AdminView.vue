<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import { confirmDialog, notifyError } from '../lib/notify'
import type { CodeItem, Dungeon, User } from '../types'

const codes = ref<CodeItem[]>([])
const users = ref<User[]>([])
const dungeons = ref<Dungeon[]>([])
const dgName = ref('')
const dgSize = ref(12)
const dgDesc = ref('')
const editingId = ref<number | null>(null)
const dgError = ref('')
const dgBusy = ref(false)
const singleUse = ref(true)
const expireDays = ref(7)
const error = ref('')
const generating = ref(false)

async function load() {
  codes.value = await api.get<CodeItem[]>('/api/admin/codes')
  users.value = await api.get<User[]>('/api/admin/users')
  dungeons.value = await api.get<Dungeon[]>('/api/dungeons')
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

async function saveDungeon() {
  dgBusy.value = true; dgError.value = ''
  try {
    if (editingId.value) {
      await api.put(`/api/dungeons/${editingId.value}`,
        { name: dgName.value, size: dgSize.value, description: dgDesc.value })
    } else {
      await api.post('/api/dungeons',
        { name: dgName.value, size: dgSize.value, description: dgDesc.value })
    }
    editingId.value = null; dgName.value = ''; dgSize.value = 12; dgDesc.value = ''
    await load()
  } catch (e: any) { dgError.value = e.message }
  finally { dgBusy.value = false }
}

function editDungeon(d: Dungeon) {
  editingId.value = d.id; dgName.value = d.name; dgSize.value = d.size; dgDesc.value = d.description
}

async function delDungeon(d: Dungeon) {
  const ok = await confirmDialog({ content: `确认删除副本「${d.name}」？` })
  if (!ok) return
  try { await api.del(`/api/dungeons/${d.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
</script>

<template>
  <div class="dnf-page">
    <h2>管理面板</h2>
    <section class="dnf-panel dnf-section">
      <h3>生成注册码</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label class="form-label" style="width:auto"><input type="checkbox" v-model="singleUse" /> 一次性</label>
        <input v-model.number="expireDays" type="number" min="0" placeholder="有效期(天,0=不限)" class="dnf-input" />
        <button class="dnf-btn" :disabled="generating" @click="genCode">{{ generating ? '生成中…' : '生成' }}</button>
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <table class="dnf-table">
        <tr><th>注册码</th><th>状态</th><th>过期</th></tr>
        <tr v-for="c in codes" :key="c.id">
          <td><code>{{ c.code }}</code></td>
          <td>{{ c.single_use ? (c.used_by ? '已使用' : '未使用') : '多用户' }}</td>
          <td>{{ c.expires_at ? new Date(c.expires_at + 'Z').toLocaleString() : '不限' }}</td>
        </tr>
      </table>
    </section>
    <section class="dnf-panel dnf-section">
      <h3>成员</h3>
      <table class="dnf-table">
        <tr><th>群昵称</th><th>用户名</th><th>角色</th></tr>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.nickname }}</td>
          <td>{{ u.username }}</td>
          <td>{{ u.is_admin ? '管理员' : '成员' }}</td>
        </tr>
      </table>
    </section>
    <section class="dnf-panel dnf-section">
      <h3>副本管理</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input v-model="dgName" placeholder="副本名称" class="dnf-input" />
        <select v-model.number="dgSize" class="dnf-select">
          <option v-for="s in [4,8,12,16,20]" :key="s" :value="s">{{ s }} 人</option>
        </select>
        <input v-model="dgDesc" placeholder="描述（可选）" class="dnf-input" />
        <button class="dnf-btn dnf-btn-primary" :disabled="dgBusy" @click="saveDungeon">{{ editingId ? '保存' : '新增' }}</button>
      </div>
      <p v-if="dgError" class="form-error">{{ dgError }}</p>
      <table class="dnf-table">
        <tr><th>副本</th><th>人数</th><th>描述</th><th></th></tr>
        <tr v-for="d in dungeons" :key="d.id">
          <td>{{ d.name }}</td><td>{{ d.size }}</td><td>{{ d.description }}</td>
          <td style="white-space:nowrap">
            <button class="dnf-btn dnf-btn-sm" @click="editDungeon(d)">编辑</button>
            <button class="dnf-btn dnf-btn-sm dnf-btn-danger" @click="delDungeon(d)">删除</button>
          </td>
        </tr>
      </table>
    </section>
  </div>
</template>
