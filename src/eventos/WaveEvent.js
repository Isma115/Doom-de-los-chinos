/*sección [CONSTRUCTOR Y CONFIGURACIÓN DE OLEADAS] Inicialización y definición de datos de cada ronda*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { ENEMY_TYPES } from '../Constants.js';
import { UIManager } from '../UI.js';

export class WaveEvent {
    constructor(enemyManager, world) {
    this.enemyManager = enemyManager;
    this.world = world;
    this.genericSpawners = world.getGenericSpawners();
    this.ammoSpawners = world.getAmmoSpawners();
    this.foodSpawners = world.getFoodSpawners();

    this.lastAmmoSpawnTime = 0;
    this.ammoSpawnInterval = 300;
    this.timeSinceLastAmmoSpawn = 0;
    this.timeSinceLastFoodSpawn = 0;

    this.currentWave = 0;
    this.waveActive = false;
    this.enemiesSpawned = 0;
    this.waveConfig = this.configureWaveData();

    // NUEVA ESTRUCTURA: Control de música LPDPM para mapa de fortaleza
    this.isFortalezaMap = false;
    this.lpdpmMusicPlaying = false;

    setTimeout(() => this.startWave(), 2000);

    this.spawnAmmoAtSpawners();
    this.spawnFoodAtSpawners();
}

    /**
     * Configure wave data: which spawners to use and which enemies to spawn
     */
    configureWaveData() {
    return [
        // Ronda 1: Solo enemigos básicos (sin pablo)
        {
            spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
            enemies: [
                { type: 'pera', count: 15 }
            ]
        },
        // Ronda 2: Más variedad, pero todavía sin pablo
        {
            spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
            enemies: [
                { type: 'pera', count: 12 },
                { type: 'trancas_barrancas', count: 4 },
                { type: 'charo', count: 3 },
                { type: 'charo2', count: 3 }
            ]
        },
        // Ronda 3
        {
            spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
            enemies: [
                { type: 'pera', count: 14 },
                { type: 'trancas_barrancas', count: 6 },
                { type: 'amego', count: 4 },
                { type: 'charo', count: 5 },
                { type: 'charo2', count: 5 }
            ]
        },
        // Ronda 4
        {
            spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
            enemies: [
                { type: 'pera', count: 12 },
                { type: 'trancas_barrancas', count: 8 },
                { type: 'amego', count: 6 },
                { type: 'patica', count: 5 },
                { type: 'charo', count: 6 },
                { type: 'charo2', count: 6 }
            ]
        },
        // Ronda 5: Aquí aparece Pablo por primera vez (y en mayor cantidad)
        {
            spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
            enemies: [
                { type: 'pablo', count: 12 },          // Pablo aparece SOLO a partir de aquí
                { type: 'pera', count: 10 },
                { type: 'trancas_barrancas', count: 8 },
                { type: 'amego', count: 5 },
                { type: 'patica', count: 6 },
                { type: 'charo', count: 5 },
                { type: 'charo2', count: 5 }
            ]
        }
        // Si añades más rondas en el futuro, puedes seguir incluyendo a Pablo aquí
    ];
}

/*[Fin de sección]*/

    /*sección [GESTIÓN DE OLEADAS] Inicio y spawn de enemigos por ronda*/
/**
     * Start a new wave
     */
    startWave() {
    if (this.currentWave >= this.waveConfig.length) {
        UIManager.showEventMessage('¡TODAS LAS RONDAS COMPLETADAS! ¡VICTORIA!', 5000);
        return;
    }

    this.waveActive = true;
    this.enemiesSpawned = 0;

    const waveNumber = this.currentWave + 1;
    UIManager.showEventMessage(`RONDA ${waveNumber} - ¡PREPÁRATE!`, 3000);

    console.log(`Iniciando ronda ${waveNumber}`);

    // NUEVA ESTRUCTURA: Controlar música LPDPM en rondas 1 y 2 del mapa fortaleza
    if (this.isFortalezaMap && (waveNumber === 1 || waveNumber === 2)) {
        if (!this.lpdpmMusicPlaying && this.audioManager) {
            this.audioManager.stopMusic();
            this.audioManager.playMusic('lpdpm', 0.3);
            this.lpdpmMusicPlaying = true;
            console.log('Reproduciendo música LPDPM para ronda', waveNumber);
        }
    } else if (this.isFortalezaMap && waveNumber === 3 && this.lpdpmMusicPlaying) {
        if (this.audioManager) {
            this.audioManager.stopMusic();
            this.audioManager.playMusic('background', 0.3);
            this.lpdpmMusicPlaying = false;
            console.log('Deteniendo música LPDPM en ronda 3');
        }
    }

    setTimeout(() => this.spawnEnemiesForWave(), 1000);
}

    /**
     * Spawn enemies for the current wave
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

        // Spawn each enemy type
        config.enemies.forEach(enemyConfig => {
            const enemyType = ENEMY_TYPES.find(t => t.id === enemyConfig.type);

            if (!enemyType) {
                console.warn(`Tipo de enemigo no encontrado: ${enemyConfig.type}`);
                return;
            }

            for (let i = 0; i < enemyConfig.count; i++) {
                // Randomly select a spawner from active spawners
                const spawner = activeSpawners[Math.floor(Math.random() * activeSpawners.length)];

                // Clone the position to avoid modifying the original
                const spawnPos = spawner.position.clone();

                // Add small random offset to avoid spawning exactly on top of each other
                spawnPos.x += (Math.random() - 0.5) * 2;
                spawnPos.z += (Math.random() - 0.5) * 2;

                // Spawn the enemy
                this.enemyManager.spawn(performance.now(), enemyType, spawnPos);
                this.enemiesSpawned++;
            }
        });

        console.log(`Spawneados ${this.enemiesSpawned} enemigos para la ronda ${this.currentWave + 1}`);
    }

/*[Fin de sección]*/

    /*sección [FINALIZACIÓN Y COUNTDOWN] Detección de finalización de ronda y cuenta regresiva*/
/**
     * Check if the current wave is complete
     */
    checkWaveCompletion() {
        if (!this.waveActive) return;

        // Check if all enemies are dead
        const aliveEnemies = this.enemyManager.enemies.length;

        if (aliveEnemies === 0 && this.enemiesSpawned > 0) {
            this.onWaveComplete();
        }
    }

    /**
     * Called when a wave is completed
     */
    onWaveComplete() {
        this.waveActive = false;
        this.currentWave++;

        const waveNumber = this.currentWave;
        UIManager.showEventMessage(`¡RONDA ${waveNumber} COMPLETADA!`, 3000);

        console.log(`Ronda ${waveNumber} completada`);

        // Spawn ammo at the end of the round
        this.spawnAmmoAtSpawners(true);

        // Start next wave after countdown
        if (this.currentWave < this.waveConfig.length) {
            // ⏱️ Countdown de 5 segundos antes de la siguiente ronda
            this.startCountdown(5, () => this.startWave());
        } else {
            // All waves completed
            setTimeout(() => {
                UIManager.showEventMessage('¡TODAS LAS RONDAS COMPLETADAS! ¡VICTORIA!', 5000);
            }, 3000);
        }
    }

    /**
     * Start a countdown timer with UI display
     * @param {number} seconds - Countdown duration in seconds
     * @param {Function} callback - Function to call when countdown finishes
     */
    startCountdown(seconds, callback) {
        let remaining = seconds;

        // Mostrar mensaje inicial después de un pequeño delay para que se vea el mensaje de ronda completada
        setTimeout(() => {
            UIManager.showCountdown(remaining);

            const countdownInterval = setInterval(() => {
                remaining--;

                if (remaining > 0) {
                    UIManager.showCountdown(remaining);
                } else {
                    UIManager.hideCountdown();
                    clearInterval(countdownInterval);
                    if (callback) callback();
                }
            }, 1000);
        }, 2000); // Esperar 2 segundos después de mostrar "RONDA COMPLETADA"
    }

/*[Fin de sección]*/

    /*sección [ACTUALIZACIÓN Y SPAWNERS] Bucle de actualización y spawn de munición/comida*/
/**
     * Update method called from EventManager
     */
    update(delta) {
    this.checkWaveCompletion();

    this.timeSinceLastAmmoSpawn += delta;
    this.timeSinceLastFoodSpawn += delta;

    if (this.timeSinceLastAmmoSpawn >= this.ammoSpawnInterval) {
        this.spawnAmmoAtSpawners();
        this.timeSinceLastAmmoSpawn = 0;
        UIManager.showEventMessage('¡SUMINISTROS DE MUNICIÓN HAN LLEGADO!', 3000);
    }

    if (this.timeSinceLastFoodSpawn >= this.ammoSpawnInterval) {
        this.spawnFoodAtSpawners();
        this.timeSinceLastFoodSpawn = 0;
    }
}

    spawnAmmoAtSpawners() {
        if (!this.ammoSpawners || this.ammoSpawners.length === 0) return;

        console.log(`Spawning ammo at SMuni locations...`);

        this.ammoSpawners.forEach(spawner => {
            const spawnPos = spawner.position.clone();
            spawnPos.x += (Math.random() - 0.5) * 2;
            spawnPos.z += (Math.random() - 0.5) * 2;

            const type = Math.random() > 0.5 ? 'pistol' : 'machinegun';
            this.world.spawnAmmo(type, spawnPos);
        });
    }

    spawnFoodAtSpawners() {
        if (!this.foodSpawners || this.foodSpawners.length === 0) return;

        console.log(`Spawning food at SComida locations...`);

        this.foodSpawners.forEach(spawner => {
            const spawnPos = spawner.position.clone();
            spawnPos.x += (Math.random() - 0.5) * 2;
            spawnPos.z += (Math.random() - 0.5) * 2;

            this.world.spawnFood(spawnPos);
        });
    }
}
/*[Fin de sección]*/
