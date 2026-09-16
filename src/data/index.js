// Barrel: punto único de importación de datos.
// Nuevo código: import { CONFIG, ENEMY_TYPES } from '@/data/index.js'
// (o ruta relativa ../data/index.js hasta migrar todo a @).
export { CONFIG, AUDIO_CONFIG, AIM_ASSIST } from './config.js';
export { WEAPONS_DATA, findWeaponDef } from './weapons.js';
export {
    ENEMY_TYPES, ENEMY_BY_ID, getEnemyType,
    GENERIC_DEATH_SPRITE_SHEET, HIT_BLOOD_SPRITE_VARIANTS,
    humanNPC, spriteSheet4x5
} from './enemies.js';
export { FOOD_TYPES } from './items.js';
export { MAP_BLOCKS } from './blocks.js';
export { AVAILABLE_MAPS, EXIT_PORTAL_CONFIG } from './maps.js';
