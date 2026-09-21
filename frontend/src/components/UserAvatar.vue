<script setup lang="ts">
import { computed } from 'vue'
import { avatarBackground, avatarFallbackChar } from '../lib/avatar'

const props = defineProps<{ nickname: string; avatar: string | null; size?: number }>()
const size = computed(() => props.size ?? 28)
const fallback = computed(() => avatarFallbackChar(props.nickname))
const bg = computed(() => avatarBackground(props.nickname))
</script>

<template>
  <span class="user-avatar" :style="{
    width: size + 'px', height: size + 'px',
    background: bg, fontSize: Math.max(10, Math.round(size / 2)) + 'px',
  }">
    <img v-if="avatar" :src="avatar" :alt="nickname">
    <span v-else class="user-avatar-fallback">{{ fallback }}</span>
  </span>
</template>

<style scoped>
.user-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden; flex-shrink: 0;
  color: #fff; line-height: 1; user-select: none;
}
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
