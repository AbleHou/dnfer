// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import RaidDetailView from './RaidDetailView.vue'
import { useAuthStore } from '../stores/auth'
import { useRaidStore } from '../stores/raid'
import type { Raid, User } from '../types'
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
const memberChars = [
  { id: 10, name: '剑魂', job_title: '极诣·剑魂', class_type: '输出' as const },
  { id: 11, name: '奶', job_title: '神启·圣骑士', class_type: '辅助' as const },
]
const adminRow = { user: admin, created_at: null, characters: [] as typeof memberChars }
const memberRow = { user: member, created_at: '2026-09-22T10:00:00', characters: memberChars }

function makeRaid(signups: Raid['signups']): Raid {
  return {
    id: 1, name: 'x', dungeon_id: 1, dungeon_name: '副本', starts_at: '2026-09-20T14:00:00',
    size: 12, locked: false, signups,
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
      fame: 52000, simulated_damage: 5, sustained_dps: 2, buff_amount: null,
      owner_id: member.id, owner_nickname: '队员', owner_avatar: null, duty: '主C', version: 1,
    }],
  }]
  return raid
}

async function mountView(signups: Raid['signups'], user: User = admin) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = user
  const store = useRaidStore()
  store.raid = makeRaid(signups)
  // 若测试已在 mountView 前预置 apiMock.get（如带占位格的快照），尊重之；否则装默认快照
  if (!apiMock.get.getMockImplementation()) {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/raids/1') return makeRaid(signups)
      return []
    })
  }
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
        SignupModal: true, teleport: true,
      },
    },
  }), auth, store }
}

beforeEach(() => {
  vi.clearAllMocks()
  // mockReset 会把实现重置为空函数（getMockImplementation 仍 truthy），无法用 getMockImplementation()
  // 判断「测试是否预置」；直接置 undefined，让 mountView 的守卫只在测试未预置 apiMock.get 时装默认快照
  apiMock.get.mockImplementation(undefined as never)
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
          SignupModal: true, teleport: true,
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
          SignupModal: true, teleport: true,
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
    const raid = makeRaidWithPlacement([adminRow, memberRow])
    apiMock.get.mockImplementation(async (url: string) => {   // 让 load() 拉到带占位格的快照，避免依赖微任务时序
      if (url === '/api/raids/1') return raid
      return []
    })
    const { wrapper } = await mountView([adminRow, memberRow], member)
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
