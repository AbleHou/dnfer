import { ref } from 'vue'
import { api } from '../api/client'
import type { Slot } from '../types'

export interface FillResponse { slot: Slot; warnings: string[]; removed_slots: Slot[] }

export function useSlotMove(rid: number, after: () => Promise<void>) {
  const movingSlot = ref<Slot | null>(null)
  function pickUp(slot: Slot) { movingSlot.value = slot }
  function cancel() { movingSlot.value = null }
  async function moveTo(target: Slot): Promise<FillResponse> {
    const from = movingSlot.value
    if (!from || from.id === target.id) { cancel(); return { slot: target, warnings: [], removed_slots: [] } }
    try {
      return await api.post<FillResponse>(`/api/raids/${rid}/slots/${from.id}/move`, { target_slot_id: target.id })
    } finally {
      cancel()
      await after()
    }
  }
  return { movingSlot, pickUp, cancel, moveTo }
}
