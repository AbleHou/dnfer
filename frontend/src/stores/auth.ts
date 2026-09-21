import { defineStore } from 'pinia'
import { api } from '../api/client'
import { clearToken, getToken, setToken } from '../api/client'
import type { User } from '../types'

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null as User | null, loaded: false }),
  getters: { isAdmin: (s) => s.user?.is_admin ?? false },
  actions: {
    async login(username: string, password: string) {
      const r = await api.post<{ token: string; user: User }>('/api/auth/login', { username, password })
      setToken(r.token); this.user = r.user; this.loaded = true
    },
    async register(body: { username: string; password: string; nickname: string; code: string }) {
      const r = await api.post<{ token: string; user: User }>('/api/auth/register', body)
      setToken(r.token); this.user = r.user; this.loaded = true
    },
    async load() {
      if (!getToken()) { this.loaded = true; return }
      try { this.user = await api.get<User>('/api/auth/me') } catch { clearToken(); this.user = null }
      this.loaded = true
    },
    updateProfile(user: User) { this.user = user },
    logout() { clearToken(); this.user = null; window.location.href = '/login' },
  },
})
