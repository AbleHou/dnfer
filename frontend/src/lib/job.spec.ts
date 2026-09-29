import { describe, it, expect } from 'vitest'
import { jobIcon, categoryIcon, ICON_FALLBACK, jobGenderTitle } from './job'

describe('job icon helpers', () => {
  it('builds child and category icon urls', () => {
    expect(jobIcon('weapon_master')).toBe('/images/jobs/weapon_master.png')
    expect(categoryIcon('swordman_male')).toBe('/images/sub/swordman_male.png')
  })
  it('exposes a fallback placeholder', () => {
    expect(ICON_FALLBACK).toBe('/images/jobs/empty.png')
  })
})

describe('jobGenderTitle', () => {
  it('男女双版职业追加性别后缀', () => {
    expect(jobGenderTitle('ranger_female', '重霄·漫游枪手')).toBe('重霄·漫游枪手（女）')
    expect(jobGenderTitle('crusader_male', '光启·光明骑士')).toBe('光启·光明骑士（男）')
  })
  it('男版无 _male 后缀的职业（蓝拳圣使）也能识别', () => {
    expect(jobGenderTitle('infighter', '光启·蓝拳圣使')).toBe('光启·蓝拳圣使（男）')
    expect(jobGenderTitle('infighter_female', '光启·蓝拳圣使')).toBe('光启·蓝拳圣使（女）')
  })
  it('单性别职业不加后缀', () => {
    expect(jobGenderTitle('weapon_master', '极诣·剑魂')).toBe('极诣·剑魂')
    expect(jobGenderTitle('sword_master', '极诣·驭剑士')).toBe('极诣·驭剑士')
  })
  it('空/未知参数容错返回原 title', () => {
    expect(jobGenderTitle(null, 'x')).toBe('x')
    expect(jobGenderTitle(undefined, 'x')).toBe('x')
    expect(jobGenderTitle('unknown_job', 'x')).toBe('x')
    expect(jobGenderTitle('weapon_master', null)).toBe('')
  })
  it('覆盖全部 10 对男女双版职业（20 个 job_name）', () => {
    const pairs: Array<[string, '男' | '女']> = [
      ['ranger_male', '男'], ['ranger_female', '女'],
      ['launcher_male', '男'], ['launcher_female', '女'],
      ['mechanic_male', '男'], ['mechanic_female', '女'],
      ['spitfire_male', '男'], ['spitfire_female', '女'],
      ['crusader_male', '男'], ['crusader_female', '女'],
      ['infighter', '男'], ['infighter_female', '女'],
      ['nenmaster_male', '男'], ['nenmaster_female', '女'],
      ['striker_male', '男'], ['striker_female', '女'],
      ['brawler_male', '男'], ['brawler_female', '女'],
      ['grappler_male', '男'], ['grappler_female', '女'],
    ]
    for (const [jobName, g] of pairs) {
      expect(jobGenderTitle(jobName, '职业名')).toBe(`职业名（${g}）`)
    }
  })
})
