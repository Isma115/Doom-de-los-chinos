import * as THREE from '../../node_modules/three/build/three.module.js';
import { ENEMY_TYPES } from '../Constants.js';
import { UIManager } from '../UI.js';

export class WaveEvent {
    constructor(enemyManager, world, audioManager = null, player = null) {
        this.enemyManager = enemyManager;
        this.world = world;
        this.audioManager = audioManager;
        this.player = player;
        this.genericSpawners = world.getGenericSpawners();
        this.ammoSpawners = world.getAmmoSpawners();
        this.foodSpawners = world.getFoodSpawners();

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
        this.enemySpawnInterval = 1000;
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
        // Roster humano reutilizable: ocupa la mayoría de los huecos que
        // antes correspondían a las peras en las rondas avanzadas.
        const humanNpcTypes = [
            'street_npc',
            'street_npc_female',
            'street_npc_phone',
            'old_man',
            'young_man',
            'middle_aged_man',
            'black_dress_woman',
            'blonde_black_dress_woman',
            'floral_dress_woman',
            'old_woman'
        ];
        const humanNpcWave = (count = 2) => humanNpcTypes.map(type => ({ type, count }));

        return [
            // Ronda 1: Los NPCs humanos predominan y la pera queda residual.
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'street_npc', count: 4 },
                    { type: 'street_npc_female', count: 4 },
                    { type: 'street_npc_phone', count: 4 },
                    { type: 'old_man', count: 4 },
                    { type: 'young_man', count: 4 },
                    { type: 'middle_aged_man', count: 4 },
                    { type: 'black_dress_woman', count: 3 },
                    { type: 'blonde_black_dress_woman', count: 3 },
                    { type: 'floral_dress_woman', count: 3 },
                    { type: 'old_woman', count: 3 },
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
                    { type: 'young_man', count: 4 },
                    { type: 'middle_aged_man', count: 4 },
                    { type: 'black_dress_woman', count: 4 },
                    { type: 'blonde_black_dress_woman', count: 4 },
                    { type: 'floral_dress_woman', count: 4 },
                    { type: 'old_woman', count: 4 },
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
                    { type: 'young_man', count: 6 },
                    { type: 'middle_aged_man', count: 5 },
                    { type: 'black_dress_woman', count: 5 },
                    { type: 'blonde_black_dress_woman', count: 5 },
                    { type: 'floral_dress_woman', count: 5 },
                    { type: 'old_woman', count: 5 },
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

        this.waveActive = true;
        this.enemiesSpawned = 0;
        this.enemySpawnQueue = [];
        this.timeSinceLastEnemySpawn = 0;

        const waveNumber = this.currentWave + 1;
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

        // Queue each enemy type. The queue keeps the previous order of the
        // wave, but only one entry is consumed every enemySpawnInterval ms.
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
                if (Math.random() >= spawnChance) continue;

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
                    spawnPosition: spawnPos
                });
            }
        });

        // The first enemy can appear as soon as the wave's one-second
        // preparation delay ends. Subsequent enemies respect the one-second gap.
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
            nextEnemy.spawnPosition
        );

        if (!spawnedEnemy) {
            this.enemySpawnQueue.shift();
            this.timeSinceLastEnemySpawn = 0;
            return;
        }

        this.enemySpawnQueue.shift();
        this.enemiesSpawned++;
        this.timeSinceLastEnemySpawn = 0;
    }

    /**
     * Check if the current wave is complete
     */
    checkWaveCompletion(playerPosition = null) {
        if (!this.waveActive) return;

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
        this.updateEnemySpawning(delta);
        this.checkWaveCompletion(playerPosition);

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
