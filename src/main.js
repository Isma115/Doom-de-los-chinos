/*sección [CÓDIGO PRINCIPAL] Código principal*/
import { World } from './core/World.js';
import { Player } from './entities/Player.js'; //
import { EnemyManager } from './entities/EnemyManager.js';
import { Door } from './entities/Door.js';
// ⭐ NUEVO: Importamos UIManager para poder mostrar la pantalla de inicio
import { UIManager } from './UI.js';
import { ENEMY_TYPES, CONFIG, AVAILABLE_MAPS } from './Constants.js'; //
import * as THREE from '../node_modules/three/build/three.module.js';
import { AudioManager } from './core/AudioManager.js';
// ⭐ NUEVO: Importamos el gestor de eventos
import { EventManager } from './core/EventManager.js';

class Game { //
    constructor(mapName) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); //
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); //
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = false;
        document.body.appendChild(this.renderer.domElement);

        this.prevTime = performance.now();
        this.frameCount = 0;
        this.lastCleanupTime = 0;
        window.addEventListener('resize', () => this.onWindowResize());
        //

        // Inicializamos el gestor de audio
        this.audioManager = new AudioManager();
        this.initGame(mapName);
        
    }

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

    this.player = new Player(this.scene, this.camera, document.body, this.enemyManager, this.world, this.audioManager);
    const playerSpawn = this.world.getPlayerSpawn();
    const playerRotation = this.world.getPlayerRotation();
    
    if (playerSpawn) {
        this.player.teleport(playerSpawn, playerRotation);
    }

    this.eventManager = new EventManager(this.scene, this.enemyManager, this.audioManager, this.world);
    await this.eventManager.loadEventsForMap(mapName);

    this.audioManager.playMusic('background');
    
    UIManager.togglePauseScreen(false, false);
    this.animate();
} //

    animate() {
        requestAnimationFrame(() => this.animate());
        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;
        //

        if (this.player && !this.player.isGameOver) {
            this.player.update(delta);

            // ⭐ NUEVO: Actualizamos eventos
            if (this.eventManager) {
                this.eventManager.update(delta, this.player.getPosition());
            }

            const enemySpawns = this.world.getEnemySpawns(); //
            enemySpawns.forEach(spawn => {
                if (time - spawn.lastSpawnTime > CONFIG.ENEMY_SPAWN_RATE) {
                    spawn.lastSpawnTime = time;

                    const enemyType = ENEMY_TYPES.find(t => t.id === spawn.type);


                    if (enemyType) {
                        this.enemyManager.spawn(time, enemyType, spawn.position); //
                    } else {
                        this.enemyManager.spawn(time, null, spawn.position);


                    }
                } //
            });
            this.enemyManager.update(delta, this.player.getPosition(), (damage) => { //
                this.player.takeDamage(damage);
            });
            Door.updateAll(delta, this.player.getPosition()); //

            this.updateFoodItems(delta);

            this.performPeriodicCleanup(time);
        }

        this.prevTime = time;
        this.renderer.render(this.scene, this.camera);

        this.frameCount++;
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