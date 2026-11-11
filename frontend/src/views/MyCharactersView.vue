<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DnfButton, DnfDialog, DnfSelect } from '@dnftools/ui'
import { api } from '../api/client'
import CharacterForm from '../components/CharacterForm.vue'
import CharacterPoster from '../components/CharacterPoster.vue'
import AdventurePartyModal from '../components/AdventurePartyModal.vue'
import CommunitySyncPanel from '../components/CommunitySyncPanel.vue'
import { characterProfile } from '../lib/job'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
import type { Character, JobCategory } from '../types'

const list = ref<Character[]>([])
const categories = ref<JobCategory[]>([])
const showForm = ref(false)
const editing = ref<Character | null>(null)
const error = ref('')
const partyModalOpen = ref(false)
const syncPanelOpen = ref(false)

type SortMode = 'type' | 'fame' | 'party'
const sortMode = ref<SortMode>('type')
const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'type', label: '按类型' },
  { value: 'fame', label: '按名望' },
  { value: 'party', label: '按冒险团' },
]
const TYPE_RANK: Record<Character['class_type'], number> = { 输出: 0, 辅助: 1 }

const sorted = computed(() =>
  [...list.value].sort((a, b) => {
    if (sortMode.value === 'fame') return b.fame - a.fame || a.id - b.id
    if (sortMode.value === 'party') {
      const pa = a.adventure_party_id ?? Infinity
      const pb = b.adventure_party_id ?? Infinity
      return pa - pb || b.fame - a.fame || a.id - b.id
    }
    return TYPE_RANK[a.class_type] - TYPE_RANK[b.class_type] || b.fame - a.fame || a.id - b.id
  }))

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

async function remove(c: Character) {
  const ok = await confirmDialog({ content: `删除角色 ${c.name}？` })
  if (!ok) return
  try { await api.del(`/api/me/characters/${c.id}`); await load() }
  catch (e: any) { notifyError(e.message) }
}

const profileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const profilePreviewSrc = computed(() =>
  editing.value ? editing.value.profile
      ?? characterProfile(editing.value.parent_name, editing.value.job_name) : '')

async function onProfileFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f || !editing.value) return
  uploading.value = true
  try {
    const updated = await api.upload<Character>(`/api/me/characters/${editing.value.id}/profile`, f)
    editing.value = updated
    await load()
    notifySuccess('形象已更新')
  } catch (err: any) { notifyError(err.message) }
  finally {
    uploading.value = false
    if (profileInput.value) profileInput.value.value = ''
  }
}

async function restoreProfile() {
  if (!editing.value) return
  uploading.value = true
  try {
    const updated = await api.del<Character>(`/api/me/characters/${editing.value.id}/profile`)
    editing.value = updated
    await load()
    notifySuccess('已恢复默认')
  } catch (err: any) { notifyError(err.message) }
  finally { uploading.value = false }
}
</script>

<template>
  <div class="dnf-page" style="max-width:900px">
    <div class="page-head">
      <h2>我的角色</h2>
      <div style="display:flex;align-items:center;gap:8px">
        <DnfButton tone="gold" class="dnf-btn-sm" @click="startCreate">＋ 添加角色</DnfButton>
        <DnfButton class="dnf-btn-sm" data-act="manage-parties"
                   @click="partyModalOpen = true">冒险团管理</DnfButton>
        <DnfButton class="dnf-btn-sm" data-act="sync-community" @click="syncPanelOpen = !syncPanelOpen">
          同步社区</DnfButton>
        <DnfSelect :model-value="sortMode" :options="sortOptions" label="排序"
                   data-act="sort-select" style="width:130px"
                   @update:model-value="(v) => sortMode = v as SortMode" />
      </div>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="char-grid">
      <CharacterPoster v-for="c in sorted" :key="c.id" :character="c"
                       @click="startEdit(c)" @delete="remove(c)" />
    </div>
    <p v-if="!list.length" style="color:var(--dnf-text-faint)">还没有角色</p>

    <DnfDialog :open="showForm" :title="editing ? '编辑角色' : '添加角色'" width="min(560px,92vw)"
               modal close-on-outside
               @update:open="(s: boolean) => { if (!s) onCancel() }">
      <CharacterForm :categories="categories" :editing="editing" @saved="onSaved" @cancel="onCancel" />
      <div v-if="editing" class="profile-section" style="margin-top:12px;display:flex;align-items:center;gap:10px">
        <img :src="profilePreviewSrc" class="profile-preview"
             style="width:48px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--dnf-edge)">
        <input ref="profileInput" type="file" accept="image/*,.apng" style="display:none" @change="onProfileFile">
        <DnfButton class="dnf-btn-sm" :disabled="uploading" @click="profileInput?.click()">
          {{ uploading ? '上传中…' : '自定义形象' }}</DnfButton>
        <DnfButton v-if="editing.profile" class="dnf-btn-sm" :disabled="uploading" @click="restoreProfile">
          恢复默认</DnfButton>
      </div>
    </DnfDialog>

    <CommunitySyncPanel v-if="syncPanelOpen" @changed="load" />

    <AdventurePartyModal :open="partyModalOpen"
                         @close="partyModalOpen = false"
                         @changed="load" />
  </div>
</template>

<style scoped>
.char-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
  gap: 14px; margin: 12px 0; }
</style>
