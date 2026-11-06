// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import MyCharactersView from './MyCharactersView.vue'
import type { JobCategory } from '../types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), getJobs: vi.fn(), upload: vi.fn() },
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
  notifySuccess: vi.fn(),
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
  function mk(id: number, name: string, class_type: '输出' | '辅助', fame: number) {
    return {
      id, name, job_name: 'x', job_title: 't', parent_name: 'p',
      class_type, fame, simulated_damage: null, sustained_dps: null, buff_amount: null,
      sun_buff: null,
    }
  }

  it('selecting an output job shows damage inputs and submits job_name', async () => {
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.find('button').trigger('click')          // 添加角色
    await flushPromises()
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
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    await wrapper.find('button[data-cat="priest_male"]').trigger('click')
    await wrapper.find('button[data-job="crusader_male"]').trigger('click')
    expect(wrapper.text()).toContain('增益量')
    expect(wrapper.text()).not.toContain('模拟伤害')
  })

  it('edit pre-selects the character job from the picker and saves via put', async () => {
    const char = {
      id: 1, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
      parent_name: 'priest_male', class_type: '辅助', fame: 1,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000, sun_buff: null,
      adventure_party_id: null, adventure_party_name: null,
      atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
      skill_atk: null, combat_power: null,
    }
    apiMock.get.mockResolvedValueOnce([char])
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.findAll('.char-poster').find(w => w.text().includes('奶'))!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已选：神启·圣骑士（男）（辅助职业）')
    await wrapper.find('button[data-act="save"]').trigger('click')
    await flushPromises()
    const [url, body] = apiMock.put.mock.calls[0]
    expect(url).toBe('/api/me/characters/1')
    expect(body.job_name).toBe('crusader_male')
  })

  it('点击海报打开编辑弹窗', async () => {
    const char = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出', fame: 100,
      simulated_damage: 680000, sustained_dps: 60000, buff_amount: null, sun_buff: null,
      adventure_party_id: null, adventure_party_name: null,
      atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
      skill_atk: null, combat_power: null }
    apiMock.get.mockResolvedValueOnce([char])
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('编辑角色')
    await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('编辑角色')
  })

  it('点添加角色按钮打开创建弹窗', async () => {
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('请先选择职业')   // 弹窗未开
    await wrapper.find('button').trigger('click')          // 添加角色
    await flushPromises()
    expect(wrapper.text()).toContain('请先选择职业')       // CharacterForm 默认提示，证明弹窗已渲染
  })

  it('save without picking a job shows guard error and does not post', async () => {
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.find('button').trigger('click')          // 添加角色
    await flushPromises()
    await wrapper.find('button[data-act="save"]').trigger('click')
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请选择职业')
  })

  it('defaults to type sort: 输出 group first (fame desc), then 辅助', async () => {
    apiMock.get.mockResolvedValueOnce([
      mk(1, '奶', '辅助', 200), mk(2, '剑魂', '输出', 100), mk(3, '鬼泣', '输出', 300),
    ])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    const names = wrapper.findAll('.poster-name').map(el => el.text())
    expect(names).toEqual(['鬼泣', '剑魂', '奶'])   // 输出(名望降序) → 辅助
  })

  it('排序下拉切到「按名望」后按 fame 降序', async () => {
    apiMock.get.mockResolvedValueOnce([
      mk(1, '剑魂', '输出', 100), mk(2, '奶', '辅助', 200), mk(3, '鬼泣', '输出', 300),
    ])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    expect(wrapper.findAll('.poster-name').map(el => el.text())).toEqual(['鬼泣', '剑魂', '奶'])
    const sort = wrapper.findComponent({ name: 'DnfSelect' })
    await sort.vm.$emit('update:modelValue', 'fame')
    await nextTick()
    expect(wrapper.findAll('.poster-name').map(el => el.text())).toEqual(['鬼泣', '奶', '剑魂'])
  })

  it('排序下拉切换排序模式（默认按类型）', async () => {
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    const sort = wrapper.findComponent({ name: 'DnfSelect' })
    expect(sort.props('modelValue')).toBe('type')
    await sort.vm.$emit('update:modelValue', 'fame')
    await nextTick()
    expect(sort.props('modelValue')).toBe('fame')
    await sort.vm.$emit('update:modelValue', 'party')
    await nextTick()
    expect(sort.props('modelValue')).toBe('party')
  })

  it('职业选择器显示男女双版性别后缀', async () => {
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    // 打开添加角色表单，职业按钮 title 带后缀
    await wrapper.find('button').trigger('click')
    await flushPromises()
    await wrapper.find('button[data-cat="priest_male"]').trigger('click')
    await wrapper.find('button[data-job="crusader_male"]').trigger('click')
    expect(wrapper.find('button[data-job="crusader_male"]').text()).toContain('神启·圣骑士（男）')
    expect(wrapper.text()).toContain('已选：神启·圣骑士（男）（辅助职业）')
  })

  it('辅助角色卡片显示增益量与太阳增益', async () => {
    const char = { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
      parent_name: 'priest_male', class_type: '辅助', fame: 1,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000, sun_buff: 3000 }
    apiMock.get.mockResolvedValueOnce([char])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    expect(wrapper.text()).toContain('增益 9000')
    expect(wrapper.text()).toContain('太阳 3000')
  })

  it('角色卡片副标题追加冒险团名', async () => {
    const char = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出', fame: 100,
      simulated_damage: 680000, sustained_dps: 60000, buff_amount: null, sun_buff: null,
      adventure_party_id: 7, adventure_party_name: '阿伟的冒险团', combat_power: null }
    apiMock.get.mockResolvedValueOnce([char])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    expect(wrapper.text()).toContain('名望 100 · 战斗力 暂无 · 阿伟的冒险团')
  })

  it('冒险团管理按钮打开团管理弹窗', async () => {
    const wrapper = mount(MyCharactersView, {
      global: { stubs: { AdventurePartyModal: true } },
    })
    await flushPromises()
    const btn = wrapper.find('[data-act="manage-parties"]')
    expect(btn.exists()).toBe(true)
    const modal = wrapper.findComponent({ name: 'AdventurePartyModal' })
    expect(modal.props('open')).toBe(false)
    await btn.trigger('click')
    await nextTick()
    expect(modal.props('open')).toBe(true)
  })

  it('按冒险团排序：同团相邻、团内名望降序、未分组最后', async () => {
    apiMock.get.mockResolvedValueOnce([
      { ...mk(1, '无团奶', '辅助', 900), adventure_party_id: null, adventure_party_name: null },
      { ...mk(2, '甲输出', '输出', 100), adventure_party_id: 1, adventure_party_name: '甲团' },
      { ...mk(3, '甲奶', '辅助', 500), adventure_party_id: 1, adventure_party_name: '甲团' },
      { ...mk(4, '乙输出', '输出', 300), adventure_party_id: 2, adventure_party_name: '乙团' },
    ])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    const sort = wrapper.findComponent({ name: 'DnfSelect' })
    await sort.vm.$emit('update:modelValue', 'party')
    await nextTick()
    expect(wrapper.findAll('.poster-name').map(el => el.text()))
      .toEqual(['甲奶', '甲输出', '乙输出', '无团奶'])
  })

  it('排序下拉默认按类型（sortMode=type）', async () => {
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    const sort = wrapper.findComponent({ name: 'DnfSelect' })
    expect(sort.props('modelValue')).toBe('type')
  })

  it('输出角色卡片展示战斗力（千分位），辅助不显示', async () => {
    const out = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出', fame: 20000,
      simulated_damage: 680000, sustained_dps: 60000, buff_amount: null, sun_buff: null,
      adventure_party_id: null, adventure_party_name: null,
      atk_base: 10000, str_int: 5000, elemental: 300, atk_power: 100, atk_power_amp: 20,
      skill_atk: 50, combat_power: 250271 }
    const sup = { id: 2, name: '奶', job_name: 'crusader_male', job_title: '神启·圣骑士',
      parent_name: 'priest_male', class_type: '辅助', fame: 200,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000, sun_buff: 3000,
      adventure_party_id: null, adventure_party_name: null,
      atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
      skill_atk: null, combat_power: null }
    apiMock.get.mockResolvedValueOnce([out, sup])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    expect(wrapper.text()).toContain('名望 20000 · 战斗力 250,271')
    expect(wrapper.text()).not.toContain('战斗力 暂无')   // 辅助卡无战斗力
    expect(wrapper.text()).toContain('名望 200')          // 辅助卡正常
  })

  it('输出角色战斗力为空显示暂无', async () => {
    const out = { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出', fame: 100,
      simulated_damage: 680000, sustained_dps: 60000, buff_amount: null, sun_buff: null,
      adventure_party_id: null, adventure_party_name: null,
      atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
      skill_atk: null, combat_power: null }
    apiMock.get.mockResolvedValueOnce([out])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    expect(wrapper.text()).toContain('名望 100 · 战斗力 暂无')
  })

  it('海报右上角删除按钮删除角色', async () => {
    const char = { id: 5, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出', fame: 100,
      simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
      adventure_party_id: null, adventure_party_name: null,
      atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
      skill_atk: null, combat_power: null }
    apiMock.get.mockResolvedValueOnce([char])
    const wrapper = mount(MyCharactersView)
    await flushPromises()
    await wrapper.find('.poster-delete').trigger('click')
    await flushPromises()
    expect(apiMock.del).toHaveBeenCalledWith('/api/me/characters/5')
  })
})

describe('MyCharactersView profile section', () => {
  function mkChar(id: number, profile: string | null) {
    return { id, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
      parent_name: 'swordman_male', class_type: '输出' as const, fame: 100,
      simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
      adventure_party_id: null, adventure_party_name: null,
      atk_base: null, str_int: null, elemental: null, atk_power: null, atk_power_amp: null,
      skill_atk: null, combat_power: null, profile }
  }

  it('编辑弹窗显示角色头像区，创建弹窗不显示', async () => {
    apiMock.get.mockResolvedValueOnce([mkChar(1, null)])
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    // 创建弹窗：不显示头像区
    await wrapper.find('button').trigger('click')   // 添加角色
    await flushPromises()
    expect(wrapper.find('.profile-preview').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('上传头像')
    // 取消创建 → 点海报进编辑 → 显示头像区
    await wrapper.findAll('button').find(b => b.text() === '取消')!.trigger('click')
    await flushPromises()
    await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.profile-preview').exists()).toBe(true)
    expect(wrapper.text()).toContain('上传头像')
  })

  it('有自定义 profile 时预览用自定义图', async () => {
    apiMock.get.mockResolvedValueOnce([mkChar(1, 'https://cdn.example.com/profiles/1/2/x.png')])
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.profile-preview').attributes('src')).toBe('https://cdn.example.com/profiles/1/2/x.png')
  })

  it('恢复默认按钮调用 api.del', async () => {
    apiMock.get.mockResolvedValueOnce([mkChar(5, 'https://cdn.example.com/profiles/1/5/x.png')])
    apiMock.del.mockResolvedValueOnce({ ...mkChar(5, 'https://cdn.example.com/profiles/1/5/x.png'), profile: null })
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '恢复默认')!.trigger('click')
    await flushPromises()
    expect(apiMock.del).toHaveBeenCalledWith('/api/me/characters/5/profile')
  })

  it('上传头像调用 api.upload 正确 URL', async () => {
    apiMock.get.mockResolvedValueOnce([mkChar(1, null)])
    apiMock.upload.mockResolvedValueOnce({ ...mkChar(1, null), profile: 'https://cdn.example.com/profiles/1/1/u.png' })
    const wrapper = mount(MyCharactersView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.findAll('.char-poster').find(w => w.text().includes('剑魂'))!.trigger('click')
    await flushPromises()
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.png', { type: 'image/png' })] })
    await input.trigger('change')
    await flushPromises()
    expect(apiMock.upload).toHaveBeenCalledWith('/api/me/characters/1/profile', expect.anything())
  })
})
