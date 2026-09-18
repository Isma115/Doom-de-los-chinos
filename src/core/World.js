// #region Importaciones World
// Descripción: Importa las dependencias externas (Three.js, Loaders) y módulos internos necesarios para la construcción del mundo.
import * as THREE from 'three';
import {
    CONFIG,
    EXIT_PORTAL_CONFIG,
    FOOD_TYPES,
    WEAPONS_DATA
} from '../Constants.js';
import { MapLoader } from './MapLoader.js';
import { Door } from '../entities/Door.js';
import { ExitPortal } from '../entities/ExitPortal.js';
import { buildHormigueroSet } from './world/HormigueroSetBuilder.js';
import { buildHormigueroSecretRoom } from './world/SecretRoomBuilder.js';
import { buildHormigueroDesk } from './world/HormigueroDeskBuilder.js';
import { buildHormigueroBleachers } from './world/HormigueroBleachersBuilder.js';
import {
    findExitPortalPosition as findExitPortalPositionFn,
    spawnExitPortal as spawnExitPortalFn,
    updateExitPortal as updateExitPortalFn,
    tryEnterExitPortal as tryEnterExitPortalFn,
    getExitPortalDestination as getExitPortalDestinationFn
} from './world/PortalManager.js';

import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { HORMIGUERO_TEXTURES } from './world/hormigueroTextures.js';
// #endregion

// HORMIGUERO_TEXTURES vive en ./world/hormigueroTextures.js (módulo
// compartido con los builders). Se re-exporta para compatibilidad.
export { HORMIGUERO_TEXTURES };

// #region Clase World
// Descripción: Clase principal que gestiona la creación y renderizado del entorno del juego (mapa), incluyendo suelos, paredes, modelos 3D y spawners.
export class World {
    // #region Constructor World
    // Descripción: Inicializa las estructuras de datos para almacenar geometrías, materiales y referencias a objetos del mundo como paredes y spawners.
    constructor(scene) {
        this.scene = scene;
        this.preexistingSceneChildren = new Set(scene.children);
        this.sharedMaterials = {};
        this.sharedGeometries = {};
        this.mapData = null;
        this.currentMapName = null;
        this.enemySpawns = [];
        this.genericSpawners = [];
        this.mapLoader = new MapLoader();
        this.walls = [];
        this.doorMeshes = [];
        this.foodMeshes = [];
        this.foodTextures = {};
        this.ammoMeshes = [];
        this.weaponMeshes = [];
        this.staticModels = [];
        this.decorativeMeshes = []; // Objetos decorativos (squares) para efectos de balas/sangre
        this.billboardMeshes = [];
        this.floorGroup = null;
        this.parkGroundTerrain = null;
        this.collisionHelpers = new Map();
        this.spawnerHelpers = new Map();
        this.ventilationGateColliders = new Map();
        this.ventilationGateStates = new Map();
        this.ventilationOpen = false;
        this.exitPortal = null;
        this.exitPortalSpawn = null;
        this.surfaceTextures = new Set();
        this.environmentLights = [];
        this.backgroundTexture = null;
        // --- Modo Construcción: trazabilidad editable ---
        // mapGrid: rejilla cruda de tokens para serializar a .txt.
        // gridLayout: { width, height, offsetX, offsetY } + blockSize.
        // propModels: copia editable de modelos/<mapa>_models.json.
        // editableRegistry: mesh/grupo -> ficha { kind: 'grid'|'prop', ... }.
        this.mapGrid = null;
        this.gridLayout = null;
        this.propModels = [];
        this.editableRegistry = new Map();
    }
    // #endregion

    // #region Trazabilidad editable (Modo Construcción)
    // Descripción: registra qué malla corresponde a qué dato del mapa
    // (celda de rejilla o entrada de modelos/*.json) para poder mover,
    // rotar, borrar y serializar de vuelta a fichero.
    registerEditable(object, record) {
        if (!object || !record) return;
        this.editableRegistry.set(object, record);
    }

    unregisterEditable(object) {
        if (!object) return;
        this.editableRegistry.delete(object);
    }

    getEditableRecord(object) {
        let current = object || null;
        while (current) {
            const record = this.editableRegistry.get(current);
            if (record) return { holder: current, record };
            current = current.parent || null;
        }
        return null;
    }

    getEditableObjects() {
        return [...this.editableRegistry.keys()].filter(obj => Boolean(obj?.parent));
    }

    registerPropEditable(holder, modelIndex) {
        if (!holder) return null;
        const model = this.propModels?.[modelIndex];
        if (!model) return null;
        // Los sets completos (plató, sala secreta) no se editan pieza a
        // pieza: son demasiado grandes para moverlos con el constructor.
        if (model.type === 'hormiguero_set' || model.type === 'hormiguero_secret_room') return null;
        holder.userData.propModelIndex = modelIndex;
        const record = {
            kind: 'prop',
            modelIndex,
            id: model.id || model.type,
            label: model.id || model.variant || model.type,
            collisionBoxSize: holder.userData?.collisionBoxSize || null,
            groundY: model.position?.y ?? holder.position?.y ?? 0
        };
        this.registerEditable(holder, record);
        return holder;
    }

    // Elimina un objeto editable de escena, listas y datos (rejilla o
    // modelos). Devuelve true si se eliminó.
    removeEditableObject(holder) {
        const found = this.getEditableRecord(holder);
        if (!found) return false;
        const { holder: target, record } = found;
        this.unregisterEditable(target);
        const removeFrom = (arr, item) => {
            const i = arr?.indexOf?.(item);
            if (i >= 0) arr.splice(i, 1);
        };
        removeFrom(this.walls, target);
        removeFrom(this.staticModels, target);
        // Los colliders hijos (celdas rectangulares, paneles...) también
        // salen de walls para no dejar colisiones fantasma.
        target?.traverse?.(obj => {
            if (obj !== target) removeFrom(this.walls, obj);
        });
        removeFrom(this.decorativeMeshes, target);
        removeFrom(this.billboardMeshes, target);
        removeFrom(this.doorMeshes, target);
        // Si era una puerta con instancia lógica, retirarla también para
        // que no siga animándose fuera de la escena.
        const doorInstanceIndex = Door.instances?.findIndex?.(door => door.mesh === target) ?? -1;
        if (doorInstanceIndex >= 0) Door.instances.splice(doorInstanceIndex, 1);
        removeFrom(this.foodMeshes, target);
        removeFrom(this.ammoMeshes, target);
        removeFrom(this.weaponMeshes, target);
        if (target.parent) target.parent.remove(target);

        if (record.kind === 'grid') {
            if (record.dataList && record.dataRef) {
                const i = record.dataList.indexOf(record.dataRef);
                if (i >= 0) record.dataList.splice(i, 1);
            }
            if (record.cellX != null && record.cellY != null && this.mapGrid?.[record.cellY]) {
                this.mapGrid[record.cellY][record.cellX] = { base: '.', rotation: 0 };
            }
        } else if (record.kind === 'prop') {
            if (Number.isInteger(record.modelIndex) && this.propModels?.[record.modelIndex]) {
                this.propModels.splice(record.modelIndex, 1);
                // Reindexar: los holders conservan su índice en userData.
                this.editableRegistry.forEach((rec, obj) => {
                    if (rec.kind === 'prop' && rec.modelIndex > record.modelIndex) {
                        rec.modelIndex -= 1;
                        if (obj?.userData) obj.userData.propModelIndex = rec.modelIndex;
                    }
                });
            }
        }
        return true;
    }

    // Mueve un objeto de rejilla a otra celda (actualiza malla, mapData y
    // mapGrid). Se puede colocar en cualquier celda: si está ocupada se
    // retira lo que haya (salvo spawn P y portal, protegidos).
    // Devuelve false solo si la celda es exterior o está protegida.
    moveGridEditableToCell(holder, record, cellX, cellY, rotationDeg = null) {
        if (!this.mapGrid?.[cellY] || !this.mapGrid[cellY][cellX]) return false;
        const isSameCell = record.cellX === cellX && record.cellY === cellY;
        this.lastCellCleared = [];
        this.lastPlaceBlocked = null;
        if (!isSameCell) {
            const cleared = this.clearCell(cellX, cellY, { exceptHolder: holder });
            if (!cleared.ok) {
                this.lastPlaceBlocked = cleared.reason;
                return false;
            }
            this.lastCellCleared = cleared.cleared;
        }
        const newRotation = rotationDeg != null ? rotationDeg : (record.rotation || 0);
        // Liberar celda origen.
        if (record.cellX != null && record.cellY != null && this.mapGrid[record.cellY]?.[record.cellX] && !isSameCell) {
            this.mapGrid[record.cellY][record.cellX] = { base: '.', rotation: 0 };
        }
        this.mapGrid[cellY][cellX] = { base: record.base, rotation: newRotation };
        const worldPos = this.gridToWorldPos(cellX, cellY);
        const groundY = record.groundY ?? holder.position.y;
        holder.position.set(worldPos.x, groundY, worldPos.z);
        holder.rotation.y = THREE.MathUtils.degToRad(newRotation);
        holder.updateMatrixWorld(true);
        this.refreshColliderFor(holder);
        if (record.dataRef?.position) {
            record.dataRef.position.x = worldPos.x;
            record.dataRef.position.z = worldPos.z;
        }
        if (record.dataRef && 'rotation' in record.dataRef) {
            record.dataRef.rotation = newRotation;
        }
        record.cellX = cellX;
        record.cellY = cellY;
        record.rotation = newRotation;
        return true;
    }

    // Añade un objeto de rejilla nuevo (muro, puerta, item) en cualquier
    // celda, retirando lo que hubiera (salvo spawn P y portal). Devuelve el
    // holder o null si la celda es exterior o está protegida.
    addGridEditableAtCell(base, cellX, cellY, rotationDeg = 0) {
        if (!this.mapGrid?.[cellY] || !this.mapGrid[cellY][cellX]) return null;
        this.lastCellCleared = [];
        this.lastPlaceBlocked = null;
        const cleared = this.clearCell(cellX, cellY);
        if (!cleared.ok) {
            this.lastPlaceBlocked = cleared.reason;
            return null;
        }
        this.lastCellCleared = cleared.cleared;
        const worldPos = this.gridToWorldPos(cellX, cellY);
        // Reutilizar los creadores existentes según el tipo de bloque.
        if (base === '#') {
            const itemData = { position: { x: worldPos.x, y: 0, z: worldPos.z }, type: 'wall', rotation: rotationDeg };
            this.mapData.walls.push(itemData);
            this.mapGrid[cellY][cellX] = { base, rotation: rotationDeg };
            return this.spawnWallMeshForConstruction('wall', itemData, cellX, cellY);
        }
        if (base === 'B' || base === 'L') {
            const list = base === 'B' ? this.mapData.bushes : this.mapData.bricks;
            const itemData = { position: { x: worldPos.x, y: 0, z: worldPos.z }, type: base === 'B' ? 'bush' : 'brick', rotation: rotationDeg };
            list.push(itemData);
            this.mapGrid[cellY][cellX] = { base, rotation: rotationDeg };
            return this.spawnWallMeshForConstruction(base === 'B' ? 'bush' : 'brick', itemData, cellX, cellY);
        }
        if (base === 'D') {
            const doorData = { position: { x: worldPos.x, y: 0, z: worldPos.z }, rotation: rotationDeg };
            this.mapData.doorPositions.push(doorData);
            this.mapGrid[cellY][cellX] = { base, rotation: rotationDeg };
            return this.spawnDoorMeshForConstruction(doorData, cellX, cellY);
        }
        if (base === '+') {
            const foodData = { x: worldPos.x, y: 0.5, z: worldPos.z };
            // foodItems acepta Vector3 o {position}; usar Vector3 simple.
            const vec = new THREE.Vector3(worldPos.x, 0.5, worldPos.z);
            this.mapData.foodItems.push(vec);
            this.mapGrid[cellY][cellX] = { base, rotation: 0 };
            const sprite = this.createFoodSprite({ x: worldPos.x, z: worldPos.z });
            const cell = { x: cellX, y: cellY };
            this.registerEditable(sprite, {
                kind: 'grid', base, cellX: cell.x, cellY: cell.y, rotation: 0,
                groundY: CONFIG.PICKUP_SPRITE_HEIGHT, dataRef: vec,
                dataList: this.mapData.foodItems, label: 'comida'
            });
            void foodData;
            return sprite;
        }
        if (base === 'MA' || base === 'MP') {
            const ammoData = {
                position: new THREE.Vector3(worldPos.x, 0.5, worldPos.z),
                type: base === 'MP' ? 'pistol' : 'machinegun',
                rotation: rotationDeg
            };
            this.mapData.ammoItems.push(ammoData);
            this.mapGrid[cellY][cellX] = { base, rotation: rotationDeg };
            // Reutilizar la creación estándar volviendo a generar solo este item.
            const prevLen = this.ammoMeshes.length;
            this.createAmmoItemsFromMapTail(ammoData);
            void prevLen;
            return this.ammoMeshes[this.ammoMeshes.length - 1] || null;
        }
        return null;
    }

    spawnWallMeshForConstruction(key, itemData, cellX, cellY) {
        const sizes = {
            wall: { w: CONFIG.BLOCK_SIZE, h: CONFIG.BLOCK_SIZE },
            bush: { w: CONFIG.BLOCK_SIZE, h: CONFIG.BLOCK_SIZE * 0.5 },
            brick: { w: CONFIG.BLOCK_SIZE * 0.7, h: CONFIG.BLOCK_SIZE * 0.6 }
        };
        const size = sizes[key] || sizes.wall;
        const geo = this.sharedGeometries[key] || new THREE.BoxGeometry(size.w, size.h, size.w);
        this.sharedGeometries[key] = this.sharedGeometries[key] || geo;
        const mat = this.sharedMaterials[key] || new THREE.MeshLambertMaterial({ color: 0x888888 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(itemData.position.x, size.h / 2, itemData.position.z);
        mesh.rotation.y = THREE.MathUtils.degToRad(itemData.rotation || 0);
        mesh.updateMatrixWorld(true);
        mesh.userData = {
            ...mesh.userData,
            boundingBox: new THREE.Box3().setFromObject(mesh),
            isStatic: true, type: 'wall', bulletImpact: true, bulletImpactFallback: true
        };
        this.scene.add(mesh);
        this.walls.push(mesh);
        const baseByKey = { wall: '#', bush: 'B', brick: 'L' };
        this.registerEditable(mesh, {
            kind: 'grid', base: baseByKey[key] || '#', cellX, cellY,
            rotation: itemData.rotation || 0, groundY: size.h / 2,
            dataRef: itemData,
            dataList: key === 'wall' ? this.mapData.walls : key === 'bush' ? this.mapData.bushes : this.mapData.bricks,
            label: key
        });
        return mesh;
    }

    spawnDoorMeshForConstruction(doorData, cellX, cellY) {
        const doorHeight = CONFIG.BLOCK_SIZE;
        const geo = new THREE.PlaneGeometry(CONFIG.BLOCK_SIZE, doorHeight);
        const mat = new THREE.MeshLambertMaterial({ color: 0x00ffff, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(doorData.position.x, doorHeight / 2, doorData.position.z);
        mesh.rotation.y = THREE.MathUtils.degToRad(doorData.rotation || 0);
        mesh.userData = {
            closedY: doorHeight / 2, openY: doorHeight + 10, targetY: doorHeight / 2,
            id: Math.random(), bulletImpact: true, bulletImpactFallback: true
        };
        this.scene.add(mesh);
        this.doorMeshes.push(mesh);
        // Las puertas nuevas también deben abrirse con E.
        try { new Door(mesh); } catch { /* noop */ }
        this.registerEditable(mesh, {
            kind: 'grid', base: 'D', cellX, cellY, rotation: doorData.rotation || 0,
            groundY: doorHeight / 2, dataRef: doorData, dataList: this.mapData.doorPositions, label: 'puerta'
        });
        return mesh;
    }

    createAmmoItemsFromMapTail(ammoData) {
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(
            ammoData.type === 'pistol' ? 'assets/textures/pistol_ammo.png' : 'assets/textures/municion_ametra.png'
        );
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
        const ammoScale = CONFIG.AMMO_SPRITE_SCALE || 0.75;
        sprite.scale.set(ammoScale, ammoScale, 1);
        sprite.position.set(ammoData.position.x, CONFIG.PICKUP_SPRITE_HEIGHT, ammoData.position.z);
        sprite.userData = {
            type: 'ammo', ammoType: ammoData.type,
            ammoAmount: ammoData.type === 'pistol' ? CONFIG.PISTOL_AMMO_AMOUNT : CONFIG.MACHINEGUN_AMMO_AMOUNT,
            weaponIndex: ammoData.type === 'pistol' ? 0 : 1, collected: false, rotationSpeed: 2.0
        };
        this.scene.add(sprite);
        this.ammoMeshes.push(sprite);
        const cell = this.worldToGridCell?.(sprite.position) || null;
        this.registerEditable(sprite, {
            kind: 'grid', base: ammoData.type === 'pistol' ? 'MP' : 'MA',
            cellX: cell?.x ?? null, cellY: cell?.y ?? null, rotation: ammoData.rotation || 0,
            groundY: CONFIG.PICKUP_SPRITE_HEIGHT, dataRef: ammoData, dataList: this.mapData.ammoItems, label: 'munición'
        });
        return sprite;
    }

    gridToWorldPos(cellX, cellY) {
        const layout = this.gridLayout;
        const blockSize = this.mapData?.blockSize || CONFIG.BLOCK_SIZE;
        const mapWidth = layout?.width ?? this.mapData?.width ?? 0;
        const mapHeight = layout?.height ?? this.mapData?.height ?? 0;
        const offsetX = layout?.offsetX || 0;
        const offsetY = layout?.offsetY || 0;
        const offsetWorldX = (mapWidth * blockSize) / 2;
        const offsetWorldZ = (mapHeight * blockSize) / 2;
        return {
            x: ((cellX - offsetX) * blockSize) - offsetWorldX + (blockSize / 2),
            z: ((cellY - offsetY) * blockSize) - offsetWorldZ + (blockSize / 2)
        };
    }

    worldToGridCell(worldPos) {
        const layout = this.gridLayout;
        if (!layout || !this.mapGrid?.length) return null;
        const blockSize = this.mapData?.blockSize || CONFIG.BLOCK_SIZE;
        const mapWidth = layout.width ?? 0;
        const mapHeight = layout.height ?? 0;
        const offsetX = layout.offsetX || 0;
        const offsetY = layout.offsetY || 0;
        const offsetWorldX = (mapWidth * blockSize) / 2;
        const offsetWorldZ = (mapHeight * blockSize) / 2;
        const cellX = Math.floor((worldPos.x + offsetWorldX - (blockSize / 2)) / blockSize + 0.5) + offsetX;
        const cellY = Math.floor((worldPos.z + offsetWorldZ - (blockSize / 2)) / blockSize + 0.5) + offsetY;
        if (cellY < 0 || cellY >= this.mapGrid.length) return null;
        if (cellX < 0 || cellX >= (this.mapGrid[cellY]?.length || 0)) return null;
        return { x: cellX, y: cellY };
    }

    getGridCell(cellX, cellY) {
        return this.mapGrid?.[cellY]?.[cellX] || null;
    }

    static isGridCellFree(cell) {
        if (!cell) return false;
        return cell.base === '.' || cell.base === ' ' || cell.base === '';
    }

    static isGridCellProtected(cell) {
        // El spawn del jugador y el portal de salida no se pueden
        // sobrescribir: romperían el mapa.
        return cell?.base === 'P' || cell?.base === 'PORTAL';
    }

    // Vacía una celda para construir sobre ella: retira mallas editables y
    // datos sin malla (spawners de enemigos, de munición/comida, palmeras de
    // texto, decorados e items extra). Devuelve { ok, reason?, cleared: [] }.
    // reason: 'outside' | 'protected'. P y PORTAL están protegidos.
    clearCell(cellX, cellY, { exceptHolder = null } = {}) {
        if (!this.mapGrid?.[cellY] || !this.mapGrid[cellY][cellX]) {
            return { ok: false, reason: 'outside', cleared: [] };
        }
        const token = this.mapGrid[cellY][cellX];
        if (World.isGridCellProtected(token)) {
            return { ok: false, reason: 'protected', cleared: [] };
        }
        const cleared = [];

        // 1) Mallas editables registradas en esa celda.
        const holders = [];
        this.editableRegistry.forEach((rec, holder) => {
            if (holder && holder !== exceptHolder && rec?.kind === 'grid' &&
                rec.cellX === cellX && rec.cellY === cellY) {
                holders.push({ holder, rec });
            }
        });
        holders.forEach(({ holder, rec }) => {
            cleared.push(rec.label || rec.base || 'objeto');
            this.removeEditableObject(holder);
        });

        // 2) Datos sin malla (spawners y restos del .txt) en esa celda.
        const cellOf = (position) => {
            if (!position) return null;
            try {
                return this.worldToGridCell({
                    x: Number(position.x) || 0,
                    z: Number(position.z) || 0
                });
            } catch {
                return null;
            }
        };
        const dataLists = [
            ['spawner', this.genericSpawners, (s) => s?.id || 'spawner', (s) => s?.position],
            ['enemigo', this.enemySpawns, (s) => s?.type || 'enemigo', (s) => s?.position],
            ['munición', this.ammoSpawners, () => 'munición', (s) => s?.position],
            ['comida', this.foodSpawners, () => 'comida', (s) => s?.position],
            ['palmera', this.mapData?.models3D, () => 'palmera', (s) => s?.position],
            ['decorado', this.mapData?.decorationItems, () => 'decorado', (s) => s?.position],
            ['extra', this.mapData?.extraItems, (s) => s?.code || 'extra', (s) => s?.position]
        ];
        dataLists.forEach(([kind, list, labelOf, posOf]) => {
            if (!Array.isArray(list)) return;
            void kind;
            for (let i = list.length - 1; i >= 0; i--) {
                const entry = list[i];
                const cell = cellOf(posOf(entry));
                if (cell && cell.x === cellX && cell.y === cellY) {
                    try { cleared.push(labelOf(entry)); } catch { cleared.push('objeto'); }
                    list.splice(i, 1);
                }
            }
        });

        this.mapGrid[cellY][cellX] = { base: '.', rotation: 0 };
        return { ok: true, cleared };
    }

    serializeGridToTxt() {
        if (!this.mapGrid) return null;
        const tokenFor = (cell) => {
            const base = cell?.base ?? '.';
            let token = String(base);
            if (cell?.rotation) token += `[${cell.rotation}]`;
            return `(${token})`;
        };
        // Conservar maxSpawns/spawnRate solo donde venían explícitos.
        const fullTokenFor = (cell) => {
            const base = cell?.base ?? '.';
            let token = String(base);
            if (cell?.rotation) token += `[${cell.rotation}]`;
            if (cell?.hasMaxSpawns && String(base).match(/^(S\d+|[1-7]|A|ALIEN|MINIGUN)$/)) token += `{${cell.maxSpawns}}`;
            if (cell?.hasSpawnRate && String(base).match(/^(S\d+|[1-7]|A|ALIEN|MINIGUN)$/)) token += `<${cell.spawnRate}>`;
            return `(${token})`;
        };
        void tokenFor;
        return this.mapGrid.map(row => row.map(fullTokenFor).join('')).join('\n') + '\n';
    }

    refreshColliderFor(holder) {
        if (!holder) return;
        const record = this.editableRegistry.get(holder)?.kind
            ? this.editableRegistry.get(holder)
            : null;
        try {
            holder.updateMatrixWorld(true);
            // Props con celdas rectangulares (p. ej. mesa del Hormiguero):
            // cada celda guarda su rectángulo local y se reproyecta al
            // mundo, así la colisión sigue al modelo al moverlo o rotarlo.
            // No se escribe caja única en el holder para no hinchar la
            // colisión a la caja ejes-alineada.
            const cells = [];
            holder.traverse?.(obj => {
                if (obj !== holder && obj?.userData?.colliderCell) cells.push(obj);
            });
            if (cells.length > 0) {
                cells.forEach(cell => {
                    const c = cell.userData.colliderCell;
                    cell.userData.boundingBox = new THREE.Box3(
                        new THREE.Vector3(c.x - c.w / 2, c.y0, c.z - c.d / 2),
                        new THREE.Vector3(c.x + c.w / 2, c.y1, c.z + c.d / 2)
                    ).applyMatrix4(holder.matrixWorld);
                });
                return;
            }
            const freshBox = new THREE.Box3().setFromObject(holder);
            if (record?.kind === 'prop' && record.collisionBoxSize) {
                const size = record.collisionBoxSize;
                const pos = holder.position;
                const w = Number(size.width) || 2;
                const h = Number(size.height) || 2;
                const d = Number(size.depth) || 2;
                // Para grupos rotados se recalcula el AABB real y se
                // conserva la altura lógica del prop.
                const box = new THREE.Box3().setFromObject(holder);
                const realSize = box.getSize(new THREE.Vector3());
                const cx = (box.min.x + box.max.x) / 2;
                const cz = (box.min.z + box.max.z) / 2;
                holder.userData.boundingBox = new THREE.Box3(
                    new THREE.Vector3(cx - Math.max(w, realSize.x) / 2, pos.y, cz - Math.max(d, realSize.z) / 2),
                    new THREE.Vector3(cx + Math.max(w, realSize.x) / 2, pos.y + Math.max(h, realSize.y), cz + Math.max(d, realSize.z) / 2)
                );
            } else if (holder.userData?.boundingBox) {
                holder.userData.boundingBox.copy(freshBox);
            } else {
                holder.userData.boundingBox = freshBox;
            }
        } catch (err) {
            console.warn('[Construcción] No se pudo refrescar colisión:', err);
        }
    }

    // Colliders hijos de un holder (celdas de la mesa, paneles de
    // conducto...): se retiran de walls mientras se arrastra el fantasma
    // y se restauran al colocar o cancelar.
    removeHolderChildColliders(holder) {
        const removed = [];
        if (!holder?.traverse || !this.walls) return removed;
        holder.traverse(obj => {
            if (obj !== holder && obj?.userData?.boundingBox && this.walls.includes(obj)) {
                this.walls.splice(this.walls.indexOf(obj), 1);
                removed.push(obj);
            }
        });
        return removed;
    }

    restoreHolderChildColliders(removed) {
        (removed || []).forEach(obj => {
            if (obj && this.walls && !this.walls.includes(obj)) this.walls.push(obj);
        });
    }

    holderHasColliderCells(holder) {
        let found = false;
        holder?.traverse?.(obj => {
            if (obj !== holder && obj?.userData?.colliderCell) found = true;
        });
        return found;
    }

    loadTiledTexture(path, repeatX = 1, repeatY = 1, { pixelated = false } = {}) {
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(
            path,
            () => { },
            undefined,
            () => console.error(`No se pudo cargar textura de superficie: ${path}`)
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        // Los props pixel-art necesitan conservar sus píxeles incluso cuando
        // se amplían en pantalla. El resto del mundo mantiene el filtrado
        // lineal original.
        texture.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
        texture.minFilter = pixelated
            ? THREE.NearestMipmapNearestFilter
            : THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        this.surfaceTextures.add(texture);
        return texture;
    }

    createTexturedStandardMaterial(
        color,
        texturePath,
        repeatX = 1,
        repeatY = 1,
        options = {}
    ) {
        const { pixelated = false, ...materialOptions } = options;
        const map = texturePath
            ? this.loadTiledTexture(texturePath, repeatX, repeatY, { pixelated })
            : null;

        const material = new THREE.MeshStandardMaterial({
            color,
            map,
            ...materialOptions
        });

        // El plató no usa un entorno HDRI y sus superficies metálicas
        // terminaban perdiendo casi toda la luz. Mantener un mínimo de
        // difusión y un relleno muy sutil solo en mapa2 aclara las texturas
        // sin convertirlas en materiales planos ni afectar al Parque.
        if (this.currentMapName === 'mapa2' && map) {
            material.metalness = Math.min(0.45, material.metalness);
            if (material.emissive?.getHex?.() === 0) {
                material.emissive.set(0x202838);
                material.emissiveIntensity = 0.28;
            }
        }

        return material;
    }

    // #region Inicialización World
    // Descripción: Carga los datos del mapa, configura el skybox (cielo), iluminación, genera el suelo y crea los objetos iniciales del nivel.
    async init(mapName = 'default') {
        this.currentMapName = mapName;
        // Carga de Datos
        this.mapData = await this.mapLoader.loadMapFile(mapName);
        this.mapGrid = Array.isArray(this.mapData.rawGrid)
            ? this.mapData.rawGrid.map(row => row.map(cell => ({ ...cell })))
            : null;
        this.gridLayout = this.mapData.worldLayout
            ? { ...this.mapData.worldLayout }
            : { width: this.mapData.width, height: this.mapData.height, offsetX: 0, offsetY: 0 };
        this.propModels = [];
        this.editableRegistry = new Map();
        this.enemySpawns = this.mapData.enemySpawns;
        this.genericSpawners = this.mapData.genericSpawners;
        this.exitPortalSpawn = this.mapData.exitPortalSpawn || null;
        this.ammoSpawners = this.mapData.ammoSpawners || [];
        this.foodSpawners = this.mapData.foodSpawners || [];

        // Configuración de Skybox
        const textureLoader = new THREE.TextureLoader();
        let skyTexture = null;

        try {
            skyTexture = await new Promise((resolve) => {
                textureLoader.load(
                    'assets/textures/skybox.jpg',
                    (tex) => resolve(tex),
                    undefined,
                    () => resolve(null)
                );
            });
        } catch (err) {
            skyTexture = null;
        }

        if (mapName === 'mapa2') {
            skyTexture?.dispose();
            skyTexture = null;
            this.scene.background = new THREE.Color(0x080611);
            this.scene.environment = null;
            this.scene.fog = new THREE.Fog(0x080611, 90, 240);
        } else if (skyTexture) {
            if (THREE.EquirectangularReflectionMapping) {
                skyTexture.mapping = THREE.EquirectangularReflectionMapping;
            }
            if (THREE.sRGBEncoding) {
                skyTexture.encoding = THREE.sRGBEncoding;
            }

            this.scene.background = skyTexture;
            if (this.renderer && this.renderer.capabilities && !this.scene.environment) {
                try {
                    this.scene.environment = skyTexture;
                } catch (e) {
                }
            }

            this.scene.fog = new THREE.Fog(0x87CEEB, 120, 350);
        } else {
            const skyColor = 0x87CEEB;
            this.scene.background = new THREE.Color(skyColor);
            this.scene.fog = new THREE.Fog(skyColor, 120, 350);
        }
        this.backgroundTexture = skyTexture;

        // Iluminación
        const isHormigueroMap = mapName === 'mapa2';
        const hemiLight = new THREE.HemisphereLight(
            isHormigueroMap ? 0xfff4e1 : 0xffffff,
            isHormigueroMap ? 0x5d687c : 0x444444,
            isHormigueroMap ? 0.95 : 0.8
        );
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(
            isHormigueroMap ? 0xffe8ca : 0xffffff,
            isHormigueroMap ? 0.9 : 0.6
        );
        dirLight.position.set(50, 200, 100);
        dirLight.castShadow = false;
        this.scene.add(dirLight);
        this.environmentLights.push(hemiLight, dirLight);

        if (isHormigueroMap) {
            const studioFillLight = new THREE.AmbientLight(0xaab8cc, 0.38);
            this.scene.add(studioFillLight);
            this.environmentLights.push(studioFillLight);
        }
        const mapWidth = this.mapData.width * CONFIG.BLOCK_SIZE;
        const mapHeight = this.mapData.height * CONFIG.BLOCK_SIZE;
        const terrainBounds = this.mapData.terrainBounds || {
            minX: -mapWidth / 2,
            maxX: mapWidth / 2,
            minZ: -mapHeight / 2,
            maxZ: mapHeight / 2
        };
        const terrainMargin = CONFIG.BLOCK_SIZE * 2;
        const terrainWidth = terrainBounds.maxX - terrainBounds.minX;
        const terrainDepth = terrainBounds.maxZ - terrainBounds.minZ;
        const minimumFloorSize = mapName === 'mapa1' ? 0 : CONFIG.ARENA_SIZE;
        const floorWidth = Math.max(terrainWidth + terrainMargin * 2, minimumFloorSize);
        const floorDepth = Math.max(terrainDepth + terrainMargin * 2, minimumFloorSize);
        const floorCenterX = (terrainBounds.minX + terrainBounds.maxX) / 2;
        const floorCenterZ = (terrainBounds.minZ + terrainBounds.maxZ) / 2;

        // Generación de Suelo
        // Parque usa una única imagen compuesta y un único plano. El camino
        // ya está horneado dentro de la textura, así que no se crean baldosas
        // independientes ni otro suelo debajo de ellas.
        if (mapName === 'mapa1') {
            const parkGroundTexture = textureLoader.load(
                'assets/textures/park/park_ground_terrain.png',
                () => { },
                undefined,
                () => console.error('No se pudo cargar assets/textures/park/park_ground_terrain.png')
            );
            parkGroundTexture.colorSpace = THREE.SRGBColorSpace;
            parkGroundTexture.wrapS = THREE.ClampToEdgeWrapping;
            parkGroundTexture.wrapT = THREE.ClampToEdgeWrapping;
            parkGroundTexture.minFilter = THREE.LinearMipmapLinearFilter;
            parkGroundTexture.magFilter = THREE.LinearFilter;
            parkGroundTexture.generateMipmaps = true;
            parkGroundTexture.needsUpdate = true;

            const terrainGeometry = new THREE.PlaneGeometry(floorWidth, floorDepth);
            terrainGeometry.rotateX(-Math.PI / 2);
            const terrainMaterial = new THREE.MeshLambertMaterial({
                map: parkGroundTexture,
                side: THREE.FrontSide
            });
            const parkGroundTerrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
            parkGroundTerrain.name = 'park_ground_terrain';
            parkGroundTerrain.position.set(floorCenterX, 0, floorCenterZ);
            parkGroundTerrain.renderOrder = -20;
            parkGroundTerrain.userData = {
                type: 'floor',
                isGroundPlane: true,
                bulletImpact: true,
                bulletImpactFallback: false
            };

            this.scene.add(parkGroundTerrain);
            this.floorGroup = parkGroundTerrain;
            this.parkGroundTerrain = parkGroundTerrain;
        } else if (mapName === 'mapa2') {
            const studioFloorGeometry = new THREE.PlaneGeometry(floorWidth, floorDepth);
            studioFloorGeometry.rotateX(-Math.PI / 2);
            const studioFloorTexture = this.loadTiledTexture(
                HORMIGUERO_TEXTURES.floor,
                Math.max(1, floorWidth / 48),
                Math.max(1, floorDepth / 48)
            );
            const studioFloorMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: studioFloorTexture,
                roughness: 0.92,
                metalness: 0.08,
                emissive: 0x202838,
                emissiveIntensity: 0.28,
                flatShading: true
            });
            const studioFloor = new THREE.Mesh(
                studioFloorGeometry,
                studioFloorMaterial
            );
            studioFloor.name = 'hormiguero_studio_floor';
            // El suelo base queda ligeramente por debajo de los suelos
            // modulares del mapa. Así no comparte profundidad con el suelo
            // técnico de los conductos ni con las plataformas apoyadas en Y=0.
            studioFloor.position.set(floorCenterX, -0.04, floorCenterZ);
            studioFloor.renderOrder = -20;
            studioFloor.userData = {
                type: 'floor',
                isGroundPlane: true,
                bulletImpact: true,
                bulletImpactFallback: false
            };
            this.scene.add(studioFloor);
            this.floorGroup = studioFloor;
            // Reutiliza la referencia de terreno único para que el cambio de
            // mapa libere también este plano, igual que el suelo de Parque.
            this.parkGroundTerrain = studioFloor;
        } else {
            const tileSize = 20;
            const tilesX = Math.ceil(floorWidth / tileSize);
            const tilesZ = Math.ceil(floorDepth / tileSize);
            const tileGeometry = new THREE.PlaneGeometry(tileSize, tileSize);

            let floorTexture = null;
            try {
                floorTexture = textureLoader.load(
                    'assets/textures/grass.jpg',
                    () => { },
                    () => { },
                    () => { floorTexture = null; }
                );
            } catch (err) {
                floorTexture = null;
            }

            let tileMaterial;
            if (floorTexture) {
                floorTexture.wrapS = THREE.RepeatWrapping;
                floorTexture.wrapT = THREE.RepeatWrapping;
                floorTexture.repeat.set(2, 2);
                tileMaterial = new THREE.MeshLambertMaterial({ map: floorTexture });
            } else {
                tileMaterial = new THREE.MeshLambertMaterial({ color: 0x44aa44 });
            }

            const floorGroup = new THREE.Group();
            const rotations = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
            const startX = floorCenterX - (tilesX * tileSize) / 2 + tileSize / 2;
            const startZ = floorCenterZ - (tilesZ * tileSize) / 2 + tileSize / 2;

            for (let x = 0; x < tilesX; x++) {
                for (let z = 0; z < tilesZ; z++) {
                    const tile = new THREE.Mesh(tileGeometry, tileMaterial);
                    tile.rotation.x = -Math.PI / 2;
                    tile.rotation.z = rotations[Math.floor(Math.random() * rotations.length)];
                    tile.position.set(startX + x * tileSize, 0, startZ + z * tileSize);
                    tile.matrixAutoUpdate = false;
                    tile.updateMatrix();
                    floorGroup.add(tile);
                }
            }

            floorGroup.userData = {
                type: 'floor',
                bulletImpact: true
            };
            this.scene.add(floorGroup);
            this.floorGroup = floorGroup;
        }

        // Generación de Objetos Inicial
        this.createWallsFromMap();
        this.createDoorsFromMap();
        this.createFoodItemsFromMap();
        this.createAmmoItemsFromMap();

        // Cargar modelos 3D desde JSON externo
        await this.load3DModelsFromJSON(mapName);
        this.createEnemySpawnerDebugBounds();
    }
    // #endregion

    // #region Creación de Plató El Hormiguero World
    // Descripción: Construye un plató de televisión low poly con primitivas
    // 3D ligeras, sin depender de modelos externos ni texturas pesadas.
    createHormigueroSet(model = {}) {
        return buildHormigueroSet.call(this, model);
    }

    createHormigueroSecretRoom(model = {}) {
        return buildHormigueroSecretRoom.call(this, model);
    }

    createHormigueroDesk(model = {}) {
        return buildHormigueroDesk.call(this, model);
    }

    createHormigueroBleachers(model = {}) {
        return buildHormigueroBleachers.call(this, model);
    }
    // #endregion

    // #region Portal de Salida World
    // Descripción: Busca una celda despejada del mapa y materializa el portal
    // cuando el sistema de rondas o el mapa de pruebas lo solicita.
    findExitPortalPosition(playerPosition = null) {
        return findExitPortalPositionFn.call(this, playerPosition);
    }

    spawnExitPortal(playerPosition = null, audioManager = null) {
        return spawnExitPortalFn.call(this, playerPosition, audioManager);
    }

    updateExitPortal(delta, cameraPosition) {
        return updateExitPortalFn.call(this, delta, cameraPosition);
    }

    tryEnterExitPortal(playerPosition) {
        return tryEnterExitPortalFn.call(this, playerPosition);
    }

    getExitPortalDestination() {
        return getExitPortalDestinationFn.call(this);
    }
    // #endregion

    // #region Getters de Objetos World
    // Descripción: Proporciona acceso a las listas de objetos colisionables, spawners y mallas del mundo.
    createEnemySpawnerDebugBounds() {
        this.spawnerHelpers.forEach(helper => this.scene.remove(helper));
        this.spawnerHelpers.clear();

        // Los spawners del patio deben poder localizarse durante la partida.
        // Se dibujan como cajas de depuración independientes de los hitboxes
        // generales, con profundidad desactivada para que nunca queden ocultas
        // detrás del suelo o de los decorados.
        if (this.currentMapName !== 'mapa2') return;

        const halfSize = 3.5;
        const minY = 0.05;
        const maxY = 4.2;
        const purple = 0xb04cff;

        (this.genericSpawners || []).forEach(spawner => {
            if (!spawner?.position) return;

            const bounds = new THREE.Box3(
                new THREE.Vector3(
                    spawner.position.x - halfSize,
                    minY,
                    spawner.position.z - halfSize
                ),
                new THREE.Vector3(
                    spawner.position.x + halfSize,
                    maxY,
                    spawner.position.z + halfSize
                )
            );
            const helper = new THREE.Box3Helper(bounds.clone(), purple);
            helper.name = `spawner-bounds-${spawner.id}`;
            helper.renderOrder = 1000;
            helper.material.depthTest = false;
            helper.material.depthWrite = false;
            helper.userData = {
                type: 'enemySpawnerDebugBounds',
                spawnerId: spawner.id
            };

            // El WaveEvent usa la misma caja para mantener la referencia
            // espacial del área que se está mostrando.
            spawner.boundingBox = bounds;
            spawner.debugBounds = bounds;

            this.scene.add(helper);
            this.spawnerHelpers.set(spawner, helper);
        });
    }

    applyVentilationGateState(grate, collider, open) {
        const isOpen = Boolean(open);
        const cover = grate?.userData?.ventilationCover;
        if (cover) {
            if (grate.userData?.ventilationCoverMode === 'visibility') {
                cover.visible = !isOpen;
            } else {
                cover.rotation.x = isOpen ? -1.2 : 0;
            }
        }

        if (isOpen) {
            const colliderIndex = this.walls.indexOf(collider);
            if (colliderIndex !== -1) this.walls.splice(colliderIndex, 1);
            if (collider?.parent) collider.parent.remove(collider);

            const helper = this.collisionHelpers.get(collider);
            if (helper) {
                this.scene.remove(helper);
                this.collisionHelpers.delete(collider);
            }
        } else {
            if (!collider?.parent) this.scene.add(collider);
            if (collider && !this.walls.includes(collider)) this.walls.push(collider);
        }

        if (grate?.userData) grate.userData.ventilationOpen = isOpen;
        if (collider?.userData) collider.userData.isOpen = isOpen;

        return isOpen;
    }

    setVentilationGateOpen(gateId, open = true) {
        const normalizedGateId = String(gateId || '').trim();
        if (!normalizedGateId) return false;

        const isOpen = Boolean(open);
        this.ventilationGateStates.set(normalizedGateId, isOpen);
        let matched = false;

        this.ventilationGateColliders.forEach((collider, grate) => {
            if (grate.userData?.ventilationGateId !== normalizedGateId) return;

            matched = true;
            this.applyVentilationGateState(grate, collider, isOpen);
        });

        return matched;
    }

    setVentilationOpen(open = true, gateIds = null) {
        this.ventilationOpen = Boolean(open);

        const requestedGateIds = Array.isArray(gateIds)
            ? gateIds.map(gateId => String(gateId || '').trim()).filter(Boolean)
            : null;

        if (requestedGateIds && requestedGateIds.length > 0) {
            requestedGateIds.forEach(gateId => {
                this.setVentilationGateOpen(gateId, this.ventilationOpen);
            });
        } else {
            this.ventilationGateColliders.forEach((collider, grate) => {
                const gateId = grate.userData?.ventilationGateId;
                if (gateId) this.setVentilationGateOpen(gateId, this.ventilationOpen);
            });
        }

        return this.ventilationOpen;
    }

    isVentilationOpen() {
        return this.ventilationOpen;
    }

    addGenericSpawner(id, position, options = {}) {
        const spawnerId = String(id || '').trim();
        if (!spawnerId || !position) return null;

        const existingSpawner = this.genericSpawners.find(spawner => spawner.id === spawnerId);
        if (existingSpawner) return existingSpawner;

        const spawner = {
            id: spawnerId,
            position: position.clone ? position.clone() : new THREE.Vector3(
                Number(position.x) || 0,
                Number(position.y) || 1,
                Number(position.z) || 0
            ),
            rotation: Number(options.rotation) || 0,
            encounter: options.encounter || null
        };

        this.genericSpawners.push(spawner);
        this.createEnemySpawnerDebugBounds();
        return spawner;
    }

    setCollisionDebugVisible(visible) {
        const shouldShow = Boolean(visible);
        CONFIG.DEBUG_SHOW_HITBOXES = shouldShow;

        if (shouldShow) {
            const collidableObjects = new Set([
                ...this.walls,
                ...this.staticModels,
                ...this.doorMeshes
            ]);

            collidableObjects.forEach(object => {
                if (!object?.userData?.boundingBox) return;

                let helper = this.collisionHelpers.get(object);
                if (!helper) {
                    helper = new THREE.Box3Helper(object.userData.boundingBox.clone(), 0x00ff00);
                    helper.renderOrder = 100;
                    helper.material.depthTest = false;
                    helper.material.depthWrite = false;
                    this.scene.add(helper);
                    this.collisionHelpers.set(object, helper);
                }

                helper.box.copy(object.userData.boundingBox);
                helper.visible = Boolean(object.parent);
                helper.updateMatrixWorld(true);
            });
        }

        this.collisionHelpers.forEach((helper, object) => {
            if (!shouldShow || !object?.parent || !object.userData?.boundingBox) {
                helper.visible = false;
                return;
            }

            helper.box.copy(object.userData.boundingBox);
            helper.visible = true;
            helper.updateMatrixWorld(true);
        });
    }

    getSolidObjects() {
        const solidObjects = new Set();
        const addObject = (object) => {
            if (object) solidObjects.add(object);
        };

        // Agregar muros
        this.walls.forEach(addObject);

        // Agregar modelos estáticos 3D
        this.staticModels.forEach(addObject);

        // Las puertas se crean en World y sus instancias se registran después
        // desde main.js. Usar también doorMeshes evita que el raycast dependa
        // de que exista una referencia global a Door.
        const doorInstances = new Map(Door.instances.map(door => [door.mesh, door]));
        this.doorMeshes.forEach(doorMesh => {
            const door = doorInstances.get(doorMesh);
            const isClosed = door ? !door.isOpen : this.isDoorMeshClosed(doorMesh);
            if (isClosed) addObject(doorMesh);
        });

        // Agregar puertas cerradas (si las tenemos referenciadas)
        Door.instances.forEach(door => {
            if (!door.isOpen) addObject(door.mesh);
        });

        return [...solidObjects];
    }

    isDoorMeshClosed(doorMesh) {
        const doorData = doorMesh?.userData || {};
        if (doorData.isOpen === true) return false;
        if (doorData.targetY !== undefined && doorData.closedY !== undefined) {
            return Math.abs(doorData.targetY - doorData.closedY) < 0.001;
        }
        return true;
    }

    getWalls() {
        return this.walls;
    }

    getEnemySpawns() {
        return this.enemySpawns;
    }

    getPlayerSpawn() {
        return this.mapData ? this.mapData.playerSpawn : null;
    }

    getDoorMeshes() {
        return this.doorMeshes;
    }

    getFoodMeshes() {
        return this.foodMeshes;
    }

    getAmmoMeshes() {
        return this.ammoMeshes;
    }

    getWeaponMeshes() {
        return this.weaponMeshes;
    }

    getGenericSpawners() {
        return this.genericSpawners;
    }

    getAmmoSpawners() {
        return this.ammoSpawners;
    }

    getFoodSpawners() {
        return this.foodSpawners || [];
    }
    getStaticModels() {
        return this.staticModels || [];
    }

    getDecorativeMeshes() {
        return this.decorativeMeshes || [];
    }

    getFloorGroup() {
        return this.floorGroup || null;
    }

    getBulletImpactObjects() {
        const impactObjects = new Set();
        const addImpactObject = (object) => {
            if (!object || object.userData?.bulletImpact === false) return;
            impactObjects.add(object);
        };

        this.getSolidObjects().forEach(addImpactObject);
        this.decorativeMeshes.forEach(addImpactObject);

        if (this.floorGroup) {
            addImpactObject(this.floorGroup);
        }

        // Recuperar props marcados como impactables aunque no hayan sido
        // añadidos a una lista específica por un loader externo.
        this.scene?.traverse(object => {
            if (object.userData?.bulletImpact === true) {
                addImpactObject(object);
            }
        });

        return [...impactObjects];
    }

    getBulletImpactFallbackObjects() {
        const fallbackObjects = [];
        this.getBulletImpactObjects().forEach(object => {
            if (object.userData?.bulletImpactFallback && object.userData.boundingBox) {
                fallbackObjects.push(object);
            }
        });
        return fallbackObjects;
    }

    getPlayerRotation() {
        return this.mapData ? this.mapData.playerRotation : 0;
    }
    // #endregion

    // #region Creación de Items (Runtime) World
    // Descripción: Métodos para instanciar objetos dinámicamente durante el juego, como paquetes de comida y munición.
    getFoodType(foodType = null) {
        if (foodType && typeof foodType === 'object' && foodType.texture) {
            return foodType;
        }

        if (typeof foodType === 'string') {
            const matchingType = FOOD_TYPES.find(type => type.id === foodType);
            if (matchingType) return matchingType;
        }

        return FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)] || FOOD_TYPES[0];
    }

    getFoodTexture(foodType) {
        if (!this.foodTextures[foodType.id]) {
            const textureLoader = new THREE.TextureLoader();
            const texture = textureLoader.load(
                foodType.texture,
                () => { },
                () => { },
                () => { console.error(`No se pudo cargar la textura de comida: ${foodType.name}`); }
            );
            texture.colorSpace = THREE.SRGBColorSpace;
            this.foodTextures[foodType.id] = texture;
        }

        return this.foodTextures[foodType.id];
    }

    createFoodSprite(position, foodType = null) {
        const type = this.getFoodType(foodType);
        const foodTexture = this.getFoodTexture(type);

        const spriteMaterial = new THREE.SpriteMaterial({
            map: foodTexture,
            color: 0xffffff,
            depthWrite: false,
            transparent: true,
            alphaTest: 0.02
        });

        const foodSprite = new THREE.Sprite(spriteMaterial);
        const scale = (type.scale || 3) * CONFIG.FOOD_SPRITE_SCALE;
        foodSprite.scale.set(scale, scale, 1);
        foodSprite.position.set(position.x, CONFIG.PICKUP_SPRITE_HEIGHT, position.z);

        foodSprite.userData = {
            type: 'food',
            foodType: type.id,
            foodName: type.name,
            healAmount: type.healAmount ?? CONFIG.FOOD_HEAL_AMOUNT,
            collected: false,
            rotationSpeed: 2.0
        };

        this.scene.add(foodSprite);
        this.foodMeshes.push(foodSprite);
        return foodSprite;
    }

    spawnFood(position, foodType = null) {
        return this.createFoodSprite(position, foodType);
    }

    spawnAmmo(type, position) {
        const textureLoader = new THREE.TextureLoader();
        let texturePath = '';
        let ammoAmount = 0;
        let weaponIndex = 0;

        if (type === 'pistol') {
            texturePath = 'assets/textures/pistol_ammo.png';
            ammoAmount = CONFIG.PISTOL_AMMO_AMOUNT;
            weaponIndex = 0;
        } else if (type === 'rpg') {
            texturePath = 'assets/textures/rpg_ammo.png';
            ammoAmount = CONFIG.RPG_AMMO_AMOUNT;
            weaponIndex = WEAPONS_DATA.findIndex(weapon => weapon.id === 'rpg');
        } else if (type === 'shotgun') {
            texturePath = 'assets/textures/municion_escopeta.png';
            ammoAmount = CONFIG.SHOTGUN_AMMO_AMOUNT;
            weaponIndex = 3;
        } else {
            texturePath = 'assets/textures/municion_ametra.png';
            ammoAmount = CONFIG.MACHINEGUN_AMMO_AMOUNT;
            weaponIndex = 1;
        }

        const texture = textureLoader.load(
            texturePath,
            () => { },
            () => { },
            () => { console.error(`No se pudo cargar la textura de munición: ${type}`); }
        );

        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            depthWrite: false,
            transparent: true,
            alphaTest: 0.03
        });

        const ammoSprite = new THREE.Sprite(spriteMaterial);

        const ammoScale = type === 'rpg'
            ? (CONFIG.RPG_AMMO_SPRITE_SCALE || 0.85)
            : (CONFIG.AMMO_SPRITE_SCALE || 0.75);
        ammoSprite.scale.set(ammoScale, ammoScale, 1);
        ammoSprite.position.set(position.x, CONFIG.PICKUP_SPRITE_HEIGHT, position.z);

        ammoSprite.userData = {
            type: 'ammo',
            ammoType: type,
            ammoAmount: ammoAmount,
            weaponIndex: weaponIndex,
            collected: false,
            rotationSpeed: 2.0
        };

        this.scene.add(ammoSprite);
        this.ammoMeshes.push(ammoSprite);
        return ammoSprite;
    }

    spawnWeaponPickup(weaponId, position) {
        const weapon = WEAPONS_DATA.find(type =>
            type.id === weaponId || type.name === weaponId
        );
        if (!weapon?.pickupTexture || !position) return null;

        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(
            weapon.pickupTexture,
            () => { },
            () => { },
            () => { console.error(`No se pudo cargar el recogible del arma: ${weapon.name}`); }
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;

        const material = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            depthWrite: false,
            alphaTest: 0.03
        });
        const pickup = new THREE.Sprite(material);
        const scale = Number(weapon.pickupScale) || 1.35;
        pickup.scale.set(scale, scale, 1);
        pickup.position.set(
            position.x,
            CONFIG.PICKUP_SPRITE_HEIGHT,
            position.z
        );
        pickup.userData = {
            type: 'weapon',
            weaponId: weapon.id || weapon.name,
            ammoAmount: Number(weapon.pickupAmmo) || 0,
            collected: false,
            rotationSpeed: 1.6
        };

        this.scene.add(pickup);
        this.weaponMeshes.push(pickup);
        return pickup;
    }
    // #endregion

    // #region Creación de Items (Map Data) World
    // Descripción: Métodos para instanciar items definidos en los datos del mapa durante la carga inicial.
    createAmmoItemsFromMap() {
        this.ammoMeshes = [];

        if (!this.mapData.ammoItems || this.mapData.ammoItems.length === 0) {
            return;
        }

        const textureLoader = new THREE.TextureLoader();
        const pistolAmmoTexture = textureLoader.load(
            'assets/textures/pistol_ammo.png',
            () => { },
            () => { },
            () => { console.error("No se pudo cargar la textura de munición de pistola"); }
        );

        const machinegunAmmoTexture = textureLoader.load(
            'assets/textures/municion_ametra.png',
            () => { },
            () => { },
            () => { console.error("No se pudo cargar la textura de munición de ametralladora"); }
        );

        this.mapData.ammoItems.forEach(ammoData => {
            const texture = ammoData.type === 'pistol' ? pistolAmmoTexture : machinegunAmmoTexture;

            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                color: 0xffffff,
                depthWrite: false,
                transparent: true
            });

            const ammoSprite = new THREE.Sprite(spriteMaterial);

            const ammoScale = CONFIG.AMMO_SPRITE_SCALE || 0.75;
            ammoSprite.scale.set(ammoScale, ammoScale, 1);
            ammoSprite.position.set(
                ammoData.position.x,
                CONFIG.PICKUP_SPRITE_HEIGHT,
                ammoData.position.z
            );

            ammoSprite.userData = {
                type: 'ammo',
                ammoType: ammoData.type,
                ammoAmount: ammoData.type === 'pistol' ? CONFIG.PISTOL_AMMO_AMOUNT : CONFIG.MACHINEGUN_AMMO_AMOUNT,
                weaponIndex: ammoData.type === 'pistol' ? 0 : 1,
                collected: false,
                rotationSpeed: 2.0
            };

            this.scene.add(ammoSprite);
            this.ammoMeshes.push(ammoSprite);

            const ammoCell = this.worldToGridCell?.(ammoSprite.position) || null;
            this.registerEditable(ammoSprite, {
                kind: 'grid',
                base: ammoData.type === 'pistol' ? 'MP' : 'MA',
                cellX: ammoCell?.x ?? null,
                cellY: ammoCell?.y ?? null,
                rotation: ammoData.rotation || 0,
                groundY: CONFIG.PICKUP_SPRITE_HEIGHT,
                dataRef: ammoData,
                dataList: this.mapData.ammoItems,
                label: 'munición'
            });
        });
    }

    createFoodItemsFromMap() {
        this.foodMeshes = [];

        if (!this.mapData.foodItems || this.mapData.foodItems.length === 0) {
            return;
        }

        this.mapData.foodItems.forEach(foodData => {
            const position = foodData?.position || foodData;
            const foodType = foodData?.foodType || (
                typeof foodData?.type === 'string' && foodData.type !== 'food'
                    ? foodData.type
                    : null
            );
            const sprite = this.createFoodSprite(position, foodType);
            const cell = this.worldToGridCell?.(sprite.position) || null;
            this.registerEditable(sprite, {
                kind: 'grid',
                base: '+',
                cellX: cell?.x ?? null,
                cellY: cell?.y ?? null,
                rotation: 0,
                groundY: CONFIG.PICKUP_SPRITE_HEIGHT,
                dataRef: foodData,
                dataList: this.mapData.foodItems,
                label: 'comida'
            });
        });
    }
    // #endregion

    // #region Carga de Modelos 3D World
    // Descripción: Descarga y procesa archivos JSON de modelos 3D y utiliza loaders (OBJ/MTL) para instanciar geometría compleja en la escena.
    async load3DModelsFromJSON(mapName) {
        try {
            const response = await fetch(`modelos/${mapName}_models.json`);
            if (!response.ok) {
                console.warn(`No se encontró modelos/${mapName}_models.json`);
                return;
            }

            const modelsData = await response.json();
            console.log(`Cargados ${modelsData.length} modelos 3D desde JSON para ${mapName}`);
            // Copia editable: ConstructionMode modifica estas entradas y
            // las serializa de vuelta a modelos/<mapa>_models.json.
            this.propModels = modelsData;

            const objLoader = new OBJLoader();
            const mtlLoader = new MTLLoader();
            const tdsLoader = new TDSLoader();
            const textureLoader = new THREE.TextureLoader();

            for (let modelIndex = 0; modelIndex < modelsData.length; modelIndex++) {
                const model = modelsData[modelIndex];
                const { type = "obj", path, position, rotation = 0, scale = 1, texture, width = 10, height = 10 } = model;
                const hasCollision = model.collision !== false;
                const modelIdentity = [model.id, path, texture]
                    .filter(value => typeof value === 'string')
                    .join(' ')
                    .toLowerCase();
                const isTreeModel = /(?:^|[\s_\/.\-])(?:tree\d*|arbol\d*)(?:$|[\s_\/.\-])/.test(modelIdentity);

                if (type === "hormiguero_set") {
                    this.createHormigueroSet(model);
                    continue;
                }

                if (type === "hormiguero_secret_room") {
                    this.createHormigueroSecretRoom(model);
                    continue;
                }

                if (type === "hormiguero_desk") {
                    this.registerPropEditable(this.createHormigueroDesk(model), modelIndex);
                    continue;
                }

                if (type === "hormiguero_bleachers") {
                    this.registerPropEditable(this.createHormigueroBleachers(model), modelIndex);
                    continue;
                }

                if (type === "swing" || type === "columpio") {
                    this.registerPropEditable(this.createSwingProp(model, textureLoader), modelIndex);
                    continue;
                }

                if (type === "flower_pot" || type === "flower_pot_3d" || type === "maceta_3d") {
                    this.registerPropEditable(this.createFlowerPotProp(model, textureLoader), modelIndex);
                    continue;
                }

                if (type === "fountain" || type === "fuente") {
                    this.registerPropEditable(this.createFountainProp(model), modelIndex);
                    continue;
                }

                if (type === "vent_duct" || type === "conducto") {
                    this.registerPropEditable(this.createVentDuctProp(model), modelIndex);
                    continue;
                }

                if (type === "vent_grate" || type === "reja") {
                    this.registerPropEditable(this.createVentGrateProp(model), modelIndex);
                    continue;
                }

                if (type === "crate" || type === "caja") {
                    this.registerPropEditable(this.createCrateProp(model), modelIndex);
                    continue;
                }

                if (type === "dustbin" || type === "trash_bin" || type === "dumpster") {
                    this.registerPropEditable(this.createDustbinProp(model), modelIndex);
                    continue;
                }

                if (type === "hormiguero_prop" || type === "map2_prop") {
                    this.registerPropEditable(this.createHormigueroProp(model), modelIndex);
                    continue;
                }

                // Soporte para archivos .3ds
                if (type === "3ds" || (path && path.toLowerCase().endsWith(".3ds"))) {
                    try {
                        const basePath = path.substring(0, path.lastIndexOf("/") + 1);
                        tdsLoader.setResourcePath(basePath); // Texturas en la misma carpeta

                        const object = await tdsLoader.loadAsync(path);

                        object.position.set(position.x, position.y, position.z);
                        // La mayoría de modelos 3DS vienen con Y arriba; mantener la
                        // corrección por defecto, pero permitir afinarla desde el mapa.
                        const rotationX = model.rotationX !== undefined
                            ? model.rotationX
                            : -90;
                        const rotationY = model.rotationY !== undefined
                            ? model.rotationY
                            : 0;
                        const rotationZ = model.rotationZ !== undefined
                            ? model.rotationZ
                            : rotation;
                        object.rotation.set(
                            THREE.MathUtils.degToRad(rotationX),
                            THREE.MathUtils.degToRad(rotationY),
                            THREE.MathUtils.degToRad(rotationZ)
                        );
                        object.scale.set(scale, scale, scale);

                        this.scene.add(object);
                        object.updateMatrixWorld(true);

                        // Colisión
                        const box = new THREE.Box3().setFromObject(object);
                        const size = box.getSize(new THREE.Vector3());
                        const center = box.getCenter(new THREE.Vector3());

                        const colliderWidth = Math.max(
                            0.5,
                            Number(model.collisionWidth) || (isTreeModel ? 1 : size.x)
                        );
                        const colliderHeight = Math.max(
                            0.5,
                            Number(model.collisionHeight) || (isTreeModel ? 3 : size.y)
                        );
                        const colliderDepth = Math.max(
                            0.5,
                            Number(model.collisionDepth) || (isTreeModel ? 1 : size.z)
                        );

                        const collisionBox = new THREE.Box3(
                            new THREE.Vector3(
                                center.x - colliderWidth / 2,
                                center.y - colliderHeight / 2,
                                center.z - colliderDepth / 2
                            ),
                            new THREE.Vector3(
                                center.x + colliderWidth / 2,
                                center.y + colliderHeight / 2,
                                center.z + colliderDepth / 2
                            )
                        );

                        object.userData = {
                            ...object.userData,
                            boundingBox: collisionBox,
                            isStatic: hasCollision,
                            type: 'staticModel',
                            bulletImpact: model.bulletImpact !== false,
                            bulletImpactFallback: hasCollision,
                            simpleBoxCollider: true,
                            collisionBoxSize: {
                                width: colliderWidth,
                                height: colliderHeight,
                                depth: colliderDepth
                            }
                        };

                        if (hasCollision) {
                            this.walls.push(object);
                            this.staticModels.push(object);
                        } else {
                            object.userData.isDecorative = true;
                            this.decorativeMeshes.push(object);
                        }

                        console.log(`Modelo 3DS cargado: ${path}`);
                        this.registerPropEditable(object, modelIndex);
                        continue;

                    } catch (err) {
                        console.error(`Error cargando modelo 3DS: ${path}`, err);
                        continue;
                    }
                }

                // NUEVA ESTRUCTURA: Manejo de objetos de tipo "cuadrado" con textura de imagen
                if (type === "square" || type === "cuadrado") {
                    const geometry = new THREE.PlaneGeometry(width, height);
                    const textureLoader = new THREE.TextureLoader();
                    const rotationX = model.rotationX || 0;
                    const isGroundPlane = model.groundPlane === true ||
                        Math.abs(Math.abs(rotationX) - 90) < 0.001;
                    const shouldBillboard = model.billboard === true || (
                        model.billboard !== false && Math.abs(rotationX) < 0.001
                    );

                    let material;
                    if (texture) {
                        const tex = textureLoader.load(
                            texture,
                            () => { },
                            () => { },
                            () => { console.error(`No se pudo cargar textura: ${texture}`); }
                        );
                        tex.colorSpace = THREE.SRGBColorSpace;
                        material = new THREE.MeshBasicMaterial({
                            map: tex,
                            side: THREE.DoubleSide,
                            // Los suelos opacos deben renderizarse antes que
                            // los sprites transparentes de enemigos e ítems.
                            // Si entran en la lista de transparentes, Three.js
                            // puede ordenarlos por distancia y dibujarlos
                            // visualmente por encima del objeto.
                            transparent: !isGroundPlane,
                            alphaTest: 0.02,
                            // Los planos 2D deben escribir profundidad para
                            // ocultar los impactos que estén detrás de ellos.
                            // alphaTest conserva la transparencia sin dejar
                            // pasar agujeros de bala por toda la textura.
                            depthWrite: true,
                            // Separar y desplazar los planos de suelo evita
                            // z-fighting con el suelo base.
                            polygonOffset: isGroundPlane,
                            polygonOffsetFactor: isGroundPlane ? -4 : 0,
                            polygonOffsetUnits: isGroundPlane ? -4 : 0
                        });
                    } else {
                        // Sin textura se usa un color plano (útil para guías
                        // de suelo como las flechas de los conductos).
                        const flatColor = model.color !== undefined ? Number(model.color) : 0xffffff;
                        material = new THREE.MeshBasicMaterial({
                            color: flatColor,
                            side: THREE.DoubleSide,
                            transparent: !isGroundPlane,
                            alphaTest: 0.02,
                            depthWrite: true,
                            polygonOffset: isGroundPlane,
                            polygonOffsetFactor: isGroundPlane ? -4 : 0,
                            polygonOffsetUnits: isGroundPlane ? -4 : 0
                        });
                    }

                    const squareMesh = new THREE.Mesh(geometry, material);
                    console.log(`[World] Creating square mesh at ${JSON.stringify(position)} with size ${width}x${height}`);
                    // Algunos decorados de suelo se solapan (por ejemplo, el
                    // arenero invade ligeramente el camino de piedra). No
                    // basta con elevar todos al mismo Y: siguen quedando
                    // coplanares entre sí y aparece z-fighting. `groundLayer`
                    // permite separar visualmente esas superficies sin
                    // alterar su posición lógica en el mapa.
                    const groundLayer = Number.isFinite(Number(model.groundLayer))
                        ? Number(model.groundLayer)
                        : 0;
                    const groundLayerStep = 0.02;
                    const groundY = isGroundPlane
                        ? Math.max(CONFIG.GROUND_SURFACE_OFFSET, position.y || 0)
                            + groundLayer * groundLayerStep
                        : position.y;
                    squareMesh.position.set(position.x, groundY, position.z);
                    squareMesh.renderOrder = isGroundPlane ? -20 : 0;

                    const { rotationY, rotationZ = 0, rotationOrder = 'XYZ' } = model;
                    squareMesh.rotation.order = rotationOrder;
                    squareMesh.rotation.x = THREE.MathUtils.degToRad(rotationX);
                    squareMesh.rotation.y = THREE.MathUtils.degToRad(rotationY !== undefined ? rotationY : rotation);
                    squareMesh.rotation.z = THREE.MathUtils.degToRad(rotationZ);

                    this.scene.add(squareMesh);
                    squareMesh.updateMatrixWorld(true);

                    const hasCollision = model.collision !== false;

                    // SIEMPRE agregar a decorativeMeshes para efectos de balas/sangre
                    squareMesh.userData = {
                        isDecorative: true,
                        type: 'square',
                        bulletImpact: model.bulletImpact !== false,
                        bulletImpactFallback: hasCollision,
                        billboard: shouldBillboard,
                        isGroundPlane
                    };
                    this.decorativeMeshes.push(squareMesh);
                    if (shouldBillboard) {
                        this.billboardMeshes.push(squareMesh);
                    }

                    if (hasCollision) {
                        // Colisión: una caja simple dimensionada según el prop.
                        // Los billboards mantienen este volumen fijo aunque roten.
                        const numericValue = (value, fallback) => {
                            const parsedValue = Number(value);
                            return Number.isFinite(parsedValue) ? parsedValue : fallback;
                        };
                        const colliderWidth = Math.max(
                            0.5,
                            numericValue(model.collisionWidth, isTreeModel ? 1 : width)
                        );
                        const colliderHeight = Math.max(
                            1,
                            numericValue(model.collisionHeight, isTreeModel ? 3 : height)
                        );
                        const colliderDepth = Math.max(
                            0.5,
                            numericValue(
                                model.collisionDepth,
                                isTreeModel ? 1 : Math.min(width, height) * 0.25
                            )
                        );
                        const center = squareMesh.position;
                        const collisionBottom = numericValue(
                            model.collisionBottom,
                            center.y - colliderHeight / 2
                        );

                        const collisionBox = new THREE.Box3(
                            new THREE.Vector3(
                                center.x - colliderWidth / 2,
                                collisionBottom,
                                center.z - colliderDepth / 2
                            ),
                            new THREE.Vector3(
                                center.x + colliderWidth / 2,
                                collisionBottom + colliderHeight,
                                center.z + colliderDepth / 2
                            )
                        );

                        squareMesh.userData.boundingBox = collisionBox;
                        squareMesh.userData.simpleBoxCollider = true;
                        squareMesh.userData.collisionBoxSize = {
                            width: colliderWidth,
                            height: colliderHeight,
                            depth: colliderDepth
                        };
                        squareMesh.userData.isStatic = true;
                        this.walls.push(squareMesh);
                        this.staticModels.push(squareMesh);
                    }

                    console.log(`Objeto decorativo cuadrado cargado: ${texture || "sin textura"} en (${position.x}, ${position.y}, ${position.z})`);
                    this.registerPropEditable(squareMesh, modelIndex);
                    continue; // Saltar al siguiente modelo
                }

                // Código original para modelos OBJ (se mantiene igual)
                let finalObject = null;
                const basePath = path.substring(0, path.lastIndexOf("/"));
                const fileName = path.substring(path.lastIndexOf("/") + 1); // Solo el nombre del archivo
                const mtlFileName = fileName.replace(".obj", ".mtl");
                const jpgPath = path.replace(".obj", ".jpg");

                try {
                    // Cargar materiales (.mtl) si existen
                    mtlLoader.setPath(basePath + "/");
                    let materials = null;
                    try {
                        materials = await mtlLoader.loadAsync(mtlFileName);
                        materials.preload();
                        objLoader.setMaterials(materials);
                    } catch (err) {
                        console.log(`No se encontró .mtl para ${path}, se usará textura básica`);
                    }

                    objLoader.setPath(basePath + "/");
                    finalObject = await objLoader.loadAsync(fileName);

                    // Forzar DoubleSide en todos los materiales cargados (incluso si vienen de MTL)
                    finalObject.traverse(child => {
                        if (child.isMesh) {
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(mat => mat.side = THREE.DoubleSide);
                                } else {
                                    child.material.side = THREE.DoubleSide;
                                }
                            }
                        }
                    });


                    // Aplicar textura (prioridad: JSON > .mtl > .jpg automático > color base)
                    if (!materials) {
                        const textureToLoad = texture || jpgPath; // Usa la del JSON si existe, si no busca el jpg homónimo

                        finalObject.traverse(child => {
                            if (child.isMesh) {
                                let matConfig = {
                                    side: THREE.DoubleSide
                                };

                                // Intentar cargar textura (ya sea del JSON o la automática)
                                // Nota: Si textureToLoad apunta a un archivo que no existe, Three.js mostrará negro/vacío.
                                // Para evitar invisibilidad total si falla la carga automática, podríamos verificar si 'texture' venía del JSON explícitamente.

                                if (texture) {
                                    const tex = new THREE.TextureLoader().load(texture);
                                    matConfig.map = tex;
                                    matConfig.color = 0xffffff;
                                } else {
                                    // Lógica legacy: intenta cargar el JPG homónimo
                                    // Puesto que no podemos saber si existe, lo intentamos.
                                    // Pero definimos un color base por si acaso.
                                    const tex = new THREE.TextureLoader().load(jpgPath);
                                    matConfig.map = tex;
                                    matConfig.color = 0xaaaaaa; // Gris si la textura falla visualmente (aunque map tenga precedencia)
                                }

                                child.material = new THREE.MeshStandardMaterial(matConfig);
                            }
                        });
                    }

                    finalObject.scale.set(scale, scale, scale);
                    finalObject.position.set(position.x, position.y, position.z);

                    // Support for full rotation (X, Y, Z)
                    const { rotationX = 0, rotationY, rotationZ = 0 } = model;
                    finalObject.rotation.x = THREE.MathUtils.degToRad(rotationX);
                    // Use model.rotation as fallback for Y if rotationY not specified
                    finalObject.rotation.y = THREE.MathUtils.degToRad(rotationY !== undefined ? rotationY : rotation);
                    finalObject.rotation.z = THREE.MathUtils.degToRad(rotationZ);

                    this.scene.add(finalObject);
                    finalObject.updateMatrixWorld(true);

                    // Colisión: caja simple ajustada al tamaño real del modelo.
                    // Los valores del JSON pueden afinarla cuando sea necesario,
                    // pero no se fuerza una caja mínima de 5x5x10 para props pequeños.
                    const box = new THREE.Box3().setFromObject(finalObject);
                    const size = box.getSize(new THREE.Vector3());
                    const center = box.getCenter(new THREE.Vector3());

                    const colliderHeight = Math.max(
                        0.5,
                        Number(model.collisionHeight) || (isTreeModel ? 3 : size.y)
                    );
                    const colliderWidth = Math.max(
                        0.5,
                        Number(model.collisionWidth) || (isTreeModel ? 1 : size.x)
                    );
                    const colliderDepth = Math.max(
                        0.5,
                        Number(model.collisionDepth) || (isTreeModel ? 1 : size.z)
                    );

                    const collisionBox = new THREE.Box3(
                        new THREE.Vector3(
                            center.x - colliderWidth / 2,
                            center.y - colliderHeight / 2,
                            center.z - colliderDepth / 2
                        ),
                        new THREE.Vector3(
                            center.x + colliderWidth / 2,
                            center.y + colliderHeight / 2,
                            center.z + colliderDepth / 2
                        )
                    );

                    finalObject.userData = {
                        ...finalObject.userData,
                        boundingBox: collisionBox,
                        isStatic: hasCollision,
                        type: 'staticModel',
                        bulletImpact: model.bulletImpact !== false,
                        bulletImpactFallback: hasCollision,
                        simpleBoxCollider: true,
                        collisionBoxSize: {
                            width: colliderWidth,
                            height: colliderHeight,
                            depth: colliderDepth
                        }
                    };

                    if (hasCollision) {
                        this.walls.push(finalObject);
                        this.staticModels.push(finalObject);
                    } else {
                        finalObject.userData.isDecorative = true;
                        this.decorativeMeshes.push(finalObject);
                    }

                    console.log(`Modelo 3D cargado: ${path} en (${position.x}, ${position.y}, ${position.z})`);
                    this.registerPropEditable(finalObject, modelIndex);

                } catch (err) {
                    console.error(`Error cargando modelo 3D: ${path}`, err);
                }
            }
        } catch (err) {
            console.warn(`No hay archivo de modelos 3D para el mapa ${mapName} o error de carga`, err);
        }
    }
    // #endregion

    // #region Actualización de Billboards World
    // Descripción: Hace que los props planos verticales miren horizontalmente a la cámara del jugador.
    updateBillboards(camera) {
        if (!camera || this.billboardMeshes.length === 0) return;

        for (let i = this.billboardMeshes.length - 1; i >= 0; i--) {
            const mesh = this.billboardMeshes[i];
            if (!mesh || !mesh.parent) {
                this.billboardMeshes.splice(i, 1);
                continue;
            }

            const deltaX = camera.position.x - mesh.position.x;
            const deltaZ = camera.position.z - mesh.position.z;
            if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaZ) < 0.0001) continue;

            mesh.rotation.y = Math.atan2(deltaX, deltaZ);
            mesh.updateMatrixWorld(true);

            // Los colliders simples no dependen de la orientación del billboard.
            if (mesh.userData.boundingBox && !mesh.userData.simpleBoxCollider) {
                mesh.userData.boundingBox.setFromObject(mesh);
            }
        }
    }
    // #endregion

    // #region Creación de Prop de Fuente 3D World
    // Descripción: Construye una fuente octogonal low poly con varios niveles y agua.
    createFountainProp(model) {
        const group = new THREE.Group();
        const width = Math.max(5, Number(model.width) || 7);
        const depth = Math.max(5, Number(model.depth) || 7);
        const height = Math.max(2.8, Number(model.height) || 3.2);
        const propScale = Number(model.scale) || 1;
        const radialSegments = 8;

        const stoneMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b9299,
            roughness: 0.86,
            metalness: 0.04,
            flatShading: true
        });
        const stoneLightMaterial = new THREE.MeshStandardMaterial({
            color: 0xb7bdc1,
            roughness: 0.8,
            metalness: 0.03,
            flatShading: true
        });
        const stoneDarkMaterial = new THREE.MeshStandardMaterial({
            color: 0x59636b,
            roughness: 0.92,
            metalness: 0.02,
            flatShading: true
        });
        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x20b8d8,
            emissive: 0x07566a,
            emissiveIntensity: 0.55,
            roughness: 0.18,
            metalness: 0.25,
            transparent: true,
            opacity: 0.82,
            flatShading: true
        });
        const waterHighlightMaterial = new THREE.MeshStandardMaterial({
            color: 0x9bf5ff,
            emissive: 0x168da3,
            emissiveIntensity: 0.8,
            roughness: 0.12,
            metalness: 0.18,
            transparent: true,
            opacity: 0.72,
            flatShading: true
        });

        const addCylinder = (name, radiusTop, radiusBottom, cylinderHeight, y, material) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    radiusTop,
                    radiusBottom,
                    cylinderHeight,
                    radialSegments
                ),
                material
            );
            mesh.name = name;
            mesh.position.y = y;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            return mesh;
        };

        const addRing = (name, radius, tube, y, material) => {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(radius, tube, 4, radialSegments),
                material
            );
            ring.name = name;
            ring.rotation.x = Math.PI / 2;
            ring.position.y = y;
            ring.castShadow = false;
            ring.receiveShadow = false;
            group.add(ring);
            return ring;
        };

        const outerRadius = Math.min(width, depth) / 2;

        // Base y pedestal inferior.
        addCylinder('fountain-base', outerRadius * 0.98, outerRadius, height * 0.08, height * 0.04, stoneDarkMaterial);
        addCylinder('fountain-plinth', outerRadius * 0.84, outerRadius * 0.92, height * 0.12, height * 0.14, stoneMaterial);

        // Gran cuenca inferior y su lámina de agua.
        addCylinder('fountain-lower-basin', outerRadius * 0.76, outerRadius * 0.9, height * 0.1, height * 0.25, stoneLightMaterial);
        addCylinder('fountain-lower-water', outerRadius * 0.71, outerRadius * 0.71, height * 0.025, height * 0.315, waterMaterial);
        addRing('fountain-lower-rim', outerRadius * 0.75, outerRadius * 0.035, height * 0.305, stoneLightMaterial);

        // Columna central y cuenca intermedia.
        addCylinder('fountain-main-column', outerRadius * 0.18, outerRadius * 0.27, height * 0.25, height * 0.445, stoneMaterial);
        addCylinder('fountain-middle-basin', outerRadius * 0.47, outerRadius * 0.31, height * 0.08, height * 0.61, stoneLightMaterial);
        addCylinder('fountain-middle-water', outerRadius * 0.41, outerRadius * 0.41, height * 0.025, height * 0.665, waterMaterial);
        addRing('fountain-middle-rim', outerRadius * 0.45, outerRadius * 0.028, height * 0.65, stoneLightMaterial);

        // Nivel superior, remate y pequeño chorro de agua.
        addCylinder('fountain-upper-column', outerRadius * 0.1, outerRadius * 0.16, height * 0.16, height * 0.76, stoneDarkMaterial);
        addCylinder('fountain-upper-basin', outerRadius * 0.32, outerRadius * 0.2, height * 0.06, height * 0.87, stoneLightMaterial);
        addCylinder('fountain-upper-water', outerRadius * 0.27, outerRadius * 0.27, height * 0.025, height * 0.9125, waterHighlightMaterial);
        addRing('fountain-upper-rim', outerRadius * 0.3, outerRadius * 0.022, height * 0.9, stoneLightMaterial);

        const finial = new THREE.Mesh(
            new THREE.ConeGeometry(outerRadius * 0.09, height * 0.1, radialSegments),
            stoneDarkMaterial
        );
        finial.name = 'fountain-finial';
        finial.position.y = height * 0.95;
        finial.castShadow = false;
        finial.receiveShadow = false;
        group.add(finial);

        const topJet = new THREE.Mesh(
            new THREE.ConeGeometry(outerRadius * 0.045, height * 0.16, 6),
            waterHighlightMaterial
        );
        topJet.name = 'fountain-top-jet';
        topJet.position.y = height * 0.98;
        topJet.castShadow = false;
        topJet.receiveShadow = false;
        group.add(topJet);

        const position = model.position || { x: 0, y: 0, z: 0 };
        group.position.set(position.x || 0, position.y || 0, position.z || 0);
        group.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? model.rotationY : (model.rotation || 0)
        );
        group.scale.setScalar(propScale);
        group.userData = {
            id: model.id || 'park-fountain',
            type: 'staticModel',
            propType: 'fountain',
            bulletImpact: model.bulletImpact !== false,
            bulletImpactFallback: model.collision !== false,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);
        this.decorativeMeshes.push(group);

        if (model.collision !== false) {
            const colliderWidth = Math.max(0.5, Number(model.collisionWidth) || width);
            const colliderHeight = Math.max(0.5, Number(model.collisionHeight) || height);
            const colliderDepth = Math.max(0.5, Number(model.collisionDepth) || depth);
            group.userData.simpleBoxCollider = true;
            group.userData.collisionBoxSize = {
                width: colliderWidth,
                height: colliderHeight,
                depth: colliderDepth
            };
            group.userData.boundingBox = new THREE.Box3(
                new THREE.Vector3(-colliderWidth / 2, 0, -colliderDepth / 2),
                new THREE.Vector3(colliderWidth / 2, colliderHeight, colliderDepth / 2)
            ).applyMatrix4(group.matrixWorld);
            this.walls.push(group);
            this.staticModels.push(group);
        }

        console.log(`Fuente 3D low poly cargada en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return group;
    }
    // #endregion

    // #region Creación de Conducto de Ventilación World
    // Descripción: Tramo de conducto metálico para infiltraciones (suelo técnico,
    // techo bajo con colisión, tuberías laterales y luces). El techo queda por
    // encima de la caja de colisión del jugador de pie, así se camina libremente
    // pero no se puede saltar dentro; los enemigos altos no caben por él.
    createVentDuctProp(model) {
        const group = new THREE.Group();
        const length = Math.max(10, Number(model.length) || 30);
        const width = Math.max(4, Number(model.width) || 10);
        const ceilingY = Number(model.ceilingY) || 3.2;
        const propScale = Number(model.scale) || 1;

        const floorMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            Math.max(1, length / 14),
            Math.max(1, width / 5),
            {
                roughness: 0.5,
                metalness: 0.6,
                flatShading: true
            }
        );
        const ceilingMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            Math.max(1, length / 18),
            Math.max(1, width / 6),
            {
                roughness: 0.55,
                metalness: 0.55,
                flatShading: true
            }
        );
        const stripeMaterial = new THREE.MeshStandardMaterial({
            color: 0xd7a021,
            emissive: 0x4d3405,
            emissiveIntensity: 0.5,
            roughness: 0.6,
            metalness: 0.2,
            flatShading: true
        });
        const pipeMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            1,
            1,
            {
                roughness: 0.35,
                metalness: 0.7,
                flatShading: true
            }
        );
        const lightMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            emissive: 0xfff2cc,
            emissiveIntensity: 1.2,
            roughness: 0.4,
            metalness: 0.1
        });

        const addBox = (name, w, h, d, x, y, z, material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            return mesh;
        };

        // El suelo técnico queda separado del plano base. La pequeña
        // elevación también evita que los tramos de conducto parpadeen al
        // coincidir con el suelo general del patio.
        const floorY = 0.08;
        addBox('vent-floor', length, 0.12, width, 0, floorY, 0, floorMaterial);
        addBox('vent-stripe-left', length, 0.14, 0.6, 0, floorY + 0.1, -(width / 2 - 0.8), stripeMaterial);
        addBox('vent-stripe-right', length, 0.14, 0.6, 0, floorY + 0.1, (width / 2 - 0.8), stripeMaterial);

        // Tuberías laterales a lo largo del conducto.
        [-1, 1].forEach(side => {
            const pipe = new THREE.Mesh(
                new THREE.CylinderGeometry(0.28, 0.28, length, 8),
                pipeMaterial
            );
            pipe.name = `vent-pipe-${side < 0 ? 'left' : 'right'}`;
            pipe.rotation.z = Math.PI / 2;
            pipe.position.set(0, 2.3, side * (width / 2 - 0.7));
            pipe.castShadow = false;
            pipe.receiveShadow = false;
            group.add(pipe);
        });

        // Techo bajo (con colisión) y luces interiores.
        const ceiling = addBox('vent-ceiling', length, 0.5, width, 0, ceilingY + 0.25, 0, ceilingMaterial);
        const lightCount = Math.max(1, Math.floor(length / 20));
        for (let i = 0; i < lightCount; i++) {
            const lx = lightCount === 1 ? 0 : -length / 2 + 10 + (i * (length - 20)) / (lightCount - 1);
            addBox(`vent-light-${i}`, 2.2, 0.12, 1.0, lx, ceilingY - 0.06, 0, lightMaterial);
        }

        const position = model.position || { x: 0, y: 0, z: 0 };
        group.position.set(position.x || 0, position.y || 0, position.z || 0);
        group.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? model.rotationY : (model.rotation || 0)
        );
        group.scale.setScalar(propScale);
        group.userData = {
            id: model.id || 'vent-duct',
            type: 'staticModel',
            propType: 'vent-duct',
            bulletImpact: model.bulletImpact !== false,
            bulletImpactFallback: true,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);

        // Solo el techo colisiona: el jugador pasa por debajo sin rozarlo.
        ceiling.updateMatrixWorld(true);
        const ceilingBox = new THREE.Box3().setFromObject(ceiling);
        group.userData.simpleBoxCollider = true;
        group.userData.boundingBox = ceilingBox;
        this.walls.push(group);
        this.staticModels.push(group);

        console.log(`Conducto de ventilación cargado en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return group;
    }
    // #endregion

    // #region Creación de Reja de Ventilación World
    // Descripción: Boca de conducto con postes, dintel, tapa de reja abierta hacia
    // el techo y ventilador lateral. Puramente decorativa (sin colisión) para que
    // el jugador pueda colarse a través de ella.
    createVentGrateProp(model) {
        const group = new THREE.Group();
        group.name = model.id || 'vent-grate';
        const propScale = Number(model.scale) || 1;
        const isVentilationGate = this.currentMapName === 'mapa2' &&
            model.ventilationGate === true;
        const ventilationGateId = isVentilationGate
            ? String(model.ventilationGateId || model.id || 'ventilation-gate')
            : null;
        const configuredInitialOpen = model.ventilationInitialOpen === true ||
            model.initialOpen === true;
        const initialOpen = isVentilationGate
            ? (this.ventilationGateStates.has(ventilationGateId)
                ? this.ventilationGateStates.get(ventilationGateId)
                : configuredInitialOpen)
            : true;

        if (isVentilationGate) {
            this.ventilationGateStates.set(ventilationGateId, initialOpen);
        }

        const steelDark = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            1,
            1,
            {
                roughness: 0.5,
                metalness: 0.65,
                flatShading: true
            }
        );
        const steelLight = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            1,
            1,
            {
                roughness: 0.35,
                metalness: 0.75,
                flatShading: true
            }
        );
        const bladeMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            1,
            1,
            {
                roughness: 0.45,
                metalness: 0.6,
                flatShading: true,
                side: THREE.DoubleSide
            }
        );

        const addBox = (name, w, h, d, x, y, z, material, parent = group) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            parent.add(mesh);
            return mesh;
        };

        // Marco: postes, dintel y umbral.
        addBox('grate-post-left', 0.5, 3.6, 0.5, -4.75, 1.8, 0, steelDark);
        addBox('grate-post-right', 0.5, 3.6, 0.5, 4.75, 1.8, 0, steelDark);
        addBox('grate-lintel', 10, 0.5, 0.6, 0, 3.45, 0, steelDark);
        addBox('grate-sill', 10, 0.25, 0.8, 0, 0.12, 0, steelDark);

        // Tapa de reja abierta hacia el techo (no bloquea el paso).
        const hinge = new THREE.Group();
        hinge.name = 'grate-cover-hinge';
        hinge.position.set(0, 3.1, 0);
        hinge.rotation.x = initialOpen ? -1.2 : 0;
        group.add(hinge);
        for (let i = 0; i < 6; i++) {
            const bx = -3.75 + i * 1.5;
            addBox(`grate-bar-${i}`, 0.18, 2.9, 0.12, bx, -1.45, 0, steelLight, hinge);
        }
        addBox('grate-rail-top', 9, 0.18, 0.12, 0, -0.2, 0, steelLight, hinge);
        addBox('grate-rail-bottom', 9, 0.18, 0.12, 0, -2.7, 0, steelLight, hinge);

        // Ventilador en la cara exterior del poste derecho.
        const fan = new THREE.Group();
        fan.name = 'grate-fan';
        fan.position.set(5.15, 1.9, 0);
        fan.rotation.y = Math.PI / 2;
        group.add(fan);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.15, 6, 12), steelDark);
        ring.name = 'grate-fan-ring';
        fan.add(ring);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8), steelLight);
        hub.name = 'grate-fan-hub';
        hub.rotation.x = Math.PI / 2;
        fan.add(hub);
        for (let i = 0; i < 3; i++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.08), bladeMaterial);
            blade.name = `grate-fan-blade-${i}`;
            blade.position.y = 0.55;
            const holder = new THREE.Group();
            holder.rotation.z = (i * Math.PI * 2) / 3;
            holder.add(blade);
            fan.add(holder);
        }

        const position = model.position || { x: 0, y: 0, z: 0 };
        group.position.set(position.x || 0, position.y || 0, position.z || 0);
        group.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? model.rotationY : (model.rotation || 0)
        );
        group.scale.setScalar(propScale);
        group.userData = {
            id: model.id || 'vent-grate',
            type: 'staticModel',
            propType: 'vent-grate',
            ventilationGate: isVentilationGate,
            ventilationGateId,
            ventilationStage: model.ventilationStage || null,
            ventilationOpen: initialOpen,
            ventilationCover: hinge,
            bulletImpact: model.bulletImpact !== false,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);
        this.decorativeMeshes.push(group);

        if (isVentilationGate) {
            const collider = new THREE.Object3D();
            collider.name = `${group.name}-closed-collider`;
            collider.userData = {
                type: 'ventilationGate',
                ventilationGateId,
                isStatic: true,
                isOpen: initialOpen,
                bulletImpact: false,
                bulletImpactFallback: false,
                simpleBoxCollider: true,
                // Caja local del hueco de la reja; el giro del modelo se
                // aplica para que ambas entradas queden bloqueadas según su
                // orientación real.
                boundingBox: new THREE.Box3(
                    new THREE.Vector3(-5, 0, -0.35),
                    new THREE.Vector3(5, 3.6, 0.35)
                ).applyMatrix4(group.matrixWorld)
            };

            if (!initialOpen) {
                this.scene.add(collider);
                this.walls.push(collider);
            }
            this.ventilationGateColliders.set(group, collider);
        }

        console.log(`Reja de ventilación cargada en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return group;
    }
    // #endregion

    // #region Creación de Caja de Almacén World
    // Descripción: Caja de madera/militar con tapa y refuerzos para vestir el
    // almacén y el patio exterior. Colisiona como un bloque sólido.
    createCrateProp(model) {
        const group = new THREE.Group();
        const width = Math.max(1, Number(model.width) || 4);
        const height = Math.max(1, Number(model.height) || 3);
        const depth = Math.max(1, Number(model.depth) || 4);
        const propScale = Number(model.scale) || 1;
        const color = model.color !== undefined ? Number(model.color) : 0x8a5a2b;
        // Las molduras cubren las esquinas del cuerpo. Si su cara exterior
        // queda exactamente en x/z = ±ancho/2, comparte profundidad con la
        // cara del cuerpo y aparece z-fighting. Se sacan unas centésimas para
        // que la moldura sea inequívocamente la superficie visible.
        const edgeSize = 0.3;
        const edgeSurfaceOffset = 0.02;

        const woodMaterial = this.createTexturedStandardMaterial(
            model.color !== undefined ? color : 0xffffff,
            HORMIGUERO_TEXTURES.wood,
            1,
            1,
            {
                roughness: 0.85,
                metalness: 0.05,
                flatShading: true
            }
        );
        const trimMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            1,
            1,
            {
                roughness: 0.9,
                metalness: 0.45,
                flatShading: true
            }
        );

        const addBox = (name, w, h, d, x, y, z, material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            return mesh;
        };

        addBox('crate-body', width, height, depth, 0, height / 2, 0, woodMaterial);
        addBox('crate-lid', width + 0.3, 0.25, depth + 0.3, 0, height + 0.12, 0, trimMaterial);
        [-1, 1].forEach(sx => {
            [-1, 1].forEach(sz => {
                addBox(
                    `crate-edge-${sx < 0 ? 'l' : 'r'}-${sz < 0 ? 'b' : 'f'}`,
                    edgeSize, height, edgeSize,
                    sx * (width / 2 - edgeSize / 2 + edgeSurfaceOffset),
                    height / 2,
                    sz * (depth / 2 - edgeSize / 2 + edgeSurfaceOffset),
                    trimMaterial
                );
            });
        });

        const position = model.position || { x: 0, y: 0, z: 0 };
        group.position.set(position.x || 0, position.y || 0, position.z || 0);
        group.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? model.rotationY : (model.rotation || 0)
        );
        group.scale.setScalar(propScale);
        group.userData = {
            id: model.id || 'crate',
            type: 'staticModel',
            propType: 'crate',
            bulletImpact: model.bulletImpact !== false,
            bulletImpactFallback: true,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);

        const colliderHeight = height + 0.25;
        group.userData.simpleBoxCollider = true;
        group.userData.collisionBoxSize = { width, height: colliderHeight, depth };
        group.userData.boundingBox = new THREE.Box3(
            new THREE.Vector3(-width / 2, 0, -depth / 2),
            new THREE.Vector3(width / 2, colliderHeight, depth / 2)
        ).applyMatrix4(group.matrixWorld);
        this.walls.push(group);
        this.staticModels.push(group);

        console.log(`Caja de almacén cargada en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return group;
    }
    // #endregion

    // #region Creación de Contenedor de Basura World
    // Descripción: Contenedor de basura low-poly con tapa abierta, nervios,
    // placa frontal y ruedas. Se mantiene procedural para que también pueda
    // colocarse desde el modo Construcción sin depender de un asset externo.
    createDustbinProp(model = {}) {
        const group = new THREE.Group();
        const width = Math.max(2.5, Number(model.width) || 4.6);
        const height = Math.max(2.8, Number(model.height) || 4.4);
        const depth = Math.max(2, Number(model.depth) || 3.5);
        const propScale = Number(model.scale) || 1;
        const bodyHeight = Math.min(height * 0.78, Math.max(2.2, height - 0.7));
        const lidDepth = depth * 0.52;
        const dustbinTexture = this.loadTiledTexture(
            'assets/textures/dustbin_green_lowres.png',
            1.35,
            1.35
        );

        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: model.color !== undefined ? Number(model.color) : 0xffffff,
            map: dustbinTexture,
            roughness: 0.82,
            metalness: 0.18,
            flatShading: true
        });
        const bodyDarkMaterial = new THREE.MeshStandardMaterial({
            color: 0x9aa995,
            map: dustbinTexture,
            roughness: 0.9,
            metalness: 0.12,
            flatShading: true
        });
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xb7c6b1,
            map: dustbinTexture,
            roughness: 0.74,
            metalness: 0.24,
            flatShading: true
        });
        const lidMaterial = new THREE.MeshStandardMaterial({
            color: 0xd0ddd0,
            map: dustbinTexture,
            roughness: 0.86,
            metalness: 0.2,
            flatShading: true
        });
        const insideMaterial = new THREE.MeshStandardMaterial({
            color: 0x101813,
            roughness: 1,
            metalness: 0
        });
        const rubberMaterial = new THREE.MeshStandardMaterial({
            color: 0x111513,
            roughness: 0.96,
            metalness: 0.04,
            flatShading: true
        });
        const warningMaterial = new THREE.MeshStandardMaterial({
            color: 0xe2b83f,
            emissive: 0x3b2504,
            emissiveIntensity: 0.24,
            roughness: 0.7,
            metalness: 0.1,
            flatShading: true
        });
        const labelMaterial = new THREE.MeshStandardMaterial({
            color: 0xc8d0bd,
            roughness: 0.76,
            metalness: 0.12,
            flatShading: true
        });

        const addBox = (name, boxWidth, boxHeight, boxDepth, x, y, z, material, parent = group) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth),
                material
            );
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            parent.add(mesh);
            return mesh;
        };

        const addCylinder = (name, radiusTop, radiusBottom, cylinderHeight, segments, x, y, z, material, parent = group) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(radiusTop, radiusBottom, cylinderHeight, segments),
                material
            );
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            parent.add(mesh);
            return mesh;
        };

        // Cuerpo principal y hueco oscuro que da profundidad al contenedor.
        addBox('dustbin-body', width, bodyHeight, depth, 0, bodyHeight / 2, 0, bodyMaterial);
        addBox('dustbin-interior', width * 0.84, 0.08, depth * 0.76, 0, bodyHeight + 0.055, 0, insideMaterial);

        // Refuerzo inferior, cuatro esquinas y nervios frontales.
        addBox('dustbin-base', width + 0.22, 0.25, depth + 0.22, 0, 0.13, 0, bodyDarkMaterial);
        const cornerWidth = Math.min(0.22, width * 0.07);
        [-1, 1].forEach((sx) => {
            [-1, 1].forEach((sz) => {
                addBox(
                    `dustbin-corner-${sx < 0 ? 'left' : 'right'}-${sz < 0 ? 'front' : 'back'}`,
                    cornerWidth,
                    bodyHeight * 0.94,
                    cornerWidth,
                    sx * (width / 2 - cornerWidth / 2 + 0.03),
                    bodyHeight / 2,
                    sz * (depth / 2 - cornerWidth / 2 + 0.03),
                    rimMaterial
                );
            });
        });
        for (let index = -1; index <= 1; index++) {
            addBox(
                `dustbin-front-rib-${index + 2}`,
                0.16,
                bodyHeight * 0.76,
                0.16,
                index * width * 0.28,
                bodyHeight * 0.42,
                -depth / 2 - 0.09,
                rimMaterial
            );
        }

        // Borde superior y asa frontal.
        addBox('dustbin-rim-front', width + 0.26, 0.24, 0.26, 0, bodyHeight + 0.14, -depth / 2, rimMaterial);
        addBox('dustbin-rim-back', width + 0.26, 0.24, 0.26, 0, bodyHeight + 0.14, depth / 2, rimMaterial);
        addBox('dustbin-rim-left', 0.26, 0.24, depth, -width / 2, bodyHeight + 0.14, 0, rimMaterial);
        addBox('dustbin-rim-right', 0.26, 0.24, depth, width / 2, bodyHeight + 0.14, 0, rimMaterial);
        addBox('dustbin-front-handle', width * 0.48, 0.16, 0.18, 0, bodyHeight * 0.88, -depth / 2 - 0.14, rimMaterial);
        addBox('dustbin-front-handle-left', 0.16, 0.34, 0.18, -width * 0.24, bodyHeight * 0.84, -depth / 2 - 0.14, rimMaterial);
        addBox('dustbin-front-handle-right', 0.16, 0.34, 0.18, width * 0.24, bodyHeight * 0.84, -depth / 2 - 0.14, rimMaterial);

        // Tapa articulada levantada hacia atrás.
        const lidGroup = new THREE.Group();
        lidGroup.name = 'dustbin-lid-hinge';
        lidGroup.position.set(0, bodyHeight + 0.24, depth / 2 - 0.12);
        lidGroup.rotation.x = THREE.MathUtils.degToRad(-24);
        group.add(lidGroup);
        addBox('dustbin-lid', width + 0.28, 0.22, lidDepth, 0, 0.05, -lidDepth / 2, lidMaterial, lidGroup);
        addBox('dustbin-lid-rim-front', width + 0.38, 0.22, 0.2, 0, 0.05, -lidDepth + 0.04, rimMaterial, lidGroup);
        addBox('dustbin-lid-rim-left', 0.2, 0.22, lidDepth, -width / 2, 0.05, -lidDepth / 2, rimMaterial, lidGroup);
        addBox('dustbin-lid-rim-right', 0.2, 0.22, lidDepth, width / 2, 0.05, -lidDepth / 2, rimMaterial, lidGroup);
        addCylinder('dustbin-lid-hinge-left', 0.14, 0.14, width * 0.18, 8, -width * 0.32, 0, 0, rubberMaterial, lidGroup).rotation.z = Math.PI / 2;
        addCylinder('dustbin-lid-hinge-right', 0.14, 0.14, width * 0.18, 8, width * 0.32, 0, 0, rubberMaterial, lidGroup).rotation.z = Math.PI / 2;

        // Placa de identificación y bandas de seguridad en el frontal.
        addBox('dustbin-label', width * 0.44, 0.62, 0.06, 0, bodyHeight * 0.57, -depth / 2 - 0.12, labelMaterial);
        addBox('dustbin-label-stripe-top', width * 0.36, 0.07, 0.04, 0, bodyHeight * 0.68, -depth / 2 - 0.16, warningMaterial);
        addBox('dustbin-label-stripe-bottom', width * 0.36, 0.07, 0.04, 0, bodyHeight * 0.46, -depth / 2 - 0.16, warningMaterial);
        [-1, 1].forEach((side) => {
            addBox(
                `dustbin-warning-${side < 0 ? 'left' : 'right'}`,
                width * 0.1,
                0.28,
                0.05,
                side * width * 0.38,
                bodyHeight * 0.18,
                -depth / 2 - 0.13,
                warningMaterial
            );
        });

        // Cuatro ruedas con ejes visibles. El cilindro gira para que su eje
        // quede alineado de lado a lado del contenedor.
        const wheelRadius = Math.max(0.28, Math.min(0.48, width * 0.1));
        [-1, 1].forEach((sx) => {
            [-1, 1].forEach((sz) => {
                const wheel = addCylinder(
                    `dustbin-wheel-${sx < 0 ? 'left' : 'right'}-${sz < 0 ? 'front' : 'back'}`,
                    wheelRadius,
                    wheelRadius,
                    0.28,
                    10,
                    sx * (width / 2 + 0.1),
                    wheelRadius + 0.18,
                    sz * (depth * 0.33),
                    rubberMaterial
                );
                wheel.rotation.z = Math.PI / 2;
                addBox(
                    `dustbin-wheel-bracket-${sx < 0 ? 'left' : 'right'}-${sz < 0 ? 'front' : 'back'}`,
                    0.18,
                    0.55,
                    0.24,
                    sx * (width / 2 - 0.14),
                    wheelRadius + 0.48,
                    sz * (depth * 0.33),
                    rimMaterial
                );
            });
        });

        const position = model.position || { x: 0, y: 0, z: 0 };
        group.position.set(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0);
        group.rotation.order = model.rotationOrder || 'XYZ';
        group.rotation.x = THREE.MathUtils.degToRad(Number(model.rotationX) || 0);
        group.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? Number(model.rotationY) : Number(model.rotation) || 0
        );
        group.rotation.z = THREE.MathUtils.degToRad(Number(model.rotationZ) || 0);
        group.scale.setScalar(propScale);
        group.userData = {
            id: model.id || 'dustbin',
            type: 'staticModel',
            propType: 'dustbin',
            bulletImpact: model.bulletImpact !== false,
            bulletImpactFallback: model.collision !== false,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);

        const colliderHeight = height + 0.15;
        group.userData.simpleBoxCollider = true;
        group.userData.collisionBoxSize = { width: width + 0.2, height: colliderHeight, depth: depth + 0.2 };
        group.userData.boundingBox = new THREE.Box3(
            new THREE.Vector3(-(width + 0.2) / 2, 0, -(depth + 0.2) / 2),
            new THREE.Vector3((width + 0.2) / 2, colliderHeight, (depth + 0.2) / 2)
        ).applyMatrix4(group.matrixWorld);

        if (model.collision !== false) this.walls.push(group);
        this.staticModels.push(group);

        console.log(`Contenedor de basura cargado en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return group;
    }
    // #endregion

    // #region Creación de Kit de Props de El Hormiguero World
    // Descripción: Colección de props procedurales ligeros para vestir el
    // exterior, el almacén, la red de ventilación y el plató. Se mantienen en
    // un único tipo de modelo para que el JSON del mapa pueda funcionar como
    // catálogo de variantes sin añadir dependencias externas.
    createHormigueroProp(model = {}) {
        const group = new THREE.Group();
        const variant = String(model.variant || model.prop || '').toLowerCase();
        const isVentilationGate = this.currentMapName === 'mapa2' &&
            model.ventilationGate === true;
        const ventilationGateId = isVentilationGate
            ? String(model.ventilationGateId || model.id || 'ventilation-gate')
            : null;
        const configuredInitialOpen = model.ventilationInitialOpen === true ||
            model.initialOpen === true;
        const initialOpen = isVentilationGate
            ? (this.ventilationGateStates.has(ventilationGateId)
                ? this.ventilationGateStates.get(ventilationGateId)
                : configuredInitialOpen)
            : true;

        if (isVentilationGate) {
            this.ventilationGateStates.set(ventilationGateId, initialOpen);
        }

        const makeMaterial = (color, options = {}) => {
            const {
                texturePath,
                textureRepeatX = 1,
                textureRepeatY = 1,
                ...materialOptions
            } = options;

            return this.createTexturedStandardMaterial(
                color,
                texturePath,
                textureRepeatX,
                textureRepeatY,
                {
                    roughness: 0.82,
                    metalness: 0.08,
                    flatShading: true,
                    ...materialOptions
                }
            );
        };

        const concrete = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.concrete,
            textureRepeatX: 3,
            textureRepeatY: 2,
            roughness: 0.96,
            metalness: 0.02
        });
        const concreteDark = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.floor,
            textureRepeatX: 2,
            textureRepeatY: 2,
            roughness: 1,
            metalness: 0
        });
        const steel = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 2,
            textureRepeatY: 2,
            roughness: 0.48,
            metalness: 0.72
        });
        const steelLight = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 1,
            textureRepeatY: 1,
            roughness: 0.34,
            metalness: 0.82
        });
        const steelDark = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 1,
            textureRepeatY: 1,
            roughness: 0.56,
            metalness: 0.68
        });
        const honey = makeMaterial(0xd78320, {
            emissive: 0x4d1f05,
            emissiveIntensity: 0.68,
            roughness: 0.7
        });
        const honeyLight = makeMaterial(0xffbd45, {
            emissive: 0x7a2e05,
            emissiveIntensity: 0.9,
            roughness: 0.58
        });
        const wood = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.wood,
            textureRepeatX: 1,
            textureRepeatY: 1,
            roughness: 0.94,
            metalness: 0.02
        });
        const woodDark = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.wood,
            textureRepeatX: 1,
            textureRepeatY: 1,
            roughness: 0.98,
            metalness: 0.01
        });
        const red = makeMaterial(0xb63b32, {
            emissive: 0x260302,
            emissiveIntensity: 0.35,
            roughness: 0.72
        });
        const screen = makeMaterial(0x071d3c, {
            emissive: 0x0b4f85,
            emissiveIntensity: 1.25,
            roughness: 0.38,
            metalness: 0.18
        });
        const cable = makeMaterial(0x101116, { roughness: 0.9, metalness: 0.02 });

        const addBox = (name, width, height, depth, x, y, z, material, parent = group) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(width, height, depth),
                material
            );
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            parent.add(mesh);
            return mesh;
        };

        const addCylinder = (
            name,
            radiusTop,
            radiusBottom,
            height,
            segments,
            x,
            y,
            z,
            material,
            parent = group
        ) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
                material
            );
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            parent.add(mesh);
            return mesh;
        };

        const addSphere = (name, radius, x, y, z, material, parent = group) => {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 8, 5),
                material
            );
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            parent.add(mesh);
            return mesh;
        };

        const addCylinderBetween = (name, start, end, radius, material, segments = 8) => {
            const direction = end.clone().sub(start);
            const length = direction.length();
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, length, segments),
                material
            );
            mesh.name = name;
            mesh.position.copy(start).add(end).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction.normalize()
            );
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            return mesh;
        };

        const addHex = (name, radius, x, y, z, material, parent = group) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, 0.22, 6),
                material
            );
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.rotation.x = Math.PI / 2;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            parent.add(mesh);
            return mesh;
        };

        const colliderBoxes = [];
        let ventilationGateCover = null;
        let ventilationGateLocalBox = null;
        const addColliderBox = (width, height, depth, x = 0, y = height / 2, z = 0) => {
            colliderBoxes.push(new THREE.Box3(
                new THREE.Vector3(x - width / 2, y - height / 2, z - depth / 2),
                new THREE.Vector3(x + width / 2, y + height / 2, z + depth / 2)
            ));
        };

        if (variant === 'facade_sign' || variant === 'facade' || variant === 'exterior_sign') {
            const width = Math.max(24, Number(model.width) || 92);
            const height = Math.max(7, Number(model.height) || 11);
            const depth = Math.max(0.3, Number(model.depth) || 0.55);

            addBox('hormiguero-facade-panel', width, height, depth, 0, height / 2, 0, concrete);
            addBox('hormiguero-facade-frame-top', width + 1.2, 0.42, depth + 0.16, 0, height + 0.16, 0, steelDark);
            addBox('hormiguero-facade-frame-bottom', width + 1.2, 0.42, depth + 0.16, 0, 0.16, 0, steelDark);

            [-1, 1].forEach(side => {
                addBox(
                    `hormiguero-facade-pillar-${side < 0 ? 'left' : 'right'}`,
                    0.7,
                    height + 1.3,
                    depth + 0.22,
                    side * (width / 2 - 1.2),
                    (height + 1.3) / 2,
                    0,
                    steelDark
                );
            });

            // Placa central y hexágonos que funcionan como una rotulación
            // reconocible incluso a distancia, sin depender de una fuente 3D.
            addBox('hormiguero-facade-sign-plate', width * 0.62, height * 0.34, 0.18, 0, height * 0.64, -depth / 2 - 0.11, concreteDark);
            const logoX = [-0.18, -0.06, 0.06, 0.18];
            logoX.forEach((factor, index) => {
                addHex(
                    `hormiguero-facade-logo-${index}`,
                    Math.max(0.8, height * 0.13),
                    factor * width,
                    height * 0.64,
                    -depth / 2 - 0.23,
                    index % 2 === 0 ? honeyLight : honey
                );
            });

            [-1, 1].forEach(side => {
                addBox('hormiguero-facade-light-arm', 0.18, 1.6, 0.18, side * width * 0.31, height * 0.9, -depth / 2 - 0.2, steelLight);
                addBox('hormiguero-facade-light', 1.4, 0.18, 0.5, side * width * 0.31, height * 0.78, -depth / 2 - 0.38, honeyLight);
            });

            // Ventanas oscuras para romper el volumen y dar escala de edificio.
            [-0.39, -0.3, 0.3, 0.39].forEach((factor, index) => {
                addBox(`hormiguero-facade-window-${index}`, width * 0.055, height * 0.28, 0.08, factor * width, height * 0.34, -depth / 2 - 0.08, screen);
            });
        } else if (variant === 'warehouse_rack' || variant === 'rack' || variant === 'shelf') {
            const width = Math.max(4, Number(model.width) || 7);
            const height = Math.max(4, Number(model.height) || 8);
            const depth = Math.max(1.4, Number(model.depth) || 2.5);
            const shelfLevels = Math.max(2, Math.min(4, Number(model.shelfLevels) || 3));

            [-1, 1].forEach(sx => {
                [-1, 1].forEach(sz => {
                    addCylinder(
                        `warehouse-rack-post-${sx}-${sz}`,
                        0.16,
                        0.2,
                        height,
                        6,
                        sx * (width / 2 - 0.18),
                        height / 2,
                        sz * (depth / 2 - 0.18),
                        steelDark
                    );
                });
            });

            for (let level = 0; level <= shelfLevels; level++) {
                const y = 0.45 + (level * (height - 0.8)) / shelfLevels;
                addBox(`warehouse-rack-shelf-${level}`, width, 0.22, depth, 0, y, 0, steel);
                addBox(`warehouse-rack-front-${level}`, width, 0.16, 0.16, 0, y + 0.16, -depth / 2 + 0.04, steelLight);
            }

            const boxColors = [wood, red, concrete, honey];
            for (let level = 0; level < shelfLevels; level++) {
                const y = 1.05 + (level * (height - 1.8)) / shelfLevels;
                const boxWidth = width * (level % 2 === 0 ? 0.26 : 0.2);
                const boxHeight = Math.min(1.05, (height - 1) / (shelfLevels + 0.7));
                [-0.31, 0.02, 0.3].forEach((factor, index) => {
                    if ((level + index) % 4 === 3) return;
                    addBox(
                        `warehouse-rack-box-${level}-${index}`,
                        boxWidth,
                        boxHeight,
                        depth * 0.62,
                        factor * width,
                        y,
                        0,
                        boxColors[(level + index) % boxColors.length]
                    );
                });
            }

            addBox('warehouse-rack-label', width * 0.55, 0.62, 0.12, 0, height - 0.55, -depth / 2 - 0.07, honey);
            addBox('warehouse-rack-label-stripe', width * 0.42, 0.08, 0.04, 0, height - 0.55, -depth / 2 - 0.15, honeyLight);
            addColliderBox(width + 0.45, height, depth + 0.35);
        } else if (variant === 'warehouse_pallet' || variant === 'pallet') {
            const width = Math.max(3, Number(model.width) || 6);
            const depth = Math.max(2.5, Number(model.depth) || 4);
            const palletHeight = 0.42;

            addBox('warehouse-pallet-base', width, 0.24, depth, 0, 0.12, 0, woodDark);
            for (let i = 0; i < 5; i++) {
                const x = -width / 2 + 0.35 + (i * (width - 0.7)) / 4;
                addBox(`warehouse-pallet-slat-${i}`, 0.45, 0.17, depth + 0.12, x, 0.34, 0, wood);
            }
            [-1, 0, 1].forEach((x, index) => {
                addBox(`warehouse-pallet-runner-${index}`, 0.34, 0.25, depth * 0.86, x * width * 0.31, 0.14, 0, woodDark);
            });

            const crateWidth = width * 0.43;
            const crateDepth = depth * 0.42;
            addBox('warehouse-pallet-crate-left', crateWidth, 1.8, crateDepth, -width * 0.22, palletHeight + 0.9, -depth * 0.17, wood);
            addBox('warehouse-pallet-crate-right', crateWidth, 1.55, crateDepth, width * 0.22, palletHeight + 0.775, depth * 0.17, red);
            addBox('warehouse-pallet-crate-top', crateWidth * 0.8, 1.1, crateDepth * 0.9, 0, palletHeight + 2.22, 0, honey);
            addBox('warehouse-pallet-tape-left', 0.12, 1.82, crateDepth + 0.04, -width * 0.22, palletHeight + 0.91, -depth * 0.17, honeyLight);
            addBox('warehouse-pallet-tape-right', 0.12, 1.57, crateDepth + 0.04, width * 0.22, palletHeight + 0.785, depth * 0.17, honeyLight);
            addColliderBox(width + 0.2, 3.65, depth + 0.2, 0, 1.8, 0);
        } else if (variant === 'vent_corner' || variant === 'duct_corner' || variant === 'elbow') {
            const width = Math.max(4, Number(model.width) || 10);
            const ceilingY = Math.max(2.6, Number(model.ceilingY) || 3.2);
            const wallThickness = Math.max(0.35, Number(model.wallThickness) || 0.5);
            const openEnd = String(model.openEnd || '').toLowerCase();
            const opensNegativeZ = openEnd === 'negative-z';

            // Cada módulo tiene una cota de suelo distinta para que sus
            // caras superiores no queden coplanares en las uniones.
            addBox('vent-corner-floor', width, 0.12, width, 0, 0.12, 0, steelDark);
            addBox('vent-corner-ceiling', width, 0.5, width, 0, ceilingY + 0.25, 0, steel);

            // Dos paneles forman la esquina exterior y dejan libre el giro en
            // el cuadrante opuesto a la unión de los dos tramos.
            // La unión de almacenamiento termina el tramo sur del conducto.
            // Su cara norte debe quedar abierta para que el jugador pueda
            // salir hacia el área del plató; el resto de esquinas conserva sus
            // dos paneles y su giro original.
            if (!opensNegativeZ) {
                addBox('vent-corner-wall-x', width, ceilingY, wallThickness, 0, ceilingY / 2, -(width / 2 - wallThickness / 2), steel);
                addBox('vent-corner-seam-x', width - 0.4, 0.15, 0.18, 0, ceilingY - 0.38, -(width / 2 - 0.32), steelLight);
            }

            // La unión de almacenamiento tiene una cara norte abierta que
            // funciona como salida del conducto hacia el almacén. En mapa2
            // puede cerrarse durante el encuentro de la sala.
            if (isVentilationGate && opensNegativeZ) {
                ventilationGateCover = addBox(
                    'vent-corner-closed-cover',
                    width,
                    ceilingY,
                    wallThickness,
                    0,
                    ceilingY / 2,
                    -(width / 2 - wallThickness / 2),
                    steelDark
                );
                ventilationGateCover.visible = !initialOpen;
                ventilationGateLocalBox = new THREE.Box3(
                    new THREE.Vector3(
                        -width / 2,
                        0,
                        -width / 2 - wallThickness / 2
                    ),
                    new THREE.Vector3(
                        width / 2,
                        ceilingY,
                        -width / 2 + wallThickness / 2
                    )
                );
            }
            addBox('vent-corner-wall-z', wallThickness, ceilingY, width, -(width / 2 - wallThickness / 2), ceilingY / 2, 0, steel);
            addBox('vent-corner-seam-z', 0.18, 0.15, width - 0.4, -(width / 2 - 0.32), ceilingY - 0.38, 0, steelLight);
            addBox('vent-corner-light', 1.7, 0.12, 1.15, width * 0.18, ceilingY - 0.06, width * 0.18, honeyLight);
            addCylinder('vent-corner-joint', 0.42, 0.42, 0.65, 8, 0, ceilingY - 0.34, 0, steelLight);

            // La caja de colisión cubre solo el techo; las dos paredes tienen
            // colliders independientes para conservar el pasillo transitable.
            addColliderBox(width, 0.5, width, 0, ceilingY + 0.25, 0);
            if (!opensNegativeZ) {
                addColliderBox(width, ceilingY, wallThickness, 0, ceilingY / 2, -(width / 2 - wallThickness / 2));
            }
            addColliderBox(wallThickness, ceilingY, width, -(width / 2 - wallThickness / 2), ceilingY / 2, 0);
        } else if (variant === 'vent_ladder' || variant === 'ladder') {
            const width = Math.max(2, Number(model.width) || 3.4);
            const height = Math.max(3.5, Number(model.height) || 7.2);
            const depth = Math.max(0.3, Number(model.depth) || 0.5);

            [-1, 1].forEach(side => {
                addCylinderBetween(
                    `vent-ladder-rail-${side < 0 ? 'left' : 'right'}`,
                    new THREE.Vector3(side * (width / 2 - 0.22), 0.25, 0),
                    new THREE.Vector3(side * (width / 2 - 0.22), height, 0),
                    0.13,
                    steelLight,
                    7
                );
            });
            const rungCount = Math.max(4, Math.floor(height / 0.72));
            for (let i = 0; i < rungCount; i++) {
                const y = 0.55 + (i * (height - 0.9)) / (rungCount - 1);
                addBox(`vent-ladder-rung-${i}`, width - 0.28, 0.14, depth, 0, y, 0, steelDark);
            }
            addBox('vent-ladder-top-hook-left', 0.18, 0.7, 0.7, -width * 0.33, height + 0.24, 0, steelLight);
            addBox('vent-ladder-top-hook-right', 0.18, 0.7, 0.7, width * 0.33, height + 0.24, 0, steelLight);
        } else if (variant === 'studio_camera' || variant === 'camera') {
            const width = Math.max(2.4, Number(model.width) || 3.4);
            const height = Math.max(3.5, Number(model.height) || 5.4);
            const depth = Math.max(1.8, Number(model.depth) || 2.5);
            const bodyY = Math.min(height - 1.2, 3.75);

            // Texturas pixel-art propias del modelo. Se pueden sobreescribir
            // por instancia desde el JSON, pero la cámara trae un look
            // coherente por defecto con sus cuatro mapas low-res.
            const cameraBodyMaterial = makeMaterial(0xffffff, {
                texturePath: model.textureBody || HORMIGUERO_TEXTURES.cameraBody,
                textureRepeatX: 1,
                textureRepeatY: 1,
                pixelated: true,
                roughness: 0.66,
                metalness: 0.34
            });
            const cameraMetalMaterial = makeMaterial(0xffffff, {
                texturePath: model.textureMetal || HORMIGUERO_TEXTURES.cameraMetal,
                textureRepeatX: 1,
                textureRepeatY: 1,
                pixelated: true,
                roughness: 0.48,
                metalness: 0.72
            });
            const cameraLensMaterial = makeMaterial(0xffffff, {
                texturePath: model.textureLens || HORMIGUERO_TEXTURES.cameraLens,
                textureRepeatX: 1,
                textureRepeatY: 1,
                pixelated: true,
                emissive: 0x062e67,
                emissiveIntensity: 1.15,
                roughness: 0.2,
                metalness: 0.28
            });
            const cameraAmberMaterial = makeMaterial(0xffffff, {
                texturePath: model.textureAmber || HORMIGUERO_TEXTURES.cameraAmber,
                textureRepeatX: 1,
                textureRepeatY: 1,
                pixelated: true,
                emissive: 0x6a2804,
                emissiveIntensity: 0.72,
                roughness: 0.42,
                metalness: 0.52
            });

            addBox('studio-camera-body', width, 1.7, depth, 0, bodyY, 0, cameraBodyMaterial);
            addBox('studio-camera-top', width * 0.74, 0.28, depth * 0.72, 0, bodyY + 0.98, 0, cameraMetalMaterial);
            addBox('studio-camera-top-handle', width * 0.52, 0.16, 0.24, 0, bodyY + 1.28, 0, cameraMetalMaterial);
            addBox('studio-camera-handle-left', 0.16, 0.42, 0.24, -width * 0.22, bodyY + 1.12, 0, cameraMetalMaterial);
            addBox('studio-camera-handle-right', 0.16, 0.42, 0.24, width * 0.22, bodyY + 1.12, 0, cameraMetalMaterial);

            // El objetivo apunta hacia -Z; CylinderGeometry nace alineada con
            // Y, por eso las dos piezas ópticas giran 90 grados sobre X.
            const lens = addCylinder(
                'studio-camera-lens',
                0.62,
                0.7,
                1.08,
                8,
                0,
                bodyY,
                -depth / 2 - 0.48,
                cameraLensMaterial,
                group
            );
            lens.rotation.x = Math.PI / 2;
            const lensHood = addCylinder(
                'studio-camera-lens-hood',
                0.79,
                0.79,
                0.18,
                8,
                0,
                bodyY,
                -depth / 2 - 1.03,
                cameraMetalMaterial,
                group
            );
            lensHood.rotation.x = Math.PI / 2;
            const lensRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.78, 0.1, 4, 8),
                cameraAmberMaterial
            );
            lensRing.name = 'studio-camera-lens-ring';
            lensRing.position.set(0, bodyY, -depth / 2 - 1.15);
            lensRing.rotation.x = Math.PI / 2;
            lensRing.castShadow = false;
            lensRing.receiveShadow = false;
            group.add(lensRing);

            addBox('studio-camera-viewfinder', 0.5, 0.55, 0.72, -width * 0.22, bodyY + 1.17, 0, cameraMetalMaterial);
            addBox('studio-camera-rear-panel', width * 0.58, 0.58, 0.08, 0, bodyY - 0.24, depth / 2 + 0.05, cameraMetalMaterial);
            addBox('studio-camera-rear-slot', width * 0.3, 0.1, 0.04, 0, bodyY - 0.27, depth / 2 + 0.11, cameraBodyMaterial);
            addCylinder('studio-camera-pan-head', 0.34, 0.34, 0.35, 8, 0, bodyY - 1.02, 0, cameraMetalMaterial);
            addCylinderBetween('studio-camera-tripod-center', new THREE.Vector3(0, bodyY - 1.15, 0), new THREE.Vector3(0, 1.1, 0), 0.16, cameraMetalMaterial, 7);

            const tripodLegs = [
                { name: 'left', x: -width * 0.52, z: depth * 0.42 },
                { name: 'right', x: width * 0.52, z: depth * 0.42 },
                { name: 'rear', x: 0, z: -depth * 0.48 }
            ];
            tripodLegs.forEach(({ name, x, z }) => {
                addCylinderBetween(
                    `studio-camera-tripod-leg-${name}`,
                    new THREE.Vector3(0, bodyY - 1.1, 0),
                    new THREE.Vector3(x, 0.18, z),
                    0.12,
                    cameraMetalMaterial,
                    7
                );
                addBox(`studio-camera-tripod-foot-${name}`, 0.42, 0.14, 0.62, x, 0.09, z, cameraBodyMaterial);
            });
            addBox('studio-camera-rec-light', 0.3, 0.22, 0.12, width * 0.27, bodyY + 0.25, -depth / 2 - 0.08, red);
            addCylinderBetween('studio-camera-cable', new THREE.Vector3(width * 0.35, bodyY - 0.55, depth * 0.4), new THREE.Vector3(width * 0.55, 0.16, depth * 0.5), 0.045, cable, 6);
            addColliderBox(width + 0.5, height, depth + 0.5, 0, height / 2, 0);
        } else if (variant === 'studio_softbox' || variant === 'softbox' || variant === 'light') {
            const width = Math.max(1.8, Number(model.width) || 3.1);
            const height = Math.max(4, Number(model.height) || 7.6);
            const depth = Math.max(0.8, Number(model.depth) || 1.5);

            addCylinderBetween(
                'studio-softbox-stand',
                new THREE.Vector3(0, 0.18, 0),
                new THREE.Vector3(0, height - 1.45, 0),
                0.1,
                steelLight,
                7
            );
            [-1, 1].forEach(side => {
                addCylinderBetween(
                    `studio-softbox-foot-${side < 0 ? 'left' : 'right'}`,
                    new THREE.Vector3(0, 0.2, 0),
                    new THREE.Vector3(side * 0.75, 0.12, side * 0.34),
                    0.08,
                    steel,
                    7
                );
            });
            addCylinder('studio-softbox-yoke', 0.18, 0.18, 0.8, 8, 0, height - 1.15, 0, steel);
            addBox('studio-softbox-housing', width, 1.5, depth, 0, height - 0.62, 0, steelDark);
            addBox('studio-softbox-lens', width * 0.76, 1.05, 0.12, 0, height - 0.62, -depth / 2 - 0.08, honeyLight);
            addBox('studio-softbox-grip', 0.18, 0.9, 0.18, width * 0.58, height - 0.62, 0, steelLight);
        } else if (variant === 'studio_monitor' || variant === 'monitor') {
            const width = Math.max(2.4, Number(model.width) || 3.6);
            const height = Math.max(2, Number(model.height) || 3.3);
            const depth = Math.max(0.35, Number(model.depth) || 0.55);
            const screenHeight = height * 0.68;

            addBox('studio-monitor-body', width, screenHeight, depth, 0, height * 0.66, 0, steelDark);
            addBox('studio-monitor-screen', width * 0.82, screenHeight * 0.72, 0.08, 0, height * 0.66, -depth / 2 - 0.06, screen);
            addBox('studio-monitor-screen-bar', width * 0.42, 0.08, 0.05, 0, height * 0.43, -depth / 2 - 0.12, honey);
            addCylinder('studio-monitor-neck', 0.16, 0.22, height * 0.34, 8, 0, height * 0.18, 0, steel);
            addBox('studio-monitor-foot', width * 0.64, 0.16, depth * 1.7, 0, 0.08, 0, steelDark);
            addBox('studio-monitor-led', 0.16, 0.16, 0.05, width * 0.36, height * 0.43, -depth / 2 - 0.13, red);
            addColliderBox(width + 0.25, height, depth + 0.35, 0, height / 2, 0);
        } else {
            console.warn(`Variante de prop de El Hormiguero no reconocida: ${variant || '(vacía)'}`);
            return null;
        }

        const position = model.position || { x: 0, y: 0, z: 0 };
        const propScale = Number(model.scale) || 1;
        group.name = model.id || `hormiguero-prop-${variant}`;
        group.position.set(
            Number(position.x) || 0,
            Number(position.y) || 0,
            Number(position.z) || 0
        );
        group.rotation.order = model.rotationOrder || 'XYZ';
        group.rotation.x = THREE.MathUtils.degToRad(Number(model.rotationX) || 0);
        group.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? Number(model.rotationY) : Number(model.rotation) || 0
        );
        group.rotation.z = THREE.MathUtils.degToRad(Number(model.rotationZ) || 0);
        group.scale.setScalar(propScale);
        group.userData = {
            id: model.id || `hormiguero-prop-${variant}`,
            type: 'staticModel',
            propType: `hormiguero-${variant}`,
            ventilationGate: isVentilationGate,
            ventilationGateId,
            ventilationStage: model.ventilationStage || null,
            ventilationOpen: initialOpen,
            ventilationCover: ventilationGateCover,
            ventilationCoverMode: ventilationGateCover ? 'visibility' : null,
            bulletImpact: model.bulletImpact !== false,
            bulletImpactFallback: model.collision !== false,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);

        const hasCollision = model.collision !== false && colliderBoxes.length > 0;
        if (hasCollision) {
            colliderBoxes.forEach((localBox, index) => {
                const collider = new THREE.Object3D();
                collider.name = `${group.name || variant}-collider-${index}`;
                collider.userData = {
                    type: 'staticCollider',
                    isStatic: true,
                    bulletImpact: model.bulletImpact !== false,
                    bulletImpactFallback: true,
                    simpleBoxCollider: true,
                    boundingBox: localBox.clone().applyMatrix4(group.matrixWorld)
                };
                group.add(collider);
                this.walls.push(collider);
            });
        }

        if (isVentilationGate && ventilationGateLocalBox) {
            const collider = new THREE.Object3D();
            collider.name = `${group.name || variant}-closed-collider`;
            collider.userData = {
                type: 'ventilationGate',
                ventilationGateId,
                isStatic: true,
                isOpen: initialOpen,
                bulletImpact: false,
                bulletImpactFallback: false,
                simpleBoxCollider: true,
                boundingBox: ventilationGateLocalBox.clone().applyMatrix4(group.matrixWorld)
            };

            if (!initialOpen) {
                this.scene.add(collider);
                this.walls.push(collider);
            }
            this.ventilationGateColliders.set(group, collider);
        }

        if (!hasCollision || model.decorative === true) {
            group.userData.isDecorative = true;
            this.decorativeMeshes.push(group);
        }
        // Todos los grupos se registran para que los materiales y geometrías
        // se liberen al recargar el mapa, incluso los props no colisionables.
        this.staticModels.push(group);

        console.log(`Prop de El Hormiguero cargado: ${variant} (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return group;
    }
    // #endregion

    // #region Creación de Prop de Maceta 3D World
    // Descripción: Construye una jardinera 3D con tierra, tallos, hojas y flores low-poly.
    createFlowerPotProp(model, textureLoader) {
        const group = new THREE.Group();
        const width = Math.max(2.5, model.width || 8.5);
        const depth = Math.max(1.2, model.depth || 2.4);
        const totalHeight = Math.max(2, model.height || 3.5);
        const planterHeight = Math.min(totalHeight * 0.4, model.planterHeight || 1.25);
        const soilHeight = 0.12;
        const propScale = model.scale || 1;

        let planterTexture = null;
        if (model.texture) {
            planterTexture = textureLoader.load(
                model.texture,
                () => { },
                () => { },
                () => { console.error(`No se pudo cargar textura de la maceta: ${model.texture}`); }
            );
            planterTexture.colorSpace = THREE.SRGBColorSpace;
            planterTexture.wrapS = THREE.RepeatWrapping;
            planterTexture.wrapT = THREE.RepeatWrapping;
            planterTexture.magFilter = THREE.LinearFilter;
            planterTexture.needsUpdate = true;
        }

        const planterMaterial = new THREE.MeshStandardMaterial({
            map: planterTexture,
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.02
        });
        const rimMaterial = new THREE.MeshStandardMaterial({
            map: planterTexture,
            color: 0xffffff,
            roughness: 0.86,
            metalness: 0.02
        });
        const soilMaterial = new THREE.MeshStandardMaterial({
            color: 0x302016,
            roughness: 1,
            metalness: 0
        });
        const stemMaterial = new THREE.MeshStandardMaterial({
            color: 0x2f6e32,
            roughness: 0.95,
            metalness: 0
        });
        const leafMaterials = [
            new THREE.MeshStandardMaterial({ color: 0x3d8438, roughness: 0.95 }),
            new THREE.MeshStandardMaterial({ color: 0x6b9b3d, roughness: 0.95 })
        ];
        const flowerMaterials = [
            new THREE.MeshStandardMaterial({ color: 0xe64a4a, roughness: 0.9 }),
            new THREE.MeshStandardMaterial({ color: 0xf3b52f, roughness: 0.9 }),
            new THREE.MeshStandardMaterial({ color: 0x7b55c7, roughness: 0.9 }),
            new THREE.MeshStandardMaterial({ color: 0xf4f0da, roughness: 0.9 })
        ];
        const flowerCenterMaterial = new THREE.MeshStandardMaterial({
            color: 0xffd45a,
            roughness: 0.86,
            metalness: 0
        });

        const addBox = (name, boxWidth, boxHeight, boxDepth, position, material) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth),
                material
            );
            mesh.name = name;
            mesh.position.copy(position);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            return mesh;
        };

        const addCylinderBetween = (name, start, end, radius, material, segments = 7) => {
            const direction = end.clone().sub(start);
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, direction.length(), segments),
                material
            );
            mesh.name = name;
            mesh.position.copy(start).add(end).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction.normalize()
            );
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            return mesh;
        };

        // Jardinera, zócalo, borde superior y tierra visible.
        addBox(
            'flower-pot-base',
            width * 0.84,
            0.18,
            depth * 0.82,
            new THREE.Vector3(0, 0.09, 0),
            planterMaterial
        );
        addBox(
            'flower-pot-body',
            width * 0.92,
            planterHeight,
            depth * 0.9,
            new THREE.Vector3(0, planterHeight / 2 + 0.12, 0),
            planterMaterial
        );
        addBox(
            'flower-pot-rim',
            width,
            0.2,
            depth,
            new THREE.Vector3(0, planterHeight + 0.22, 0),
            rimMaterial
        );
        const soilY = planterHeight + 0.36;
        addBox(
            'flower-pot-soil',
            width * 0.88,
            soilHeight,
            depth * 0.78,
            new THREE.Vector3(0, soilY, 0),
            soilMaterial
        );

        // Flores distribuidas en dos filas, con variación de altura y color.
        const flowerCount = Math.max(6, Math.min(10, Math.round(width / 0.9)));
        const flowerGeometry = new THREE.DodecahedronGeometry(0.2, 0);
        const flowerCenterGeometry = new THREE.SphereGeometry(0.075, 6, 4);
        const leafGeometry = new THREE.SphereGeometry(0.13, 6, 4);
        const flowerHeight = Math.max(0.8, totalHeight - soilY - 0.18);

        for (let i = 0; i < flowerCount; i++) {
            const progress = flowerCount === 1 ? 0.5 : i / (flowerCount - 1);
            const x = -width * 0.36 + progress * width * 0.72;
            const row = i % 2;
            const z = row === 0 ? -depth * 0.2 : depth * 0.2;
            const heightFactor = [0.78, 1, 0.9, 0.86, 0.96][i % 5];
            const stemStartY = soilY + 0.04;
            const flowerY = stemStartY + flowerHeight * heightFactor;

            addCylinderBetween(
                `flower-stem-${i}`,
                new THREE.Vector3(x, stemStartY, z),
                new THREE.Vector3(x, flowerY - 0.16, z),
                0.035,
                stemMaterial
            );

            for (const side of [-1, 1]) {
                const leaf = new THREE.Mesh(leafGeometry, leafMaterials[(i + (side > 0 ? 1 : 0)) % 2]);
                leaf.name = `flower-leaf-${i}-${side < 0 ? 'left' : 'right'}`;
                leaf.position.set(
                    x + side * 0.13,
                    stemStartY + (flowerY - stemStartY) * 0.45,
                    z + (row === 0 ? 0.04 : -0.04)
                );
                leaf.rotation.z = side * 0.7;
                leaf.rotation.y = row * 0.5;
                leaf.scale.set(1.45, 0.42, 0.72);
                group.add(leaf);
            }

            const flower = new THREE.Mesh(flowerGeometry, flowerMaterials[i % flowerMaterials.length]);
            flower.name = `flower-head-${i}`;
            flower.position.set(x, flowerY, z);
            flower.scale.set(1, 0.82, 1);
            group.add(flower);

            const center = new THREE.Mesh(flowerCenterGeometry, flowerCenterMaterial);
            center.name = `flower-center-${i}`;
            center.position.set(x, flowerY + 0.06, z + 0.05);
            group.add(center);
        }

        const position = model.position || { x: 0, y: 0, z: 0 };
        group.position.set(position.x || 0, position.y || 0, position.z || 0);
        group.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? model.rotationY : (model.rotation || 0)
        );
        group.scale.setScalar(propScale);
        group.userData = {
            id: model.id || 'park-flower-pot',
            type: 'staticModel',
            propType: 'flower-pot',
            bulletImpact: model.bulletImpact !== false,
            bulletImpactFallback: model.collision !== false,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);
        this.decorativeMeshes.push(group);

        if (model.collision !== false) {
            const colliderWidth = (model.collisionWidth || width) * propScale;
            const colliderHeight = (model.collisionHeight || planterHeight + 0.45) * propScale;
            const colliderDepth = (model.collisionDepth || depth) * propScale;
            group.userData.simpleBoxCollider = true;
            group.userData.collisionBoxSize = {
                width: colliderWidth,
                height: colliderHeight,
                depth: colliderDepth
            };

            // El collider se define en el espacio local de la maceta y se
            // transforma a mundo para respetar su rotación y escala. Antes se
            // construía directamente en ejes globales, por lo que una maceta
            // girada 90 grados mantenía intercambiados el ancho y el fondo.
            group.userData.boundingBox = new THREE.Box3(
                new THREE.Vector3(
                    -colliderWidth / 2,
                    0,
                    -colliderDepth / 2
                ),
                new THREE.Vector3(
                    colliderWidth / 2,
                    colliderHeight,
                    colliderDepth / 2
                )
            ).applyMatrix4(group.matrixWorld);
            this.walls.push(group);
            this.staticModels.push(group);
        }

        console.log(`Maceta 3D cargada en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return group;
    }
    // #endregion

    // #region Creación de Prop de Columpio World
    // Descripción: Construye un columpio low-poly con estructura metálica, asiento texturizado y cadenas.
    createSwingProp(model, textureLoader) {
        const group = new THREE.Group();
        const width = Math.max(4, model.width || 8);
        const height = Math.max(4.5, model.height || 6.5);
        const depth = Math.max(2.5, model.depth || 3.8);
        const seatWidth = Math.min(width * 0.42, model.seatWidth || 2.6);
        const seatDepth = Math.min(depth * 0.34, model.seatDepth || 0.75);
        const seatY = model.seatHeight || 2.1;

        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x294b3b,
            roughness: 0.78,
            metalness: 0.42
        });
        const chainMaterial = new THREE.MeshStandardMaterial({
            color: 0x252a27,
            roughness: 0.55,
            metalness: 0.8
        });

        let swingTexture = null;
        if (model.texture) {
            swingTexture = textureLoader.load(
                model.texture,
                () => { },
                () => { },
                () => { console.error(`No se pudo cargar textura del columpio: ${model.texture}`); }
            );
            swingTexture.colorSpace = THREE.SRGBColorSpace;
            swingTexture.wrapS = THREE.RepeatWrapping;
            swingTexture.wrapT = THREE.RepeatWrapping;
            swingTexture.magFilter = THREE.LinearFilter;
            swingTexture.needsUpdate = true;
        }

        const seatMaterial = new THREE.MeshStandardMaterial({
            map: swingTexture,
            color: 0xffffff,
            roughness: 0.88,
            metalness: 0
        });

        const addBox = (name, boxWidth, boxHeight, boxDepth, position, material) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth),
                material
            );
            mesh.name = name;
            mesh.position.copy(position);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            return mesh;
        };

        const addCylinderBetween = (name, start, end, radius, material, segments = 10) => {
            const direction = end.clone().sub(start);
            const length = direction.length();
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, length, segments),
                material
            );
            mesh.name = name;
            mesh.position.copy(start).add(end).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction.normalize()
            );
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            return mesh;
        };

        const topX = width * 0.39;
        const bottomX = width * 0.49;
        const bottomZ = depth * 0.5;
        const topY = height - 0.15;
        const bottomY = 0.22;

        // Viga superior y cuatro patas inclinadas del bastidor.
        addCylinderBetween(
            'swing-top-beam',
            new THREE.Vector3(-topX, topY, 0),
            new THREE.Vector3(topX, topY, 0),
            0.24,
            frameMaterial,
            12
        );

        // Casquillos que cubren y unen las cuatro patas con la viga superior.
        const topJointGeometry = new THREE.SphereGeometry(0.31, 8, 6);
        for (const side of [-1, 1]) {
            const joint = new THREE.Mesh(topJointGeometry, frameMaterial);
            joint.name = `swing-top-joint-${side < 0 ? 'left' : 'right'}`;
            joint.position.set(side * topX, topY, 0);
            joint.castShadow = false;
            joint.receiveShadow = false;
            group.add(joint);
        }

        for (const side of [-1, 1]) {
            for (const z of [-bottomZ, bottomZ]) {
                addCylinderBetween(
                    `swing-leg-${side < 0 ? 'left' : 'right'}-${z < 0 ? 'back' : 'front'}`,
                    new THREE.Vector3(side * topX, topY - 0.05, 0),
                    new THREE.Vector3(side * bottomX, bottomY, z),
                    0.17,
                    frameMaterial,
                    10
                );
            }
        }

        // Travesaños bajos para dar estabilidad al conjunto.
        for (const z of [-bottomZ, bottomZ]) {
            addBox(
                `swing-crossbar-${z < 0 ? 'back' : 'front'}`,
                bottomX * 2 + 0.45,
                0.18,
                0.18,
                new THREE.Vector3(0, 0.28, z),
                frameMaterial
            );
        }

        // Travesaños laterales: unen las patas delanteras y traseras de cada lado.
        for (const side of [-1, 1]) {
            addCylinderBetween(
                `swing-side-crossbar-${side < 0 ? 'left' : 'right'}`,
                new THREE.Vector3(side * bottomX, 0.28, -bottomZ),
                new THREE.Vector3(side * bottomX, 0.28, bottomZ),
                0.14,
                frameMaterial,
                10
            );
        }

        // Asiento de madera texturizado en dos lamas para que la textura sea visible.
        addBox(
            'swing-seat-base',
            seatWidth,
            0.16,
            seatDepth,
            new THREE.Vector3(0, seatY, 0),
            seatMaterial
        );
        addBox(
            'swing-seat-front-slat',
            seatWidth,
            0.12,
            seatDepth * 0.43,
            new THREE.Vector3(0, seatY + 0.12, seatDepth * 0.27),
            seatMaterial
        );
        addBox(
            'swing-seat-back-slat',
            seatWidth,
            0.12,
            seatDepth * 0.43,
            new THREE.Vector3(0, seatY + 0.12, -seatDepth * 0.27),
            seatMaterial
        );

        const chainTopY = topY - 0.22;
        const chainBottomY = seatY + 0.2;
        const chainX = seatWidth * 0.37;
        for (const x of [-chainX, chainX]) {
            addCylinderBetween(
                `swing-chain-${x < 0 ? 'left' : 'right'}`,
                new THREE.Vector3(x, chainTopY, 0),
                new THREE.Vector3(x, chainBottomY, 0),
                0.055,
                chainMaterial,
                8
            );
        }

        const position = model.position || { x: 0, y: 0, z: 0 };
        group.position.set(position.x || 0, position.y || 0, position.z || 0);
        group.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? model.rotationY : (model.rotation || 0)
        );
        group.scale.setScalar(model.scale || 1);
        group.userData = {
            id: model.id || 'park-swing',
            type: 'staticModel',
            propType: 'swing',
            bulletImpact: model.bulletImpact !== false,
            bulletImpactFallback: model.collision !== false,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);
        this.decorativeMeshes.push(group);

        if (model.collision !== false) {
            const propScale = model.scale || 1;
            const collisionCubeSize = Math.max(
                1,
                (model.collisionCubeSize || Math.max(width * 0.8, height, depth)) * propScale
            );
            const halfCube = collisionCubeSize / 2;
            const cubeMin = new THREE.Vector3(
                group.position.x - halfCube,
                group.position.y,
                group.position.z - halfCube
            );
            const cubeMax = new THREE.Vector3(
                group.position.x + halfCube,
                group.position.y + collisionCubeSize,
                group.position.z + halfCube
            );

            // Un único cubo AABB para el prop: evita colliders complejos
            // separados para patas, asiento y cadenas.
            group.userData.collisionCubeSize = collisionCubeSize;
            group.userData.boundingBox = new THREE.Box3(cubeMin, cubeMax);
            this.walls.push(group);
            this.staticModels.push(group);
        }

        console.log(`Prop de columpio cargado en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return group;
    }
    // #endregion

    // #region Creación de Puertas World
    // Descripción: Instancia mallas para las puertas en las posiciones definidas por el mapa.
    createDoorsFromMap() {
        this.doorMeshes = [];

        if (!this.mapData.doorPositions || this.mapData.doorPositions.length === 0) {
            return;
        }

        const doorWidth = CONFIG.BLOCK_SIZE;
        const doorHeight = CONFIG.BLOCK_SIZE;

        const doorGeometry = new THREE.PlaneGeometry(doorWidth, doorHeight);

        const textureLoader = new THREE.TextureLoader();
        let doorTexture = null;

        try {
            doorTexture = textureLoader.load(
                'assets/textures/door.webp',
                () => { },
                () => { },
                () => { doorTexture = null; }
            );
        } catch (err) {
            doorTexture = null;
        }

        let doorMaterial;
        if (doorTexture) {
            doorTexture.wrapS = THREE.RepeatWrapping;
            doorTexture.wrapT = THREE.RepeatWrapping;
            doorTexture.repeat.set(1, 1);
            doorMaterial = new THREE.MeshLambertMaterial({
                map: doorTexture,
                side: THREE.DoubleSide
            });
        } else {
            doorMaterial = new THREE.MeshLambertMaterial({
                color: 0x00ffff,
                side: THREE.DoubleSide
            });
        }

        this.mapData.doorPositions.forEach(doorData => {
            const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);

            doorMesh.position.set(doorData.position.x, doorHeight / 2, doorData.position.z);

            const rotationDegrees = doorData.rotation || 0;
            const rotationRadians = (rotationDegrees * Math.PI) / 180;
            doorMesh.rotation.y = rotationRadians;

            doorMesh.userData = {
                closedY: doorHeight / 2,
                openY: doorHeight + 10,
                targetY: doorHeight / 2,
                id: Math.random(),
                bulletImpact: true,
                bulletImpactFallback: true
            };

            this.scene.add(doorMesh);
            this.doorMeshes.push(doorMesh);

            const doorCell = this.worldToGridCell?.(doorMesh.position) || null;
            this.registerEditable(doorMesh, {
                kind: 'grid',
                base: 'D',
                cellX: doorCell?.x ?? null,
                cellY: doorCell?.y ?? null,
                rotation: doorData.rotation || 0,
                groundY: doorHeight / 2,
                dataRef: doorData,
                dataList: this.mapData.doorPositions,
                label: 'puerta'
            });
        });
    }
    // #endregion

    // #region Creación de Muros World
    // Descripción: Itera sobre los datos del mapa para crear bloques de muros, arbustos y ladrillos con sus respectivas colisiones.
    createWallsFromMap() {
        this.walls = [];

        const blockTypes = [
            {
                key: 'wall',
                data: this.mapData.walls,
                width: CONFIG.BLOCK_SIZE,
                height: CONFIG.BLOCK_SIZE,
                texturePath: 'assets/textures/wall.png',
                fallbackColor: 0x888888
            },
            {
                key: 'bush',
                data: this.mapData.bushes,
                width: CONFIG.BLOCK_SIZE,
                height: CONFIG.BLOCK_SIZE * 0.5,
                texturePath: 'assets/textures/arbusto.avif',
                fallbackColor: 0x336633
            },
            {
                key: 'brick',
                data: this.mapData.bricks,
                width: CONFIG.BLOCK_SIZE * 0.7,
                height: CONFIG.BLOCK_SIZE * 0.6,
                texturePath: 'assets/textures/brick.png',
                fallbackColor: 0xAA4444
            }
        ];

        const textureLoader = new THREE.TextureLoader();

        blockTypes.forEach(config => {
            if (!config.data || config.data.length === 0) return;

            if (!this.sharedGeometries[config.key]) {
                this.sharedGeometries[config.key] = new THREE.BoxGeometry(
                    config.width,
                    config.height,
                    config.width
                );
            }

            if (!this.sharedMaterials[config.key]) {
                let texture = null;
                try {
                    texture = textureLoader.load(
                        config.texturePath,
                        () => { },
                        () => { },
                        () => { texture = null; }
                    );
                } catch (err) {
                    texture = null;
                }

                if (texture) {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(1, 1);
                    this.sharedMaterials[config.key] = new THREE.MeshLambertMaterial({ map: texture });
                } else {
                    this.sharedMaterials[config.key] = new THREE.MeshLambertMaterial({ color: config.fallbackColor });
                }
            }

            config.data.forEach(itemData => {
                const mesh = new THREE.Mesh(this.sharedGeometries[config.key], this.sharedMaterials[config.key]);

                mesh.position.set(
                    itemData.position.x,
                    config.height / 2,
                    itemData.position.z
                );

                const rotationDegrees = itemData.rotation || 0;
                const rotationRadians = (rotationDegrees * Math.PI) / 180;
                mesh.rotation.y = rotationRadians;

                mesh.geometry.computeBoundingBox();
                mesh.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(mesh);
                mesh.userData = {
                    ...mesh.userData,
                    boundingBox: box,
                    isStatic: true,
                    type: 'wall',
                    bulletImpact: true,
                    bulletImpactFallback: true
                };

                mesh.updateMatrixWorld(true);
                this.walls.push(mesh);
                this.scene.add(mesh);

                // Registro editable para modo Construcción.
                const cell = this.worldToGridCell?.(mesh.position) || null;
                const baseByKey = { wall: '#', bush: 'B', brick: 'L' };
                this.registerEditable(mesh, {
                    kind: 'grid',
                    base: baseByKey[config.key] || '#',
                    cellX: cell?.x ?? null,
                    cellY: cell?.y ?? null,
                    rotation: itemData.rotation || 0,
                    groundY: config.height / 2,
                    dataRef: itemData,
                    dataList: config.data,
                    label: config.key
                });
            });
        });
    }
    // #endregion

    // #region Limpieza de Recursos World
    // Descripción: Libera la memoria de geometrías, materiales y elimina objetos de la escena al destruir el mundo o recargar el mapa.
    dispose({ preserveObjects = [] } = {}) {
        const preservedSceneChildren = new Set([
            ...this.preexistingSceneChildren,
            ...preserveObjects
        ]);

        if (this.exitPortal) {
            this.exitPortal.dispose();
            this.exitPortal = null;
        }

        this.environmentLights.forEach(light => {
            this.scene.remove(light);
            light.dispose?.();
        });
        this.environmentLights = [];

        if (this.scene.background === this.backgroundTexture) {
            this.scene.background = null;
        }
        if (this.scene.environment === this.backgroundTexture) {
            this.scene.environment = null;
        }
        this.backgroundTexture?.dispose?.();
        this.backgroundTexture = null;
        this.scene.fog = null;

        Object.values(this.sharedGeometries).forEach(geo => geo.dispose());
        Object.values(this.sharedMaterials).forEach(mat => mat.dispose());

        // Limpiar modelos 3D estáticos
        this.staticModels.forEach(model => {
            model.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
            this.scene.remove(model);
        });
        this.staticModels = [];

        // Liberar el único terreno compuesto de Parque al cambiar de mapa o
        // reiniciar la partida.
        if (this.parkGroundTerrain) {
            this.scene.remove(this.parkGroundTerrain);
            if (this.parkGroundTerrain.geometry) {
                this.parkGroundTerrain.geometry.dispose();
            }
            if (this.parkGroundTerrain.material) {
                if (
                    this.parkGroundTerrain.material.map &&
                    !this.surfaceTextures.has(this.parkGroundTerrain.material.map)
                ) {
                    this.parkGroundTerrain.material.map.dispose();
                }
                this.parkGroundTerrain.material.dispose();
            }
            this.parkGroundTerrain = null;
            this.floorGroup = null;
        }

        this.surfaceTextures.forEach(texture => texture.dispose());
        this.surfaceTextures.clear();

        this.collisionHelpers.forEach(helper => this.scene.remove(helper));
        this.collisionHelpers.clear();
        this.spawnerHelpers.forEach(helper => this.scene.remove(helper));
        this.spawnerHelpers.clear();
        this.ventilationGateColliders.forEach(collider => this.scene.remove(collider));
        this.ventilationGateColliders.clear();
        this.ventilationGateStates.clear();

        this.walls = [];
        this.doorMeshes = [];
        this.foodMeshes.forEach(foodMesh => {
            this.scene.remove(foodMesh);
            if (foodMesh.material) foodMesh.material.dispose();
        });
        this.foodMeshes = [];
        Object.values(this.foodTextures).forEach(texture => texture.dispose());
        this.foodTextures = {};
        const ammoTextures = new Set();
        this.ammoMeshes.forEach(ammoMesh => {
            this.scene.remove(ammoMesh);

            const material = ammoMesh?.material;
            if (material?.map) ammoTextures.add(material.map);
            material?.dispose?.();
        });
        ammoTextures.forEach(texture => texture.dispose());
        this.ammoMeshes = [];
        this.weaponMeshes.forEach(weaponMesh => {
            this.scene.remove(weaponMesh);
            if (weaponMesh.material?.map) weaponMesh.material.map.dispose();
            if (weaponMesh.material) weaponMesh.material.dispose();
        });
        this.weaponMeshes = [];

        // Retirar cualquier objeto que el mundo haya añadido directamente y
        // que no estuviera en una colección específica. La cámara se conserva
        // mediante preserveObjects desde Game para reutilizarla en el destino.
        this.scene.children.slice().forEach(child => {
            if (!preservedSceneChildren.has(child)) {
                this.scene.remove(child);
            }
        });

        this.decorativeMeshes = [];
        this.billboardMeshes = [];
        this.genericSpawners = [];
        this.enemySpawns = [];
        this.ammoSpawners = [];
        this.foodSpawners = [];
        this.mapData = null;
        this.mapLoader = null;
        this.exitPortalSpawn = null;
        this.currentMapName = null;
        this.sharedGeometries = {};
        this.sharedMaterials = {};
        this.mapGrid = null;
        this.gridLayout = null;
        this.propModels = [];
        this.editableRegistry?.clear?.();
    }
    // #endregion
}
// #endregion
