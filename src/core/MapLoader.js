/*sección [CARGADOR DE MAPAS] Código de carga de mapas*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, ENEMY_TYPES } from '../Constants.js';

export class MapLoader {
    constructor() {
        this.blockSize = CONFIG.BLOCK_SIZE || 10;
    }

    async loadMapFile(mapName = 'default') {
        try {
            console.log(`Intentando cargar: mapas/${mapName}.txt`);
            const response = await fetch(`mapas/${mapName}.txt`);
            
            if (!response.ok) {
                throw new Error(`Failed to load map: ${mapName}.txt (Status: ${response.status})`);
            }
            
            const mapText = await response.text();
            return this.parseMap(mapText);
        } catch (error) {
            console.error('Error loading map:', error);
            return this.getDefaultMap();
        }
    }

    parseMap(mapText) {
    const lines = mapText.trim().replace(/\r\n/g, '\n').split('\n');
    const height = lines.length;
    const width = lines.length > 0 ? lines[0].length : 0;

    const walls = [];
    const enemySpawns = [];
    const validFloors = []; 
    const doorPositions = [];
    const foodItems = [];
    
    const models3D = [];
    let playerSpawn = null;

    for (let y = 0; y < height; y++) {
        const line = lines[y];
        for (let x = 0; x < line.length; x++) {
            const char = line[x];
            const position = this.gridToWorld(x, y, width, height);

            switch (char) {
                case '#': 
                    walls.push({ position: position, type: 'wall' });
                    break;

                // case 'E': 
                //     enemySpawns.push({ 
                //         position: new THREE.Vector3(position.x, 1, position.z),
                //         type: 'random'
                //         lastSpawnTime: 0
                //   });
                //     validFloors.push(position);
                //     break;
                case 'P': 
                    playerSpawn = new THREE.Vector3(position.x, 1, position.z);
                    break;

                case 'D':
                    doorPositions.push(new THREE.Vector3(position.x, 0, position.z));
                    break;

                case '+':
                    foodItems.push(new THREE.Vector3(position.x, 0.5, position.z));
                    break;

                case 'T': 
                    console.log("AGREGANDO PALMERA");
                    models3D.push({
                        model: "assets/3D/10446_Palm_Tree_v1_max2010_iteration-2.obj",
                        position: new THREE.Vector3(position.x, 0, position.z)
                    });
                    break;

                // NUEVO: Tipos específicos de enemigos
                case '1':
                    enemySpawns.push({
                        position: new THREE.Vector3(position.x, 1, position.z),
                        type: 'pablo',
                        lastSpawnTime: 0
                    });
                    validFloors.push(position);
                    break;
                case '2':
                    enemySpawns.push({
                        position: new THREE.Vector3(position.x, 1, position.z),
                        type: 'pera',
                        lastSpawnTime: 0
                    });
                    validFloors.push(position);
                    break;

                case '3':
                    enemySpawns.push({
                        position: new THREE.Vector3(position.x, 1, position.z),
                        type: 'slow_low3',
                        lastSpawnTime: 0
                    });
                    validFloors.push(position);
                    break;

                case '4':
                    enemySpawns.push({
                        position: new THREE.Vector3(position.x, 1, position.z),
                        type: 'medium_med',
                        lastSpawnTime: 0
                    });
                    validFloors.push(position);
                    break;

                case '5':
                    enemySpawns.push({
                        position: new THREE.Vector3(position.x, 1, position.z),
                        type: 'medium_med2',
                        lastSpawnTime: 0
                    });
                    validFloors.push(position);
                    break;

                // ⭐ NUEVO CASO PARA EL ENEMIGO QUE DISPARA
                case '6':
                    enemySpawns.push({
                        position: new THREE.Vector3(position.x, 1, position.z),
                        type: 'patica',
                        lastSpawnTime: 0
                    });
                    validFloors.push(position);
                    break;

                case '.': 
                case ' ': 
                    validFloors.push(position);
                    break;
            }
        }
    }

    if (!playerSpawn) {
        if (validFloors.length > 0) {
            const safeSpot = validFloors[Math.floor(validFloors.length / 2)];
            playerSpawn = new THREE.Vector3(safeSpot.x, 1, safeSpot.z);
        } else {
            playerSpawn = new THREE.Vector3(0, 30, 0);
        }
    }

    return {
        walls,
        enemySpawns,
        playerSpawn,
        doorPositions,
        foodItems,
        models3D,
        width,
        height,
        blockSize: this.blockSize
    };
    }

    gridToWorld(gridX, gridY, mapWidth, mapHeight) {
        const offsetX = (mapWidth * this.blockSize) / 2;
        const offsetZ = (mapHeight * this.blockSize) / 2;

        return {
            x: (gridX * this.blockSize) - offsetX + (this.blockSize / 2),
            y: 0,
            z: (gridY * this.blockSize) - offsetZ + (this.blockSize / 2)
        };
    }

    getDefaultMap() {
    return {
        walls: [],
        enemySpawns: [],
        playerSpawn: new THREE.Vector3(0, 1, 0),
        doorPositions: [],
        foodItems: [],
        models3D: [],
        width: 0,
        height: 0,
        blockSize: this.blockSize
    };
    }
}
/*[Fin de sección]*/
