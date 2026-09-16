// #region Importaciones EnemyManager
import * as THREE from '../../node_modules/three/build/three.module.js';
import {
    CONFIG,
    ENEMY_TYPES,
    AUDIO_CONFIG,
    GENERIC_DEATH_SPRITE_SHEET,
    HIT_BLOOD_SPRITE_VARIANTS
} from '../Constants.js';
import { BloodDecalManager } from '../core/BloodDecalManager.js';
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
        return bloodType === 'white'
            ? ['assets/textures/white_blood_splash.png']
            : [
                'assets/textures/blood_splash.png',
                'assets/textures/blood_splash2.png',
                'assets/textures/blood_splash3.png',
                'assets/textures/blood_splash4.png',
                'assets/textures/blood_droplets.png',
                'assets/textures/blood_streak.png'
            ];
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
        return bloodType === 'white'
            ? ['assets/textures/white_blood_splash.png']
            : HIT_BLOOD_SPRITE_VARIANTS;
    }

    clampBloodHitPosition(enemy, hitPosition) {
        if (!enemy || !hitPosition?.isVector3) {
            return enemy?.position?.clone() || new THREE.Vector3();
        }

        // Trabajar en las coordenadas del plano permite limitar X/Y aunque el
        // enemigo esté girado hacia el jugador. El bounding box ya incluye el
        // pequeño ajuste vertical propio de cada spritesheet.
        enemy.updateMatrixWorld(true);
        if (enemy.geometry?.computeBoundingBox) {
            enemy.geometry.computeBoundingBox();
        }

        const localHit = enemy.worldToLocal(hitPosition.clone());
        const bounds = enemy.geometry?.boundingBox;
        const minX = bounds?.min.x ?? -1;
        const maxX = bounds?.max.x ?? 1;
        const minY = bounds?.min.y ?? -1;
        const maxY = bounds?.max.y ?? 1;
        const scaleX = Math.max(Math.abs(enemy.scale.x), 0.001);
        const scaleY = Math.max(Math.abs(enemy.scale.y), 0.001);

        // Reserva espacio para la mitad de la nube más grande y para el
        // desplazamiento lateral de cada una de sus tres capas. Así el efecto
        // conserva la zona aproximada del impacto, pero no puede desbordar el
        // rectángulo visual del enemigo.
        const maxCloudHalfWidth = (1.20 * 1.16) / 2;
        const maxCloudHalfHeight = (1.20 * 1.20) / 2;
        const layerOffset = 0.13;
        const marginX = (maxCloudHalfWidth + layerOffset) / scaleX;
        const marginY = (maxCloudHalfHeight + layerOffset) / scaleY;
        const safeMinX = minX + marginX;
        const safeMaxX = maxX - marginX;
        const safeMinY = minY + marginY;
        const safeMaxY = maxY - marginY;

        localHit.x = safeMinX <= safeMaxX
            ? THREE.MathUtils.clamp(localHit.x, safeMinX, safeMaxX)
            : (minX + maxX) / 2;
        localHit.y = safeMinY <= safeMaxY
            ? THREE.MathUtils.clamp(localHit.y, safeMinY, safeMaxY)
            : (minY + maxY) / 2;

        return enemy.localToWorld(localHit);
    }

    getBloodColor(enemy) {
        return enemy.userData.bloodColor ?? 0xcc0000;
    }

    createBloodParticleMaterial(color) {
        const material = this.bloodMaterial.clone();
        material.color.setHex(color);
        if (material.emissive) {
            material.emissive.copy(material.color).multiplyScalar(0.12);
        }
        return material;
    }

    isSpriteSheetEnemy(type) {
        return Boolean(type?.spriteSheet?.animations);
    }

    createEnemyMaterial(type) {
        const baseTexture = this.enemyTextures[type.id];
        const texture = baseTexture;

        if (this.isSpriteSheetEnemy(type)) {
            // La textura original se comparte entre enemigos; las UV de cada
            // geometría son las que seleccionan su frame. Así no se pierde la
            // imagen si el enemigo aparece antes de que termine el preload.
            texture.minFilter = THREE.NearestFilter;
            texture.magFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
        }

        return new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            alphaTest: 0.05,
            side: THREE.DoubleSide
        });
    }

    createSpawnHologram(enemy) {
        const hologramMaterial = new THREE.ShaderMaterial({
            uniforms: {
                map: { value: enemy.material?.map || null },
                uTime: { value: 0 },
                uOpacity: { value: 0 },
                uProgress: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D map;
                uniform float uTime;
                uniform float uOpacity;
                uniform float uProgress;
                varying vec2 vUv;

                void main() {
                    vec4 sprite = texture2D(map, vUv);
                    if (sprite.a < 0.03) discard;

                    float scanLines = 0.5 + 0.5 * sin(vUv.y * 280.0 - uTime * 38.0);
                    float scanBand = 0.5 + 0.5 * sin(vUv.x * 70.0 + uTime * 16.0);
                    float sweepPosition = fract(uTime * 2.6);
                    float sweep = exp(-abs(vUv.y - sweepPosition) * 95.0);
                    float arrivalFlash = exp(-uProgress * 16.0);
                    float flicker = 0.82 + 0.18 * sin(uTime * 105.0);
                    float alpha = sprite.a * uOpacity *
                        (0.48 + scanLines * 0.52 + scanBand * 0.18 + sweep * 1.65 + arrivalFlash * 1.9) * flicker;

                    vec3 hologramColor = mix(
                        vec3(0.0, 0.72, 1.0),
                        vec3(1.0, 1.0, 1.0),
                        clamp(arrivalFlash * 0.9 + sweep * 0.4, 0.0, 1.0)
                    );

                    gl_FragColor = vec4(hologramColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        const hologram = new THREE.Mesh(enemy.geometry, hologramMaterial);
        hologram.position.z = 0.01;
        hologram.renderOrder = 1;
        hologram.visible = false;
        enemy.add(hologram);

        const spawnLight = new THREE.PointLight(0x72efff, 0, 8, 2);
        spawnLight.position.set(0, 0.45, 0.35);
        spawnLight.visible = false;
        enemy.add(spawnLight);

        enemy.userData.spawnHologram = hologram;
        enemy.userData.spawnHologramLight = spawnLight;

        return hologram;
    }

    startSpawnHologram(enemy) {
        const hologram = enemy.userData.spawnHologram || this.createSpawnHologram(enemy);
        const material = hologram.material;

        material.uniforms.map.value = enemy.material?.map || null;
        material.uniforms.uTime.value = 0;
        material.uniforms.uOpacity.value = 0;
        material.uniforms.uProgress.value = 0;
        hologram.visible = true;

        hologram.scale.setScalar(1.18);

        const spawnLight = enemy.userData.spawnHologramLight;
        if (spawnLight) {
            spawnLight.intensity = 5.5;
            spawnLight.visible = true;
        }

        enemy.userData.spawnHologramStartedAt = performance.now();
        enemy.userData.spawnHologramUntil =
            enemy.userData.spawnHologramStartedAt + this.spawnHologramDuration;
    }

    updateSpawnHologram(enemy, now) {
        const hologram = enemy.userData.spawnHologram;
        if (!hologram?.visible) return;

        const elapsed = now - enemy.userData.spawnHologramStartedAt;
        if (elapsed >= this.spawnHologramDuration) {
            hologram.visible = false;
            hologram.material.uniforms.uOpacity.value = 0;
            hologram.scale.setScalar(1);
            const spawnLight = enemy.userData.spawnHologramLight;
            if (spawnLight) {
                spawnLight.intensity = 0;
                spawnLight.visible = false;
            }
            return;
        }

        const progress = Math.max(0, elapsed / this.spawnHologramDuration);
        const fadeIn = Math.min(1, elapsed / 55);
        const fadeOut = Math.min(1, (1 - progress) / 0.28);
        const arrivalFlash = Math.exp(-progress * 16);
        const pulse = 0.9 + 0.1 * Math.sin(elapsed * 0.08);

        hologram.material.uniforms.map.value = enemy.material?.map || null;
        hologram.material.uniforms.uTime.value = elapsed / 1000;
        hologram.material.uniforms.uProgress.value = progress;
        hologram.material.uniforms.uOpacity.value = 1.35 * fadeIn * fadeOut * pulse;
        hologram.scale.setScalar(1 + 0.18 * (1 - progress) + 0.025 * Math.sin(elapsed * 0.06));

        const spawnLight = enemy.userData.spawnHologramLight;
        if (spawnLight) {
            spawnLight.intensity = fadeIn * fadeOut * (0.5 + arrivalFlash * 5.5);
        }
    }

    stopSpawnHologram(enemy) {
        const hologram = enemy?.userData?.spawnHologram;
        if (!hologram) return;

        hologram.visible = false;
        hologram.material.uniforms.uOpacity.value = 0;
        hologram.material.uniforms.uProgress.value = 0;
        hologram.scale.setScalar(1);

        const spawnLight = enemy.userData.spawnHologramLight;
        if (spawnLight) {
            spawnLight.intensity = 0;
            spawnLight.visible = false;
        }
    }

    disposeSpawnHologram(enemy) {
        const hologram = enemy?.userData?.spawnHologram;
        if (!hologram) return;

        if (hologram.parent) hologram.parent.remove(hologram);
        hologram.material.dispose();
        delete enemy.userData.spawnHologram;

        const spawnLight = enemy.userData.spawnHologramLight;
        if (spawnLight?.parent) spawnLight.parent.remove(spawnLight);
        delete enemy.userData.spawnHologramLight;
    }

    resetSpriteSheetGeometry(geometry) {
        const uv = geometry?.attributes?.uv;
        if (!uv) return;

        uv.setXY(0, 0, 1);
        uv.setXY(1, 1, 1);
        uv.setXY(2, 0, 0);
        uv.setXY(3, 1, 0);
        uv.needsUpdate = true;
    }

    setEnemySpriteOffset(enemy, type) {
        if (!enemy?.geometry) return;

        const height = type?.height || 2.0;
        const desiredOffset = Number(type?.spriteOffsetY || 0);
        const desiredLocalOffset = desiredOffset / (height / 2.0);
        const currentLocalOffset = Number(enemy.userData.spriteOffsetLocalY || 0);
        const delta = desiredLocalOffset - currentLocalOffset;

        if (Math.abs(delta) > 0.0001) {
            enemy.geometry.translate(0, delta, 0);
        }

        enemy.userData.spriteOffsetLocalY = desiredLocalOffset;
    }

    setSpriteSheetGeometryFrame(geometry, spriteSheet, animationName, frameIndex) {
        const animation = spriteSheet?.animations?.[animationName] || spriteSheet?.animations?.idle;
        const uv = geometry?.attributes?.uv;
        if (!spriteSheet || !animation || !uv) return;

        const columns = Math.max(1, spriteSheet.columns || 1);
        const rows = Math.max(1, spriteSheet.rows || 1);
        const frameWidth = Math.max(1, spriteSheet.frameWidth || 1);
        const frameHeight = Math.max(1, spriteSheet.frameHeight || 1);
        const frames = Math.max(1, animation.frames || 1);
        const frame = Math.max(0, Math.min(frames - 1, frameIndex));
        const row = Math.max(0, Math.min(rows - 1, animation.row || 0));
        const column = Math.min(columns - 1, frame);
        const textureWidth = columns * frameWidth;
        const textureHeight = rows * frameHeight;
        const pixelInsetX = 0.5 / textureWidth;
        // El atlas tiene sprites muy cerca de los límites verticales. Un margen
        // ligeramente mayor evita que el filtrado muestree la fila contigua.
        const pixelInsetY = 1.5 / textureHeight;

        // PlaneGeometry tiene las UV ordenadas como: arriba-izquierda,
        // arriba-derecha, abajo-izquierda, abajo-derecha. Se deja un margen
        // de seguridad para que nunca entre el frame contiguo del atlas.
        const u0 = (column * frameWidth) / textureWidth + pixelInsetX;
        const u1 = ((column + 1) * frameWidth) / textureWidth - pixelInsetX;
        const v0 = 1 - ((row + 1) * frameHeight) / textureHeight + pixelInsetY;
        const v1 = 1 - (row * frameHeight) / textureHeight - pixelInsetY;

        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        uv.needsUpdate = true;
    }

    disposeEnemyMaterial(enemy) {
        const material = enemy?.material;
        if (!material) return;

        if (material.map?.userData?.isEnemySpriteSheetFrame) {
            material.map.dispose();
        }
        material.dispose();
    }

    initializeEnemyAnimation(enemy, type) {
        enemy.userData.animationName = null;
        enemy.userData.animationFrame = 0;
        enemy.userData.animationTimer = 0;
        enemy.userData.attackAnimUntil = 0;

        if (this.isSpriteSheetEnemy(type)) {
            this.updateSpriteSheetAnimation(enemy, type, 'idle', 0);
        }
    }

    setSpriteSheetFrame(enemy, type, animationName, frameIndex) {
        const spriteSheet = type.spriteSheet;
        const animation = spriteSheet?.animations?.[animationName] || spriteSheet?.animations?.idle;
        if (!spriteSheet || !animation || !enemy.geometry) return;

        this.setSpriteSheetGeometryFrame(
            enemy.geometry,
            spriteSheet,
            animationName,
            frameIndex
        );
    }

    updateSpriteSheetAnimation(enemy, type, animationName, delta) {
        const spriteSheet = type.spriteSheet;
        const animation = spriteSheet?.animations?.[animationName] || spriteSheet?.animations?.idle;
        if (!spriteSheet || !animation || !enemy.material?.map) return;

        const frames = Math.max(1, animation.frames || 1);
        const fps = Math.max(1, animation.fps || 8);
        const frameDuration = 1 / fps;

        if (enemy.userData.animationName !== animationName) {
            enemy.userData.animationName = animationName;
            enemy.userData.animationFrame = 0;
            enemy.userData.animationTimer = 0;
            this.setSpriteSheetFrame(enemy, type, animationName, 0);
        }

        if (!animation.loop && enemy.userData.animationFrame >= frames - 1) {
            return;
        }

        enemy.userData.animationTimer += Math.max(0, delta);
        let frameChanged = false;

        while (enemy.userData.animationTimer >= frameDuration) {
            enemy.userData.animationTimer -= frameDuration;
            let nextFrame = enemy.userData.animationFrame + 1;

            if (nextFrame >= frames) {
                nextFrame = animation.loop ? 0 : frames - 1;
            }

            if (nextFrame === enemy.userData.animationFrame) {
                enemy.userData.animationTimer = 0;
                break;
            }

            enemy.userData.animationFrame = nextFrame;
            frameChanged = true;
        }

        if (frameChanged) {
            this.setSpriteSheetFrame(
                enemy,
                type,
                animationName,
                enemy.userData.animationFrame
            );
        }
    }

    setGenericCorpseSprite(enemy) {
        if (!enemy?.geometry || !enemy.material) return;

        if (enemy.material.map !== this.genericCorpseTexture) {
            enemy.material.map = this.genericCorpseTexture;
            enemy.material.needsUpdate = true;
        }

        // La pila usa su propio atlas cuadrado; no necesita recorte de frames.
        this.resetSpriteSheetGeometry(enemy.geometry);
    }

    selectGenericDeathTexture(enemy) {
        const textures = this.genericDeathTextures?.length
            ? this.genericDeathTextures
            : [this.genericDeathTexture];
        let variant = Math.floor(Math.random() * textures.length);

        // Evita dos muertes genéricas consecutivas con la misma variante.
        if (textures.length > 1 && variant === this.lastGenericDeathVariant) {
            variant = (variant + 1) % textures.length;
        }

        this.lastGenericDeathVariant = variant;
        if (enemy?.userData) {
            enemy.userData.genericDeathVariant = variant;
        }
        return textures[variant];
    }

    setGenericDeathSpriteFrame(enemy, frameIndex) {
        if (!enemy?.geometry || !enemy.material) return;

        const lastFrame = GENERIC_DEATH_SPRITE_SHEET.animations.death.frames - 1;
        if (frameIndex >= lastFrame && this.genericCorpseTexture) {
            this.setGenericCorpseSprite(enemy);
            return;
        }

        const genericDeathTexture =
            enemy.userData.genericDeathTexture || this.genericDeathTexture;
        if (enemy.material.map !== genericDeathTexture) {
            enemy.material.map = genericDeathTexture;
            enemy.material.needsUpdate = true;
        }

        this.setSpriteSheetGeometryFrame(
            enemy.geometry,
            GENERIC_DEATH_SPRITE_SHEET,
            'death',
            frameIndex
        );
    }

    startGenericDeathAnimation(enemy) {
        enemy.userData.usingGenericDeathAnimation = true;
        enemy.userData.genericDeathFrame = 0;
        enemy.userData.genericDeathTimer = 0;
        enemy.userData.genericDeathTexture = this.selectGenericDeathTexture(enemy);
        enemy.position.y += Number(GENERIC_DEATH_SPRITE_SHEET.offsetY) || 0;
        this.setGenericDeathSpriteFrame(enemy, 0);
    }

    updateGenericDeathAnimation(enemy, delta) {
        const animation = GENERIC_DEATH_SPRITE_SHEET.animations.death;
        const frames = Math.max(1, animation.frames || 1);
        const fps = Math.max(1, animation.fps || 8);
        const frameDuration = 1 / fps;

        if (enemy.userData.genericDeathFrame >= frames - 1) return;

        enemy.userData.genericDeathTimer =
            Number(enemy.userData.genericDeathTimer || 0) + Math.max(0, delta);

        let frameChanged = false;
        while (enemy.userData.genericDeathTimer >= frameDuration) {
            enemy.userData.genericDeathTimer -= frameDuration;
            enemy.userData.genericDeathFrame += 1;
            frameChanged = true;

            if (enemy.userData.genericDeathFrame >= frames - 1) {
                enemy.userData.genericDeathFrame = frames - 1;
                enemy.userData.genericDeathTimer = 0;
                break;
            }
        }

        if (frameChanged) {
            this.setGenericDeathSpriteFrame(
                enemy,
                enemy.userData.genericDeathFrame
            );
        }
    }

    getSpriteSheetAnimationDuration(animation) {
        const frames = Math.max(1, animation?.frames || 1);
        const fps = Math.max(1, animation?.fps || 8);
        return frames / fps;
    }

    updateEnemyVisual(enemy, type, isMoving, now, delta) {
        if (this.isSpriteSheetEnemy(type)) {
            let animationName = 'idle';

            if (enemy.userData.isDying) {
                animationName = 'death';
            } else if (enemy.userData.isShooting || now < enemy.userData.attackAnimUntil) {
                animationName = 'attack';
            } else if (
                enemy.userData.bloodTime > 0 &&
                now - enemy.userData.bloodTime < this.getSpriteSheetAnimationDuration(
                    type.spriteSheet.animations.hurt
                ) * 1000
            ) {
                animationName = 'hurt';
            } else if (isMoving) {
                animationName = 'walk';
            }

            this.updateSpriteSheetAnimation(enemy, type, animationName, delta);
            return;
        }

        if (!isMoving || enemy.userData.isShooting || !this.enemyWalkTextures[enemy.userData.enemyType]) {
            return;
        }

        enemy.userData.walkAnimTimer += delta;
        if (enemy.userData.walkAnimTimer >= 0.7) {
            enemy.userData.walkAnimTimer = 0;
            enemy.userData.walkAnimState = !enemy.userData.walkAnimState;

            const newTexture = enemy.userData.walkAnimState
                ? this.enemyWalkTextures[enemy.userData.enemyType]
                : this.enemyTextures[enemy.userData.enemyType];

            if (enemy.material.map !== newTexture) {
                enemy.material.map = newTexture;
                enemy.material.needsUpdate = true;
            }
        }
    }

    configureBloodEffects(enemy) {
        enemy.userData.drawBlood = (hitPoint = null) => {
            const forward = new THREE.Vector3(0, 0, 1);
            forward.applyQuaternion(enemy.quaternion).normalize();

            // El raycast del arma entrega la coordenada mundial exacta sobre
            // el plano del sprite. La nube usa una versión limitada a un
            // margen interior, pero las partículas y decals conservan el
            // punto físico real del impacto.
            const impactPosition = hitPoint?.isVector3
                ? hitPoint.clone()
                : enemy.position.clone();
            impactPosition.addScaledVector(forward, 0.06);
            const cloudPosition = this.clampBloodHitPosition(enemy, hitPoint);
            cloudPosition.addScaledVector(forward, 0.06);

            const particles = this.createBloodParticles(enemy, impactPosition);
            this.bloodParticles.set(enemy, particles);

            // Mantener las salpicaduras existentes alrededor del enemigo y
            // añadir una nube grande sobre el punto de impacto ajustado. El
            // resto de partículas y manchas conserva su comportamiento actual.
            this.createHitBloodSpriteCloud(
                enemy,
                cloudPosition,
                forward
            );

            this.bloodDecalManager.spawnBloodSplatter(
                impactPosition,
                forward,
                enemy.userData.bloodType || 'red'
            );
        };

        enemy.userData.clearBlood = () => { this.clearBloodParticles(enemy); };
    }

    getCachedBloodSpriteTexture(texturePath) {
        if (!this.bloodSpriteTextureCache.has(texturePath)) {
            const texture = this.bloodSpriteTextureLoader.load(texturePath);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
            this.bloodSpriteTextureCache.set(texturePath, texture);
        }

        return this.bloodSpriteTextureCache.get(texturePath);
    }

    createHitBloodSpriteCloud(enemy, hitPosition, forwardDirection) {
        if (!enemy || !hitPosition?.isVector3) return;

        const bloodPaths = this.getHitBloodSpritePaths(enemy.userData.bloodType);
        if (bloodPaths.length === 0) return;

        if (!enemy.userData.bloodSplashes) {
            enemy.userData.bloodSplashes = [];
        }

        const availablePaths = [...bloodPaths];
        const selectedPaths = [];
        for (let i = 0; i < 3; i++) {
            if (availablePaths.length > 0) {
                const pathIndex = Math.floor(Math.random() * availablePaths.length);
                selectedPaths.push(availablePaths.splice(pathIndex, 1)[0]);
            } else {
                // Los enemigos de sangre blanca tienen una sola textura, así
                // que repetimos el recurso con escala y giro diferentes.
                selectedPaths.push(bloodPaths[i % bloodPaths.length]);
            }
        }

        const forward = (forwardDirection?.isVector3
            ? forwardDirection.clone()
            : new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.quaternion)
        ).normalize();
        const right = new THREE.Vector3(1, 0, 0)
            .applyQuaternion(enemy.quaternion)
            .normalize();
        const up = new THREE.Vector3(0, 1, 0)
            .applyQuaternion(enemy.quaternion)
            .normalize();

        const offsets = [
            [-0.13, 0.05],
            [0.12, -0.06],
            [0.0, 0.13]
        ];

        selectedPaths.forEach((texturePath, index) => {
            const texture = this.getCachedBloodSpriteTexture(texturePath);
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.92,
                // La nube debe quedar visible sobre el sprite del objetivo,
                // pero su vida corta evita que se convierta en una capa fija.
                depthTest: false,
                depthWrite: false,
                alphaTest: 0.03,
                blending: THREE.NormalBlending
            });
            const sprite = new THREE.Sprite(material);
            const size = 0.92 + Math.random() * 0.28;
            const widthScale = 0.84 + Math.random() * 0.32;
            const heightScale = 0.84 + Math.random() * 0.36;

            sprite.position.copy(hitPosition)
                .addScaledVector(right, offsets[index][0])
                .addScaledVector(up, offsets[index][1])
                .addScaledVector(forward, 0.055 + index * 0.006);
            sprite.scale.set(size * widthScale, size * heightScale, 1);
            sprite.rotation.z = Math.random() * Math.PI * 2;
            sprite.renderOrder = 4;
            sprite.userData.sharedBloodTexture = true;
            enemy.userData.bloodSplashes.push(sprite);
            this.scene.add(sprite);

            const startTime = performance.now();
            const duration = 260 + Math.random() * 80;
            const initialScale = sprite.scale.clone();
            const animateCloud = () => {
                if (!sprite.parent) return;

                const progress = (performance.now() - startTime) / duration;
                if (progress >= 1) {
                    this.scene.remove(sprite);
                    sprite.material.dispose();
                    const spriteIndex = enemy.userData.bloodSplashes?.indexOf(sprite) ?? -1;
                    if (spriteIndex !== -1) {
                        enemy.userData.bloodSplashes.splice(spriteIndex, 1);
                    }
                    return;
                }

                const easedProgress = 1 - Math.pow(1 - progress, 2);
                const pulse = 0.72 + easedProgress * 0.28;
                sprite.scale.set(
                    initialScale.x * pulse,
                    initialScale.y * pulse,
                    1
                );
                sprite.material.opacity = 0.92 * (1 - progress);
                requestAnimationFrame(animateCloud);
            };

            requestAnimationFrame(animateCloud);
        });
    }

    // #region Sistema de Partículas EnemyManager
    createBloodParticles(enemy, hitPosition) {
        const existingParticles = this.bloodParticles.get(enemy);
        const maxActiveParticles = 12;
        const particleCount = 4 + Math.floor(Math.random() * 3);

        // Mantener un límite bajo por enemigo para que los impactos rápidos no
        // acumulen decenas de mallas 3D de sangre.
        if (existingParticles && existingParticles.length + particleCount > maxActiveParticles) {
            const particlesToRemove = existingParticles.length + particleCount - maxActiveParticles;
            for (let i = 0; i < particlesToRemove; i++) {
                const p = existingParticles.shift();
                if (p) {
                    if (p.material) p.material.dispose();
                    this.scene.remove(p);
                }
            }
        }

        const particles = existingParticles || [];

        const spawnPos = hitPosition ? hitPosition.clone() : enemy.position.clone();
        if (!hitPosition) {
            spawnPos.y += 1.0;
        }

        // Escoger una textura distinta de todo el catálogo en cada impacto.
        const textureLoader = new THREE.TextureLoader();
        const splashTextures = this.getBloodTexturePaths(enemy.userData.bloodType);
        const randomTexturePath = splashTextures[Math.floor(Math.random() * splashTextures.length)];
        const bloodSplashTexture = textureLoader.load(randomTexturePath);
        bloodSplashTexture.colorSpace = THREE.SRGBColorSpace;

        const splashMaterial = new THREE.SpriteMaterial({
            map: bloodSplashTexture,
            transparent: true,
            opacity: 1.0, // Más opaco
            depthTest: false, // Siempre renderizar por encima
            depthWrite: false,
            alphaTest: 0.02,
            blending: THREE.NormalBlending
        });

        const bloodSplash = new THREE.Sprite(splashMaterial);

        // Posición aleatoria alrededor del punto de impacto
        const randomOffset = new THREE.Vector3(
            (Math.random() - 0.5) * 1.5, // Menor desplazamiento
            (Math.random() - 0.5) * 1.0,
            (Math.random() - 0.5) * 1.5
        );

        bloodSplash.position.copy(spawnPos).add(randomOffset);

        // Desplazar hacia adelante para que se vea por delante
        const forwardDirection = new THREE.Vector3(0, 0, 1);
        forwardDirection.applyQuaternion(enemy.quaternion);
        bloodSplash.position.add(forwardDirection.multiplyScalar(0.5)); // 0.5 unidades hacia adelante

        // Tamaño contenido para que el impacto no cubra al enemigo.
        const scale = 0.75 + Math.random() * 0.55;
        bloodSplash.scale.set(
            scale * (0.75 + Math.random() * 0.45),
            scale * (0.75 + Math.random() * 0.45),
            scale
        );

        // Rotación aleatoria
        bloodSplash.rotation.z = Math.random() * Math.PI * 2;

        // Guardar referencia al splash en el enemigo para limpieza rápida
        if (!enemy.userData.bloodSplashes) {
            enemy.userData.bloodSplashes = [];
        }
        enemy.userData.bloodSplashes.push(bloodSplash);

        this.scene.add(bloodSplash);

        // Animar desvanecimiento
        const fadeOut = () => {
            if (bloodSplash.parent) { // Verificar que aún esté en la escena
                bloodSplash.material.opacity -= 0.1; // Desvanecimiento más rápido
                if (bloodSplash.material.opacity <= 0) {
                    this.scene.remove(bloodSplash);
                    bloodSplash.material.dispose();
                    bloodSplashTexture.dispose();

                    const splashIndex = enemy.userData.bloodSplashes?.indexOf(bloodSplash) ?? -1;
                    if (splashIndex !== -1) {
                        enemy.userData.bloodSplashes.splice(splashIndex, 1);
                    }
                } else {
                    requestAnimationFrame(fadeOut);
                }
            }
        };

        // Comenzar a desvanecer después de un breve delay
        setTimeout(fadeOut, 100); // El splash debe resolverse rápidamente

        for (let i = 0; i < particleCount; i++) {
            const variant = this.bloodParticleVariants[
                i % this.bloodParticleVariants.length
            ];
            const particleMaterial = this.createBloodParticleMaterial(
                this.getBloodColor(enemy)
            );
            const particle = new THREE.Mesh(variant.geometry, particleMaterial);
            // Las partículas respetan la profundidad para no verse a través de muros
            particle.material.depthTest = true;
            particle.material.depthWrite = true;
            particle.position.copy(spawnPos);

            // Desplazamiento aleatorio más amplio alrededor del sprite
            particle.position.x += (Math.random() - 0.5) * 1.8;
            particle.position.y += (Math.random() - 0.5) * 1.5;
            particle.position.z += (Math.random() - 0.5) * 1.8;

            particle.rotation.x = Math.random() * Math.PI;
            particle.rotation.y = Math.random() * Math.PI;
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 5.0,
                (Math.random() * 4.0) + 2.0,
                (Math.random() - 0.5) * 5.0
            );
            particle.userData = {
                life: 1.0,
                velocity: velocity,
                rotationSpeed: {
                    x: (Math.random() - 0.5) * 10.0,
                    y: (Math.random() - 0.5) * 10.0
                },
                isOnGround: false,
                variant: variant.id,
                creationTime: performance.now(),
            };
            const scale = 0.35 + Math.random() * 0.55;
            particle.scale.set(
                scale * (0.8 + Math.random() * 0.35),
                scale * (0.8 + Math.random() * 0.45),
                scale * (0.8 + Math.random() * 0.35)
            );

            particles.push(particle);
            this.scene.add(particle);
        }

        this.bloodParticles.set(enemy, particles);
        return particles;
    }

    // #region Sistema de Explosión Masiva EnemyManager
    // Descripción: Genera múltiples sprites de sangre y partículas para una explosión visceral al morir.
    spawnMassiveBloodSplash(enemy) {
        const explosionCenter = enemy.position.clone();
        explosionCenter.y += 1.0; // Centro del cuerpo

        // 1. Crear múltiples sprites de sangre (10-16) con tamaños y formas variadas.
        const spriteCount = 10 + Math.floor(Math.random() * 7);

        // Cargar todas las texturas una sola vez
        const textureLoader = new THREE.TextureLoader();
        const splashTextures = this.getBloodTexturePaths(enemy.userData.bloodType)
            .map(texturePath => textureLoader.load(texturePath));
        splashTextures.forEach(texture => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
        });

        for (let i = 0; i < spriteCount; i++) {
            // Usar una textura inicial aleatoria
            const initialTexture = splashTextures[Math.floor(Math.random() * splashTextures.length)];

            const splashMaterial = new THREE.SpriteMaterial({
                map: initialTexture,
                transparent: true,
                opacity: 1.0,
                depthTest: false,
                depthWrite: false,
                alphaTest: 0.02,
                blending: THREE.NormalBlending
            });

            const bloodSplash = new THREE.Sprite(splashMaterial);

            // Posición aleatoria dispersa alrededor del enemigo
            const randomOffset = new THREE.Vector3(
                (Math.random() - 0.5) * 4.0, // Dispersión amplia
                (Math.random() - 0.5) * 3.0,
                (Math.random() - 0.5) * 4.0
            );
            bloodSplash.position.copy(explosionCenter).add(randomOffset);

            // Tamaño reducido y ligeramente deformado para que no parezcan clones.
            const scale = 0.8 + Math.random() * 1.4;
            bloodSplash.scale.set(
                scale * (0.75 + Math.random() * 0.45),
                scale * (0.75 + Math.random() * 0.45),
                scale
            );

            // Rotación aleatoria
            bloodSplash.rotation.z = Math.random() * Math.PI * 2;

            this.scene.add(bloodSplash);

            // Animación: Intercalar sprites durante 300ms (flicker effect)
            const startTime = performance.now();
            const duration = 300; // Resolver el estallido con un ritmo más rápido
            let lastSwap = 0;
            const swapInterval = 75; // Cambiar sprite dos veces más rápido

            const animateSplash = () => {
                const now = performance.now();
                const elapsed = now - startTime;

                if (elapsed < duration) {
                    if (bloodSplash.parent) {
                        // Intercalar texturas periódicamente
                        if (now - lastSwap > swapInterval) {
                            const newTexture = splashTextures[Math.floor(Math.random() * splashTextures.length)];
                            bloodSplash.material.map = newTexture;
                            // También rotación aleatoria para más caos
                            bloodSplash.rotation.z = Math.random() * Math.PI * 2;
                            lastSwap = now;
                        }

                        requestAnimationFrame(animateSplash);
                    }
                } else {
                    // Fin de la animación: Desaparecer de golpe
                    if (bloodSplash.parent) {
                        this.scene.remove(bloodSplash);
                        bloodSplash.material.dispose();
                        // No hacemos dispose de las texturas aquí porque se comparten
                    }
                }
            };
            animateSplash();
        }

        // 2. Explosión adicional de partículas geométricas
        const particleCount = 75 + Math.floor(Math.random() * 36);
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const variant = this.bloodParticleVariants[
                i % this.bloodParticleVariants.length
            ];
            const particleMaterial = this.createBloodParticleMaterial(
                this.getBloodColor(enemy)
            );
            const particle = new THREE.Mesh(variant.geometry, particleMaterial);
            particle.position.copy(explosionCenter);

            // Velocidad explosiva en todas direcciones
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 18.0,
                (Math.random() * 14.0) - 3.0,
                (Math.random() - 0.5) * 18.0
            );

            particle.userData = {
                life: 1.0,
                velocity: velocity,
                rotationSpeed: { x: Math.random() * 10, y: Math.random() * 10 },
                isOnGround: false,
                variant: variant.id,
                creationTime: performance.now()
            };

            // Escala no uniforme para resaltar las siluetas de las cuatro
            // variantes y darles un aspecto más orgánico al girar.
            const s = 0.25 + Math.random() * 0.75;
            particle.scale.set(
                s * (0.75 + Math.random() * 0.45),
                s * (0.75 + Math.random() * 0.65),
                s * (0.75 + Math.random() * 0.45)
            );

            this.scene.add(particle);
            particles.push(particle);
        }

        // Estas partículas deben sobrevivir al retorno del enemigo al pool.
        this.goreParticles.push(...particles);
        this.spawnGoreShockwave(explosionCenter, enemy.userData.bloodType || 'red');
    }

    spawnGoreShockwave(position, bloodType = 'red') {
        const textureLoader = new THREE.TextureLoader();
        const texturePath = bloodType === 'white'
            ? 'assets/textures/white_blood_splash.png'
            : 'assets/textures/blood_splash4.png';
        const texture = textureLoader.load(texturePath);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.85,
            depthTest: false,
            depthWrite: false,
            alphaTest: 0.02,
            blending: THREE.NormalBlending
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);

        const initialScale = 0.6 + Math.random() * 0.6;
        sprite.scale.setScalar(initialScale);
        this.scene.add(sprite);
        this.goreSprites.push({
            sprite,
            texture,
            creationTime: performance.now(),
            duration: 350 + Math.random() * 120,
            initialScale,
            rotationSpeed: (Math.random() - 0.5) * 4.0
        });
    }

    // #region Sistema de Proyectiles Parabólicos de Sangre EnemyManager
    // Descripción: Genera proyectiles de sangre que siguen una trayectoria parabólica y manchan el suelo.
    spawnBloodProjectiles(enemy) {
        // Obtener altura del enemigo desde su collisionSize o escala
        const enemyHeight = enemy.userData.collisionSize?.y || (enemy.scale.y * 2) || 2.0;

        // Posición inicial: 0.8m por encima de la altura del enemigo (ajustado)
        const spawnCenter = enemy.position.clone();
        spawnCenter.y = enemyHeight + 0.8;

        // Cargar texturas de sangre
        const textureLoader = new THREE.TextureLoader();
        const splashTextures = this.getBloodTexturePaths(enemy.userData.bloodType)
            .map(texturePath => textureLoader.load(texturePath));
        splashTextures.forEach(texture => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
        });

        // Generar 18-30 proyectiles de sangre para formar varias ráfagas.
        const projectileCount = 18 + Math.floor(Math.random() * 13);

        // Número de ráfagas (direcciones principales de la explosión)
        const streakCount = 3 + Math.floor(Math.random() * 4); // 3 a 6 ráfagas

        for (let s = 0; s < streakCount; s++) {
            // Ángulo base para esta ráfaga
            const baseAngle = Math.random() * Math.PI * 2;
            const particlesInStreak = Math.ceil(projectileCount / streakCount);

            for (let p = 0; p < particlesInStreak; p++) {
                if (this.bloodProjectiles.length >= 260) break; // Límite global de seguridad

                // Usar sprite con textura de sangre aleatoria
                const texture = splashTextures[Math.floor(Math.random() * splashTextures.length)];
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true,
                    opacity: 0.9,
                    depthTest: true,
                    depthWrite: false,
                    alphaTest: 0.02,
                    blending: THREE.NormalBlending
                });

                const projectile = new THREE.Sprite(spriteMaterial);

                // Tamaño variado
                const scale = 0.16 + Math.random() * 0.24;
                projectile.scale.set(scale, scale, scale);

                projectile.position.copy(spawnCenter);
                // Pequeña dispersión en el origen
                projectile.position.x += (Math.random() - 0.5) * 0.4;
                projectile.position.z += (Math.random() - 0.5) * 0.4;

                projectile.material.rotation = Math.random() * Math.PI * 2;

                // Ángulo con variación alrededor del ángulo base de la ráfaga
                const angle = baseAngle + (Math.random() - 0.5) * 0.8;

                // Velocidad vertical variada
                const vy = 3.0 + Math.random() * 5.0;

                // Velocidad horizontal MUY variada para evitar el círculo
                const horizontalSpeed = 2.0 + Math.random() * 8.0; // 2-10 m/s

                const vx = Math.cos(angle) * horizontalSpeed;
                const vz = Math.sin(angle) * horizontalSpeed;

                projectile.userData = {
                    velocity: new THREE.Vector3(vx, vy, vz),
                    creationTime: performance.now(),
                    hasLanded: false,
                    rotationSpeed: (Math.random() - 0.5) * 10,
                    initialScale: scale,
                    lastTrailTime: performance.now(),
                    trailTexture: texture,
                    bloodType: enemy.userData.bloodType || 'red'
                };

                this.scene.add(projectile);
                this.bloodProjectiles.push(projectile);
            }
        }
    }

    // Crear partícula de estela
    spawnTrailParticle(position, texture) {
        const trailMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.6,
            depthTest: true,
            depthWrite: false,
            alphaTest: 0.02,
            blending: THREE.NormalBlending
        });

        const trail = new THREE.Sprite(trailMaterial);
        trail.position.copy(position);

        // Estela más pequeña
        const scale = 0.08 + Math.random() * 0.08;
        trail.scale.set(scale, scale, scale);
        trail.material.rotation = Math.random() * Math.PI * 2;

        // Datos para desvanecimiento
        trail.userData = {
            creationTime: performance.now(),
            isTrail: true
        };

        this.scene.add(trail);
        this.bloodProjectiles.push(trail);
    }

    updateBloodProjectiles(delta) {
        const toRemove = [];
        const now = performance.now();

        for (let i = 0; i < this.bloodProjectiles.length; i++) {
            const projectile = this.bloodProjectiles[i];
            if (!projectile || !projectile.userData) {
                toRemove.push(i);
                continue;
            }

            const data = projectile.userData;

            // Si es una partícula de estela, solo desvanecer
            if (data.isTrail) {
                const age = now - data.creationTime;
                const lifeDuration = 400; // 400ms de vida para estela

                if (age > lifeDuration) {
                    toRemove.push(i);
                } else {
                    // Desvanecer gradualmente
                    projectile.material.opacity = 0.6 * (1 - age / lifeDuration);
                    // Encoger ligeramente
                    const shrink = 1 - (age / lifeDuration) * 0.5;
                    projectile.scale.multiplyScalar(0.98);
                }
                continue;
            }

            // Tiempo máximo de vida: 4 segundos
            if (now - data.creationTime > 4000) {
                toRemove.push(i);
                continue;
            }

            if (!data.hasLanded) {
                // Aplicar gravedad
                data.velocity.y -= CONFIG.GRAVITY * delta;

                // Actualizar posición
                projectile.position.x += data.velocity.x * delta;
                projectile.position.y += data.velocity.y * delta;
                projectile.position.z += data.velocity.z * delta;

                // Crear estela cada 50ms
                if (now - data.lastTrailTime > 50) {
                    this.spawnTrailParticle(projectile.position.clone(), data.trailTexture);
                    data.lastTrailTime = now;
                }

                // Rotar mientras vuela
                if (projectile.material && data.rotationSpeed) {
                    projectile.material.rotation += data.rotationSpeed * delta;
                }

                // Efecto de estiramiento según velocidad
                const velocityMag = data.velocity.length();
                const stretchFactor = 1 + (velocityMag * 0.02);
                projectile.scale.y = data.initialScale * stretchFactor;

                // Detectar impacto con el suelo
                if (projectile.position.y <= 0.02) {
                    projectile.position.y = 0.02;
                    data.hasLanded = true;

                    // Crear mancha de sangre en el suelo
                    if (this.bloodDecalManager) {
                        this.bloodDecalManager.createFloorDecal(
                            projectile.position,
                            data.bloodType || 'red'
                        );
                    }

                    // Marcar para eliminación inmediata
                    toRemove.push(i);
                }
            }
        }

        // Eliminar proyectiles terminados (de atrás hacia adelante)
        for (let i = toRemove.length - 1; i >= 0; i--) {
            const index = toRemove[i];
            const projectile = this.bloodProjectiles[index];

            if (projectile) {
                if (projectile.material) {
                    // Solo disponer la textura si no es compartida (estela)
                    if (!projectile.userData.isTrail && projectile.material.map) {
                        projectile.material.map.dispose();
                    }
                    projectile.material.dispose();
                }
                this.scene.remove(projectile);
            }

            this.bloodProjectiles.splice(index, 1);
        }
    }
    // #endregion

    updateBloodParticles(enemy, delta) {
        const particles = this.bloodParticles.get(enemy);
        if (!particles || particles.length === 0) {
            this.bloodParticles.delete(enemy);
            return;
        }

        const toRemove = [];
        const now = performance.now();
        for (let i = 0; i < particles.length; i++) {
            const particle = particles[i];
            if (!particle || !particle.userData) {
                toRemove.push(i);
                continue;
            }

            const data = particle.userData;
            const age = now - data.creationTime;

            if (age > 2000) {
                toRemove.push(i);
                continue;
            }

            if (!data.isOnGround) {
                data.velocity.y -= CONFIG.GRAVITY * 2.0 * delta;
                particle.position.x += data.velocity.x * delta;
                particle.position.y += data.velocity.y * delta;
                particle.position.z += data.velocity.z * delta;

                particle.rotation.x += data.rotationSpeed.x * delta;
                particle.rotation.z += data.rotationSpeed.y * delta;

                if (particle.position.y <= 0.05) {
                    particle.position.y = 0.05;
                    data.isOnGround = true;
                    data.velocity.set(0, 0, 0);
                }
            } else {
                data.life -= delta * 0.8;
            }

            if (particle.material) {
                particle.material.opacity = Math.max(0, data.life);
            }

            if (data.life <= 0) {
                toRemove.push(i);
            }
        }

        for (let i = toRemove.length - 1; i >= 0; i--) {
            const index = toRemove[i];
            const particle = particles[index];

            if (particle) {
                if (particle.material) {
                    particle.material.dispose();
                }
                this.scene.remove(particle);
            }

            particles.splice(index, 1);
        }

        if (particles.length === 0) {
            this.bloodParticles.delete(enemy);
        }
    }

    updateGoreParticles(delta) {
        const now = performance.now();

        for (let i = this.goreParticles.length - 1; i >= 0; i--) {
            const particle = this.goreParticles[i];
            const data = particle?.userData;

            if (!particle || !data || now - data.creationTime > 3500) {
                if (particle) {
                    if (particle.material) particle.material.dispose();
                    this.scene.remove(particle);
                }
                this.goreParticles.splice(i, 1);
                continue;
            }

            if (!data.isOnGround) {
                data.velocity.y -= CONFIG.GRAVITY * 2.0 * delta;
                particle.position.addScaledVector(data.velocity, delta);
                particle.rotation.x += data.rotationSpeed.x * delta;
                particle.rotation.z += data.rotationSpeed.y * delta;

                if (particle.position.y <= 0.05) {
                    particle.position.y = 0.05;
                    data.isOnGround = true;
                    data.velocity.set(0, 0, 0);
                }
            } else {
                data.life -= delta * 0.55;
                particle.rotation.y += data.rotationSpeed.y * delta;
            }

            if (particle.material) {
                particle.material.opacity = Math.max(0, data.life);
            }

            if (data.life <= 0) {
                if (particle.material) particle.material.dispose();
                this.scene.remove(particle);
                this.goreParticles.splice(i, 1);
            }
        }
    }

    updateGoreSprites(delta) {
        const now = performance.now();

        for (let i = this.goreSprites.length - 1; i >= 0; i--) {
            const effect = this.goreSprites[i];
            const sprite = effect?.sprite;

            if (!effect || !sprite || !sprite.parent) {
                if (sprite?.material) sprite.material.dispose();
                if (effect?.texture) effect.texture.dispose();
                this.goreSprites.splice(i, 1);
                continue;
            }

            const progress = (now - effect.creationTime) / effect.duration;
            if (progress >= 1) {
                this.scene.remove(sprite);
                sprite.material.dispose();
                effect.texture.dispose();
                this.goreSprites.splice(i, 1);
                continue;
            }

            const easedProgress = 1 - Math.pow(1 - progress, 2);
            const scale = effect.initialScale * (1 + easedProgress * 1.2);
            sprite.scale.setScalar(scale);
            sprite.rotation.z += effect.rotationSpeed * delta;
            sprite.material.opacity = 0.85 * (1 - progress);
        }
    }

    clearBloodParticles(enemy) {
        // Limpiar splashes de sangre inmediatamente
        if (enemy.userData.bloodSplashes && enemy.userData.bloodSplashes.length > 0) {
            enemy.userData.bloodSplashes.forEach(splash => {
                if (splash && splash.parent) {
                    this.scene.remove(splash);
                    if (
                        splash.material &&
                        splash.material.map &&
                        !splash.userData?.sharedBloodTexture
                    ) {
                        splash.material.map.dispose();
                    }
                    if (splash.material) {
                        splash.material.dispose();
                    }
                }
            });
            enemy.userData.bloodSplashes = [];
        }

        const particles = this.bloodParticles.get(enemy);
        if (!particles) return;
        particles.forEach(particle => {
            if (particle) {
                if (particle.material) {
                    particle.material.dispose();
                }
                this.scene.remove(particle);
            }
        });

        this.bloodParticles.delete(enemy);
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
