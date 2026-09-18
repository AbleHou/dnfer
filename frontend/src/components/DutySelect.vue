<script setup lang="ts">
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import { dutyOptions } from '../lib/duty'
import type { ClassType, Duty } from '../types'

const props = defineProps<{ classType: ClassType; modelValue: Duty | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Duty): void }>()

const options = computed(() => dutyOptions(props.classType).map(v => ({ label: v, value: v })))
</script>

<template>
  <n-select size="small" :options="options" :value="modelValue"
            @update:value="(v) => emit('update:modelValue', v as Duty)" />
</template>
