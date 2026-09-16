import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api/client'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/LoginView.vue') },
    { path: '/register', component: () => import('../views/RegisterView.vue') },
    { path: '/', component: () => import('../views/RaidListView.vue') },
    { path: '/raids/:id', component: () => import('../views/RaidDetailView.vue') },
    { path: '/characters', component: () => import('../views/MyCharactersView.vue') },
    { path: '/admin', component: () => import('../views/AdminView.vue') },
  ],
})

router.beforeEach(async (to) => {
  if (to.path === '/login' || to.path === '/register') return true
  if (!getToken()) return '/login'
  const auth = useAuthStore()
  if (!auth.loaded) await auth.load()
  if (!auth.user) return '/login'
  return true
})

export default router
