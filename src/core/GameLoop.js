// Bucle principal de renderizado, extraído de Game.animate (main.js).
// Game conserva el método animate() como fachada que arranca el loop.
import { UIManager } from '../UI.js';
import { Door } from '../entities/Door.js';
import * as SpawnDirector from './SpawnDirector.js';

export class GameLoop {
    constructor(game) {
        this.game = game;
        this.running = false;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.frame();
    }

    frame() {
        requestAnimationFrame(() => this.frame());
        const game = this.game;
        this.updateFPSCounter();

        if (game.player?.isDead) {
            const time = performance.now();
            const delta = (time - game.prevTime) / 1000;

            game.player.updateDeath(delta);
            game.prevTime = time;
            game.renderer.render(game.scene, game.camera);
            return;
        }

        //  Lógica de Actualización Main
        if (game.isPaused) {
            game.renderer.render(game.scene, game.camera);
            return;
        }

        const time = performance.now();
        const delta = (time - game.prevTime) / 1000;

        //  Actualización de Lógica
        if (game.player && !game.player.isGameOver) {
            game.player.update(delta);

            // Los portales de salida se atraviesan al llegar a ellos; no
            // requieren una interacción adicional del jugador.
            if (game.tryTransitionThroughExitPortal()) {
                return;
            }

            // Actualizar los cohetes después del disparo del jugador para que
            // puedan avanzar, detectar impactos y aplicar el daño de área.
            if (game.player.weaponSystem?.update) {
                game.player.weaponSystem.update(delta, () => {
                    game.player.score++;
                    UIManager.updateScore(game.player.score);
                });
            }

            if (game.world?.updateBillboards) {
                game.world.updateBillboards(game.camera);
            }

            // Modo Construcción: oleadas y enemigos en pausa para construir
            // tranquilo (el jugador además lleva god-mode automático).
            const buildActive = game.player?.constructionMode?.isActive?.() === true;

            if (game.eventManager && !buildActive) {
                game.eventManager.update(delta, game.player.getPosition());
            }

            if (game.world?.updateExitPortal) {
                game.world.updateExitPortal(delta, game.camera.position);
            }

            if (!buildActive) {
                SpawnDirector.updateSpawns(game, time);

                game.enemyManager.update(
                    delta,
                    game.player.getPosition(),
                    (damage, damageSource) => {
                        game.player.takeDamage(damage, damageSource);
                    },
                    game.camera
                );
            }
            Door.updateAll(delta, game.player.getPosition());

            game.updateFoodItems(delta);

            game.performPeriodicCleanup(time);
        }

        game.prevTime = time;

        //  Renderizado
        game.renderer.render(game.scene, game.camera);

    }

    updateFPSCounter(now = performance.now()) {
        const game = this.game;
        game.fpsFrameCount++;
        const elapsed = now - game.fpsSampleStart;

        if (elapsed < 500) return;

        UIManager.updateFPS((game.fpsFrameCount * 1000) / elapsed);
        game.fpsFrameCount = 0;
        game.fpsSampleStart = now;
    }
}
