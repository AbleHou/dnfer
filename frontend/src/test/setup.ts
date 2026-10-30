// 所有 stub 须用 typeof window 守卫——setupFiles 会在 node 环境 spec 中也加载
// （useSlotMove.spec.ts 是 // @vitest-environment node），裸访问 window/Element 会抛 ReferenceError
if (typeof window !== 'undefined') {
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
