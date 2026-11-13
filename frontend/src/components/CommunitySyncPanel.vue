<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { DnfButton, DnfDialog, DnfFrame, DnfInput } from '@dnftools/ui'
import { api } from '../api/client'
import { notifyError, notifySuccess, notifyWarning } from '../lib/notify'
import type { SyncRoleResult, SyncTask } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

const communityId = ref('')
const task = ref<SyncTask | null>(null)
const submitting = ref(false)
const noRecord = ref(false)
let timer: number | undefined

const roles = computed(() => task.value?.result?.roles ?? [])

function stopPolling() { if (timer !== undefined) { clearInterval(timer); timer = undefined } }

function startPolling() {
  stopPolling()
  timer = window.setInterval(() => { void pollTick() }, 5000)
}

async function loadLatest(): Promise<SyncTask | null> {
  try {
    const t = await api.syncLatest()
    task.value = t
    noRecord.value = false
    return t
  } catch {
    task.value = null
    noRecord.value = true
    return null
  }
}

async function pollTick(): Promise<SyncTask | null> {
  const t = await loadLatest()
  if (t && (t.status === 'success' || t.status === 'failed')) {
    stopPolling()
    if (t.status === 'success') { notifySuccess('同步完成'); emit('changed') }
    else notifyError(t.message || '查询失败，请联系管理员')
  }
  return t
}

// 打开时加载最近同步；若任务仍在进行中则续轮询（重开弹窗也能等到完成）；关闭即停
watch(() => props.open, (open) => {
  if (!open) { stopPolling(); return }
  void loadLatest().then((t) => {
    if (t && (t.status === 'pending' || t.status === 'running')) startPolling()
  })
}, { immediate: true })

async function submit() {
  const cid = communityId.value.trim()
  if (!cid) { notifyError('请输入社区ID'); return }
  submitting.value = true
  try {
    await api.syncCreate({ communityId: cid })
    stopPolling()
    emit('close')  // 后台异步进行，关闭弹窗稍后查看
    notifySuccess('同步工作后台进行，稍后查看结果')
  } catch (e: any) {
    if (e.message === '同步频繁，请 3 小时后再试') notifyWarning(e.message)
    else notifyError('查询失败，请联系管理员')
  } finally {
    submitting.value = false
  }
}

function actionText(r: SyncRoleResult): string {
  if (r.action === 'created') return '已创建'
  if (r.action === 'updated') return '已更新'
  if (r.action === 'skipped') return `跳过：${r.reason ?? '职业未收录'}`
  return `失败：${r.reason ?? ''}`
}
function profileText(r: SyncRoleResult): string {
  if (r.action === 'skipped' || r.action === 'failed') return '—'
  return r.profileImported ? '已导入' : '导入失败'
}

onUnmounted(stopPolling)
</script>

<template>
  <DnfDialog :open="open" title="同步社区角色" width="min(640px,92vw)" modal close-on-outside
             @update:open="(s: boolean) => { if (!s) emit('close') }">
    <div style="display:flex;align-items:center;gap:8px">
      <DnfInput v-model="communityId" data-act="community-id-input"
                placeholder="DNF助手社区ID（纯数字）" style="flex:1" />
      <DnfButton tone="gold" data-act="sync-submit" :disabled="submitting" @click="submit">
        {{ submitting ? '提交中…' : '确定' }}</DnfButton>
    </div>
    <p v-if="task?.status === 'running'" class="sync-status">
      {{ task.message ? '换绑限流等待中，约数分钟后继续…' : '同步中…' }}</p>
    <p v-if="task?.status === 'failed'" class="form-error" style="margin:6px 0 0">{{ task.message || '查询失败，请联系管理员' }}</p>

    <DnfFrame v-if="roles.length" surface="panel" style="margin-top:12px;padding:12px;max-height:50vh;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="color:var(--dnf-text-muted);text-align:left">
            <th style="padding:4px">角色</th><th style="padding:4px">职业</th>
            <th style="padding:4px">名望</th><th style="padding:4px">等级</th>
            <th style="padding:4px">服务器</th><th style="padding:4px">结果</th><th style="padding:4px">形象</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in roles" :key="r.roleName" style="border-top:1px solid var(--dnf-border,#3a3f4b)">
            <td style="padding:4px">{{ r.roleName }}</td>
            <td style="padding:4px">{{ r.job ?? '—' }}</td>
            <td style="padding:4px">{{ r.fame ?? '—' }}</td>
            <td style="padding:4px">{{ r.level ?? '—' }}</td>
            <td style="padding:4px">{{ r.server ?? '—' }}</td>
            <td style="padding:4px">{{ actionText(r) }}</td>
            <td style="padding:4px">{{ profileText(r) }}</td>
          </tr>
        </tbody>
      </table>
    </DnfFrame>
    <p v-if="noRecord" style="color:var(--dnf-text-faint);margin:8px 0 0">还没有同步记录</p>
  </DnfDialog>
</template>
