/*sección [IMPORTACIONES Y CONSTRUCTOR] Imports y configuración inicial del juego*/
import { World } from './core/World.js';
import { Player } from './entities/Player.js'; //
import { EnemyManager } from './entities/EnemyManager.js';
import { Door } from './entities/Door.js';
// ⭐ NUEVO: Importamos UIManager para poder mostrar la pantalla de inicio
import { UIManager, SettingsManager, DebugPanel } from './UI.js';
import { ENEMY_TYPES, CONFIG, AVAILABLE_MAPS } from './Constants.js'; //
import * as THREE from '../node_modules/three/build/three.module.js';
import { AudioManager } from './core/AudioManager.js';
// ⭐ NUEVO: Importamos el gestor de eventos
import { EventManager } from './core/EventManager.js';

class Game { //
    constructor(mapName) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = false;
        document.body.appendChild(this.renderer.domElement);

        this.prevTime = performance.now();
        this.frameCount = 0;
        this.lastCleanupTime = 0;
        this.isPaused = false;
        this.isGameOver = false;

        window.addEventListener('resize', () => this.onWindowResize());

        this.audioManager = new AudioManager();
        this.initGame(mapName);

        // ★ NUEVA ESTRUCTURA: Listener permanente para tecla R (funciona siempre, incluso en Game Over)
        this.setupGlobalRestartListener();
    }


    restartGame() {
        // Limpiar escena
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }

        // Resetear estados
        this.isGameOver = false;
        this.isPaused = false;

        // Detener música y sonidos
        this.audioManager.stopAll();

        // Reiniciar UI
        document.getElementById('start-screen').style.display = 'none';

        // Reinicializar todo (mismo mapa que estaba jugando)
        const currentMap = this.world?.currentMapName || 'default';
        this.initGame(currentMap);
    }
    setupGlobalRestartListener() {
        const handleRestart = (e) => {
            console.log("key: ", e.key);
            if (this.isGameOver && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault();
                //[MENSAJE PARA LA IA] aquí nunca llega al morir el jugador this.isGameOver nunca es true
                // Reinicio limpio sin recargar toda la página
                this.restartGame();
            }
        };

        // Escuchamos en document (siempre activo) y también capturamos en ventana por seguridad
        document.addEventListener('keydown', handleRestart);
        window.addEventListener('keydown', handleRestart);

        // Guardamos referencia para poder removerlo si fuera necesario (opcional)
        this.restartListener = handleRestart;
    }

/*[Fin de sección]*/

    /*sección [INICIALIZACIÓN DEL JUEGO] Carga de mapa, jugador, enemigos y eventos*/
    async initGame(mapName) {
        await this.audioManager.init();
        this.world = new World(this.scene);
        await this.world.init(mapName);

        Door.clearAll();
        const doorMeshes = this.world.getDoorMeshes();
        doorMeshes.forEach(mesh => {
            new Door(mesh);
        });

        this.enemyManager = new EnemyManager(this.scene, this.world, this.audioManager);
        this.enemyManager.spawnPoints = this.world.getEnemySpawns();

        this.player = new Player(
            this.scene,
            this.camera,
            this.renderer.domElement,
            this.enemyManager,
            this.world,
            this.audioManager,
            this // NUEVA pasamos la instancia del Game al Player
        ); const playerSpawn = this.world.getPlayerSpawn();
        const playerRotation = this.world.getPlayerRotation();

        if (playerSpawn) {
            this.player.teleport(playerSpawn, playerRotation);
        }

        // ★ IMPORTANTE: Inicializar barra de vida antes de desbloquear controles
        UIManager.updateHealth(this.player.health);

        this.player.controls.addEventListener('lock', () => {
            this.isPaused = false;
            this.prevTime = performance.now();
        });

        this.player.controls.addEventListener('unlock', () => {
            this.isPaused = true;
        });

        this.eventManager = new EventManager(this.scene, this.enemyManager, this.audioManager, this.world);
        await this.eventManager.loadEventsForMap(mapName);

        this.settingsManager = new SettingsManager(this.audioManager);
        this.debugPanel = new DebugPanel(this.player, this.player.weaponSystem);

        this.audioManager.playMusic('background');

        UIManager.togglePauseScreen(false, false);
        this.animate();
    } //

    /*[Fin de sección]*/

    /*sección [BUCLE DE ANIMACIÓN Y ACTUALIZACIÓN] Renderizado, spawns y actualización de entidades*/
    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.isPaused) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;

        if (this.player && !this.player.isGameOver) {
            this.player.update(delta);

            if (this.eventManager) {
                this.eventManager.update(delta, this.player.getPosition());
            }

            const enemySpawns = this.world.getEnemySpawns();
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
                        this.enemyManager.spawn(time, enemyType, spawn.position);
                    } else {
                        this.enemyManager.spawn(time, null, spawn.position);
                    }

                    spawn.spawnedCount++;

                    if (spawn.spawnedCount >= spawn.maxSpawns) {
                        spawn.isActive = false;
                    }
                }
            });

            this.enemyManager.update(delta, this.player.getPosition(), (damage) => {
                this.player.takeDamage(damage);
            });
            Door.updateAll(delta, this.player.getPosition());

            this.updateFoodItems(delta);

            this.performPeriodicCleanup(time);
        }

        this.prevTime = time;
        this.renderer.render(this.scene, this.camera);

        // ★ ELIMINADO: this.frameCount y cualquier posible UI de FPS
    } //

    updateFoodItems(delta) {
        const foodMeshes = this.world.getFoodMeshes();
        const playerPos = this.player.getPosition(); //

        foodMeshes.forEach(foodMesh => {
            if (foodMesh.userData.collected) return;

            foodMesh.rotation.y += foodMesh.userData.rotationSpeed * delta;

            const distance = playerPos.distanceTo(foodMesh.position);
            if (distance < 2.0) {
                this.player.collectFood(foodMesh.userData.healAmount);


                foodMesh.userData.collected
                    = true; //
                this.scene.remove(foodMesh);
            }
        });
    } //

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight); //
    }

    performPeriodicCleanup(time) {
        if (time - this.lastCleanupTime > 30000) {
            if (this.enemyManager.enemies.length === 0 && this.enemyManager.enemyPool.length > 5) {
                const excess = this.enemyManager.enemyPool.length - 5;
                this.enemyManager.enemyPool.splice(0, excess); //
            }
            this.lastCleanupTime = time;
        } //
    }
}

/*[Fin de sección]*/

/*sección [SELECTOR DE MAPAS] Interfaz de selección de mapas al inicio*/
// Lógica del selector de mapas
function createMapSelector() {
    const selectorDiv = document.createElement('div');
    selectorDiv.id = 'map-selector';

    const title = document.createElement('div');
    title.className = 'map-title';
    title.innerText = 'SELECCIONAR MISIÓN';
    selectorDiv.appendChild(title);

    const listDiv = document.createElement('div');
    listDiv.className = 'map-list';

    AVAILABLE_MAPS.forEach(map => {
        const btn = document.createElement('button');
        btn.className = 'map-btn';
        btn.innerText = map.name;
        btn.onclick = () => {
            document.body.removeChild(selectorDiv);
            new Game(map.id);
        };
        listDiv.appendChild(btn);
    });
    selectorDiv.appendChild(listDiv);
    document.body.appendChild(selectorDiv);
}

createMapSelector();
/*[Fin de sección]*/