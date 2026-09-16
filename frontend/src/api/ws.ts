import { getToken } from './client'
import type { WsEvent } from '../stores/raid'

export interface RaidWsCallbacks {
  onEvent: (ev: WsEvent) => void
  onRefresh: () => void   // wave 增删 → 全量刷新
  onReconnect: () => void // 断线重连成功 → 重新拉快照兜底
}

export function connectRaidWs(raidId: number, cb: RaidWsCallbacks): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let timer: number | undefined
  let reconnected = false

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws/raids/${raidId}?token=${getToken()}`)
    ws.onmessage = (m) => {
      const ev = JSON.parse(m.data)
      if (ev.type === 'wave:added' || ev.type === 'wave:removed') cb.onRefresh()
      else cb.onEvent(ev)
    }
    ws.onopen = () => { if (reconnected) cb.onReconnect() }
    ws.onclose = () => {
      if (closed) return
      reconnected = true
      timer = window.setTimeout(connect, 2000)  // 自动重连
    }
  }
  connect()
  return () => { closed = true; if (timer) clearTimeout(timer); ws?.close() }
}
