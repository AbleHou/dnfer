// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminUserCharactersModal from './AdminUserCharactersModal.vue'
import { confirmDialog } from '../lib/notify'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), getJobs: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))

const user = { id: 7, username: 'p', nickname: '玩家', is_admin: false, avatar: null, is_banned: false }
const chars = [{ id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
  parent_name: 'swordman_male', class_type: '输出' as const, fame: 100,
  simulated_damage: null, sustained_dps: null, buff_amount: null }]

describe('AdminUserCharactersModal', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.get.mockResolvedValue(chars); apiMock.getJobs.mockResolvedValue([]) })
  it('打开拉取角色并删除', async () => {
    apiMock.del.mockResolvedValue({ ok: true })
    const wrapper = mount(AdminUserCharactersModal, {
      props: { open: true, user },
      global: { stubs: { teleport: true, CharacterForm: true } },
    })
    await flushPromises()
    expect(apiMock.get).toHaveBeenCalledWith('/api/admin/users/7/characters')
    expect(wrapper.text()).toContain('剑魂')
    await wrapper.find('[data-act="del-1"]').trigger('click')
    await flushPromises()
    expect(confirmDialog).toHaveBeenCalled()
    expect(apiMock.del).toHaveBeenCalledWith('/api/admin/users/7/characters/1')
  })
})
