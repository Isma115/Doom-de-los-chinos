// Configuración y estadísticas de cada tipo de enemigo.
// Refactor: los 10 NPC humanos casi idénticos se generan con humanNPC()
// y los spritesheets 4x5 con spriteSheet4x5(). Mismos valores que antes.

const DEFAULT_SOUNDS = ['grunt1', 'hiss1', 'growl2'];

/** NPC humano de un solo sprite (alterna con versión espejada al caminar). */
export function humanNPC(id, texture, {
    speed = 4.0,
    damage = 4,
    hp = 65,
    spawnWeight = 1,
    width = 1.8,
    height = 3.0,
    movementBehavior = 'wander_flee',
    sounds = DEFAULT_SOUNDS,
} = {}) {
    return {
        id, speed, damage, hp,
        texture,
        textureWalk: texture.replace('.png', '_walk.png'),
        spawnWeight, width, height,
        movementBehavior,
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: [...sounds],
        isMelee: true
    };
}

/** Spritesheet humanoide estándar 4 columnas x 5 filas (idle/walk/attack/hurt/death). */
export function spriteSheet4x5(frameWidth, frameHeight, {
    idleFps = 4, walkFps = 8, attackFps = 8, hurtFps = 10, deathFps = 7,
    attackLoop = false,
} = {}) {
    return {
        columns: 4, rows: 5, frameWidth, frameHeight,
        animations: {
            idle: { row: 0, frames: 4, fps: idleFps, loop: true },
            walk: { row: 1, frames: 4, fps: walkFps, loop: true },
            attack: { row: 2, frames: 4, fps: attackFps, loop: attackLoop },
            hurt: { row: 3, frames: 4, fps: hurtFps, loop: false },
            death: { row: 4, frames: 4, fps: deathFps, loop: false }
        }
    };
}

export const ENEMY_TYPES = [
    {
        id: 'pablo',
        speed: 4.5,
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
        speed: 7.5,
        damage: 6,
        hp: 160,
        texture: 'assets/enemies/pera.png',
        textureWalk: 'assets/enemies/pera_walk.png',
        spawnWeight: 0,
        spawnChance: 0.05,
        width: 2.5,
        height: 3.25,
        projectileSize: 0.25,
        sounds: ['grunt1', 'hiss1', 'growl2']
    },
    {
        id: 'patica',
        speed: 3.0,
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
        speed: 18.0,
        damage: 12,
        hp: 80,
        texture: 'assets/enemies/trancas-barrancas.png',
        textureWalk: 'assets/enemies/trancas-barrancas.png',
        spawnWeight: 1,
        width: 3,
        height: 4,
        projectileSize: 0.25,
        sounds: ['hiss1', 'growl2', 'grunt1']
    },
    {
        id: 'amego',
        speed: 15.0,
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
        speed: 5.0,
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
        speed: 9.0,
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
        speed: 11.0,
        damage: 16,
        hp: 210,
        texture: 'assets/enemies/medium_med2.png',
        textureWalk: 'assets/enemies/medium_med2_walk.png',
        spawnWeight: 2,
        projectileSize: 0.35,
        sounds: ['roar1', 'growl2', 'grunt2']
    },
    {
        id: 'charo',
        speed: 8.0,
        damage: 9,
        hp: 135,
        texture: 'assets/enemies/charo1.png',
        textureWalk: 'assets/enemies/charo1.png',
        spawnWeight: 2,
        width: 3.5,
        height: 4.5,
        projectileSize: 0.25,
        sounds: ['grunt2', 'hiss1', 'growl1'],
        isMelee: true
    },
    {
        id: 'charo2',
        speed: 8.0,
        damage: 9,
        hp: 135,
        texture: 'assets/enemies/charo2.png',
        textureWalk: 'assets/enemies/charo2.png',
        spawnWeight: 2,
        width: 3.5,
        height: 4.5,
        projectileSize: 0.25,
        sounds: ['grunt2', 'hiss1', 'growl1'],
        isMelee: true
    },
    {
        id: 'alien',
        speed: 6.5,
        damage: 12,
        hp: 180,
        texture: 'assets/enemies/alien.png',
        spriteSheet: spriteSheet4x5(256, 256, { attackFps: 10, hurtFps: 12 }),
        spawnWeight: 0,
        width: 2.24,
        height: 3.52,
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
        hp: 45,
        texture: 'assets/npcs/street_npc.png',
        spriteSheet: spriteSheet4x5(280, 280),
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
        id: 'street_npc_female',
        speed: 5.2,
        damage: 3,
        hp: 45,
        texture: 'assets/npcs/street_npc_female.png?v=2',
        spriteSheet: spriteSheet4x5(280, 280),
        spawnWeight: 0,
        width: 1.9,
        height: 3.15,
        movementBehavior: 'wander_flee',
        spriteOffsetY: -0.10,
        projectileSize: 0.2,
        sounds: ['grunt1', 'hiss1', 'growl2'],
        isMelee: true
    },
    // NPCs de un solo sprite: generados por factoría (mismos valores que antes).
    humanNPC('street_npc_phone', 'assets/npcs/street_npc_phone.png', { speed: 5.2, damage: 3, hp: 45, spawnWeight: 0, width: 1.9, height: 3.15 }),
    humanNPC('old_man', 'assets/enemies/old_man.png', { movementBehavior: 'chase_attack' }),
    humanNPC('black_hat_man', 'assets/enemies/black_hat_man.png'),
    humanNPC('curly_black_tshirt_man', 'assets/enemies/curly_black_tshirt_man.png'),
    humanNPC('young_man', 'assets/enemies/young_man.png'),
    humanNPC('middle_aged_man', 'assets/enemies/middle_aged_man.png'),
    humanNPC('black_dress_woman', 'assets/enemies/black_dress_woman.png'),
    humanNPC('blonde_black_dress_woman', 'assets/enemies/blonde_black_dress_woman.png'),
    humanNPC('floral_dress_woman', 'assets/enemies/floral_dress_woman.png'),
    humanNPC('old_woman', 'assets/enemies/old_woman.png', { movementBehavior: 'chase_attack' }),
    {
        ...humanNPC('old_woman_flag', 'assets/enemies/old_woman_flag.png', { movementBehavior: 'chase_attack' }),
        damage: 5,
        hp: 70,
        spawnWeight: 0,
    },
    {
        id: 'skeleton_minigun',
        speed: 3.8,
        damage: 6,
        hp: 780,
        texture: 'assets/enemies/skeleton_minigun.png',
        spriteSheet: spriteSheet4x5(256, 256, { walkFps: 9, attackFps: 18, hurtFps: 12, attackLoop: true }),
        spawnWeight: 1,
        width: 3.8,
        height: 5.0,
        spriteOffsetY: 0.05,
        isShooter: true,
        shootRate: 3600,
        burstCount: 24,
        burstInterval: 100,
        burstCooldown: 4200,
        shotVisualDuration: 140,
        projectileSpeed: 22.0,
        projectileOffsetY: -0.55,
        projectileSideOffset: 0.72,
        projectileModel: 'tracer',
        projectileSize: 0.2,
        shootSound: 'machinegun',
        shootSoundVolume: 0.5,
        sounds: ['roar1', 'grunt1', 'hiss1']
    }
];

export const ENEMY_BY_ID = new Map(ENEMY_TYPES.map(t => [t.id, t]));

export function getEnemyType(id) {
    return ENEMY_BY_ID.get(id) ?? null;
}

// Efecto de esqueleto ensangrentado para enemigos de sprite individual.
export const GENERIC_DEATH_SPRITE_SHEET = {
    texture: 'assets/enemies/generic_gore_death.png',
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
    offsetY: -0.15,
    corpseLifetime: 12000,
    maxCorpses: 20,
    animations: {
        death: { row: 0, frames: 6, fps: 12, loop: false }
    }
};

// Sprites grandes para el impacto inmediato de los disparos.
export const HIT_BLOOD_SPRITE_VARIANTS = [
    'assets/textures/hit_blood_cloud_variant_1.png',
    'assets/textures/hit_blood_cloud_variant_2.png',
    'assets/textures/hit_blood_cloud_variant_3.png',
    'assets/textures/hit_blood_cloud_variant_4.png'
];
