import { describe, it, expect } from 'vitest'
import { jobIcon, categoryIcon, ICON_FALLBACK } from './job'

describe('job icon helpers', () => {
  it('builds child and category icon urls', () => {
    expect(jobIcon('weapon_master')).toBe('/images/jobs/weapon_master.png')
    expect(categoryIcon('swordman_male')).toBe('/images/sub/swordman_male.png')
  })
  it('exposes a fallback placeholder', () => {
    expect(ICON_FALLBACK).toBe('/images/jobs/empty.png')
  })
})
