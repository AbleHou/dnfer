// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import RaidDetailView from './RaidDetailView.vue'
import SlackRulesModal from '../components/SlackRulesModal.vue'
import MemberCharactersModal from '../components/MemberCharactersModal.vue'
import CharacterPickerModal from '../components/CharacterPickerModal.vue'
import WaveSection from '../components/WaveSection.vue'
import { useAuthStore } from '../stores/auth'
import { useRaidStore } from '../stores/raid'
import type { Character, Raid, User } from '../types'
import { confirmDialog } from '../lib/notify'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  notifyMock: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}))
vi.mock('../api/ws', () => ({ connectRaidWs: vi.fn(() => () => {}) }))
vi.mock('../composables/useSlotMove', () => ({
  useSlotMove: vi.fn(() => ({
    movingSlot: null, pickUp: vi.fn(), cancel: vi.fn(), moveTo: vi.fn(async () => ({ warnings: [] })),
  })),
}))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true),
  notifyError: notifyMock.error,
  notifyWarning: notifyMock.warning,
  notifySuccess: notifyMock.success,
}))

const admin = { id: 9, username: 'a', nickname: '团长', is_admin: true, avatar: null, is_banned: false }
const member = { id: 3, username: 'm', nickname: '队员', is_admin: false, avatar: null, is_banned: false }
const memberChars: Character[] = [
  { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂', parent_name: '鬼剑士',
    class_type: '输出', fame: 52000, simulated_damage: 5, sustained_dps: 2,
    buff_amount: null, sun_buff: null },
  { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士', parent_name: '圣职者',
    class_type: '辅助', fame: 40000, simulated_damage: null, sustained_dps: null,
    buff_amount: 3000, sun_buff: 500 },
]
const adminRow = { user: admin, created_at: null, characters: [] as typeof memberChars }
const memberRow = { user: member, created_at: '2026-09-22T10:00:00', characters: memberChars }

function makeRaid(signups: Raid['signups']): Raid {
  return {
    id: 1, name: 'x', dungeon_id: 1, dungeon_name: '副本', starts_at: '2026-09-20T14:00:00',
    size: 12, locked: false, signups, slack_rules: { criteria: [], exchange: [] },
    waves: [{ id: 1, index: 1, slots: [] }],
  }
}

// 放了 id=10 占位格的 raid（供「占位/报名」计数断言）
function makeRaidWithPlacement(signups: Raid['signups']): Raid {
  const raid = makeRaid(signups)
  raid.waves = [{
    id: 1, index: 1,
    slots: [{
      id: 1, squad_index: 0, row_index: 0, character_id: 10, character_name: '剑魂',
      character_class: '输出', job_name: 'weapon_master', job_title: '极诣·剑魂',
      fame: 52000, simulated_damage: 5, sustained_dps: 2, buff_amount: null, sun_buff: null,
      owner_id: member.id, owner_nickname: '队员', owner_avatar: null, duty: '主C', version: 1,
    }],
  }]
  return raid
}

async function mountView(signups: Raid['signups'], user: User = admin,
                         snapshot: Raid = makeRaid(signups)) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = user
  const store = useRaidStore()
  store.raid = makeRaid(signups)
  apiMock.get.mockImplementation(async (url: string) => url === '/api/raids/1' ? snapshot : [])
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/raids/:id', component: RaidDetailView }],
  })
  await router.push('/raids/1')
  await router.isReady()
  return { wrapper: mount(RaidDetailView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        'router-link': true, 'router-view': true, WaveSection: true, CharacterPickerModal: true,
        SlotActionModal: true, UserAvatar: true, MemberCharactersModal: true, SignupMemberPicker: true,
        SignupModal: true, SlackRulesModal: true, teleport: true,
      },
    },
  }), auth, store }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RaidDetailView signup panel', () => {
  it('团长行无取消报名按钮，非团长行有', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.text()).toContain('团长')
    expect(wrapper.text()).toContain('队员')
    const leader = wrapper.find('.signup-leader')
    expect(leader.exists()).toBe(true)
    expect(leader.text()).not.toContain('取消报名')
    const group = wrapper.find('.signup-group')
    expect(group.exists()).toBe(true)
    expect(group.text()).toContain('取消报名')
  })
})

describe('RaidDetailView enhance', () => {
  it('管理员可见加号与修改按钮', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="signup-plus"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="edit-raid"]').exists()).toBe(true)
  })

  it('普通用户不可见加号与修改按钮', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = member
    const store = useRaidStore()
    store.raid = makeRaid([adminRow, memberRow])
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids/1') return makeRaid([adminRow, memberRow])
      return []
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/raids/:id', component: RaidDetailView }],
    })
    await router.push('/raids/1')
    await router.isReady()
    const wrapper = mount(RaidDetailView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          'router-link': true, 'router-view': true, WaveSection: true, CharacterPickerModal: true,
          SlotActionModal: true, UserAvatar: true, MemberCharactersModal: true, SignupMemberPicker: true,
          SignupModal: true, SlackRulesModal: true, teleport: true,
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-test="signup-plus"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="edit-raid"]').exists()).toBe(false)
  })

  it('点击加号打开帮成员报名弹窗', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    await wrapper.find('[data-test="signup-plus"]').trigger('click')
    await flushPromises()
    const picker = wrapper.findComponent({ name: 'SignupMemberPicker' })
    expect(picker.exists()).toBe(true)
    expect(picker.props('open')).toBe(true)
  })

  it('点击头像打开成员角色只读弹窗', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    // 第二个头像即普通报名者「队员」（首项为团长）
    await wrapper.findAll('.avatar-btn')[1].trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent({ name: 'MemberCharactersModal' })
    expect(modal.exists()).toBe(true)
    expect(modal.props('open')).toBe(true)
    expect(modal.props('user').id).toBe(memberRow.user.id)
  })

  it('修改名字保存后 PUT 并刷新', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    await wrapper.find('[data-test="edit-raid"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="edit-name"] input').setValue('新名字')
    await wrapper.find('[data-test="save-raid"]').trigger('click')
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/raids/1', { name: '新名字', starts_at: '2026-09-20T14:00:00' })
  })

  it('未报名用户可见报名按钮，点击打开 SignupModal（signup 模式）', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { id: 99, username: 'newbie', nickname: '新人', is_admin: false, avatar: null, is_banned: false }
    const store = useRaidStore()
    store.raid = makeRaid([adminRow, memberRow])
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids/1') return makeRaid([adminRow, memberRow])
      return []
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/raids/:id', component: RaidDetailView }],
    })
    await router.push('/raids/1')
    await router.isReady()
    const wrapper = mount(RaidDetailView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          'router-link': true, 'router-view': true, WaveSection: true, CharacterPickerModal: true,
          SlotActionModal: true, UserAvatar: true, MemberCharactersModal: true, SignupMemberPicker: true,
          SignupModal: true, SlackRulesModal: true, teleport: true,
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-test="signup"]').exists()).toBe(true)
    await wrapper.find('[data-test="signup"]').trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent({ name: 'SignupModal' })
    expect(modal.exists()).toBe(true)
    expect(modal.props('mode')).toBe('signup')
  })

  it('本人（member）行显示占位/报名计数与角色变更按钮，点击打开 manage 弹窗', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], member,
      makeRaidWithPlacement([adminRow, memberRow]))
    await flushPromises()
    const group = wrapper.find('.signup-group')
    expect(group.text()).toContain('1/2')      // 占位 1 / 报名 2
    const btn = wrapper.find('[data-act="manage-chars"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent({ name: 'SignupModal' })
    expect(modal.exists()).toBe(true)
    expect(modal.props('mode')).toBe('manage')
    expect(modal.props('selectedIds')).toEqual([10, 11])
  })

  it('本人取消报名需确认，确认后 DELETE', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], member)
    await flushPromises()
    vi.mocked(confirmDialog).mockResolvedValueOnce(true)
    await wrapper.find('.signup-group button.dnf-btn-danger').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/raids/1/signup')
  })

  it('本人取消报名：确认框取消则不请求', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], member)
    await flushPromises()
    vi.mocked(confirmDialog).mockResolvedValueOnce(false)
    await wrapper.find('.signup-group button.dnf-btn-danger').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.del).not.toHaveBeenCalled()
  })

  it('管理员行不显示角色变更按钮', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-act="manage-chars"]').exists()).toBe(false)
  })
})

describe('RaidDetailView slack rules', () => {
  it('仅管理员可见划水规则设置按钮', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="slack-rules"]').exists()).toBe(true)
    const { wrapper: w2 } = await mountView([adminRow, memberRow], member)
    await flushPromises()
    expect(w2.find('[data-test="slack-rules"]').exists()).toBe(false)
  })

  it('提交规则调用 PUT', async () => {
    apiMock.put.mockResolvedValue({})
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    await wrapper.find('[data-test="slack-rules"]').trigger('click')
    const modal = wrapper.findComponent(SlackRulesModal)
    const rules = { criteria: [{ class_type: '输出' as const, metric: 'fame' as const, value: 125000 }], exchange: [] }
    modal.vm.$emit('submit', rules)
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/raids/1/slack-rules', rules)
    expect(notifyMock.success).toHaveBeenCalled()
    expect(modal.props('open')).toBe(false)
  })

  it('灰色角色 id 传递到 WaveSection', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = {
      criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }],
      exchange: [{ class_type: '输出', metric: 'fame', value: 300000, count: 1 }],
    }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    const ws = wrapper.findComponent(WaveSection)
    expect((ws.props('slackCharIds') as Set<number>).has(10)).toBe(true)  // id10 fame 52000 划水且无兑换额度
  })

  it('灰色角色 id 传递到 MemberCharactersModal', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = {
      criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }],
      exchange: [{ class_type: '输出', metric: 'fame', value: 300000, count: 1 }],
    }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    await wrapper.find('.signup-user').trigger('click')   // 打开成员弹框
    await flushPromises()
    const modal = wrapper.findComponent(MemberCharactersModal)
    expect((modal.props('grayIds') as number[]).includes(10)).toBe(true)
  })
})

describe('RaidDetailView slack count & picker gray', () => {
  it('报名行显示划水总数（仅>0，团长行不显示）', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = { criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }], exchange: [] }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    // 成员：id10 输出 fame52000<200000 划水、id11 辅助不判 → 划水 1
    expect(wrapper.find('.signup-group').text()).toContain('划水 1')
    expect(wrapper.find('.signup-leader').text()).not.toContain('划水')
  })

  it('无规则时不显示划水', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('.signup-group').text()).not.toContain('划水')
  })

  it('grayByUser 传递到 CharacterPickerModal', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = { criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }], exchange: [] }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    const picker = wrapper.findComponent(CharacterPickerModal)
    expect((picker.props('grayByUser') as Record<number, number[]>)[3]).toContain(10) // member id3，灰色含 id10
  })

  it('slackCount 传递到 MemberCharactersModal', async () => {
    const raid = makeRaid([adminRow, memberRow])
    raid.slack_rules = { criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }], exchange: [] }
    const { wrapper } = await mountView([adminRow, memberRow], admin, raid)
    await flushPromises()
    await wrapper.find('.signup-user').trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(MemberCharactersModal)
    expect(modal.props('slackCount')).toBe(1)
  })

  it('团长弹框也显示其划水数', async () => {
    const leaderWithChars = {
      user: admin,
      created_at: null,
      characters: [{ id: 99, name: '团长输出', job_name: 'weapon_master', job_title: '极诣·剑魂',
        parent_name: '鬼剑士', class_type: '输出' as const, fame: 50000, simulated_damage: 5,
        sustained_dps: 2, buff_amount: null, sun_buff: null }],
    }
    const raid = makeRaid([leaderWithChars, memberRow])
    raid.slack_rules = { criteria: [{ class_type: '输出', metric: 'fame', value: 200000 }], exchange: [] }
    const { wrapper } = await mountView([leaderWithChars, memberRow], admin, raid)
    await flushPromises()
    await wrapper.find('.signup-leader .avatar-btn').trigger('click') // 打开团长弹框
    await flushPromises()
    const modal = wrapper.findComponent(MemberCharactersModal)
    expect(modal.props('slackCount')).toBe(1)
  })
})
