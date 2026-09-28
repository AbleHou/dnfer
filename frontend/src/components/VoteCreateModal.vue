<script setup lang="ts">
import { ref } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { notifyError, notifySuccess } from '../lib/notify'

defineProps<{ open: boolean }>()
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

async function create() {
  const list = options.value.map(o => o.trim()).filter(Boolean)
  if (!title.value.trim()) { error.value = '请填写标题'; return }
  if (list.length < 2) { error.value = '至少两个选项'; return }
  if (new Set(list).size !== list.length) { error.value = '选项不能重复'; return }
  busy.value = true; error.value = ''
  try {
    await api.post('/api/admin/votes', {
      title: title.value.trim(), description: description.value.trim(),
      multi_choice: multiChoice.value, options: list,
    })
    notifySuccess('投票已创建'); reset(); emit('created'); emit('close')
  } catch (e: any) { error.value = e.message }
  finally { busy.value = false }
}
</script>

<template>
  <n-modal :show="open" preset="card" title="发起投票" style="width:480px"
           @update:show="(v: boolean) => { if (!v) emit('close') }">
    <div class="vote-form">
      <input v-model="title" data-field="title" class="dnf-input" placeholder="标题" />
      <textarea v-model="description" data-field="desc" class="dnf-input" rows="2"
                placeholder="描述（可选）" />
      <label class="vote-check">
        <input v-model="multiChoice" data-field="multi" type="checkbox" /> 多选
      </label>
      <div v-for="(o, i) in options" :key="i" class="vote-opt-row">
        <input v-model="options[i]" :data-field="'opt-' + i" class="dnf-input" placeholder="选项" />
        <button v-if="options.length > 2" class="dnf-btn dnf-btn-sm" type="button"
                :data-act="'rm-opt-' + i" @click="removeOption(i)">删除</button>
      </div>
      <button v-if="options.length < 20" class="dnf-btn dnf-btn-sm" type="button"
              data-act="add-opt" @click="addOption">＋ 添加选项</button>
      <p v-if="error" class="form-error">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-act="create" :disabled="busy" @click="create">
        {{ busy ? '创建中…' : '发起投票' }}
      </button>
    </div>
  </n-modal>
</template>
