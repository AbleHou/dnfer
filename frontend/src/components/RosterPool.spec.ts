// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RosterPool from './RosterPool.vue'
import type { Character, RaidSignup, User } from '../types'
import type { CharPlacement } from '../lib/roster'

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
      recommend: {}, holdingId: null, canEdit: true,
      roundUserPos: new Map<number, CharPlacement>(), charPlacement: new Map<number, CharPlacement>(),
      currentRound: 0,
      ...overrides,
    },
    global: { stubs: { UserAvatar: true, teleport: true } },
  })
}

// 默认全部用户组收起；需要断言角色/团小节时先全部展开
type PoolWrapper = ReturnType<typeof mountPool>
async function expandAll(w: PoolWrapper) {
  await w.find('[data-act="pool-expand-all"]').trigger('click')
}

describe('RosterPool', () => {
  it('按用户分组显示', async () => {
    const w = mountPool()
    await expandAll(w)
    expect(w.text()).toContain('甲'); expect(w.text()).toContain('乙')
    expect(w.text()).toContain('剑魂'); expect(w.text()).toContain('奶')
  })
  it('默认全部用户组收起：角色不渲染、用户头仍在', () => {
    const w = mountPool()
    expect(w.findAll('.pool-char').length).toBe(0)
    expect(w.findAll('[data-test="pool-user"]').length).toBe(2)
    expect(w.find('[data-user-id="1"]').text()).toContain('▸')
  })
  it('guest 用户在组头显示临时徽章', () => {
    const w = mountPool({ signups: [{ user: { ...u1, is_guest: true }, created_at: null, characters: [c1, c2] }] })
    expect(w.find('[data-user-id="1"]').text()).toContain('临时')
  })
  it('blocked 角色置灰且点击不 emit pick', async () => {
    const w = mountPool({ blockedCharIds: new Set([10]) })
    await expandAll(w)
    const card = w.find('[data-act="pool-char-10"]')
    expect(card.classes()).toContain('blocked')
    await card.trigger('click')
    expect(w.emitted('pick')).toBeFalsy()
  })
  it('可用角色点击 emit pick', async () => {
    const w = mountPool()
    await expandAll(w)
    await w.find('[data-act="pool-char-11"]').trigger('click')
    expect((w.emitted('pick')?.[0]?.[0] as Character).id).toBe(11)
  })
  it('划水角色标灰 + 划水角标', async () => {
    const w = mountPool({ slackCharIds: new Set([12]) })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-12"]').text()).toContain('划水')
    expect(w.find('[data-act="pool-char-12"]').classes()).toContain('slack')
  })
  it('推荐角标：单波显示 推荐→红队', async () => {
    const w = mountPool({ recommend: { 10: { roundIndex: 1, groupIndex: null, squadIndex: 0 } } })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('推荐→红队')
  })
  it('推荐角标：并行团带团号', async () => {
    const w = mountPool({ recommend: { 10: { roundIndex: 1, groupIndex: 2, squadIndex: 0 } } })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('推荐→第 1 波 2 团红队')
  })
  it('无建议角色不打推荐标', async () => {
    const w = mountPool({ recommend: {} })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-10"]').text()).not.toContain('推荐')
  })
  it('组内按战力降序：高战力角色排前', async () => {
    const w = mountPool({ signups: [{ user: u1, created_at: null, characters: [c4, c1] }] })
    await expandAll(w)
    const charEls = w.find('.pool-user').findAll('.pool-char')
    expect(charEls[0].attributes('data-act')).toBe('pool-char-10')
    expect(charEls[1].attributes('data-act')).toBe('pool-char-13')
  })
  it('无角色报名被过滤：不渲染用户分组头', () => {
    const w = mountPool({ signups: [{ user: u1, created_at: null, characters: [] }] })
    expect(w.findAll('.pool-user').length).toBe(0)
    expect(w.text()).not.toContain('甲')
  })
  it('拿起角色高亮', async () => {
    const w = mountPool({ holdingId: 10 })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-10"]').classes()).toContain('holding')
  })
  it('非编辑态点击不 emit pick', async () => {
    const w = mountPool({ canEdit: false })
    await expandAll(w)
    await w.find('[data-act="pool-char-11"]').trigger('click')
    expect(w.emitted('pick')).toBeFalsy()
  })
  it('点用户名头展开：默认收起，点击后角色渲染，再点收起', async () => {
    const w = mountPool()
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(false)  // 默认收起
    await w.find('[data-user-id="1"]').trigger('click')
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(true)
    expect(w.find('[data-act="pool-char-11"]').exists()).toBe(true)  // 甲 组两角色都渲染
    await w.find('[data-user-id="1"]').trigger('click')
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(false)
  })
  it('收起/展开指示符：默认收起 ▸、点击展开 ▾', async () => {
    const w = mountPool()
    expect(w.find('[data-user-id="1"]').text()).toContain('▸')
    await w.find('[data-user-id="1"]').trigger('click')
    expect(w.find('[data-user-id="1"]').text()).toContain('▾')
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
    await expandAll(w)
    await w.find('[data-act="pool-search"]').setValue('甲')
    expect(w.findAll('[data-test="pool-user"]').length).toBe(1)
    expect(w.text()).toContain('剑魂')     // 甲 组角色在
    expect(w.text()).not.toContain('划水剑') // 乙(c3) 整组隐藏
    await w.find('[data-act="pool-search"]').setValue('不存在')
    expect(w.findAll('[data-test="pool-user"]').length).toBe(0)
  })
  it('搜索不改变折叠态：默认折叠组在搜索中仍收起', async () => {
    const w = mountPool()
    await w.find('[data-act="pool-search"]').setValue('乙')  // 搜索命中 乙 组（默认收起）
    expect(w.find('[data-act="pool-char-12"]').exists()).toBe(false)  // 仍收起
    expect(w.find('[data-user-id="2"]').text()).toContain('▸')
    await w.find('[data-act="pool-search"]').setValue('')    // 清空
    expect(w.find('[data-act="pool-char-12"]').exists()).toBe(false)  // 折叠态保留
    expect(w.findAll('[data-test="pool-user"]').length).toBe(2)
  })
  it('用户组下按冒险团分小节，小节头显示团名与角色数', async () => {
    const w = mountPool()
    await expandAll(w)
    const user1 = w.find('[data-test="pool-user"]')
    expect(user1.text()).toContain('甲团')
    expect(w.find('[data-party-id="100"]').text()).toContain('甲团')
    expect(w.findAll('[data-test="pool-party"]').length).toBe(2)  // 甲团(用户1) + 乙团(用户2)
  })
  it('团小节可折叠：收起后该团角色不渲染', async () => {
    const w = mountPool()
    await expandAll(w)
    await w.find('[data-party-id="100"]').trigger('click')
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(false)
    expect(w.find('[data-act="pool-char-11"]').exists()).toBe(false)
    expect(w.find('[data-act="pool-char-12"]').exists()).toBe(true)  // 乙团仍在
  })
  it('同用户多团：角色按团分开渲染', async () => {
    const w = mountPool({ signups: [{ user: u1, created_at: null,
      characters: [c1, c2, { ...c1, id: 20, name: '小号', adventure_party_id: 300, adventure_party_name: '小号团' }] }] })
    await expandAll(w)
    expect(w.findAll('[data-test="pool-party"]').length).toBe(2)
  })
  it('无团角色归「未分组」小节，可折叠', async () => {
    const w = mountPool({ signups: [{ user: u1, created_at: null,
      characters: [{ ...c1, id: 30, name: '无团', adventure_party_id: null, adventure_party_name: null }] }] })
    await expandAll(w)
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

function pos(cid: number, opts: Partial<CharPlacement> = {}): CharPlacement {
  return { roundIndex: 1, groupId: null, groupIndex: 1, squadIndex: 0, duty: '主C', userId: 1, ...opts }
}

describe('用户头职责胶囊', () => {
  it('当前波已排：显示 队伍名+职责', () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10)]]) })
    const head = w.find('[data-user-id="1"]')
    expect(head.text()).toContain('红队')
    expect(head.text()).toContain('主C')
  })
  it('默认收起时用户头仍显示职责胶囊（一览分配位置）', () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10)]]) })
    expect(w.findAll('.pool-char').length).toBe(0)   // 组仍收起
    expect(w.find('[data-user-id="1"] .pos-capsule').exists()).toBe(true)
    expect(w.find('[data-user-id="1"]').text()).toContain('红队')
  })
  it('当前波未排：不显示胶囊', () => {
    const w = mountPool()
    expect(w.find('[data-user-id="1"] .pos-capsule').exists()).toBe(false)
  })
  it('并行团：胶囊带团号前缀', () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10, { groupId: 5, groupIndex: 2, duty: '太阳奶' })]]) })
    // 注意：胶囊内各 span 之间的空白会被 Vue 压缩，故分段断言，勿用带空格的整串
    expect(w.find('[data-user-id="1"]').text()).toContain('2团')
    expect(w.find('[data-user-id="1"]').text()).toContain('红队')
    expect(w.find('[data-user-id="1"]').text()).toContain('太阳奶')
  })
  it('职责 tag class 映射：太阳奶 → pos-duty-sunheal', () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10, { duty: '太阳奶' })]]) })
    expect(w.find('[data-user-id="1"] .pos-duty-sunheal').text()).toBe('太阳奶')
  })
  it('点胶囊不触发用户组折叠', async () => {
    const w = mountPool({ roundUserPos: new Map([[1, pos(10)]]) })
    await expandAll(w)
    await w.find('.pos-capsule').trigger('click')
    expect(w.find('[data-act="pool-char-10"]').exists()).toBe(true)  // 组未收起
  })
})

describe('角色行波次标签', () => {
  it('已占位角色显示 第N波', async () => {
    const w = mountPool({ charPlacement: new Map([[10, pos(10)]]) })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('第1波')
  })
  it('并行团：显示 第N波M团', async () => {
    const w = mountPool({ charPlacement: new Map([[10, pos(10, { groupId: 5, groupIndex: 2, roundIndex: 3 })]]) })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-10"]').text()).toContain('第3波2团')
  })
  it('未占位角色不显示波次标签', async () => {
    const w = mountPool()
    await expandAll(w)
    expect(w.find('.wave-tag').exists()).toBe(false)
  })
  it('当前选中波高亮 .current', async () => {
    const w = mountPool({ charPlacement: new Map([[10, pos(10, { roundIndex: 2 })]]) , currentRound: 2 })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-10"] .wave-tag').classes()).toContain('current')
  })
  it('非当前波不高亮', async () => {
    const w = mountPool({ charPlacement: new Map([[10, pos(10, { roundIndex: 1 })]]) , currentRound: 2 })
    await expandAll(w)
    expect(w.find('[data-act="pool-char-10"] .wave-tag').classes()).not.toContain('current')
  })
})
