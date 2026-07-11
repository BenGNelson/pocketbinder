import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In dev, the browser loads this Vite server (hot-reload); calls to /api are
// proxied to the backend container so the app is one origin (same as prod, where
// nginx proxies /api). In prod the built static files are served by nginx.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 0.0.0.0 so it's reachable from outside the container
    port: 5173,
    proxy: {
      // Defaults to the prod backend; the dev compose profile points this at the
      // throwaway backend-dev via VITE_PROXY_TARGET so edits don't hit real data.
      '/api': { target: process.env.VITE_PROXY_TARGET || 'http://backend:8000', changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
  },
})
