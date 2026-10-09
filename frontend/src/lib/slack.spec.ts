import { describe, it, expect } from 'vitest'
import { metricValue, isSlackingChar, charExchangeCount, computeSlack, slackCountByUser } from './slack'
import type { Character, SlackRuleCriterion, SlackRuleSet } from '../types'

const output: Character = { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: '鬼剑士', class_type: '输出', fame: 52000, simulated_damage: 5,
  sustained_dps: 2, buff_amount: null, sun_buff: null }
const support: Character = { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士',
  parent_name: '圣职者', class_type: '辅助', fame: 40000, simulated_damage: null,
  sustained_dps: null, buff_amount: 3000, sun_buff: 500 }

describe('slack 判定', () => {
  it('metricValue 取对应数值', () => {
    expect(metricValue(output, 'fame')).toBe(52000)
    expect(metricValue(support, 'buff_amount')).toBe(3000)
    expect(metricValue(output, 'buff_amount')).toBeNull()
  })
  it('isSlackingChar：类型匹配且数值小于阈值', () => {
    expect(isSlackingChar(output, [{ class_type: '输出', metric: 'fame', value: 60000 }])).toBe(true)
    expect(isSlackingChar(output, [{ class_type: '输出', metric: 'fame', value: 52000 }])).toBe(false) // 不小于
    expect(isSlackingChar(output, [{ class_type: '辅助', metric: 'fame', value: 60000 }])).toBe(false) // 职业不匹配
    expect(isSlackingChar(output, [{ class_type: '输出', metric: 'buff_amount', value: 999 }])).toBe(false) // null 不满足
  })
  it('多规则同职业：满足任意一条即不算划水，全部低于阈值才算', () => {
    const criteria: SlackRuleCriterion[] = [
      { class_type: '辅助', metric: 'buff_amount', value: 41000 },
      { class_type: '辅助', metric: 'sun_buff', value: 400000 },
    ]
    expect(isSlackingChar({ ...support, buff_amount: 3000, sun_buff: 450000 }, criteria)).toBe(false) // 太阳达标豁免
    expect(isSlackingChar({ ...support, buff_amount: 42000, sun_buff: 300000 }, criteria)).toBe(false) // 增益达标豁免
    expect(isSlackingChar({ ...support, buff_amount: 3000, sun_buff: 300000 }, criteria)).toBe(true)  // 全低于阈值
  })
  it('多规则同职业：适用指标为 null 不判划水（宽松）', () => {
    const criteria: SlackRuleCriterion[] = [
      { class_type: '辅助', metric: 'buff_amount', value: 41000 },
      { class_type: '辅助', metric: 'sun_buff', value: 400000 },
    ]
    expect(isSlackingChar({ ...support, buff_amount: 3000, sun_buff: null }, criteria)).toBe(false)
    expect(isSlackingChar({ ...support, buff_amount: null, sun_buff: 300000 }, criteria)).toBe(false)
  })
  it('charExchangeCount：取满足行最大 count，无则 0', () => {
    expect(charExchangeCount(output, [
      { class_type: '输出', metric: 'fame', value: 50000, count: 1 },
      { class_type: '输出', metric: 'fame', value: 51000, count: 3 }, // 52000 同时 > 两行阈值 → 取最大 3
    ])).toBe(3)
    expect(charExchangeCount(support, [{ class_type: '输出', metric: 'fame', value: 50000, count: 1 }])).toBe(0)
    expect(charExchangeCount(output, [{ class_type: '输出', metric: 'buff_amount', value: 1, count: 1 }])).toBe(0) // null
  })
})

describe('computeSlack', () => {
  // 判定：名望 < 60000 划水；兑换：模拟伤害 > 8 兑 1 个（跨指标，便于同一角色既划水又贡献额度）
  const rules: SlackRuleSet = {
    criteria: [{ class_type: '输出', metric: 'fame', value: 60000 }],
    exchange: [{ class_type: '输出', metric: 'simulated_damage', value: 8, count: 1 }],
  }
  it('超额划水角色靠后灰显', () => {
    // a/b/c 名望均 < 60000（划水）；仅 a 模拟伤害 9 > 8 贡献额度 1；excess=2 → 靠后 b/c 灰显
    const a: Character = { ...output, id: 1, fame: 50000, simulated_damage: 9 }
    const b: Character = { ...output, id: 2, fame: 30000, simulated_damage: 3 }
    const c: Character = { ...output, id: 3, fame: 20000, simulated_damage: 1 }
    expect(computeSlack(rules, { 5: [a, b, c] })).toEqual({ 5: [2, 3] })
  })
  it('额度覆盖的角色不灰，空规则无灰', () => {
    const a: Character = { ...output, id: 1, fame: 50000, simulated_damage: 9 } // 划水但被额度 1 覆盖
    const d: Character = { ...output, id: 4, fame: 30000, simulated_damage: 3 } // 划水无额度 → 灰
    expect(computeSlack(rules, { 5: [a, d] })).toEqual({ 5: [4] })
    expect(computeSlack({ criteria: [], exchange: [] }, { 5: [a] })).toEqual({ 5: [] })
  })
})

describe('slackCountByUser', () => {
  const rules: SlackRuleSet = {
    criteria: [{ class_type: '输出', metric: 'fame', value: 60000 }],
    exchange: [],
  }
  it('统计每人划水总数（不扣兑换额度）', () => {
    const a: Character = { ...output, id: 1, fame: 50000 }
    const b: Character = { ...output, id: 2, fame: 30000 }
    const c: Character = { ...output, id: 3, fame: 95000 } // 非划水
    expect(slackCountByUser(rules, { 5: [a, b, c], 6: [c] })).toEqual({ 5: 2, 6: 0 })
  })
  it('空规则为 0', () => {
    const a: Character = { ...output, id: 1, fame: 50000 }
    expect(slackCountByUser({ criteria: [], exchange: [] }, { 5: [a] })).toEqual({ 5: 0 })
  })
  it('职业不匹配与 null 指标不计入', () => {
    // 辅助职业不匹配输出规则；输出角色 buff_amount 为 null
    expect(slackCountByUser(rules, { 5: [support, output] })).toEqual({ 5: 1 })
  })
})
