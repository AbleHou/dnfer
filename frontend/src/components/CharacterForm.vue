<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { api } from '../api/client'
import { categoryIcon, jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character, JobCategory, JobChild } from '../types'

const props = defineProps<{ categories: JobCategory[]; editing: Character | null; baseUrl?: string }>()
const base = () => props.baseUrl ?? '/api/me/characters'
const emit = defineEmits<{ (e: 'saved'): void; (e: 'cancel'): void }>()

const form = ref({ name: props.editing?.name ?? '', fame: props.editing?.fame ?? null as number | null,
  simulated_damage: props.editing?.simulated_damage ?? null as number | null,
  sustained_dps: props.editing?.sustained_dps ?? null as number | null,
  buff_amount: props.editing?.buff_amount ?? null as number | null })
const selectedCat = ref<JobCategory | null>(
  props.categories.find(cat => cat.name === props.editing?.parent_name) ?? null)
const selectedJob = ref<JobChild | null>(
  selectedCat.value?.children.find(ch => ch.name === props.editing?.job_name) ?? null)
const isSupport = computed(() => selectedJob.value?.class_type === '辅助')
const error = ref('')
const saving = ref(false)

function onPickCategory(cat: JobCategory) { selectedCat.value = cat; selectedJob.value = null }

watch(selectedJob, (j) => {
  if (j?.class_type === '输出') form.value.buff_amount = null
  else if (j?.class_type === '辅助') {
    form.value.simulated_damage = null; form.value.sustained_dps = null
  }
})

async function save() {
  if (!selectedJob.value) { error.value = '请选择职业'; return }
  saving.value = true; error.value = ''
  try {
    const payload = { name: form.value.name, job_name: selectedJob.value.name,
      fame: Number(form.value.fame) || 0,
      simulated_damage: form.value.simulated_damage,
      sustained_dps: form.value.sustained_dps, buff_amount: form.value.buff_amount }
    if (props.editing) await api.put(`${base()}/${props.editing.id}`, payload)
    else await api.post(base(), payload)
    emit('saved')
  } catch (e: any) { error.value = e.message }
  finally { saving.value = false }
}
</script>

<template>
  <div class="dnf-panel create-form">
    <h3>{{ editing ? '编辑角色' : '添加角色' }}</h3>
    <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
      <label for="char-name" class="form-label">角色名：</label>
      <input id="char-name" v-model="form.name" class="dnf-input" style="flex:1" />
    </div>
    <div style="display:flex;align-items:flex-start;gap:8px;margin:8px 0">
      <label class="form-label">职业：</label>
      <div style="flex:1">
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button v-for="cat in categories" :key="cat.name" type="button" :data-cat="cat.name"
                  class="job-pick-btn"
                  :class="{ active: selectedCat?.name === cat.name }"
                  @click="onPickCategory(cat)">
            <img :src="categoryIcon(cat.name)" alt="" @error="onIconError" style="width:36px;height:36px">
            <span style="display:block;font-size:11px">{{ cat.title }}</span>
          </button>
        </div>
        <div v-if="selectedCat" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
          <button v-for="child in selectedCat.children" :key="child.name" type="button"
                  :data-job="child.name" class="job-pick-btn"
                  :class="{ active: selectedJob?.name === child.name }"
                  @click="selectedJob = child">
            <img :src="jobIcon(child.name)" alt="" @error="onIconError" style="width:36px;height:36px">
            <span style="display:block;font-size:11px">{{ child.title }}</span>
          </button>
        </div>
        <p v-if="selectedJob" style="color:var(--dnf-text-muted);font-size:12px;margin:4px 0 0">
          已选：{{ selectedJob.title }}（{{ selectedJob.class_type }}职业）
        </p>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
      <label for="char-fame" class="form-label">名望：</label>
      <input id="char-fame" v-model.number="form.fame" type="number" class="dnf-input" style="flex:1" />
    </div>
    <template v-if="selectedJob">
      <template v-if="!isSupport">
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-damage" class="form-label">模拟伤害（亿）：</label>
          <input id="char-damage" v-model.number="form.simulated_damage" type="number" class="dnf-input" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-dps" class="form-label">秒伤（亿）：</label>
          <input id="char-dps" v-model.number="form.sustained_dps" type="number" class="dnf-input" style="flex:1" />
        </div>
      </template>
      <template v-else>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-buff" class="form-label">增益量：</label>
          <input id="char-buff" v-model.number="form.buff_amount" type="number" class="dnf-input" style="flex:1" />
        </div>
      </template>
    </template>
    <p v-else style="color:var(--dnf-text-faint);font-size:12px">请先选择职业</p>
    <p v-if="error" class="form-error">{{ error }}</p>
    <button class="dnf-btn dnf-btn-primary" :disabled="saving" data-act="save" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
    <button class="dnf-btn" @click="emit('cancel')">取消</button>
  </div>
</template>
