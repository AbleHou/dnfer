// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CharacterForm from './CharacterForm.vue'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

const categories = [{
  id: 1, name: 'swordman_male', title: '鬼剑士(男)',
  children: [{ id: 11, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' as const }],
}]

// 注意：职业按钮在选中类别后才渲染（v-if="selectedCat"），必须先点类别再点职业
async function fillAndSave(wrapper: any) {
  await wrapper.find('#char-name').setValue('剑魂')
  await wrapper.find('[data-cat="swordman_male"]').trigger('click')
  await wrapper.find('[data-job="weapon_master"]').trigger('click')
  await wrapper.find('#char-fame').setValue(100)
  await wrapper.find('[data-act="save"]').trigger('click')
  await flushPromises()
}

describe('CharacterForm', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('默认走 /api/me/characters', async () => {
    apiMock.post.mockResolvedValue({})
    const wrapper = mount(CharacterForm, { props: { categories, editing: null } })
    await fillAndSave(wrapper)
    expect(apiMock.post).toHaveBeenCalledWith('/api/me/characters', expect.any(Object))
  })
  it('baseUrl 指定时走管理员路径', async () => {
    apiMock.post.mockResolvedValue({})
    const wrapper = mount(CharacterForm,
      { props: { categories, editing: null, baseUrl: '/api/admin/users/7/characters' } })
    await fillAndSave(wrapper)
    expect(apiMock.post).toHaveBeenCalledWith('/api/admin/users/7/characters', expect.any(Object))
  })
  it('编辑时 put 到 baseUrl/{id}', async () => {
    apiMock.put.mockResolvedValue({})
    const editing = { id: 5, name: '旧', job_name: 'weapon_master', job_title: 'x',
      parent_name: 'swordman_male', class_type: '输出' as const, fame: 1,
      simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null }
    const wrapper = mount(CharacterForm,
      { props: { categories, editing, baseUrl: '/api/admin/users/7/characters' } })
    await fillAndSave(wrapper)
    expect(apiMock.put).toHaveBeenCalledWith('/api/admin/users/7/characters/5', expect.any(Object))
  })
  it('辅助职业显示太阳增益输入框并提交', async () => {
    apiMock.post.mockResolvedValue({})
    const cat = [{ id: 8, name: 'priest_male', title: '圣职者(男)', children: [
      { id: 0, name: 'crusader_male', title: '神启·圣骑士', class_type: '辅助' as const }] }]
    const wrapper = mount(CharacterForm, { props: { categories: cat, editing: null } })
    await wrapper.find('#char-name').setValue('奶')
    await wrapper.find('[data-cat="priest_male"]').trigger('click')
    await wrapper.find('[data-job="crusader_male"]').trigger('click')
    expect(wrapper.find('#char-sun-buff').exists()).toBe(true)
    await wrapper.find('#char-buff').setValue(9000)
    await wrapper.find('#char-sun-buff').setValue(3000)
    await wrapper.find('[data-act="save"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/me/characters',
      expect.objectContaining({ buff_amount: 9000, sun_buff: 3000 }))
  })
  it('输出职业不显示太阳增益输入框', async () => {
    const wrapper = mount(CharacterForm, { props: { categories, editing: null } })
    await wrapper.find('[data-cat="swordman_male"]').trigger('click')
    await wrapper.find('[data-job="weapon_master"]').trigger('click')
    expect(wrapper.find('#char-sun-buff').exists()).toBe(false)
  })
  it('辅助切回输出职业清空太阳增益（与增益量对称）', async () => {
    apiMock.post.mockResolvedValue({})
    const both = [
      ...categories,
      { id: 8, name: 'priest_male', title: '圣职者(男)', children: [
        { id: 0, name: 'crusader_male', title: '神启·圣骑士', class_type: '辅助' as const }] },
    ]
    const wrapper = mount(CharacterForm, { props: { categories: both, editing: null } })
    await wrapper.find('#char-name').setValue('奶')
    await wrapper.find('[data-cat="priest_male"]').trigger('click')
    await wrapper.find('[data-job="crusader_male"]').trigger('click')
    await wrapper.find('#char-sun-buff').setValue(3000)
    await wrapper.find('[data-cat="swordman_male"]').trigger('click')
    await wrapper.find('[data-job="weapon_master"]').trigger('click')
    await wrapper.find('[data-act="save"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/api/me/characters',
      expect.objectContaining({ sun_buff: null, buff_amount: null }))
  })
})
