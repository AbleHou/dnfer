<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import { confirmDialog, notifyError } from '../lib/notify'
import type { Dungeon } from '../types'
import AdminNav from '../components/AdminNav.vue'

const dungeons = ref<Dungeon[]>([])
const dgName = ref('')
const dgSize = ref(12)
const dgDesc = ref('')
const editingId = ref<number | null>(null)
const dgError = ref('')
const dgBusy = ref(false)

async function load() {
  dungeons.value = await api.get<Dungeon[]>('/api/dungeons')
}
onMounted(load)

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
    <AdminNav />
    <h2>副本管理</h2>
    <section class="dnf-panel dnf-section">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input v-model="dgName" placeholder="副本名称" class="dnf-input" />
        <select v-model.number="dgSize" class="dnf-select">
          <option v-for="s in [4,8,12,16,20]" :key="s" :value="s">{{ s }} 人</option>
        </select>
        <input v-model="dgDesc" placeholder="描述（可选）" class="dnf-input" />
        <button class="dnf-btn dnf-btn-primary" data-act="save" :disabled="dgBusy" @click="saveDungeon">{{ editingId ? '保存' : '新增' }}</button>
      </div>
      <p v-if="dgError" class="form-error">{{ dgError }}</p>
      <table class="dnf-table">
        <thead>
          <tr><th scope="col">副本</th><th scope="col">人数</th><th scope="col">描述</th><th scope="col"></th></tr>
        </thead>
        <tbody>
          <tr v-for="d in dungeons" :key="d.id">
            <td>{{ d.name }}</td><td>{{ d.size }}</td><td>{{ d.description }}</td>
            <td style="white-space:nowrap">
              <button class="dnf-btn dnf-btn-sm" @click="editDungeon(d)">编辑</button>
              <button class="dnf-btn dnf-btn-sm dnf-btn-danger" :data-act="'del-' + d.id" @click="delDungeon(d)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
