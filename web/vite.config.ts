import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.FORGE_API_URL || 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The preview host is proxied under https://<port>-<sandbox>.e2b.app, so the dev
    // server must not reject a foreign Host header or block iframe embedding.
    allowedHosts: true,
    cors: true,
    strictPort: false,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      // Deployed generated apps are reverse-proxied by the API server.
      '/generated': { target: API_TARGET, changeOrigin: true, ws: false },
    },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
