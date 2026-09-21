import { describe, it, expect } from 'vitest'
import { validateNickname } from './nickname'

describe('validateNickname', () => {
  it('合法昵称返回 null', () => {
    expect(validateNickname('剑魂无敌')).toBeNull()
    expect(validateNickname('Able233')).toBeNull()
    expect(validateNickname('a')).toBeNull()
  })
  it('非法字符返回错误文案', () => {
    expect(validateNickname('带空格 名')).not.toBeNull()
    expect(validateNickname('带@号')).not.toBeNull()
    expect(validateNickname('带-横线')).not.toBeNull()
  })
  it('空与超长返回错误文案', () => {
    expect(validateNickname('')).not.toBeNull()
    expect(validateNickname('x'.repeat(65))).not.toBeNull()
  })
})
