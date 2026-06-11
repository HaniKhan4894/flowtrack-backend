import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

function getApiProxyTarget(): string {
  const deployPath = path.resolve(__dirname, '../config/deploy.json')
  if (fs.existsSync(deployPath)) {
    try {
      const deploy = JSON.parse(fs.readFileSync(deployPath, 'utf8'))
      const apiBaseUrl = String(deploy.apiBaseUrl || '')
      if (apiBaseUrl) {
        return apiBaseUrl.replace(/\/api\/v1\/?$/, '')
      }
    } catch {
      // fall through
    }
  }
  return 'http://localhost/flowtrack-backend/public'
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: getApiProxyTarget(),
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('ngrok-skip-browser-warning', 'true')
          })
        },
      },
    },
  },
})
