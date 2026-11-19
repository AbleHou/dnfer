// 同步社区时用过的社区ID历史缓存：去重、最近使用优先、最多保留 3 个。
// 纯前端本地缓存，避免每次手动重复输入。

const HISTORY_KEY = 'dnfer-community-id-history'
const MAX_HISTORY = 3

export function loadCommunityIdHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x !== '') : []
  } catch {
    return []  // JSON 损坏/隐私模式等，视为无历史
  }
}

export function rememberCommunityId(id: string): string[] {
  const trimmed = id.trim()
  if (!trimmed) return loadCommunityIdHistory()
  const next = [trimmed, ...loadCommunityIdHistory().filter((x) => x !== trimmed)]
    .slice(0, MAX_HISTORY)
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* 隐私模式等忽略 */ }
  return next
}
