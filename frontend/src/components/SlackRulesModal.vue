<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import type { ClassType, SlackMetric, SlackRuleCriterion, SlackRuleExchange, SlackRuleSet } from '../types'

const props = defineProps<{ open: boolean; rules: SlackRuleSet }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'submit', rules: SlackRuleSet): void }>()

const METRICS: Record<ClassType, { value: SlackMetric; label: string }[]> = {
  '输出': [
    { value: 'fame', label: '名望' },
    { value: 'simulated_damage', label: '模拟伤害' },
    { value: 'sustained_dps', label: '秒伤' },
  ],
  '辅助': [
    { value: 'buff_amount', label: '增益量' },
    { value: 'sun_buff', label: '太阳增益量' },
  ],
}

const criteria = ref<SlackRuleCriterion[]>([])
const exchange = ref<SlackRuleExchange[]>([])

watch(() => props.open, (v) => {
  if (!v) return
  criteria.value = props.rules.criteria.map(c => ({ ...c }))
  exchange.value = props.rules.exchange.map(e => ({ ...e }))
}, { immediate: true }) // immediate：测试直接以 open:true 挂载即预填；关闭态不渲染无害

function addCriterion() { if (criteria.value.length < 20) criteria.value.push({ class_type: '输出', metric: 'fame', value: 0 }) }
function removeCriterion(i: number) { criteria.value.splice(i, 1) }
function addExchange() { if (exchange.value.length < 20) exchange.value.push({ class_type: '输出', metric: 'fame', value: 0, count: 1 }) }
function removeExchange(i: number) { exchange.value.splice(i, 1) }
function onJobChange(row: { class_type: ClassType; metric: SlackMetric }) {
  if (!METRICS[row.class_type].some(m => m.value === row.metric)) row.metric = METRICS[row.class_type][0].value
}
function clearAll() { criteria.value = []; exchange.value = [] }
function submit() {
  emit('submit', {
    criteria: criteria.value.filter(r => r.value > 0),
    exchange: exchange.value.filter(r => r.value > 0 && r.count > 0),
  })
}
</script>

<template>
  <n-modal :show="open" preset="card" title="划水规则设置" style="width:min(560px,94vw)"
           @update:show="(s: boolean) => { if (!s) emit('close') }">
    <div class="slack-form">
      <div class="slack-section">
        <div class="slack-sec-head"><b>划水名望</b>
          <span class="slack-sec-hint">数值小于输入值的角色视为划水</span></div>
        <div v-for="(row, i) in criteria" :key="i" class="slack-row">
          <select v-model="row.class_type" class="dnf-input" :data-field="'criteria-job-' + i"
                  @change="onJobChange(row)">
            <option value="输出">输出</option><option value="辅助">辅助</option>
          </select>
          <select v-model="row.metric" class="dnf-input" :data-field="'criteria-metric-' + i">
            <option v-for="m in METRICS[row.class_type]" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <input v-model.number="row.value" type="number" min="0" class="dnf-input"
                 :data-field="'criteria-value-' + i" />
          <button v-if="criteria.length > 1" class="dnf-btn dnf-btn-sm" type="button"
                  :data-act="'rm-criterion-' + i" @click="removeCriterion(i)">删除</button>
        </div>
        <button v-if="criteria.length < 20" class="dnf-btn dnf-btn-sm" type="button"
                data-act="add-criterion" @click="addCriterion">＋ 添加一行</button>
      </div>
      <div class="slack-section">
        <div class="slack-sec-head"><b>兑换标准</b>
          <span class="slack-sec-hint">数值大于输入值的角色可兑换对应划水位</span></div>
        <div v-for="(row, i) in exchange" :key="i" class="slack-row">
          <select v-model="row.class_type" class="dnf-input" :data-field="'exchange-job-' + i"
                  @change="onJobChange(row)">
            <option value="输出">输出</option><option value="辅助">辅助</option>
          </select>
          <select v-model="row.metric" class="dnf-input" :data-field="'exchange-metric-' + i">
            <option v-for="m in METRICS[row.class_type]" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <input v-model.number="row.value" type="number" min="0" class="dnf-input"
                 :data-field="'exchange-value-' + i" />
          <input v-model.number="row.count" type="number" min="1" class="dnf-input"
                 :data-field="'exchange-count-' + i" style="width:72px" />
          <button v-if="exchange.length > 1" class="dnf-btn dnf-btn-sm" type="button"
                  :data-act="'rm-exchange-' + i" @click="removeExchange(i)">删除</button>
        </div>
        <button v-if="exchange.length < 20" class="dnf-btn dnf-btn-sm" type="button"
                data-act="add-exchange" @click="addExchange">＋ 添加一行</button>
      </div>
      <div class="slack-actions">
        <button class="dnf-btn" data-act="clear" @click="clearAll">清空</button>
        <button class="dnf-btn dnf-btn-primary" data-act="submit" @click="submit">提交</button>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.slack-form { display: flex; flex-direction: column; gap: 16px }
.slack-section { display: flex; flex-direction: column; gap: 8px }
.slack-sec-head { display: flex; align-items: baseline; gap: 8px }
.slack-sec-hint { font-size: 12px; color: var(--dnf-text-muted,#9aa3b2) }
.slack-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
.slack-actions { display: flex; justify-content: center; gap: 12px }
</style>
