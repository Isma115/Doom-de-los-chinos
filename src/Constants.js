// #region Importaciones Constants
// Descripción: Módulo de constantes globales del juego.
import * as THREE from '../node_modules/three/build/three.module.js';
// #endregion
// #region Configuración Global Constants
// Descripción: Parámetros generales de física, gameplay y configuración del mundo.
export const CONFIG = {
    GRAVITY: 30.0,
    JUMP_FORCE: 15.0,
    PLAYER_HEIGHT: 2.0,
    PLAYER_SPEED: 400.0,
    ARENA_SIZE: 200,
    ENEMY_SPAWN_RATE: 5000,
    DOOR_OPEN_DURATION: 3000,        // ← Ya no se usa directamente, pero se mantiene por compatibilidad
    DOOR_CLOSE_DISTANCE: 20,
    BLOCK_SIZE: 10,

    // Colisiones
    PLAYER_COLLISION_RADIUS: 2.0,
    PLAYER_COLLISION_OFFSET: 1.0,

    // Pickups
    PICKUP_DISTANCE: 2.0,
    FOOD_HEAL_AMOUNT: 50,
    PISTOL_AMMO_AMOUNT: 30,
    MACHINEGUN_AMMO_AMOUNT: 300,

    // Spawns
    FLOOR_TILE_SIZE: 20,
    DEFAULT_SPAWN_HEIGHT: 1,

    DEBUG_SHOW_HITBOXES: false
};
// #endregion



// #region Mapas Disponibles Constants
// Descripción: Lista de mapas jugables y sus identificadores.
export const AVAILABLE_MAPS = [
    { id: 'default', name: 'Nivel de Entrenamiento' },
    { id: 'mapa1', name: 'La Fortaleza' },
    { id: 'mapa2', name: 'Arena de Sangre' }
];
// #endregion

// #region Configuración de Audio Constants
// Descripción: Ajustes de volumen y parámetros de sonido espacial y ambiental.
export const AUDIO_CONFIG = {
    MUSIC_VOLUME: 0.6,
    SFX_VOLUME: 0.8,
    ENEMY_SOUND_MIN_INTERVAL: 5000,
    ENEMY_SOUND_MAX_INTERVAL: 7000,
    ENEMY_SOUND_DISTANCE: 60,
    MAX_SIMULTANEOUS_ENEMY_SOUNDS: 10,
    MAX_VOLUME_MULTIPLIER: 3.0
};
// #endregion
// #region Geometrías de Armas Constants
// Descripción: Geometrías base reutilizables para las armas.
const pistolGeometry = new THREE.BoxGeometry(0.2, 0.2, 1);
const machineGunGeometry = new THREE.BoxGeometry(0.15, 0.15, 1.5);
// #endregion

// #region Datos de Armas Constants
// Descripción: Definición de estadísticas y propiedades visuales de las armas.
export const WEAPONS_DATA = [
    {
        name: "PISTOLA TÁCTICA",
        color: 0x00ff00,
        damage: 25,
        delay: 400,
        ammo: 100,
        maxAmmo: 100,
        geo: pistolGeometry,
        shootSound: 'pistol',
        sprite: 'pistol.png',
        flash: 'pistol_flash.png',
        isMelee: false
    },
    {
        name: "AMETRALLADORA",
        color: 0xff0000,
        damage: 10,
        delay: 100,
        ammo: 600,
        maxAmmo: 600,
        geo: machineGunGeometry,
        shootSound: 'machinegun',
        sprite: 'ametralla.png',
        flash: 'ametralla_flash.png',
        isMelee: false
    },
    {
        name: "CUCHILLO",
        damage: 45,
        delay: 600,               // cadencia media (más lento que pistola)
        range: 5.6,               // rango duplicado
        ammo: Infinity,
        maxAmmo: Infinity,
        shootSound: 'knife',      // ← SE HA CAMBIADO: ahora usa el sonido knife
        sprite: 'knife.png',
        flash: 'knife.png',
        isMelee: true
    },
    {
        name: "ESCOPETA",
        color: 0xffff00,
        damage: 80,
        delay: 650,               // cadencia aumentada un poco más (antes 900 → 750 → ahora 650 ms entre disparos)
        ammo: 50,
        maxAmmo: 50,
        geo: pistolGeometry,      // reutilizamos geometría temporalmente hasta tener modelo
        shootSound: 'shotgun',    // ahora usa el sonido real de escopeta
        sprite: 'shotgun.png',
        flash: 'shotgun_flash.png',
        isMelee: false
    }
];
// #endregion// #region Tipos de Enemigos Constants
// Descripción: Configuración y estadísticas de cada tipo de enemigo.
export const ENEMY_TYPES = [
    {
        id: 'pablo',
        speed: 4.5,  // Lento - tanque
        damage: 5,
        hp: 150,
        texture: 'assets/enemies/pablo.png',
        textureWalk: 'assets/enemies/pablo_walk.png',
        spawnWeight: 3,
        width: 5,
        height: 7,
        projectileSize: 0.3,
        sounds: ['grunt1', 'grunt2', 'growl1']
    },
    {
        id: 'pera',
        speed: 7.5,  // Velocidad media
        damage: 6,
        hp: 160,
        texture: 'assets/enemies/pera.png',
        textureWalk: 'assets/enemies/pera_walk.png',
        spawnWeight: 3,
        width: 2.5,
        height: 3.25,
        projectileSize: 0.25,
        sounds: ['grunt1', 'hiss1', 'growl2']
    },
    {
        id: 'patica',
        speed: 3.0,  // Muy lento - dispara
        damage: 10,
        hp: 120,
        texture: 'assets/enemies/patica.png',
        textureWalk: 'assets/enemies/patica_walk.png',
        textureShoot: 'assets/enemies/patica.png',
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
        id: 'trancas_barrancas',
        speed: 18.0,  // ¡MUY RÁPIDO! - El más veloz
        damage: 12,
        hp: 80,  // Poca vida para compensar velocidad
        texture: 'assets/enemies/trancas-barrancas.png',
        textureWalk: 'assets/enemies/trancas-barrancas.png',
        spawnWeight: 1,  // Aparece menos frecuentemente
        width: 3,
        height: 4,
        projectileSize: 0.25,
        sounds: ['hiss1', 'growl2', 'grunt1']
    },
    {
        id: 'amego',
        speed: 15.0,  // Muy rápido, pero menos que trancas
        damage: 14,
        hp: 100,
        texture: 'assets/enemies/amego.png',
        textureWalk: 'assets/enemies/amego.png',
        spawnWeight: 2,
        width: 3.5,
        height: 4.5,
        projectileSize: 0.25,
        sounds: ['grunt1', 'growl1', 'hiss1']
    },
    {
        id: 'slow_low3',
        speed: 5.0,  // Lento
        damage: 4,
        hp: 140,
        texture: 'assets/enemies/slow_low3.png',
        textureWalk: 'assets/enemies/slow_low3_walk.png',
        spawnWeight: 3,
        projectileSize: 0.3,
        sounds: ['grunt2', 'growl2', 'hiss1']
    },
    {
        id: 'medium_med',
        speed: 9.0,  // Rápido
        damage: 15,
        hp: 200,
        texture: 'assets/enemies/medium_med.png',
        textureWalk: 'assets/enemies/medium_med_walk.png',
        spawnWeight: 2,
        projectileSize: 0.35,
        sounds: ['roar1', 'growl1', 'grunt1']
    },
    {
        id: 'medium_med2',
        speed: 11.0,  // Más rápido
        damage: 16,
        hp: 210,
        texture: 'assets/enemies/medium_med2.png',
        textureWalk: 'assets/enemies/medium_med2_walk.png',
        spawnWeight: 2,
        projectileSize: 0.35,
        sounds: ['roar1', 'growl2', 'grunt2']
    },
    // Charo 1
    {
        id: 'charo',
        speed: 8.0,   // Velocidad media (entre pera [7.5] y medium_med [9.0])
        damage: 9,    // Daño moderado (más que pera [6], menos que amego [14])
        hp: 135,      // Salud equilibrada
        texture: 'assets/enemies/charo1.png',
        textureWalk: 'assets/enemies/charo1.png', // Misma textura para caminar
        spawnWeight: 2,
        width: 3.5,   // Tamaño medio
        height: 4.5,
        projectileSize: 0.25,
        sounds: ['grunt2', 'hiss1', 'growl1'],
        isMelee: true  // Especificar que es cuerpo a cuerpo
    },
    // Charo 2 (igual que charo1 pero con textura diferente)
    {
        id: 'charo2',
        speed: 8.0,   // Velocidad media (igual que charo1)
        damage: 9,    // Daño moderado (igual que charo1)
        hp: 135,      // Salud equilibrada (igual que charo1)
        texture: 'assets/enemies/charo2.png',
        textureWalk: 'assets/enemies/charo2.png', // Misma textura para caminar
        spawnWeight: 2,
        width: 3.5,   // Tamaño medio (igual que charo1)
        height: 4.5,
        projectileSize: 0.25,
        sounds: ['grunt2', 'hiss1', 'growl1'],
        isMelee: true  // Es cuerpo a cuerpo como charo1
    }
];
// #endregion

// #region Bloques de Mapa Constants
// Descripción: Propiedades de los bloques que componen el nivel.
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
// #endregion