// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CharacterPoster from './CharacterPoster.vue'
import type { Character } from '../types'

function mkChar(over: Partial<Character> = {}): Character {
  return { id: 1, name: '剑魂', job_name: 'weapon_master', job_title: '极诣·剑魂',
    parent_name: 'swordman_male', class_type: '输出', fame: 20000,
    simulated_damage: 68, sustained_dps: 6, buff_amount: null, sun_buff: null,
    adventure_party_id: null, adventure_party_name: null,
    atk_base: 10000, str_int: 5000, elemental: 300, atk_power: 100, atk_power_amp: 20,
    skill_atk: 50, combat_power: 250271, profile: null, ...over }
}

describe('CharacterPoster', () => {
  it('主图 src 为 characterProfile 拼接的 profile 路径', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
  })

  it('profile 加载失败切换深底 + 职业图标兜底（仅一次）', async () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    await w.find('.cover').trigger('error')
    expect(w.find('.fallback').exists()).toBe(true)
    expect(w.find('.fallback-icon').attributes('src')).toBe('/images/jobs/weapon_master.png')
    // 兜底后再 error 不切换回（无循环）
    await w.find('.fallback-icon').trigger('error')
    expect(w.find('.fallback').exists()).toBe(true)
  })

  it('有自定义 profile 时主图用自定义 URL', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar({ profile: 'https://cdn.example.com/profiles/1/2/x.png' }) } })
    expect(w.find('.cover').attributes('src')).toBe('https://cdn.example.com/profiles/1/2/x.png')
  })

  it('自定义图加载失败降级默认图，默认再失败降级深底', async () => {
    const w = mount(CharacterPoster, { props: { character: mkChar({ profile: 'https://cdn.example.com/profiles/1/2/x.png' }) } })
    await w.find('.cover').trigger('error')          // 自定义失败 → 默认图
    expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
    await w.find('.cover').trigger('error')          // 默认失败 → 深底+图标
    expect(w.find('.fallback').exists()).toBe(true)
  })

  it('无自定义 profile 时直接用默认图，失败走深底', async () => {
    const w = mount(CharacterPoster, { props: { character: mkChar({ profile: null }) } })
    expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
    await w.find('.cover').trigger('error')
    expect(w.find('.fallback').exists()).toBe(true)
  })

  it('profile 变化后重置兜底状态', async () => {
    const w = mount(CharacterPoster, { props: { character: mkChar({ profile: 'https://cdn.example.com/profiles/1/2/x.png' }) } })
    await w.find('.cover').trigger('error')          // 降级到默认图
    expect(w.find('.cover').attributes('src')).toBe('/characters-images/swordman_male/weapon_master/profile.png')
    await w.setProps({ character: mkChar({ profile: 'https://cdn.example.com/profiles/1/2/y.png' }) })  // 换新自定义图 → 重置
    expect(w.find('.cover').attributes('src')).toBe('https://cdn.example.com/profiles/1/2/y.png')
  })

  // 注意：simulated_damage/sustained_dps 存储单位即「亿」，fmtDps(n) = `${n}亿`
  it('输出角色第一行显示名望+战斗力（千分位），第二行显示模拟/秒伤', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    expect(w.find('.line1').text()).toContain('名望 20000 · 战斗力 250,271')
    expect(w.find('.line2').text()).toBe('模拟 68亿 · 秒伤 6亿')
  })

  it('输出角色战斗力为空显示暂无', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar({ combat_power: null }) } })
    expect(w.find('.line1').text()).toContain('名望 20000 · 战斗力 暂无')
  })

  it('输出/辅助角色明细为 null 时第二行显示暂无', () => {
    const out = mkChar({ simulated_damage: null, sustained_dps: null })
    const w1 = mount(CharacterPoster, { props: { character: out } })
    expect(w1.find('.line2').text()).toBe('模拟 暂无 · 秒伤 暂无')
    const sup = mkChar({ class_type: '辅助', combat_power: null, buff_amount: null, sun_buff: null })
    const w2 = mount(CharacterPoster, { props: { character: sup } })
    expect(w2.find('.line2').text()).toBe('增益 暂无 · 太阳 暂无')
  })

  it('辅助角色不显示战斗力，第二行显示增益/太阳', () => {
    const sup = mkChar({ name: '奶', class_type: '辅助', fame: 200, combat_power: null,
      simulated_damage: null, sustained_dps: null, buff_amount: 9000, sun_buff: 3000 })
    const w = mount(CharacterPoster, { props: { character: sup } })
    expect(w.find('.line1').text()).toContain('名望 200')
    expect(w.find('.line1').text()).not.toContain('战斗力')
    expect(w.find('.line2').text()).toBe('增益 9000 · 太阳 3000')
  })

  it('有冒险团时第一行追加团名', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar({ adventure_party_id: 7, adventure_party_name: '阿伟的冒险团' }) } })
    expect(w.find('.line1').text()).toContain('名望 20000 · 战斗力 250,271 · 阿伟的冒险团')
  })

  it('点击海报 emit click，点删除按钮 emit delete 且不冒泡 click', async () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    await w.find('.char-poster').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
    await w.find('.poster-delete').trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    expect(w.emitted('click')).toHaveLength(1)   // delete 不冒泡
  })

  it('信息条与形象分离：poster-info 紧随 poster-img 之后、无渐变覆盖层', () => {
    const w = mount(CharacterPoster, { props: { character: mkChar() } })
    const img = w.find('.poster-img').element
    const info = w.find('.poster-info').element
    expect(img.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(w.find('.grad').exists()).toBe(false)   // 不再叠加渐变遮罩
  })
})
