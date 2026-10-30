<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DnfBadge, DnfButton, DnfFrame } from '@dnftools/ui'
import { api } from '../api/client'
import AdminNav from '../components/AdminNav.vue'
import AdminUserCharactersModal from '../components/AdminUserCharactersModal.vue'
import AdminResetPasswordModal from '../components/AdminResetPasswordModal.vue'
import GuestCreateModal from '../components/GuestCreateModal.vue'
import GuestConvertModal from '../components/GuestConvertModal.vue'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
import { jobGenderTitle } from '../lib/job'
import type { AdminCharacterRow, AdminUser, CharacterQueryResult, JobCategory, User } from '../types'
import { NTabs, NTabPane } from 'naive-ui'

// ---- tab 切换（角色查询 / 账号管理）----
const activeTab = ref<'query' | 'users'>('query')   // 默认「角色查询」

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

    <n-tabs v-model:value="activeTab">
      <n-tab-pane name="query" tab="角色查询" display-directive="show">
        <DnfFrame surface="panel" class="dnf-section">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select v-model="classType" class="dnf-select" data-filter="class_type">
          <option value="">全部类别</option>
          <option value="输出">输出</option>
          <option value="辅助">辅助</option>
        </select>
        <select v-model="jobName" class="dnf-select" data-filter="job">
          <option value="">全部职业</option>
          <option v-for="j in flatJobs" :key="j.id" :value="j.name">{{ jobGenderTitle(j.name, j.title) }}</option>
        </select>
        <input v-model="keyword" placeholder="角色名" class="dnf-input" data-filter="keyword" />
        <input v-model="owner" placeholder="归属玩家" class="dnf-input" data-filter="owner" />
        <select v-model="sort" class="dnf-select" data-filter="sort">
          <option value="fame">名望</option>
          <option value="simulated_damage">模拟伤害</option>
          <option value="sustained_dps">持续输出</option>
          <option value="buff_amount">增益量</option>
          <option value="sun_buff">太阳增益</option>
          <option value="name">角色名</option>
        </select>
        <DnfButton class="dnf-btn-sm" data-act="toggle-order" @click="toggleOrder">
          {{ order === 'desc' ? '↓ 降序' : '↑ 升序' }}
        </DnfButton>
        <span v-if="queryLoading" style="color:var(--dnf-text-faint)">加载中…</span>
      </div>
      <p v-if="queryError" class="form-error">{{ queryError }}</p>
      <table class="dnf-table">
        <thead>
          <tr><th scope="col">角色名</th><th scope="col">职业</th><th scope="col">类别</th>
            <th scope="col">名望</th><th scope="col">模拟伤害</th><th scope="col">持续输出</th>
            <th scope="col">增益量</th><th scope="col">太阳增益</th><th scope="col">冒险团</th><th scope="col">归属玩家</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in queryItems" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ jobGenderTitle(c.job_name, c.job_title) }}</td>
            <td>{{ c.class_type }}</td>
            <td>{{ c.fame }}</td>
            <td>{{ c.class_type === '输出' ? fmtNum(c.simulated_damage) : '—' }}</td>
            <td>{{ c.class_type === '输出' ? fmtNum(c.sustained_dps) : '—' }}</td>
            <td>{{ c.class_type === '辅助' ? fmtNum(c.buff_amount) : '—' }}</td>
            <td>{{ c.class_type === '辅助' ? fmtNum(c.sun_buff) : '—' }}</td>
            <td>{{ c.adventure_party_name ?? '—' }}</td>
            <td>
              <DnfButton class="dnf-btn-sm" :data-act="'manage-owner-' + c.owner_id"
                         @click="openOwner(c)">{{ c.owner_nickname }}</DnfButton>
            </td>
          </tr>
        </tbody>
      </table>
      <p style="color:var(--dnf-text-faint)">共 {{ total }} 个角色</p>
        </DnfFrame>
      </n-tab-pane>
      <n-tab-pane name="users" tab="账号管理" display-directive="show">
        <DnfFrame surface="panel" class="dnf-section">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <input v-model="userQ" placeholder="搜索昵称/用户名" class="dnf-input" data-filter="user_q"
               @keyup.enter="loadUsers" />
        <DnfButton class="dnf-btn-sm" data-act="user-search" @click="loadUsers">搜索</DnfButton>
        <DnfButton tone="gold" class="dnf-btn-sm" data-act="add-guest" @click="guestOpen = true">＋ 添加临时用户</DnfButton>
      </div>
      <p v-if="userError" class="form-error">{{ userError }}</p>
      <table class="dnf-table">
        <thead>
          <tr><th scope="col">昵称</th><th scope="col">用户名</th><th scope="col">管理员</th>
            <th scope="col">角色数</th><th scope="col">状态</th><th scope="col"></th></tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.nickname }}<DnfBadge v-if="u.is_guest" style="margin-left:6px">临时</DnfBadge></td>
            <td>{{ u.username }}</td>
            <td>{{ u.is_admin ? '是' : '否' }}</td>
            <td>{{ u.character_count }}</td>
            <td>{{ u.is_banned ? '已封禁' : '正常' }}</td>
            <td style="white-space:nowrap">
              <div style="display:flex;gap:8px">
                <DnfButton class="dnf-btn-sm" :data-act="'manage-' + u.id" @click="openManage(u)">查看角色</DnfButton>
                <DnfButton v-if="!u.is_guest" class="dnf-btn-sm" :data-act="'reset-pw-' + u.id" @click="openResetPw(u)">改密</DnfButton>
                <template v-if="u.is_guest">
                  <DnfButton class="dnf-btn-sm" :data-act="'convert-' + u.id" @click="openConvert(u)">转正</DnfButton>
                  <DnfButton tone="orange" class="dnf-btn-sm" :data-act="'delete-guest-' + u.id"
                             @click="onDeleteGuest(u)">删除</DnfButton>
                </template>
                <template v-if="!u.is_admin">
                  <DnfButton v-if="!u.is_banned" tone="orange" class="dnf-btn-sm" :data-act="'ban-' + u.id"
                             @click="toggleBan(u)">封禁</DnfButton>
                  <DnfButton v-else class="dnf-btn-sm" :data-act="'unban-' + u.id" @click="toggleBan(u)">解封</DnfButton>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
        </DnfFrame>
      </n-tab-pane>
    </n-tabs>

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
