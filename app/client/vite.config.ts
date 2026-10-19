import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/reader/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3108' } },
})
