/*sección [INICIALIZACIÓN Y CONFIGURACIÓN] Importaciones, constructor y configuración inicial del mundo*/
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
        this.genericSpawners = [];
        this.mapLoader = new MapLoader();
        this.walls = [];
        this.doorMeshes = [];
        this.foodMeshes = [];
        this.ammoMeshes = [];
        this.staticModels = []; // Almacenar modelos 3D estáticos
    }

    async init(mapName = 'default') {
        this.mapData = await this.mapLoader.loadMapFile(mapName);
        this.enemySpawns = this.mapData.enemySpawns;
        this.genericSpawners = this.mapData.genericSpawners;
        this.ammoSpawners = this.mapData.ammoSpawners || [];
        this.foodSpawners = this.mapData.foodSpawners || [];

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

        const tileSize = 20;
        const tilesX = Math.ceil((floorSize * 1.5) / tileSize) + 2;
        const tilesZ = Math.ceil((floorSize * 1.5) / tileSize) + 2;

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

        const startX = -(tilesX * tileSize) / 2 + tileSize / 2;
        const startZ = -(tilesZ * tileSize) / 2 + tileSize / 2;

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

        this.scene.add(floorGroup);

        this.createWallsFromMap();
        this.createDoorsFromMap();
        this.createFoodItemsFromMap();
        this.createAmmoItemsFromMap();

        // Cargar modelos 3D desde JSON externo
        await this.load3DModelsFromJSON(mapName);
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

    getGenericSpawners() {
        return this.genericSpawners;
    }

    getAmmoSpawners() {
        return this.ammoSpawners;
    }

    getFoodSpawners() {
        return this.foodSpawners || [];
    }

    spawnFood(position) {
        const textureLoader = new THREE.TextureLoader();
        const foodTexture = textureLoader.load(
            'assets/textures/kebab.png',
            () => { },
            () => { },
            () => { console.error("No se pudo cargar la textura de comida"); }
        );

        const spriteMaterial = new THREE.SpriteMaterial({
            map: foodTexture,
            color: 0xffffff,
            depthWrite: false,
            transparent: true
        });

        const foodSprite = new THREE.Sprite(spriteMaterial);
        foodSprite.scale.set(3, 3, 1);
        foodSprite.position.set(position.x, 2, position.z);

        foodSprite.userData = {
            type: 'food',
            healAmount: CONFIG.FOOD_HEAL_AMOUNT,
            collected: false,
            rotationSpeed: 2.0
        };

        this.scene.add(foodSprite);
        this.foodMeshes.push(foodSprite);
        return foodSprite;
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
            transparent: true
        });

        const ammoSprite = new THREE.Sprite(spriteMaterial);

        ammoSprite.scale.set(2, 2, 1);
        ammoSprite.position.set(position.x, 2, position.z);

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

    /*[Fin de sección]*/

    /*sección [CREACIÓN DE ELEMENTOS DEL MAPA] Métodos para crear items coleccionables, muros, puertas y modelos 3D*/
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

            ammoSprite.scale.set(2, 2, 1);
            ammoSprite.position.set(ammoData.position.x, 2, ammoData.position.z);

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

            foodSprite.scale.set(3, 3, 1);
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

    // Carga de modelos 3D desde archivo JSON externo por mapa
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

            for (const model of modelsData) {
                const { path, position, rotation = 0, scale = 1 } = model;

                const basePath = path.substring(0, path.lastIndexOf("/"));
                const mtlPath = path.replace(".obj", ".mtl");
                const jpgPath = path.replace(".obj", ".jpg");

                let finalObject = null;

                try {
                    // Cargar materiales (.mtl) si existen
                    mtlLoader.setPath(basePath + "/");
                    let materials = null;
                    try {
                        materials = await mtlLoader.loadAsync(mtlPath);
                        materials.preload();
                        objLoader.setMaterials(materials);
                    } catch (err) {
                        console.log(`No se encontró .mtl para ${path}, se usará textura básica`);
                    }

                    objLoader.setPath(basePath + "/");
                    finalObject = await objLoader.loadAsync(path);

                    // Aplicar textura JPG si no hay .mtl
                    if (!materials) {
                        finalObject.traverse(child => {
                            if (child.isMesh) {
                                const texture = new THREE.TextureLoader().load(jpgPath);
                                child.material = new THREE.MeshStandardMaterial({
                                    map: texture,
                                    side: THREE.DoubleSide
                                });
                            }
                        });
                    }

                    finalObject.scale.set(scale, scale, scale);
                    finalObject.position.set(position.x, position.y, position.z);
                    finalObject.rotation.y = THREE.MathUtils.degToRad(rotation);

                    this.scene.add(finalObject);

                    // Colisión: caja ajustada al modelo
                    const box = new THREE.Box3().setFromObject(finalObject);
                    const size = box.getSize(new THREE.Vector3());
                    const center = box.getCenter(new THREE.Vector3());

                    const colliderHeight = Math.max(size.y, 10);
                    const colliderWidth = Math.max(size.x, 5);
                    const colliderDepth = Math.max(size.z, 5);

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

                    finalObject.userData.boundingBox = collisionBox;
                    finalObject.userData.isStatic = true;
                    finalObject.userData.type = 'staticModel';
                    this.walls.push(finalObject);
                    this.staticModels.push(finalObject);

                    console.log(`Modelo 3D cargado: ${path} en (${position.x}, ${position.y}, ${position.z})`);

                } catch (err) {
                    console.error(`Error cargando modelo 3D: ${path}`, err);
                }
            }
        } catch (err) {
            console.warn(`No hay archivo de modelos 3D para el mapa ${mapName} o error de carga`, err);
        }
    }

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
                id: Math.random()
            };

            this.scene.add(doorMesh);
            this.doorMeshes.push(doorMesh);
        });
    }

    getPlayerRotation() {
        return this.mapData ? this.mapData.playerRotation : 0;
    }

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
                const box = new THREE.Box3().setFromObject(mesh);
                mesh.userData.boundingBox = box;

                mesh.updateMatrixWorld(true);
                this.walls.push(mesh);
                this.scene.add(mesh);
            });
        });
    }

    /*[Fin de sección]*/

    /*sección [LIMPIEZA DE RECURSOS] Método para liberar memoria y limpiar recursos del mundo*/
    dispose() {
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

        this.walls = [];
        this.doorMeshes = [];
        this.foodMeshes = [];
        this.ammoMeshes = [];
    }
}

/*[Fin de sección]*/