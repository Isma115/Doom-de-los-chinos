// Configuración global de gameplay, audio y asistencia de apuntado.
// Antes vivía en src/Constants.js; se extrae aquí para que sea
// fácil ajustar números sin abrir un fichero de 800 líneas.
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
    // Modo Construcción: sprint con Shift (×3) y noclip de muros/objetos
    // (el suelo sigue siendo sólido).
    BUILD_SPRINT_MULTIPLIER: 3.0,
    // Velocidad al mantener Espacio en construcción. Se aplica en la
    // dirección exacta de la cámara, incluida la inclinación vertical.
    BUILD_FLY_SPEED: 45.0,

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

export const AUDIO_CONFIG = {
    MUSIC_VOLUME: 0.6,
    SFX_VOLUME: 0.8,
    ENEMY_SOUND_MIN_INTERVAL: 5000,
    ENEMY_SOUND_MAX_INTERVAL: 7000,
    ENEMY_SOUND_DISTANCE: 60,
    MAX_SIMULTANEOUS_ENEMY_SOUNDS: 10,
    MAX_VOLUME_MULTIPLIER: 3.0
};

// Imán de cruceta sutil. Solo corrige cuando el jugador ya
// apunta cerca del enemigo (cono pequeño) y sin raycasts para no gastar CPU.
export const AIM_ASSIST = {
    ENABLED: true,
    // Nivel de referencia (5): cono y alcance base. Los demás niveles
    // escalan desde aquí (ver DIST_PER_LEVEL y ANGLE_PER_LEVEL).
    MAX_ANGLE_DEG: 7,
    MAX_DISTANCE: 60,
    // Alcance según nivel (0-10): 15 + nivel * 9.
    // Nivel 1 ≈ 24 m · nivel 5 = 60 m · nivel 10 ≈ 105 m.
    MIN_RANGE: 15,
    DIST_PER_LEVEL: 9,
    // Cono según nivel: 5 + nivel * 0.4.
    // Nivel 1 ≈ 5.4° · nivel 5 = 7° · nivel 10 = 9°.
    MIN_ANGLE_DEG: 5,
    ANGLE_PER_LEVEL: 0.4,
    // Distancia mínima: de cerca no se necesita ayuda.
    MIN_DISTANCE: 2,
    // Fracción del error angular corregida por segundo (3 = ~95% en 1s si
    // el objetivo está quieto; el tope de abajo lo mantiene sutil).
    PULL_PER_SEC: 3.0,
    // Tope de corrección en grados/segundo: el jugador siempre puede más.
    MAX_DEG_PER_SEC: 12,
    // Multiplicador mientras se dispara (mantener el fuego sobre el blanco).
    FIRE_BOOST: 1.4
};
