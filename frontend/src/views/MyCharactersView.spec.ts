// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MyCharactersView from './MyCharactersView.vue'
import type { JobCategory } from '../types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), getJobs: vi.fn() },
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(() => 'tok'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}))
vi.mock('../lib/notify', () => ({
  confirmDialog: vi.fn(async () => true),
  notifyError: vi.fn(),
}))

const tree: JobCategory[] = [
  { id: 0, name: 'swordman_male', title: '鬼剑士(男)', children: [
    { id: 0, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' },
  ]},
  { id: 8, name: 'priest_male', title: '圣职者(男)', children: [
    { id: 0, name: 'crusader_male', title: '神启·圣骑士', class_type: '辅助' },
  ]},
]

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/api/me/characters') return []
    return []
  })
  apiMock.getJobs.mockResolvedValue(tree)
})

describe('MyCharactersView job picker', () => {
  it('selecting an output job shows damage inputs and submits job_name', async () => {
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    await wrapper.find('button').trigger('click')          // 添加角色
    await wrapper.find('button[data-cat="swordman_male"]').trigger('click')
    await wrapper.find('button[data-job="weapon_master"]').trigger('click')
    expect(wrapper.text()).toContain('模拟伤害')
    expect(wrapper.text()).not.toContain('增益量')
    await wrapper.find('#char-name').setValue('剑魂')
    await wrapper.find('#char-damage').setValue(680000)
    await wrapper.find('button[data-act="save"]').trigger('click')
    await flushPromises()
    const [url, body] = apiMock.post.mock.calls[0]
    expect(url).toBe('/api/me/characters')
    expect(body.job_name).toBe('weapon_master')
    expect('class_type' in body).toBe(false)
  })

  it('selecting a support job shows buff input', async () => {
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await wrapper.find('button[data-cat="priest_male"]').trigger('click')
    await wrapper.find('button[data-job="crusader_male"]').trigger('click')
    expect(wrapper.text()).toContain('增益量')
    expect(wrapper.text()).not.toContain('模拟伤害')
  })

  it('edit pre-selects the character job from the picker and saves via put', async () => {
    const char = {
      id: 1, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
      parent_name: 'priest_male', class_type: '辅助', fame: 1,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000,
    }
    apiMock.get.mockResolvedValueOnce([char])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    const editBtn = wrapper.findAll('button').find(b => b.text() === '编辑')
    expect(editBtn).toBeTruthy()
    await editBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已选：神启·圣骑士（辅助职业）')
    await wrapper.find('button[data-act="save"]').trigger('click')
    await flushPromises()
    const [url, body] = apiMock.put.mock.calls[0]
    expect(url).toBe('/api/me/characters/1')
    expect(body.job_name).toBe('crusader_male')
  })

  it('edit form renders inline right below the edited card', async () => {
    const charA = {
      id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出', fame: 100,
      simulated_damage: 680000, sustained_dps: 60000, buff_amount: null,
    }
    const charB = {
      id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
      parent_name: 'priest_male', class_type: '辅助', fame: 200,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000,
    }
    apiMock.get.mockResolvedValueOnce([charA, charB])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    const editBtns = wrapper.findAll('button').filter(b => b.text() === '编辑')
    await editBtns[0].trigger('click')
    await flushPromises()
    const panels = wrapper.findAll('.dnf-panel')
    const cardIdx = panels.findIndex(p => p.text().includes('剑魂'))
    const next = panels[cardIdx + 1]
    expect(next.classes()).toContain('create-form')
    expect(next.text()).toContain('编辑角色')
    expect(panels[cardIdx + 2].text()).toContain('奶')
  })

  it('create form renders below the header, not after the list', async () => {
    const char = {
      id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出', fame: 100,
      simulated_damage: 680000, sustained_dps: 60000, buff_amount: null,
    }
    apiMock.get.mockResolvedValueOnce([char])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    await wrapper.find('button').trigger('click')          // 添加角色
    await flushPromises()
    const panels = wrapper.findAll('.dnf-panel')
    expect(panels[0].classes()).toContain('create-form')
    expect(panels[0].text()).toContain('添加角色')
    expect(panels[1].text()).toContain('剑魂')
  })

  it('save without picking a job shows guard error and does not post', async () => {
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    await wrapper.find('button').trigger('click')          // 添加角色
    await wrapper.find('button[data-act="save"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请选择职业')
  })
})
