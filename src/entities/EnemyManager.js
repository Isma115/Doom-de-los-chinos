// #region Importaciones EnemyManager
import * as THREE from 'three';
import {
    CONFIG,
    ENEMY_TYPES,
    AUDIO_CONFIG,
    GENERIC_DEATH_SPRITE_SHEET,
    HIT_BLOOD_SPRITE_VARIANTS
} from '../Constants.js';
import { BloodDecalManager } from '../core/BloodDecalManager.js';
import {
    isSpriteSheetEnemy as isSpriteSheetEnemyFn,
    createEnemyMaterial as createEnemyMaterialFn,
    resetSpriteSheetGeometry as resetSpriteSheetGeometryFn,
    setEnemySpriteOffset as setEnemySpriteOffsetFn,
    setSpriteSheetGeometryFrame as setSpriteSheetGeometryFrameFn,
    disposeEnemyMaterial as disposeEnemyMaterialFn,
    initializeEnemyAnimation as initializeEnemyAnimationFn,
    setSpriteSheetFrame as setSpriteSheetFrameFn,
    updateSpriteSheetAnimation as updateSpriteSheetAnimationFn,
    getSpriteSheetAnimationDuration as getSpriteSheetAnimationDurationFn,
    updateEnemyVisual as updateEnemyVisualFn
} from './enemies/SpriteSheet.js';
import {
    createSpawnHologram as createSpawnHologramFn,
    startSpawnHologram as startSpawnHologramFn,
    updateSpawnHologram as updateSpawnHologramFn,
    stopSpawnHologram as stopSpawnHologramFn,
    disposeSpawnHologram as disposeSpawnHologramFn
} from './enemies/SpawnHologram.js';
import {
    setGenericCorpseSprite as setGenericCorpseSpriteFn,
    selectGenericDeathTexture as selectGenericDeathTextureFn,
    setGenericDeathSpriteFrame as setGenericDeathSpriteFrameFn,
    startGenericDeathAnimation as startGenericDeathAnimationFn,
    updateGenericDeathAnimation as updateGenericDeathAnimationFn
} from './enemies/GenericDeath.js';
import {
    getBloodTexturePaths as getBloodTexturePathsFn,
    getHitBloodSpritePaths as getHitBloodSpritePathsFn,
    clampBloodHitPosition as clampBloodHitPositionFn,
    getBloodColor as getBloodColorFn,
    createBloodParticleMaterial as createBloodParticleMaterialFn,
    configureBloodEffects as configureBloodEffectsFn,
    getCachedBloodSpriteTexture as getCachedBloodSpriteTextureFn,
    createHitBloodSpriteCloud as createHitBloodSpriteCloudFn,
    createBloodParticles as createBloodParticlesFn,
    spawnMassiveBloodSplash as spawnMassiveBloodSplashFn,
    spawnGoreShockwave as spawnGoreShockwaveFn,
    spawnBloodProjectiles as spawnBloodProjectilesFn,
    spawnTrailParticle as spawnTrailParticleFn,
    updateBloodProjectiles as updateBloodProjectilesFn,
    updateBloodParticles as updateBloodParticlesFn,
    updateGoreParticles as updateGoreParticlesFn,
    updateGoreSprites as updateGoreSpritesFn,
    clearBloodParticles as clearBloodParticlesFn
} from './enemies/Blood.js';
// #endregion

// #region Clase EnemyManager
export class EnemyManager {

    // #region Constructor EnemyManager
    constructor(scene, world, audioManager) {
        this.scene = scene;
        this.world = world;
        this.audioManager = audioManager;
        this.enemies = [];
        this.enemyDefeatedCallback = null;
        this.lastSpawnTime = 0;

        this.sharedGeometry = new THREE.PlaneGeometry(2, 2);

        const textureLoader = new THREE.TextureLoader();
        this.enemyTextures = {};
        this.enemyWalkTextures = {};
        this.enemyShootTextures = {};

        ENEMY_TYPES.forEach(enemyType => {
            this.enemyTextures[enemyType.id] = textureLoader.load(enemyType.texture);
            this.enemyTextures[enemyType.id].colorSpace = THREE.SRGBColorSpace;

            if (enemyType.textureWalk) {
                this.enemyWalkTextures[enemyType.id] = textureLoader.load(enemyType.textureWalk);
                this.enemyWalkTextures[enemyType.id].colorSpace = THREE.SRGBColorSpace;
            }

            if (enemyType.textureShoot) {
                this.enemyShootTextures[enemyType.id] = textureLoader.load(enemyType.textureShoot);
                this.enemyShootTextures[enemyType.id].colorSpace = THREE.SRGBColorSpace;
            }
        });

        this.genericDeathTexture = textureLoader.load(GENERIC_DEATH_SPRITE_SHEET.texture);
        this.genericDeathTexture.colorSpace = THREE.SRGBColorSpace;
        this.genericDeathTexture.minFilter = THREE.NearestFilter;
        this.genericDeathTexture.magFilter = THREE.NearestFilter;
        this.genericDeathTexture.generateMipmaps = false;
        this.genericDeathTexture.wrapS = THREE.ClampToEdgeWrapping;
        this.genericDeathTexture.wrapT = THREE.ClampToEdgeWrapping;
        this.genericDeathTexture.needsUpdate = true;
        this.genericDeathTextures = (GENERIC_DEATH_SPRITE_SHEET.variantTextures || [])
            .map(texturePath => textureLoader.load(texturePath));
        if (this.genericDeathTextures.length === 0) {
            // Mantener compatibilidad si se elimina o no se configura ninguna
            // variante en el atlas.
            this.genericDeathTextures.push(this.genericDeathTexture);
        }
        this.genericDeathTextures.forEach(texture => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.NearestFilter;
            texture.magFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
        });
        this.genericCorpseTexture = textureLoader.load(
            GENERIC_DEATH_SPRITE_SHEET.corpseTexture
        );
        this.genericCorpseTexture.colorSpace = THREE.SRGBColorSpace;
        this.genericCorpseTexture.minFilter = THREE.NearestFilter;
        this.genericCorpseTexture.magFilter = THREE.NearestFilter;
        this.genericCorpseTexture.generateMipmaps = false;
        this.genericCorpseTexture.wrapS = THREE.ClampToEdgeWrapping;
        this.genericCorpseTexture.wrapT = THREE.ClampToEdgeWrapping;
        this.genericCorpseTexture.needsUpdate = true;
        this.sharedMaterial = null;
        this.lastGenericDeathVariant = -1;

        this.enemyPool = [];
        this.maxPoolSize = 20;
        this.activeEnemies = new Set();
        this.corpses = [];
        this.maxCorpses = Math.max(1, Number(GENERIC_DEATH_SPRITE_SHEET.maxCorpses) || 20);
        this.corpseLifetime = Math.max(
            1000,
            Number(GENERIC_DEATH_SPRITE_SHEET.corpseLifetime) || 12000
        );
        this.spawnHologramDuration = 650;

        this.spawnPoints = [];
        this.walls = world.getWalls();
        this.bloodParticles = new Map();
        // Variantes 3D facetadas para que la sangre no parezca un conjunto de
        // cubos ni de conos. Se mantienen deliberadamente en bajo poligonaje:
        // detail 0 y una esfera de solo 6x4 segmentos.
        this.bloodParticleVariants = [
            {
                id: 'faceted-orb',
                geometry: new THREE.IcosahedronGeometry(0.13, 0)
            },
            {
                id: 'angular-lump',
                geometry: new THREE.DodecahedronGeometry(0.14, 0)
            },
            {
                id: 'faceted-shard',
                geometry: new THREE.OctahedronGeometry(0.16, 0)
            },
            {
                id: 'rounded-lump',
                geometry: new THREE.SphereGeometry(0.14, 6, 4)
            }
        ];
        this.bloodMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc0000,
            transparent: true,
            opacity: 1.0,
            roughness: 0.58,
            metalness: 0.04,
            emissive: 0x220000,
            emissiveIntensity: 0.18,
            flatShading: true
        });
        this.enemyCollisionHelpers = new Map();
        this.projectiles = [];
        this.projectileGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        this.projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        // Proyectil trazador para armas automáticas: cuerpo alargado y punta,
        // en vez de la esfera roja usada por los enemigos básicos.
        this.tracerGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
        this.tracerTipGeometry = new THREE.ConeGeometry(0.085, 0.22, 6);
        this.tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd36a });
        this.tracerTipMaterial = new THREE.MeshBasicMaterial({ color: 0xff6a00 });

        this.activeSoundSources = [];

        // Sistema de proyectiles de sangre parabólicos
        this.bloodProjectiles = [];

        // Partículas de gore de muerte: no dependen del enemigo reutilizable del pool.
        this.goreParticles = [];
        this.goreSprites = [];
        // Texturas compartidas para la nube breve que aparece exactamente en
        // el punto donde impacta cada disparo.
        this.bloodSpriteTextureLoader = textureLoader;
        this.bloodSpriteTextureCache = new Map();

        // Inicializar sistema de decals de sangre
        this.bloodDecalManager = new BloodDecalManager(scene, world);
    }
    // #endregion

    getBloodTexturePaths(bloodType = 'red') {
        return getBloodTexturePathsFn.call(this, bloodType);
    }

    setEnemyDefeatedCallback(callback) {
        this.enemyDefeatedCallback = typeof callback === 'function' ? callback : null;
    }

    removeEnemiesBySpawnerIds(spawnerIds = []) {
        const ids = new Set(
            (Array.isArray(spawnerIds) ? spawnerIds : [spawnerIds])
                .map(id => String(id || '').trim())
                .filter(Boolean)
        );
        if (ids.size === 0) return 0;

        const enemiesToRemove = this.enemies.filter(enemy =>
            ids.has(enemy?.userData?.spawnSourceId)
        );
        const removedEnemies = new Set(enemiesToRemove);

        enemiesToRemove.forEach(enemy => {
            // La limpieza administrativa no cuenta como una baja del jugador
            // ni vuelve a disparar el callback de eventos.
            this.finalizeEnemyRemoval(enemy);
        });

        // Quitar también los proyectiles que ya estaban en vuelo de esos
        // enemigos evita que el patio siga dañando al jugador desde fuera.
        if (removedEnemies.size > 0 && Array.isArray(this.projectiles)) {
            this.projectiles = this.projectiles.filter(projectile => {
                if (!removedEnemies.has(projectile?.userData?.owner)) return true;
                if (projectile?.parent) projectile.parent.remove(projectile);
                return false;
            });
        }

        return enemiesToRemove.length;
    }

    getHitBloodSpritePaths(bloodType = 'red') {
        return getHitBloodSpritePathsFn.call(this, bloodType);
    }

    clampBloodHitPosition(enemy, hitPosition) {
        return clampBloodHitPositionFn.call(this, enemy, hitPosition);
    }

    getBloodColor(enemy) {
        return getBloodColorFn.call(this, enemy);
    }

    createBloodParticleMaterial(color) {
        return createBloodParticleMaterialFn.call(this, color);
    }

    isSpriteSheetEnemy(type) {
        return isSpriteSheetEnemyFn.call(this, type);
    }

    createEnemyMaterial(type) {
        return createEnemyMaterialFn.call(this, type);
    }

    createSpawnHologram(enemy) {
        return createSpawnHologramFn.call(this, enemy);
    }

    startSpawnHologram(enemy) {
        return startSpawnHologramFn.call(this, enemy);
    }

    updateSpawnHologram(enemy, now) {
        return updateSpawnHologramFn.call(this, enemy, now);
    }

    stopSpawnHologram(enemy) {
        return stopSpawnHologramFn.call(this, enemy);
    }

    disposeSpawnHologram(enemy) {
        return disposeSpawnHologramFn.call(this, enemy);
    }

    resetSpriteSheetGeometry(geometry) {
        return resetSpriteSheetGeometryFn.call(this, geometry);
    }

    setEnemySpriteOffset(enemy, type) {
        return setEnemySpriteOffsetFn.call(this, enemy, type);
    }

    setSpriteSheetGeometryFrame(geometry, spriteSheet, animationName, frameIndex) {
        return setSpriteSheetGeometryFrameFn.call(this, geometry, spriteSheet, animationName, frameIndex);
    }

    disposeEnemyMaterial(enemy) {
        return disposeEnemyMaterialFn.call(this, enemy);
    }

    initializeEnemyAnimation(enemy, type) {
        return initializeEnemyAnimationFn.call(this, enemy, type);
    }

    setSpriteSheetFrame(enemy, type, animationName, frameIndex) {
        return setSpriteSheetFrameFn.call(this, enemy, type, animationName, frameIndex);
    }

    updateSpriteSheetAnimation(enemy, type, animationName, delta) {
        return updateSpriteSheetAnimationFn.call(this, enemy, type, animationName, delta);
    }

    setGenericCorpseSprite(enemy) {
        return setGenericCorpseSpriteFn.call(this, enemy);
    }

    selectGenericDeathTexture(enemy) {
        return selectGenericDeathTextureFn.call(this, enemy);
    }

    setGenericDeathSpriteFrame(enemy, frameIndex) {
        return setGenericDeathSpriteFrameFn.call(this, enemy, frameIndex);
    }

    startGenericDeathAnimation(enemy) {
        return startGenericDeathAnimationFn.call(this, enemy);
    }

    updateGenericDeathAnimation(enemy, delta) {
        return updateGenericDeathAnimationFn.call(this, enemy, delta);
    }

    getSpriteSheetAnimationDuration(animation) {
        return getSpriteSheetAnimationDurationFn.call(this, animation);
    }

    updateEnemyVisual(enemy, type, isMoving, now, delta) {
        return updateEnemyVisualFn.call(this, enemy, type, isMoving, now, delta);
    }

    configureBloodEffects(enemy) {
        return configureBloodEffectsFn.call(this, enemy);
    }

    getCachedBloodSpriteTexture(texturePath) {
        return getCachedBloodSpriteTextureFn.call(this, texturePath);
    }

    createHitBloodSpriteCloud(enemy, hitPosition, forwardDirection) {
        return createHitBloodSpriteCloudFn.call(this, enemy, hitPosition, forwardDirection);
    }

    // #region Sistema de Partículas EnemyManager
    createBloodParticles(enemy, hitPosition) {
        return createBloodParticlesFn.call(this, enemy, hitPosition);
    }

    // #region Sistema de Explosión Masiva EnemyManager
    // Descripción: Genera múltiples sprites de sangre y partículas para una explosión visceral al morir.
    spawnMassiveBloodSplash(enemy) {
        return spawnMassiveBloodSplashFn.call(this, enemy);
    }

    spawnGoreShockwave(position, bloodType = 'red') {
        return spawnGoreShockwaveFn.call(this, position, bloodType);
    }

    // #region Sistema de Proyectiles Parabólicos de Sangre EnemyManager
    // Descripción: Genera proyectiles de sangre que siguen una trayectoria parabólica y manchan el suelo.
    spawnBloodProjectiles(enemy) {
        return spawnBloodProjectilesFn.call(this, enemy);
    }

    // Crear partícula de estela
    spawnTrailParticle(position, texture) {
        return spawnTrailParticleFn.call(this, position, texture);
    }

    updateBloodProjectiles(delta) {
        return updateBloodProjectilesFn.call(this, delta);
    }
    // #endregion

    updateBloodParticles(enemy, delta) {
        return updateBloodParticlesFn.call(this, enemy, delta);
    }

    updateGoreParticles(delta) {
        return updateGoreParticlesFn.call(this, delta);
    }

    updateGoreSprites(delta) {
        return updateGoreSpritesFn.call(this, delta);
    }

    clearBloodParticles(enemy) {
        return clearBloodParticlesFn.call(this, enemy);
    }
    // #endregion

    // #region Helpers EnemyManager
    getSpawnCollisionObjects() {
        const collisionObjects = new Set();
        const addObjects = (objects) => {
            if (!objects) return;

            objects.forEach(object => {
                if (object?.userData?.boundingBox) {
                    collisionObjects.add(object);
                }
            });
        };

        addObjects(this.walls);
        addObjects(this.world?.getStaticModels?.());
        addObjects(this.world?.getSolidObjects?.());

        return [...collisionObjects];
    }

    getEnemyCollisionObjects() {
        const collisionObjects = this.getSpawnCollisionObjects();
        const knownObjects = new Set(collisionObjects);

        // Las puertas no forman parte de walls porque su collider cambia de
        // altura al abrirse. Mantenerlas aquí permite que un enemigo también
        // pueda rodearlas mientras están cerradas o en transición.
        const doorMeshes = this.world?.getDoorMeshes?.() || [];
        doorMeshes.forEach(doorMesh => {
            const doorData = doorMesh?.userData;
            if (!doorMesh || !doorData || doorData.targetY === undefined ||
                doorData.closedY === undefined) {
                return;
            }

            const isMoving = Math.abs(doorMesh.position.y - doorData.targetY) > 0.001;
            const isClosedOrClosing = doorData.targetY <= doorData.closedY + 0.001 || isMoving;
            if (!isClosedOrClosing) return;

            doorMesh.updateMatrixWorld(true);
            const doorBox = new THREE.Box3().setFromObject(doorMesh);
            doorBox.min.x -= 0.2;
            doorBox.max.x += 0.2;
            doorBox.min.z -= 0.2;
            doorBox.max.z += 0.2;
            doorMesh.userData.boundingBox = doorBox;

            if (!knownObjects.has(doorMesh) && !doorBox.isEmpty()) {
                collisionObjects.push(doorMesh);
                knownObjects.add(doorMesh);
            }
        });

        return collisionObjects;
    }

    getEnemyCollisionBox(position, size, target = new THREE.Box3()) {
        target.min.set(
            position.x - size.x,
            position.y - size.y * 0.5,
            position.z - size.z
        );
        target.max.set(
            position.x + size.x,
            position.y + size.y * 0.5,
            position.z + size.z
        );
        return target;
    }

    enemyRangesOverlap(minA, maxA, minB, maxB) {
        return Math.min(maxA, maxB) - Math.max(minA, minB) > 0.001;
    }

    resolveEnemyPenetration(position, size, collisionObjects) {
        const separation = 0.03;
        let recovered = false;

        // Recuperar enemigos que pudieran haber heredado una posición dentro
        // de un prop tras un cambio de mapa, escala o collider.
        for (let iteration = 0; iteration < 6; iteration++) {
            const enemyBox = this.getEnemyCollisionBox(position, size);
            let bestResolution = null;

            for (const object of collisionObjects) {
                const box = object?.userData?.boundingBox;
                if (!box || box.isEmpty()) continue;

                const overlapX = Math.min(enemyBox.max.x, box.max.x) - Math.max(enemyBox.min.x, box.min.x);
                const overlapY = Math.min(enemyBox.max.y, box.max.y) - Math.max(enemyBox.min.y, box.min.y);
                const overlapZ = Math.min(enemyBox.max.z, box.max.z) - Math.max(enemyBox.min.z, box.min.z);
                if (overlapX <= 0.001 || overlapY <= 0.001 || overlapZ <= 0.001) continue;

                const enemyCenterX = (enemyBox.min.x + enemyBox.max.x) * 0.5;
                const enemyCenterZ = (enemyBox.min.z + enemyBox.max.z) * 0.5;
                const boxCenterX = (box.min.x + box.max.x) * 0.5;
                const boxCenterZ = (box.min.z + box.max.z) * 0.5;
                const axis = overlapX <= overlapZ ? 'x' : 'z';
                const overlap = axis === 'x' ? overlapX : overlapZ;
                const direction = axis === 'x'
                    ? (enemyCenterX < boxCenterX ? -1 : 1)
                    : (enemyCenterZ < boxCenterZ ? -1 : 1);
                const amount = direction * (overlap + separation);

                if (!bestResolution || Math.abs(amount) < Math.abs(bestResolution.amount)) {
                    bestResolution = { axis, amount };
                }
            }

            if (!bestResolution) break;

            position[bestResolution.axis] += bestResolution.amount;
            recovered = true;
        }

        return recovered;
    }

    moveEnemyAlongAxis(position, size, axis, amount, collisionObjects) {
        if (Math.abs(amount) < 0.000001) return false;

        const halfSize = axis === 'y' ? size.y * 0.5 : size[axis];
        const start = position[axis];
        const desired = start + amount;
        const direction = Math.sign(amount);
        const separation = 0.02;
        let resolved = desired;
        let blocked = false;
        const currentBox = this.getEnemyCollisionBox(position, size);

        for (const object of collisionObjects) {
            const box = object?.userData?.boundingBox;
            if (!box || box.isEmpty()) continue;

            let overlapsOtherAxes = true;
            for (const otherAxis of ['x', 'y', 'z']) {
                if (otherAxis === axis) continue;

                if (!this.enemyRangesOverlap(
                    currentBox.min[otherAxis],
                    currentBox.max[otherAxis],
                    box.min[otherAxis],
                    box.max[otherAxis]
                )) {
                    overlapsOtherAxes = false;
                    break;
                }
            }
            if (!overlapsOtherAxes) continue;

            const expandedMin = box.min[axis] - halfSize;
            const expandedMax = box.max[axis] + halfSize;

            // Detectar el cruce del volumen ampliado evita atravesar un prop
            // en un frame y permite que el siguiente eje se convierta en la
            // dirección de deslizamiento.
            if (direction > 0 && start <= expandedMin && desired > expandedMin) {
                resolved = Math.min(resolved, expandedMin - separation);
                blocked = true;
            } else if (direction < 0 && start >= expandedMax && desired < expandedMax) {
                resolved = Math.max(resolved, expandedMax + separation);
                blocked = true;
            }
        }

        position[axis] = resolved;
        return blocked;
    }

    moveEnemyWithSlide(enemy, movement, collisionObjects) {
        const size = enemy.userData.collisionSize;
        if (!size) return { horizontalMoved: false, verticalBlocked: false };

        const recovered = this.resolveEnemyPenetration(enemy.position, size, collisionObjects);
        const largestMovement = Math.max(
            Math.abs(movement.x),
            Math.abs(movement.y),
            Math.abs(movement.z)
        );
        const maxStepDistance = 0.35;
        const stepCount = Math.max(1, Math.min(64, Math.ceil(largestMovement / maxStepDistance)));
        const stepMovement = movement.clone().multiplyScalar(1 / stepCount);
        let horizontalMoved = recovered;
        let verticalBlocked = false;

        for (let step = 0; step < stepCount; step++) {
            const horizontalStepLength = Math.hypot(stepMovement.x, stepMovement.z);
            let xBlocked = false;
            let zBlocked = false;

            // Resolver primero X y luego Z conserva la componente tangencial
            // del movimiento cuando el enemigo roza un prop.
            if (Math.abs(stepMovement.x) > 0.000001) {
                xBlocked = this.moveEnemyAlongAxis(
                    enemy.position,
                    size,
                    'x',
                    stepMovement.x,
                    collisionObjects
                );
                if (!xBlocked) horizontalMoved = true;
            }

            if (xBlocked && horizontalStepLength > 0.000001) {
                // Si el enemigo queda de frente a un prop, la dirección hacia
                // el jugador puede no tener componente lateral. Generar un
                // pequeño desplazamiento tangencial evita que se quede fijo.
                const slideAxis = 'z';
                const storedDirection = enemy.userData.slideAxis === slideAxis
                    ? enemy.userData.slideDirection
                    : 0;
                const preferredDirection = storedDirection || Math.sign(stepMovement.z) || 1;
                const slideDistance = horizontalStepLength;
                const slideDirections = [preferredDirection, -preferredDirection];
                let slid = false;

                for (const slideDirection of slideDirections) {
                    const blocked = this.moveEnemyAlongAxis(
                        enemy.position,
                        size,
                        slideAxis,
                        slideDirection * slideDistance,
                        collisionObjects
                    );
                    if (!blocked) {
                        enemy.userData.slideAxis = slideAxis;
                        enemy.userData.slideDirection = slideDirection;
                        horizontalMoved = true;
                        slid = true;
                        break;
                    }
                }

                if (!slid) {
                    enemy.userData.slideAxis = slideAxis;
                    enemy.userData.slideDirection = preferredDirection;
                }
            } else if (!xBlocked && Math.abs(stepMovement.z) > 0.000001) {
                zBlocked = this.moveEnemyAlongAxis(
                    enemy.position,
                    size,
                    'z',
                    stepMovement.z,
                    collisionObjects
                );
                if (!zBlocked) {
                    horizontalMoved = true;
                } else if (Math.abs(stepMovement.x) > 0.000001) {
                    // Z es el eje bloqueado: la componente X ya recorrida es
                    // el deslizamiento natural por el lateral del obstáculo.
                    enemy.userData.slideAxis = 'x';
                    enemy.userData.slideDirection = Math.sign(stepMovement.x);
                } else if (horizontalStepLength > 0.000001) {
                    // Si la dirección era exactamente frontal en Z, producir
                    // también un lateral para poder rodear el prop.
                    const slideAxis = 'x';
                    const storedDirection = enemy.userData.slideAxis === slideAxis
                        ? enemy.userData.slideDirection
                        : 0;
                    const preferredDirection = storedDirection || 1;
                    const slideDirections = [preferredDirection, -preferredDirection];

                    for (const slideDirection of slideDirections) {
                        const blocked = this.moveEnemyAlongAxis(
                            enemy.position,
                            size,
                            slideAxis,
                            slideDirection * horizontalStepLength,
                            collisionObjects
                        );
                        if (!blocked) {
                            enemy.userData.slideAxis = slideAxis;
                            enemy.userData.slideDirection = slideDirection;
                            horizontalMoved = true;
                            break;
                        }
                    }
                }
            } else if (!xBlocked) {
                // El trayecto está despejado; olvidar el sentido lateral
                // anterior para que no influya en el siguiente obstáculo.
                enemy.userData.slideAxis = null;
                enemy.userData.slideDirection = 0;
            }

            if (Math.abs(stepMovement.y) > 0.000001) {
                const blocked = this.moveEnemyAlongAxis(
                    enemy.position,
                    size,
                    'y',
                    stepMovement.y,
                    collisionObjects
                );
                verticalBlocked = verticalBlocked || blocked;
            }
        }

        return { horizontalMoved, verticalBlocked };
    }

    getEnemySpawnBox(position, enemyType) {
        const width = enemyType?.width || 2.0;
        const height = enemyType?.height || 2.0;
        const halfWidth = width * 0.2 + 0.25;
        const centerY = position.y === 1 ? height / 2 : position.y;

        return new THREE.Box3(
            new THREE.Vector3(
                position.x - halfWidth,
                centerY - height / 2 - 0.25,
                position.z - halfWidth
            ),
            new THREE.Vector3(
                position.x + halfWidth,
                centerY + height / 2 + 0.25,
                position.z + halfWidth
            )
        );
    }

    isSpawnPositionClear(position, enemyType) {
        if (!position) return false;

        const enemyBox = this.getEnemySpawnBox(position, enemyType);
        return this.getSpawnCollisionObjects().every(object =>
            !enemyBox.intersectsBox(object.userData.boundingBox)
        );
    }

    findSafeSpawnPosition(position, enemyType) {
        if (!position) return null;

        const candidates = [position.clone()];
        const maxSearchRadius = 4;
        const candidateCount = 16;

        // Intentar primero una pequeña variación para conservar la separación
        // visual entre enemigos, y después buscar alrededor del spawner si la
        // variación cae junto a un prop.
        for (let i = 0; i < candidateCount; i++) {
            const angle = (i / candidateCount) * Math.PI * 2;
            const radius = 1 + (i % 4) * (maxSearchRadius - 1) / 3;
            candidates.unshift(position.clone().add(
                new THREE.Vector3(
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius
                )
            ));
        }

        candidates.unshift(position.clone().add(
            new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                0,
                (Math.random() - 0.5) * 2
            )
        ));

        return candidates.find(candidate =>
            this.isSpawnPositionClear(candidate, enemyType)
        ) || null;
    }

    getRandomEnemyType() {
        const rarePera = ENEMY_TYPES.find(enemyType => enemyType.id === 'pera');
        const peraChance = Number(rarePera?.spawnChance);
        if (
            rarePera &&
            Number.isFinite(peraChance) &&
            peraChance > 0 &&
            Math.random() < Math.min(1, peraChance)
        ) {
            return rarePera;
        }

        const weightedTypes = [];
        ENEMY_TYPES.filter(enemyType => enemyType.spawnWeight > 0 && enemyType.id !== 'pera').forEach(enemyType => {
            for (let i = 0; i < enemyType.spawnWeight; i++) {
                weightedTypes.push(enemyType);
            }
        });
        return weightedTypes[Math.floor(Math.random() * weightedTypes.length)];
    }

    getEnemyMovementSpeed(enemyType) {
        const configuredMinimum = Number(CONFIG.ENEMY_MIN_SPEED);
        const minimumSpeed = Number.isFinite(configuredMinimum) && configuredMinimum > 0
            ? configuredMinimum
            : 0.01;
        const configuredMultiplier = Number(CONFIG.ENEMY_SPEED_MULTIPLIER);
        const multiplier = Number.isFinite(configuredMultiplier) && configuredMultiplier > 0
            ? configuredMultiplier
            : 0.5;
        const configuredSpeed = Number(enemyType?.speed);
        const baseSpeed = Number.isFinite(configuredSpeed)
            ? configuredSpeed
            : minimumSpeed;

        return Math.max(minimumSpeed, baseSpeed * multiplier);
    }

    initializeEnemyMovement(enemy, type) {
        const movementBehavior = type?.movementBehavior || 'chase_attack';
        enemy.userData.movementBehavior = movementBehavior;
        enemy.userData.isCivilian = movementBehavior === 'wander_flee';
        enemy.userData.canAttackPlayer = !enemy.userData.isCivilian;
        enemy.userData.fleeDistance = Number(type?.fleeDistance) > 0
            ? Number(type.fleeDistance)
            : 7.0;
        enemy.userData.fleeSpeedMultiplier = Number(type?.fleeSpeedMultiplier) > 0
            ? Number(type.fleeSpeedMultiplier)
            : 1.35;
        enemy.userData.wanderRadius = Number(type?.wanderRadius) > 0
            ? Number(type.wanderRadius)
            : 12.0;
        enemy.userData.wanderTimer = 0;
        enemy.userData.isFleeing = false;
        enemy.userData.wanderOrigin = enemy.userData.wanderOrigin || new THREE.Vector3();
        enemy.userData.wanderDirection = enemy.userData.wanderDirection || new THREE.Vector3();
        enemy.userData.wanderOrigin.set(0, 0, 0);
        enemy.userData.wanderDirection.set(0, 0, 0);
    }

    chooseCivilianWanderDirection(enemy) {
        if (!enemy?.userData?.isCivilian || !enemy.userData.wanderDirection) return;

        const angle = Math.random() * Math.PI * 2;
        enemy.userData.wanderDirection.set(Math.cos(angle), 0, Math.sin(angle));
        enemy.userData.wanderTimer = 0.8 + Math.random() * 1.6;
    }

    getEnemyMovementPlan(enemy, playerPos, delta) {
        const direction = new THREE.Vector3();

        if (!enemy.userData.isCivilian) {
            direction.subVectors(playerPos, enemy.position);
            direction.y = 0;
            if (direction.lengthSq() > 0.0001) direction.normalize();
            return { direction, speedMultiplier: 1.0 };
        }

        const data = enemy.userData;
        const toPlayerX = playerPos.x - enemy.position.x;
        const toPlayerZ = playerPos.z - enemy.position.z;
        const playerDistanceSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;
        const fleeDistanceSq = data.fleeDistance * data.fleeDistance;

        // El jugador no daña ni bloquea a los civiles, pero al acercarse
        // demasiado hace que huyan en dirección opuesta.
        if (playerDistanceSq > 0.0001 && playerDistanceSq < fleeDistanceSq) {
            direction.set(-toPlayerX, 0, -toPlayerZ).normalize();
            data.isFleeing = true;
            return {
                direction,
                speedMultiplier: data.fleeSpeedMultiplier
            };
        }

        data.isFleeing = false;
        const origin = data.wanderOrigin || enemy.position;
        const fromOriginX = enemy.position.x - origin.x;
        const fromOriginZ = enemy.position.z - origin.z;
        const originDistanceSq = fromOriginX * fromOriginX + fromOriginZ * fromOriginZ;
        const wanderRadiusSq = data.wanderRadius * data.wanderRadius;

        // Mantenerlos cerca del punto donde aparecieron evita que el paseo
        // aleatorio los saque del área jugable.
        if (originDistanceSq > wanderRadiusSq) {
            direction.set(-fromOriginX, 0, -fromOriginZ).normalize();
            return { direction, speedMultiplier: 1.0 };
        }

        data.wanderTimer -= delta;
        if (data.wanderTimer <= 0 || data.wanderDirection.lengthSq() < 0.0001) {
            this.chooseCivilianWanderDirection(enemy);
        }

        direction.copy(data.wanderDirection).normalize();
        return { direction, speedMultiplier: 1.0 };
    }
    // #endregion

    // #region Pool de Enemigos EnemyManager
    getEnemyFromPool(enemyType = null) {
        const type = enemyType ||
            this.getRandomEnemyType();

        const width = type.width || 2.0;
        const height = type.height || 2.0;

        const isShooter = type.isShooter || false;
        const shootRate = type.shootRate || 2000;
        const projSpeed = type.projectileSpeed || 15.0;
        const projSize = type.projectileSize || 0.3;
        const burstCount = Math.max(1, Number(type.burstCount) || 1);
        const burstInterval = Math.max(1, Number(type.burstInterval) || 100);
        const burstCooldown = Math.max(0, Number(type.burstCooldown) || shootRate);
        const shotVisualDuration = Math.max(
            1,
            Number(type.shotVisualDuration) || (burstCount > 1 ? burstInterval * 2 : 700)
        );
        const projectileSideOffset = Number(type.projectileSideOffset) || 0;
        const spawnTime = performance.now();

        if (this.enemyPool.length > 0) {
            const enemy = this.enemyPool.pop();
            this.disposeEnemyMaterial(enemy);
            // Cada enemigo necesita sus propias UV: el frame de un alien no
            // debe cambiar el frame de otro enemigo reutilizado del pool.
            if (enemy.geometry === this.sharedGeometry) {
                enemy.geometry = this.sharedGeometry.clone();
            }
            this.resetSpriteSheetGeometry(enemy.geometry);
            enemy.visible = true;
            enemy.userData.hp = type.hp;
            enemy.userData.maxHp = type.hp;
            enemy.userData.speed = this.getEnemyMovementSpeed(type);
            enemy.userData.damage = type.damage;
            enemy.userData.enemyType = type.id;
            this.initializeEnemyMovement(enemy, type);
            enemy.userData.bloodType = type.bloodType || 'red';
            enemy.userData.bloodColor = type.bloodColor ?? 0xcc0000;
            enemy.userData.bloodTime = 0;
            enemy.userData.velocity = new THREE.Vector3();
            enemy.userData.canJump = false;
            enemy.userData.lastMeleeAttackTime = 0;

            // Intervalo aleatorio entre 5 y 7 segundos + desfase inicial
            enemy.userData.soundInterval = AUDIO_CONFIG.ENEMY_SOUND_MIN_INTERVAL +
                Math.random() * (AUDIO_CONFIG.ENEMY_SOUND_MAX_INTERVAL - AUDIO_CONFIG.ENEMY_SOUND_MIN_INTERVAL);
            enemy.userData.lastSoundTime = performance.now() - Math.random() * 3000;

            enemy.userData.isShooter = isShooter;
            enemy.userData.shootRate = shootRate;
            enemy.userData.projectileSpeed = projSpeed;
            enemy.userData.projectileSize = projSize;
            enemy.userData.lastShootTime = spawnTime;
            enemy.userData.projectileOffsetX = type.projectileOffsetX || 0;
            enemy.userData.projectileOffsetY = type.projectileOffsetY || 0;
            enemy.userData.projectileOffsetZ = type.projectileOffsetZ || 0;
            enemy.userData.projectileSideOffset = projectileSideOffset;
            enemy.userData.burstCount = burstCount;
            enemy.userData.burstInterval = burstInterval;
            enemy.userData.burstCooldown = burstCooldown;
            enemy.userData.shotVisualDuration = shotVisualDuration;
            enemy.userData.burstShotsRemaining = 0;
            enemy.userData.nextBurstShotAt = 0;
            enemy.userData.nextBurstAt = spawnTime + shootRate;
            enemy.userData.burstShotIndex = 0;
            enemy.userData.shootingToken = (enemy.userData.shootingToken || 0) + 1;

            enemy.userData.walkAnimTimer = 0;
            enemy.userData.walkAnimState = false;
            enemy.userData.isShooting = false;
            enemy.userData.isDying = false;
            enemy.userData.isCorpse = false;
            enemy.userData.isHormigueroPatioEnemy = false;
            enemy.userData.defeatReported = false;
            enemy.userData.usingGenericDeathAnimation = false;
            enemy.userData.genericDeathFrame = 0;
            enemy.userData.genericDeathTimer = 0;
            enemy.userData.genericDeathTexture = null;
            enemy.userData.genericDeathVariant = -1;
            enemy.userData.slideAxis = null;
            enemy.userData.slideDirection = 0;

            enemy.scale.set(width / 2.0, height / 2.0, 1.0);
            this.setEnemySpriteOffset(enemy, type);
            enemy.material = this.createEnemyMaterial(type);
            this.initializeEnemyAnimation(enemy, type);
            this.clearBloodParticles(enemy);
            this.configureBloodEffects(enemy);

            if (!this.enemyCollisionHelpers.has(enemy)) {
                const box = new THREE.Box3();
                const helper = new THREE.Box3Helper(box, 0x00ff00);
                helper.visible = CONFIG.DEBUG_SHOW_HITBOXES;
                this.scene.add(helper);
                this.enemyCollisionHelpers.set(enemy, helper);
            } else {
                this.enemyCollisionHelpers.get(enemy).visible = CONFIG.DEBUG_SHOW_HITBOXES;
            }

            enemy.userData.collisionSize = { x: width * 0.2, y: height, z: width * 0.2 };
            return enemy;
        }

        const enemyMaterial = this.createEnemyMaterial(type);
        const enemy = new THREE.Mesh(this.sharedGeometry.clone(), enemyMaterial);
        this.resetSpriteSheetGeometry(enemy.geometry);
        enemy.scale.set(width / 2.0, height / 2.0, 1.0);
        this.setEnemySpriteOffset(enemy, type);

        enemy.matrixAutoUpdate = true;
        enemy.userData.hp = type.hp;
        enemy.userData.maxHp = type.hp;
        enemy.userData.speed = this.getEnemyMovementSpeed(type);
        enemy.userData.damage = type.damage;
        enemy.userData.enemyType = type.id;
        this.initializeEnemyMovement(enemy, type);
        enemy.userData.bloodType = type.bloodType || 'red';
        enemy.userData.bloodColor = type.bloodColor ?? 0xcc0000;
        enemy.userData.bloodTime = 0;
        enemy.userData.velocity = new THREE.Vector3();
        enemy.userData.canJump = false;
        enemy.userData.lastMeleeAttackTime = 0;

        // Intervalo aleatorio entre 5 y 7 segundos + desfase inicial
        enemy.userData.soundInterval = AUDIO_CONFIG.ENEMY_SOUND_MIN_INTERVAL +
            Math.random() * (AUDIO_CONFIG.ENEMY_SOUND_MAX_INTERVAL - AUDIO_CONFIG.ENEMY_SOUND_MIN_INTERVAL);
        enemy.userData.lastSoundTime = performance.now() - Math.random() * 3000;

        enemy.userData.isShooter = isShooter;
        enemy.userData.shootRate = shootRate;
        enemy.userData.projectileSpeed = projSpeed;
        enemy.userData.projectileSize = projSize;
        enemy.userData.lastShootTime = spawnTime;

        enemy.userData.projectileOffsetX = type.projectileOffsetX || 0;
        enemy.userData.projectileOffsetY = type.projectileOffsetY || 0;
        enemy.userData.projectileOffsetZ = type.projectileOffsetZ || 0;
        enemy.userData.projectileSideOffset = projectileSideOffset;
        enemy.userData.burstCount = burstCount;
        enemy.userData.burstInterval = burstInterval;
        enemy.userData.burstCooldown = burstCooldown;
        enemy.userData.shotVisualDuration = shotVisualDuration;
        enemy.userData.burstShotsRemaining = 0;
        enemy.userData.nextBurstShotAt = 0;
        enemy.userData.nextBurstAt = spawnTime + shootRate;
        enemy.userData.burstShotIndex = 0;

        enemy.userData.walkAnimTimer = 0;
        enemy.userData.walkAnimState = false;
        enemy.userData.shootingToken = (enemy.userData.shootingToken || 0) + 1;
        enemy.userData.isShooting = false;
        enemy.userData.isDying = false;
        enemy.userData.isCorpse = false;
        enemy.userData.isHormigueroPatioEnemy = false;
        enemy.userData.defeatReported = false;
        enemy.userData.usingGenericDeathAnimation = false;
        enemy.userData.genericDeathFrame = 0;
        enemy.userData.genericDeathTimer = 0;
        enemy.userData.genericDeathTexture = null;
        enemy.userData.genericDeathVariant = -1;
        enemy.userData.slideAxis = null;
        enemy.userData.slideDirection = 0;

        this.initializeEnemyAnimation(enemy, type);

        this.configureBloodEffects(enemy);
        enemy.userData.collisionSize = { x: width * 0.2, y: height, z: width * 0.2 };

        const helperBox = new THREE.Box3();
        const helper = new THREE.Box3Helper(helperBox, 0x00ff00);
        helper.visible = CONFIG.DEBUG_SHOW_HITBOXES;
        this.scene.add(helper);
        this.enemyCollisionHelpers.set(enemy, helper);

        return enemy;
    }

    returnEnemyToPool(enemy) {
        enemy.visible = false;
        enemy.userData.hp = 200;
        enemy.userData.velocity.set(0, 0, 0);
        enemy.userData.walkAnimTimer = 0;
        enemy.userData.walkAnimState = false;
        enemy.userData.shootingToken = (enemy.userData.shootingToken || 0) + 1;
        enemy.userData.isShooting = false;
        enemy.userData.isDying = false;
        enemy.userData.isCorpse = false;
        enemy.userData.isHormigueroPatioEnemy = false;
        enemy.userData.defeatReported = false;
        enemy.userData.usingGenericDeathAnimation = false;
        enemy.userData.genericDeathFrame = 0;
        enemy.userData.genericDeathTimer = 0;
        enemy.userData.genericDeathTexture = null;
        enemy.userData.genericDeathVariant = -1;
        enemy.userData.corpseExpiresAt = 0;
        enemy.userData.animationName = null;
        enemy.userData.animationFrame = 0;
        enemy.userData.animationTimer = 0;
        enemy.userData.attackAnimUntil = 0;
        enemy.userData.deathEndsAt = 0;
        enemy.userData.burstShotsRemaining = 0;
        enemy.userData.nextBurstShotAt = 0;
        enemy.userData.nextBurstAt = 0;
        enemy.userData.burstShotIndex = 0;
        enemy.userData.slideAxis = null;
        enemy.userData.slideDirection = 0;
        enemy.userData.spawnHologramStartedAt = 0;
        enemy.userData.spawnHologramUntil = 0;
        this.stopSpawnHologram(enemy);

        this.clearBloodParticles(enemy);

        // Hide the collision helper when returning to pool
        if (this.enemyCollisionHelpers.has(enemy)) {
            const helper = this.enemyCollisionHelpers.get(enemy);
            helper.visible = false; // Always hide when in pool
        }

        if (this.enemyPool.length < this.maxPoolSize) {
            this.enemyPool.push(enemy);
        } else {
            // If pool is full, properly dispose of the enemy
            if (this.enemyCollisionHelpers.has(enemy)) {
                const helper = this.enemyCollisionHelpers.get(enemy);
                this.scene.remove(helper);
                this.enemyCollisionHelpers.delete(enemy);
            }
            this.disposeEnemyMaterial(enemy);
            if (enemy.geometry && enemy.geometry !== this.sharedGeometry) {
                enemy.geometry.dispose();
            }
            if (enemy.parent) this.scene.remove(enemy);
        }
    }
    // #endregion

    setCollisionDebugVisible(visible) {
        const shouldShow = Boolean(visible);
        CONFIG.DEBUG_SHOW_HITBOXES = shouldShow;

        this.enemyCollisionHelpers.forEach((helper, enemy) => {
            helper.visible = shouldShow && enemy.visible;

            if (!helper.visible || !enemy.userData.collisionSize) return;

            const size = enemy.userData.collisionSize;
            helper.box.min.set(
                enemy.position.x - size.x,
                enemy.position.y - size.y * 0.5,
                enemy.position.z - size.z
            );
            helper.box.max.set(
                enemy.position.x + size.x,
                enemy.position.y + size.y * 0.5,
                enemy.position.z + size.z
            );
            helper.updateMatrixWorld(true);
        });
    }

    // #region Sistema de Spawning EnemyManager
    // Descripción: Lógica para instanciar enemigos en el juego, controlando tipos, posiciones y límites de población.
    spawn(time, specificType = null, specificPosition = null) {
        if (!specificPosition && time - this.lastSpawnTime <= CONFIG.ENEMY_SPAWN_RATE) {
            return null;
        }

        const enemyType = specificType || this.getRandomEnemyType();

        const requestedSpawnPoint = specificPosition
            ? specificPosition
            : (this.spawnPoints.length > 0
                ? this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)].position
                : new THREE.Vector3(
                    (Math.random() - 0.5) * 100,
                    1,
                    (Math.random() - 0.5) * 100
                ));
        const spawnPoint = this.findSafeSpawnPosition(requestedSpawnPoint, enemyType);

        if (!spawnPoint) {
            console.warn(`Spawn cancelado: no hay espacio libre cerca de (${requestedSpawnPoint.x.toFixed(1)}, ${requestedSpawnPoint.z.toFixed(1)})`);
            return null;
        }

        const enemy = this.getEnemyFromPool(enemyType);

        const spawnHeight = (enemyType.height || 2.0) / 2.0;
        enemy.position.copy(spawnPoint);

        if (specificPosition && specificPosition.y === 1) {
            enemy.position.y = spawnHeight;
        } else if (!specificPosition) {
            enemy.position.y = spawnHeight;
        }

        if (enemy.userData.wanderOrigin) {
            enemy.userData.wanderOrigin.copy(enemy.position);
        }
        this.chooseCivilianWanderDirection(enemy);

        enemy.visible = true;
        if (!this.activeEnemies.has(enemy)) {
            this.scene.add(enemy);
            this.enemies.push(enemy);
            this.activeEnemies.add(enemy);
        }

        this.startSpawnHologram(enemy);

        if (this.audioManager) {
            this.audioManager.playSound(
                'enemySpawnTeleport',
                0.35,
                false,
                0.95 + Math.random() * 0.1
            );
        }

        if (this.audioManager) {
            this.audioManager.playRandomEnemySound(enemyType);
        }

        if (!specificPosition) {
            this.lastSpawnTime = time;
        }

        return enemy;
    }
    // #endregion

    // #region Sistema de Proyectiles EnemyManager
    // Descripción: Gestiona el disparo de proyectiles por parte de los enemigos, configurando su dirección, velocidad y daño.
    playEnemyShotSound(enemy, listenerPos, typeInfo, now) {
        const soundName = typeInfo?.shootSound;
        if (!soundName || !this.audioManager || !listenerPos) return;

        const soundVolume = Number.isFinite(typeInfo?.shootSoundVolume)
            ? Math.max(0, typeInfo.shootSoundVolume)
            : 1.0;

        const source = this.audioManager.play3DSound(
            soundName,
            listenerPos,
            enemy.position,
            AUDIO_CONFIG.ENEMY_SOUND_DISTANCE,
            soundVolume,
            false,
            1.0
        );
        if (!source) return;

        source.startTime = now;
        this.activeSoundSources.push(source);
        source.onended = () => {
            const index = this.activeSoundSources.indexOf(source);
            if (index >= 0) this.activeSoundSources.splice(index, 1);
        };
    }

    createProjectileMesh(size, direction, model = 'orb') {
        if (model !== 'tracer') {
            const projectile = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
            projectile.scale.setScalar(size / 0.3);
            return projectile;
        }

        const projectile = new THREE.Group();
        const tracerLength = Math.max(0.48, size * 4.5);
        const tipHeight = Math.max(0.16, size * 1.25);
        // `size` es el radio de colisión; el calibre visible debe ser mucho
        // menor para que la bala parezca un trazador y no una esfera alargada.
        const tracerRadius = Math.max(0.018, size * 0.2);
        const tipRadius = tracerRadius * 1.35;

        const shaft = new THREE.Mesh(this.tracerGeometry, this.tracerMaterial);
        shaft.scale.set(tracerRadius / 0.05, tracerLength, tracerRadius / 0.05);
        projectile.add(shaft);

        const tip = new THREE.Mesh(this.tracerTipGeometry, this.tracerTipMaterial);
        tip.scale.set(tipRadius / 0.085, tipHeight / 0.22, tipRadius / 0.085);
        tip.position.y = tracerLength * 0.5 + tipHeight * 0.5 - 0.03;
        projectile.add(tip);

        projectile.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction
        );
        return projectile;
    }

    updateEnemyShooting(enemy, playerPos, now) {
        if (!enemy?.userData?.isShooter) return;

        const target = playerPos.clone();
        target.y -= 0.5;
        const typeInfo = ENEMY_TYPES.find(type => type.id === enemy.userData.enemyType);

        if (enemy.userData.burstCount > 1) {
            if (
                enemy.userData.burstShotsRemaining <= 0 &&
                now >= enemy.userData.nextBurstAt
            ) {
                enemy.userData.burstShotsRemaining = enemy.userData.burstCount;
                enemy.userData.burstShotIndex = 0;
                enemy.userData.nextBurstShotAt = now;
                enemy.userData.nextBurstAt = now + enemy.userData.burstCooldown;
            }

            if (
                enemy.userData.burstShotsRemaining > 0 &&
                now >= enemy.userData.nextBurstShotAt
            ) {
                this.shootProjectile(
                    enemy,
                    target,
                    enemy.userData.burstShotIndex,
                    playerPos,
                    now
                );
                enemy.userData.burstShotIndex += 1;
                enemy.userData.burstShotsRemaining -= 1;
                enemy.userData.nextBurstShotAt = now + enemy.userData.burstInterval;
            }
            return;
        }

        if (now - enemy.userData.lastShootTime > enemy.userData.shootRate) {
            this.shootProjectile(enemy, target, 0, playerPos, now);
            enemy.userData.lastShootTime = now;
        }
    }

    shootProjectile(enemy, targetPos, shotIndex = 0, listenerPos = null, now = performance.now()) {
        const size = enemy.userData.projectileSize ||
            0.3;
        const typeInfo = ENEMY_TYPES.find(type => type.id === enemy.userData.enemyType);
        this.playEnemyShotSound(enemy, listenerPos, typeInfo, now);
        const spawnPos = new THREE.Vector3(
            enemy.position.x + enemy.userData.projectileOffsetX,
            enemy.position.y + enemy.userData.projectileOffsetY,
            enemy.position.z + enemy.userData.projectileOffsetZ
        );

        // Los proyectiles de la minigun salen alternativamente de cada brazo,
        // usando el eje horizontal relativo a la dirección de apuntado.
        const sideOffset = enemy.userData.projectileSideOffset || 0;
        if (sideOffset > 0) {
            const aim = new THREE.Vector3(
                targetPos.x - enemy.position.x,
                0,
                targetPos.z - enemy.position.z
            );
            if (aim.lengthSq() > 0.0001) {
                aim.normalize();
                const right = new THREE.Vector3(-aim.z, 0, aim.x);
                const side = Math.floor(shotIndex) % 2 === 0 ? -1 : 1;
                spawnPos.addScaledVector(right, side * sideOffset);
            }
        }

        const direction = new THREE.Vector3().subVectors(targetPos, spawnPos).normalize();
        const projectile = this.createProjectileMesh(
            size,
            direction,
            typeInfo?.projectileModel || 'orb'
        );
        projectile.position.copy(spawnPos);

        projectile.userData = {
            velocity: direction.multiplyScalar(enemy.userData.projectileSpeed),
            damage: enemy.userData.damage,
            radius: size,
            owner: enemy
        };
        this.scene.add(projectile);
        this.projectiles.push(projectile);

        enemy.userData.isShooting = true;
        const shootingToken = (enemy.userData.shootingToken || 0) + 1;
        enemy.userData.shootingToken = shootingToken;
        if (!this.isSpriteSheetEnemy(typeInfo) && this.enemyShootTextures[enemy.userData.enemyType]) {
            enemy.material.map = this.enemyShootTextures[enemy.userData.enemyType];
            enemy.material.needsUpdate = true;
        }

        setTimeout(() => {
            if (enemy.userData.shootingToken !== shootingToken) return;
            if (enemy.userData.burstShotsRemaining > 0) return;

            enemy.userData.isShooting = false;
            if (this.isSpriteSheetEnemy(typeInfo)) {
                this.updateEnemyVisual(enemy, typeInfo, false, performance.now(), 0);
                return;
            }

            const currentTexture = enemy.userData.walkAnimState
                ? this.enemyWalkTextures[enemy.userData.enemyType]
                : this.enemyTextures[enemy.userData.enemyType];
            if (currentTexture) {
                enemy.material.map = currentTexture;
                enemy.material.needsUpdate = true;
            }
        }, enemy.userData.shotVisualDuration || 700);
    }
    // #endregion

    // #region Gestión de Sonidos EnemyManager
    // Descripción: Limpia los recursos de audio que han terminado de reproducirse para evitar fugas de memoria.
    cleanupFinishedSounds() {
        this.activeSoundSources = this.activeSoundSources.filter(source => {
            // Verificar si el sonido aún está reproduciéndose
            if (!source || !source.context || source.context.state === 'closed') {
                return false;
            }
            // Los sonidos sin loop que ya terminaron se pueden remover
            // (aproximación: si pasaron más de 5 segundos desde su creación)
            if (source.startTime && performance.now() - source.startTime > 5000) {
                return false;
            }
            return true;
        });
    }
    // #endregion

    // #region Bucle Principal EnemyManager
    // Descripción: Actualiza el estado de todos los enemigos, proyectiles y partículas en cada frame.
    update(delta, playerPos, onHitPlayer, camera = null) {
        const tempEnemyBox = new THREE.Box3();
        const collisionObjects = this.getEnemyCollisionObjects();
        const now = performance.now();

        this.cleanupFinishedSounds();
        this.updateRetainedCorpses(now, camera);

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (!enemy.visible) continue;

            this.updateSpawnHologram(enemy, now);

            const typeInfo = ENEMY_TYPES.find(t => t.id === enemy.userData.enemyType);

            if (enemy.userData.isDying) {
                if (enemy.userData.usingGenericDeathAnimation) {
                    this.updateGenericDeathAnimation(enemy, delta);
                } else {
                    this.updateEnemyVisual(enemy, typeInfo, false, now, delta);
                }
                // La fila de muerte de un spritesheet sigue usando el mismo
                // plano vertical del enemigo. Reaplicar el billboard durante
                // la animación evita que conserve el ángulo que tenía al
                // recibir el último impacto.
                this.faceCorpseToCamera(enemy, camera);
                if (now >= enemy.userData.deathEndsAt) {
                    this.retainDeathCorpse(enemy, now, camera);
                }
                continue;
            }

            if (enemy.userData.hp < enemy.userData.maxHp) {
                if (this.audioManager) {
                    this.audioManager.playSound('enemyHit', 0.5);
                }
                enemy.userData.maxHp = enemy.userData.hp;
            }

            // Usar intervalo aleatorio propio de cada enemigo (5-7 segundos)
            const currentInterval = enemy.userData.soundInterval || AUDIO_CONFIG.ENEMY_SOUND_MIN_INTERVAL;
            if (this.audioManager && now - enemy.userData.lastSoundTime >= currentInterval) {
                const distance = playerPos.distanceTo(enemy.position);

                if (distance <= AUDIO_CONFIG.ENEMY_SOUND_DISTANCE) {
                    if (this.activeSoundSources.length < AUDIO_CONFIG.MAX_SIMULTANEOUS_ENEMY_SOUNDS) {
                        if (typeInfo && typeInfo.sounds && typeInfo.sounds.length > 0) {
                            const randomSound = typeInfo.sounds[Math.floor(Math.random() * typeInfo.sounds.length)];
                            const vol = 0.3 + Math.random() * 0.3;

                            const soundSource = this.audioManager.play3DSound(
                                randomSound,
                                playerPos,
                                enemy.position,
                                AUDIO_CONFIG.ENEMY_SOUND_DISTANCE,
                                vol
                            );

                            if (soundSource) {
                                soundSource.startTime = now;
                                this.activeSoundSources.push(soundSource);
                            }
                        }
                    }
                }

                enemy.userData.lastSoundTime = now;
            }

            enemy.userData.velocity.x -= enemy.userData.velocity.x * 10.0 * delta;
            enemy.userData.velocity.z -= enemy.userData.velocity.z * 10.0 * delta;
            enemy.userData.velocity.y -= CONFIG.GRAVITY * delta;

            enemy.lookAt(playerPos.x, enemy.position.y, playerPos.z);

            if (enemy.userData.isShooter) {
                this.updateEnemyShooting(enemy, playerPos, now);
            }
            const movementPlan = this.getEnemyMovementPlan(enemy, playerPos, delta);
            const direction = movementPlan.direction;
            const hasHorizontalTarget = direction.lengthSq() > 0.0001;
            if (hasHorizontalTarget) direction.normalize();
            const moveDist = enemy.userData.speed * movementPlan.speedMultiplier * delta;
            const s = enemy.userData.collisionSize;
            const movement = new THREE.Vector3(
                direction.x * moveDist,
                enemy.userData.velocity.y * delta,
                direction.z * moveDist
            );
            const movementResult = this.moveEnemyWithSlide(enemy, movement, collisionObjects);

            if (enemy.userData.isCivilian && !movementResult.horizontalMoved) {
                enemy.userData.wanderTimer = 0;
            }

            if (movementResult.verticalBlocked) {
                enemy.userData.velocity.y = 0;
            }

            this.getEnemyCollisionBox(enemy.position, s, tempEnemyBox);
            if (this.enemyCollisionHelpers.has(enemy)) {
                const helper = this.enemyCollisionHelpers.get(enemy);
                helper.visible = CONFIG.DEBUG_SHOW_HITBOXES;
                helper.box.copy(tempEnemyBox);
                helper.updateMatrixWorld(true);
            }

            const isMoving = hasHorizontalTarget && movementResult.horizontalMoved;

            const floorHeight = s.y / 2.0;
            if (enemy.position.y <= floorHeight) {
                enemy.userData.velocity.y = 0;
                enemy.position.y = floorHeight;
                enemy.userData.canJump = true;
            }

            if (enemy.userData.canAttackPlayer && enemy.position.distanceTo(playerPos) < 2.5) {
                if (now - enemy.userData.lastMeleeAttackTime > 500) {
                    onHitPlayer(enemy.userData.damage, enemy.position.clone());
                    enemy.userData.lastMeleeAttackTime = now;
                    enemy.userData.attackAnimUntil = now + 420;
                }
            }

            this.updateEnemyVisual(enemy, typeInfo, isMoving, now, delta);
        }

        const projBox = new THREE.Box3();
        const playerHitBox = new THREE.Box3().setFromCenterAndSize(playerPos, new THREE.Vector3(1, 2, 1));

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const previousProjectilePosition = proj.position.clone();
            proj.position.addScaledVector(proj.userData.velocity, delta);
            const r = proj.userData.radius;
            projBox.min.set(proj.position.x - r, proj.position.y - r, proj.position.z - r);
            projBox.max.set(proj.position.x + r, proj.position.y + r, proj.position.z + r);
            let destroyed = false;

            if (projBox.intersectsBox(playerHitBox)) {
                onHitPlayer(proj.userData.damage, previousProjectilePosition);
                destroyed = true;
            }

            if (!destroyed) {
                for (const wall of this.walls) {
                    if (wall.userData.boundingBox && projBox.intersectsBox(wall.userData.boundingBox)) {
                        destroyed = true;
                        break;
                    }
                }
            }

            if (destroyed || proj.position.y < -10 || proj.position.length() > 500) {
                this.scene.remove(proj);
                this.projectiles.splice(i, 1);
            }
        }

        const allBloodKeys = Array.from(this.bloodParticles.keys());
        for (const enemy of allBloodKeys) {
            this.updateBloodParticles(enemy, delta);
        }

        // Actualizar proyectiles de sangre parabólicos
        this.updateBloodProjectiles(delta);
        this.updateGoreParticles(delta);
        this.updateGoreSprites(delta);
    }
    // #endregion

    // #region Eliminación de Enemigos EnemyManager
    // Descripción: Elimina un enemigo de la escena, gestionando la limpieza de sus partículas y sonido de muerte.
    retainDeathCorpse(enemy, now, camera = null) {
        if (!enemy) return;

        // Mantener como máximo el número configurado de cadáveres visibles.
        while (this.corpses.length >= this.maxCorpses) {
            this.removeRetainedCorpse(0);
        }

        const expiresAt = now + this.corpseLifetime;
        if (enemy.userData.usingGenericDeathAnimation) {
            this.setGenericCorpseSprite(enemy);
        }
        enemy.userData.isDying = false;
        enemy.userData.isCorpse = true;
        enemy.userData.usingGenericDeathAnimation = false;
        enemy.userData.corpseExpiresAt = expiresAt;
        enemy.userData.velocity.set(0, 0, 0);
        this.faceCorpseToCamera(enemy, camera);

        if (this.enemyCollisionHelpers.has(enemy)) {
            this.enemyCollisionHelpers.get(enemy).visible = false;
        }

        // El cadáver queda en la escena, pero deja de procesarse como enemigo.
        this.enemies = this.enemies.filter(currentEnemy => currentEnemy !== enemy);
        this.activeEnemies.delete(enemy);
        this.corpses.push({ enemy, expiresAt });
    }

    faceCorpseToCamera(corpse, camera) {
        if (!corpse || !camera) return;

        const deltaX = camera.position.x - corpse.position.x;
        const deltaZ = camera.position.z - corpse.position.z;
        if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaZ) < 0.0001) return;

        // Igual que los decorados 2D: limpiar X/Z mantiene el cadáver
        // vertical y girar solo sobre Y hace que el plano mire a la cámara.
        corpse.rotation.set(0, Math.atan2(deltaX, deltaZ), 0);
        corpse.updateMatrixWorld(true);
    }

    removeRetainedCorpse(index) {
        const corpse = this.corpses[index];
        if (!corpse) return;

        this.corpses.splice(index, 1);
        const enemy = corpse.enemy;
        if (!enemy) return;

        if (enemy.parent) {
            this.scene.remove(enemy);
        }
        this.returnEnemyToPool(enemy);
    }

    updateRetainedCorpses(now, camera = null) {
        for (let i = this.corpses.length - 1; i >= 0; i--) {
            const corpse = this.corpses[i];
            if (!corpse?.enemy || now >= corpse.expiresAt) {
                this.removeRetainedCorpse(i);
                continue;
            }

            this.faceCorpseToCamera(corpse.enemy, camera);
        }
    }

    finalizeEnemyRemoval(enemy) {
        this.scene.remove(enemy);
        this.enemies = this.enemies.filter(e => e !== enemy);
        this.activeEnemies.delete(enemy);
        this.returnEnemyToPool(enemy);
    }

    removeEnemy(enemy) {
        if (!enemy || enemy.userData.isDying || enemy.userData.isCorpse) return;

        if (enemy.userData.hp <= 0 && !enemy.userData.defeatReported) {
            enemy.userData.defeatReported = true;
            this.enemyDefeatedCallback?.(enemy);
        }

        this.stopSpawnHologram(enemy);
        const bloodType = enemy.userData.bloodType || 'red';
        const typeInfo = ENEMY_TYPES.find(type => type.id === enemy.userData.enemyType);
        this.clearBloodParticles(enemy);

        // NUEVO: Explosión de sangre al morir (Decals en suelo/paredes/techo)
        if (this.bloodDecalManager) {
            this.bloodDecalManager.spawnBloodExplosion(enemy.position, bloodType);
        }

        // NUEVO: Explosión de partículas masiva (Sprites gigantes y cubos)
        this.spawnMassiveBloodSplash(enemy);

        // NUEVO: Proyectiles de sangre parabólicos que manchan el suelo
        this.spawnBloodProjectiles(enemy);

        if (this.audioManager) {
            this.audioManager.playSound('enemyDeath', 0.5);
            // Sonido viscoso aleatorio (1-5)
            const randomSplat = 'bloodSplat' + (1 + Math.floor(Math.random() * 5));
            this.audioManager.playSound(randomSplat, 0.7);
        }

        const deathAnimation = typeInfo?.spriteSheet?.animations?.death;
        // Los enemigos con sprites individuales (como pera) usan el cadáver
        // genérico; los spritesheets conservan su fila de muerte dedicada.
        const usesGenericDeathAnimation =
            !this.isSpriteSheetEnemy(typeInfo) && Boolean(this.genericDeathTexture);
        const activeDeathAnimation = usesGenericDeathAnimation
            ? GENERIC_DEATH_SPRITE_SHEET.animations.death
            : deathAnimation;

        if (activeDeathAnimation) {
            const deathStart = performance.now();
            enemy.userData.isDying = true;
            enemy.userData.usingGenericDeathAnimation = usesGenericDeathAnimation;
            enemy.userData.hp = 0;
            enemy.userData.maxHp = 0;
            enemy.userData.isShooting = false;
            enemy.userData.attackAnimUntil = 0;
            enemy.userData.velocity.set(0, 0, 0);
            enemy.userData.deathEndsAt = deathStart + Math.max(
                0.45,
                this.getSpriteSheetAnimationDuration(activeDeathAnimation)
            ) * 1000;

            if (this.enemyCollisionHelpers.has(enemy)) {
                this.enemyCollisionHelpers.get(enemy).visible = false;
            }

            if (usesGenericDeathAnimation) {
                this.startGenericDeathAnimation(enemy);
            } else {
                this.updateEnemyVisual(enemy, typeInfo, false, deathStart, 0);
            }
            return;
        }

        this.finalizeEnemyRemoval(enemy);
    }
    // #endregion

    // #region Limpieza de Recursos EnemyManager
    // Descripción: Libera todos los recursos utilizados por el gestor de enemigos al finalizar el juego o reiniciar.
    dispose() {
        this.bloodParticles.forEach((particles, enemy) => {
            this.clearBloodParticles(enemy);
        });
        this.bloodParticles.clear();

        this.bloodParticleVariants.forEach(variant => {
            if (variant.geometry) variant.geometry.dispose();
        });
        this.bloodParticleVariants = [];
        if (this.bloodMaterial) this.bloodMaterial.dispose();

        this.enemyCollisionHelpers.forEach(helper => {
            this.scene.remove(helper);
        });
        this.enemyCollisionHelpers.clear();

        this.projectiles.forEach(p => this.scene.remove(p));
        this.projectiles = [];
        if (this.projectileGeometry) this.projectileGeometry.dispose();
        if (this.projectileMaterial) this.projectileMaterial.dispose();
        if (this.tracerGeometry) this.tracerGeometry.dispose();
        if (this.tracerTipGeometry) this.tracerTipGeometry.dispose();
        if (this.tracerMaterial) this.tracerMaterial.dispose();
        if (this.tracerTipMaterial) this.tracerTipMaterial.dispose();

        const allEnemies = new Set([
            ...this.enemies,
            ...this.enemyPool,
            ...this.corpses.map(corpse => corpse.enemy)
        ]);
        allEnemies.forEach(enemy => {
            if (enemy.parent) this.scene.remove(enemy);
            this.disposeSpawnHologram(enemy);
            if (enemy.geometry && enemy.geometry !== this.sharedGeometry) {
                enemy.geometry.dispose();
            }
            this.disposeEnemyMaterial(enemy);
        });
        if (this.sharedGeometry) this.sharedGeometry.dispose();

        const allEnemyTextures = new Set([
            ...Object.values(this.enemyTextures),
            ...Object.values(this.enemyWalkTextures),
            ...Object.values(this.enemyShootTextures),
            ...this.genericDeathTextures,
            this.genericDeathTexture,
            this.genericCorpseTexture
        ]);
        allEnemyTextures.forEach(texture => texture.dispose());
        this.enemies = [];
        this.enemyPool = [];
        this.corpses = [];
        this.activeEnemies.clear();

        // Limpiar sonidos activos
        this.activeSoundSources = [];

        // Limpiar efectos de gore que no pertenecen a un enemigo del pool.
        this.goreParticles.forEach(particle => {
            if (particle.material) particle.material.dispose();
            this.scene.remove(particle);
        });
        this.goreParticles = [];

        this.goreSprites.forEach(effect => {
            if (effect.sprite) {
                this.scene.remove(effect.sprite);
                if (effect.sprite.material) effect.sprite.material.dispose();
            }
            if (effect.texture) effect.texture.dispose();
        });
        this.goreSprites = [];

        // Limpiar proyectiles de sangre parabólicos
        this.bloodProjectiles.forEach(p => {
            if (p.geometry) p.geometry.dispose();
            if (p.material) p.material.dispose();
            this.scene.remove(p);
        });
        this.bloodProjectiles = [];

        // Limpiar decals de sangre
        if (this.bloodDecalManager) {
            this.bloodDecalManager.dispose();
        }

        this.bloodSpriteTextureCache?.forEach(texture => texture.dispose());
        this.bloodSpriteTextureCache?.clear();
        this.enemyDefeatedCallback = null;
    }
    // #endregion
}
// #endregion
