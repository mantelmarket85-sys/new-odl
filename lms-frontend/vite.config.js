import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// LMS frontend (separate app) — runs on port 5174 so it can coexist with the
// ODL admissions frontend (3000) and backend (5000).
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // esbuild minify (fast, low-memory) and no sourcemaps for production.
    // node_modules are bundled into a single vendor chunk to keep the build
    // memory profile predictable.
    minify: 'esbuild',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
  },
})
