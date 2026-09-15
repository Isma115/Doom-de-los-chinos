// Copia los assets que se cargan por fetch/TextureLoader en runtime
// (Vite no los mete en el bundle porque no son imports).
// Necesario para que dist/ funcione en Capacitor (APK).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const dirs = ['assets', 'mapas', 'modelos', 'eventos'];

mkdirSync(dist, { recursive: true });
for (const dir of dirs) {
  const from = join(root, dir);
  const to = join(dist, dir);
  if (!existsSync(from)) {
    console.warn(`[mobile-assets] no existe ${dir}, se omite`);
    continue;
  }
  cpSync(from, to, { recursive: true });
  console.log(`[mobile-assets] ${dir} -> dist/${dir}`);
}
console.log('[mobile-assets] OK');
