import { describe, it, expect } from 'vitest'
import { avatarBackground, avatarFallbackChar } from './avatar'

describe('avatar', () => {
  it('哈希底色确定性', () => {
    expect(avatarBackground('剑魂无敌')).toBe(avatarBackground('剑魂无敌'))
  })
  it('首字符兜底', () => {
    expect(avatarFallbackChar('剑魂无敌')).toBe('剑')
    expect(avatarFallbackChar('  ')).toBe('?')
  })
})
