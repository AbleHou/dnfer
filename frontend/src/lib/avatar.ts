const PALETTE = ['#2f6fbf', '#3f9e6a', '#c0703f', '#7a5fc0', '#c04f6a', '#3a9ba8', '#b08a2f']

export function avatarBackground(nickname: string): string {
  let h = 0
  for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function avatarFallbackChar(nickname: string): string {
  return nickname.trim().charAt(0) || '?'
}
