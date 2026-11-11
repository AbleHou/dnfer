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

function mkRow(id: number, name: string, owner: string, fame: number,
               avatar: string | null = null, combatPower = id * 100000): any {
  return { id, name, job_name: 'weapon_master', job_title: '极诣·剑魂', parent_name: 'swordman_male',
    class_type: '输出', fame, simulated_damage: null, sustained_dps: null,
    buff_amount: null, sun_buff: null, combat_power: combatPower, adventure_party_id: null,
    adventure_party_name: null, profile: null, atk_base: null, str_int: null, elemental: null,
    atk_power: null, atk_power_amp: null, skill_atk: null,
    owner_id: id + 10, owner_nickname: owner, owner_username: 'u' + id, owner_avatar: avatar,
    owner_is_banned: false }
}

// 后端按名望降序返回；前三名进领奖台，第4名留在表格
const ITEMS = [
  mkRow(3, '奶妈', '阿丙', 300),
  mkRow(2, '狂战', '阿乙', 200),
  mkRow(1, '剑魂', '阿甲', 100),
  mkRow(4, '第四名', '阿丁', 50, null, 1460962),
]

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.get.mockImplementation((url: string) => {
    if (url.startsWith('/api/characters/query')) return Promise.resolve({ items: ITEMS, total: 4 })
    return Promise.resolve([])
  })
  apiMock.getJobs.mockResolvedValue(jobs)
})

describe('GroupFriendsView', () => {
  it('请求成员查询端点并渲染（角色名/归属昵称/战斗力：领奖台 + 表格）', async () => {
    const wrapper = mount(GroupFriendsView)
    await flushPromises()
    const qcalls = apiMock.get.mock.calls.filter((c: any[]) => String(c[0]).includes('/characters/query'))
    expect(qcalls.length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('我的群友')
    expect(wrapper.text()).toContain('剑魂')      // 领奖台第3名
    expect(wrapper.text()).toContain('阿甲')      // 领奖台归属昵称
    expect(wrapper.text()).toContain('1460962')   // 表格第4名战斗力列
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

  it('领奖台展示前三名：头像+昵称+角色卡片，第1名居中，表格不再重复前三名', async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url.startsWith('/api/characters/query')) return Promise.resolve({
        items: [
          mkRow(3, '奶妈', '阿丙', 300, 'https://cdn.example.com/c.png'),
          mkRow(2, '狂战', '阿乙', 200, null),
          mkRow(1, '剑魂', '阿甲', 100, 'https://cdn.example.com/a.png'),
          mkRow(4, '第四名', '阿丁', 50),
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
    // 表格只保留第4名，不再重复前三名
    const rows = wrapper.findComponent({ name: 'DnfTable' }).props('rows') as Array<{ name: string }>
    expect(rows.map(r => r.name)).toEqual(['第四名'])
  })
})
