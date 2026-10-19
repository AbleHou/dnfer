<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NConfigProvider, NDropdown } from 'naive-ui'
import { useAuthStore } from './stores/auth'
import { useTheme } from './composables/useTheme'
import UserAvatar from './components/UserAvatar.vue'
import ProfilePanel from './components/ProfilePanel.vue'

const auth = useAuthStore()
const router = useRouter()
const profileOpen = ref(false)
const { theme, naiveTheme, naiveOverrides, toggleTheme } = useTheme()

// naive-ui 2.45 未在包根导出 DropdownMixedOption，回退为 any[]（唯一一处）
const menuOptions = computed<any[]>(() => [
  { label: '攻坚列表', key: 'raids' },
  { label: '我的角色', key: 'characters' },
  { label: '群会议', key: 'votes' },
  ...(auth.isAdmin ? [{ label: '管理', key: 'admin' }] : []),
  { type: 'divider', key: 'd1' },
  { label: '退出', key: 'logout' },
])

function logout() {
  auth.logout()
  router.push('/login')
}
function onMenuSelect(key: string) {
  if (key === 'logout') { logout(); return }
  const path = ({ raids: '/', characters: '/characters', votes: '/votes', admin: '/admin' } as Record<string, string>)[key]
  if (path) router.push(path)
}
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveOverrides">
    <nav v-if="auth.user" class="dnf-nav">
      <router-link to="/" class="logo">跨六 DNF 糕手</router-link>
      <router-link to="/" class="nav-link">攻坚列表</router-link>
      <router-link to="/characters" class="nav-link">我的角色</router-link>
      <router-link to="/votes" class="nav-link">群会议</router-link>
      <router-link v-if="auth.isAdmin" to="/admin" class="nav-link">管理</router-link>
      <span class="nav-right">
        <button class="nav-user" :title="theme === 'dark' ? '切换到亮色' : '切换到暗色'"
                data-act="theme-toggle" @click="toggleTheme">
          <span style="font-size:18px;line-height:1">{{ theme === 'dark' ? '☀' : '☾' }}</span>
        </button>
        <button class="nav-user" title="个人信息" @click="profileOpen = true">
          <UserAvatar v-if="auth.user" :nickname="auth.user.nickname"
                      :avatar="auth.user.avatar" :size="26" />
          <span class="nav-username">{{ auth.user?.nickname }}</span>
        </button>
        <a href="#" class="nav-exit" @click.prevent="logout">退出</a>
        <n-dropdown :options="menuOptions" @select="onMenuSelect">
          <button class="hamburger" aria-label="菜单">☰</button>
        </n-dropdown>
      </span>
      <ProfilePanel :open="profileOpen" @close="profileOpen = false" />
    </nav>
    <router-view :key="$route.fullPath" />
  </n-config-provider>
</template>
