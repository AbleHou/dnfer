// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadCommunityIdHistory, rememberCommunityId } from './community-id-history'

beforeEach(() => {
  localStorage.clear()
})

describe('rememberCommunityId / loadCommunityIdHistory', () => {
  it('初次使用记住一个 ID', () => {
    const next = rememberCommunityId('329230843')
    expect(next).toEqual(['329230843'])
    expect(loadCommunityIdHistory()).toEqual(['329230843'])
  })

  it('去重：重复使用同一 ID 提前到最前且不重复', () => {
    rememberCommunityId('a')
    rememberCommunityId('b')
    const next = rememberCommunityId('a')
    expect(next).toEqual(['a', 'b'])
    expect(loadCommunityIdHistory()).toEqual(['a', 'b'])
  })

  it('最多缓存 3 个，超出时丢弃最旧', () => {
    rememberCommunityId('1')
    rememberCommunityId('2')
    rememberCommunityId('3')
    const next = rememberCommunityId('4')
    expect(next).toEqual(['4', '3', '2'])
    expect(loadCommunityIdHistory()).toEqual(['4', '3', '2'])
  })

  it('首尾空白 trim 后记录；空串忽略', () => {
    const next = rememberCommunityId('  329230843  ')
    expect(next).toEqual(['329230843'])
    expect(rememberCommunityId('   ')).toEqual(['329230843'])
  })

  it('localStorage 损坏时视为无历史且写入不影响已有逻辑', () => {
    localStorage.setItem('dnfer-community-id-history', 'not-json')
    expect(loadCommunityIdHistory()).toEqual([])
    const next = rememberCommunityId('a')
    expect(next).toEqual(['a'])
  })
})
