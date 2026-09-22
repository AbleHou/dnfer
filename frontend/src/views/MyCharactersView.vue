<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'
import CharacterForm from '../components/CharacterForm.vue'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import { confirmDialog, notifyError } from '../lib/notify'
import type { Character, JobCategory } from '../types'

const list = ref<Character[]>([])
const categories = ref<JobCategory[]>([])
const showForm = ref(false)
const editing = ref<Character | null>(null)
const error = ref('')

async function load() {
  try {
    const [chars, cats] = await Promise.all([
      api.get<Character[]>('/api/me/characters'),
      api.getJobs(),
    ])
    list.value = chars
    categories.value = cats
  } catch (e: any) {
    error.value = e.message
  }
}
onMounted(load)

function startCreate() { editing.value = null; showForm.value = true }
function startEdit(c: Character) { editing.value = c; showForm.value = true }
async function onSaved() { showForm.value = false; editing.value = null; await load() }
function onCancel() { showForm.value = false; editing.value = null }
function onCardClick() {
  // 编辑框打开时点卡片 = 取消（移动端无需划到底部点取消按钮）
  if (showForm.value && editing.value) onCancel()
}

async function remove(c: Character) {
  const ok = await confirmDialog({ content: `删除角色 ${c.name}？` })
  if (!ok) return
  try { await api.del(`/api/me/characters/${c.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <div class="dnf-page" style="max-width:640px">
    <div class="page-head">
      <h2>我的角色</h2>
      <button class="dnf-btn dnf-btn-primary" @click="startCreate">＋ 添加角色</button>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>

    <CharacterForm v-if="showForm && !editing" :categories="categories" :editing="null"
                   @saved="onSaved" @cancel="onCancel" />

    <template v-for="c in list" :key="c.id">
      <div class="dnf-panel" style="padding:12px;margin:10px 0;display:flex;align-items:center;gap:12px"
           @click="onCardClick">
        <div style="display:flex;align-items:center;gap:10px;flex:1">
          <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:32px;height:32px">
          <div>
            <b>{{ c.name }}</b>
            <span style="color:var(--dnf-text-muted);font-size:12px">{{ c.job_title }} · {{ c.class_type }} · 名望 {{ c.fame }}</span>
            <div style="color:var(--dnf-text-faint);font-size:12px">
              {{ c.class_type === '输出'
                ? `模拟 ${fmtDps(c.simulated_damage)} · 秒伤 ${fmtDps(c.sustained_dps)}`
                : `增益 ${fmtBuff(c.buff_amount)}` }}
            </div>
          </div>
        </div>
        <button class="dnf-btn dnf-btn-sm" @click.stop="startEdit(c)">编辑</button>
        <button class="dnf-btn dnf-btn-sm dnf-btn-danger" @click.stop="remove(c)">删除</button>
      </div>
      <CharacterForm v-if="showForm && editing?.id === c.id" :categories="categories" :editing="c"
                     @saved="onSaved" @cancel="onCancel" />
    </template>
    <p v-if="!list.length" style="color:var(--dnf-text-faint)">还没有角色</p>
  </div>
</template>
