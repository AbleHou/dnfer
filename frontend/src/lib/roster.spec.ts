// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadTargets, saveTargets, clearTargets, inferFillDuty, RECOMMEND_KEY, recommendFillers, squadSlotsOf, sortByPower, placementByChar, squadOverview } from './roster'
import type { ClassType, Duty, Slot, Character, Wave } from '../types'

function slot(duty: string | null, classType: ClassType | null = '输出'): Slot {
  return {
    id: 0, squad_index: 0, row_index: 0, character_id: duty ? 1 : null,
    character_name: duty ? 'x' : null, character_class: classType, job_name: null, job_title: null,
    fame: null, simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    owner_id: null, owner_nickname: null, owner_avatar: null, duty: duty as any, version: 1,
    adventure_party_id: null, adventure_party_name: null,
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
  it('localStorage 存 "null" 时返回空对象（防御）', () => {
    localStorage.setItem('dnfer-roster-targets-7', 'null')
    expect(loadTargets(7)).toEqual({})
  })
  it('clearTargets 清除该 raid 模板', () => {
    saveTargets(7, { 0: { outputs: { count: 2 } } })
    clearTargets(7)
    expect(loadTargets(7)).toEqual({})
  })
  it('clearTargets 只清指定 raid', () => {
    saveTargets(7, { 0: { outputs: { count: 2 } } }); saveTargets(8, { 0: { outputs: { count: 3 } } })
    clearTargets(7)
    expect(loadTargets(7)).toEqual({}); expect(loadTargets(8)[0]?.outputs?.count).toBe(3)
  })
  it('saveTargets/clearTargets 在 localStorage 异常时不抛（try/catch 兜底）', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => saveTargets(7, { 0: {} })).not.toThrow()
    spy.mockRestore()
    const spy2 = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => clearTargets(7)).not.toThrow()
    spy2.mockRestore()
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

describe('squadOverview 总览（新引擎）', () => {
  const target = {
    outputs: { count: 2, simMin: 20000, simMax: 25000 },
    mainHeal: { buffMin: 45000, buffMax: 48000 },
    sunHeal: { count: 1 },
  }
  it('无模板 → dims 空、ok、issues 空', () => {
    const ov = squadOverview([os(12000)], undefined)
    expect(ov.dims).toEqual([]); expect(ov.ok).toBe(true); expect(ov.issues).toEqual([])
  })
  it('全达标 → 各维度 ok 且 diff 为超出量', () => {
    const ov = squadOverview([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(ov.ok).toBe(true)
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.actual).toBe(22000); expect(sim.ok).toBe(true); expect(sim.diff).toBe(2000) // 22000-20000
    const heal = ov.dims.find(d => d.key === 'mainHealBuff')!
    expect(heal.ok).toBe(true); expect(heal.diff).toBe(1000) // 46000-45000
    const out = ov.dims.find(d => d.key === 'outputCount')!
    expect(out.ok).toBe(true); expect(out.actual).toBe(2); expect(out.min).toBe(2)
    const sun = ov.dims.find(d => d.key === 'sunHealCount')!
    expect(sun.ok).toBe(true); expect(sun.actual).toBe(1)
  })
  it('缺输出数 → outputCount !ok、diff 为负缺口、issues 缺N输出', () => {
    const ov = squadOverview([os(20000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    const out = ov.dims.find(d => d.key === 'outputCount')!
    expect(out.ok).toBe(false); expect(out.actual).toBe(1); expect(out.diff).toBe(-1)
    expect(ov.ok).toBe(false); expect(ov.issues.join()).toContain('缺1输出')
  })
  it('总伤低于下限 → simDamage !ok、issues 总伤差', () => {
    const ov = squadOverview([os(5000), os(5000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.ok).toBe(false); expect(sim.diff).toBe(-10000); expect(ov.issues.join()).toContain('总伤差')
  })
  it('总伤高于上限 → simDamage !ok、diff 为正（超限）', () => {
    const ov = squadOverview([os(15000), os(15000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.ok).toBe(false); expect(sim.diff).toBe(5000); expect(ov.issues.join()).toContain('总伤超')
  })
  it('主奶无槽 → mainHealBuff actual null、!ok、issues 缺主奶', () => {
    const ov = squadOverview([os(12000), os(10000), aux('太阳奶', 0)], target)
    const heal = ov.dims.find(d => d.key === 'mainHealBuff')!
    expect(heal.actual).toBeNull(); expect(heal.ok).toBe(false); expect(ov.issues.join()).toContain('缺主奶')
  })
  it('缺太阳奶 → sunHealCount !ok、issues 缺太阳奶', () => {
    const ov = squadOverview([os(12000), os(10000), aux('主奶', 46000)], target)
    const sun = ov.dims.find(d => d.key === 'sunHealCount')!
    expect(sun.ok).toBe(false); expect(sun.actual).toBe(0); expect(ov.issues.join()).toContain('缺太阳奶')
  })
  it('双界：min+max 同时设时 dim 同时带 min/max（总伤须落在区间内才 ok）', () => {
    const ov = squadOverview([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.min).toBe(20000); expect(sim.max).toBe(25000)
    expect(sim.actual).toBe(22000); expect(sim.ok).toBe(true)   // 22000 ∈ [20000, 25000]
  })
  it('划水豁免（成员划水）→ slack、ok、issues 空', () => {
    const ov = squadOverview([os(100, '划水')], target)
    expect(ov.slack).toBe(true); expect(ov.ok).toBe(true); expect(ov.issues).toEqual([])
  })
  it('target.slack=true → 豁免', () => {
    const ov = squadOverview([os(5000), os(5000), aux('主奶', 40000)], { ...target, slack: true })
    expect(ov.slack).toBe(true); expect(ov.ok).toBe(true); expect(ov.issues).toEqual([])
  })
  it('统计字段 filled/total', () => {
    const ov = squadOverview([os(12000), os(10000), aux('主奶', 46000), aux('太阳奶', 0)], target)
    expect(ov.filled).toBe(4); expect(ov.total).toBe(4)
  })
  it('只设上限（simMax）且达标：diff 不为负（无下限不报超出量，避免 ✓(差N)）', () => {
    const ov = squadOverview([os(20000)], { outputs: { simMax: 25000 } })
    const sim = ov.dims.find(d => d.key === 'simDamage')!
    expect(sim.ok).toBe(true)
    expect(sim.diff).toBeNull()
  })
})

const c1: Character = { id: 1, name: '高伤', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '输出',
  fame: 1, simulated_damage: 30000, sustained_dps: 0, buff_amount: null, sun_buff: null,
  adventure_party_id: null, adventure_party_name: null }
const c2: Character = { id: 2, name: '低伤', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '输出',
  fame: 1, simulated_damage: 5000, sustained_dps: 0, buff_amount: null, sun_buff: null,
  adventure_party_id: null, adventure_party_name: null }
const healer: Character = { id: 3, name: '奶', job_name: 'a', job_title: 't', parent_name: 'p', class_type: '辅助',
  fame: 1, simulated_damage: null, sustained_dps: null, buff_amount: 46000, sun_buff: 0,
  adventure_party_id: null, adventure_party_name: null }

function wave(id: number, slots: Slot[]): Wave {
  return { id, index: id, group_id: null, round_index: 1, group_index: 1, slots }
}

// sqSlot：可指定 squad_index 与「是否已占」；空格 → character_id null
const sqSlot = (sq: number, filled: boolean, sim: number | null = null, duty: string | null = '主C'): Slot =>
  ({ id: 0, squad_index: sq, row_index: 0, character_id: filled ? 1 : null,
     character_name: filled ? 'x' : null, character_class: filled ? '输出' : null,
     job_name: null, job_title: null, fame: null, simulated_damage: sim, sustained_dps: null,
     buff_amount: null, sun_buff: null, owner_id: null, owner_nickname: null, owner_avatar: null,
     duty: filled ? duty as Duty : null, version: 1, adventure_party_id: null, adventure_party_name: null })

describe('sortByPower', () => {
  it('输出按模拟伤害降序（null 排最后）', () => {
    const n: Character = { ...c1, id: 3, simulated_damage: null, sustained_dps: null }
    expect(sortByPower([c2, n, c1]).map(x => x.id)).toEqual([1, 2, 3])
  })
})

describe('recommendFillers 队→候选推荐（新引擎）', () => {
  const tOut = { 0: { outputs: { count: 2, simMin: 20000 } } }
  const tHeal = { 0: { mainHeal: { buffMin: 45000 } } }
  const tSun = { 0: { outputs: { count: 2 }, sunHeal: { count: 1 } } }
  // 缺输出的队（1 已占输出 + 2 空格）
  const needyWave = (id: number) => wave(id, [sqSlot(0, true, 5000, '主C'), sqSlot(0, false), sqSlot(0, false)])
  const wave2 = (id: number, groupIndex: number): Wave =>
    ({ id, index: id, group_id: groupIndex, round_index: 1, group_index: groupIndex,
       slots: [sqSlot(0, true, 5000, '主C'), sqSlot(0, false), sqSlot(0, false)] })

  it('P5 无模板 → 空建议', () => {
    expect(recommendFillers({ candidates: [c1, healer], groups: [needyWave(10)], targets: {} })).toEqual([])
  })
  it('P1 满员队不进推荐（未达标但有空格才推）', () => {
    // 红队(wave10) 4/4 满、总伤 4000 不足 → 跳过；蓝队(wave20) 有空格 → 推
    const g = [wave(10, [sqSlot(0, true, 1000, '主C'), sqSlot(0, true, 1000, '主C'),
                         sqSlot(0, true, 1000, '主C'), sqSlot(0, true, 1000, '主C')]),
              wave(20, [sqSlot(0, true, 5000, '主C'), sqSlot(0, false), sqSlot(0, false)])]
    const r = recommendFillers({ candidates: [c1], groups: g, targets: tOut })
    expect(r.length).toBe(1)
    expect(r[0].waveId).toBe(20) // 只推蓝队
  })
  it('P2 主奶已达标、纯缺输出的队：只推荐输出，不推荐辅助', () => {
    // 队已有主奶 46000(达标) + 1 输出 + 空格；辅助候选不该被吸过去
    const g = [wave(10, [aux('主奶', 46000), sqSlot(0, true, 5000, '主C'), sqSlot(0, false), sqSlot(0, false)])]
    const r = recommendFillers({ candidates: [c1, healer], groups: g, targets: tOut })
    expect(r.length).toBe(1)
    expect(r[0].character.id).toBe(c1.id) // 输出
  })
  it('缺主奶的队：推荐辅助', () => {
    const g = [needyWave(10)]
    const r = recommendFillers({ candidates: [c1, healer], groups: g, targets: tHeal })
    expect(r.length).toBe(1)
    expect(r[0].character.id).toBe(healer.id)
  })
  it('P3 跨队去重：两个缺人队各拿一条建议、角色不重复', () => {
    const g = [needyWave(10), needyWave(20)]
    const r = recommendFillers({ candidates: [c1, c2], groups: g, targets: tOut })
    expect(r.length).toBe(2)
    expect(new Set(r.map(x => x.character.id)).size).toBe(2)
    expect(new Set(r.map(x => x.waveId)).size).toBe(2)
  })
  it('P3 同一角色只落一条（缺口更大的队优先占用）', () => {
    // wave10 有 1 输出(gap2：缺1输出+总伤差)；wave20 全空(gap3：缺2输出+总伤差)；只有一个候选 c1
    const g = [wave(10, [sqSlot(0, true, 5000, '主C'), sqSlot(0, false)]),
              wave(20, [sqSlot(0, false), sqSlot(0, false), sqSlot(0, false), sqSlot(0, false)])]
    const r = recommendFillers({ candidates: [c1], groups: g, targets: tOut })
    expect(r.length).toBe(1)
    expect(r[0].waveId).toBe(20) // 缺口更大的队
  })
  it('P4 并行团：建议带 roundIndex/groupIndex（角标可区分）', () => {
    const g = [wave2(10, 1), wave2(20, 2)]
    const r = recommendFillers({ candidates: [c1, c2], groups: g, targets: tOut })
    expect(r.length).toBe(2)
    const g1 = r.find(x => x.groupIndex === 1)!; const g2 = r.find(x => x.groupIndex === 2)!
    expect(g1.waveId).toBe(10); expect(g1.roundIndex).toBe(1); expect(g1.groupIndex).toBe(1)
    expect(g2.waveId).toBe(20); expect(g2.groupIndex).toBe(2)
  })
  it('混合需求（缺输出+缺太阳奶）：按优先级表推荐输出（输出数 < 目标 优先于 缺太阳奶）', () => {
    const g = [needyWave(10)]
    const r = recommendFillers({ candidates: [c1, healer], groups: g, targets: tSun })
    expect(r.length).toBe(1)
    expect(r[0].character.id).toBe(c1.id) // 输出
  })
  it('排序：gap 降序（缺口更大的队优先被推）', () => {
    const g = [wave(10, [sqSlot(0, true, 5000, '主C'), sqSlot(0, false)]),   // gap2
              wave(20, [sqSlot(0, false), sqSlot(0, false), sqSlot(0, false), sqSlot(0, false)])] // gap3
    const r = recommendFillers({ candidates: [c1, c2], groups: g, targets: tOut })
    expect(r[0].waveId).toBe(20) // 全空队 gap 更大 → 排最前
  })
  it('总伤超上限（simMax）：无角色能改善 → 跳过该队（即使有空格）', () => {
    const g = [wave(10, [sqSlot(0, true, 30000, '主C'), sqSlot(0, true, 30000, '主C'), sqSlot(0, false)])]
    const t = { 0: { outputs: { count: 2, simMin: 20000, simMax: 50000 } } }
    const r = recommendFillers({ candidates: [c1], groups: g, targets: t })
    expect(r).toEqual([]) // 输出数已够、总伤 60000 > 50000，塞谁都超 → recommendType 返回 null 跳过
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

// 占位映射测试用的 slot：character_id != null 即视为已占位
function pslot(id: number, charId: number | null, opts: Partial<Slot> = {}): Slot {
  return { id, squad_index: 0, row_index: 0, character_id: charId,
    character_name: charId != null ? 'x' : null, character_class: null, job_name: null, job_title: null,
    fame: null, simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
    owner_id: charId != null ? 1 : null, owner_nickname: null, owner_avatar: null, duty: null, version: 1,
    adventure_party_id: null, adventure_party_name: null, ...opts }
}

describe('placementByChar', () => {
  it('空格（character_id null）不映射', () => {
    const waves: Wave[] = [{ id: 1, index: 1, group_id: null, round_index: 1, group_index: 1,
      slots: [pslot(1, null)] }]
    expect(placementByChar(waves).size).toBe(0)
  })
  it('单波占位：正确映射 roundIndex/squadIndex/duty/userId', () => {
    const waves: Wave[] = [{ id: 1, index: 1, group_id: null, round_index: 2, group_index: 1,
      slots: [pslot(1, 10, { squad_index: 0, duty: '主C', owner_id: 9 })] }]
    const m = placementByChar(waves)
    expect(m.get(10)).toEqual({ roundIndex: 2, groupId: null, groupIndex: 1, squadIndex: 0,
      duty: '主C', userId: 9 })
  })
  it('并行团：映射 groupId/groupIndex', () => {
    const waves: Wave[] = [{ id: 1, index: 1, group_id: 5, round_index: 1, group_index: 2,
      slots: [pslot(1, 10, { squad_index: 3, duty: '太阳奶', owner_id: 9 })] }]
    const m = placementByChar(waves)
    expect(m.get(10)!.groupId).toBe(5)
    expect(m.get(10)!.groupIndex).toBe(2)
    expect(m.get(10)!.squadIndex).toBe(3)
  })
  it('多角色多波各自映射', () => {
    const waves: Wave[] = [
      { id: 1, index: 1, group_id: null, round_index: 1, group_index: 1,
        slots: [pslot(1, 10, { duty: '主C' }), pslot(2, 11, { squad_index: 1, duty: '主奶' })] },
      { id: 2, index: 2, group_id: null, round_index: 2, group_index: 1,
        slots: [pslot(3, 12, { duty: '辅C' })] },
    ]
    const m = placementByChar(waves)
    expect(m.size).toBe(3)
    expect(m.get(11)!.roundIndex).toBe(1)
    expect(m.get(12)!.roundIndex).toBe(2)
  })
  it('空 waves → 空 Map', () => {
    expect(placementByChar([]).size).toBe(0)
  })
})
