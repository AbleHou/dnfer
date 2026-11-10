import { describe, it, expect } from 'vitest'
import { normalizeImageType } from './image'

describe('normalizeImageType', () => {
  it('Safari 下 .apng 空 MIME 推断为 image/apng', () => {
    const f = new File(['apng'], '角色.apng', { type: '' })
    const out = normalizeImageType(f)
    expect(out.type).toBe('image/apng')
  })
  it('application/octet-stream 也归一化为 image/apng', () => {
    const f = new File(['apng'], 'a.apng', { type: 'application/octet-stream' })
    expect(normalizeImageType(f).type).toBe('image/apng')
  })
  it('已有明确 image/png 类型保持不变', () => {
    const f = new File(['png'], 'a.png', { type: 'image/png' })
    expect(normalizeImageType(f)).toBe(f)
  })
  it('jpg/webp 扩展名也能推断', () => {
    expect(normalizeImageType(new File(['x'], 'a.jpg', { type: '' })).type).toBe('image/jpeg')
    expect(normalizeImageType(new File(['x'], 'a.jpeg', { type: '' })).type).toBe('image/jpeg')
    expect(normalizeImageType(new File(['x'], 'a.webp', { type: '' })).type).toBe('image/webp')
  })
  it('未知扩展名保留原 type 交给后端校验', () => {
    const f = new File(['x'], 'a.bin', { type: '' })
    expect(normalizeImageType(f)).toBe(f)
  })
})
