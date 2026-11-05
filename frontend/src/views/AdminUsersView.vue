<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { DnfBadge, DnfButton, DnfFrame, DnfInput, DnfTable, DnfTabs } from '@dnftools/ui'
import { api } from '../api/client'
import AdminNav from '../components/AdminNav.vue'
import AdminUserCharactersModal from '../components/AdminUserCharactersModal.vue'
import AdminResetPasswordModal from '../components/AdminResetPasswordModal.vue'
import CharacterQuerySection from '../components/CharacterQuerySection.vue'
import GuestCreateModal from '../components/GuestCreateModal.vue'
import GuestConvertModal from '../components/GuestConvertModal.vue'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
import type { AdminCharacterRow, AdminUser, User } from '../types'
// ---- tab 切换（角色查询 / 账号管理）----
const activeTab = ref<'query' | 'users'>('query')   // 默认「角色查询」
const tabs = [
  { value: 'query', label: '角色查询' },
  { value: 'users', label: '账号管理' },
]
const userCols = [
  { key: 'nickname', label: '昵称' },
  { key: 'username', label: '用户名' },
  { key: 'is_admin', label: '管理员' },
  { key: 'character_count', label: '角色数' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作' },
]

// ---- 角色查询区：由共享组件渲染，父级仅持有 ref 以便弹窗关闭后刷新 ----
const querySection = ref<{ refresh: () => Promise<void> } | null>(null)

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
  querySection.value?.refresh()
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
  try { await api.del(`/api/admin/users/${u.id}`); notifySuccess('已删除'); await loadUsers(); querySection.value?.refresh() }
  catch (e: any) { notifyError(e.message) }
}
function onGuestClose() { guestOpen.value = false; loadUsers(); querySection.value?.refresh() }
function onConvertClose() { convertOpen.value = false; loadUsers() }

onMounted(() => {
  void loadUsers()
})
</script>

<template>
  <div class="dnf-page">
    <AdminNav />
    <h2>用户管理</h2>

    <DnfTabs v-model="activeTab" :tabs="tabs">
      <section v-show="activeTab === 'query'">
        <CharacterQuerySection ref="querySection" query-url="/api/admin/characters/query"
                               owner-manage @open-owner="openOwner" />
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
