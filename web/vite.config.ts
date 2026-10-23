import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      // 浏览器终端走 /api/v1/ws/terminal，代理必须放行 WebSocket 升级
      '/api': { target: 'http://localhost:8866', ws: true },
      '/mcp': 'http://localhost:8866',
      // 登录页在登录前读网关版本与健康状态
      '/healthz': 'http://localhost:8866',
    },
  },
  build: {
    // 主包含 React / Router / Query / motion / Radix 约 650 KB（gzip 约 210 KB）；终端页内联了 ghostty-web 的 WASM，
    // 同量级但只在打开终端时懒加载。阈值按这两个已知的大块设置，新增的意外大块仍会告警
    chunkSizeWarningLimit: 700,
  },
  // 显式预构建：开发时首次进入某页才发现新依赖会触发整体重打包，期间新旧两份 React 并存导致 hook 报错
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-switch',
      '@radix-ui/react-tooltip',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'react-hook-form',
      'react-router-dom',
      '@tanstack/react-query',
      'motion/react',
      '@number-flow/react',
      'cmdk',
      'vaul',
      'sonner',
      '@phosphor-icons/react',
    ],
  },
})
