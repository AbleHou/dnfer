// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterPool from './RosterPool.vue'
import type { Character, RaidSignup, User } from '../types'

const u1: User = { id: 1, username: 'a', nickname: '甲', is_admin: false, avatar: null, is_banned: false, is_guest: false }
const u2: User = { id: 2, username: 'b', nickname: '乙', is_admin: false, avatar: null, is_banned: false, is_guest: false }
const c1: Character = { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂', parent_name: '鬼剑士',
  class_type: '输出', fame: 1, simulated_damage: 30000, sustained_dps: 0, buff_amount: null, sun_buff: null,
  adventure_party_id: 100, adventure_party_name: '甲团' }
const c2: Character = { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士', parent_name: '圣职者',
  class_type: '辅助', fame: 1, simulated_damage: null, sustained_dps: null, buff_amount: 46000, sun_buff: 0,
  adventure_party_id: 100, adventure_party_name: '甲团' }
const c3: Character = { ...c1, id: 12, name: '划水剑', simulated_damage: 100,
  adventure_party_id: 200, adventure_party_name: '乙团' }
const c4: Character = { ...c1, id: 13, name: '弱剑', simulated_damage: 100, adventure_party_id: 100, adventure_party_name: '甲团' }
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
  it('guest 用户在组头显示临时徽章', () => {
    const w = mountPool({ signups: [{ user: { ...u1, is_guest: true }, created_at: null, characters: [c1, c2] }] })
    expect(w.find('[data-user-id="1"]').text()).toContain('临时')
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
  it('点用户名头收起：该组角色不渲染，再点恢复', async () => {
    const w = mountPool()
    await w.find('[data-user-id="1"]').trigger('click')
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(false)
    expect(w.find('[data-act="pool-char-11"]').exists()).toBe(false)  // 甲 组两角色都收起
    await w.find('[data-user-id="1"]').trigger('click')
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(true)
  })
  it('收起/展开指示符：收起 ▸、展开 ▾', async () => {
    const w = mountPool()
    expect(w.find('[data-user-id="1"]').text()).toContain('▾')
    await w.find('[data-user-id="1"]').trigger('click')
    expect(w.find('[data-user-id="1"]').text()).toContain('▸')
  })
  it('全部收起后所有组角色不渲染，全部展开后恢复', async () => {
    const w = mountPool()
    await w.find('[data-act="pool-collapse-all"]').trigger('click')
    expect(w.findAll('.pool-char').length).toBe(0)
    await w.find('[data-act="pool-expand-all"]').trigger('click')
    expect(w.findAll('.pool-char').length).toBe(3)  // c1,c2,c3
  })
  it('搜索按昵称过滤：匹配组保留、不匹配整组隐藏', async () => {
    const w = mountPool()
    await w.find('[data-act="pool-search"]').setValue('甲')
    expect(w.findAll('[data-test="pool-user"]').length).toBe(1)
    expect(w.text()).toContain('剑魂')     // 甲 组角色在
    expect(w.text()).not.toContain('划水剑') // 乙(c3) 整组隐藏
    await w.find('[data-act="pool-search"]').setValue('不存在')
    expect(w.findAll('[data-test="pool-user"]').length).toBe(0)
  })
  it('搜索不改变折叠态：折叠组在搜索中仍收起', async () => {
    const w = mountPool()
    await w.find('[data-user-id="2"]').trigger('click')      // 收起 乙 组
    await w.find('[data-act="pool-search"]').setValue('乙')  // 搜索命中 乙 组
    expect(w.find('[data-act="pool-char-12"]').exists()).toBe(false)  // 仍收起
    expect(w.find('[data-user-id="2"]').text()).toContain('▸')
    await w.find('[data-act="pool-search"]').setValue('')    // 清空
    expect(w.find('[data-act="pool-char-12"]').exists()).toBe(false)  // 折叠态保留
    expect(w.findAll('[data-test="pool-user"]').length).toBe(2)
  })
  it('用户组下按冒险团分小节，小节头显示团名与角色数', () => {
    const w = mountPool()
    const user1 = w.find('[data-test="pool-user"]')
    expect(user1.text()).toContain('甲团')
    expect(w.find('[data-party-id="100"]').text()).toContain('甲团')
    expect(w.findAll('[data-test="pool-party"]').length).toBe(2)  // 甲团(用户1) + 乙团(用户2)
  })
  it('团小节可折叠：收起后该团角色不渲染', async () => {
    const w = mountPool()
    await w.find('[data-party-id="100"]').trigger('click')
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(false)
    expect(w.find('[data-act="pool-char-11"]').exists()).toBe(false)
    expect(w.find('[data-act="pool-char-12"]').exists()).toBe(true)  // 乙团仍在
  })
  it('同用户多团：角色按团分开渲染', () => {
    const w = mountPool({ signups: [{ user: u1, created_at: null,
      characters: [c1, c2, { ...c1, id: 20, name: '小号', adventure_party_id: 300, adventure_party_name: '小号团' }] }] })
    expect(w.findAll('[data-test="pool-party"]').length).toBe(2)
  })
  it('无团角色归「未分组」小节，可折叠', async () => {
    const w = mountPool({ signups: [{ user: u1, created_at: null,
      characters: [{ ...c1, id: 30, name: '无团', adventure_party_id: null, adventure_party_name: null }] }] })
    const head = w.find('[data-party-id="__u"]')
    expect(head.exists()).toBe(true)
    expect(head.text()).toContain('未分组')
    expect(w.find('[data-act="pool-char-30"]').exists()).toBe(true)
    await head.trigger('click')
    expect(w.find('[data-act="pool-char-30"]').exists()).toBe(false)  // 收起
  })
  it('工具栏：展开/收起按钮为双箭头图标，搜索框带边框类', () => {
    const w = mountPool()
    expect(w.find('[data-act="pool-expand-all"]').text()).toContain('▾▾')
    expect(w.find('[data-act="pool-collapse-all"]').text()).toContain('▴▴')
    expect(w.find('[data-act="pool-search"]').classes()).toContain('dnf-input')
  })
})
