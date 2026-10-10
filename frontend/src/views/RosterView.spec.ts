// frontend/src/views/RosterView.spec.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import RosterView from './RosterView.vue'
import { useAuthStore } from '../stores/auth'
import { useRaidStore } from '../stores/raid'
import { confirmDialog } from '../lib/notify'
import type { Character, Raid, Slot, User } from '../types'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  notifyMock: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(), clearToken: vi.fn() }))
vi.mock('../api/ws', () => ({ connectRaidWs: vi.fn(() => () => {}) }))
vi.mock('../lib/notify', () => ({ confirmDialog: vi.fn(async () => true),
  notifyError: notifyMock.error, notifyWarning: notifyMock.warning, notifySuccess: notifyMock.success }))

const admin: User = { id: 9, username: 'a', nickname: '团长', is_admin: true, avatar: null, is_banned: false }
const member: User = { id: 3, username: 'm', nickname: '队员', is_admin: false, avatar: null, is_banned: false }
const outChar: Character = { id: 10, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: '鬼剑士', class_type: '输出', fame: 52000, simulated_damage: 12000,
  sustained_dps: 3000, buff_amount: null, sun_buff: null }
const healChar: Character = { id: 11, name: '奶', job_name: 'crusader_female', job_title: '神启·圣骑士',
  parent_name: '圣职者', class_type: '辅助', fame: 40000, simulated_damage: null,
  sustained_dps: null, buff_amount: 46000, sun_buff: 1000 }
const adminRow = { user: admin, created_at: null, characters: [] as Character[] }
const memberRow = { user: member, created_at: 'x', characters: [outChar, healChar] }

function mkSlot(id: number, sq = 0): Slot {
  return { id, squad_index: sq, row_index: 0, character_id: null, character_name: null,
    character_class: null, job_name: null, job_title: null, fame: null, simulated_damage: null,
    sustained_dps: null, buff_amount: null, sun_buff: null, owner_id: null, owner_nickname: null,
    owner_avatar: null, duty: null, version: 1 }
}
function occupiedSlot(): Slot {
  return { ...mkSlot(1), character_id: 10, character_name: '剑魂', character_class: '输出',
    job_name: 'weapon_master', job_title: '极诣·剑魂', simulated_damage: 12000, sustained_dps: 3000,
    owner_id: member.id, owner_nickname: '队员', duty: '主C', version: 2 }
}
function makeRaid(signups: Raid['signups'], filled?: Slot): Raid {
  return { id: 1, name: 'x', dungeon_id: 1, dungeon_name: '副本', starts_at: 'x',
    size: 8, locked: false, signups, slack_rules: { criteria: [], exchange: [] },
    waves: [{ id: 1, index: 1, group_id: null, round_index: 1, group_index: 1,
      slots: [filled ?? mkSlot(1), mkSlot(2), mkSlot(3), mkSlot(4)] }] }
}
function twoWaveRaid(signups: Raid['signups']): Raid {
  const r = makeRaid(signups)
  r.waves = [
    { id: 1, index: 1, group_id: null, round_index: 1, group_index: 1,
      slots: [mkSlot(1), mkSlot(2), mkSlot(3), mkSlot(4)] },
    { id: 2, index: 2, group_id: null, round_index: 2, group_index: 1,
      slots: [mkSlot(5), mkSlot(6), mkSlot(7), mkSlot(8)] },
  ]
  return r
}

async function mountView(signups: Raid['signups'], user: User = admin,
                         snapshot: Raid = makeRaid(signups)) {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore(); auth.user = user
  const store = useRaidStore(); store.raid = makeRaid(signups)
  apiMock.get.mockImplementation(async (url: string) => url === '/api/raids/1' ? snapshot : [])
  const router = createRouter({ history: createMemoryHistory(),
    routes: [{ path: '/raids/:id/roster', component: RosterView }] })
  await router.push('/raids/1/roster'); await router.isReady()
  return { wrapper: mount(RosterView, { global: { plugins: [pinia, router],
    stubs: { 'router-link': true, 'router-view': true, DutySelect: true, UserAvatar: true,
      RosterTargetModal: true, teleport: true } } }), auth, store }
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('RosterView', () => {
  it('渲染角色池与网格', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="roster-pool"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="roster-grid"]').exists()).toBe(true)
  })

  it('非管理员只读：无推荐开关，点角色不进入拿起态', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], member)
    await flushPromises()
    expect(wrapper.find('[data-test="recommend-switch"]').exists()).toBe(false)
    await wrapper.find('[data-act="pool-char-11"]').trigger('click')
    expect(wrapper.find('.move-hint').exists()).toBe(false)
  })

  it('拿起→点空格：fill 带 replace:true，职责按状态推断（辅助且队无主奶 → 主奶）', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    await wrapper.find('[data-act="pool-char-11"]').trigger('click')  // 拿起「奶」
    expect(wrapper.find('.move-hint').text()).toContain('奶')
    await wrapper.find('.roster-slot .pick-btn').trigger('click')     // 放入空位 1
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/slots/1/fill',
      { character_id: 11, duty: '主奶', replace: true })
    expect(wrapper.find('.move-hint').exists()).toBe(false)           // 放入后退出拿起态
  })

  it('拿起→点已占格：confirmDialog 确认后 fill 替换', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin,
      makeRaid([adminRow, memberRow], occupiedSlot()))
    await flushPromises()
    await wrapper.find('[data-act="pool-char-11"]').trigger('click')  // 拿起「奶」
    await wrapper.find('.roster-slot.occupied').trigger('click')      // 点已占格（剑魂 主C）
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/1/slots/1/fill',
      { character_id: 11, duty: '主奶', replace: true })             // 队有主C、无主奶 → 奶为主奶
  })

  it('撤下：api.del', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin,
      makeRaid([adminRow, memberRow], occupiedSlot()))
    await flushPromises()
    await wrapper.find('[data-act="roster-remove"]').trigger('click')
    expect(apiMock.del).toHaveBeenCalledWith('/api/raids/1/slots/1')
  })

  it('改职责：api.put', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin,
      makeRaid([adminRow, memberRow], occupiedSlot()))
    await flushPromises()
    wrapper.findComponent({ name: 'RosterGrid' }).vm.$emit('duty', occupiedSlot(), '辅C')
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/raids/1/slots/1/duty', { duty: '辅C' })
  })

  it('推荐开关：有模板时显示推荐角标，关闭后消失', async () => {
    localStorage.setItem('dnfer-roster-targets-1', JSON.stringify({ 0: { outputs: { count: 2 } } }))
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-act="pool-char-10"]').text()).toContain('推荐')  // 剑魂缺口>0
    wrapper.findComponent({ name: 'Switch' }).vm.$emit('update:value', false)
    await flushPromises()
    expect(localStorage.getItem('dnfer-roster-recommend')).toBe('0')
    expect(wrapper.find('[data-act="pool-char-10"]').text()).not.toContain('推荐')
  })

  it('未排状态条：本波/全局计数与展开列表', async () => {
    const { wrapper } = await mountView([adminRow, memberRow])
    await flushPromises()
    expect(wrapper.find('[data-test="unplaced-toggle"]').text()).toContain('本波未排 1')
    expect(wrapper.find('[data-test="unplaced-toggle"]').text()).toContain('全局未排 1')
    await wrapper.find('[data-test="unplaced-toggle"]').trigger('click')
    expect(wrapper.find('[data-test="unplaced-list"]').text()).toContain('队员')
  })

  it('波标签切换', async () => {
    const { wrapper } = await mountView([adminRow, memberRow], admin, twoWaveRaid([adminRow, memberRow]))
    await flushPromises()
    await wrapper.find('[data-test="wave-tab-2"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.roster-group-label').text()).toContain('第 2 波')
  })
})
