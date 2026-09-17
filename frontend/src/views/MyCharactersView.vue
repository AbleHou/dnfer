<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { api } from '../api/client'
import type { Character, ClassType } from '../types'

const list = ref<Character[]>([])
const showForm = ref(false)
const editing = ref<Character | null>(null)
const form = ref({ name: '', class_type: '输出' as ClassType, fame: null as number | null,
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

function startCreate() { editing.value = null; showForm.value = true; form.value = { name: '', class_type: '输出', fame: null,
  simulated_damage: null, sustained_dps: null, buff_amount: null } }
function startEdit(c: Character) {
  editing.value = c; showForm.value = true
  form.value = { name: c.name, class_type: c.class_type, fame: c.fame,
    simulated_damage: c.simulated_damage, sustained_dps: c.sustained_dps, buff_amount: c.buff_amount }
}
async function save() {
  saving.value = true; error.value = ''
  try {
    const payload = { ...form.value, fame: Number(form.value.fame) || 0 }
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
const isDps = computed(() => form.value.class_type === '输出')
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
      <div style="flex:1">
        <b>{{ c.name }}</b>
        <span style="color:#666;font-size:12px">{{ c.class_type }} · 名望 {{ c.fame }}</span>
        <div style="color:#999;font-size:12px">
          {{ c.class_type === '输出'
            ? `模拟 ${fmtDps(c.simulated_damage)} · 秒伤 ${fmtDps(c.sustained_dps)}`
            : `增益 ${fmtBuff(c.buff_amount)}` }}
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
      <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <label for="char-class" style="width:80px;flex-shrink:0">职业：</label>
        <select id="char-class" v-model="form.class_type" style="flex:1">
          <option value="输出">输出</option>
          <option value="辅助">辅助</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <label for="char-fame" style="width:80px;flex-shrink:0">名望：</label>
        <input id="char-fame" v-model.number="form.fame" type="number" style="flex:1" />
      </div>
      <template v-if="isDps">
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
      <p v-if="error" style="color:#c62828">{{ error }}</p>
      <button :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      <button @click="showForm = false">取消</button>
    </div>
  </div>
</template>
