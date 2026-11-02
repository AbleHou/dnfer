<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DnfProvider, DnfDropdownMenu, DnfDialogProvider, DnfIcon, DnfMessageProvider } from '@dnftools/ui'
import type { DnfMenuItem } from '@dnftools/ui'
import { useAuthStore } from './stores/auth'
import { dialogs, messages } from './lib/notify'
import UserAvatar from './components/UserAvatar.vue'
import ProfilePanel from './components/ProfilePanel.vue'

const auth = useAuthStore()
const router = useRouter()
const profileOpen = ref(false)

// computed 保持响应式：登录/登出后 isAdmin 变化时菜单实时更新
const menuItems = computed<DnfMenuItem[]>(() => [
  { value: 'raids', label: '攻坚列表' },
  { value: 'characters', label: '我的角色' },
  { value: 'votes', label: '群会议' },
  ...(auth.isAdmin ? [{ value: 'admin', label: '管理' }] : []),
  { separator: true, value: '__sep', label: '' },
  { value: 'logout', label: '退出' },
])

function logout() {
  auth.logout()
  router.push('/login')
}
function onMenuSelect(item: DnfMenuItem) {
  if (item.value === 'logout') { logout(); return }
  const path = ({ raids: '/', characters: '/characters', votes: '/votes', admin: '/admin' } as Record<string, string>)[item.value]
  if (path) router.push(path)
}
</script>

<template>
  <DnfProvider>
    <DnfDialogProvider :service="dialogs">
      <DnfMessageProvider :service="messages">
        <nav v-if="auth.user" class="dnf-nav">
          <router-link to="/" class="logo">跨六 DNF 糕手</router-link>
          <router-link to="/" class="nav-link" style="display:inline-flex;align-items:center;gap:4px">
            <DnfIcon name="hud-scroll" />攻坚列表
          </router-link>
          <router-link to="/characters" class="nav-link" style="display:inline-flex;align-items:center;gap:4px">
            <DnfIcon name="hud-character" />我的角色
          </router-link>
          <router-link to="/votes" class="nav-link" style="display:inline-flex;align-items:center;gap:4px">
            <DnfIcon name="hud-bell" />群会议
          </router-link>
          <router-link v-if="auth.isAdmin" to="/admin" class="nav-link" style="display:inline-flex;align-items:center;gap:4px">
            <DnfIcon name="hud-grid" />管理
          </router-link>
          <span class="nav-right">
            <button class="nav-user" title="个人信息" @click="profileOpen = true">
              <UserAvatar v-if="auth.user" :nickname="auth.user.nickname"
                          :avatar="auth.user.avatar" :size="26" />
              <span class="nav-username">{{ auth.user?.nickname }}</span>
            </button>
            <a href="#" class="nav-exit" @click.prevent="logout">退出</a>
            <DnfDropdownMenu :items="menuItems" @select="onMenuSelect">
              <template #trigger><button class="hamburger" aria-label="菜单">☰</button></template>
            </DnfDropdownMenu>
          </span>
          <ProfilePanel :open="profileOpen" @close="profileOpen = false" />
        </nav>
        <router-view :key="$route.fullPath" />
      </DnfMessageProvider>
    </DnfDialogProvider>
  </DnfProvider>
</template>
