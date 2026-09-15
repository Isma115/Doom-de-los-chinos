// #region Importaciones Main
// Descripción: Importa los módulos y constantes necesarios para el funcionamiento del juego, incluyendo entidades, gestores y librerías gráficas.
import { World } from './core/World.js';
import { Player } from './entities/Player.js';
import { EnemyManager } from './entities/EnemyManager.js';
import { Door } from './entities/Door.js';
import { UIManager, SettingsManager, DebugPanel } from './UI.js';
import { ENEMY_TYPES, CONFIG, AVAILABLE_MAPS } from './Constants.js';
import * as THREE from '../node_modules/three/build/three.module.js';
import { AudioManager } from './core/AudioManager.js';
import { EventManager } from './core/EventManager.js';
import { isMobileMode } from './mobile/isMobile.js';
// #endregion

// En móvil se marca el body para aplicar la UI compacta (ver touch.css).
if (typeof document !== 'undefined' && isMobileMode()) {
    document.body.classList.add('is-mobile');
}

const DISPLAY_RESOLUTIONS = Object.freeze({
    '1080p': { width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720 }
});
const DEFAULT_RESOLUTION = '1080p';
const MOBILE_DEFAULT_RESOLUTION = '720p';

class Game {
    // #region Constructor Game
    // Descripción: Inicializa la instancia del juego, configurando la escena, cámara, renderizador, y los gestores básicos de estado y audio.
    constructor(mapName) {
        this.autoStart = new URLSearchParams(window.location.search).get('autostart') === '1';
        this.isMobile = isMobileMode();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            antialias: !this.isMobile,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });
        // Mantener el canvas ajustado a la ventana y controlar la resolución interna.
        // El pixel ratio 1 hace que 1080p/720p sean predecibles también en pantallas Retina.
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
        document.body.appendChild(this.renderer.domElement);
        this.resolutionId = this.getSavedResolution();
        this.setResolution(this.resolutionId);

        this.prevTime = performance.now();
        this.frameCount = 0;
        this.fpsFrameCount = 0;
        this.fpsSampleStart = this.prevTime;
        this.lastCleanupTime = 0;
        this.isPaused = false;
        this.isGameOver = false;

        window.addEventListener('resize', () => this.onWindowResize());

        this.audioManager = new AudioManager();
        this.initGame(mapName);

        this.setupGlobalRestartListener();
    }
    // #endregion

    // #region Gestión de Estado Game
    // Descripción: Controla el reinicio del juego, limpieza de la escena y observadores de eventos globales para el control de flujo (como reiniciar al morir).
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
            const isRestartKey = e.code === 'KeyR' || e.key === 'r' || e.key === 'R';
            const isGameOver = this.isGameOver || this.player?.isGameOver;
            if (isGameOver && isRestartKey) {
                e.preventDefault();

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
    // #endregion

    // #region Inicialización Game
    // Descripción: Configura el mundo, carga el mapa, e instancia las entidades principales como el jugador, enemigos, puertas y paneles de interfaz.
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

        //  Configuración del Jugador
        this.player = new Player(
            this.scene,
            this.camera,
            this.renderer.domElement,
            this.enemyManager,
            this.world,
            this.audioManager,
            this
        );

        const playerSpawn = this.world.getPlayerSpawn();
        const playerRotation = this.world.getPlayerRotation();

        if (playerSpawn) {
            this.player.teleport(playerSpawn, playerRotation);
        }

        // El mapa de pruebas muestra el portal desde el inicio para poder
        // comprobar su spritesheet e interacción sin completar ocho rondas.
        if (mapName === 'pruebas_alien') {
            this.world.spawnExitPortal(this.player.getPosition(), this.audioManager);
        }

        UIManager.updateHealth(this.player.health);

        this.player.controls.addEventListener('lock', () => {
            this.isPaused = false;
            this.prevTime = performance.now();
        });

        this.player.controls.addEventListener('unlock', () => {
            // La muerte libera el pointer lock, pero la escena debe seguir
            // actualizándose para reproducir la animación de caída.
            this.isPaused = !this.player?.isDead;
        });

        //  Configuración de Eventos y UI
        this.eventManager = new EventManager(
            this.scene,
            this.enemyManager,
            this.audioManager,
            this.world,
            this.player
        );
        await this.eventManager.loadEventsForMap(mapName);

        this.settingsManager = new SettingsManager(
            this.audioManager,
            (resolutionId) => this.setResolution(resolutionId)
        );
        this.debugPanel = new DebugPanel(this.player, this.player.weaponSystem);

        // NUEVA ESTRUCTURA: Sincronizar el estado de bulletLog del debug panel con el weapon system y player
        this.player.weaponSystem.debugState.bulletLog = this.debugPanel.debugState.bulletLog;
        this.player.debugState.bulletLog = this.debugPanel.debugState.bulletLog;

        // Los mapas con rondas inician su pista cuando comienza cada ronda.
        // Mantener música de fondo solo para mapas sin sistema de rondas.
        if (!this.eventManager.waveEvent) {
            this.audioManager.playMusic('background');
        }

        UIManager.togglePauseScreen(false, false);

        // Modo de prueba: permite abrir un mapa aislado sin depender de
        // Pointer Lock, útil para inspeccionar sprites y animaciones.
        if (this.autoStart) {
            this.player.controls.isLocked = true;
            UIManager.togglePauseScreen(true, false);
        }

        // El reloj empieza cuando el mundo ya está listo; evita que la
        // primera actualización mueva al esqueleto minigun de golpe por el tiempo de
        // carga del mapa y falsee la prueba de sus animaciones.
        this.prevTime = performance.now();
        this.fpsFrameCount = 0;
        this.fpsSampleStart = this.prevTime;
        this.animate();
    }
    // #endregion

    // #region Bucle Principal Game
    // Descripción: Maneja el bucle de renderizado y actualización lógica frame a frame, gestionando el tiempo delta y el estado de pausa.
    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateFPSCounter();

        if (this.player?.isDead) {
            const time = performance.now();
            const delta = (time - this.prevTime) / 1000;

            this.player.updateDeath(delta);
            this.prevTime = time;
            this.renderer.render(this.scene, this.camera);
            return;
        }

        //  Lógica de Actualización Main
        if (this.isPaused) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;

        //  Actualización de Lógica
        if (this.player && !this.player.isGameOver) {
            this.player.update(delta);

            // Actualizar los cohetes después del disparo del jugador para que
            // puedan avanzar, detectar impactos y aplicar el daño de área.
            if (this.player.weaponSystem?.update) {
                this.player.weaponSystem.update(delta, () => {
                    this.player.score++;
                    UIManager.updateScore(this.player.score);
                });
            }

            if (this.world?.updateBillboards) {
                this.world.updateBillboards(this.camera);
            }

            if (this.eventManager) {
                this.eventManager.update(delta, this.player.getPosition());
            }

            if (this.world?.updateExitPortal) {
                this.world.updateExitPortal(delta, this.camera.position);
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

            this.enemyManager.update(
                delta,
                this.player.getPosition(),
                (damage, damageSource) => {
                    this.player.takeDamage(damage, damageSource);
                },
                this.camera
            );
            Door.updateAll(delta, this.player.getPosition());

            this.updateFoodItems(delta);

            this.performPeriodicCleanup(time);
        }

        this.prevTime = time;

        //  Renderizado
        this.renderer.render(this.scene, this.camera);

    }

    updateFPSCounter(now = performance.now()) {
        this.fpsFrameCount++;
        const elapsed = now - this.fpsSampleStart;

        if (elapsed < 500) return;

        UIManager.updateFPS((this.fpsFrameCount * 1000) / elapsed);
        this.fpsFrameCount = 0;
        this.fpsSampleStart = now;
    }
    // #endregion

    // #region Actualización de Entidades Game
    // Descripción: Gestiona la lógica específica de entidades secundarias como items de curación (rotación y recolección).
    updateFoodItems(delta) {
        const foodMeshes = this.world.getFoodMeshes();
        const playerPos = this.player.getPosition();

        for (let i = foodMeshes.length - 1; i >= 0; i--) {
            const foodMesh = foodMeshes[i];
            if (foodMesh.userData.collected) {
                foodMeshes.splice(i, 1);
                continue;
            }

            foodMesh.rotation.y += foodMesh.userData.rotationSpeed * delta;

            if (playerPos.distanceTo(foodMesh.position) < CONFIG.PICKUP_DISTANCE) {
                this.player.collectFood(
                    foodMesh.userData.healAmount,
                    foodMesh.userData.foodName
                );

                foodMesh.userData.collected = true;
                this.scene.remove(foodMesh);
                if (foodMesh.material) foodMesh.material.dispose();
                foodMeshes.splice(i, 1);
            }
        }
    }
    // #endregion

    // #region Manejo de Ventana Game
    // Descripción: Ajusta la cámara y el renderizador cuando cambia el tamaño de la ventana del navegador.
    onWindowResize() {
        this.setResolution(this.resolutionId);
    }

    getSavedResolution() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem('gameAudioSettings') || '{}');
            if (Object.prototype.hasOwnProperty.call(DISPLAY_RESOLUTIONS, savedSettings.resolution)) {
                return savedSettings.resolution;
            }
        } catch (error) {
            console.warn('No se pudo leer la resolución guardada:', error);
        }
        return this.isMobile ? MOBILE_DEFAULT_RESOLUTION : DEFAULT_RESOLUTION;
    }

    setResolution(resolutionId = DEFAULT_RESOLUTION) {
        const selectedResolution = Object.prototype.hasOwnProperty.call(DISPLAY_RESOLUTIONS, resolutionId)
            ? resolutionId
            : DEFAULT_RESOLUTION;
        const resolution = DISPLAY_RESOLUTIONS[selectedResolution];
        const viewportWidth = Math.max(1, window.innerWidth || resolution.width);
        const viewportHeight = Math.max(1, window.innerHeight || resolution.height);
        const viewportAspect = viewportWidth / viewportHeight;
        const renderWidth = Math.max(1, Math.round(resolution.height * viewportAspect));

        this.resolutionId = selectedResolution;
        this.renderer.setSize(renderWidth, resolution.height, false);
        this.renderer.domElement.style.width = `${viewportWidth}px`;
        this.renderer.domElement.style.height = `${viewportHeight}px`;
        this.camera.aspect = viewportAspect;
        this.camera.updateProjectionMatrix();
    }
    // #endregion

    // #region Limpieza Game
    // Descripción: Realiza tareas de mantenimiento periódico, como eliminar enemigos inactivos de la memoria.
    performPeriodicCleanup(time) {
        if (time - this.lastCleanupTime > 30000) {
            if (this.enemyManager.enemies.length === 0 && this.enemyManager.enemyPool.length > 5) {
                const excess = this.enemyManager.enemyPool.length - 5;
                this.enemyManager.enemyPool.splice(0, excess);
            }
            this.lastCleanupTime = time;
        }
    }
    // #endregion
}

// #region Selector de Mapas UI Game
// Descripción: Crea e inserta en el DOM la interfaz gráfica para la selección inicial de misiones/mapas.
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

const queryParams = new URLSearchParams(window.location.search);
const requestedMapId = queryParams.get('map');
const requestedMap = AVAILABLE_MAPS.find(map => map.id === requestedMapId);

if (requestedMap && queryParams.get('autostart') === '1') {
    new Game(requestedMap.id);
} else {
    createMapSelector();
}
// #endregion
