import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
          if (id.includes('@tanstack')) return 'vendor-query'
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
            return 'vendor-react'
          }
          if (id.includes('axios') || id.includes('zustand') || id.includes('lucide-react')) {
            return 'vendor-utils'
          }
        },
      },
    },
  },
})
