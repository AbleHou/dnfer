// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import RaidDetailView from './RaidDetailView.vue'
import { useAuthStore } from '../stores/auth'
import { useRaidStore } from '../stores/raid'
import type { Raid } from '../types'

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
const adminRow = { user: admin, created_at: null }
const memberRow = { user: member, created_at: '2026-09-22T10:00:00' }

function makeRaid(signups: Raid['signups']): Raid {
  return {
    id: 1, name: 'x', dungeon_id: 1, dungeon_name: '副本', starts_at: '2026-09-20T14:00:00',
    size: 12, locked: false, signups,
    waves: [{ id: 1, index: 1, slots: [] }],
  }
}

async function mountView(signups: Raid['signups']) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = admin
  const store = useRaidStore()
  store.raid = makeRaid(signups)
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/raids/1') return makeRaid(signups)
    return []
  })
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
        teleport: true,
      },
    },
  }), auth, store }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RaidDetailView signup panel', () => {
  it('团长固定行不显示取消报名按钮', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.text()).toContain('团长')
    expect(wrapper.text()).toContain('队员')
    // 团长行无取消按钮；普通报名者行有
    const rows = wrapper.findAll('div[style*="border: 1px solid var(--dnf-border)"]')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).not.toContain('取消报名')
    expect(rows[1].text()).toContain('取消报名')
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
          teleport: true,
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
})
