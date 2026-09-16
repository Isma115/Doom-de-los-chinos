// Propiedades de los bloques que componen el nivel.
import { CONFIG } from './config.js';

export const MAP_BLOCKS = {
    '#': { type: 'wall', color: 0x888888, height: CONFIG.BLOCK_SIZE, solid: true },
    'B': { type: 'bush', color: 0x336633, height: CONFIG.BLOCK_SIZE * 0.6, solid: true },
    'L': { type: 'brick', color: 0xAA4444, height: CONFIG.BLOCK_SIZE * 0.6, solid: true },
    'D': { type: 'door', color: 0x00ffff, height: CONFIG.BLOCK_SIZE, solid: false },
    '+': { type: 'food', color: 0xff0000, height: 0, solid: false },
    '.': { type: 'floor', color: 0x44aa44, height: 0, solid: false },
    'P': { type: 'player_spawn', color: 0x44aa44, height: 0, solid: false },
    'E': { type: 'enemy_spawn', color: 0x44aa44, height: 0, solid: false },
    ' ': { type: 'empty', color: 0x44aa44, height: 0, solid: false },
    '1': { type: 'enemy_slow_low', color: 0x44aa44, height: 0, solid: false },
    '2': { type: 'enemy_slow_low2', color: 0x44aa44, height: 0, solid: false },
    '3': { type: 'enemy_slow_low3', color: 0x44aa44, height: 0, solid: false },
    '4': { type: 'enemy_medium_med', color: 0x44aa44, height: 0, solid: false },
    '5': { type: 'enemy_medium_med2', color: 0x44aa44, height: 0, solid: false },
    '6': { type: 'enemy_shooter', color: 0x44aa44, height: 0, solid: false },
    'S': { type: 'generic_spawner', color: 0x44aa44, height: 0, solid: false },
    'MP': { type: 'MP', color: 0xffff00, height: 0, solid: false },
    'MA': { type: 'MA', color: 0xff8800, height: 0, solid: false },
    'SMuni': { type: 'ammo_spawner', color: 0x0000ff, height: 0, solid: false },
    'SComida': { type: 'food_spawner', color: 0x00ff00, height: 0, solid: false }
};
