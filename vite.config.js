import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src')
    }
  },
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
    port: 5175,
    strictPort: true
  }
});
