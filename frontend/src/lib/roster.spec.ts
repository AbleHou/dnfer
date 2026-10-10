// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadTargets, saveTargets, inferFillDuty, RECOMMEND_KEY, computeSquadStatus } from './roster'
import type { ClassType, Slot } from '../types'

function slot(duty: string | null, classType: ClassType | null = '输出'): Slot {
  return {
    id: 0, squad_index: 0, row_index: 0, character_id: duty ? 1 : null,
    character_name: duty ? 'x' : null, character_class: classType, job_name: null, job_title: null,
    fame: null, simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    owner_id: null, owner_nickname: null, owner_avatar: null, duty: duty as any, version: 1,
  }
}

beforeEach(() => localStorage.clear())

describe('模板 localStorage 读写', () => {
  it('saveTargets 后 loadTargets 可还原', () => {
    const t = { 0: { outputs: { count: 2, simMin: 20000, simMax: 25000 }, mainHeal: { buffMin: 45000 } } }
    saveTargets(7, t)
    expect(loadTargets(7)).toEqual(t)
  })
  it('无数据时返回空对象', () => {
    expect(loadTargets(7)).toEqual({})
  })
  it('RECOMMEND_KEY 常量存在', () => {
    expect(RECOMMEND_KEY).toBe('dnfer-roster-recommend')
  })
})

describe('inferFillDuty 职责决策表（与模板无关，只看队伍状态）', () => {
  it('辅助 + 队已有主奶 → 太阳奶', () => {
    expect(inferFillDuty([slot('主奶', '辅助')], '辅助')).toBe('太阳奶')
  })
  it('辅助 + 队无主奶 → 主奶', () => {
    expect(inferFillDuty([], '辅助')).toBe('主奶')
  })
  it('输出 + 队无主C → 主C', () => {
    expect(inferFillDuty([], '输出')).toBe('主C')
  })
  it('输出 + 队已有主C → 辅C', () => {
    expect(inferFillDuty([slot('主C')], '输出')).toBe('辅C')
  })
  it('辅助 + 队只有太阳奶无主奶 → 主奶（防主奶超限不误伤）', () => {
    expect(inferFillDuty([slot('太阳奶', '辅助')], '辅助')).toBe('主奶')
  })
})

function os(sim: number | null, duty: string | null = '主C', buff: number | null = null): Slot {
  return { ...slot(duty, '输出'), simulated_damage: sim, sustained_dps: null, buff_amount: buff, sun_buff: null }
}
function aux(duty: string, buff: number | null, sun: number | null = null): Slot {
  return { ...slot(duty, '辅助'), simulated_damage: null, sustained_dps: null, buff_amount: buff, sun_buff: sun }
}

describe('computeSquadStatus 达标计算', () => {
  const target = {
    outputs: { count: 2, simMin: 20000, simMax: 25000 },
    mainHeal: { buffMin: 45000, buffMax: 48000 },
    sunHeal: { count: 1 },
  }
  it('达标：输出数/总伤/主奶增益/太阳奶全满足', () => {
    const st = computeSquadStatus([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.outputOK).toBe(true)
    expect(st.mainHealOK).toBe(true)
    expect(st.sunHealOK).toBe(true)
    expect(st.issues).toEqual([])
  })
  it('缺输出数：2/1 → 未达标并有缺口文案', () => {
    const st = computeSquadStatus([os(20000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.outputOK).toBe(false)
    expect(st.issues.join()).toContain('输出')
  })
  it('总伤低于下限 → 未达标', () => {
    const st = computeSquadStatus([os(5000), os(5000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.outputOK).toBe(false)
    expect(st.issues.join()).toContain('总伤')
  })
  it('主奶增益低于下限 → 未达标', () => {
    const st = computeSquadStatus([os(12000), os(10000), aux('主奶', 40000), aux('太阳奶', 0)], target)
    expect(st.mainHealOK).toBe(false)
  })
  it('单边区间：只设 simMin 时 simMax 不限', () => {
    const st = computeSquadStatus([os(30000), aux('主奶', 46000)], { outputs: { count: 1, simMin: 20000 } })
    expect(st.outputOK).toBe(true)
  })
  it('目标为空对象时视为无要求，全部达标', () => {
    const st = computeSquadStatus([os(1)], undefined)
    expect(st.outputOK).toBe(true)
    expect(st.mainHealOK).toBe(true)
    expect(st.issues).toEqual([])
  })
  it('有划水成员 → 组成要求豁免', () => {
    const st = computeSquadStatus([os(100, '划水')], target)
    expect(st.issues).toEqual([])
  })
  it('统计字段：filled/total/outputCount/mainHealBuff/sunHealCount', () => {
    const st = computeSquadStatus([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.filled).toBe(4); expect(st.total).toBe(4)
    expect(st.outputCount).toBe(2); expect(st.outputTotal).toBe(22000)
    expect(st.mainHealBuff).toBe(46000); expect(st.sunHealCount).toBe(1)
  })
})
