<script setup lang="ts">
import { computed } from 'vue'
import { jobIcon, handleIconError as onIconError, jobGenderTitle } from '../lib/job'
import { SQUAD_NAMES } from '../lib/colors'
import { sortByPower } from '../lib/roster'
import type { Character, RaidSignup } from '../types'

const props = withDefaults(defineProps<{
  signups: RaidSignup[]
  blockedCharIds: Set<number>
  slackCharIds: Set<number>
  recommendTop3: Set<number>
  recommendTarget: Record<number, number | null>
  holdingId: number | null
  canEdit: boolean
}>(), { recommendTop3: () => new Set(), recommendTarget: () => ({}) })
const emit = defineEmits<{ (e: 'pick', c: Character): void }>()

// 按用户分组；组内按战力排序（输出模拟伤害/辅助增益 desc）
const groups = computed(() => props.signups
  .filter(s => s.characters.length > 0)
  .map(s => ({ user: s.user, chars: sortByPower(s.characters) })))

function fmt(n: number | null, unit: string): string { return n == null ? '暂无' : `${n}${unit}` }
function powerText(c: Character): string {
  return c.class_type === '输出'
    ? `模拟 ${fmt(c.simulated_damage, '亿')} · 秒伤 ${fmt(c.sustained_dps, '亿')}`
    : `增益 ${fmt(c.buff_amount, '')} · 太阳 ${fmt(c.sun_buff, '')}`
}
function onPick(c: Character) { if (props.canEdit && !props.blockedCharIds.has(c.id)) emit('pick', c) }
</script>

<template>
  <div class="roster-pool">
    <div v-for="g in groups" :key="g.user.id" class="pool-user">
      <div class="pool-user-head">{{ g.user.nickname }}</div>
      <div v-for="c in g.chars" :key="c.id" class="pool-char"
           :class="{ blocked: blockedCharIds.has(c.id), holding: holdingId === c.id,
                     slack: slackCharIds.has(c.id) }"
           :data-act="`pool-char-${c.id}`" @click="onPick(c)">
        <img :src="jobIcon(c.job_name)" @error="onIconError" style="width:26px;height:26px">
        <div style="flex:1;min-width:0">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            <b>{{ c.name }}</b>
            <span style="color:var(--dnf-text-muted);font-size:12px">
              {{ jobGenderTitle(c.job_name, c.job_title) }} · {{ c.class_type }}
            </span>
          </div>
          <div style="color:var(--dnf-text-faint);font-size:12px">{{ powerText(c) }}</div>
        </div>
        <span v-if="slackCharIds.has(c.id)" class="pool-tag slack">划水</span>
        <span v-if="recommendTop3.has(c.id)" class="pool-tag rec">
          推荐<template v-if="recommendTarget[c.id] != null">→{{ SQUAD_NAMES[recommendTarget[c.id]!] }}</template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pool-user { margin-bottom: 10px; }
.pool-user-head { font-weight: bold; margin-bottom: 4px; color: var(--dnf-text-muted,#9aa3b2); }
.pool-char { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--dnf-border,#3a3f4b);
  border-radius: 6px; margin-bottom: 4px; cursor: pointer; }
.pool-char.blocked { opacity: .45; filter: grayscale(1); cursor: default; }
.pool-char.slack { opacity: .45; filter: grayscale(1); }
.pool-char.holding { border-color: var(--dnf-accent,#ffd54a); background: rgba(255,213,74,.08); }
.pool-tag { flex-shrink: 0; font-size: 11px; border-radius: 4px; padding: 2px 6px; }
.pool-tag.slack { background: var(--dnf-danger,#e5484d); color: #fff; }
.pool-tag.rec { background: var(--dnf-gold,#ffd54a); color: #1a1205; font-weight: bold; }
</style>
