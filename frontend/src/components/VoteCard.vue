<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '../api/client'
import { notifyError, notifySuccess, notifyWarning } from '../lib/notify'
import type { VoteDetail } from '../types'

const props = defineProps<{ vote: VoteDetail }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const maskUp = ref(false)        // 面罩状态（纯前端）
const votedAnon = ref(false)     // 本会话内已匿名投过（后端无身份可查）
const selected = ref<number[]>([])

watch(() => props.vote, () => {
  if (!votedAnon.value) selected.value = [...props.vote.my_option_ids]
}, { immediate: true })

const isOpen = computed(() => props.vote.open)
const isMulti = computed(() => props.vote.multi_choice)

function toggleOption(id: number) {
  if (isMulti.value) {
    selected.value = selected.value.includes(id)
      ? selected.value.filter(x => x !== id) : [...selected.value, id]
  } else {
    selected.value = [id]
  }
}
function isSelected(id: number): boolean { return selected.value.includes(id) }

async function submitVote() {
  if (!selected.value.length) { notifyWarning('请先选择选项'); return }
  try {
    await api.post(`/api/votes/${props.vote.id}/ballots`,
      { option_ids: selected.value, anonymous: maskUp.value })
    if (maskUp.value) { votedAnon.value = true; selected.value = [] }
    notifySuccess(maskUp.value ? '已匿名投票' : '投票成功')
    emit('refresh')
  } catch (e: any) { notifyError(e.message) }
}
</script>

<template>
  <div class="dnf-panel vote-card">
    <div class="vote-head">
      <strong class="vote-title">{{ vote.title }}</strong>
      <span class="dnf-badge" :class="isOpen ? 'dnf-badge-ok' : 'dnf-badge-danger'">
        {{ isOpen ? '进行中' : '已结束' }}</span>
      <span v-if="isMulti" class="dnf-badge">多选</span>
      <span class="vote-voters">{{ vote.total_voters }} 人已投</span>
    </div>
    <p v-if="vote.description" class="vote-desc">{{ vote.description }}</p>
    <div v-if="isOpen && !votedAnon" class="vote-mask">
      <button class="dnf-btn dnf-btn-sm" data-act="mask" @click="maskUp = !maskUp">
        {{ maskUp ? '拉下面罩' : '拉起面罩' }}</button>
      <span v-if="maskUp" class="vote-note">面罩已拉起：本次投票将记作匿名</span>
    </div>
    <ul class="vote-options">
      <li v-for="o in vote.options" :key="o.id" class="vote-option"
          :class="{ selected: isSelected(o.id) }">
        <button v-if="isOpen && !votedAnon" class="vote-option-row" :data-act="'opt-' + o.id"
                @click="toggleOption(o.id)">
          <span class="vote-opt-text">{{ o.text }}</span>
          <span class="vote-opt-count">{{ o.count }} 票</span>
        </button>
        <div v-else class="vote-option-row">
          <span class="vote-opt-text">{{ o.text }}</span>
          <span class="vote-opt-count">{{ o.count }} 票</span>
        </div>
        <span v-if="o.voters.length" class="vote-voters">{{ o.voters.join('、') }}</span>
      </li>
    </ul>
    <p v-if="votedAnon" class="vote-note">你已匿名投票，本会话内无法修改或撤销</p>
    <p v-else-if="isOpen && vote.my_voted" class="vote-note">你已投票</p>
    <button v-if="isOpen && !votedAnon && !vote.my_voted" class="dnf-btn dnf-btn-primary dnf-btn-sm"
            data-act="vote" @click="submitVote">投票</button>
  </div>
</template>
