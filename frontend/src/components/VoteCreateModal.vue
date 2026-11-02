<script setup lang="ts">
import { ref, watch } from 'vue'
import { DnfButton, DnfDialog, DnfInput, DnfTextarea } from '@dnftools/ui'
import { api } from '../api/client'
import { notifyError, notifySuccess } from '../lib/notify'
import type { VoteDetail } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'created'): void }>()

const title = ref('')
const description = ref('')
const multiChoice = ref(false)
const options = ref<string[]>(['', ''])
const error = ref('')
const busy = ref(false)

function addOption() { if (options.value.length < 20) options.value.push('') }
function removeOption(i: number) { if (options.value.length > 2) options.value.splice(i, 1) }
function reset() {
  title.value = ''; description.value = ''; multiChoice.value = false
  options.value = ['', '']; error.value = ''
}
watch(() => props.open, (v) => { if (v) reset() })

async function create() {
  const list = options.value.map(o => o.trim()).filter(Boolean)
  if (!title.value.trim()) { error.value = '请填写标题'; return }
  if (list.length < 2) { error.value = '至少两个选项'; return }
  if (new Set(list).size !== list.length) { error.value = '选项不能重复'; return }
  busy.value = true; error.value = ''
  try {
    await api.post<VoteDetail>('/api/admin/votes', {
      title: title.value.trim(), description: description.value.trim(),
      multi_choice: multiChoice.value, options: list,
    })
    notifySuccess('投票已创建'); reset(); emit('created'); emit('close')
  } catch (e: any) { error.value = e.message }
  finally { busy.value = false }
}
</script>

<template>
  <DnfDialog :open="open" title="发起投票" width="480px" modal close-on-outside
             @update:open="(v: boolean) => { if (!v) emit('close') }">
    <div class="vote-form">
      <DnfInput v-model="title" data-field="title" placeholder="标题" />
      <DnfTextarea v-model="description" data-field="desc" rows="2"
                   placeholder="描述（可选）" />
      <label class="vote-check">
        <input v-model="multiChoice" data-field="multi" type="checkbox" /> 多选
      </label>
      <div v-for="(o, i) in options" :key="i" class="vote-opt-row">
        <DnfInput v-model="options[i]" :data-field="'opt-' + i" placeholder="选项" />
        <DnfButton v-if="options.length > 2" class="dnf-btn-sm" type="button"
                   :data-act="'rm-opt-' + i" @click="removeOption(i)">删除</DnfButton>
      </div>
      <DnfButton v-if="options.length < 20" class="dnf-btn-sm" type="button"
                 data-act="add-opt" @click="addOption">＋ 添加选项</DnfButton>
      <p v-if="error" class="form-error">{{ error }}</p>
      <DnfButton tone="gold" data-act="create" :disabled="busy" @click="create">
        {{ busy ? '创建中…' : '发起投票' }}
      </DnfButton>
    </div>
  </DnfDialog>
</template>

<style scoped>
.vote-form { display:flex; flex-direction:column; gap:10px }
.vote-check { display:flex; align-items:center; gap:6px; color:var(--dnf-text-muted,#9aa3b2) }
.vote-opt-row { display:flex; gap:8px; align-items:center }
</style>
