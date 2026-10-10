// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadTargets, saveTargets, inferFillDuty, RECOMMEND_KEY, computeSquadStatus, rankCandidates, squadSlotsOf, sortByPower } from './roster'
import type { ClassType, Slot, Character, Wave } from '../types'

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
  it('主奶缺失（空 buff）→ mainHealOK=false', () => {
    const st = computeSquadStatus([os(12000), os(10000), aux('太阳奶', 0)], target)
    expect(st.mainHealOK).toBe(false)
    expect(st.issues.join()).toContain('主奶增益')
  })
  it('总伤高于上限 → outputOK=false', () => {
    const st = computeSquadStatus([os(15000), os(15000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(st.outputOK).toBe(false)
    expect(st.issues.join()).toContain('总伤')
  })
  it('缺太阳奶 → sunHealOK=false', () => {
    const st = computeSquadStatus([os(12000), os(10000), aux('主奶', 46000)], target)
    expect(st.sunHealOK).toBe(false)
    expect(st.issues.join()).toContain('缺太阳奶')
  })
  it('target.slack=true → 豁免，即使无划水成员且不满足输出', () => {
    const st = computeSquadStatus([os(5000), os(5000), aux('主奶', 40000)], { ...target, slack: true })
    expect(st.issues).toEqual([])
    expect(st.outputOK).toBe(true)
    expect(st.mainHealOK).toBe(true)
    expect(st.sunHealOK).toBe(true)
  })
})

const c1: Character = { id: 1, name: '高伤', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '输出',
  fame: 1, simulated_damage: 30000, sustained_dps: 0, buff_amount: null, sun_buff: null }
const c2: Character = { id: 2, name: '低伤', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '输出',
  fame: 1, simulated_damage: 5000, sustained_dps: 0, buff_amount: null, sun_buff: null }
const healer: Character = { id: 3, name: '奶', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '辅助',
  fame: 1, simulated_damage: null, sustained_dps: null, buff_amount: 46000, sun_buff: 0 }

function wave(id: number, slots: Slot[]): Wave {
  return { id, index: id, group_id: null, round_index: 1, group_index: 1, slots }
}

describe('sortByPower', () => {
  it('输出按模拟伤害降序（null 排最后）', () => {
    const n: Character = { ...c1, id: 3, simulated_damage: null, sustained_dps: null }
    expect(sortByPower([c2, n, c1]).map(x => x.id)).toEqual([1, 2, 3])
  })
})

describe('rankCandidates 推荐排序', () => {
  const targets = { 0: { outputs: { count: 2, simMin: 20000 } } }
  const group = [wave(10, [os(5000)])]  // 红队(0)已有 1 输出 5000，缺 1 输出
  it('推荐开关开 + 有模板：同队缺口相同 → 按战力 tie-break，高伤排前，目标队红队(0)', () => {
    const r = rankCandidates({ candidates: [c2, c1], groups: group, targets, recommendOn: true })
    expect(r[0].character.id).toBe(1)
    expect(r[1].character.id).toBe(2)
    expect(r[0].score).toBe(r[1].score)  // 缺口分是队伍缺口（候选无关），同队同分
    expect(r[0].score).toBeGreaterThan(0)
    expect(r[0].targetSquadIndex).toBe(0)
  })
  it('推荐开关关：按战力排序、score 为 0、无目标队', () => {
    const r = rankCandidates({ candidates: [c2, c1], groups: group, targets, recommendOn: false })
    expect(r.map(x => x.character.id)).toEqual([1, 2])
    expect(r.every(x => x.score === 0 && x.targetSquadIndex === null)).toBe(true)
  })
  it('无模板：全 score 0、按战力排序、无目标队', () => {
    const r = rankCandidates({ candidates: [c2, c1], groups: group, targets: {}, recommendOn: true })
    expect(r.map(x => x.character.id)).toEqual([1, 2])
    expect(r.every(x => x.score === 0 && x.targetSquadIndex === null)).toBe(true)
  })
  it('辅助角色 → 推荐到缺主奶的队', () => {
    const t = { 0: { mainHeal: { buffMin: 45000 } } }
    const g = [wave(10, [os(5000)])]  // 红队无主奶
    const r = rankCandidates({ candidates: [healer], groups: g, targets: t, recommendOn: true })
    expect(r[0].targetSquadIndex).toBe(0)
    expect(r[0].score).toBeGreaterThan(0)
  })
  it('并行团：取缺口更大的团（跨 wave 比较）', () => {
    const g2 = [wave(10, [os(5000)]), wave(20, [os(30000)])]  // 团1(wave 10)红队缺1输出，团2(wave 20)已满
    const r = rankCandidates({ candidates: [c1], groups: g2, targets, recommendOn: true })
    expect(r[0].targetWaveId).toBe(10)
    expect(r[0].score).toBeGreaterThan(0)
  })
  it('输出数已够但总伤不足下限 → 输出候选仍可匹配该队（缺总伤场景）', () => {
    const t = { 0: { outputs: { count: 2, simMin: 20000 } } }
    const g = [wave(10, [os(5000, '主C'), os(5000, '辅C')])]  // 已有 2 输出 + 主C，但总伤 10000 < 20000
    const r = rankCandidates({ candidates: [c1], groups: g, targets: t, recommendOn: true })
    expect(r[0].targetSquadIndex).toBe(0)
    expect(r[0].score).toBeGreaterThan(0)
  })
})

describe('squadSlotsOf', () => {
  it('按 squad_index 分组', () => {
    const s0 = { ...slot('主C'), id: 1, squad_index: 0 }
    const s1a = { ...slot('主C'), id: 2, squad_index: 1 }
    const s1b = { ...slot('主C'), id: 3, squad_index: 1 }
    const groups = squadSlotsOf(wave(10, [s0, s1a, s1b]))
    expect(groups.length).toBe(2)
    expect(groups[1].map(s => s.id)).toEqual([2, 3])
  })
})
