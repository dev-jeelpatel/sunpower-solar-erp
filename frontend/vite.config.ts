import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

// Dev server proxies the API so the browser sees a single origin (no CORS fuss)
export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5173, proxy: { '/api': process.env.API_TARGET || 'http://localhost:4000', '/uploads': process.env.API_TARGET || 'http://localhost:4000', '/socket.io': { target: process.env.API_TARGET || 'http://localhost:4000', ws: true } } },
});
