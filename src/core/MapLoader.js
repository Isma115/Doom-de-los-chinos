//  Importaciones MapLoader
import * as THREE from 'three';
import { CONFIG, ENEMY_TYPES } from '../Constants.js';

//  Clase MapLoader
export class MapLoader {
    constructor() {
        this.blockSize = CONFIG.BLOCK_SIZE || 10;
    }

    //#region Carga de Mapa
    // Soporta 3 orígenes, en este orden:
    // 1) `__custom`: mapa creado en el editor web y guardado en
    //    sessionStorage/localStorage (botón "Probar en juego").
    // 2) `mapas/<nombre>.json`: formato nativo del editor web.
    // 3) `mapas/<nombre>.txt`: formato clásico (P[rot], S1, SMuni...).
    async loadMapFile(mapName = 'default') {
        try {
            if (mapName === '__custom') {
                const customJson = this.loadCustomMapFromStorage();
                if (customJson) {
                    console.log('Cargando mapa personalizado del editor (storage)');
                    return this.parseMapJson(customJson, '__custom');
                }
                throw new Error('No hay mapa personalizado en storage');
            }

            // 1) Intentar JSON del editor
            try {
                console.log(`Intentando cargar: mapas/${mapName}.json`);
                const jsonResponse = await fetch(`mapas/${mapName}.json`);
                if (jsonResponse.ok) {
                    const jsonData = await jsonResponse.json();
                    return this.parseMapJson(jsonData, mapName);
                }
            } catch (jsonError) {
                console.warn(`No se pudo cargar mapas/${mapName}.json, probando .txt:`, jsonError);
            }

            // 2) Fallback al .txt clásico
            console.log(`Intentando cargar: mapas/${mapName}.txt`);
            const response = await fetch(`mapas/${mapName}.txt`);

            if (!response.ok) {
                throw new Error(`Failed to load map: ${mapName}.txt (Status: ${response.status})`);
            }

            const mapText = await response.text();
            return this.parseMap(mapText, mapName);
        } catch (error) {
            console.error('Error loading map:', error);
            return this.getDefaultMap();
        }
    }

    loadCustomMapFromStorage() {
        const keys = ['doom3d_custom_map', 'doom3d_custom_map_session'];
        for (const key of keys) {
            try {
                const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
                if (raw) return JSON.parse(raw);
            } catch (e) {
                console.warn(`No se pudo leer ${key}:`, e);
            }
        }
        return null;
    }

    // Convierte el JSON del editor a texto clásico y reutiliza parseMap,
    // así el juego y el editor comparten exactamente la misma semántica.
    // Formato JSON v1:
    // { "name": "mi_mapa", "width": 12, "height": 10,
    //   "grid": [[{code, rotation?, maxSpawns?, spawnRate?}, ...], ...] }
    // También acepta celdas como string ("P[180]", "S1", "#", ...).
    parseMapJson(jsonData, mapName = 'default') {
        if (!jsonData || !Array.isArray(jsonData.grid)) {
            throw new Error('JSON de mapa inválido: falta "grid"');
        }
        const lines = jsonData.grid.map(row => {
            if (!Array.isArray(row)) return '';
            return row.map(cell => {
                let code = '.';
                let rotation = 0;
                let maxSpawns = null;
                let spawnRate = null;
                if (typeof cell === 'string') {
                    // Aceptar "P[180]", "(P[180])" o "P" directamente.
                    const clean = cell.trim().replace(/^\((.*)\)$/, '$1');
                    const m = clean.match(/^(.+?)(?:\[(\d+)\])?(?:\{(\d+)\})?(?:<(\d+)>)?$/);
                    if (m) {
                        code = m[1] || '.';
                        if (m[2]) rotation = parseInt(m[2], 10) || 0;
                        if (m[3]) maxSpawns = parseInt(m[3], 10);
                        if (m[4]) spawnRate = parseInt(m[4], 10);
                    } else {
                        code = clean || '.';
                    }
                } else if (cell && typeof cell === 'object') {
                    code = cell.code ?? '.';
                    rotation = Number(cell.rotation) || 0;
                    if (cell.maxSpawns != null) maxSpawns = Number(cell.maxSpawns);
                    if (cell.spawnRate != null) spawnRate = Number(cell.spawnRate);
                }
                if (code === '') code = '.';
                let token = code;
                if (rotation) token += `[${rotation}]`;
                if (maxSpawns != null && !Number.isNaN(maxSpawns)) token += `{${maxSpawns}}`;
                if (spawnRate != null && !Number.isNaN(spawnRate)) token += `<${spawnRate}>`;
                return `(${token})`;
            }).join('');
        }).join('\n');
        return this.parseMap(lines, jsonData.name || mapName);
    }
    //#endregion

    //  Parseo de Mapa
    parseMap(mapText, mapName = 'default') {
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
        const worldLayouts = {
            // Parque usa ahora una rejilla compacta y centrada en el origen.
            mapa1: { width: 12, height: 10, offsetX: 0, offsetY: 0 },
            mapa2: { width: 24, height: 18, offsetX: 0, offsetY: 0 }
        };
        const worldLayout = worldLayouts[mapName] || {
            width,
            height,
            offsetX: 0,
            offsetY: 0
        };

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
        let exitPortalSpawn = null;

        // Rejilla cruda de tokens internos (sin paréntesis) para poder
        // serializar de vuelta a .txt tras editar en modo Construcción.
        // rawGrid[y][x] = { base, rotation, maxSpawns, spawnRate }
        const rawGrid = [];

        for (let y = 0; y < height; y++) {
            const line = lines[y];
            let x = 0;
            let blockIndex = 0;
            const gridRow = [];

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
                let hasMaxSpawns = false;
                let hasSpawnRate = false;

                const fullMatch = rawToken.match(/^(.+?)(?:\[(\d+)\])?(?:\{(\d+)\})?(?:<(\d+)>)?$/);
                if (fullMatch) {
                    base = fullMatch[1];
                    if (fullMatch[2]) rotation = parseInt(fullMatch[2], 10);
                    if (fullMatch[3]) { maxSpawns = parseInt(fullMatch[3], 10); hasMaxSpawns = true; }
                    if (fullMatch[4]) { spawnRate = parseInt(fullMatch[4], 10); hasSpawnRate = true; }
                }

                const position = this.gridToWorld(
                    blockIndex + worldLayout.offsetX,
                    y + worldLayout.offsetY,
                    worldLayout.width,
                    worldLayout.height
                );
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

                    case "PORTAL":
                        exitPortalSpawn = new THREE.Vector3(position.x, 0, position.z);
                        validFloors.push(position);
                        break;

                    // Mapa de pruebas: permite colocar el esqueleto minigun de
                    // forma explícita, sin depender de rondas ni pesos aleatorios.
                    case "A":
                    case "ALIEN":
                    case "MINIGUN":
                        enemySpawns.push({
                            position: new THREE.Vector3(position.x, 1, position.z),
                            type: "skeleton_minigun",
                            lastSpawnTime: 0,
                            rotation: rotation,
                            maxSpawns: maxSpawns,
                            spawnedCount: 0,
                            isActive: true,
                            spawnRate: spawnRate
                        });
                        validFloors.push(position);
                        break;

                    case "D":
                        doorPositions.push({
                            position: new THREE.Vector3(position.x, 0, position.z),
                            rotation: rotation
                        });
                        break;

                    case "+":
                        foodItems.push(new THREE.Vector3(position.x, 0.5, position.z));
                        validFloors.push(position);
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
                    case "6":
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

                gridRow.push({ base, rotation, maxSpawns, spawnRate, hasMaxSpawns, hasSpawnRate });
            }
            rawGrid.push(gridRow);
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
            exitPortalSpawn,
            doorPositions,
            foodItems,
            ammoItems,
            models3D,
            decorationItems, // NUEVA ESTRUCTURA: Incluir objetos decorativos
            extraItems,
            width,
            height,
            worldLayout: { ...worldLayout },
            rawGrid,
            terrainBounds: {
                minX: (-worldLayout.width * this.blockSize) / 2 + worldLayout.offsetX * this.blockSize,
                maxX: (-worldLayout.width * this.blockSize) / 2 + (worldLayout.offsetX + width) * this.blockSize,
                minZ: (-worldLayout.height * this.blockSize) / 2 + worldLayout.offsetY * this.blockSize,
                maxZ: (-worldLayout.height * this.blockSize) / 2 + (worldLayout.offsetY + height) * this.blockSize
            },
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
            worldLayout: { width: 0, height: 0, offsetX: 0, offsetY: 0 },
            rawGrid: [],
            terrainBounds: null,
            blockSize: this.blockSize
        };
    }

    // Serializa la rejilla editable de vuelta a texto .txt clásico.
    // cell = { base, rotation, maxSpawns, spawnRate }
    static serializeGridToTxt(rawGrid) {
        const tokenFor = (cell) => {
            if (!cell) return '(.)';
            const base = cell.base ?? '.';
            let token = String(base);
            if (cell.rotation) token += `[${cell.rotation}]`;
            // maxSpawns/spawnRate solo si venían explícitos en el .txt: los
            // valores por defecto del parseo no deben ensuciar el fichero.
            if (cell.hasMaxSpawns && String(base).match(/^(S\d+|[1-7]|A|ALIEN|MINIGUN)$/)) {
                token += `{${cell.maxSpawns}}`;
            }
            if (cell.hasSpawnRate && String(base).match(/^(S\d+|[1-7]|A|ALIEN|MINIGUN)$/)) {
                token += `<${cell.spawnRate}>`;
            }
            return `(${token})`;
        };
        return rawGrid.map(row => row.map(tokenFor).join('')).join('\n') + '\n';
    }
}
