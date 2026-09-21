// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { apiMock } = vi.hoisted(() => ({ apiMock: { post: vi.fn() } }))
vi.mock('../api/client', () => ({ api: apiMock }))

import { useSlotMove } from './useSlotMove'
import type { Slot } from '../types'

function makeSlot(id: number): Slot {
  return { id, squad_index: 0, row_index: 0, character_id: 1, character_name: '剑魂',
    character_class: '输出', job_name: 'weapon_master', job_title: '极诣·剑魂', fame: 1,
    simulated_damage: 2, sustained_dps: 3, buff_amount: null,
    owner_id: 1, owner_nickname: '甲', owner_avatar: null, duty: '主C', version: 1 }
}

beforeEach(() => vi.clearAllMocks())

describe('useSlotMove', () => {
  it('pickUp 记录移动源', () => {
    const { movingSlot, pickUp } = useSlotMove(1, async () => {})
    pickUp(makeSlot(1))
    expect(movingSlot.value?.id).toBe(1)
  })

  it('cancel 清空移动源', () => {
    const { movingSlot, pickUp, cancel } = useSlotMove(1, async () => {})
    pickUp(makeSlot(1))
    cancel()
    expect(movingSlot.value).toBeNull()
  })

  it('moveTo 目标格发起 move 并清空、刷新', async () => {
    const after = vi.fn(async () => {})
    const { movingSlot, pickUp, moveTo } = useSlotMove(7, after)
    pickUp(makeSlot(1))
    apiMock.post.mockResolvedValue({ slot: makeSlot(2), warnings: [], removed_slots: [] })
    await moveTo(makeSlot(2))
    expect(apiMock.post).toHaveBeenCalledWith('/api/raids/7/slots/1/move', { target_slot_id: 2 })
    expect(movingSlot.value).toBeNull()
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('moveTo 点源格自身：不发请求、仅取消', async () => {
    const after = vi.fn(async () => {})
    const { pickUp, moveTo } = useSlotMove(7, after)
    pickUp(makeSlot(1))
    await moveTo(makeSlot(1))
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it('moveTo 失败也清空移动源并刷新', async () => {
    const after = vi.fn(async () => {})
    const { movingSlot, pickUp, moveTo } = useSlotMove(7, after)
    pickUp(makeSlot(1))
    apiMock.post.mockRejectedValue(new Error('boom'))
    await expect(moveTo(makeSlot(2))).rejects.toThrow('boom')
    expect(movingSlot.value).toBeNull()
    expect(after).toHaveBeenCalledTimes(1)
  })
})
