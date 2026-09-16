import { defineStore } from 'pinia'
import { api } from '../api/client'
import type { Raid, Slot } from '../types'

export type WsEvent =
  | { type: 'slot:filled'; slot: Slot }
  | { type: 'slot:removed'; slot_id: number }
  | { type: 'slot:duty_changed'; slot: Slot }
  | { type: 'wave:added'; index: number }
  | { type: 'wave:removed'; index: number }
  | { type: 'raid:locked' }
  | { type: 'raid:unlocked' }

export const useRaidStore = defineStore('raid', {
  state: () => ({ raid: null as Raid | null, needRefresh: false }),
  actions: {
    async load(id: number) {
      this.raid = await api.get<Raid>(`/api/raids/${id}`)
      this.needRefresh = false
    },
    patch(p: Partial<Raid>) { if (this.raid) Object.assign(this.raid, p) },
  },
})

function findSlot(raid: Raid, slotId: number): Slot | undefined {
  for (const w of raid.waves) { const s = w.slots.find(s => s.id === slotId); if (s) return s }
  return undefined
}

export function applyEvent(store: ReturnType<typeof useRaidStore>, ev: WsEvent) {
  const raid = store.raid
  if (!raid) return
  switch (ev.type) {
    case 'slot:filled':
    case 'slot:duty_changed': {
      const slot = findSlot(raid, ev.slot.id)
      if (slot && slot.version <= ev.slot.version) Object.assign(slot, ev.slot)
      break
    }
    case 'slot:removed': {
      const slot = findSlot(raid, ev.slot_id)
      if (slot) { slot.character_id = null; slot.character_name = null; slot.character_class = null;
        slot.fame = null; slot.simulated_damage = null; slot.sustained_dps = null; slot.buff_amount = null;
        slot.owner_id = null; slot.owner_nickname = null; slot.duty = null }
      break
    }
    case 'raid:locked': raid.locked = true; break
    case 'raid:unlocked': raid.locked = false; break
    case 'wave:added':
    case 'wave:removed':
      store.needRefresh = true; break
  }
}
