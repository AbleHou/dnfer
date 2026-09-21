<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { avatarBackground, avatarFallbackChar } from '../lib/avatar'

const props = defineProps<{ nickname: string; avatar: string | null; size?: number }>()
const size = computed(() => props.size ?? 28)
const fallback = computed(() => avatarFallbackChar(props.nickname))
const bg = computed(() => avatarBackground(props.nickname))
// 图片加载失败（如头像被删除后 URL 失效）→ 回退到首字符占位
const failed = ref(false)
watch(() => props.avatar, () => { failed.value = false })
function onImgError() { failed.value = true }
</script>

<template>
  <span class="user-avatar" :style="{
    width: size + 'px', height: size + 'px',
    background: bg, fontSize: Math.max(10, Math.round(size / 2)) + 'px',
  }">
    <img v-if="avatar && !failed" :src="avatar" :alt="nickname" @error="onImgError">
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
