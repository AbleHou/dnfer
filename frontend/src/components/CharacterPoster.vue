<script setup lang="ts">
import { computed, ref } from 'vue'
import { DnfIconButton } from '@dnftools/ui'
import { characterProfile, jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character } from '../types'

const props = defineProps<{ character: Character }>()
const emit = defineEmits<{ (e: 'click'): void; (e: 'delete'): void }>()

const src = computed(() => characterProfile(props.character.parent_name, props.character.job_name))
// profile 图加载失败 → 切换深色底 + 职业图标（state flag 保证只切一次，防循环）
const fallbackUsed = ref(false)
function onImgError() { fallbackUsed.value = true }

function fmtDps(n: number | null): string { return n == null ? '暂无' : `${n}亿` }
function fmtBuff(n: number | null): string { return n == null ? '暂无' : String(n) }
function fmtPower(n: number | null): string { return n == null ? '暂无' : n.toLocaleString('en-US') }

const line1 = computed(() => {
  const parts = [`名望 ${props.character.fame}`]
  if (props.character.class_type === '输出') parts.push(`战斗力 ${fmtPower(props.character.combat_power)}`)
  if (props.character.adventure_party_name) parts.push(props.character.adventure_party_name)
  return parts.join(' · ')
})
const line2 = computed(() => props.character.class_type === '输出'
  ? `模拟 ${fmtDps(props.character.simulated_damage)} · 秒伤 ${fmtDps(props.character.sustained_dps)}`
  : `增益 ${fmtBuff(props.character.buff_amount)} · 太阳 ${fmtBuff(props.character.sun_buff)}`)
</script>

<template>
  <div class="char-poster" @click="emit('click')">
    <div class="poster-img">
      <img v-if="!fallbackUsed" :src="src" class="cover" alt="" @error="onImgError">
      <div v-else class="fallback">
        <img :src="jobIcon(character.job_name)" class="fallback-icon" alt="" @error="onIconError">
      </div>
    </div>
    <div class="grad"></div>
    <div class="poster-info">
      <img :src="jobIcon(character.job_name)" class="job-icon" alt="" @error="onIconError">
      <div class="name-col">
        <span class="line1"><b class="poster-name">{{ character.name }}</b><span class="meta">{{ line1 }}</span></span>
        <span class="line2">{{ line2 }}</span>
      </div>
    </div>
    <DnfIconButton class="poster-delete" label="删除角色" icon="npc-close" @click.stop="emit('delete')" />
  </div>
</template>

<style scoped>
.char-poster { position: relative; aspect-ratio: 3/4; border-radius: 8px; overflow: hidden;
  cursor: pointer; background: var(--dnf-panel); border: 1px solid var(--dnf-edge);
  box-shadow: 0 2px 8px rgba(0,0,0,.4); transition: border-color .15s, box-shadow .15s; }
.char-poster:hover { border-color: var(--dnf-accent); box-shadow: 0 0 10px rgba(255,213,74,.35); }
.poster-img { position: absolute; inset: 0; }
.poster-img .cover { width: 100%; height: 100%; object-fit: cover; display: block; }
.fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--dnf-panel); }
.fallback-icon { width: 60%; height: 60%; object-fit: contain; opacity: .6; }
.grad { position: absolute; inset: auto 0 0 0; height: 55%; pointer-events: none;
  background: linear-gradient(to top, rgba(0,0,0,.88), transparent); }
.poster-info { position: absolute; left: 8px; right: 8px; bottom: 8px; color: #fff;
  display: flex; align-items: flex-start; gap: 6px; pointer-events: none; }
.job-icon { width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0; margin-top: 1px; }
.name-col { line-height: 1.3; min-width: 0; }
.line1 { font-size: 13px; font-weight: bold; }
.line1 .meta { display: block; font-weight: normal; font-size: 10px; opacity: .85; }
.line2 { display: block; font-size: 10px; opacity: .75; }
.poster-delete { position: absolute; top: 6px; right: 6px; z-index: 2; }
</style>
