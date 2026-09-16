// Spawns de enemigos por tick, extraído de Game.animate (main.js).
// Recibe `game` explícito para no depender de la clase Game.
import { ENEMY_TYPES, CONFIG } from '../Constants.js';

export function updateSpawns(game, time) {
            const enemySpawns = game.world.getEnemySpawns();
            enemySpawns.forEach(spawn => {
                if (!spawn.isActive) return;

                if (spawn.spawnedCount >= spawn.maxSpawns) {
                    spawn.isActive = false;
                    return;
                }

                const currentSpawnRate = spawn.spawnRate || CONFIG.ENEMY_SPAWN_RATE;

                if (time - spawn.lastSpawnTime > currentSpawnRate) {
                    spawn.lastSpawnTime = time;

                    const enemyType = ENEMY_TYPES.find(t => t.id === spawn.type);

                    if (enemyType) {
                        game.enemyManager.spawn(time, enemyType, spawn.position);
                    } else {
                        game.enemyManager.spawn(time, null, spawn.position);
                    }

                    spawn.spawnedCount++;

                    if (spawn.spawnedCount >= spawn.maxSpawns) {
                        spawn.isActive = false;
                    }
                }
            });
}
