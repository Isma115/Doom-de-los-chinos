// Copia los mapas del juego a dist-editor/mapas para que el editor
// compilado pueda usar "Cargar del juego" sin depender del proyecto.
// Se ejecuta como parte de `npm run editor:build`.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'mapas');
const to = join(root, 'dist-editor', 'mapas');

if (!existsSync(from)) {
  console.warn('[editor-assets] no existe mapas/, se omite');
  process.exit(0);
}

mkdirSync(to, { recursive: true });
for (const file of readdirSync(from)) {
  if (!/\.(txt|json)$/i.test(file)) continue;
  cpSync(join(from, file), join(to, file));
  console.log(`[editor-assets] mapas/${file} -> dist-editor/mapas/${file}`);
}
console.log('[editor-assets] OK');
