import { defineConfig } from 'vite';

export default defineConfig({
  // Base relativa: imprescindible para Capacitor (file://) y para que el
  // APK cargue JS/CSS/assets sin depender del dominio.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 0
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  }
});
