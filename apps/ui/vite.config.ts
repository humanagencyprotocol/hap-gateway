import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3400,
    proxy: {
      '/api': {
        target: 'http://localhost:3402',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3402',
        changeOrigin: true,
      },
      '/gate-content': {
        target: 'http://localhost:3402',
        changeOrigin: true,
      },
      '/vault': {
        target: 'http://localhost:3402',
        changeOrigin: true,
      },
      '/ai': {
        target: 'http://localhost:3402',
        changeOrigin: true,
      },
      '/github': {
        target: 'http://localhost:3402',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3402',
        changeOrigin: true,
      },
      '/mcp': {
        target: 'http://localhost:3402',
        changeOrigin: true,
      },
    },
  },
});
