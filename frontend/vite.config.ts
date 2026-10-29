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
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
      '/images': 'http://localhost:8000',
    },
  },
})
