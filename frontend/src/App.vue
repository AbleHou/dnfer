<script setup lang="ts">
import { useAuthStore } from './stores/auth'
const auth = useAuthStore()
</script>

<template>
  <nav v-if="auth.user" style="display:flex;gap:16px;padding:12px;border-bottom:1px solid #eee">
    <router-link to="/">攻坚列表</router-link>
    <router-link to="/characters">我的角色</router-link>
    <router-link v-if="auth.isAdmin" to="/admin">管理</router-link>
    <span style="margin-left:auto">{{ auth.user.nickname }}</span>
    <a href="#" @click.prevent="auth.logout">退出</a>
  </nav>
  <router-view :key="$route.fullPath" />
</template>
