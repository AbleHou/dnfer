<script setup lang="ts">
import { computed } from 'vue'
import { DnfAvatar } from '@dnftools/ui'

const props = defineProps<{ nickname: string; avatar: string | null; size?: number }>()
// 对外契约不变（nickname/avatar/size），内部映射到 DnfAvatar 的 src/label/size
const size = computed(() => props.size ?? 28)
const src = computed(() => props.avatar ?? undefined)
const label = computed(() => props.nickname)
</script>

<template>
  <DnfAvatar :src="src" :label="label" :size="size" class="user-avatar" />
</template>

<style scoped>
.user-avatar {
  /* 小尺寸头像在 flex 行内容易被压缩，保持与旧自绘头像一致 */
  flex-shrink: 0;
}
</style>
