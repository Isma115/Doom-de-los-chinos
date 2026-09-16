// Barrel de UI.
// Nuevo código: import { UIManager } from '@/ui/index.js'
// Compat: src/UI.js re-exporta lo mismo, no tocar imports existentes aún.
export { UIManager } from './UIManager.js';
export { SettingsManager } from './SettingsManager.js';
export { DebugPanel } from './DebugPanel.js';
export * as dom from './dom.js';
