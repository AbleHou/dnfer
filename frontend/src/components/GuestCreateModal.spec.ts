// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GuestCreateModal from './GuestCreateModal.vue'

const { apiMock, notifyMock } = vi.hoisted(() => ({
  apiMock: { post: vi.fn(), getJobs: vi.fn() },
  notifyMock: { notifyError: vi.fn(), notifySuccess: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))
vi.mock('../lib/notify', () => notifyMock)

const jobs = [{ id: 1, name: 'swordman_male', title: '鬼剑士(男)', children: [
  { id: 11, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' as const }] }]

function mountModal(props: Record<string, unknown> = {}) {
  return mount(GuestCreateModal, {
    props: { open: true, requireCharacter: false, ...props },
    global: { stubs: { teleport: true } },
  })
}

describe('GuestCreateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.getJobs.mockResolvedValue(jobs)
  })
  it('requireCharacter 时无角色不可提交', async () => {
    const w = mountModal({ requireCharacter: true })
    await flushPromises()
    await w.find('[data-field="nickname"]').setValue('来客')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('请至少添加一个角色')
  })
  it('昵称为空不可提交', async () => {
    const w = mountModal()
    await flushPromises()
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(w.text()).toContain('请填写昵称')
  })
  it('创建成功调用 POST 并 emit created', async () => {
    const res = { user: { id: 5, username: 'guest_x', nickname: '来客', is_admin: false, avatar: null, is_banned: false, is_guest: true },
      characters: [{}], default_party_id: 1, default_party_name: '来客的冒险团' }
    apiMock.post.mockResolvedValue(res)
    const w = mountModal()
    await flushPromises()
    await w.find('[data-field="nickname"]').setValue('来客')
    await w.find('[data-act="add-row"]').trigger('click')
    const row = w.find('[data-test="guest-row-0"]')
    await row.find('[data-field="char-name"]').setValue('剑魂')
    await row.find('[data-field="job"]').setValue('weapon_master')
    await flushPromises()
    await row.find('[data-field="fame"]').setValue('100')
    await row.find('[data-field="damage"]').setValue('2000')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    const body = apiMock.post.mock.calls[0][1] as any
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users', expect.anything())
    expect(body.nickname).toBe('来客')
    expect(body.characters[0]).toMatchObject({
      name: '剑魂', job_name: 'weapon_master', fame: 100, simulated_damage: 2000,
    })
    expect(w.emitted('created')).toBeTruthy()
  })
  it('创建失败提示 notifyError', async () => {
    apiMock.post.mockRejectedValue(new Error('昵称已存在'))
    const w = mountModal()
    await flushPromises()
    await w.find('[data-field="nickname"]').setValue('来客')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    expect(notifyMock.notifyError).toHaveBeenCalledWith('昵称已存在')
  })
  it('辅助职业提交 buff/sun 且输出字段为 null', async () => {
    apiMock.getJobs.mockResolvedValue([{ id: 8, name: 'priest_male', title: '圣职者(男)', children: [
      { id: 81, name: 'crusader_male', title: '神启·圣骑士', class_type: '辅助' as const }] }])
    apiMock.post.mockResolvedValue({ user: { id: 6, username: 'guest_x', nickname: '奶', is_admin: false, avatar: null, is_banned: false, is_guest: true }, characters: [{}] })
    const w = mountModal()
    await flushPromises()
    await w.find('[data-field="nickname"]').setValue('奶')
    await w.find('[data-act="add-row"]').trigger('click')
    const row = w.find('[data-test="guest-row-0"]')
    await row.find('[data-field="char-name"]').setValue('奶')
    await row.find('[data-field="job"]').setValue('crusader_male')
    await flushPromises()
    await row.find('[data-field="buff"]').setValue('46000')
    await row.find('[data-field="sun"]').setValue('3000')
    await w.find('[data-act="submit"]').trigger('click')
    await flushPromises()
    const body = apiMock.post.mock.calls[0][1] as any
    expect(body.characters[0]).toMatchObject({
      simulated_damage: null, sustained_dps: null, buff_amount: 46000, sun_buff: 3000,
    })
  })
})
