<script setup lang="ts">
const links = [
  { key: 'codes', label: '邀请码管理', to: '/admin/codes' },
  { key: 'users', label: '用户管理', to: '/admin/users' },
  { key: 'dungeons', label: '副本管理', to: '/admin/dungeons' },
]
</script>

<template>
  <nav class="admin-nav">
    <router-link v-for="l in links" :key="l.key" :data-nav="l.key" :to="l.to"
                 class="admin-nav-link" active-class="active">{{ l.label }}</router-link>
  </nav>
</template>

<style scoped>
.admin-nav { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap }
.admin-nav-link { padding:6px 14px; border:1px solid var(--dnf-border,#3a3f4b);
  border-radius:6px; color:var(--dnf-text-muted,#9aa3b2); text-decoration:none; font-size:14px }
.admin-nav-link.active { color:var(--dnf-accent,#ffd54a); border-color:var(--dnf-accent,#ffd54a) }
</style>
