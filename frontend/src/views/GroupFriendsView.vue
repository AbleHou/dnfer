<script setup lang="ts">
import CharacterQuerySection from '../components/CharacterQuerySection.vue'
</script>

<template>
  <div class="dnf-page">
    <h2>我的群友</h2>
    <p style="color:var(--dnf-text-faint);margin:4px 0 12px">按职业/名望/战斗力查询群内所有角色</p>
    <CharacterQuerySection query-url="/api/characters/query" show-podium />
  </div>
</template>
