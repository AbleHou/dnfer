<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import CharacterCard from './CharacterCard.vue'
import CharacterForm from './CharacterForm.vue'
import { confirmDialog, notifyError } from '../lib/notify'
import type { Character, JobCategory, User } from '../types'

const props = defineProps<{ open: boolean; user: User | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const characters = ref<Character[]>([])
const categories = ref<JobCategory[]>([])
const loading = ref(false)
const showForm = ref(false)
const editing = ref<Character | null>(null)
const error = ref('')

const base = () => props.user ? `/api/admin/users/${props.user.id}/characters` : ''

async function load() {
  if (!props.user) return
  error.value = ''
  loading.value = true
  try {
    const [chars, cats] = await Promise.all([
      api.get<Character[]>(`/api/admin/users/${props.user.id}/characters`),
      api.getJobs(),
    ])
    characters.value = chars
    categories.value = cats
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}

watch(() => [props.open, props.user?.id] as const, ([open]) => {
  if (!open) return
  showForm.value = false
  editing.value = null
  load()
}, { immediate: true })

function startAdd() { editing.value = null; showForm.value = true }
function startEdit(c: Character) { editing.value = c; showForm.value = true }
async function onSaved() { showForm.value = false; editing.value = null; await load() }

async function remove(c: Character) {
  const uid = props.user?.id
  if (!uid) return
  const ok = await confirmDialog({ content: `删除角色 ${c.name}？` })
  if (!ok) return
  try { await api.del(`/api/admin/users/${uid}/characters/${c.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}
</script>

<template>
  <n-modal :show="open" preset="card" :title="user ? `${user.nickname} 的角色` : ''"
           style="width:min(560px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:70vh;overflow:auto">
      <p v-if="error" class="form-error">{{ error }}</p>
      <div v-if="user" style="display:flex;justify-content:flex-end;margin-bottom:8px">
        <button class="dnf-btn dnf-btn-primary" data-act="add" @click="startAdd">＋ 添加角色</button>
      </div>

      <CharacterForm v-if="showForm" :categories="categories" :editing="editing" :base-url="base()"
                     @saved="onSaved" @cancel="() => { showForm = false; editing = null }" />

      <template v-else>
        <p v-if="!loading && !characters.length" style="color:var(--dnf-text-faint)">还没有角色</p>
        <div v-for="c in characters" :key="c.id"
             class="dnf-panel" style="padding:12px;margin:8px 0;display:flex;align-items:center;gap:12px">
          <div style="flex:1"><CharacterCard :character="c" :placement="null" readonly /></div>
          <button class="dnf-btn dnf-btn-sm" :data-act="'edit-'+c.id" @click="startEdit(c)">编辑</button>
          <button class="dnf-btn dnf-btn-sm dnf-btn-danger" :data-act="'del-'+c.id" @click="remove(c)">删除</button>
        </div>
      </template>
    </div>
  </n-modal>
</template>
