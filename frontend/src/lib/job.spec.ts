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
})
