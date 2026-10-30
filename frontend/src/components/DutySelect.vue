<script setup lang="ts">
import { computed } from 'vue'
import { DnfSelect } from '@dnftools/ui'
import { dutyOptions } from '../lib/duty'
import type { ClassType, Duty } from '../types'

const props = defineProps<{ classType: ClassType; modelValue: Duty | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Duty): void }>()

const options = computed(() => dutyOptions(props.classType).map(v => ({ label: v, value: v })))
</script>

<template>
  <DnfSelect :options="options" :model-value="modelValue ?? undefined" label="职责"
             @update:model-value="(v) => emit('update:modelValue', v as Duty)" />
</template>
