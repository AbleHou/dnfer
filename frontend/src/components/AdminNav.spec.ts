// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import AdminNav from './AdminNav.vue'

describe('AdminNav', () => {
  it('渲染三个子导航链接', () => {
    const wrapper = mount(AdminNav, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    // RouterLinkStub 把 to 作为 prop 消费，不落成 DOM 属性；用 findAllComponents 读 props('to')
    expect(wrapper.findAll('a').map(a => a.text()))
      .toEqual(['邀请码管理', '用户管理', '副本管理'])
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.map(l => l.props('to'))).toEqual(['/admin/codes', '/admin/users', '/admin/dungeons'])
  })
})
