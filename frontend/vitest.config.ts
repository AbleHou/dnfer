import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@dnftools/ui/style.css': new URL('./src/vendor/@dnftools/ui/style.css', import.meta.url).pathname,
      '@dnftools/ui': new URL('./src/vendor/@dnftools/ui/index.js', import.meta.url).pathname,
    },
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
})
