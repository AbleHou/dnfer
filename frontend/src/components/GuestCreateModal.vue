<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { api } from '../api/client'
import { jobGenderTitle } from '../lib/job'
import { notifyError, notifySuccess } from '../lib/notify'
import type { JobCategory, User } from '../types'

const props = defineProps<{ open: boolean; requireCharacter: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'created', user: User, characterCount: number): void }>()

interface Row {
  name: string; job_name: string; fame: number | null
  damage: number | null; dps: number | null; buff: number | null; sun: number | null
}

const nickname = ref('')
const username = ref('')
const rows = ref<Row[]>([])
const categories = ref<JobCategory[]>([])
const flatJobs = computed(() => categories.value.flatMap((c) => c.children))
const error = ref('')
const saving = ref(false)

watch(() => props.open, (o) => {
  if (o) { nickname.value = ''; username.value = ''; rows.value = []; error.value = ''; saving.value = false }
})
onMounted(() => { void api.getJobs().then((j) => { categories.value = j }).catch(() => {}) })

function addRow() {
  rows.value.push({ name: '', job_name: '', fame: null, damage: null, dps: null, buff: null, sun: null })
}
function removeRow(i: number) { rows.value.splice(i, 1) }
function jobOf(name: string) { return flatJobs.value.find((j) => j.name === name) ?? null }

async function submit() {
  if (saving.value) return
  error.value = ''
  if (!nickname.value.trim()) { error.value = '请填写昵称'; return }
  if (props.requireCharacter && rows.value.length === 0) { error.value = '请至少添加一个角色'; return }
  if (rows.value.some((r) => !r.name.trim() || !r.job_name)) { error.value = '角色名与职业不能为空'; return }
  saving.value = true
  try {
    const res = await api.post<{ user: User; characters: unknown[] }>(
      '/api/admin/users', {
        nickname: nickname.value.trim(),
        username: username.value.trim() || undefined,
        characters: rows.value.map((r) => {
          const job = jobOf(r.job_name)!
          return {
            name: r.name.trim(), job_name: job.name, fame: Number(r.fame) || 0,
            simulated_damage: job.class_type === '输出' ? (r.damage || null) : null,
            sustained_dps: job.class_type === '输出' ? (r.dps || null) : null,
            buff_amount: job.class_type === '辅助' ? (r.buff || null) : null,
            sun_buff: job.class_type === '辅助' ? (r.sun || null) : null,
          }
        }),
      })
    notifySuccess('临时用户已创建')
    emit('created', res.user, res.characters.length)
    emit('close')
  } catch (e: any) { notifyError(e.message) }
  finally { saving.value = false }
}
</script>

<template>
  <n-modal :show="props.open" preset="card" title="添加临时选手" style="width:min(520px,92vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="color:var(--dnf-text-muted);font-size:12px">
        临时选手无需注册，由管理员代建账号与角色，可直接排表占位
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">昵称 *</div>
        <input v-model="nickname" class="dnf-input" data-field="nickname" placeholder="对方常用称呼" />
      </div>
      <div>
        <div style="color:var(--dnf-text-muted);font-size:12px;margin-bottom:4px">用户名（可选）</div>
        <input v-model="username" class="dnf-input" data-field="username" placeholder="留空则自动生成" />
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="color:var(--dnf-text-muted);font-size:12px">角色</span>
          <button type="button" class="dnf-btn dnf-btn-sm" data-act="add-row" @click="addRow">＋ 添加角色</button>
        </div>
        <div v-for="(r, i) in rows" :key="i" class="guest-row" :data-test="`guest-row-${i}`">
          <input v-model="r.name" class="dnf-input" data-field="char-name" placeholder="角色名" style="flex:1;min-width:90px" />
          <select v-model="r.job_name" class="dnf-select" data-field="job" style="max-width:140px">
            <option value="">选择职业</option>
            <option v-for="j in flatJobs" :key="j.name" :value="j.name">{{ jobGenderTitle(j.name, j.title) }}</option>
          </select>
          <input v-model.number="r.fame" type="number" class="dnf-input" data-field="fame" placeholder="名望" style="width:80px" />
          <template v-if="jobOf(r.job_name)?.class_type === '输出'">
            <input v-model.number="r.damage" type="number" class="dnf-input" data-field="damage" placeholder="模拟伤害(亿)" style="width:100px" />
            <input v-model.number="r.dps" type="number" class="dnf-input" data-field="dps" placeholder="秒伤(亿)" style="width:100px" />
          </template>
          <template v-else-if="jobOf(r.job_name)?.class_type === '辅助'">
            <input v-model.number="r.buff" type="number" class="dnf-input" data-field="buff" placeholder="增益量" style="width:90px" />
            <input v-model.number="r.sun" type="number" class="dnf-input" data-field="sun" placeholder="太阳" style="width:90px" />
          </template>
          <button type="button" class="dnf-btn dnf-btn-sm dnf-btn-danger" data-act="remove-row" @click="removeRow(i)">×</button>
        </div>
        <p v-if="props.requireCharacter && !rows.length" style="color:var(--dnf-text-faint);font-size:12px;margin:4px 0 0">
          排表占位需要至少一个角色
        </p>
      </div>
      <p v-if="error" class="form-error" style="margin:0">{{ error }}</p>
      <button class="dnf-btn dnf-btn-primary" data-act="submit" :disabled="saving"
              @click="submit">{{ saving ? '创建中…' : '创建' }}</button>
    </div>
  </n-modal>
</template>

<style scoped>
.guest-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
</style>
