/*sección [GESTIÓN DE RONDAS] Sistema de rondas con spawners genéricos*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { ENEMY_TYPES } from '../Constants.js';
import { UIManager } from '../UI.js';

export class WaveEvent {
    constructor(enemyManager, world) {
        this.enemyManager = enemyManager;
        this.world = world;
        this.genericSpawners = world.getGenericSpawners();
        this.ammoSpawners = world.getAmmoSpawners();

        this.lastAmmoSpawnTime = 0;
        this.ammoSpawnInterval = 300; // 300 seconds
        this.timeSinceLastAmmoSpawn = 0;

        this.currentWave = 0;
        this.waveActive = false;
        this.enemiesSpawned = 0;
        this.waveConfig = this.configureWaveData();

        // Start first wave automatically after a brief delay
        setTimeout(() => this.startWave(), 2000);

        // Spawn initial ammo
        this.spawnAmmoAtSpawners(true);
    }

    /**
     * Configure wave data: which spawners to use and which enemies to spawn
     */
    configureWaveData() {
        return [
            // Wave 1: 20 enemies total
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 8 },
                    { type: 'pera', count: 7 },
                ]
            },
            // Wave 2: 30 enemies total
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 10 },
                    { type: 'pera', count: 8 },
                    { type: 'patica', count: 5 }
                ]
            },
            // Wave 3: 40 enemies total
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 10 },
                    { type: 'pera', count: 10 },
                    { type: 'patica', count: 7 },
                ]
            },
            // Wave 4: 50 enemies total
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 12 },
                    { type: 'pera', count: 10 },
                    { type: 'patica', count: 8 },
                ]
            },
            // Wave 5: 60 enemies total
            {
                spawners: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
                enemies: [
                    { type: 'pablo', count: 15 },
                    { type: 'pera', count: 12 },
                    { type: 'patica', count: 10 },
                ]
            }
        ];
    }

    /**
     * Start a new wave
     */
    startWave() {
        if (this.currentWave >= this.waveConfig.length) {
            // All waves completed
            UIManager.showEventMessage('¡TODAS LAS RONDAS COMPLETADAS! ¡VICTORIA!', 5000);
            return;
        }

        this.waveActive = true;
        this.enemiesSpawned = 0;

        const waveNumber = this.currentWave + 1;
        UIManager.showEventMessage(`RONDA ${waveNumber} - ¡PREPÁRATE!`, 3000);

        console.log(`Iniciando ronda ${waveNumber}`);

        // Spawn enemies after showing message
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

        // Start next wave after a delay
        if (this.currentWave < this.waveConfig.length) {
            setTimeout(() => this.startWave(), 4000);
        } else {
            // All waves completed
            setTimeout(() => {
                UIManager.showEventMessage('¡TODAS LAS RONDAS COMPLETADAS! ¡VICTORIA!', 5000);
            }, 3000);
        }
    }

    /**
     * Update method called from EventManager
     */
    update(delta) {
        this.checkWaveCompletion();

        // Update ammo spawn timer
        this.timeSinceLastAmmoSpawn += delta;
        if (this.timeSinceLastAmmoSpawn >= this.ammoSpawnInterval) {
            this.spawnAmmoAtSpawners(false);
            this.spawnAmmoAtSpawners();
            this.timeSinceLastAmmoSpawn = 0;
            UIManager.showEventMessage('¡SUMINISTROS DE MUNICIÓN HAN LLEGADO!', 3000);
        }
    }

    spawnAmmoAtSpawners() {
        if (!this.ammoSpawners || this.ammoSpawners.length === 0) return;

        console.log(`Spawning ammo at SMuni locations...`);

        this.ammoSpawners.forEach(spawner => {
            // Clone position to avoid modifying the spawner's position reference
            const spawnPos = spawner.position.clone();

            // Add small random offset
            spawnPos.x += (Math.random() - 0.5) * 2;
            spawnPos.z += (Math.random() - 0.5) * 2;

            // Randomly choose one
            const type = Math.random() > 0.5 ? 'pistol' : 'machinegun';
            this.world.spawnAmmo(type, spawnPos);
        });
    }
}
/*[Fin de sección]*/
