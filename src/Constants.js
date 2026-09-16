// Compatibilidad: src/Constants.js pasa a ser un re-export de src/data/*.
// El juego sigue funcionando con `from './Constants.js'` o `'../Constants.js'`,
// pero el código nuevo debe importar de `@/data/*` (ver src/data/index.js).
// No añadir más constantes aquí.
export {
    CONFIG, AUDIO_CONFIG, AIM_ASSIST,
    WEAPONS_DATA, findWeaponDef,
    ENEMY_TYPES, ENEMY_BY_ID, getEnemyType,
    GENERIC_DEATH_SPRITE_SHEET, HIT_BLOOD_SPRITE_VARIANTS,
    FOOD_TYPES, MAP_BLOCKS,
    AVAILABLE_MAPS, EXIT_PORTAL_CONFIG
} from './data/index.js';
