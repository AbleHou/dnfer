// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GroupFriendsView from './GroupFriendsView.vue'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), getJobs: vi.fn() },
}))
vi.mock('../api/client', () => ({ api: apiMock, getToken: vi.fn(() => 'tok') }))

const jobs = [{ id: 1, name: 'swordman_male', title: '鬼剑士(男)',
  children: [{ id: 11, name: 'weapon_master', title: '极诣·剑魂', class_type: '输出' as const }] }]

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.get.mockImplementation((url: string) => {
    if (url.startsWith('/api/characters/query')) return Promise.resolve({
      items: [{ id: 9, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
        parent_name: 'swordman_male', class_type: '输出' as const, fame: 100,
        simulated_damage: null, sustained_dps: null, buff_amount: null, sun_buff: null,
        combat_power: 1460962, owner_id: 2, owner_nickname: '阿甲' }],
      total: 1,
    })
    return Promise.resolve([])
  })
  apiMock.getJobs.mockResolvedValue(jobs)
})

describe('GroupFriendsView', () => {
  it('请求成员查询端点并渲染角色表（角色名/归属昵称/战斗力）', async () => {
    const wrapper = mount(GroupFriendsView)
    await flushPromises()
    const qcalls = apiMock.get.mock.calls.filter((c: any[]) => String(c[0]).includes('/characters/query'))
    expect(qcalls.length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('我的群友')
    expect(wrapper.text()).toContain('剑魂')
    expect(wrapper.text()).toContain('阿甲')       // 归属昵称
    expect(wrapper.text()).toContain('1460962')    // 战斗力列
  })

  it('成员视角无管理端归属按钮（归属玩家为纯文本）', async () => {
    const wrapper = mount(GroupFriendsView)
    await flushPromises()
    expect(wrapper.find('[data-act^="manage-owner"]').exists()).toBe(false)
  })

  it('筛选可按战斗力排序并发出 query 参数', async () => {
    const wrapper = mount(GroupFriendsView)
    await flushPromises()
    const sortSel = wrapper.findAllComponents({ name: 'DnfSelect' }).find(s => s.attributes('data-filter') === 'sort')
    await sortSel!.vm.$emit('update:modelValue', 'combat_power')
    await flushPromises()
    const qcalls = apiMock.get.mock.calls.filter((c: any[]) => String(c[0]).includes('/characters/query'))
    expect(String(qcalls[qcalls.length - 1][0])).toContain('sort=combat_power')
  })

  it('领奖台展示前三名：头像+昵称+角色卡片，第1名居中，第4名只进表格', async () => {
    function mkRow(id: number, name: string, owner: string, avatar: string | null, fame: number): any {
      return { id, name, job_name: 'weapon_master', job_title: '极诣·剑魂', parent_name: 'swordman_male',
        class_type: '输出', fame, simulated_damage: null, sustained_dps: null,
        buff_amount: null, sun_buff: null, combat_power: id, adventure_party_id: null,
        adventure_party_name: null, profile: null, atk_base: null, str_int: null, elemental: null,
        atk_power: null, atk_power_amp: null, skill_atk: null,
        owner_id: id + 10, owner_nickname: owner, owner_username: 'u' + id, owner_avatar: avatar,
        owner_is_banned: false }
    }
    // 后端按名望降序返回，前端取数组前 3
    apiMock.get.mockImplementation((url: string) => {
      if (url.startsWith('/api/characters/query')) return Promise.resolve({
        items: [
          mkRow(3, '奶妈', '阿丙', 'https://cdn.example.com/c.png', 300),
          mkRow(2, '狂战', '阿乙', null, 200),
          mkRow(1, '剑魂', '阿甲', 'https://cdn.example.com/a.png', 100),
          mkRow(4, '第四名', '阿丁', null, 50),
        ],
        total: 4,
      })
      return Promise.resolve([])
    })
    const wrapper = mount(GroupFriendsView)
    await flushPromises()
    const cols = wrapper.findAll('[data-test="podium"] .podium-col')
    expect(cols).toHaveLength(3)                                  // 仅前三名
    expect(cols.map(c => c.attributes('data-rank'))).toEqual(['2', '1', '3'])  // 领奖台顺序 2/1/3
    expect(cols[1].find('.podium-rank').text()).toBe('第1名')
    expect(cols[1].find('.poster-name').text()).toBe('奶妈')      // 名望最高居中
    expect(cols[1].find('.podium-name').text()).toBe('阿丙')
    expect(cols[1].find('.user-avatar img').attributes('src')).toBe('https://cdn.example.com/c.png')
    expect(cols[0].find('.podium-name').text()).toBe('阿乙')      // 第2名在左
    expect(cols[0].find('.poster-delete').exists()).toBe(false)   // 领奖台卡片无删除按钮
    expect(wrapper.text()).toContain('第四名')                    // 第4名仅在表格
  })
})
