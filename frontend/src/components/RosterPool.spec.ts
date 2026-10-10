// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterPool from './RosterPool.vue'
import type { Character, RaidSignup, User } from '../types'

const u1: User = { id: 1, username: 'a', nickname: '甲', is_admin: false, avatar: null, is_banned: false }
const u2: User = { id: 2, username: 'b', nickname: '乙', is_admin: false, avatar: null, is_banned: false }
const c1: Character = { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂', parent_name: '鬼剑士',
  class_type: '输出', fame: 1, simulated_damage: 30000, sustained_dps: 0, buff_amount: null, sun_buff: null }
const c2: Character = { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士', parent_name: '圣职者',
  class_type: '辅助', fame: 1, simulated_damage: null, sustained_dps: null, buff_amount: 46000, sun_buff: 0 }
const c3: Character = { ...c1, id: 12, name: '划水剑', simulated_damage: 100 }
const c4: Character = { ...c1, id: 13, name: '弱剑', simulated_damage: 100 }
const signups: RaidSignup[] = [
  { user: u1, created_at: null, characters: [c1, c2] },
  { user: u2, created_at: 'x', characters: [c3] },
]

function mountPool(overrides: Record<string, unknown> = {}) {
  return mount(RosterPool, {
    props: {
      signups, blockedCharIds: new Set<number>(), slackCharIds: new Set<number>(),
      recommendTop3: new Set<number>(), recommendTarget: {}, holdingId: null, canEdit: true,
      ...overrides,
    },
    global: { stubs: { UserAvatar: true, teleport: true } },
  })
}

describe('RosterPool', () => {
  it('按用户分组显示', () => {
    const w = mountPool()
    expect(w.text()).toContain('甲'); expect(w.text()).toContain('乙')
    expect(w.text()).toContain('剑魂'); expect(w.text()).toContain('奶')
  })
  it('blocked 角色置灰且点击不 emit pick', async () => {
    const w = mountPool({ blockedCharIds: new Set([10]) })
    const card = w.find('[data-act="pool-char-10"]')
    expect(card.classes()).toContain('blocked')
    await card.trigger('click')
    expect(w.emitted('pick')).toBeFalsy()
  })
  it('可用角色点击 emit pick', async () => {
    const w = mountPool()
    await w.find('[data-act="pool-char-11"]').trigger('click')
    expect((w.emitted('pick')?.[0]?.[0] as Character).id).toBe(11)
  })
  it('划水角色标灰 + 划水角标', () => {
    const w = mountPool({ slackCharIds: new Set([12]) })
    expect(w.find('[data-act="pool-char-12"]').text()).toContain('划水')
    expect(w.find('[data-act="pool-char-12"]').classes()).toContain('slack')
  })
  it('推荐 top3 显示 推荐 角标 + 目标队色', () => {
    const w = mountPool({ recommendTop3: new Set([10]), recommendTarget: { 10: 0 } })
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('推荐')
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('红队')
  })
  it('推荐但无目标队：只显示 推荐 角标、不显示目标队名', () => {
    const w = mountPool({ recommendTop3: new Set([11]), recommendTarget: {} })
    expect(w.find('[data-act="pool-char-11"]').text()).toContain('推荐')
    expect(w.find('[data-act="pool-char-11"]').text()).not.toContain('→')
  })
  it('组内按战力降序：高战力角色排前', () => {
    const w = mountPool({ signups: [{ user: u1, created_at: null, characters: [c4, c1] }] })
    const charEls = w.find('.pool-user').findAll('.pool-char')
    expect(charEls[0].attributes('data-act')).toBe('pool-char-10')
    expect(charEls[1].attributes('data-act')).toBe('pool-char-13')
  })
  it('无角色报名被过滤：不渲染用户分组头', () => {
    const w = mountPool({ signups: [{ user: u1, created_at: null, characters: [] }] })
    expect(w.findAll('.pool-user').length).toBe(0)
    expect(w.text()).not.toContain('甲')
  })
  it('拿起角色高亮', () => {
    const w = mountPool({ holdingId: 10 })
    expect(w.find('[data-act="pool-char-10"]').classes()).toContain('holding')
  })
  it('非编辑态点击不 emit pick', async () => {
    const w = mountPool({ canEdit: false })
    await w.find('[data-act="pool-char-11"]').trigger('click')
    expect(w.emitted('pick')).toBeFalsy()
  })
})
