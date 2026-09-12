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
    PLAYER_MAX_HEALTH: 200,
    CROUCH_HEIGHT: 1.2,
    CROUCH_SPEED_MULTIPLIER: 0.45,
    // La velocidad configurada en cada tipo se aplica al 50% en juego.
    // El mínimo evita que un enemigo quede inmóvil aunque su dato sea 0,
    // negativo o inválido.
    ENEMY_SPEED_MULTIPLIER: 0.5,
    ENEMY_MIN_SPEED: 0.01,
    CROUCH_TRANSITION_SPEED: 8.0,
    // 25 % menos que la velocidad base anterior (400).
    PLAYER_SPEED: 300.0,
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
    PICKUP_SPRITE_HEIGHT: 0.75,
    AMMO_SPRITE_SCALE: 0.75,
    FOOD_SPRITE_SCALE: 0.35,
    FOOD_HEAL_AMOUNT: 50,
    PISTOL_AMMO_AMOUNT: 30,
    MACHINEGUN_AMMO_AMOUNT: 300,
    SHOTGUN_AMMO_AMOUNT: 30,
    RPG_AMMO_AMOUNT: 3,
    RPG_AMMO_SPRITE_SCALE: 0.85,

    // Spawns
    FLOOR_TILE_SIZE: 20,
    GROUND_SURFACE_OFFSET: 0.04,
    DEFAULT_SPAWN_HEIGHT: 1,

    DEBUG_SHOW_HITBOXES: false
};
// #endregion

// #region Tipos de Comida Constants
// Descripción: Pickups de curación disponibles en los mapas y spawners.
export const FOOD_TYPES = [
    {
        id: 'kebab',
        name: 'Kebab',
        texture: 'assets/textures/kebab.png',
        healAmount: CONFIG.FOOD_HEAL_AMOUNT,
        scale: 3
    },
    {
        id: 'ham_tapa',
        name: 'Tapa de jamón',
        texture: 'assets/textures/food_ham_tapa.png',
        healAmount: 20,
        scale: 2.7
    },
    {
        id: 'paella',
        name: 'Paella',
        texture: 'assets/textures/food_paella.png',
        healAmount: 40,
        scale: 2.8
    },
    {
        id: 'cocido',
        name: 'Cuenco de cocido',
        texture: 'assets/textures/food_cocido.png',
        healAmount: 60,
        scale: 2.8
    }
];
// #endregion



// #region Mapas Disponibles Constants
// Descripción: Lista de mapas jugables y sus identificadores.
export const AVAILABLE_MAPS = [
    { id: 'default', name: 'Nivel de Entrenamiento' },
    { id: 'mapa1', name: 'Parque' },
    { id: 'mapa2', name: 'Arena de Sangre' },
    // Se conserva el id para no romper enlaces de prueba existentes.
    { id: 'pruebas_alien', name: 'Pruebas: Esqueleto Minigun' }
];
// #endregion

// #region Configuración del Portal de Salida Constants
// Descripción: Atlas animado que aparece al completar las rondas de Parque.
// El destino queda vacío hasta que exista el siguiente nivel.
export const EXIT_PORTAL_CONFIG = {
    // Cambiar la revisión evita que el navegador conserve una versión previa
    // del atlas con el checkerboard incrustado.
    texture: 'assets/textures/portal_exit.png?v=3',
    columns: 8,
    rows: 1,
    frameWidth: 256,
    frameHeight: 512,
    frames: 8,
    fps: 10,
    width: 5.2,
    height: 7.2,
    groundOffset: 0.55,
    activationDistance: 4.5,
    destinationMap: null
};
// #endregion

// #region Animación de muerte genérica Constants
// Descripción: Efecto de esqueleto ensangrentado para enemigos que usan
// sprites individuales en lugar de un spritesheet animado.
export const GENERIC_DEATH_SPRITE_SHEET = {
    texture: 'assets/enemies/generic_gore_death.png',
    // Variantes visuales para que las muertes genéricas no repitan siempre
    // la misma descomposición.
    variantTextures: [
        'assets/enemies/generic_gore_death_variant_1.png',
        'assets/enemies/generic_gore_death_variant_2.png',
        'assets/enemies/generic_gore_death_variant_3.png',
        'assets/enemies/generic_gore_death_variant_4.png'
    ],
    corpseTexture: 'assets/enemies/generic_corpse_pile.png',
    columns: 6,
    rows: 1,
    frameWidth: 256,
    frameHeight: 256,
    // Compensa el encuadre del cadáver para que no parezca flotando.
    offsetY: -0.15,
    corpseLifetime: 12000,
    maxCorpses: 20,
    animations: {
        death: { row: 0, frames: 6, fps: 12, loop: false }
    }
};
// #endregion

// #region Variantes de nube de impacto de sangre Constants
// Descripción: Sprites grandes e irregulares para el impacto inmediato de los
// disparos sobre enemigos y NPCs. El fondo de cada PNG es RGBA transparente.
export const HIT_BLOOD_SPRITE_VARIANTS = [
    'assets/textures/hit_blood_cloud_variant_1.png',
    'assets/textures/hit_blood_cloud_variant_2.png',
    'assets/textures/hit_blood_cloud_variant_3.png',
    'assets/textures/hit_blood_cloud_variant_4.png'
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
        damage: 18,
        delay: 650,               // cadencia aumentada un poco más (antes 900 → 750 → ahora 650 ms entre disparos)
        ammo: 50,
        maxAmmo: 50,
        geo: pistolGeometry,      // reutilizamos geometría temporalmente hasta tener modelo
        shootSound: 'shotgun',    // ahora usa el sonido real de escopeta
        sprite: 'shotgun.png',
        flash: 'shotgun_flash.png',
        isMelee: false,
        pelletCount: 9,
        spread: 0.085
    },
    {
        id: 'rpg',
        name: "LANZACOHETES",
        color: 0x667744,
        // Daño directo muy alto y explosión con daño decreciente por distancia.
        damage: 460,
        delay: 900,
        ammo: 0,
        maxAmmo: 20,
        shootSound: 'rocketLaunch',
        explosionSound: 'rocketExplosion',
        sprite: 'rpg.png',
        flash: 'rpg_flash.png',
        isMelee: false,
        projectileType: 'rocket',
        projectileSpeed: 82,
        rocketRadius: 0.22,
        // Evita que el cohete choque con el suelo o una pared pegados al jugador.
        armingDistance: 2.0,
        explosionRadius: 8.5,
        explosionDamage: 340,
        explosionFalloff: 0.55,
        pickupAmmo: 6,
        pickupTexture: 'assets/textures/rpg_pickup.png',
        pickupScale: 1.35,
        requiresPickup: true
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
        // La pera solo tiene una tirada del 5% cuando se solicita una
        // aparición aleatoria o se procesa un hueco de ronda.
        spawnWeight: 0,
        spawnChance: 0.05,
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
    },
    {
        id: 'alien',
        speed: 6.5,
        damage: 12,
        hp: 180,
        texture: 'assets/enemies/alien.png',
        spriteSheet: {
            columns: 4,
            rows: 5,
            frameWidth: 256,
            frameHeight: 256,
            animations: {
                idle: { row: 0, frames: 4, fps: 4, loop: true },
                walk: { row: 1, frames: 4, fps: 8, loop: true },
                attack: { row: 2, frames: 4, fps: 10, loop: false },
                hurt: { row: 3, frames: 4, fps: 12, loop: false },
                death: { row: 4, frames: 4, fps: 7, loop: false }
            }
        },
        spawnWeight: 0, // Se incorpora de forma explícita desde la ronda 4
        width: 2.24,
        height: 3.52,
        // Separación visual respecto al plano: mantiene la colisión en el suelo
        // y evita que los últimos píxeles de los pies queden ocultos por él.
        spriteOffsetY: 0.05,
        projectileSize: 0.3,
        sounds: ['hiss1', 'growl2', 'roar1'],
        isMelee: true,
        bloodType: 'white',
        bloodColor: 0xffffff
    },
    {
        id: 'street_npc',
        speed: 5.2,
        damage: 3,
        hp: 90,
        texture: 'assets/npcs/street_npc.png',
        spriteSheet: {
            columns: 4,
            rows: 5,
            frameWidth: 280,
            frameHeight: 280,
            animations: {
                idle: { row: 0, frames: 4, fps: 4, loop: true },
                walk: { row: 1, frames: 4, fps: 8, loop: true },
                attack: { row: 2, frames: 4, fps: 8, loop: false },
                hurt: { row: 3, frames: 4, fps: 10, loop: false },
                death: { row: 4, frames: 4, fps: 7, loop: false }
            }
        },
        // Solo se incluye de forma explícita en las primeras rondas.
        spawnWeight: 0,
        // Escala de peatón reducida: mantiene una proporción humana frente al jugador.
        width: 1.9,
        height: 3.15,
        movementBehavior: 'wander_flee',
        // Los pies dejan unos píxeles transparentes al final de cada celda;
        // este desplazamiento negativo los apoya visualmente en el suelo.
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'street_npc_female',
        speed: 5.2,
        damage: 3,
        hp: 90,
        texture: 'assets/npcs/street_npc_female.png?v=2',
        spriteSheet: {
            columns: 4,
            rows: 5,
            frameWidth: 280,
            frameHeight: 280,
            animations: {
                idle: { row: 0, frames: 4, fps: 4, loop: true },
                walk: { row: 1, frames: 4, fps: 8, loop: true },
                attack: { row: 2, frames: 4, fps: 8, loop: false },
                hurt: { row: 3, frames: 4, fps: 10, loop: false },
                death: { row: 4, frames: 4, fps: 7, loop: false }
            }
        },
        // Usa la misma escala y apoyo en el suelo que el NPC masculino.
        spawnWeight: 0,
        width: 1.9,
        height: 3.15,
        movementBehavior: 'wander_flee',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'street_npc_phone',
        speed: 5.2,
        damage: 3,
        hp: 90,
        // Flujo equivalente a "pera": textura quieta y texturaWalk espejada
        // que se intercambian mientras el NPC avanza.
        texture: 'assets/npcs/street_npc_phone.png',
        textureWalk: 'assets/npcs/street_npc_phone_walk.png',
        spawnWeight: 0,
        width: 1.9,
        height: 3.15,
        movementBehavior: 'wander_flee',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'old_man',
        speed: 4.0,
        damage: 4,
        hp: 130,
        // Enemigo de un solo sprite: la textura espejada se intercambia
        // durante el movimiento, igual que en el flujo de "pera".
        texture: 'assets/enemies/old_man.png',
        textureWalk: 'assets/enemies/old_man_walk.png',
        spawnWeight: 1,
        width: 1.8,
        height: 3.0,
        // El anciano es la excepción humana: persigue y ataca al jugador.
        movementBehavior: 'chase_attack',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'young_man',
        speed: 4.0,
        damage: 4,
        hp: 130,
        // NPC de un solo sprite: alterna con su versión espejada al caminar,
        // igual que "old_man" y "pera".
        texture: 'assets/enemies/young_man.png',
        textureWalk: 'assets/enemies/young_man_walk.png',
        spawnWeight: 1,
        width: 1.8,
        height: 3.0,
        movementBehavior: 'wander_flee',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'middle_aged_man',
        speed: 4.0,
        damage: 4,
        hp: 130,
        // NPC de un solo sprite: alterna con su versión espejada al caminar,
        // siguiendo el mismo sistema que "old_man" y "young_man".
        texture: 'assets/enemies/middle_aged_man.png',
        textureWalk: 'assets/enemies/middle_aged_man_walk.png',
        spawnWeight: 1,
        width: 1.8,
        height: 3.0,
        movementBehavior: 'wander_flee',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'black_dress_woman',
        speed: 4.0,
        damage: 4,
        hp: 130,
        // NPC de un solo sprite: alterna con su versión espejada al caminar,
        // siguiendo el mismo sistema que los demás NPC de calle.
        texture: 'assets/enemies/black_dress_woman.png',
        textureWalk: 'assets/enemies/black_dress_woman_walk.png',
        spawnWeight: 1,
        width: 1.8,
        height: 3.0,
        movementBehavior: 'wander_flee',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'blonde_black_dress_woman',
        speed: 4.0,
        damage: 4,
        hp: 130,
        // NPC de un solo sprite: alterna con su versión espejada al caminar.
        texture: 'assets/enemies/blonde_black_dress_woman.png',
        textureWalk: 'assets/enemies/blonde_black_dress_woman_walk.png',
        spawnWeight: 1,
        width: 1.8,
        height: 3.0,
        movementBehavior: 'wander_flee',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'floral_dress_woman',
        speed: 4.0,
        damage: 4,
        hp: 130,
        // NPC de un solo sprite: alterna con su versión espejada al caminar.
        texture: 'assets/enemies/floral_dress_woman.png',
        textureWalk: 'assets/enemies/floral_dress_woman_walk.png',
        spawnWeight: 1,
        width: 1.8,
        height: 3.0,
        movementBehavior: 'wander_flee',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'old_woman',
        speed: 4.0,
        damage: 4,
        hp: 130,
        // NPC de un solo sprite: alterna con su versión espejada al caminar,
        // igual que "pera" y "old_man".
        texture: 'assets/enemies/old_woman.png',
        textureWalk: 'assets/enemies/old_woman_walk.png',
        spawnWeight: 1,
        width: 1.8,
        height: 3.0,
        // La anciana comparte la excepción del anciano y sí ataca.
        movementBehavior: 'chase_attack',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    {
        id: 'skeleton_minigun',
        speed: 3.8,
        damage: 6,
        hp: 780,
        texture: 'assets/enemies/skeleton_minigun.png',
        spriteSheet: {
            columns: 4,
            rows: 5,
            frameWidth: 256,
            frameHeight: 256,
            animations: {
                idle: { row: 0, frames: 4, fps: 4, loop: true },
                walk: { row: 1, frames: 4, fps: 9, loop: true },
                attack: { row: 2, frames: 4, fps: 18, loop: true },
                hurt: { row: 3, frames: 4, fps: 12, loop: false },
                death: { row: 4, frames: 4, fps: 7, loop: false }
            }
        },
        // Enemigo pesado de aparición tardía: mantiene al jugador bajo fuego
        // durante una ráfaga larga y luego deja una ventana para reposicionarse.
        spawnWeight: 1,
        width: 3.8,
        height: 5.0,
        spriteOffsetY: 0.05,
        isShooter: true,
        shootRate: 3600,
        burstCount: 24,
        // Igual que WEAPONS_DATA.AMETRALLADORA: un disparo cada 100 ms.
        burstInterval: 100,
        burstCooldown: 4200,
        shotVisualDuration: 140,
        projectileSpeed: 22.0,
        projectileOffsetY: -0.55,
        projectileSideOffset: 0.72,
        projectileModel: 'tracer',
        projectileSize: 0.2,
        shootSound: 'machinegun',
        // La ametralladora enemiga suena al 50% de la del jugador.
        shootSoundVolume: 0.5,
        sounds: ['roar1', 'grunt1', 'hiss1']
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
