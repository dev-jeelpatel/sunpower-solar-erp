import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies the API so the browser sees a single origin (no CORS fuss)
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' } },
});
