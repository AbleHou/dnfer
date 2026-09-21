// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatar from './UserAvatar.vue'

describe('UserAvatar', () => {
  it('有 avatar 时渲染 img', () => {
    const w = mount(UserAvatar, { props: { nickname: '阿甲', avatar: 'https://cdn/x.png', size: 28 } })
    expect(w.find('img').attributes('src')).toBe('https://cdn/x.png')
    expect(w.find('.user-avatar-fallback').exists()).toBe(false)
  })
  it('无 avatar 时渲染首字符兜底', () => {
    const w = mount(UserAvatar, { props: { nickname: '阿乙', avatar: null, size: 28 } })
    expect(w.find('.user-avatar-fallback').text()).toBe('阿')
    expect(w.find('img').exists()).toBe(false)
  })
  it('图片加载失败回退到首字符占位', async () => {
    const w = mount(UserAvatar, { props: { nickname: '阿丙', avatar: 'https://cdn/bad.png', size: 28 } })
    expect(w.find('img').exists()).toBe(true)
    await w.find('img').trigger('error')
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('.user-avatar-fallback').text()).toBe('阿')
  })
})
