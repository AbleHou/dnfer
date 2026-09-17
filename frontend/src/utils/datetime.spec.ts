import { describe, it, expect } from 'vitest'
import { formatDateTime } from './datetime'

describe('formatDateTime', () => {
  it('formats iso to 月日 时分', () => {
    expect(formatDateTime('2026-09-20T14:00:00')).toBe('9月20日 14:00')
  })
  it('falls back to raw string on invalid input', () => {
    expect(formatDateTime('nope')).toBe('nope')
  })
})
