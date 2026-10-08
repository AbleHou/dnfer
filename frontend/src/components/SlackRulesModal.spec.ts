// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlackRulesModal from './SlackRulesModal.vue'
import type { SlackRuleSet } from '../types'

const rules: SlackRuleSet = {
  criteria: [{ class_type: '输出', metric: 'fame', value: 125000 }],
  exchange: [{ class_type: '输出', metric: 'fame', value: 130000, count: 1 }],
}

function mountModal(open: boolean, r: SlackRuleSet = rules) {
  return mount(SlackRulesModal, { props: { open, rules: r },
    global: { stubs: { teleport: true } } })
}

describe('SlackRulesModal', () => {
  it('渲染两节规则行并预填', () => {
    const w = mountModal(true)
    expect(w.text()).toContain('划水名望')
    expect(w.text()).toContain('兑换标准')
    expect(w.find('[data-field="criteria-value-0"]').element as HTMLInputElement).toHaveProperty('value', '125000')
    expect(w.find('[data-field="exchange-count-0"]').element as HTMLInputElement).toHaveProperty('value', '1')
  })
  it('职业切换后数值下拉选项变化（辅助无 fame）', async () => {
    const w = mountModal(true)
    const job = w.find('[data-field="criteria-job-0"]')
    await job.setValue('辅助')
    const opts = w.findAll<HTMLOptionElement>('[data-field="criteria-metric-0"] option').map(o => o.element.value)
    expect(opts).toEqual(['buff_amount', 'sun_buff'])
  })
  it('添加/删除行与清空', async () => {
    const w = mountModal(true)
    await w.find('[data-act="add-criterion"]').trigger('click')
    expect(w.findAll('[data-field^="criteria-value-"]')).toHaveLength(2)
    await w.find('[data-act="clear"]').trigger('click')
    expect(w.findAll('[data-field^="criteria-value-"]')).toHaveLength(0)
  })
  it('提交 emit 当前规则', async () => {
    const w = mountModal(true)
    await w.find('[data-act="submit"]').trigger('click')
    expect(w.emitted('submit')?.[0][0]).toEqual(rules)
  })
})
