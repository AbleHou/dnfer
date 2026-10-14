<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { confirmDialog, notifyError } from '../lib/notify'
import type { AdventureParty } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

const parties = ref<AdventureParty[]>([])
const loading = ref(false)
const error = ref('')
const createName = ref('')
const renamingId = ref<number | null>(null)
const renameName = ref('')

async function load() {
  error.value = ''
  loading.value = true
  try {
    parties.value = await api.get<AdventureParty[]>('/api/me/adventure-parties')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (open) => {
  if (!open) return
  renamingId.value = null
  renameName.value = ''
  load()
}, { immediate: true })

async function create() {
  try {
    await api.post<AdventureParty>('/api/me/adventure-parties', { name: createName.value })
    createName.value = ''
    await load()
    emit('changed')
  } catch (e: any) { notifyError(e.message) }
}

function startRename(p: AdventureParty) {
  renamingId.value = p.id
  renameName.value = p.name
}

async function saveRename(p: AdventureParty) {
  try {
    await api.put<AdventureParty>(`/api/me/adventure-parties/${p.id}`, { name: renameName.value })
    renamingId.value = null
    await load()
    emit('changed')
  } catch (e: any) { notifyError(e.message) }
}

async function remove(p: AdventureParty) {
  const ok = await confirmDialog({ content: `删除冒险团「${p.name}」？` })
  if (!ok) return
  try {
    await api.del(`/api/me/adventure-parties/${p.id}`)
    await load()
    emit('changed')
  } catch (e: any) { notifyError(e.message) }
}
</script>

<template>
  <n-modal :show="open" preset="card" title="冒险团管理"
           style="width:min(560px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="max-height:70vh;overflow:auto">
      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-if="!loading && !parties.length" style="color:var(--dnf-text-faint)">还没有冒险团</p>

      <div v-for="p in parties" :key="p.id" class="dnf-panel party-row" :data-party-id="p.id"
           style="padding:12px;margin:8px 0;display:flex;align-items:center;gap:12px">
        <template v-if="renamingId === p.id">
          <input v-model="renameName" class="dnf-input" data-act="party-rename-input"
                 style="flex:1" />
          <button class="dnf-btn dnf-btn-sm dnf-btn-primary" data-act="party-rename-save"
                  @click="saveRename(p)">保存</button>
        </template>
        <template v-else>
          <div style="flex:1">
            <b style="margin-right:6px">{{ p.name }}</b>
            <span style="color:var(--dnf-text-faint);font-size:12px">（{{ p.character_count }} 角色）</span>
          </div>
          <button class="dnf-btn dnf-btn-sm" :data-act="'party-rename-'+p.id"
                  @click="startRename(p)">改名</button>
          <button class="dnf-btn dnf-btn-sm dnf-btn-danger" :data-act="'party-delete-'+p.id"
                  :disabled="p.character_count > 0 || parties.length <= 1"
                  @click="remove(p)">删除</button>
        </template>
      </div>

      <div style="display:flex;align-items:center;gap:8px;margin-top:12px">
        <input v-model="createName" class="dnf-input" data-act="party-create-input"
               placeholder="新冒险团名" style="flex:1" />
        <button class="dnf-btn dnf-btn-primary" data-act="party-create"
                @click="create">创建</button>
      </div>
    </div>
  </n-modal>
</template>
