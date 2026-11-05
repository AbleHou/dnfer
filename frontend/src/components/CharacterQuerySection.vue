<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DnfButton, DnfFrame, DnfIcon, DnfInput, DnfSelect, DnfTable } from '@dnftools/ui'
import type { DnfColumn } from '@dnftools/ui'
import { api } from '../api/client'
import { jobGenderTitle, jobIcon, handleIconError as onIconError } from '../lib/job'
import type { AdminCharacterRow, CharacterQueryResult, JobCategory } from '../types'

// 「角色查询」共享区：管理端（用户管理）与「我的群友」复用。
// ownerManage=true 时归属玩家列为按钮（emit open-owner），否则纯文本。
const props = withDefaults(defineProps<{
  queryUrl: string
  ownerManage?: boolean
}>(), { ownerManage: false })
const emit = defineEmits<{ (e: 'open-owner', row: AdminCharacterRow): void }>()

const queryItems = ref<AdminCharacterRow[]>([])
const total = ref(0)
const classType = ref('')
const jobName = ref('')
const keyword = ref('')
const owner = ref('')
const sort = ref('fame')
const order = ref<'asc' | 'desc'>('desc')
const queryLoading = ref(false)
const queryError = ref('')
const categories = ref<JobCategory[]>([])
const flatJobs = computed(() => categories.value.flatMap((c) => c.children))

// ---- 筛选下拉（reka-ui SelectItem value 不能为空字符串，'__all__' 为哨兵值）----
const ALL_FILTER = '__all__'
const classTypeOptions = [
  { value: ALL_FILTER, label: '全部类别' },
  { value: '输出', label: '输出' },
  { value: '辅助', label: '辅助' },
]
const jobOptions = computed(() => [
  { value: ALL_FILTER, label: '全部职业' },
  ...flatJobs.value.map(j => ({ value: j.name, label: jobGenderTitle(j.name, j.title) })),
])
const sortOptions = [
  { value: 'fame', label: '名望' },
  { value: 'combat_power', label: '战斗力' },
  { value: 'simulated_damage', label: '模拟伤害' },
  { value: 'sustained_dps', label: '持续输出' },
  { value: 'buff_amount', label: '增益量' },
  { value: 'sun_buff', label: '太阳增益' },
  { value: 'name', label: '角色名' },
]

const queryKey = computed(() =>
  [classType.value, jobName.value, keyword.value, owner.value, sort.value, order.value].join('\x00'))

// 请求序号：防止 watch 触发的并发查询乱序覆盖新结果
let querySeq = 0

async function loadQuery() {
  const seq = ++querySeq
  queryLoading.value = true
  queryError.value = ''
  try {
    const params = new URLSearchParams()
    if (classType.value) params.set('class_type', classType.value)
    if (jobName.value) params.set('job_name', jobName.value)
    if (keyword.value) params.set('keyword', keyword.value)
    if (owner.value) params.set('owner', owner.value)
    if (sort.value) params.set('sort', sort.value)
    params.set('order', order.value)
    const res = await api.get<CharacterQueryResult>(`${props.queryUrl}?${params.toString()}`)
    if (seq !== querySeq) return   // 有更新的筛选已胜出，丢弃本次结果
    queryItems.value = res.items
    total.value = res.total
  } catch (e: any) { queryError.value = e.message }
  finally { queryLoading.value = false }
}
watch(queryKey, () => { void loadQuery() })

function toggleOrder() { order.value = order.value === 'desc' ? 'asc' : 'desc' }
function fmtNum(n: number | null): string { return n == null ? '—' : String(n) }

const queryCols: DnfColumn[] = [
  { key: 'name', label: '角色名' },
  { key: 'job_title', label: '职业' },
  { key: 'class_type', label: '类别' },
  { key: 'fame', label: '名望' },
  { key: 'combat_power', label: '战斗力' },
  { key: 'simulated_damage', label: '模拟伤害' },
  { key: 'sustained_dps', label: '持续输出' },
  { key: 'buff_amount', label: '增益量' },
  { key: 'sun_buff', label: '太阳增益' },
  { key: 'adventure_party_name', label: '冒险团' },
  { key: 'owner_nickname', label: '归属玩家' },
]

onMounted(() => {
  void loadQuery()
  // 职业列表拉取失败不致命：职业筛选项留空即可
  void api.getJobs().then((jobs) => { categories.value = jobs }).catch(() => {})
})

// 父级在弹窗关闭后刷新（如管理端角色管理弹窗增删改后）
defineExpose({ refresh: loadQuery })
</script>

<template>
  <DnfFrame surface="panel" class="dnf-section">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <DnfSelect :options="classTypeOptions" :model-value="classType || ALL_FILTER"
                 data-filter="class_type" label="类别筛选" style="width:120px"
                 @update:model-value="v => classType = typeof v === 'string' && v !== ALL_FILTER ? v : ''" />
      <DnfSelect :options="jobOptions" :model-value="jobName || ALL_FILTER"
                 data-filter="job" label="职业筛选" style="width:150px"
                 @update:model-value="v => jobName = typeof v === 'string' && v !== ALL_FILTER ? v : ''" />
      <DnfInput v-model="keyword" placeholder="角色名" data-filter="keyword" />
      <DnfInput v-model="owner" placeholder="归属玩家" data-filter="owner" />
      <DnfSelect :options="sortOptions" :model-value="sort" data-filter="sort"
                 label="排序" style="width:120px"
                 @update:model-value="v => sort = typeof v === 'string' ? v : ''" />
      <DnfButton class="dnf-btn-sm" data-act="toggle-order" @click="toggleOrder">
        {{ order === 'desc' ? '↓ 降序' : '↑ 升序' }}
      </DnfButton>
      <span v-if="queryLoading" style="color:var(--dnf-text-faint)">加载中…</span>
    </div>
    <p v-if="queryError" class="form-error">{{ queryError }}</p>
    <DnfTable label="角色查询结果" :columns="queryCols" :rows="queryItems" :row-key="(r) => r.id">
      <template #cell-name="{ row }">{{ row.name }}</template>
      <template #cell-job_title="{ row }">
        <img :src="jobIcon(row.job_name)" :title="jobGenderTitle(row.job_name, row.job_title)"
             :data-job="row.job_name" alt="职业" @error="onIconError" style="width:20px;height:20px">
      </template>
      <template #cell-class_type="{ row }">
        <DnfIcon :name="row.class_type === '输出' ? 'profile-strength' : 'profile-heart-red'"
                 :label="row.class_type" />
      </template>
      <template #cell-combat_power="{ row }">{{ row.class_type === '输出' ? fmtNum(row.combat_power) : '—' }}</template>
      <template #cell-simulated_damage="{ row }">{{ row.class_type === '输出' ? fmtNum(row.simulated_damage) : '—' }}</template>
      <template #cell-sustained_dps="{ row }">{{ row.class_type === '输出' ? fmtNum(row.sustained_dps) : '—' }}</template>
      <template #cell-buff_amount="{ row }">{{ row.class_type === '辅助' ? fmtNum(row.buff_amount) : '—' }}</template>
      <template #cell-sun_buff="{ row }">{{ row.class_type === '辅助' ? fmtNum(row.sun_buff) : '—' }}</template>
      <template #cell-adventure_party_name="{ row }">{{ row.adventure_party_name ?? '—' }}</template>
      <template #cell-owner_nickname="{ row }">
        <DnfButton v-if="ownerManage" skin="text" :data-act="'manage-owner-' + row.owner_id"
                   @click="emit('open-owner', row)">
          <template #icon><DnfIcon name="observer-person" state="auto" /></template>{{ row.owner_nickname }}
        </DnfButton>
        <span v-else>{{ row.owner_nickname }}</span>
      </template>
    </DnfTable>
    <p style="color:var(--dnf-text-faint)">共 {{ total }} 个角色</p>
  </DnfFrame>
</template>
