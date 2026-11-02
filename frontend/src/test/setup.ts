// 所有 stub 须用 typeof window 守卫——setupFiles 会在 node 环境 spec 中也加载
// （useSlotMove.spec.ts 是 // @vitest-environment node），裸访问 window/Element 会抛 ReferenceError
import { config } from '@vue/test-utils'

// DnfDialog 底层用 reka-ui DialogPortal（内部再包 Vue <Teleport>），
// 全局 stub 让弹窗内容在 spec 中内联渲染（不 teleport 到 body），
// 否则 wrapper.find 拿不到内容；`stubs: { teleport: true }` 拦不住 reka-ui 的 DialogPortal。
if (typeof window !== 'undefined') {
  config.global.stubs = {
    ...(config.global.stubs ?? {}),
    DialogPortal: { template: '<div><slot /></div>' },
  }
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as any).ResizeObserver = ResizeObserverStub
  }
  if (!window.matchMedia) {
    ;(window as any).matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  // DnfTabs 组件在 onMounted 里读 document.fonts.ready（jsdom 无 FontFaceSet）
  if (!(document as any).fonts) {
    ;(document as any).fonts = { ready: Promise.resolve() }
  }
}
