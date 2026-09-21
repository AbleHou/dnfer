import type { JobCategory } from '../types'

const TOKEN_KEY = 'dnfer_token'

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method, headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  })
  // 登录接口 401 不触发全局跳转（原逻辑保留）
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
  upload: <T>(url: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<T>('POST', url, form, true)
  },
  getJobs: () => request<JobCategory[]>('GET', '/api/jobs'),
}
