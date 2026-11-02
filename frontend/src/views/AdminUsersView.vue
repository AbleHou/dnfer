<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DnfBadge, DnfButton, DnfFrame, DnfInput, DnfSelect, DnfTable, DnfTabs } from '@dnftools/ui'
import type { DnfColumn } from '@dnftools/ui'
import { api } from '../api/client'
import AdminNav from '../components/AdminNav.vue'
import AdminUserCharactersModal from '../components/AdminUserCharactersModal.vue'
import AdminResetPasswordModal from '../components/AdminResetPasswordModal.vue'
import GuestCreateModal from '../components/GuestCreateModal.vue'
import GuestConvertModal from '../components/GuestConvertModal.vue'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
import { jobGenderTitle } from '../lib/job'
import type { AdminCharacterRow, AdminUser, CharacterQueryResult, JobCategory, User } from '../types'
// ---- tab 切换（角色查询 / 账号管理）----
const activeTab = ref<'query' | 'users'>('query')   // 默认「角色查询」
const tabs = [
  { value: 'query', label: '角色查询' },
  { value: 'users', label: '账号管理' },
]

// ---- 角色查询区 ----
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

// ---- 查询筛选下拉（DnfSelect options）----
// 注意：reka-ui 的 SelectItem value 不能为空字符串（'' 保留给清空语义），「全部」用哨兵值
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
  { value: 'simulated_damage', label: '模拟伤害' },
  { value: 'sustained_dps', label: '持续输出' },
  { value: 'buff_amount', label: '增益量' },
  { value: 'sun_buff', label: '太阳增益' },
  { value: 'name', label: '角色名' },
]

const queryKey = computed(() =>
  [classType.value, jobName.value, keyword.value, owner.value, sort.value, order.value].join('\x00'))

// 请求序号：防止 watch 触发的并发查询乱序覆盖新结果（老响应到达时已被更新的查询超越）
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
    const res = await api.get<CharacterQueryResult>(`/api/admin/characters/query?${params.toString()}`)
    if (seq !== querySeq) return   // 有更新的筛选已胜出，丢弃本次结果
    queryItems.value = res.items
    total.value = res.total
  } catch (e: any) { queryError.value = e.message }
  finally { queryLoading.value = false }
}
watch(queryKey, () => { void loadQuery() })

function toggleOrder() { order.value = order.value === 'desc' ? 'asc' : 'desc' }
function fmtNum(n: number | null): string { return n == null ? '—' : String(n) }

// ---- DnfTable 列定义 ----
const queryCols: DnfColumn[] = [
  { key: 'name', label: '角色名' },
  { key: 'job_title', label: '职业' },
  { key: 'class_type', label: '类别' },
  { key: 'fame', label: '名望' },
  { key: 'simulated_damage', label: '模拟伤害' },
  { key: 'sustained_dps', label: '持续输出' },
  { key: 'buff_amount', label: '增益量' },
  { key: 'sun_buff', label: '太阳增益' },
  { key: 'adventure_party_name', label: '冒险团' },
  { key: 'owner_nickname', label: '归属玩家' },
]
const userCols: DnfColumn[] = [
  { key: 'nickname', label: '昵称' },
  { key: 'username', label: '用户名' },
  { key: 'is_admin', label: '管理员' },
  { key: 'character_count', label: '角色数' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作' },
]

// ---- 用户管理区 ----
const users = ref<AdminUser[]>([])
const userQ = ref('')
const userError = ref('')

async function loadUsers() {
  userError.value = ''
  try {
    const q = userQ.value.trim()
    const url = q ? `/api/admin/users?q=${encodeURIComponent(q)}` : '/api/admin/users'
    users.value = await api.get<AdminUser[]>(url)
  } catch (e: any) { userError.value = e.message }
}

const modalOpen = ref(false)
const modalUser = ref<User | null>(null)

function openManage(u: AdminUser) { modalUser.value = u; modalOpen.value = true }

// 重置密码弹窗独立状态（避免与角色管理弹窗共用 open 标志导致同时渲染）
const resetPwOpen = ref(false)
const resetPwUser = ref<User | null>(null)
function openResetPw(u: AdminUser) { resetPwUser.value = u; resetPwOpen.value = true }
function onResetPwClose() { resetPwOpen.value = false; loadUsers() }

// 弹窗关闭后刷新两侧数据，保证角色数/查询行与弹窗内增删改保持一致
function onModalClose() {
  modalOpen.value = false
  loadUsers()
  loadQuery()
}
// 注意：openOwner 用占位字段构造 User（is_admin: false / avatar: null）。
// 弹窗只消费 id、nickname（及 owner_is_banned → is_banned），占位字段是安全的，勿在别处依赖。
function openOwner(c: AdminCharacterRow) {
  modalUser.value = {
    id: c.owner_id, username: c.owner_username, nickname: c.owner_nickname,
    is_admin: false, avatar: null, is_banned: c.owner_is_banned, is_guest: false,
  }
  modalOpen.value = true
}

async function toggleBan(u: AdminUser) {
  const unban = u.is_banned
  const ok = await confirmDialog({ content: unban ? `解封用户 ${u.nickname}？` : `封禁用户 ${u.nickname}？` })
  if (!ok) return
  try {
    await api.post(`/api/admin/users/${u.id}/${unban ? 'unban' : 'ban'}`)
    notifySuccess(unban ? '已解封' : '已封禁')
    await loadUsers()
  } catch (e: any) { notifyError(e.message) }
}

// ---- 临时用户 ----
const guestOpen = ref(false)
const convertOpen = ref(false)
const convertUser = ref<User | null>(null)
function openConvert(u: AdminUser) { convertUser.value = u; convertOpen.value = true }
async function onDeleteGuest(u: AdminUser) {
  const ok = await confirmDialog({ content: `确认删除临时用户 ${u.nickname}？将撤下其全部占位并删除其角色` })
  if (!ok) return
  try { await api.del(`/api/admin/users/${u.id}`); notifySuccess('已删除'); await loadUsers(); loadQuery() }
  catch (e: any) { notifyError(e.message) }
}
function onGuestClose() { guestOpen.value = false; loadUsers(); loadQuery() }
function onConvertClose() { convertOpen.value = false; loadUsers() }

onMounted(() => {
  void loadQuery()
  void loadUsers()
  // 职业列表拉取失败不致命：职业筛选项留空即可（用 catch 吞掉未处理拒绝）
  void api.getJobs().then((jobs) => { categories.value = jobs }).catch(() => {})
})
</script>

<template>
  <div class="dnf-page">
    <AdminNav />
    <h2>用户管理</h2>

    <DnfTabs v-model="activeTab" :tabs="tabs">
      <section v-show="activeTab === 'query'">
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
        <template #cell-job_title="{ row }">{{ jobGenderTitle(row.job_name, row.job_title) }}</template>
        <template #cell-simulated_damage="{ row }">{{ row.class_type === '输出' ? fmtNum(row.simulated_damage) : '—' }}</template>
        <template #cell-sustained_dps="{ row }">{{ row.class_type === '输出' ? fmtNum(row.sustained_dps) : '—' }}</template>
        <template #cell-buff_amount="{ row }">{{ row.class_type === '辅助' ? fmtNum(row.buff_amount) : '—' }}</template>
        <template #cell-sun_buff="{ row }">{{ row.class_type === '辅助' ? fmtNum(row.sun_buff) : '—' }}</template>
        <template #cell-adventure_party_name="{ row }">{{ row.adventure_party_name ?? '—' }}</template>
        <template #cell-owner_nickname="{ row }">
          <DnfButton class="dnf-btn-sm" :data-act="'manage-owner-' + row.owner_id"
                     @click="openOwner(row)">{{ row.owner_nickname }}</DnfButton>
        </template>
      </DnfTable>
      <p style="color:var(--dnf-text-faint)">共 {{ total }} 个角色</p>
        </DnfFrame>
      </section>
      <section v-show="activeTab === 'users'">
        <DnfFrame surface="panel" class="dnf-section">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <DnfInput v-model="userQ" placeholder="搜索昵称/用户名" data-filter="user_q"
                  @keyup.enter="loadUsers" />
        <DnfButton class="dnf-btn-sm" data-act="user-search" @click="loadUsers">搜索</DnfButton>
        <DnfButton tone="gold" class="dnf-btn-sm" data-act="add-guest" @click="guestOpen = true">＋ 添加临时用户</DnfButton>
      </div>
      <p v-if="userError" class="form-error">{{ userError }}</p>
      <DnfTable label="账号列表" :columns="userCols" :rows="users" :row-key="(r) => r.id">
        <template #cell-nickname="{ row }">{{ row.nickname }}<DnfBadge v-if="row.is_guest" style="margin-left:6px">临时</DnfBadge></template>
        <template #cell-is_admin="{ row }">{{ row.is_admin ? '是' : '否' }}</template>
        <template #cell-status="{ row }">{{ row.is_banned ? '已封禁' : '正常' }}</template>
        <template #cell-actions="{ row }">
          <div style="display:flex;gap:8px;white-space:nowrap">
            <DnfButton class="dnf-btn-sm" :data-act="'manage-' + row.id" @click="openManage(row)">查看角色</DnfButton>
            <DnfButton v-if="!row.is_guest" class="dnf-btn-sm" :data-act="'reset-pw-' + row.id" @click="openResetPw(row)">改密</DnfButton>
            <template v-if="row.is_guest">
              <DnfButton class="dnf-btn-sm" :data-act="'convert-' + row.id" @click="openConvert(row)">转正</DnfButton>
              <DnfButton tone="orange" class="dnf-btn-sm" :data-act="'delete-guest-' + row.id"
                         @click="onDeleteGuest(row)">删除</DnfButton>
            </template>
            <template v-if="!row.is_admin">
              <DnfButton v-if="!row.is_banned" tone="orange" class="dnf-btn-sm" :data-act="'ban-' + row.id"
                         @click="toggleBan(row)">封禁</DnfButton>
              <DnfButton v-else class="dnf-btn-sm" :data-act="'unban-' + row.id" @click="toggleBan(row)">解封</DnfButton>
            </template>
          </div>
        </template>
      </DnfTable>
        </DnfFrame>
      </section>
    </DnfTabs>

    <AdminUserCharactersModal v-if="modalOpen" :open="modalOpen" :user="modalUser"
                              @close="onModalClose" />
    <AdminResetPasswordModal v-if="resetPwOpen" :open="resetPwOpen" :user="resetPwUser"
                             @close="onResetPwClose" />
    <GuestCreateModal v-if="guestOpen" :open="guestOpen" :require-character="false"
                      @close="onGuestClose" />
    <GuestConvertModal v-if="convertOpen" :open="convertOpen" :user="convertUser"
                       @close="onConvertClose" />
  </div>
</template>
