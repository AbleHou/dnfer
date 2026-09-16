<script setup lang="ts">
import { dutyOptions } from '../lib/duty'
import type { ClassType, Duty } from '../types'
const props = defineProps<{ classType: ClassType; modelValue: Duty | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Duty): void }>()
const options = dutyOptions(props.classType)
</script>
<template>
  <select :value="modelValue ?? ''" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as Duty)">
    <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
  </select>
</template>
