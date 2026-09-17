<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '../api/client'
import { defaultDuty, dutyOptions } from '../lib/duty'
import { jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character, Duty } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', c: Character, duty: Duty): void }>()
const characters = ref<Character[]>([])
const selected = ref<Character | null>(null)
const duty = ref<Duty>('主C')
onMounted(async () => { characters.value = await api.get<Character[]>('/api/me/characters') })

function choose(c: Character) {
  selected.value = c
  duty.value = defaultDuty(c.class_type)
}
function confirm() { if (selected.value) emit('select', selected.value, duty.value) }
const options = computed(() => selected.value ? dutyOptions(selected.value.class_type) : [])
function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
</script>

<template>
  <div v-if="open" style="position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"
       @click.self="emit('close')">
    <div style="background:#fff;border-radius:8px;padding:20px;min-width:360px">
      <h3>选择角色</h3>
      <div v-for="c in characters" :key="c.id"
           style="border:1px solid #eee;padding:10px;margin:6px 0;cursor:pointer"
           :style="selected?.id === c.id ? 'outline:2px solid #1976d2' : ''"
           @click="choose(c)">
        <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:28px;height:28px;margin-right:8px">
        <b>{{ c.name }}</b>
        <span style="color:#666;font-size:12px">{{ c.job_title }} · {{ c.class_type }} · 名望 {{ c.fame }}</span>
        <div style="color:#999;font-size:12px">
          {{ c.class_type === '输出' ? `模拟 ${fmtDps(c.simulated_damage)} · 秒伤 ${fmtDps(c.sustained_dps)}` : `增益 ${fmtBuff(c.buff_amount)}` }}
        </div>
      </div>
      <p v-if="!characters.length" style="color:#999">还没有角色，去「我的角色」添加</p>
      <div v-if="selected" style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <span>职责：</span>
        <select v-model="duty">
          <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
        </select>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button @click="emit('close')">关闭</button>
        <button v-if="selected" @click="confirm">确定</button>
      </div>
    </div>
  </div>
</template>
