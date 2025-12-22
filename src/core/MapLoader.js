//  Importaciones MapLoader
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, ENEMY_TYPES } from '../Constants.js';

//  Clase MapLoader
export class MapLoader {
    constructor() {
        this.blockSize = CONFIG.BLOCK_SIZE || 10;
    }

    //  Carga de Mapa
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

    //  Parseo de Mapa
    parseMap(mapText) {
        const lines = mapText.trim().replace(/\r\n/g, '\n').split('\n');
        const height = lines.length;

        const countBlocks = (line) => {
            let count = 0;
            let i = 0;
            while (i < line.length) {
                if (line[i] === '(') {
                    const end = line.indexOf(')', i);
                    if (end !== -1) {
                        count++;
                        i = end + 1;
                        continue;
                    }
                }
                i++;
            }
            return count;
        };

        const width = lines.length > 0 ? countBlocks(lines[0]) : 0;

        const walls = [];
        const bushes = [];
        const bricks = [];
        const enemySpawns = [];
        const genericSpawners = [];
        const ammoSpawners = [];
        const foodSpawners = [];
        const validFloors = [];
        const doorPositions = [];
        const foodItems = [];
        const ammoItems = [];
        const models3D = [];
        const extraItems = [];
        const decorationItems = []; // NUEVA ESTRUCTURA: Array para objetos decorativos

        let playerSpawn = null;
        let playerRotation = 0;

        for (let y = 0; y < height; y++) {
            const line = lines[y];
            let x = 0;
            let blockIndex = 0;

            while (x < line.length) {

                let char = line[x];
                let rawToken = null;

                if (char === '(') {
                    const end = line.indexOf(')', x);
                    if (end !== -1) {
                        rawToken = line.substring(x + 1, end);
                        x = end + 1;
                    } else {
                        rawToken = "";
                        x++;
                    }
                } else {
                    x++;
                    continue;
                }

                let base = rawToken;
                let rotation = 0;
                let maxSpawns = 5;
                let spawnRate = 5000;

                const fullMatch = rawToken.match(/^(.+?)(?:\[(\d+)\])?(?:\{(\d+)\})?(?:<(\d+)>)?$/);
                if (fullMatch) {
                    base = fullMatch[1];
                    if (fullMatch[2]) rotation = parseInt(fullMatch[2], 10);
                    if (fullMatch[3]) maxSpawns = parseInt(fullMatch[3], 10);
                    if (fullMatch[4]) spawnRate = parseInt(fullMatch[4], 10);
                }

                const position = this.gridToWorld(blockIndex, y, width, height);
                blockIndex++;

                switch (base) {

                    case "#":
                        walls.push({ position: position, type: "wall", rotation: rotation });
                        break;

                    case "B":
                        bushes.push({ position: position, type: "bush", rotation: rotation });
                        break;

                    case "L":
                        bricks.push({ position: position, type: "brick", rotation: rotation });
                        break;

                    case "P":
                        playerSpawn = new THREE.Vector3(position.x, 1, position.z);
                        playerRotation = rotation;
                        break;

                    case "D":
                        doorPositions.push({
                            position: new THREE.Vector3(position.x, 0, position.z),
                            rotation: rotation
                        });
                        break;

                    case "+":
                        foodItems.push(new THREE.Vector3(position.x, 0.5, position.z));
                        break;

                    case "MA":
                        ammoItems.push({
                            position: new THREE.Vector3(position.x, 0.5, position.z),
                            type: 'machinegun',
                            rotation: rotation
                        });
                        validFloors.push(position);
                        break;

                    case "MP":
                        ammoItems.push({
                            position: new THREE.Vector3(position.x, 0.5, position.z),
                            type: 'pistol',
                            rotation: rotation
                        });
                        validFloors.push(position);
                        break;

                    case "T":
                        models3D.push({
                            model: "assets/3D/10446_Palm_Tree_v1_max2010_iteration-2.obj",
                            position: new THREE.Vector3(position.x, 0, position.z),
                            rotation: rotation
                        });
                        break;

                    // NUEVA ESTRUCTURA: Bloque para objetos decorativos (Imagen en cuadrado)
                    case "IMG":
                        decorationItems.push({
                            type: "square",
                            texture: "assets/3D/decoracion/images.jpeg", // Ruta a la imagen en decoración
                            position: new THREE.Vector3(position.x, 5, position.z), // Altura de 5 unidades
                            rotation: rotation,
                            width: 10,
                            height: 10
                        });
                        validFloors.push(position);
                        break;

                    case "1":
                    case "2":
                    case "3":
                    case "4":
                    case "5":
                    case "7": {
                        const mapTypes = {
                            "1": "pablo",
                            "2": "pera",
                            "3": "slow_low3",
                            "4": "medium_med",
                            "5": "medium_med2",
                            "6": "patica",
                            "7": "charo"
                        };

                        enemySpawns.push({
                            position: new THREE.Vector3(position.x, 1, position.z),
                            type: mapTypes[base],
                            lastSpawnTime: 0,
                            rotation: rotation,
                            maxSpawns: maxSpawns,
                            spawnedCount: 0,
                            isActive: true,
                            spawnRate: spawnRate
                        });

                        validFloors.push(position);
                    }
                        break;

                    case ".":
                    case " ":
                        validFloors.push(position);
                        break;

                    default:
                        // Check if it's a generic spawner (S followed by number, e.g., S1, S2, S3)
                        if (base.match(/^S\d+$/)) {
                            const spawnerId = base; // e.g., "S1", "S2"
                            genericSpawners.push({
                                id: spawnerId,
                                position: new THREE.Vector3(position.x, 1, position.z),
                                rotation: rotation
                            });
                            validFloors.push(position);
                            break;
                        }

                        if (base === 'SMuni') {
                            // Ammo Spawner
                            ammoSpawners.push({
                                position: new THREE.Vector3(position.x, 0.5, position.z),
                                rotation: rotation
                            });
                            validFloors.push(position);
                            break;
                        }

                        if (base === 'SComida') {
                            // Food/Health Spawner
                            foodSpawners.push({
                                position: new THREE.Vector3(position.x, 0.5, position.z),
                                rotation: rotation
                            });
                            validFloors.push(position);
                            break;
                        }

                        // Default case for unknown blocks
                        extraItems.push({
                            position: new THREE.Vector3(position.x, 0, position.z),
                            code: base,
                            rotation: rotation
                        });
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
            bushes,
            bricks,
            enemySpawns,
            genericSpawners,
            ammoSpawners,
            foodSpawners,
            playerSpawn,
            playerRotation,
            doorPositions,
            foodItems,
            ammoItems,
            models3D,
            decorationItems, // NUEVA ESTRUCTURA: Incluir objetos decorativos
            extraItems,
            width,
            height,
            blockSize: this.blockSize
        };
    }

    //  Utilidades MapLoader
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
            bushes: [],
            bricks: [],
            enemySpawns: [],
            genericSpawners: [],
            playerSpawn: new THREE.Vector3(0, 1, 0),
            playerRotation: 0,
            doorPositions: [],
            foodItems: [],
            ammoItems: [],
            models3D: [],
            extraItems: [],
            width: 0,
            height: 0,
            blockSize: this.blockSize
        };
    }
}