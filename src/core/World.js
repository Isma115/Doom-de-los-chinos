// #region Importaciones World
// Descripción: Importa las dependencias externas (Three.js, Loaders) y módulos internos necesarios para la construcción del mundo.
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, FOOD_TYPES } from '../Constants.js';
import { MapLoader } from './MapLoader.js';
import { Door } from '../entities/Door.js';

import { OBJLoader } from '../../node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from '../../node_modules/three/examples/jsm/loaders/MTLLoader.js';
import { TDSLoader } from '../../node_modules/three/examples/jsm/loaders/TDSLoader.js';
// #endregion

// #region Clase World
// Descripción: Clase principal que gestiona la creación y renderizado del entorno del juego (mapa), incluyendo suelos, paredes, modelos 3D y spawners.
export class World {
    // #region Constructor World
    // Descripción: Inicializa las estructuras de datos para almacenar geometrías, materiales y referencias a objetos del mundo como paredes y spawners.
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
        this.foodTextures = {};
        this.ammoMeshes = [];
        this.staticModels = [];
        this.decorativeMeshes = []; // Objetos decorativos (squares) para efectos de balas/sangre
        this.billboardMeshes = [];
    }
    // #endregion

    // #region Inicialización World
    // Descripción: Carga los datos del mapa, configura el skybox (cielo), iluminación, genera el suelo y crea los objetos iniciales del nivel.
    async init(mapName = 'default') {
        // Carga de Datos
        this.mapData = await this.mapLoader.loadMapFile(mapName);
        this.enemySpawns = this.mapData.enemySpawns;
        this.genericSpawners = this.mapData.genericSpawners;
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

        // Iluminación
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(50, 200, 100);
        dirLight.castShadow = false;
        this.scene.add(dirLight);
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
        const floorWidth = Math.max(terrainWidth + terrainMargin * 2, CONFIG.ARENA_SIZE);
        const floorDepth = Math.max(terrainDepth + terrainMargin * 2, CONFIG.ARENA_SIZE);
        const floorCenterX = (terrainBounds.minX + terrainBounds.maxX) / 2;
        const floorCenterZ = (terrainBounds.minZ + terrainBounds.maxZ) / 2;

        // Generación de Suelo
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

        // Guardar referencia al suelo para raycasting
        this.floorGroup = floorGroup;

        // Generación de Objetos Inicial
        this.createWallsFromMap();
        this.createDoorsFromMap();
        this.createFoodItemsFromMap();
        this.createAmmoItemsFromMap();

        // Cargar modelos 3D desde JSON externo
        await this.load3DModelsFromJSON(mapName);
    }
    // #endregion

    // #region Getters de Objetos World
    // Descripción: Proporciona acceso a las listas de objetos colisionables, spawners y mallas del mundo.
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
        const scale = type.scale || 3;
        foodSprite.scale.set(scale, scale, 1);
        foodSprite.position.set(position.x, 2, position.z);

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

                if (type === "swing" || type === "columpio") {
                    this.createSwingProp(model, textureLoader);
                    continue;
                }

                if (type === "flower_pot" || type === "flower_pot_3d" || type === "maceta_3d") {
                    this.createFlowerPotProp(model, textureLoader);
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
                            Number(model.collisionWidth) || size.x
                        );
                        const colliderHeight = Math.max(
                            0.5,
                            Number(model.collisionHeight) || size.y
                        );
                        const colliderDepth = Math.max(
                            0.5,
                            Number(model.collisionDepth) || size.z
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
                            transparent: true,
                            alphaTest: 0.02,
                            depthWrite: false
                        });
                    } else {
                        material = new THREE.MeshBasicMaterial({
                            color: 0xffffff,
                            side: THREE.DoubleSide,
                            transparent: true,
                            alphaTest: 0.02,
                            depthWrite: false
                        });
                    }

                    const squareMesh = new THREE.Mesh(geometry, material);
                    console.log(`[World] Creating square mesh at ${JSON.stringify(position)} with size ${width}x${height}`);
                    squareMesh.position.set(position.x, position.y, position.z);

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
                        billboard: shouldBillboard
                    };
                    this.decorativeMeshes.push(squareMesh);
                    if (shouldBillboard) {
                        this.billboardMeshes.push(squareMesh);
                    }

                    if (hasCollision) {
                        // Colisión: una caja simple dimensionada según el prop.
                        // Los billboards mantienen este volumen fijo aunque roten.
                        const colliderWidth = Math.max(
                            0.5,
                            model.collisionWidth || width
                        );
                        const colliderHeight = Math.max(
                            1,
                            model.collisionHeight || height
                        );
                        const colliderDepth = Math.max(
                            0.5,
                            model.collisionDepth || Math.min(width, height) * 0.25
                        );
                        const center = squareMesh.position;

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
                        Number(model.collisionHeight) || size.y
                    );
                    const colliderWidth = Math.max(
                        0.5,
                        Number(model.collisionWidth) || size.x
                    );
                    const colliderDepth = Math.max(
                        0.5,
                        Number(model.collisionDepth) || size.z
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
            const center = group.position;
            group.userData.simpleBoxCollider = true;
            group.userData.collisionBoxSize = {
                width: colliderWidth,
                height: colliderHeight,
                depth: colliderDepth
            };
            group.userData.boundingBox = new THREE.Box3(
                new THREE.Vector3(
                    center.x - colliderWidth / 2,
                    center.y,
                    center.z - colliderDepth / 2
                ),
                new THREE.Vector3(
                    center.x + colliderWidth / 2,
                    center.y + colliderHeight,
                    center.z + colliderDepth / 2
                )
            );
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
        this.foodMeshes.forEach(foodMesh => {
            this.scene.remove(foodMesh);
            if (foodMesh.material) foodMesh.material.dispose();
        });
        this.foodMeshes = [];
        Object.values(this.foodTextures).forEach(texture => texture.dispose());
        this.foodTextures = {};
        this.ammoMeshes = [];
    }
    // #endregion
}
// #endregion
