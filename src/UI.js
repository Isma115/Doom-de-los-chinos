// Compatibilidad: src/UI.js pasa a ser un re-export de src/ui/*.
// El juego sigue funcionando con `from './UI.js'` / `'../UI.js'`,
// pero el código nuevo debe importar de `@/ui/index.js`.
// No añadir más código aquí.
export { UIManager } from './ui/UIManager.js';
export { SettingsManager } from './ui/SettingsManager.js';
export { DebugPanel } from './ui/DebugPanel.js';
