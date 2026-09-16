const TOKEN_KEY = 'dnfer_token'

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  // 登录接口的 401 表示「账号或密码错误」，不应触发全局跳转（否则页面刷新丢失错误提示）
  if (res.status === 401 && !url.includes('/auth/')) {
    clearToken(); window.location.href = '/login'; throw new ApiError(401, '未登录')
  }
  if (!res.ok) {
    let msg = '请求失败'
    try {
      const detail = (await res.json()).detail
      msg = typeof detail === 'string' ? detail : '请求参数有误'
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}
