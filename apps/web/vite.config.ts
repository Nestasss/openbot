import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    // When running behind a reverse proxy on a real domain, Vite blocks unknown hosts.
    // Add your domain here so https://chat.notificbot.ru works.
    allowedHosts: ['chat.notificbot.ru', 'app.notificbot.ru'],
  },
})
