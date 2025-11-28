/*sección [CÓDIGO PRINCIPAL] Código principal*/
import { World } from './core/World.js';
import { Player } from './entities/Player.js'; //
import { EnemyManager } from './entities/EnemyManager.js';
import { Door } from './entities/Door.js';
import { ENEMY_TYPES, CONFIG } from './Constants.js'; //
import * as THREE from '../node_modules/three/build/three.module.js';
import { AudioManager } from './core/AudioManager.js';
class Game { //
    constructor() {
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
        window.addEventListener('resize', () => this.onWindowResize()); //

        // Inicializamos el gestor de audio
        this.audioManager = new AudioManager();
        
        this.initGame();
    }

    async initGame() {
        const urlParams = new URLSearchParams(window.location.search);
        const mapName = "mapa2";//urlParams.get('map') || 'default'; //

        // Esperamos a que carguen los sonidos
        await this.audioManager.init();

        this.world = new World(this.scene);
        await this.world.init(mapName);

        Door.clearAll();
        const doorMeshes = this.world.getDoorMeshes();
        doorMeshes.forEach(mesh => { //
            new Door(mesh);
        });
        
        // Pasamos el audioManager al gestor de enemigos
        this.enemyManager = new EnemyManager(this.scene, this.world, this.audioManager); //
        this.enemyManager.spawnPoints = this.world.getEnemySpawns();

        this.player = new Player(this.scene, this.camera, document.body, this.enemyManager, this.world, this.audioManager);
        const playerSpawn = this.world.getPlayerSpawn(); //
        if (playerSpawn) {
            this.player.teleport(playerSpawn);
        } //

        // Reproducimos música de fondo
        this.audioManager.playMusic('background');

        this.animate();
    } //

    animate() {
        requestAnimationFrame(() => this.animate());
        const time = performance.now();
        const delta = (time - this.prevTime) / 1000; //

        if (this.player && !this.player.isGameOver) {
            this.player.update(delta);
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

new Game();
/*[Fin de sección]*/