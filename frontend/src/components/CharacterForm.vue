<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { DnfButton, DnfFrame, DnfInput, DnfSelect } from '@dnftools/ui'
import { api } from '../api/client'
import { categoryIcon, jobIcon, jobGenderTitle, handleIconError as onIconError } from '../lib/job'
import type { AdventureParty, Character, JobCategory, JobChild } from '../types'

const props = defineProps<{ categories: JobCategory[]; editing: Character | null; baseUrl?: string }>()
const base = () => props.baseUrl ?? '/api/me/characters'
const emit = defineEmits<{ (e: 'saved'): void; (e: 'cancel'): void }>()

const form = ref({ name: props.editing?.name ?? '', fame: props.editing?.fame ?? null as number | null,
  simulated_damage: props.editing?.simulated_damage ?? null as number | null,
  sustained_dps: props.editing?.sustained_dps ?? null as number | null,
  buff_amount: props.editing?.buff_amount ?? null as number | null,
  sun_buff: props.editing?.sun_buff ?? null as number | null,
  adventure_party_id: props.editing?.adventure_party_id ?? null as number | null,
  atk_base: props.editing?.atk_base ?? null as number | null,
  str_int: props.editing?.str_int ?? null as number | null,
  elemental: props.editing?.elemental ?? null as number | null,
  atk_power: props.editing?.atk_power ?? null as number | null,
  atk_power_amp: props.editing?.atk_power_amp ?? null as number | null,
  skill_atk: props.editing?.skill_atk ?? null as number | null })
const parties = ref<AdventureParty[]>([])
const partiesBase = computed(() => {
  const m = props.baseUrl?.match(/\/api\/admin\/users\/(\d+)/)
  return m ? `/api/admin/users/${m[1]}/adventure-parties` : '/api/me/adventure-parties'
})
onMounted(async () => {
  try { parties.value = (await api.get<AdventureParty[]>(partiesBase.value)) ?? [] }
  catch { parties.value = [] }
  if (!props.editing && form.value.adventure_party_id == null && parties.value.length) {
    form.value.adventure_party_id = parties.value[0].id
  }
})
const selectedCat = ref<JobCategory | null>(
  props.categories.find(cat => cat.name === props.editing?.parent_name) ?? null)
const selectedJob = ref<JobChild | null>(
  selectedCat.value?.children.find(ch => ch.name === props.editing?.job_name) ?? null)
const isSupport = computed(() => selectedJob.value?.class_type === '辅助')
const partyOptions = computed(() =>
  parties.value.map(p => ({ value: p.id, label: p.name })))
function onPartyChange(v: unknown) {
  form.value.adventure_party_id = typeof v === 'number' ? v : null
}
const error = ref('')
const saving = ref(false)

function onPickCategory(cat: JobCategory) { selectedCat.value = cat; selectedJob.value = null }

watch(selectedJob, (j) => {
  if (j?.class_type === '输出') { form.value.buff_amount = null; form.value.sun_buff = null }
  else if (j?.class_type === '辅助') {
    form.value.simulated_damage = null; form.value.sustained_dps = null
    form.value.atk_base = null; form.value.str_int = null; form.value.elemental = null
    form.value.atk_power = null; form.value.atk_power_amp = null; form.value.skill_atk = null
  }
})

async function save() {
  if (!selectedJob.value) { error.value = '请选择职业'; return }
  saving.value = true; error.value = ''
  try {
    const payload = { name: form.value.name, job_name: selectedJob.value.name,
      fame: Number(form.value.fame) || 0,
      simulated_damage: form.value.simulated_damage,
      sustained_dps: form.value.sustained_dps, buff_amount: form.value.buff_amount,
      sun_buff: form.value.sun_buff, adventure_party_id: form.value.adventure_party_id,
      atk_base: form.value.atk_base, str_int: form.value.str_int, elemental: form.value.elemental,
      atk_power: form.value.atk_power, atk_power_amp: form.value.atk_power_amp,
      skill_atk: form.value.skill_atk }
    if (props.editing) await api.put(`${base()}/${props.editing.id}`, payload)
    else await api.post(base(), payload)
    emit('saved')
  } catch (e: any) { error.value = e.message }
  finally { saving.value = false }
}
</script>

<template>
  <DnfFrame surface="panel" class="create-form">
    <h3>{{ editing ? '编辑角色' : '添加角色' }}</h3>
    <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
      <label for="char-name" class="form-label">角色名：</label>
      <DnfInput id="char-name" v-model="form.name" style="flex:1" />
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
            <span style="display:block;font-size:11px">{{ jobGenderTitle(child.name, child.title) }}</span>
          </button>
        </div>
        <p v-if="selectedJob" style="color:var(--dnf-text-muted);font-size:12px;margin:4px 0 0">
          已选：{{ jobGenderTitle(selectedJob.name, selectedJob.title) }}（{{ selectedJob.class_type }}职业）
        </p>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
      <label for="char-fame" class="form-label">名望：</label>
      <DnfInput id="char-fame" :model-value="form.fame?.toString() ?? ''"
                @update:model-value="v => form.fame = v ? Number(v) : null"
                type="number" style="flex:1" />
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
      <label for="char-party" class="form-label">冒险团：</label>
      <DnfSelect id="char-party" :model-value="form.adventure_party_id ?? undefined"
                 :options="partyOptions" style="flex:1" data-act="adventure-party" label="冒险团"
                 @update:model-value="onPartyChange" />
    </div>
    <template v-if="selectedJob">
      <template v-if="!isSupport">
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-damage" class="form-label">模拟伤害（亿）：</label>
          <DnfInput id="char-damage" :model-value="form.simulated_damage?.toString() ?? ''"
                    @update:model-value="v => form.simulated_damage = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-dps" class="form-label">秒伤（亿）：</label>
          <DnfInput id="char-dps" :model-value="form.sustained_dps?.toString() ?? ''"
                    @update:model-value="v => form.sustained_dps = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-atk-base" class="form-label">三攻：</label>
          <DnfInput id="char-atk-base" :model-value="form.atk_base?.toString() ?? ''"
                    @update:model-value="v => form.atk_base = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-str-int" class="form-label">力智：</label>
          <DnfInput id="char-str-int" :model-value="form.str_int?.toString() ?? ''"
                    @update:model-value="v => form.str_int = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-elemental" class="form-label">属强：</label>
          <DnfInput id="char-elemental" :model-value="form.elemental?.toString() ?? ''"
                    @update:model-value="v => form.elemental = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-atk-power" class="form-label">攻强（%）：</label>
          <DnfInput id="char-atk-power" :model-value="form.atk_power?.toString() ?? ''"
                    @update:model-value="v => form.atk_power = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-atk-power-amp" class="form-label">攻强增幅（%）：</label>
          <DnfInput id="char-atk-power-amp" :model-value="form.atk_power_amp?.toString() ?? ''"
                    @update:model-value="v => form.atk_power_amp = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-skill-atk" class="form-label">技攻（%）：</label>
          <DnfInput id="char-skill-atk" :model-value="form.skill_atk?.toString() ?? ''"
                    @update:model-value="v => form.skill_atk = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
      </template>
      <template v-else>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-buff" class="form-label">增益量：</label>
          <DnfInput id="char-buff" :model-value="form.buff_amount?.toString() ?? ''"
                    @update:model-value="v => form.buff_amount = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <label for="char-sun-buff" class="form-label">太阳增益：</label>
          <DnfInput id="char-sun-buff" :model-value="form.sun_buff?.toString() ?? ''"
                    @update:model-value="v => form.sun_buff = v ? Number(v) : null"
                    type="number" style="flex:1" />
        </div>
      </template>
    </template>
    <p v-else style="color:var(--dnf-text-faint);font-size:12px">请先选择职业</p>
    <p v-if="error" class="form-error">{{ error }}</p>
    <div style="display:flex;gap:8px">
      <DnfButton tone="gold" :disabled="saving" data-act="save" @click="save">{{ saving ? '保存中…' : '保存' }}</DnfButton>
      <DnfButton @click="emit('cancel')">取消</DnfButton>
    </div>
  </DnfFrame>
</template>
