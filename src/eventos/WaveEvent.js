import * as THREE from '../../node_modules/three/build/three.module.js';
import { ENEMY_TYPES } from '../Constants.js';
import { UIManager } from '../UI.js';

const HUMAN_NPC_TYPE_IDS = [
    'street_npc',
    'street_npc_female',
    'street_npc_phone',
    'old_man',
    'black_hat_man',
    'young_man',
    'middle_aged_man',
    'black_dress_woman',
    'blonde_black_dress_woman',
    'floral_dress_woman',
    'old_woman',
    'old_woman_flag'
];
const HUMAN_NPC_TYPE_SET = new Set([
    ...HUMAN_NPC_TYPE_IDS,
    // El patio también usa esta variante, sin alterar el roster de Parque.
    'curly_black_tshirt_man'
]);

// El encuentro de El Hormiguero se divide en dos zonas. S1-S3 son los
// spawners del patio; S4 se crea al entrar en el almacén de la captura.
const HORMIGUERO_PATIO_SPAWNER_IDS = new Set(['S1', 'S2', 'S3']);
const HORMIGUERO_ROOM_SPAWNER_ID = 'S4';
const HORMIGUERO_PATIO_GATE_IDS = ['patio-entry', 'studio-nook'];
const HORMIGUERO_ROOM_GATE_IDS = ['secret-room-entry'];
const HORMIGUERO_ROOM_BOUNDS = Object.freeze({
    minX: 55,
    maxX: 115,
    minZ: -64,
    maxZ: -20
});
const HORMIGUERO_ROOM_SPAWNER_POSITION = Object.freeze({
    x: 75,
    y: 1,
    z: -45
});
const HORMIGUERO_ROOM_ENEMIES = Object.freeze([
    { type: 'street_npc', count: 5 },
    { type: 'street_npc_female', count: 5 },
    { type: 'street_npc_phone', count: 5 },
    { type: 'old_man', count: 5 }
]);
const HORMIGUERO_PATIO_SPAWN_TARGET = 40;

// La cola del patio está ordenada por amenaza: primero los NPC débiles y
// después los enemigos que aportan más vida, velocidad o daño. Se incluyen
// todas las variantes jugables que tienen recursos visuales en el proyecto.
const HORMIGUERO_PATIO_ENEMIES = Object.freeze([
    // NPC débiles: aparecen primero y dan al jugador una fase de entrada.
    { type: 'street_npc', count: 4 },
    { type: 'street_npc_female', count: 4 },
    { type: 'street_npc_phone', count: 4 },
    { type: 'old_man', count: 1 },
    { type: 'black_hat_man', count: 1 },
    { type: 'curly_black_tshirt_man', count: 1 },
    { type: 'young_man', count: 1 },
    { type: 'middle_aged_man', count: 1 },
    { type: 'black_dress_woman', count: 1 },
    { type: 'blonde_black_dress_woman', count: 1 },
    { type: 'floral_dress_woman', count: 1 },
    { type: 'old_woman', count: 1 },
    { type: 'old_woman_flag', count: 1 },

    // Enemigos de dificultad creciente: cuerpo a cuerpo, rápidos y tiradores.
    { type: 'pablo', count: 2 },
    { type: 'pera', count: 2 },
    { type: 'charo', count: 2 },
    { type: 'charo2', count: 2 },
    { type: 'patica', count: 2 },
    { type: 'trancas_barrancas', count: 2 },
    { type: 'amego', count: 2 },
    { type: 'alien', count: 2 },
    { type: 'skeleton_minigun', count: 2 }
]);

export class WaveEvent {
    constructor(enemyManager, world, audioManager = null, player = null) {
        this.disposed = false;
        this.enemyManager = enemyManager;
        this.world = world;
        this.audioManager = audioManager;
        this.player = player;
        this.genericSpawners = world.getGenericSpawners();
        this.ammoSpawners = world.getAmmoSpawners();
        this.foodSpawners = world.getFoodSpawners();
        this.isHormigueroPatio = world.currentMapName === 'mapa2';
        this.hormigueroDefeated = 0;
        // Mantener el objetivo de progreso del patio separado del número de
        // enemigos disponibles para que el flujo del mapa no cambie.
        this.hormigueroTarget = 30;
        this.hormigueroSpawnTarget = HORMIGUERO_PATIO_SPAWN_TARGET;
        this.ventilationOpen = false;
        this.hormigueroStage = this.isHormigueroPatio ? 'patio' : null;
        this.hormigueroRoomEntered = false;
        this.hormigueroRoomDefeated = 0;
        this.hormigueroRoomTarget = 20;
        this.hormigueroRoomSpawner = null;

        this.enemyManager.setEnemyDefeatedCallback?.(enemy => {
            this.handleEnemyDefeated(enemy);
        });

        this.lastAmmoSpawnTime = 0;
        // Estos contadores avanzan en segundos (delta), no en milisegundos.
        // 30 s evita que la munición desaparezca prácticamente durante toda
        // la partida, sin convertir los spawners en una fuente constante.
        this.ammoSpawnInterval = 30;
        this.foodSpawnInterval = 300;
        this.timeSinceLastAmmoSpawn = 0;
        this.timeSinceLastFoodSpawn = 0;

        this.currentWave = 0;
        this.waveActive = false;
        this.enemiesSpawned = 0;
        this.enemySpawnQueue = [];
        this.enemySpawnInterval = this.isHormigueroPatio ? 200 : 1000;
        this.maxActiveEnemies = 10;
        this.timeSinceLastEnemySpawn = 0;
        this.waveConfig = this.configureWaveData();

        this.lastRoundMusic = null;
        this.roundMusicHistory = [];
        this.rpgPickupSpawned = false;
        this.initialStartTimeout = null;
        this.spawnWaveTimeout = null;
        this.countdownStartTimeout = null;
        this.countdownInterval = null;

        this.initialStartTimeout = setTimeout(() => {
            this.initialStartTimeout = null;
            this.startWave();
        }, 2000);

        this.spawnAmmoAtSpawners();
        this.spawnFoodAtSpawners();
    }

    /**
     * Configure wave data: which spawners to use and which enemies to spawn
     */
    configureWaveData() {
        if (this.isHormigueroPatio) {
            return [
                {
                    spawners: ['S1', 'S2', 'S3'],
                    enemies: HORMIGUERO_PATIO_ENEMIES
                }
            ];
        }

        // Roster humano reutilizable: ocupa la mayoría de los huecos que
        // antes correspondían a las peras en las rondas avanzadas.
        const humanNpcWave = (count = 2) =>
            HUMAN_NPC_TYPE_IDS.map(type => ({ type, count }));

        return [
            // Ronda 1: Los NPCs humanos predominan y la pera queda residual.
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'street_npc', count: 4 },
                    { type: 'street_npc_female', count: 4 },
                    { type: 'street_npc_phone', count: 4 },
                    { type: 'old_man', count: 4 },
                    { type: 'black_hat_man', count: 3 },
                    { type: 'young_man', count: 4 },
                    { type: 'middle_aged_man', count: 4 },
                    { type: 'black_dress_woman', count: 3 },
                    { type: 'blonde_black_dress_woman', count: 3 },
                    { type: 'floral_dress_woman', count: 3 },
                    { type: 'old_woman', count: 3 },
                    { type: 'old_woman_flag', count: 3 },
                    { type: 'pera', count: 1 }
                ]
            },
            // Ronda 2: Más variedad humana, con una única pera residual.
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'street_npc', count: 5 },
                    { type: 'street_npc_female', count: 5 },
                    { type: 'street_npc_phone', count: 5 },
                    { type: 'old_man', count: 4 },
                    { type: 'black_hat_man', count: 4 },
                    { type: 'young_man', count: 4 },
                    { type: 'middle_aged_man', count: 4 },
                    { type: 'black_dress_woman', count: 4 },
                    { type: 'blonde_black_dress_woman', count: 4 },
                    { type: 'floral_dress_woman', count: 4 },
                    { type: 'old_woman', count: 4 },
                    { type: 'old_woman_flag', count: 4 },
                    { type: 'pera', count: 1 },
                    { type: 'trancas_barrancas', count: 4 },
                    { type: 'charo', count: 3 },
                    { type: 'charo2', count: 3 }
                ]
            },
            // Ronda 3: Los humanos siguen siendo la mayoría de los enemigos.
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'street_npc', count: 6 },
                    { type: 'street_npc_female', count: 6 },
                    { type: 'street_npc_phone', count: 6 },
                    { type: 'old_man', count: 6 },
                    { type: 'black_hat_man', count: 5 },
                    { type: 'young_man', count: 6 },
                    { type: 'middle_aged_man', count: 5 },
                    { type: 'black_dress_woman', count: 5 },
                    { type: 'blonde_black_dress_woman', count: 5 },
                    { type: 'floral_dress_woman', count: 5 },
                    { type: 'old_woman', count: 5 },
                    { type: 'old_woman_flag', count: 5 },
                    { type: 'pera', count: 1 },
                    { type: 'trancas_barrancas', count: 6 },
                    { type: 'amego', count: 4 },
                    { type: 'charo', count: 5 },
                    { type: 'charo2', count: 5 }
                ]
            },
            // Ronda 4: Los NPCs ocupan la mayoría de las apariciones de pera.
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pera', count: 1 },
                    ...humanNpcWave(2),
                    { type: 'trancas_barrancas', count: 8 },
                    { type: 'amego', count: 6 },
                    { type: 'patica', count: 5 },
                    { type: 'charo', count: 6 },
                    { type: 'charo2', count: 6 },
                    { type: 'alien', count: 4 }
                ]
            },
            // Ronda 5: Aquí aparecen Pablo, el alien y el esqueleto minigun;
            // la pera sigue siendo la aparición menos común.
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 12 },          // Pablo aparece SOLO a partir de aquí
                    { type: 'pera', count: 1 },
                    ...humanNpcWave(2),
                    { type: 'trancas_barrancas', count: 8 },
                    { type: 'amego', count: 5 },
                    { type: 'patica', count: 6 },
                    { type: 'charo', count: 5 },
                    { type: 'charo2', count: 5 },
                    { type: 'alien', count: 6 },
                    { type: 'skeleton_minigun', count: 3 }
                ]
            },
            // Ronda 6: Aumenta la presión y se mantienen los esqueletos
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 14 },
                    { type: 'pera', count: 1 },
                    ...humanNpcWave(2),
                    { type: 'trancas_barrancas', count: 10 },
                    { type: 'amego', count: 7 },
                    { type: 'patica', count: 7 },
                    { type: 'charo', count: 6 },
                    { type: 'charo2', count: 6 },
                    { type: 'alien', count: 7 },
                    { type: 'skeleton_minigun', count: 4 }
                ]
            },
            // Ronda 7: Más enemigos pesados y dos esqueletos adicionales
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 16 },
                    { type: 'pera', count: 1 },
                    ...humanNpcWave(2),
                    { type: 'trancas_barrancas', count: 12 },
                    { type: 'amego', count: 8 },
                    { type: 'patica', count: 8 },
                    { type: 'charo', count: 7 },
                    { type: 'charo2', count: 7 },
                    { type: 'alien', count: 8 },
                    { type: 'skeleton_minigun', count: 5 }
                ]
            },
            // Ronda 8: Asalto final del Parque
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 18 },
                    { type: 'pera', count: 1 },
                    ...humanNpcWave(2),
                    { type: 'trancas_barrancas', count: 14 },
                    { type: 'amego', count: 9 },
                    { type: 'patica', count: 9 },
                    { type: 'charo', count: 8 },
                    { type: 'charo2', count: 8 },
                    { type: 'alien', count: 9 },
                    { type: 'skeleton_minigun', count: 6 }
                ]
            }
        ];
    }

    /**
         * Start a new wave
         */
    startWave() {
        if (this.currentWave >= this.waveConfig.length) {
            return;
        }

        if (this.isHormigueroPatio && this.hormigueroStage !== 'patio') {
            return;
        }

        this.waveActive = true;
        this.enemiesSpawned = 0;
        this.enemySpawnQueue = [];
        this.timeSinceLastEnemySpawn = 0;

        const waveNumber = this.currentWave + 1;

        if (this.isHormigueroPatio) {
            UIManager.showEventMessage('ENEMIGOS EN EL PATIO - ¡PREPÁRATE!', 3000);

            const waveIndex = this.currentWave;
            this.spawnWaveTimeout = setTimeout(() => {
                this.spawnWaveTimeout = null;
                if (this.waveActive && this.currentWave === waveIndex) {
                    this.spawnEnemiesForWave();
                }
            }, 1000);
            return;
        }

        UIManager.showEventMessage(`RONDA ${waveNumber} - ¡PREPÁRATE!`, 3000);

        if (waveNumber === 4) {
            this.spawnRpgPickup();
        }

        console.log(`Iniciando ronda ${waveNumber}`);

        // Mantener la misma pista durante dos rondas. La primera ronda y
        // todas las impares posteriores inician un nuevo bloque musical
        // (1-2, 3-4, 5-6...).
        const shouldChangeMusic = waveNumber === 1 || waveNumber % 2 === 1;
        if (this.audioManager && shouldChangeMusic) {
            const musicName = this.audioManager.playRandomMusic(
                this.lastRoundMusic,
                0.3,
                this.roundMusicHistory
            );
            if (musicName) {
                this.lastRoundMusic = musicName;
                this.roundMusicHistory.push(musicName);
                console.log(`Reproduciendo ${musicName} en bucle para las rondas ${waveNumber}-${waveNumber + 1}`);
            }
        } else if (this.audioManager) {
            console.log(`Manteniendo ${this.lastRoundMusic || 'la pista actual'} para la ronda ${waveNumber}`);
        }

        const waveIndex = this.currentWave;
        this.spawnWaveTimeout = setTimeout(() => {
            this.spawnWaveTimeout = null;
            if (this.waveActive && this.currentWave === waveIndex) {
                this.spawnEnemiesForWave();
            }
        }, 1000);
    }

    spawnRpgPickup() {
        if (this.rpgPickupSpawned || !this.world?.spawnWeaponPickup) return;

        if (!this.ammoSpawners || this.ammoSpawners.length === 0) {
            console.warn('No hay spawners de munición para colocar el RPG');
            return;
        }

        // Preferir un punto que no tenga una caja de munición sin recoger para
        // que el lanzacohetes sea visible y no quede solapado con otro pickup.
        const freeSpawners = this.ammoSpawners.filter(spawner =>
            !spawner.activeWeapon &&
            (!spawner.activeAmmo || spawner.activeAmmo.userData?.collected)
        );
        const candidates = freeSpawners.length > 0 ? freeSpawners : this.ammoSpawners;
        const spawner = candidates[Math.floor(Math.random() * candidates.length)];
        const spawnPos = spawner.position.clone();

        const pickup = this.world.spawnWeaponPickup('rpg', spawnPos);
        if (!pickup) return;

        spawner.activeWeapon = pickup;
        this.rpgPickupSpawned = true;
        UIManager.showEventMessage(
            'EL LANZACOHETES HA APARECIDO EN EL PARQUE',
            3500
        );
        console.log('RPG disponible durante la ronda 4');
    }

    /**
     * Prepare the enemies for the current wave.
     *
     * The actual spawning is handled from update() so that the wave can keep
     * at most maxActiveEnemies enemies alive at the same time.
     */
    spawnEnemiesForWave() {
        const config = this.waveConfig[this.currentWave];

        // Get spawner positions for this wave
        const activeSpawners = this.genericSpawners.filter(spawner =>
            config.spawners.includes(spawner.id)
        );

        if (activeSpawners.length === 0) {
            console.warn('No hay spawners activos para esta ronda');
            return;
        }

        // Queue each enemy type. Only one entry is consumed every
        // enemySpawnInterval ms; human entries are shuffled below without
        // changing the order of the other enemy types.
        config.enemies.forEach(enemyConfig => {
            const enemyType = ENEMY_TYPES.find(t => t.id === enemyConfig.type);

            if (!enemyType) {
                console.warn(`Tipo de enemigo no encontrado: ${enemyConfig.type}`);
                return;
            }

            const validSpawners = activeSpawners.filter(spawner =>
                this.enemyManager.isSpawnPositionClear(spawner.position, enemyType)
            );

            if (validSpawners.length === 0) {
                console.warn(`No hay spawners libres para ${enemyConfig.type} en esta ronda`);
                return;
            }

            const configuredChance = Number(enemyType.spawnChance);
            const spawnChance = Number.isFinite(configuredChance)
                ? Math.max(0, Math.min(1, configuredChance))
                : 1.0;

            for (let i = 0; i < enemyConfig.count; i++) {
                // En el patio la lista es un encuentro cerrado de 40 enemigos:
                // las probabilidades globales (por ejemplo, la pera al 5%) no
                // deben eliminar tipos de la composición solicitada.
                if (!this.isHormigueroPatio && Math.random() >= spawnChance) continue;

                // Randomly select a spawner from active spawners
                const spawner = validSpawners[Math.floor(Math.random() * validSpawners.length)];

                const spawnPos = this.enemyManager.findSafeSpawnPosition(
                    spawner.position,
                    enemyType
                );

                if (!spawnPos) {
                    console.warn(`Spawn omitido: el spawner ${spawner.id} no tiene espacio libre`);
                    continue;
                }

                this.enemySpawnQueue.push({
                    enemyType,
                    spawnPosition: spawnPos,
                    spawnerId: spawner.id,
                    encounter: this.isHormigueroPatio ? 'patio' : null
                });
            }
        });

        // Randomize only the human NPCs. This keeps every non-human enemy in
        // the configured order while preventing blocks such as all
        // street_npc followed by all street_npc_female from appearing in a
        // predictable sequence.
        const humanQueueEntries = this.enemySpawnQueue.filter(({ enemyType }) =>
            HUMAN_NPC_TYPE_SET.has(enemyType.id)
        );

        for (let i = humanQueueEntries.length - 1; i > 0; i--) {
            const randomIndex = Math.floor(Math.random() * (i + 1));
            [humanQueueEntries[i], humanQueueEntries[randomIndex]] = [
                humanQueueEntries[randomIndex],
                humanQueueEntries[i]
            ];
        }

        let humanQueueIndex = 0;
        this.enemySpawnQueue = this.enemySpawnQueue.map(queueEntry => {
            if (!HUMAN_NPC_TYPE_SET.has(queueEntry.enemyType.id)) {
                return queueEntry;
            }

            return humanQueueEntries[humanQueueIndex++];
        });

        if (this.isHormigueroPatio) {
            this.enemySpawnQueue = this.enemySpawnQueue.slice(0, this.hormigueroSpawnTarget);
        }

        // El primer enemigo aparece al terminar el segundo de preparación;
        // los siguientes respetan el intervalo configurado para el mapa.
        this.timeSinceLastEnemySpawn = this.enemySpawnInterval;

        console.log(`Preparados ${this.enemySpawnQueue.length} enemigos para la ronda ${this.currentWave + 1}`);
    }

    /**
     * Spawn one queued enemy when the interval has elapsed and there is room
     * below the simultaneous-enemy limit.
     */
    updateEnemySpawning(delta) {
        if (!this.waveActive || this.enemySpawnQueue.length === 0) return;

        this.timeSinceLastEnemySpawn += delta * 1000;

        if (this.timeSinceLastEnemySpawn < this.enemySpawnInterval) return;

        // Dying enemies remain in enemyManager.enemies until their death
        // animation finishes, so they correctly count towards the limit.
        if (this.enemyManager.enemies.length >= this.maxActiveEnemies) return;

        const nextEnemy = this.enemySpawnQueue[0];
        const spawnedEnemy = this.enemyManager.spawn(
            performance.now(),
            nextEnemy.enemyType,
            nextEnemy.spawnPosition || this.hormigueroRoomSpawner?.position || null
        );

        if (!spawnedEnemy) {
            // La ronda de la sala debe producir exactamente 20 enemigos. Si
            // el spawner está ocupado en este frame, reintentamos la entrada
            // en lugar de perderla silenciosamente.
            if (nextEnemy.encounter === 'room') {
                this.timeSinceLastEnemySpawn = 0;
                return;
            }

            this.enemySpawnQueue.shift();
            this.timeSinceLastEnemySpawn = 0;
            return;
        }

        this.enemySpawnQueue.shift();
        this.enemiesSpawned++;
        spawnedEnemy.userData.spawnSourceId = nextEnemy.spawnerId || null;
        spawnedEnemy.userData.hormigueroEncounter = nextEnemy.encounter || null;
        spawnedEnemy.userData.isHormigueroPatioEnemy =
            nextEnemy.encounter === 'patio' &&
            HORMIGUERO_PATIO_SPAWNER_IDS.has(nextEnemy.spawnerId);
        this.timeSinceLastEnemySpawn = 0;
    }

    handleEnemyDefeated(enemy) {
        if (!this.isHormigueroPatio || !enemy?.userData) {
            return;
        }

        if (
            this.hormigueroStage === 'patio' &&
            enemy.userData.hormigueroEncounter === 'patio' &&
            enemy.userData.isHormigueroPatioEnemy
        ) {
            this.hormigueroDefeated++;
            if (this.hormigueroDefeated >= this.hormigueroTarget) {
                this.openVentilation();
            }
            return;
        }

        if (
            this.hormigueroStage === 'room' &&
            enemy.userData.hormigueroEncounter === 'room'
        ) {
            this.hormigueroRoomDefeated++;
            if (this.hormigueroRoomDefeated >= this.hormigueroRoomTarget) {
                this.openRoomVentilation();
            }
        }
    }

    openVentilation() {
        if (this.ventilationOpen) return;

        this.ventilationOpen = true;
        this.waveActive = false;
        this.enemySpawnQueue = [];
        this.cancelPendingWaveTransitions();
        this.world?.setVentilationOpen?.(true, HORMIGUERO_PATIO_GATE_IDS);
        UIManager.showEventMessage(
            'Ventilación del patio abierta — VE A LA NUEVA SALA',
            6000
        );

        if (this.audioManager) {
            this.audioManager.stopMusic();
        }

        console.log(`Ventilación abierta tras derrotar ${this.hormigueroDefeated} enemigos`);
    }

    isPlayerInHormigueroRoom(playerPosition) {
        if (!playerPosition) return false;

        return playerPosition.x >= HORMIGUERO_ROOM_BOUNDS.minX &&
            playerPosition.x <= HORMIGUERO_ROOM_BOUNDS.maxX &&
            playerPosition.z >= HORMIGUERO_ROOM_BOUNDS.minZ &&
            playerPosition.z <= HORMIGUERO_ROOM_BOUNDS.maxZ;
    }

    enterHormigueroRoom(playerPosition) {
        if (
            !this.isHormigueroPatio ||
            !this.ventilationOpen ||
            this.hormigueroStage !== 'patio' ||
            !this.isPlayerInHormigueroRoom(playerPosition)
        ) {
            return false;
        }

        this.hormigueroStage = 'room';
        this.hormigueroRoomEntered = true;
        this.hormigueroRoomDefeated = 0;
        this.waveActive = true;
        this.enemiesSpawned = 0;
        this.timeSinceLastEnemySpawn = this.enemySpawnInterval;

        // Los que sigan vivos solo pueden proceder de S1, S2 o S3. Se
        // eliminan por origen, sin tocar enemigos de otros encuentros.
        const removedPatioEnemies = this.enemyManager
            ?.removeEnemiesBySpawnerIds?.([...HORMIGUERO_PATIO_SPAWNER_IDS]) || 0;

        this.enemySpawnQueue = [];
        const roomSpawnerPosition = new THREE.Vector3(
            HORMIGUERO_ROOM_SPAWNER_POSITION.x,
            HORMIGUERO_ROOM_SPAWNER_POSITION.y,
            HORMIGUERO_ROOM_SPAWNER_POSITION.z
        );
        this.hormigueroRoomSpawner = this.world?.addGenericSpawner?.(
            HORMIGUERO_ROOM_SPAWNER_ID,
            roomSpawnerPosition,
            { encounter: 'room' }
        ) || {
            id: HORMIGUERO_ROOM_SPAWNER_ID,
            position: roomSpawnerPosition,
            encounter: 'room'
        };

        // Esta cola no aplica spawnChance: el objetivo del encuentro son
        // exactamente 20 bajas, no hasta 20 intentos de aparición.
        HORMIGUERO_ROOM_ENEMIES.forEach(roomEnemy => {
            const enemyType = ENEMY_TYPES.find(type => type.id === roomEnemy.type);
            if (!enemyType) {
                console.warn(`Tipo de enemigo de sala no encontrado: ${roomEnemy.type}`);
                return;
            }

            for (let i = 0; i < roomEnemy.count; i++) {
                this.enemySpawnQueue.push({
                    enemyType,
                    spawnPosition: this.hormigueroRoomSpawner.position.clone(),
                    spawnerId: HORMIGUERO_ROOM_SPAWNER_ID,
                    encounter: 'room'
                });
            }
        });

        // Las compuertas del conducto que comunican el almacén con el plató
        // se cierran solo después de que el jugador haya cruzado al almacén
        // y permanecen bloqueadas hasta completar las 20 bajas de esta sala.
        HORMIGUERO_ROOM_GATE_IDS.forEach(gateId => {
            this.world?.setVentilationGateOpen?.(gateId, false);
        });

        UIManager.showEventMessage(
            `SALA ASEGURADA — DERROTA ${this.hormigueroRoomTarget} ENEMIGOS`,
            6000
        );
        console.log(
            `Entrada en la sala: ${removedPatioEnemies} enemigos restantes del patio eliminados; ` +
            `${this.enemySpawnQueue.length} enemigos preparados en ${HORMIGUERO_ROOM_SPAWNER_ID}`
        );
        return true;
    }

    openRoomVentilation() {
        if (this.hormigueroStage !== 'room') return;

        this.hormigueroStage = 'complete';
        this.waveActive = false;
        this.enemySpawnQueue = [];
        HORMIGUERO_ROOM_GATE_IDS.forEach(gateId => {
            this.world?.setVentilationGateOpen?.(gateId, true);
        });
        UIManager.showEventMessage('SALA DESPEJADA — ACCESO A LA HABITACIÓN SECRETA ABIERTO', 6000);
        console.log(
            `Acceso a la habitación secreta abierto tras derrotar ${this.hormigueroRoomDefeated} enemigos de la sala`
        );
    }

    /**
     * Check if the current wave is complete
     */
    checkWaveCompletion(playerPosition = null) {
        if (!this.waveActive) return;

        // El patio no usa rondas encadenadas: el acceso se desbloquea al
        // contabilizar el objetivo de bajas, aunque la cola contenga 40
        // enemigos para dar margen al encuentro.
        if (this.isHormigueroPatio) return;

        // Check if all enemies are dead
        const aliveEnemies = this.enemyManager.enemies.length;

        if (
            aliveEnemies === 0 &&
            this.enemySpawnQueue.length === 0 &&
            this.enemiesSpawned > 0
        ) {
            this.onWaveComplete(playerPosition);
        }
    }

    cancelCountdown() {
        if (this.countdownStartTimeout !== null) {
            clearTimeout(this.countdownStartTimeout);
            this.countdownStartTimeout = null;
        }

        if (this.countdownInterval !== null) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        UIManager.hideCountdown();
    }

    cancelPendingWaveTransitions() {
        if (this.initialStartTimeout !== null) {
            clearTimeout(this.initialStartTimeout);
            this.initialStartTimeout = null;
        }

        if (this.spawnWaveTimeout !== null) {
            clearTimeout(this.spawnWaveTimeout);
            this.spawnWaveTimeout = null;
        }

        this.cancelCountdown();
    }

    skipCurrentWave(playerPosition = null) {
        if (this.currentWave >= this.waveConfig.length) {
            return false;
        }

        this.cancelPendingWaveTransitions();
        this.waveActive = false;
        this.enemySpawnQueue = [];
        this.enemiesSpawned = 0;
        this.timeSinceLastEnemySpawn = 0;

        // El botón de debug salta la ronda de forma limpia: no deja enemigos
        // ni proyectiles de la ronda anterior atacando durante la siguiente.
        const activeEnemies = [...(this.enemyManager?.enemies || [])];
        activeEnemies.forEach(enemy => {
            this.enemyManager.finalizeEnemyRemoval?.(enemy);
        });

        const activeProjectiles = [...(this.enemyManager?.projectiles || [])];
        activeProjectiles.forEach(projectile => {
            if (projectile?.parent) projectile.parent.remove(projectile);
        });
        if (Array.isArray(this.enemyManager?.projectiles)) {
            this.enemyManager.projectiles.length = 0;
        }

        console.log(`Debug: saltando a la ronda ${this.currentWave + 2}`);
        this.onWaveComplete(playerPosition, { immediate: true });
        return true;
    }

    /**
     * Called when a wave is completed
     */
    onWaveComplete(playerPosition = null, options = {}) {
        this.waveActive = false;
        this.currentWave++;

        const waveNumber = this.currentWave;
        UIManager.showEventMessage(`¡RONDA ${waveNumber} COMPLETADA!`, 3000);

        console.log(`Ronda ${waveNumber} completada`);

        // Spawn ammo at the end of the round
        this.spawnAmmoAtSpawners(true);

        // Start next wave after countdown
        if (this.currentWave < this.waveConfig.length) {
            if (options.immediate) {
                this.startWave();
            } else {
                // ⏱️ Countdown de 5 segundos antes de la siguiente ronda
                this.startCountdown(5, () => this.startWave());
            }
        } else {
            // All waves completed
            this.world?.spawnExitPortal?.(playerPosition, this.audioManager);
            if (this.audioManager) {
                this.audioManager.stopMusic();
            }
        }
    }

    /**
     * Start a countdown timer with UI display
     * @param {number} seconds - Countdown duration in seconds
     * @param {Function} callback - Function to call when countdown finishes
     */
    startCountdown(seconds, callback) {
        this.cancelCountdown();
        let remaining = seconds;

        // Mostrar mensaje inicial después de un pequeño delay para que se vea el mensaje de ronda completada
        this.countdownStartTimeout = setTimeout(() => {
            this.countdownStartTimeout = null;
            UIManager.showCountdown(remaining);

            const countdownInterval = setInterval(() => {
                remaining--;

                if (remaining > 0) {
                    UIManager.showCountdown(remaining);
                } else {
                    UIManager.hideCountdown();
                    clearInterval(countdownInterval);
                    if (this.countdownInterval === countdownInterval) {
                        this.countdownInterval = null;
                    }
                    if (callback) callback();
                }
            }, 1000);
            this.countdownInterval = countdownInterval;
        }, 2000); // Esperar 2 segundos después de mostrar "RONDA COMPLETADA"
    }

    /**
     * Update method called from EventManager
     */
    update(delta, playerPosition = null) {
        if (this.disposed) return;
        this.updateEnemySpawning(delta);
        this.checkWaveCompletion(playerPosition);

        if (this.isHormigueroPatio) {
            this.enterHormigueroRoom(playerPosition);
        }

        this.timeSinceLastAmmoSpawn += delta;
        this.timeSinceLastFoodSpawn += delta;

        if (this.timeSinceLastAmmoSpawn >= this.ammoSpawnInterval) {
            this.spawnAmmoAtSpawners();
            this.timeSinceLastAmmoSpawn = 0;
        }

        if (this.timeSinceLastFoodSpawn >= this.foodSpawnInterval) {
            this.spawnFoodAtSpawners();
            this.timeSinceLastFoodSpawn = 0;
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.cancelPendingWaveTransitions();
        this.enemyManager?.setEnemyDefeatedCallback?.(null);
        this.enemySpawnQueue = [];
        this.world = null;
        this.enemyManager = null;
        this.audioManager = null;
        this.player = null;
    }

    spawnAmmoAtSpawners() {
        if (!this.ammoSpawners || this.ammoSpawners.length === 0) return;

        console.log(`Spawning ammo at SMuni locations...`);

        this.ammoSpawners.forEach(spawner => {
            // Sistema anti-duplicados: verificar si ya hay munición activa sin recoger
            if (spawner.activeAmmo && !spawner.activeAmmo.userData.collected) {
                console.log(`Spawner en (${spawner.position.x}, ${spawner.position.z}) ya tiene munición activa, saltando...`);
                return;
            }

            const spawnPos = spawner.position.clone();
            spawnPos.x += (Math.random() - 0.5) * 2;
            spawnPos.z += (Math.random() - 0.5) * 2;

            const type = this.getRandomAmmoType();

            // Guardar referencia a la munición spawneada para el sistema anti-duplicados
            const ammoSprite = this.world.spawnAmmo(type, spawnPos);
            spawner.activeAmmo = ammoSprite;
        });
    }

    canSpawnRpgAmmo() {
        return this.world?.currentMapName === 'mapa1' &&
            this.player?.weaponSystem?.isWeaponUnlocked?.('rpg') === true;
    }

    getRandomAmmoType() {
        // El RPG solo entra en la tabla de Parque cuando el jugador ya lo ha
        // recogido o lo ha desbloqueado mediante Debug.
        if (this.canSpawnRpgAmmo() && Math.random() < 0.18) {
            return 'rpg';
        }

        const rand = Math.random();
        if (rand < 0.33) return 'pistol';
        if (rand < 0.66) return 'machinegun';
        return 'shotgun';
    }

    spawnFoodAtSpawners() {
        if (!this.foodSpawners || this.foodSpawners.length === 0) return;

        console.log(`Spawning food at SComida locations...`);

        this.foodSpawners.forEach(spawner => {
            // Sistema anti-duplicados: verificar si ya hay comida activa sin recoger
            if (spawner.activeFood && !spawner.activeFood.userData.collected) {
                console.log(`Spawner de comida en (${spawner.position.x}, ${spawner.position.z}) ya tiene comida activa, saltando...`);
                return;
            }

            const spawnPos = spawner.position.clone();
            spawnPos.x += (Math.random() - 0.5) * 2;
            spawnPos.z += (Math.random() - 0.5) * 2;

            // Guardar referencia a la comida spawneada para el sistema anti-duplicados
            const foodSprite = this.world.spawnFood(spawnPos);
            spawner.activeFood = foodSprite;
        });
    }
}
