import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/reader/',
  plugins: [react()],
  // Direct backend address, used only by the free connection check in the
  // timings panel. Vercel builds already have PAGESTREAM_BACKEND_ORIGIN.
  define: {
    'import.meta.env.VITE_PAGESTREAM_BACKEND_ORIGIN': JSON.stringify(process.env.PAGESTREAM_BACKEND_ORIGIN ?? ''),
  },
  server: { proxy: { '/api': 'http://localhost:3108' } },
})
