import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: { port: Number(process.env.AURA_WEB_PORT || 5173), strictPort: true, proxy: { '/api': `http://127.0.0.1:${process.env.AURA_API_PORT || 8787}`, '/media': `http://127.0.0.1:${process.env.AURA_API_PORT || 8787}` } },
});
