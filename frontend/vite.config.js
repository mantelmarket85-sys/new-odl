import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Production-readiness chunk splitting:
    // - pdf-lib is large (~400 KB) and only used in dashboards
    // - react-router-dom & axios are stable & cached across deploys
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'pdf-lib': ['pdf-lib'],
          'axios': ['axios'],
        },
      },
    },
    // Slightly raise warning limit since pdf-lib is intentionally large
    chunkSizeWarningLimit: 800,
  },
});
