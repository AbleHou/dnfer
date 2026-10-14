// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdventurePartyModal from './AdventurePartyModal.vue'
import { confirmDialog } from '../lib/notify'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), getJobs: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))

const parties = [
  { id: 1, name: '阿伟的冒险团', created_at: '', character_count: 2 },
  { id: 2, name: '奶爸团', created_at: '', character_count: 0 },
]

describe('AdventurePartyModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockResolvedValue(parties)
    apiMock.post.mockResolvedValue({ id: 3, name: '新团', created_at: '', character_count: 0 })
    apiMock.put.mockResolvedValue({ id: 2, name: '奶妈团', created_at: '', character_count: 0 })
    apiMock.del.mockResolvedValue({ ok: true })
  })

  it('打开时拉取冒险团列表并显示团名与角色数', async () => {
    const wrapper = mount(AdventurePartyModal, {
      props: { open: true },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/me/adventure-parties')
    expect(wrapper.text()).toContain('阿伟的冒险团')
    expect(wrapper.text()).toContain('（2 角色）')
    expect(wrapper.text()).toContain('奶爸团')
  })

  it('创建：输入团名并点创建 → POST 并刷新列表', async () => {
    const wrapper = mount(AdventurePartyModal, {
      props: { open: true },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    await wrapper.find('[data-act="party-create-input"]').setValue('新团')
    await wrapper.find('[data-act="party-create"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/me/adventure-parties', { name: '新团' })
    // 成功后重新 load：GET 共调用两次（打开一次 + 刷新一次）
    expect(apiMock.get).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('改名：点改名出输入框，保存 → PUT', async () => {
    const wrapper = mount(AdventurePartyModal, {
      props: { open: true },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    await wrapper.find('[data-act="party-rename-2"]').trigger('click')
    const input = wrapper.find('[data-act="party-rename-input"]')
    expect(input.exists()).toBe(true)
    await input.setValue('奶妈团')
    await wrapper.find('[data-act="party-rename-save"]').trigger('click')
    await flushPromises()
    expect(apiMock.put).toHaveBeenCalledWith('/api/me/adventure-parties/2', { name: '奶妈团' })
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('删除：有角色或仅剩一个团时按钮禁用；可删时点击 → confirm → DELETE', async () => {
    const wrapper = mount(AdventurePartyModal, {
      props: { open: true },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    // 有角色（character_count > 0）→ 禁用
    expect(wrapper.find('[data-act="party-delete-1"]').attributes('disabled')).toBeDefined()
    // 可删（空团且非最后）→ 点击 → confirm → DELETE
    await wrapper.find('[data-act="party-delete-2"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/me/adventure-parties/2')
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('仅剩一个团时删除按钮禁用', async () => {
    apiMock.get.mockResolvedValueOnce([{ id: 1, name: '唯一团', created_at: '', character_count: 0 }])
    const wrapper = mount(AdventurePartyModal, {
      props: { open: true },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.find('[data-act="party-delete-1"]').attributes('disabled')).toBeDefined()
  })
})
