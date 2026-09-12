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
        this.exitPortal = null;
        this.exitPortalSpawn = null;
    }
    // #endregion

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
                        material = new THREE.MeshBasicMaterial({
                            color: 0xffffff,
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
                            numericValue(model.collisionWidth, width)
                        );
                        const colliderHeight = Math.max(
                            1,
                            numericValue(model.collisionHeight, height)
                        );
                        const colliderDepth = Math.max(
                            0.5,
                            numericValue(model.collisionDepth, Math.min(width, height) * 0.25)
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
    dispose() {
        if (this.exitPortal) {
            this.exitPortal.dispose();
            this.exitPortal = null;
        }

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
                if (this.parkGroundTerrain.material.map) {
                    this.parkGroundTerrain.material.map.dispose();
                }
                this.parkGroundTerrain.material.dispose();
            }
            this.parkGroundTerrain = null;
            this.floorGroup = null;
        }

        this.collisionHelpers.forEach(helper => this.scene.remove(helper));
        this.collisionHelpers.clear();

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
    }
    // #endregion
}
// #endregion
