// Contenedor de dependencias compartidas del juego.
// Evita constructores con 5-7 parámetros (Player, EnemyManager, Weapon...)
// y facilita programar sistemas nuevos: reciben `ctx` y cogen lo que necesiten.
//
//   const ctx = createGameContext({ scene, camera, renderer, ... });
//   ctx.world = new World(ctx.scene);
//
import { globalEventBus } from './EventBus.js';

export function createGameContext({
    scene = null,
    camera = null,
    renderer = null,
    world = null,
    player = null,
    enemyManager = null,
    audioManager = null,
    eventManager = null,
    ui = null,
    events = null,
    config = null,
    game = null,
} = {}) {
    return {
        scene,
        camera,
        renderer,
        world,
        player,
        enemyManager,
        audioManager,
        eventManager,
        ui,
        config,
        game,
        events: events ?? globalEventBus,
    };
}
