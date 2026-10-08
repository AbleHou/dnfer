// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CharacterPickerModal from './CharacterPickerModal.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 9, username: 'admin', nickname: '群主', is_admin: true } }),
}))

beforeEach(() => vi.clearAllMocks())

const playerA = { user: { id: 1, username: 'hong', nickname: '小红', is_admin: false },
  characters: [{ id: 11, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 52000, simulated_damage: 5, sustained_dps: 2, buff_amount: null, sun_buff: null }] }
const mine = { user: { id: 9, username: 'admin', nickname: '群主', is_admin: true },
  characters: [{ id: 12, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
    parent_name: 'priest_male', class_type: '辅助', fame: 1, simulated_damage: null, sustained_dps: null, buff_amount: 9000, sun_buff: null }] }

describe('CharacterPickerModal admin mode', () => {
  it('管理员模式拉全玩家角色，默认选中管理员自己', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9] },
      global: { stubs: { teleport: true } }, // NModal teleports to body; stub renders content inline
    })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/admin/characters')
    // 默认选中管理员自己的角色「奶」
    expect(wrapper.text()).toContain('奶')
    expect(wrapper.text()).toContain('神启·圣骑士')
    expect(wrapper.text()).not.toContain('剑魂')
  })

  it('切换玩家后列出该玩家角色', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9] },
      global: { stubs: { teleport: true } }, // NModal teleports to body; stub renders content inline
    })
    await flushPromises()
    // 沿用仓库既有模式（RaidListView.spec.ts）：通过 Select 组件实例 $emit update:value
    await wrapper.findComponent({ name: 'Select' }).vm.$emit('update:value', playerA.user.id)
    await flushPromises()
    expect(wrapper.text()).toContain('剑魂')
    expect(wrapper.text()).toContain('极诣·剑魂')
  })

  it('filters out players not in signupUserIds', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [9] },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    // 只有团长（id 9）在列；小红（id 1）被过滤
    expect(wrapper.text()).toContain('奶')
    expect(wrapper.text()).not.toContain('剑魂')
  })
})

describe('CharacterPickerModal placed badge', () => {
  it('渲染已占位角色的角标', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9],
               placed: { 12: { wave_index: 2, squad_index: 1, duty: '主奶' } } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    // 默认选中管理员自己，角色「奶」id=12 已占位 → 有角标（SQUAD_NAMES[1] === '黄队'）
    expect(wrapper.text()).toContain('已占位 · 第2波 · 黄队')
  })

  it('未占位角色无角标', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9], placed: {} },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('已占位')
  })
})

describe('CharacterPickerModal signupCharsByUser', () => {
  const playerB = {
    user: { id: 2, username: 'li', nickname: '小李', is_admin: false },
    characters: [
      { id: 11, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
        parent_name: 'swordman_male', class_type: '输出', fame: 52000, simulated_damage: 5,
        sustained_dps: 2, buff_amount: null, sun_buff: null },
      { id: 21, name: '奶2', job_name: 'crusader_male', job_title: '神启·圣骑士',
        parent_name: 'priest_male', class_type: '辅助', fame: 1, simulated_damage: null,
        sustained_dps: null, buff_amount: 9000, sun_buff: null },
    ],
  }

  it('成员仅显示已勾选角色（团长无映射则全显）', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerB]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [2],
               signupCharsByUser: { 2: [21] } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    await wrapper.findComponent({ name: 'Select' }).vm.$emit('update:value', playerB.user.id)
    await flushPromises()
    expect(wrapper.text()).toContain('奶2')
    expect(wrapper.text()).not.toContain('剑魂')
  })
})

describe('CharacterPickerModal grayByUser', () => {
  function setup(grayByUser: Record<number, number[]>) {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/admin/characters') return [playerA, mine]
      return []
    })
    return mount(CharacterPickerModal, {
      props: { open: true, adminMode: true, signupUserIds: [1, 9], grayByUser },
      global: { stubs: { teleport: true } },
    })
  }

  it('默认玩家（管理员）的灰色角色灰显', async () => {
    const wrapper = setup({ 9: [12] })
    await flushPromises()
    // 默认选管理员自己的「奶」id=12 → 灰显
    const grayed = wrapper.find('.char-pick.grayed')
    expect(grayed.exists()).toBe(true)
    expect(grayed.text()).toContain('奶')
  })
  it('切换玩家后按该玩家灰色 id 灰显', async () => {
    const wrapper = setup({ 1: [11] })
    await flushPromises()
    await wrapper.findComponent({ name: 'Select' }).vm.$emit('update:value', playerA.user.id)
    await flushPromises()
    const grayed = wrapper.find('.char-pick.grayed')
    expect(grayed.exists()).toBe(true)
    expect(grayed.text()).toContain('剑魂')
  })
  it('非灰色角色不灰显', async () => {
    const wrapper = setup({ 9: [] }) // 管理员灰色 id 为空 → 奶不灰
    await flushPromises()
    expect(wrapper.find('.char-pick.grayed').exists()).toBe(false)
    expect(wrapper.text()).toContain('奶')
  })
  it('成员模式按自己 id 灰显', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/me/characters') return [mine.characters[0]]
      return []
    })
    const wrapper = mount(CharacterPickerModal, {
      props: { open: true, adminMode: false, grayByUser: { 9: [12] } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    const grayed = wrapper.find('.char-pick.grayed')
    expect(grayed.exists()).toBe(true)
    expect(grayed.text()).toContain('奶')
  })
})
