<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { api } from '../api/client'
import type { Character, ClassType } from '../types'

const list = ref<Character[]>([])
const showForm = ref(false)
const editing = ref<Character | null>(null)
const form = ref({ name: '', class_type: '输出' as ClassType, fame: 0,
  simulated_damage: null as number | null, sustained_dps: null as number | null,
  buff_amount: null as number | null })
const error = ref('')
const saving = ref(false)

watch(() => form.value.class_type, (t) => {
  if (t === '输出') form.value.buff_amount = null
  else { form.value.simulated_damage = null; form.value.sustained_dps = null }
})

async function load() { list.value = await api.get<Character[]>('/api/me/characters') }
onMounted(load)

function startCreate() { editing.value = null; showForm.value = true; form.value = { name: '', class_type: '输出', fame: 0,
  simulated_damage: null, sustained_dps: null, buff_amount: null } }
function startEdit(c: Character) {
  editing.value = c; showForm.value = true
  form.value = { name: c.name, class_type: c.class_type, fame: c.fame,
    simulated_damage: c.simulated_damage, sustained_dps: c.sustained_dps, buff_amount: c.buff_amount }
}
async function save() {
  saving.value = true; error.value = ''
  try {
    if (editing.value) await api.put(`/api/me/characters/${editing.value.id}`, form.value)
    else await api.post('/api/me/characters', form.value)
    editing.value = null; showForm.value = false; await load()
  } catch (e: any) { error.value = e.message }
  finally { saving.value = false }
}
async function remove(c: Character) {
  if (!confirm(`删除角色 ${c.name}？`)) return
  try { await api.del(`/api/me/characters/${c.id}`); await load() }
  catch (e: any) { alert(e.message) }
}
const isDps = computed(() => form.value.class_type === '输出')
</script>

<template>
  <div style="max-width:600px;margin:24px auto">
    <div style="display:flex;align-items:center;gap:12px">
      <h2>我的角色</h2>
      <button @click="startCreate">＋ 添加角色</button>
    </div>

    <div v-for="c in list" :key="c.id" style="border:1px solid #eee;padding:10px;margin:8px 0;
         display:flex;align-items:center;gap:12px">
      <div style="flex:1">
        <b>{{ c.name }}</b>
        <span style="color:#666;font-size:12px">{{ c.class_type }} · 名望 {{ c.fame }}</span>
        <div style="color:#999;font-size:12px">
          {{ c.class_type === '输出'
            ? `模拟 ${c.simulated_damage ?? '-'} · 秒伤 ${c.sustained_dps ?? '-'}`
            : `增益 ${c.buff_amount ?? '-'}` }}
        </div>
      </div>
      <button @click="startEdit(c)">编辑</button>
      <button @click="remove(c)" style="color:#c62828">删除</button>
    </div>
    <p v-if="!list.length" style="color:#999">还没有角色</p>

    <div v-if="showForm" style="border:1px solid #ddd;padding:16px;margin:12px 0">
      <h3>{{ editing ? '编辑角色' : '添加角色' }}</h3>
      <div><input v-model="form.name" placeholder="角色名" /></div>
      <div>
        <select v-model="form.class_type">
          <option value="输出">输出</option>
          <option value="辅助">辅助</option>
        </select>
        <input v-model.number="form.fame" type="number" placeholder="名望值" />
      </div>
      <template v-if="isDps">
        <div><input v-model.number="form.simulated_damage" type="number" placeholder="模拟伤害" /></div>
        <div><input v-model.number="form.sustained_dps" type="number" placeholder="秒伤" /></div>
      </template>
      <template v-else>
        <div><input v-model.number="form.buff_amount" type="number" placeholder="增益量" /></div>
      </template>
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      <button @click="showForm = false">取消</button>
    </div>
  </div>
</template>
