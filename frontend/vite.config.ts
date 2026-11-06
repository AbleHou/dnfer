import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@dnftools/ui/style.css': new URL('./src/vendor/@dnftools/ui/style.css', import.meta.url).pathname,
      '@dnftools/ui': new URL('./src/vendor/@dnftools/ui/index.js', import.meta.url).pathname,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 把 vendored 组件库（含大量内联贴图）与运行时依赖拆成独立、可缓存的 chunk，
        // 让主入口 chunk 只含应用代码；库更新/重部署时各 chunk 内容哈希稳定、浏览器可缓存
        manualChunks(id) {
          if (id.includes('/src/vendor/@dnftools/ui/')) return 'dnftools-ui'
          if (id.includes('/node_modules/reka-ui/')) return 'reka-ui'
          if (id.includes('/node_modules/@vueuse/')) return 'vueuse'
          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/@vue/')
              || id.includes('/node_modules/vue-router/') || id.includes('/node_modules/pinia/')) return 'vue'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
      '/images': 'http://localhost:8000',
      '/characters-images': 'http://localhost:8000',
    },
  },
})
