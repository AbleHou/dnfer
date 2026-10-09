export function validatePassword(pw: string): string | null {
  if (pw.length < 6) return '密码至少 6 位'
  if (pw.length > 128) return '密码最多 128 位'
  return null
}
