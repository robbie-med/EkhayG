import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Served from the custom domain (CNAME) at the site root.
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Port 3919 is registered for this project in /home/user/Projects/PORTS.md.
  server: { host: '127.0.0.1', port: 3919, strictPort: true },
  preview: { host: '127.0.0.1', port: 3919, strictPort: true },
})
