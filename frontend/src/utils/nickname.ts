export const NICKNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9]{1,64}$/

export function validateNickname(nickname: string): string | null {
  if (!nickname) return '昵称不能为空'
  if (nickname.length > 64) return '昵称不能超过 64 个字符'
  if (!NICKNAME_RE.test(nickname)) return '昵称仅支持中文、字母和数字'
  return null
}
