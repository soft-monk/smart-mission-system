import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// 开发期：Vite 起 5173，把 /api /ws /tiles /media /reports 代理到 C++ 后端 8080
// 生产期：构建产物输出到 ../backend/static，由 C++ 同源托管（无跨域）
//
// 二维地图能力来自独立模块 ../map-2d（以 '@map2d' 别名消费，等同第三方库；
// 该模块也可脱离本工程独立启动：cd map-2d && npm run dev）
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@map2d': fileURLToPath(new URL('../map-2d/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    fs: {
      // 允许开发期读取仓库根，从而加载 ../map-2d 的源码
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
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
