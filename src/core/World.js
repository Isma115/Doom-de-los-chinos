/*sección [GESTIÓN DEL MUNDO] Código de gestión del mundo*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG } from '../Constants.js';
import { MapLoader } from './MapLoader.js';

import { OBJLoader } from '../../node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from '../../node_modules/three/examples/jsm/loaders/MTLLoader.js';

export class World {
    constructor(scene) {
        this.scene = scene;
        this.sharedMaterials = {};
        this.sharedGeometries = {};
        this.mapData = null;
        this.enemySpawns = [];
        this.mapLoader = new MapLoader();
        this.walls = [];
        this.doorMeshes = [];
        this.foodMeshes = []; // NUEVO: Array para meshes de comida
    }

    async init(mapName = 'default') {
    this.mapData = await this.mapLoader.loadMapFile(mapName);
    this.enemySpawns = this.mapData.enemySpawns;

    // Intentar usar un skybox (imagen equirectangular) si está disponible.
    // Si falla, volver al color sólido como fallback.
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

    if (skyTexture) {
        // Configurar mapeo equirectangular para que la imagen JPG actúe como skybox
        if (THREE.EquirectangularReflectionMapping) {
            skyTexture.mapping = THREE.EquirectangularReflectionMapping;
        }
        if (THREE.sRGBEncoding) {
            skyTexture.encoding = THREE.sRGBEncoding;
        }

        this.scene.background = skyTexture;
        // Opcionalmente usar como environment para PBR materiales si se desea
        if (this.renderer && this.renderer.capabilities && !this.scene.environment) {
            try {
                this.scene.environment = skyTexture;
            } catch (e) {
                // no crítico, continuar
            }
        }

        // Mantener una niebla compatible con el skybox para profundidad
        this.scene.fog = new THREE.Fog(0x87CEEB, 120, 350);
    } else {
        // Fallback: color sólido y niebla
        const skyColor = 0x87CEEB;
        this.scene.background = new THREE.Color(skyColor);
        this.scene.fog = new THREE.Fog(skyColor, 120, 350);
    }

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(50, 200, 100);
    dirLight.castShadow = false;
    this.scene.add(dirLight);

    const mapWidth = this.mapData.width * CONFIG.BLOCK_SIZE;
    const mapHeight = this.mapData.height * CONFIG.BLOCK_SIZE;
    const floorSize = Math.max(mapWidth, mapHeight, CONFIG.ARENA_SIZE);

    this.sharedGeometries.floor = new THREE.PlaneGeometry(floorSize * 1.5, floorSize * 1.5);

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

    if (floorTexture) {
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        const repeat = (floorSize * 1.5) / 10;
        floorTexture.repeat.set(repeat, repeat);
        this.sharedMaterials.floor = new THREE.MeshLambertMaterial({ map: floorTexture });
    } else {
        this.sharedMaterials.floor = new THREE.MeshLambertMaterial({ color: 0x44aa44 });
    }

    const floor = new THREE.Mesh(this.sharedGeometries.floor, this.sharedMaterials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.matrixAutoUpdate = false;
    floor.updateMatrix();
    this.scene.add(floor);

    this.createWallsFromMap();
    this.createDoorsFromMap();
    this.createFoodItemsFromMap();

    // NUEVO: cargar modelos 3D generados en MapLoader
    await this.create3DModelsFromMap();
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
        return this.foodMeshes; // NUEVO: Getter para items de comida
    }

    createFoodItemsFromMap() {
        this.foodMeshes = [];

        if (!this.mapData.foodItems || this.mapData.foodItems.length === 0) {
            return;
        }

        const textureLoader = new THREE.TextureLoader();
        const foodTexture = textureLoader.load(
            'assets/textures/kebab.png',
            () => { },
            () => { },
            () => { console.error("No se pudo cargar la textura de comida"); }
        );

        this.mapData.foodItems.forEach(pos => {
            const spriteMaterial = new THREE.SpriteMaterial({
                map: foodTexture,
                color: 0xffffff,
                depthWrite: false,
                transparent: true
            });

            const foodSprite = new THREE.Sprite(spriteMaterial);

            foodSprite.scale.set(3, 3, 1); // Tamaño visible del sprite
            foodSprite.position.set(pos.x, 2, pos.z);

            foodSprite.userData = {
                type: 'food',
                healAmount: 25,
                collected: false,
                rotationSpeed: 2.0
            };

            this.scene.add(foodSprite);
            this.foodMeshes.push(foodSprite);
        });
    }

    async create3DModelsFromMap() {
    if (!this.mapData.models3D || this.mapData.models3D.length === 0) return;

    const objLoader = new OBJLoader();
    const mtlLoader = new MTLLoader();
    const textureLoader = new THREE.TextureLoader();

    for (const entry of this.mapData.models3D) {

        const modelPath = entry.model;
        const basePath = modelPath.replace(".obj", "");
        const mtlPath = basePath + ".mtl";
        const jpgPath = basePath + ".jpg";

        const baseFolder = modelPath.substring(0, modelPath.lastIndexOf("/") + 1);

        let finalObject = null;

        try {
            mtlLoader.setResourcePath(baseFolder);
            objLoader.setResourcePath(baseFolder);

            let materials = await new Promise(resolve => {
                mtlLoader.load(
                    mtlPath,
                    mats => resolve(mats),
                    undefined,
                    () => resolve(null)
                );
            });

            if (materials) {
                materials.preload();
                objLoader.setMaterials(materials);

                finalObject = await new Promise((resolve, reject) => {
                    objLoader.load(modelPath, resolve, undefined, reject);
                });

                finalObject.traverse(node => {
                    if (node.isMesh) {
                        node.material = new THREE.MeshStandardMaterial({
                            map: node.material.map || null,
                            color: node.material.color || 0xffffff
                        });
                    }
                });

            } else {
                let texture = null;
                try {
                    texture = textureLoader.load(
                        jpgPath,
                        () => {},
                        () => {},
                        () => { texture = null; }
                    );
                } catch (err) {
                    texture = null;
                }

                finalObject = await new Promise((resolve, reject) => {
                    objLoader.load(modelPath, resolve, undefined, reject);
                });

                finalObject.traverse(node => {
                    if (node.isMesh) {
                        node.material = new THREE.MeshStandardMaterial({
                            map: texture || null,
                            color: texture ? 0xffffff : 0xffffff
                        });
                    }
                });
            }

            finalObject.scale.set(1, 1, 1);
            finalObject.position.set(
                entry.position.x,
                entry.position.y,
                entry.position.z
            );

            this.scene.add(finalObject);

            /* 🔥 CAJA DE COLISIÓN MÁS CLARA (X:25, Y:500, Z:25) 🔥 */
            const colliderWidth  = 5;
            const colliderDepth  = 5;
            const colliderHeight = 500;

            const halfWidth  = colliderWidth  / 2;
            const halfDepth  = colliderDepth  / 2;

            const minX = entry.position.x - halfWidth;
            const maxX = entry.position.x + halfWidth;
            const minZ = entry.position.z - halfDepth;
            const maxZ = entry.position.z + halfDepth;

            const minY = 0;
            const maxY = colliderHeight;

            const collisionBox = new THREE.Box3(
                new THREE.Vector3(minX, minY, minZ),
                new THREE.Vector3(maxX, maxY, maxZ)
            );

            finalObject.userData.boundingBox = collisionBox;

            /* Registrar palmera como objeto sólido */
            this.walls.push(finalObject);

        } catch (err) {
            console.error("Error cargando modelo 3D:", entry.model, err);
        }
    }
}



    createDoorsFromMap() {
        this.doorMeshes = [];

        if (!this.mapData.doorPositions || this.mapData.doorPositions.length === 0) {
            return;
        }

        const doorWidth = CONFIG.BLOCK_SIZE;
        const doorHeight = CONFIG.BLOCK_SIZE; // Igual altura que los muros (cuadrados)

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

        this.mapData.doorPositions.forEach(pos => {
            const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);

            doorMesh.position.set(pos.x, doorHeight / 2, pos.z);
            doorMesh.rotation.y = 0;

            doorMesh.userData = {
                closedY: doorHeight / 2,
                openY: doorHeight + 10,
                targetY: doorHeight / 2,
                id: Math.random()
            };

            this.scene.add(doorMesh);
            this.doorMeshes.push(doorMesh);
        });
    }
    createWallsFromMap() {
        const wallHeight = CONFIG.BLOCK_SIZE; // Mismos que las puertas (cuadrados)
        this.walls = [];

        this.sharedGeometries.wall = new THREE.BoxGeometry(
            CONFIG.BLOCK_SIZE,
            wallHeight,
            CONFIG.BLOCK_SIZE
        );

        const textureLoader = new THREE.TextureLoader();
        let wallTexture = null;

        try {
            wallTexture = textureLoader.load(
                'assets/textures/wall.png',
                () => { },
                () => { },
                () => { wallTexture = null; }
            );
        } catch (err) {
            wallTexture = null;
        }

        if (wallTexture) {
            wallTexture.wrapS = THREE.RepeatWrapping;
            wallTexture.wrapT = THREE.RepeatWrapping;
            wallTexture.repeat.set(1, 1);
            this.sharedMaterials.wall = new THREE.MeshLambertMaterial({ map: wallTexture });
        } else {
            this.sharedMaterials.wall = new THREE.MeshLambertMaterial({ color: 0x888888 });
        }

        this.mapData.walls.forEach(wallData => {
            const wall = new THREE.Mesh(this.sharedGeometries.wall, this.sharedMaterials.wall);

            wall.position.set(
                wallData.position.x,
                wallHeight / 2,
                wallData.position.z
            );

            wall.geometry.computeBoundingBox();

            const box = new THREE.Box3().setFromObject(wall);
            wall.userData.boundingBox = box;

            wall.updateMatrixWorld(true);

            this.walls.push(wall);
            this.scene.add(wall);
        });
    }

    dispose() {
        Object.values(this.sharedGeometries).forEach(geo => geo.dispose());
        Object.values(this.sharedMaterials).forEach(mat => mat.dispose());
        this.walls = [];
        this.doorMeshes = [];
        this.foodMeshes = []; // NUEVO: Limpiar items de comida
    }
}
/*[Fin de sección]*/