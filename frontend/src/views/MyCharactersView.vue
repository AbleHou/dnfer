<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { api } from '../api/client'
import { categoryIcon, jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character, JobCategory, JobChild } from '../types'

const list = ref<Character[]>([])
const showForm = ref(false)
const editing = ref<Character | null>(null)
const form = ref({ name: '', fame: null as number | null,
  simulated_damage: null as number | null, sustained_dps: null as number | null,
  buff_amount: null as number | null })
const error = ref('')
const saving = ref(false)

const categories = ref<JobCategory[]>([])
const selectedCat = ref<JobCategory | null>(null)
const selectedJob = ref<JobChild | null>(null)
const isSupport = computed(() => selectedJob.value?.class_type === '辅助')

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

function onPickCategory(cat: JobCategory) { selectedCat.value = cat; selectedJob.value = null }

watch(selectedJob, (j) => {
  if (j?.class_type === '输出') form.value.buff_amount = null
  else if (j?.class_type === '辅助') {
    form.value.simulated_damage = null; form.value.sustained_dps = null
  }
})

function startCreate() {
  editing.value = null; showForm.value = true
  form.value = { name: '', fame: null, simulated_damage: null, sustained_dps: null, buff_amount: null }
  selectedCat.value = null; selectedJob.value = null
}
function startEdit(c: Character) {
  editing.value = c; showForm.value = true
  form.value = { name: c.name, fame: c.fame, simulated_damage: c.simulated_damage,
    sustained_dps: c.sustained_dps, buff_amount: c.buff_amount }
  selectedCat.value = categories.value.find(cat => cat.name === c.parent_name) ?? null
  selectedJob.value = selectedCat.value?.children.find(ch => ch.name === c.job_name) ?? null
}
async function save() {
  if (!selectedJob.value) { error.value = '请选择职业'; return }
  saving.value = true; error.value = ''
  try {
    const payload = { name: form.value.name, job_name: selectedJob.value.name,
      fame: Number(form.value.fame) || 0,
      simulated_damage: form.value.simulated_damage,
      sustained_dps: form.value.sustained_dps, buff_amount: form.value.buff_amount }
    if (editing.value) await api.put(`/api/me/characters/${editing.value.id}`, payload)
    else await api.post('/api/me/characters', payload)
    editing.value = null; showForm.value = false; await load()
  } catch (e: any) { error.value = e.message }
  finally { saving.value = false }
}
async function remove(c: Character) {
  if (!confirm(`删除角色 ${c.name}？`)) return
  try { await api.del(`/api/me/characters/${c.id}`); await load() }
  catch (e: any) { alert(e.message) }
}
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <div style="max-width:600px;margin:24px auto">
    <div style="display:flex;align-items:center;gap:12px">
      <h2>我的角色</h2>
      <button @click="startCreate">＋ 添加角色</button>
    </div>

    <div v-for="c in list" :key="c.id" style="border:1px solid #eee;padding:10px;margin:8px 0;
         display:flex;align-items:center;gap:12px">
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:32px;height:32px">
        <div>
          <b>{{ c.name }}</b>
          <span style="color:#666;font-size:12px">{{ c.job_title }} · {{ c.class_type }} · 名望 {{ c.fame }}</span>
          <div style="color:#999;font-size:12px">
            {{ c.class_type === '输出'
              ? `模拟 ${fmtDps(c.simulated_damage)} · 秒伤 ${fmtDps(c.sustained_dps)}`
              : `增益 ${fmtBuff(c.buff_amount)}` }}
          </div>
        </div>
      </div>
      <button @click="startEdit(c)">编辑</button>
      <button @click="remove(c)" style="color:#c62828">删除</button>
    </div>
    <p v-if="!list.length" style="color:#999">还没有角色</p>

    <div v-if="showForm" style="border:1px solid #ddd;padding:16px;margin:12px 0">
      <h3>{{ editing ? '编辑角色' : '添加角色' }}</h3>
      <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <label for="char-name" style="width:80px;flex-shrink:0">角色名：</label>
        <input id="char-name" v-model="form.name" style="flex:1" />
      </div>
      <div style="display:flex;align-items:flex-start;gap:8px;margin:8px 0">
        <label style="width:80px;flex-shrink:0">职业：</label>
        <div style="flex:1">
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button v-for="cat in categories" :key="cat.name" type="button" :data-cat="cat.name"
                    @click="onPickCategory(cat)"
                    :style="selectedCat?.name === cat.name ? 'outline:2px solid #1976d2' : ''">
              <img :src="categoryIcon(cat.name)" @error="onIconError" style="width:36px;height:36px">
              <span style="display:block;font-size:11px">{{ cat.title }}</span>
            </button>
          </div>
          <div v-if="selectedCat" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
            <button v-for="child in selectedCat.children" :key="child.name" type="button"
                    :data-job="child.name" @click="selectedJob = child"
                    :style="selectedJob?.name === child.name ? 'outline:2px solid #1976d2' : ''">
              <img :src="jobIcon(child.name)" @error="onIconError" style="width:36px;height:36px">
              <span style="display:block;font-size:11px">{{ child.title }}</span>
            </button>
          </div>
          <p v-if="selectedJob" style="color:#666;font-size:12px;margin:4px 0 0">
            已选：{{ selectedJob.title }}（{{ selectedJob.class_type }}职业）
          </p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <label for="char-fame" style="width:80px;flex-shrink:0">名望：</label>
        <input id="char-fame" v-model.number="form.fame" type="number" style="flex:1" />
      </div>
      <template v-if="selectedJob">
        <template v-if="!isSupport">
          <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
            <label for="char-damage" style="width:80px;flex-shrink:0">模拟伤害（亿）：</label>
            <input id="char-damage" v-model.number="form.simulated_damage" type="number" style="flex:1" />
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
            <label for="char-dps" style="width:80px;flex-shrink:0">秒伤（亿）：</label>
            <input id="char-dps" v-model.number="form.sustained_dps" type="number" style="flex:1" />
          </div>
        </template>
        <template v-else>
          <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
            <label for="char-buff" style="width:80px;flex-shrink:0">增益量：</label>
            <input id="char-buff" v-model.number="form.buff_amount" type="number" style="flex:1" />
          </div>
        </template>
      </template>
      <p v-else style="color:#999;font-size:12px">请先选择职业</p>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="saving" data-act="save" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      <button @click="showForm = false">取消</button>
    </div>
  </div>
</template>
