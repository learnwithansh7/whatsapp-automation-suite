import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration with proxy to prevent CORS issues during local development
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api requests to Fastify backend
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      // Direct health endpoint proxy for convenience
      '/health': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
