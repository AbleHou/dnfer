<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DnfIconButton, DnfMarquee } from '@dnftools/ui'
import { characterProfile, jobIcon, handleIconError as onIconError } from '../lib/job'
import type { Character } from '../types'

const props = withDefaults(defineProps<{ character: Character; hideDelete?: boolean }>(), { hideDelete: false })
const emit = defineEmits<{ (e: 'click'): void; (e: 'delete'): void }>()

const customSrc = computed(() => props.character.profile)
const defaultSrc = computed(() => characterProfile(props.character.parent_name, props.character.job_name))
// 兜底层级：0=当前 src（自定义或默认） 1=降级默认图 2=深底+图标
const level = ref(0)
const displaySrc = computed(() => level.value === 1 ? defaultSrc.value : (customSrc.value ?? defaultSrc.value))
function onImgError() {
  if (level.value === 0 && customSrc.value) level.value = 1  // 自定义失败 → 默认图
  else level.value = 2                                        // 默认失败或无自定义 → 深底
}
watch(() => [props.character.profile, defaultSrc.value], () => { level.value = 0 })

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
      <img v-if="level < 2" :src="displaySrc" class="cover" alt="" @error="onImgError">
      <div v-else class="fallback">
        <img :src="jobIcon(character.job_name)" class="fallback-icon" alt="" @error="onIconError">
      </div>
    </div>
    <div class="poster-info">
      <img :src="jobIcon(character.job_name)" class="job-icon" alt="" @error="onIconError">
      <div class="name-col">
        <span class="line1"><b class="poster-name">{{ character.name }}</b>
          <DnfMarquee class="meta" :duration="10">{{ line1 }}</DnfMarquee></span>
        <DnfMarquee class="line2" :duration="10">{{ line2 }}</DnfMarquee>
      </div>
    </div>
    <DnfIconButton v-if="!hideDelete" class="poster-delete" label="删除角色" icon="npc-close"
                   @click.stop="emit('delete')" />
  </div>
</template>

<style scoped>
/* 上形象 + 下固定文本条：3:4 固定比例保证卡片统一尺寸，文本逐行省略号截断 */
.char-poster { position: relative; aspect-ratio: 3/4; display: flex; flex-direction: column;
  border-radius: 8px; overflow: hidden; cursor: pointer; background: var(--dnf-panel);
  border: 1px solid var(--dnf-edge); box-shadow: 0 2px 8px rgba(0,0,0,.4);
  transition: border-color .15s, box-shadow .15s; }
.char-poster:hover { border-color: var(--dnf-accent); box-shadow: 0 0 10px rgba(255,213,74,.35); }
.poster-img { position: relative; flex: 1; min-height: 0; }
.poster-img .cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--dnf-panel); }
.fallback-icon { width: 60%; height: 60%; object-fit: contain; opacity: .6; }
.poster-info { flex-shrink: 0; height: 58px; padding: 5px 8px; border-top: 1px solid var(--dnf-border,#3a3f4b);
  display: flex; align-items: flex-start; gap: 6px; color: var(--dnf-text); background: var(--dnf-panel); }
.job-icon { width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0; margin-top: 1px; }
.name-col { line-height: 1.3; min-width: 0; flex: 1; }
.line1, .line2 { display: block; }
.poster-name, .line2 { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.poster-name { font-size: 13px; font-weight: bold; }
.meta { font-size: 10px; opacity: .85; }   /* 冒险团名可能很长 → DnfMarquee 滚动展示，不截断 */
.line2 { font-size: 10px; opacity: .75; }
.poster-delete { position: absolute; top: 6px; right: 6px; z-index: 2; }
</style>
