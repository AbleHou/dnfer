// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MemberCharactersModal from './MemberCharactersModal.vue'

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

beforeEach(() => vi.clearAllMocks())

const user = { id: 3, username: 'm', nickname: '队员', is_admin: false, avatar: null, is_banned: false }
const characters = [{ id: 11, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: 'swordman_male', class_type: '输出', fame: 52000,
  simulated_damage: 5, sustained_dps: 2, buff_amount: null }]

describe('MemberCharactersModal', () => {
  it('拉取该用户角色并标记占位', async () => {
    apiMock.get.mockResolvedValue({ user, characters })
    const wrapper = mount(MemberCharactersModal, {
      props: { open: true, rid: 1, user,
               placed: { 11: { wave_index: 1, squad_index: 0, duty: '主C' } } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/raids/1/signups/3/characters')
    expect(wrapper.text()).toContain('剑魂')
    expect(wrapper.text()).toContain('已占位 · 第1波 · 红队')
  })

  it('关闭时不拉取', async () => {
    const wrapper = mount(MemberCharactersModal, {
      props: { open: false, rid: 1, user, placed: {} },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('拉取失败时静默显示空态', async () => {
    apiMock.get.mockRejectedValue(new Error('网络错误'))
    const wrapper = mount(MemberCharactersModal, {
      props: { open: true, rid: 1, user, placed: {} },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('还没有角色')
  })
})
