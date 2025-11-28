/*sección [CONSTANTES] Gestión de constantes*/
import * as THREE from '../node_modules/three/build/three.module.js';
export const CONFIG = {
    GRAVITY: 30.0,
    JUMP_FORCE: 15.0,
    PLAYER_HEIGHT: 2.0,
    PLAYER_SPEED: 400.0,
    ARENA_SIZE: 200,
    ENEMY_SPAWN_RATE: 2000,
    DOOR_OPEN_DURATION: 3000,
    DOOR_CLOSE_DISTANCE: 20,
    BLOCK_SIZE: 10,

    DEBUG_SHOW_HITBOXES: false
};

export const AUDIO_CONFIG = {
    MUSIC_VOLUME: 0.3,
    SFX_VOLUME: 0.5,
    ENEMY_SOUND_CHANCE: 0.02,
    ENEMY_SOUND_COOLDOWN: 3000
};

const pistolGeometry = new THREE.BoxGeometry(0.2, 0.2, 1);
const machineGunGeometry = new THREE.BoxGeometry(0.15, 0.15, 1.5);
export const WEAPONS_DATA = [
    {
        name: "PISTOLA TÁCTICA",
        color: 0x00ff00,
        damage: 25,
        delay: 400,
        ammo: 100,
        maxAmmo: 100,
        geo: pistolGeometry,
        shootSound: 'pistol'
    },
    {
        name: "AMETRALLADORA",
        color: 0xff0000,
        damage: 10,
        delay: 100,
        ammo: 600,
        maxAmmo: 600,
        geo: machineGunGeometry,
        shootSound: 'machinegun'
    }
];

export const ENEMY_TYPES = [
    {
        id: 'pablo',
        speed: 2.0,
        damage: 5,
        hp: 150,
        texture: 'assets/enemies/pablo.png',
        spawnWeight: 3,
        width: 5,
        height: 7,
        projectileSize: 0.3,
        sounds: ['grunt1', 'grunt2', 'growl1']
    },
    {
        id: 'pera',
        speed: 2.2,
        damage: 6,
        hp: 160,
        texture: 'assets/enemies/pera.png',
        spawnWeight: 3,
        width: 2.5,
        height: 3.25,
        projectileSize: 0.25,
        sounds: ['grunt1', 'hiss1', 'growl2']
    },

    {
        id: 'patica',
        speed: 1.5,
        damage: 10,
        hp: 120,
        texture: 'assets/enemies/patica.png',
        spawnWeight: 2,
        width: 6,
        height: 7.5,
        isShooter: true,
        shootRate: 2000,
        projectileSpeed: 15.0,

        projectileOffsetX: 0,
        projectileOffsetY: -0.9,
        projectileOffsetZ: 0,

        projectileSize: 0.6,
        sounds: ['roar1', 'growl1', 'hiss1']
    },

    {
        id: 'slow_low3',
        speed: 1.8,
        damage: 4,
        hp: 140,
        texture: 'assets/enemies/slow_low3.png',
        spawnWeight: 3,
        projectileSize: 0.3,
        sounds: ['grunt2', 'growl2', 'hiss1']
    },
    {
        id: 'medium_med',
        speed: 4.0,
        damage: 15,
        hp: 200,
        texture: 'assets/enemies/medium_med.png',
        spawnWeight: 2,
        projectileSize: 0.35,
        sounds: ['roar1', 'growl1', 'grunt1']
    },
    {
        id: 'medium_med2',
        speed: 4.2,
        damage: 16,
        hp: 210,
        texture: 'assets/enemies/medium_med2.png',
        spawnWeight: 2,
        projectileSize: 0.35,
        sounds: ['roar1', 'growl2', 'grunt2']
    },
];

export const MAP_BLOCKS = {
    '#': { type: 'wall', color: 0x888888, height: CONFIG.BLOCK_SIZE, solid: true },
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
    'MP': { type: 'MP', color: 0xffff00, height: 0, solid: false },
    'MA': { type: 'MA', color: 0xff8800, height: 0, solid: false }
};
/*[Fin de sección]*/