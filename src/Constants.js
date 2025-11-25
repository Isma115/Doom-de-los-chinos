/*sección [CONSTANTES] Gestión de constantes*/
import * as THREE from '../node_modules/three/build/three.module.js';

export const CONFIG = {
    GRAVITY: 30.0,
    JUMP_FORCE: 15.0,
    PLAYER_HEIGHT: 2.0,
    PLAYER_SPEED: 400.0,
    ARENA_SIZE: 200,
    ENEMY_SPEED: 5.0,
    ENEMY_SPAWN_RATE: 2000,
    DOOR_OPEN_DURATION: 3000,
    DOOR_CLOSE_DISTANCE: 20,
    BLOCK_SIZE: 10  // Tamaño de cada bloque del mapa
};

const pistolGeometry = new THREE.BoxGeometry(0.2, 0.2, 1);
const machineGunGeometry = new THREE.BoxGeometry(0.15, 0.15, 1.5);

export const WEAPONS_DATA = [
    {
        name: "PISTOLA TÁCTICA",
        color: 0x00ff00,
        damage: 25,
        delay: 400,
        ammo: "Infinito",
        geo: pistolGeometry
    },
    {
        name: "AMETRALLADORA",
        color: 0xff0000,
        damage: 10,
        delay: 100,
        ammo: 100,
        geo: machineGunGeometry
    }
];

// NUEVO: Configuración de bloques del mapa
export const MAP_BLOCKS = {
    '#': { type: 'wall', color: 0x888888, height: CONFIG.BLOCK_SIZE, solid: true },        // Antes 30 → ahora cuadrado
    'D': { type: 'door', color: 0x00ffff, height: CONFIG.BLOCK_SIZE, solid: false },     // Puerta también cuadrada
    '+': { type: 'food', color: 0xff0000, height: 0, solid: false }, // NUEVO: Item de comida
    '.': { type: 'floor', color: 0x44aa44, height: 0, solid: false },
    'P': { type: 'player_spawn', color: 0x44aa44, height: 0, solid: false },
    'E': { type: 'enemy_spawn', color: 0x44aa44, height: 0, solid: false },
    ' ': { type: 'empty', color: 0x44aa44, height: 0, solid: false }
};
/*[Fin de sección]*/