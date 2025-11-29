import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, ENEMY_TYPES } from '../Constants.js';

export class MapLoader {
    constructor() {
        this.blockSize = CONFIG.BLOCK_SIZE || 10;
    }

    /* sección [CARGA DE ARCHIVO DE MAPA] Carga y parseo del archivo de texto del mapa */
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
    /* [Fin de sección] */

    /* sección [PROCESAMIENTO Y ANÁLISIS DEL MAPA] Parseo del texto del mapa y conversión a objetos del juego */
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
    const validFloors = [];
    const doorPositions = [];
    const foodItems = [];
    const ammoItems = [];
    const models3D = [];
    const extraItems = [];

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

            const match = rawToken.match(/^(.+?)\[(\d+)\]$/);
            if (match) {
                base = match[1];
                rotation = parseInt(match[2], 10);
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

                case "1":
                case "2":
                case "3":
                case "4":
                case "5":
                case "6": {
                    const mapTypes = {
                        "1": "pablo",
                        "2": "pera",
                        "3": "slow_low3",
                        "4": "medium_med",
                        "5": "medium_med2",
                        "6": "patica"
                    };

                    enemySpawns.push({
                        position: new THREE.Vector3(position.x, 1, position.z),
                        type: mapTypes[base],
                        lastSpawnTime: 0,
                        rotation: rotation
                    });

                    validFloors.push(position);
                }
                break;

                case ".":
                case " ":
                    validFloors.push(position);
                    break;

                default:
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
        playerSpawn,
        playerRotation,
        doorPositions,
        foodItems,
        ammoItems,
        models3D,
        extraItems,
        width,
        height,
        blockSize: this.blockSize
    };
}
    /* [Fin de sección] */

    /* sección [UTILIDADES DE CONVERSIÓN] Conversión de coordenadas de grid a coordenadas 3D del mundo y mapa por defecto */
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
    /* [Fin de sección] */
}