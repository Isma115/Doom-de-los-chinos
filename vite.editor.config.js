import { defineConfig } from 'vite';
import { dirname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream, existsSync, statSync } from 'fs';

// Configuración propia del editor de mapas: es una aplicación separada
// del juego, con su propio servidor de desarrollo y su propia build.
//
//   npm run editor:web      → dev web en http://127.0.0.1:5174/
//   npm run editor          → ventana Electron con el editor 3D
//   npm run editor:build    → build en dist-editor/
//   npm run editor:preview  → previsualizar la build
//
// El juego corre por defecto en http://127.0.0.1:5175/ (npm run dev).

const rootDir = dirname(fileURLToPath(import.meta.url));
const editorRoot = resolve(rootDir, 'editor');
const mapasDir = resolve(rootDir, 'mapas');

const MIME = {
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// En desarrollo el editor vive en editor/ pero los mapas del juego están en
// ../mapas. Este middleware los sirve en /mapas/* para que funcione el botón
// "Cargar del juego" sin duplicar ficheros.
function serveGameMapas() {
  const send = (req, res, next) => {
    if (!req.url) return next();
    const path = req.url.split('?')[0];
    if (!path.startsWith('/mapas/')) return next();
    let file;
    try {
      file = resolve(mapasDir, decodeURIComponent(path.slice('/mapas/'.length)));
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    if (file !== mapasDir && !file.startsWith(mapasDir + sep)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) return next();
    const dot = file.lastIndexOf('.');
    const ext = dot !== -1 ? file.slice(dot).toLowerCase() : '';
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'serve-game-mapas',
    configureServer(server) {
      server.middlewares.use(send);
    },
    configurePreviewServer(server) {
      server.middlewares.use(send);
    },
  };
}

export default defineConfig({
  root: editorRoot,
  base: './',
  // Sin carpeta public propia: el editor solo necesita ../mapas (vía plugin).
  publicDir: false,
  plugins: [serveGameMapas()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
  build: {
    outDir: resolve(rootDir, 'dist-editor'),
    emptyOutDir: true,
  },
});
