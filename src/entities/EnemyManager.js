// #region Importaciones EnemyManager
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, ENEMY_TYPES, AUDIO_CONFIG } from '../Constants.js';
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
        this.sharedMaterial = null;

        this.enemyPool = [];
        this.maxPoolSize = 20;
        this.activeEnemies = new Set();

        this.spawnPoints = [];
        this.walls = world.getWalls();
        this.bloodParticles = new Map();
        this.bloodGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        this.bloodMaterial = new THREE.MeshBasicMaterial({
            color: 0xcc0000,
            transparent: true,
            opacity: 1.0
        });
        this.enemyCollisionHelpers = new Map();
        this.projectiles = [];
        this.projectileGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        this.projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        this.activeSoundSources = [];

        // Sistema de proyectiles de sangre parabólicos
        this.bloodProjectiles = [];

        // Partículas de gore de muerte: no dependen del enemigo reutilizable del pool.
        this.goreParticles = [];
        this.goreSprites = [];

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

    getBloodColor(enemy) {
        return enemy.userData.bloodColor ?? 0xcc0000;
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
        const halfPixelX = 0.5 / textureWidth;
        const halfPixelY = 0.5 / textureHeight;

        // PlaneGeometry tiene las UV ordenadas como: arriba-izquierda,
        // arriba-derecha, abajo-izquierda, abajo-derecha. Se deja medio píxel
        // de margen para que nunca entre el frame contiguo del atlas.
        const u0 = (column * frameWidth) / textureWidth + halfPixelX;
        const u1 = ((column + 1) * frameWidth) / textureWidth - halfPixelX;
        const v0 = 1 - ((row + 1) * frameHeight) / textureHeight + halfPixelY;
        const v1 = 1 - (row * frameHeight) / textureHeight - halfPixelY;

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

    configureBloodEffects(enemy, height) {
        enemy.userData.drawBlood = (hitPosition = null) => {
            const actualHitPosition = enemy.position.clone();
            actualHitPosition.y = height / 2.0;

            const forward = new THREE.Vector3(0, 0, 1);
            forward.applyQuaternion(enemy.quaternion);
            forward.multiplyScalar(0.5);

            actualHitPosition.add(forward);
            const particles = this.createBloodParticles(enemy, actualHitPosition);
            this.bloodParticles.set(enemy, particles);

            this.bloodDecalManager.spawnBloodSplatter(
                actualHitPosition,
                forward,
                enemy.userData.bloodType || 'red'
            );
        };

        enemy.userData.clearBlood = () => { this.clearBloodParticles(enemy); };
    }

    // #region Sistema de Partículas EnemyManager
    createBloodParticles(enemy, hitPosition) {
        const existingParticles = this.bloodParticles.get(enemy);

        // Recycle old particles if too many
        if (existingParticles && existingParticles.length > 50) {
            const particlesToRemove = existingParticles.length - 30; // Keep 30, make room for new ones
            for (let i = 0; i < particlesToRemove; i++) {
                const p = existingParticles.shift();
                if (p) {
                    if (p.material) p.material.dispose();
                    this.scene.remove(p);
                }
            }
        }

        const particles = existingParticles || [];
        const particleCount = 18 + Math.floor(Math.random() * 12);

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
                bloodSplash.material.opacity -= 0.05; // Desvanecimiento más rápido
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
        setTimeout(fadeOut, 300); // Durar un poco más

        for (let i = 0; i < particleCount; i++) {
            const particleMaterial = this.bloodMaterial.clone();
            particleMaterial.color.setHex(this.getBloodColor(enemy));
            const particle = new THREE.Mesh(this.bloodGeometry, particleMaterial);
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
                creationTime: performance.now(),
            };
            const scale = 0.35 + Math.random() * 0.55;
            particle.scale.set(scale, scale, scale);

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
            const duration = 550; // Mantener el estallido visible algo más de tiempo
            let lastSwap = 0;
            const swapInterval = 150; // Cambiar sprite cada 150ms (más lento)

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
            const particleMaterial = this.bloodMaterial.clone();
            particleMaterial.color.setHex(this.getBloodColor(enemy));
            const particle = new THREE.Mesh(this.bloodGeometry, particleMaterial);
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
                creationTime: performance.now()
            };

            // Partículas geométricas pequeñas para acompañar el splash.
            const s = 0.25 + Math.random() * 0.75;
            particle.scale.set(s, s, s);

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
            duration: 650 + Math.random() * 250,
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
                    if (splash.material && splash.material.map) {
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
    getRandomEnemyType() {
        const weightedTypes = [];
        ENEMY_TYPES.filter(enemyType => enemyType.spawnWeight > 0).forEach(enemyType => {
            for (let i = 0; i < enemyType.spawnWeight; i++) {
                weightedTypes.push(enemyType);
            }
        });
        return weightedTypes[Math.floor(Math.random() * weightedTypes.length)];
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
            enemy.userData.speed = type.speed;
            enemy.userData.damage = type.damage;
            enemy.userData.enemyType = type.id;
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
            enemy.userData.lastShootTime = performance.now();
            enemy.userData.projectileOffsetX = type.projectileOffsetX || 0;
            enemy.userData.projectileOffsetY = type.projectileOffsetY || 0;
            enemy.userData.projectileOffsetZ = type.projectileOffsetZ || 0;

            enemy.userData.walkAnimTimer = 0;
            enemy.userData.walkAnimState = false;
            enemy.userData.isShooting = false;
            enemy.userData.isDying = false;

            enemy.scale.set(width / 2.0, height / 2.0, 1.0);
            this.setEnemySpriteOffset(enemy, type);
            enemy.material = this.createEnemyMaterial(type);
            this.initializeEnemyAnimation(enemy, type);
            this.clearBloodParticles(enemy);
            this.configureBloodEffects(enemy, height);

            if (!this.enemyCollisionHelpers.has(enemy)) {
                const box = new THREE.Box3();
                const helper = new THREE.Box3Helper(box, 0xff0000);
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
        enemy.userData.speed = type.speed;
        enemy.userData.damage = type.damage;
        enemy.userData.enemyType = type.id;
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
        enemy.userData.lastShootTime = performance.now();

        enemy.userData.projectileOffsetX = type.projectileOffsetX || 0;
        enemy.userData.projectileOffsetY = type.projectileOffsetY || 0;
        enemy.userData.projectileOffsetZ = type.projectileOffsetZ || 0;

        enemy.userData.walkAnimTimer = 0;
        enemy.userData.walkAnimState = false;
        enemy.userData.isShooting = false;
        enemy.userData.isDying = false;

        this.initializeEnemyAnimation(enemy, type);

        this.configureBloodEffects(enemy, height);
        enemy.userData.collisionSize = { x: width * 0.2, y: height, z: width * 0.2 };

        const helperBox = new THREE.Box3();
        const helper = new THREE.Box3Helper(helperBox, 0xff0000);
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
        enemy.userData.isShooting = false;
        enemy.userData.isDying = false;
        enemy.userData.animationName = null;
        enemy.userData.animationFrame = 0;
        enemy.userData.animationTimer = 0;
        enemy.userData.attackAnimUntil = 0;
        enemy.userData.deathEndsAt = 0;

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

    // #region Sistema de Spawning EnemyManager
    // Descripción: Lógica para instanciar enemigos en el juego, controlando tipos, posiciones y límites de población.
    spawn(time, specificType = null, specificPosition = null) {
        if (specificPosition || time - this.lastSpawnTime > CONFIG.ENEMY_SPAWN_RATE) {
            const enemyType = specificType ||
                this.getRandomEnemyType();

            const enemy = this.getEnemyFromPool(enemyType);

            const spawnHeight = (enemyType.height || 2.0) / 2.0;
            const spawnPoint = specificPosition
                ?
                specificPosition
                : (this.spawnPoints.length > 0
                    ? this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)].position
                    : new THREE.Vector3(
                        (Math.random() - 0.5) * 100,
                        1,
                        (Math.random() - 0.5) * 100
                    ));
            enemy.position.copy(spawnPoint);

            if (specificPosition && specificPosition.y === 1) {
                enemy.position.y = spawnHeight;
            } else if (!specificPosition) {
                enemy.position.y = spawnHeight;
            }

            enemy.visible = true;
            if (!this.activeEnemies.has(enemy)) {
                this.scene.add(enemy);
                this.enemies.push(enemy);
                this.activeEnemies.add(enemy);
            }

            if (this.audioManager) {
                this.audioManager.playRandomEnemySound(enemyType);
            }

            if (!specificPosition) {
                this.lastSpawnTime = time;
            }
        }
    }
    // #endregion

    // #region Sistema de Proyectiles EnemyManager
    // Descripción: Gestiona el disparo de proyectiles por parte de los enemigos, configurando su dirección, velocidad y daño.
    shootProjectile(enemy, targetPos) {
        const size = enemy.userData.projectileSize ||
            0.3;

        const projectileGeo = new THREE.SphereGeometry(size, 8, 8);
        const projectile = new THREE.Mesh(projectileGeo, this.projectileMaterial);
        const spawnPos = new THREE.Vector3(
            enemy.position.x + enemy.userData.projectileOffsetX,
            enemy.position.y + enemy.userData.projectileOffsetY,
            enemy.position.z + enemy.userData.projectileOffsetZ
        );
        projectile.position.copy(spawnPos);

        const direction = new THREE.Vector3().subVectors(targetPos, spawnPos).normalize();

        projectile.userData = {
            velocity: direction.multiplyScalar(enemy.userData.projectileSpeed),
            damage: enemy.userData.damage,
            radius: size
        };
        this.scene.add(projectile);
        this.projectiles.push(projectile);

        enemy.userData.isShooting = true;
        const typeInfo = ENEMY_TYPES.find(type => type.id === enemy.userData.enemyType);
        if (!this.isSpriteSheetEnemy(typeInfo) && this.enemyShootTextures[enemy.userData.enemyType]) {
            enemy.material.map = this.enemyShootTextures[enemy.userData.enemyType];
            enemy.material.needsUpdate = true;
        }

        setTimeout(() => {
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
        }, 700);
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
    update(delta, playerPos, onHitPlayer) {
        const tempEnemyBox = new THREE.Box3();
        const now = performance.now();

        this.cleanupFinishedSounds();

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (!enemy.visible) continue;

            const typeInfo = ENEMY_TYPES.find(t => t.id === enemy.userData.enemyType);

            if (enemy.userData.isDying) {
                this.updateEnemyVisual(enemy, typeInfo, false, now, delta);
                if (now >= enemy.userData.deathEndsAt) {
                    this.finalizeEnemyRemoval(enemy);
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
                if (now - enemy.userData.lastShootTime > enemy.userData.shootRate) {
                    const target = playerPos.clone();
                    target.y -= 0.5;
                    this.shootProjectile(enemy, target);
                    enemy.userData.lastShootTime = now;
                }
            }
            const direction = new THREE.Vector3();
            direction.subVectors(playerPos, enemy.position).normalize();
            const moveDist = enemy.userData.speed * delta;
            const tentativePos = enemy.position.clone().addScaledVector(direction, moveDist);

            tentativePos.y += enemy.userData.velocity.y * delta;
            const s = enemy.userData.collisionSize;
            tempEnemyBox.min.set(
                tentativePos.x - s.x,
                tentativePos.y - s.y * 0.5,
                tentativePos.z - s.z
            );
            tempEnemyBox.max.set(
                tentativePos.x + s.x,
                tentativePos.y + s.y * 0.5,
                tentativePos.z + s.z
            );
            if (this.enemyCollisionHelpers.has(enemy)) {
                const helper = this.enemyCollisionHelpers.get(enemy);
                helper.visible = CONFIG.DEBUG_SHOW_HITBOXES;
                helper.box.copy(tempEnemyBox);
                helper.updateMatrixWorld(true);
            }

            let blocked = false;
            for (const wall of this.walls) {
                if (!wall.userData.boundingBox) continue;
                if (tempEnemyBox.intersectsBox(wall.userData.boundingBox)) {
                    blocked = true;
                    break;
                }
            }

            let isMoving = false;
            if (!blocked) {
                enemy.position.copy(tentativePos);
                isMoving = direction.lengthSq() > 0.0001;
            }

            const floorHeight = s.y / 2.0;
            if (enemy.position.y <= floorHeight) {
                enemy.userData.velocity.y = 0;
                enemy.position.y = floorHeight;
                enemy.userData.canJump = true;
            }

            if (enemy.position.distanceTo(playerPos) < 2.5) {
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
    finalizeEnemyRemoval(enemy) {
        this.scene.remove(enemy);
        this.enemies = this.enemies.filter(e => e !== enemy);
        this.activeEnemies.delete(enemy);
        this.returnEnemyToPool(enemy);
    }

    removeEnemy(enemy) {
        if (!enemy || enemy.userData.isDying) return;

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
        if (deathAnimation) {
            const deathStart = performance.now();
            enemy.userData.isDying = true;
            enemy.userData.hp = 0;
            enemy.userData.maxHp = 0;
            enemy.userData.isShooting = false;
            enemy.userData.attackAnimUntil = 0;
            enemy.userData.velocity.set(0, 0, 0);
            enemy.userData.deathEndsAt = deathStart + Math.max(
                0.45,
                this.getSpriteSheetAnimationDuration(deathAnimation)
            ) * 1000;

            if (this.enemyCollisionHelpers.has(enemy)) {
                this.enemyCollisionHelpers.get(enemy).visible = false;
            }

            this.updateEnemyVisual(enemy, typeInfo, false, deathStart, 0);
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

        if (this.bloodGeometry) this.bloodGeometry.dispose();
        if (this.bloodMaterial) this.bloodMaterial.dispose();

        this.enemyCollisionHelpers.forEach(helper => {
            this.scene.remove(helper);
        });
        this.enemyCollisionHelpers.clear();

        this.projectiles.forEach(p => this.scene.remove(p));
        this.projectiles = [];
        if (this.projectileGeometry) this.projectileGeometry.dispose();
        if (this.projectileMaterial) this.projectileMaterial.dispose();

        const allEnemies = new Set([...this.enemies, ...this.enemyPool]);
        allEnemies.forEach(enemy => {
            if (enemy.geometry && enemy.geometry !== this.sharedGeometry) {
                enemy.geometry.dispose();
            }
            this.disposeEnemyMaterial(enemy);
        });
        if (this.sharedGeometry) this.sharedGeometry.dispose();

        const allEnemyTextures = new Set([
            ...Object.values(this.enemyTextures),
            ...Object.values(this.enemyWalkTextures),
            ...Object.values(this.enemyShootTextures)
        ]);
        allEnemyTextures.forEach(texture => texture.dispose());
        this.enemies = [];
        this.enemyPool = [];
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
    }
    // #endregion
}
// #endregion
