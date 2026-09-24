<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api/client'
import AdminNav from '../components/AdminNav.vue'
import AdminUserCharactersModal from '../components/AdminUserCharactersModal.vue'
import { confirmDialog, notifyError, notifySuccess } from '../lib/notify'
import type { AdminCharacterRow, AdminUser, CharacterQueryResult, JobCategory, User } from '../types'

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

async function loadQuery() {
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
function openOwner(c: AdminCharacterRow) {
  modalUser.value = {
    id: c.owner_id, username: c.owner_username, nickname: c.owner_nickname,
    is_admin: false, avatar: null, is_banned: c.owner_is_banned,
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

onMounted(() => {
  void loadQuery()
  void loadUsers()
  void api.getJobs().then((jobs) => { categories.value = jobs })
})
</script>

<template>
  <div class="dnf-page">
    <AdminNav />
    <h2>用户管理</h2>

    <section class="dnf-panel dnf-section">
      <h3>角色查询</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select v-model="classType" class="dnf-select" data-filter="class_type">
          <option value="">全部类别</option>
          <option value="输出">输出</option>
          <option value="辅助">辅助</option>
        </select>
        <select v-model="jobName" class="dnf-select" data-filter="job">
          <option value="">全部职业</option>
          <option v-for="j in flatJobs" :key="j.id" :value="j.name">{{ j.title }}</option>
        </select>
        <input v-model="keyword" placeholder="角色名" class="dnf-input" data-filter="keyword" />
        <input v-model="owner" placeholder="归属玩家" class="dnf-input" data-filter="owner" />
        <select v-model="sort" class="dnf-select" data-filter="sort">
          <option value="fame">名望</option>
          <option value="simulated_damage">模拟伤害</option>
          <option value="sustained_dps">持续输出</option>
          <option value="buff_amount">增益量</option>
          <option value="name">角色名</option>
        </select>
        <button class="dnf-btn dnf-btn-sm" data-act="toggle-order" @click="toggleOrder">
          {{ order === 'desc' ? '↓ 降序' : '↑ 升序' }}
        </button>
        <span v-if="queryLoading" style="color:var(--dnf-text-faint)">加载中…</span>
      </div>
      <p v-if="queryError" class="form-error">{{ queryError }}</p>
      <table class="dnf-table">
        <thead>
          <tr><th scope="col">角色名</th><th scope="col">职业</th><th scope="col">类别</th>
            <th scope="col">名望</th><th scope="col">模拟伤害</th><th scope="col">持续输出</th>
            <th scope="col">增益量</th><th scope="col">归属玩家</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in queryItems" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ c.job_title }}</td>
            <td>{{ c.class_type }}</td>
            <td>{{ c.fame }}</td>
            <td>{{ c.class_type === '输出' ? fmtNum(c.simulated_damage) : '—' }}</td>
            <td>{{ c.class_type === '输出' ? fmtNum(c.sustained_dps) : '—' }}</td>
            <td>{{ c.class_type === '辅助' ? fmtNum(c.buff_amount) : '—' }}</td>
            <td>
              <button class="dnf-btn dnf-btn-sm" :data-act="'manage-owner-' + c.owner_id"
                      @click="openOwner(c)">{{ c.owner_nickname }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p style="color:var(--dnf-text-faint)">共 {{ total }} 个角色</p>
    </section>

    <section class="dnf-panel dnf-section">
      <h3>用户列表</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <input v-model="userQ" placeholder="搜索昵称/用户名" class="dnf-input" data-filter="user_q"
               @keyup.enter="loadUsers" />
        <button class="dnf-btn dnf-btn-sm" data-act="user-search" @click="loadUsers">搜索</button>
      </div>
      <p v-if="userError" class="form-error">{{ userError }}</p>
      <table class="dnf-table">
        <thead>
          <tr><th scope="col">昵称</th><th scope="col">用户名</th><th scope="col">管理员</th>
            <th scope="col">角色数</th><th scope="col">状态</th><th scope="col"></th></tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.nickname }}</td>
            <td>{{ u.username }}</td>
            <td>{{ u.is_admin ? '是' : '否' }}</td>
            <td>{{ u.character_count }}</td>
            <td>{{ u.is_banned ? '已封禁' : '正常' }}</td>
            <td style="white-space:nowrap">
              <button class="dnf-btn dnf-btn-sm" :data-act="'manage-' + u.id" @click="openManage(u)">查看角色</button>
              <button v-if="!u.is_banned" class="dnf-btn dnf-btn-sm dnf-btn-danger" :data-act="'ban-' + u.id"
                      @click="toggleBan(u)">封禁</button>
              <button v-else class="dnf-btn dnf-btn-sm" :data-act="'unban-' + u.id" @click="toggleBan(u)">解封</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <AdminUserCharactersModal v-if="modalOpen" :open="modalOpen" :user="modalUser"
                              @close="modalOpen = false" />
  </div>
</template>
