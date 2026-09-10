import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// 开发期：Vite 起 5173，把 /api /ws /tiles /media /reports 代理到 C++ 后端 8080
// 生产期：构建产物输出到 ../backend/static，由 C++ 同源托管（无跨域）
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8080', ws: true },
      '/tiles': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/reports': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: false, // 保留 .gitkeep
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
})
