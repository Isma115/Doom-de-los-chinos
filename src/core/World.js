// #region Importaciones World
// Descripción: Importa las dependencias externas (Three.js, Loaders) y módulos internos necesarios para la construcción del mundo.
import * as THREE from '../../node_modules/three/build/three.module.js';
import {
    CONFIG,
    EXIT_PORTAL_CONFIG,
    FOOD_TYPES,
    WEAPONS_DATA
} from '../Constants.js';
import { MapLoader } from './MapLoader.js';
import { Door } from '../entities/Door.js';
import { ExitPortal } from '../entities/ExitPortal.js';

import { OBJLoader } from '../../node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from '../../node_modules/three/examples/jsm/loaders/MTLLoader.js';
import { TDSLoader } from '../../node_modules/three/examples/jsm/loaders/TDSLoader.js';
// #endregion

const HORMIGUERO_TEXTURES = Object.freeze({
    floor: 'assets/textures/hormiguero/studio_floor.png',
    wood: 'assets/textures/hormiguero/crate_wood.png',
    metal: 'assets/textures/hormiguero/studio_metal.png',
    concrete: 'assets/textures/hormiguero/studio_concrete.jpg',
    buildingWall: 'assets/textures/hormiguero/concrete_wall.png'
});

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
        this.ventilationOpen = false;
        this.exitPortal = null;
        this.exitPortalSpawn = null;
        this.surfaceTextures = new Set();
        this.environmentLights = [];
        this.backgroundTexture = null;
    }
    // #endregion

    loadTiledTexture(path, repeatX = 1, repeatY = 1) {
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
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
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
        const map = texturePath
            ? this.loadTiledTexture(texturePath, repeatX, repeatY)
            : null;

        const material = new THREE.MeshStandardMaterial({
            color,
            map,
            ...options
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
        const root = new THREE.Group();
        root.name = model.id || 'hormiguero_tv_studio';

        const position = model.position || {};
        root.position.set(
            Number(position.x) || 0,
            Number(position.y) || 0,
            Number(position.z) || 0
        );
        root.scale.setScalar(Number(model.scale) || 1);
        root.userData = {
            id: root.name,
            type: 'staticModel',
            propType: 'hormiguero-set',
            bulletImpact: true,
            isStatic: true
        };

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

        const backdropMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 4,
            textureRepeatY: 2,
            roughness: 0.96,
            metalness: 0.02
        });
        const stageMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.floor,
            textureRepeatX: 4,
            textureRepeatY: 2,
            roughness: 0.9
        });
        const carpetMaterial = makeMaterial(0x651f30, {
            roughness: 0.98
        });
        const trimMaterial = makeMaterial(0xb84c2d, {
            emissive: 0x260604,
            emissiveIntensity: 0.45
        });
        const honeyMaterial = makeMaterial(0xd78320, {
            emissive: 0x512004,
            emissiveIntensity: 0.75,
            roughness: 0.72
        });
        const honeyDarkMaterial = makeMaterial(0x8a461c, {
            emissive: 0x241003,
            emissiveIntensity: 0.3
        });
        const screenMaterial = makeMaterial(0x071b38, {
            emissive: 0x082b5b,
            emissiveIntensity: 1.1,
            roughness: 0.45,
            metalness: 0.2
        });
        const frameMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 2,
            textureRepeatY: 2,
            metalness: 0.38,
            roughness: 0.62
        });
        const metalMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 2,
            textureRepeatY: 2,
            metalness: 0.7,
            roughness: 0.42
        });
        const deskMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.wood,
            textureRepeatX: 2,
            textureRepeatY: 1,
            metalness: 0.18,
            roughness: 0.68
        });
        const lightMaterial = makeMaterial(0xffb34a, {
            emissive: 0xff6a16,
            emissiveIntensity: 1.8,
            roughness: 0.45
        });
        const buildingWallMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.buildingWall,
            textureRepeatX: 7,
            textureRepeatY: 3,
            roughness: 0.98,
            metalness: 0
        });

        const addBox = (name, dimensions, coordinates, material, rotation = {}) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(...dimensions),
                material
            );
            mesh.name = name;
            mesh.position.set(...coordinates);
            mesh.rotation.set(
                rotation.x || 0,
                rotation.y || 0,
                rotation.z || 0
            );
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            root.add(mesh);
            return mesh;
        };

        const addCylinder = (
            name,
            radiusTop,
            radiusBottom,
            height,
            segments,
            coordinates,
            material,
            rotation = {}
        ) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    radiusTop,
                    radiusBottom,
                    height,
                    segments
                ),
                material
            );
            mesh.name = name;
            mesh.position.set(...coordinates);
            mesh.rotation.set(
                rotation.x || 0,
                rotation.y || 0,
                rotation.z || 0
            );
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            root.add(mesh);
            return mesh;
        };

        const addSphere = (name, radius, coordinates, material) => {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 8, 5),
                material
            );
            mesh.name = name;
            mesh.position.set(...coordinates);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            root.add(mesh);
            return mesh;
        };

        // El plató queda dentro de una carcasa de edificio. La fachada frontal
        // es continua para que desde el patio no se vea el escenario; se deja
        // una entrada lateral con dintel para conservar el acceso jugable.
        const building = {
            minX: -44,
            maxX: 44,
            frontZ: -14,
            backZ: -64,
            wallHeight: 24,
            wallThickness: 1.6,
            sideEntryCenterZ: -39,
            sideEntryWidth: 14,
            sideEntryHeight: 10
        };
        const buildingCenterZ = (building.frontZ + building.backZ) / 2;
        const buildingDepth = building.frontZ - building.backZ;
        const sideWallX = building.maxX - building.wallThickness / 2;
        const leftWallX = building.minX + building.wallThickness / 2;
        const sideSectionDepth = (buildingDepth - building.sideEntryWidth) / 2;
        const frontSectionCenterZ = building.frontZ - sideSectionDepth / 2;
        const backSectionCenterZ = building.backZ + sideSectionDepth / 2;

        addBox(
            'hormiguero-building-front-wall',
            [building.maxX - building.minX, building.wallHeight, building.wallThickness],
            [0, building.wallHeight / 2, building.frontZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-back-wall',
            [building.maxX - building.minX, building.wallHeight, building.wallThickness],
            [0, building.wallHeight / 2, building.backZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-left-wall',
            [building.wallThickness, building.wallHeight, buildingDepth],
            [leftWallX, building.wallHeight / 2, buildingCenterZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-right-wall-front',
            [building.wallThickness, building.wallHeight, sideSectionDepth],
            [sideWallX, building.wallHeight / 2, frontSectionCenterZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-right-wall-back',
            [building.wallThickness, building.wallHeight, sideSectionDepth],
            [sideWallX, building.wallHeight / 2, backSectionCenterZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-right-entry-lintel',
            [building.wallThickness, building.wallHeight - building.sideEntryHeight, building.sideEntryWidth],
            [sideWallX, building.sideEntryHeight + (building.wallHeight - building.sideEntryHeight) / 2, building.sideEntryCenterZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-roof',
            [building.maxX - building.minX, building.wallThickness, buildingDepth],
            [0, building.wallHeight + building.wallThickness / 2, buildingCenterZ],
            buildingWallMaterial
        );

        // Escenario, alfombra y pared de fondo.
        addBox('hormiguero-stage-platform', [76, 1.2, 34], [0, 0.6, -38], stageMaterial);
        addBox('hormiguero-stage-carpet', [66, 0.16, 25], [0, 1.28, -38], carpetMaterial);
        addBox('hormiguero-stage-front-step', [74, 0.45, 2.8], [0, 0.22, -20.6], metalMaterial);
        addBox('hormiguero-backdrop', [76, 20, 0.8], [0, 10, -55], backdropMaterial);
        addBox('hormiguero-backdrop-left', [4, 16, 1.1], [-36, 8, -53.9], honeyDarkMaterial);
        addBox('hormiguero-backdrop-right', [4, 16, 1.1], [36, 8, -53.9], honeyDarkMaterial);
        addBox('hormiguero-side-light-left', [0.55, 16, 0.2], [-33.8, 8, -53.2], lightMaterial);
        addBox('hormiguero-side-light-right', [0.55, 16, 0.2], [33.8, 8, -53.2], lightMaterial);

        // Pantalla central y una H geométrica de bloques, legible desde el
        // área de juego sin introducir una fuente o una textura adicional.
        addBox('hormiguero-screen-frame', [31, 10, 0.8], [0, 12.1, -54.1], frameMaterial);
        addBox('hormiguero-screen', [27.5, 7.25, 0.14], [0, 12.1, -53.62], screenMaterial);
        addBox('hormiguero-logo-left', [1.45, 5.1, 0.2], [-3.2, 12.1, -53.48], honeyMaterial);
        addBox('hormiguero-logo-right', [1.45, 5.1, 0.2], [3.2, 12.1, -53.48], honeyMaterial);
        addBox('hormiguero-logo-crossbar', [5.8, 1.2, 0.2], [0, 12.1, -53.48], honeyMaterial);

        // Paneles hexagonales que recuerdan a una colmena y mantienen el
        // lenguaje visual del programa con pocos polígonos.
        const honeycombX = [-30, -22, 22, 30];
        const honeycombY = [4.2, 9.2, 14.2];
        honeycombY.forEach((y, row) => {
            honeycombX.forEach((x, column) => {
                addCylinder(
                    `hormiguero-hex-${row}-${column}`,
                    3.05,
                    3.05,
                    0.28,
                    6,
                    [x, y, -54.2],
                    (row + column) % 2 === 0 ? honeyMaterial : honeyDarkMaterial,
                    { x: Math.PI / 2 }
                );
            });
        });

        // Mesa del presentador y dos asientos sencillos para invitados.
        addBox('hormiguero-desk-top', [20, 0.9, 4], [0, 4.35, -32], deskMaterial);
        addBox('hormiguero-desk-front', [18, 2.2, 0.5], [0, 3.0, -29.85], trimMaterial);
        addBox('hormiguero-desk-left-leg', [1.25, 2.7, 3], [-8.3, 2.45, -32], deskMaterial);
        addBox('hormiguero-desk-right-leg', [1.25, 2.7, 3], [8.3, 2.45, -32], deskMaterial);
        addBox('hormiguero-desk-trim', [18, 0.22, 0.18], [0, 4.0, -29.55], honeyMaterial);

        [-14, 14].forEach((x, index) => {
            addCylinder(
                `hormiguero-stool-seat-${index}`,
                2.0,
                2.0,
                0.65,
                8,
                [x, 2.45, -31.5],
                frameMaterial
            );
            addCylinder(
                `hormiguero-stool-base-${index}`,
                0.28,
                0.42,
                1.9,
                8,
                [x, 1.45, -31.5],
                metalMaterial
            );
            addBox(
                `hormiguero-stool-back-${index}`,
                [3.5, 2.1, 0.42],
                [x, 3.85, -33.1],
                frameMaterial
            );
        });

        [-4, 4].forEach((x, index) => {
            addCylinder(
                `hormiguero-microphone-stand-${index}`,
                0.07,
                0.07,
                1.35,
                6,
                [x, 5.4, -31.7],
                metalMaterial
            );
            addSphere(`hormiguero-microphone-head-${index}`, 0.22, [x, 6.15, -31.7], lightMaterial);
        });

        // Truss superior, focos y una cámara lateral muy simplificada.
        addBox('hormiguero-truss-top', [74, 0.5, 0.5], [0, 19, -46], metalMaterial);
        addBox('hormiguero-truss-left', [0.5, 18, 0.5], [-35, 10, -46], metalMaterial);
        addBox('hormiguero-truss-right', [0.5, 18, 0.5], [35, 10, -46], metalMaterial);

        [-24, -8, 8, 24].forEach((x, index) => {
            addBox(`hormiguero-light-housing-${index}`, [1.4, 0.9, 1.4], [x, 17.8, -40], metalMaterial);
            addCylinder(
                `hormiguero-light-lens-${index}`,
                0.42,
                0.42,
                0.18,
                8,
                [x, 17.25, -40],
                lightMaterial,
                { x: Math.PI / 2 }
            );
            const pointLight = new THREE.PointLight(
                index % 2 === 0 ? 0xff9b38 : 0x936dff,
                2.4,
                42,
                2
            );
            pointLight.position.set(x, 17.1, -39.3);
            root.add(pointLight);
        });

        addBox('hormiguero-camera-body', [3.2, 2.1, 2.3], [-28, 4.0, -23.5], metalMaterial);
        addCylinder(
            'hormiguero-camera-lens',
            0.72,
            0.72,
            1.1,
            8,
            [-28, 4.0, -22.1],
            screenMaterial,
            { x: Math.PI / 2 }
        );
        addCylinder(
            'hormiguero-camera-tripod',
            0.25,
            0.48,
            2.4,
            6,
            [-28, 1.95, -23.5],
            metalMaterial
        );

        this.scene.add(root);
        root.updateMatrixWorld(true);

        const addCollider = (name, min, max) => {
            const collider = new THREE.Object3D();
            collider.name = `${root.name}-${name}-collider`;
            collider.userData = {
                type: 'staticCollider',
                isStatic: true,
                bulletImpact: false,
                bulletImpactFallback: false,
                simpleBoxCollider: true,
                boundingBox: new THREE.Box3(
                    new THREE.Vector3(...min),
                    new THREE.Vector3(...max)
                ).applyMatrix4(root.matrixWorld)
            };
            root.add(collider);
            this.walls.push(collider);
        };

        addCollider('backdrop', [-38, 0, -55.6], [38, 20.4, -54.1]);
        addCollider('desk', [-10, 1.25, -34.2], [10, 4.9, -29.5]);
        addCollider('camera', [-30, 0, -25], [-26, 6, -21.5]);
        addCollider(
            'building-front-wall',
            [building.minX, 0, building.frontZ - building.wallThickness / 2],
            [building.maxX, building.wallHeight, building.frontZ + building.wallThickness / 2]
        );
        addCollider(
            'building-back-wall',
            [building.minX, 0, building.backZ - building.wallThickness / 2],
            [building.maxX, building.wallHeight, building.backZ + building.wallThickness / 2]
        );
        addCollider(
            'building-left-wall',
            [building.minX - building.wallThickness / 2, 0, building.backZ],
            [building.minX + building.wallThickness / 2, building.wallHeight, building.frontZ]
        );
        addCollider(
            'building-right-wall-front',
            [building.maxX - building.wallThickness / 2, 0, building.frontZ - sideSectionDepth],
            [building.maxX + building.wallThickness / 2, building.wallHeight, building.frontZ]
        );
        addCollider(
            'building-right-wall-back',
            [building.maxX - building.wallThickness / 2, 0, building.backZ],
            [building.maxX + building.wallThickness / 2, building.wallHeight, building.backZ + sideSectionDepth]
        );
        addCollider(
            'building-right-entry-lintel',
            [building.maxX - building.wallThickness / 2, building.sideEntryHeight, building.sideEntryCenterZ - building.sideEntryWidth / 2],
            [building.maxX + building.wallThickness / 2, building.wallHeight, building.sideEntryCenterZ + building.sideEntryWidth / 2]
        );
        addCollider(
            'building-roof',
            [building.minX, building.wallHeight, building.backZ],
            [building.maxX, building.wallHeight + building.wallThickness, building.frontZ]
        );

        this.staticModels.push(root);
        console.log('Plató low poly de El Hormiguero cargado');
        return root;
    }
    // #endregion

    // #region Portal de Salida World
    // Descripción: Busca una celda despejada del mapa y materializa el portal
    // cuando el sistema de rondas o el mapa de pruebas lo solicita.
    findExitPortalPosition(playerPosition = null) {
        const explicitPosition = this.exitPortalSpawn
            ? new THREE.Vector3(this.exitPortalSpawn.x, 0, this.exitPortalSpawn.z)
            : null;
        const genericPositions = (this.genericSpawners || [])
            .map(spawner => spawner?.position)
            .filter(Boolean)
            .map(position => new THREE.Vector3(position.x, 0, position.z));

        const referencePosition = playerPosition || this.getPlayerSpawn();
        if (referencePosition) {
            genericPositions.sort((first, second) => {
                const firstDistance = first.distanceToSquared(referencePosition);
                const secondDistance = second.distanceToSquared(referencePosition);
                return secondDistance - firstDistance;
            });
        }
        const candidatePositions = explicitPosition
            ? [explicitPosition, ...genericPositions]
            : genericPositions;

        const portalWidth = Number(EXIT_PORTAL_CONFIG.width) || 5.2;
        const portalHeight = Number(EXIT_PORTAL_CONFIG.height) || 7.2;
        const portalDepth = 1.5;
        const solidObjects = this.getSolidObjects();
        const canPlace = position => {
            if (!position) return false;

            if (playerPosition) {
                const distanceFromPlayer = Math.hypot(
                    playerPosition.x - position.x,
                    playerPosition.z - position.z
                );
                if (distanceFromPlayer < 6) return false;
            }

            const portalBox = new THREE.Box3(
                new THREE.Vector3(
                    position.x - portalWidth / 2,
                    0,
                    position.z - portalDepth / 2
                ),
                new THREE.Vector3(
                    position.x + portalWidth / 2,
                    portalHeight,
                    position.z + portalDepth / 2
                )
            );

            return solidObjects.every(object => {
                const boundingBox = object?.userData?.boundingBox;
                return !boundingBox || !portalBox.intersectsBox(boundingBox);
            });
        };

        const freePosition = candidatePositions.find(canPlace);
        if (freePosition) return freePosition;

        // Fallback para mapas de Parque modificados: probar el centro y una
        // pequeña cuadrícula antes de renunciar a mostrar la salida.
        const bounds = this.mapData?.terrainBounds;
        if (bounds) {
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerZ = (bounds.minZ + bounds.maxZ) / 2;
            const fallbackPositions = [
                new THREE.Vector3(centerX, 0, centerZ),
                new THREE.Vector3(centerX - 10, 0, centerZ),
                new THREE.Vector3(centerX + 10, 0, centerZ),
                new THREE.Vector3(centerX, 0, centerZ - 10),
                new THREE.Vector3(centerX, 0, centerZ + 10)
            ];
            const fallbackPosition = fallbackPositions.find(canPlace);
            if (fallbackPosition) return fallbackPosition;
        }

        return null;
    }

    spawnExitPortal(playerPosition = null, audioManager = null) {
        if (!['mapa1', 'pruebas_alien'].includes(this.currentMapName)) return null;
        if (this.exitPortal) return this.exitPortal;

        const position = this.findExitPortalPosition(playerPosition);
        if (!position) {
            console.warn('No se encontró una zona libre para el portal de salida');
            return null;
        }

        this.exitPortal = new ExitPortal(this.scene, position, audioManager);
        console.log(`Portal de salida abierto en (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
        return this.exitPortal;
    }

    updateExitPortal(delta, cameraPosition) {
        this.exitPortal?.update(delta, cameraPosition);
    }

    tryEnterExitPortal(playerPosition) {
        if (!this.exitPortal?.isPlayerNear(playerPosition)) return false;

        const destinationMap = this.exitPortal.mesh.userData.destinationMap;
        if (destinationMap) {
            return destinationMap;
        }

        // El siguiente mapa aún no existe; mantener el portal interactivo
        // permite conectar la transición sin rehacer la entidad más adelante.
        return true;
    }

    getExitPortalDestination() {
        return this.exitPortal?.mesh?.userData?.destinationMap || null;
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

    setVentilationOpen(open = true) {
        this.ventilationOpen = Boolean(open);

        this.ventilationGateColliders.forEach((collider, grate) => {
            const cover = grate.userData?.ventilationCover;
            if (cover) {
                cover.rotation.x = this.ventilationOpen ? -1.2 : 0;
            }

            if (this.ventilationOpen) {
                const colliderIndex = this.walls.indexOf(collider);
                if (colliderIndex !== -1) this.walls.splice(colliderIndex, 1);
                if (collider.parent) collider.parent.remove(collider);

                const helper = this.collisionHelpers.get(collider);
                if (helper) {
                    this.scene.remove(helper);
                    this.collisionHelpers.delete(collider);
                }
            } else {
                if (!collider.parent) this.scene.add(collider);
                if (!this.walls.includes(collider)) this.walls.push(collider);
            }

            grate.userData.ventilationOpen = this.ventilationOpen;
            collider.userData.isOpen = this.ventilationOpen;
        });

        // Las entradas que no son compuertas del patio conservan su estado
        // decorativo, pero comparten la señal para cualquier interacción futura.
        this.scene.traverse(object => {
            if (object.userData?.propType === 'vent-grate') {
                object.userData.ventilationOpen = this.ventilationOpen;
            }
        });

        return this.ventilationOpen;
    }

    isVentilationOpen() {
        return this.ventilationOpen;
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
            this.createFoodSprite(position, foodType);
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

            const objLoader = new OBJLoader();
            const mtlLoader = new MTLLoader();
            const tdsLoader = new TDSLoader();
            const textureLoader = new THREE.TextureLoader();

            for (const model of modelsData) {
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

                if (type === "swing" || type === "columpio") {
                    this.createSwingProp(model, textureLoader);
                    continue;
                }

                if (type === "flower_pot" || type === "flower_pot_3d" || type === "maceta_3d") {
                    this.createFlowerPotProp(model, textureLoader);
                    continue;
                }

                if (type === "fountain" || type === "fuente") {
                    this.createFountainProp(model);
                    continue;
                }

                if (type === "vent_duct" || type === "conducto") {
                    this.createVentDuctProp(model);
                    continue;
                }

                if (type === "vent_grate" || type === "reja") {
                    this.createVentGrateProp(model);
                    continue;
                }

                if (type === "crate" || type === "caja") {
                    this.createCrateProp(model);
                    continue;
                }

                if (type === "hormiguero_prop" || type === "map2_prop") {
                    this.createHormigueroProp(model);
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
        hinge.rotation.x = isVentilationGate && !this.ventilationOpen ? 0 : -1.2;
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
            ventilationOpen: isVentilationGate ? this.ventilationOpen : true,
            ventilationCover: hinge,
            bulletImpact: model.bulletImpact !== false,
            isStatic: true
        };

        this.scene.add(group);
        group.updateMatrixWorld(true);
        this.decorativeMeshes.push(group);

        if (isVentilationGate && !this.ventilationOpen) {
            const collider = new THREE.Object3D();
            collider.name = `${group.name}-closed-collider`;
            collider.userData = {
                type: 'ventilationGate',
                isStatic: true,
                isOpen: false,
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

            this.scene.add(collider);
            this.walls.push(collider);
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

    // #region Creación de Kit de Props de El Hormiguero World
    // Descripción: Colección de props procedurales ligeros para vestir el
    // exterior, el almacén, la red de ventilación y el plató. Se mantienen en
    // un único tipo de modelo para que el JSON del mapa pueda funcionar como
    // catálogo de variantes sin añadir dependencias externas.
    createHormigueroProp(model = {}) {
        const group = new THREE.Group();
        const variant = String(model.variant || model.prop || '').toLowerCase();

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

            addBox('studio-camera-body', width, 1.7, depth, 0, bodyY, 0, steelDark);
            addBox('studio-camera-top', width * 0.74, 0.28, depth * 0.72, 0, bodyY + 0.98, 0, steel);
            addCylinder('studio-camera-lens', 0.62, 0.7, 1.08, 8, 0, bodyY, -depth / 2 - 0.48, screen, group);
            addCylinder('studio-camera-lens-ring', 0.82, 0.82, 0.16, 8, 0, bodyY, -depth / 2 - 0.06, honey, group);
            addBox('studio-camera-viewfinder', 0.5, 0.55, 0.72, -width * 0.22, bodyY + 1.17, 0, steelLight);
            addCylinder('studio-camera-pan-head', 0.34, 0.34, 0.35, 8, 0, bodyY - 1.02, 0, steel);
            addCylinderBetween('studio-camera-tripod-center', new THREE.Vector3(0, bodyY - 1.15, 0), new THREE.Vector3(0, 1.1, 0), 0.16, steelLight, 7);
            [-1, 1].forEach(side => {
                addCylinderBetween(
                    `studio-camera-tripod-leg-${side < 0 ? 'left' : 'right'}`,
                    new THREE.Vector3(0, bodyY - 1.1, 0),
                    new THREE.Vector3(side * width * 0.52, 0.18, depth * 0.42),
                    0.12,
                    steel,
                    7
                );
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

        this.walls = [];
        this.doorMeshes = [];
        this.foodMeshes.forEach(foodMesh => {
            this.scene.remove(foodMesh);
            if (foodMesh.material) foodMesh.material.dispose();
        });
        this.foodMeshes = [];
        Object.values(this.foodTextures).forEach(texture => texture.dispose());
        this.foodTextures = {};
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
    }
    // #endregion
}
// #endregion
