// Extraído de src/entities/EnemyManager.js — se ejecuta con .call(this).
// La clase original delega en estas funciones; no duplicar lógica aquí y allí.
// #region Importaciones EnemyManager
import * as THREE from 'three';
import {
    CONFIG,
    ENEMY_TYPES,
    AUDIO_CONFIG,
    GENERIC_DEATH_SPRITE_SHEET,
    HIT_BLOOD_SPRITE_VARIANTS
} from '../../Constants.js';
import { BloodDecalManager } from '../../core/BloodDecalManager.js';
// #endregion

// #region Clase EnemyManager

export function getBloodTexturePaths(bloodType = 'red') {
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

export function getHitBloodSpritePaths(bloodType = 'red') {
        return bloodType === 'white'
            ? ['assets/textures/white_blood_splash.png']
            : HIT_BLOOD_SPRITE_VARIANTS;
}

export function clampBloodHitPosition(enemy, hitPosition) {
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

export function getBloodColor(enemy) {
        return enemy.userData.bloodColor ?? 0xcc0000;
}

export function createBloodParticleMaterial(color) {
        const material = this.bloodMaterial.clone();
        material.color.setHex(color);
        if (material.emissive) {
            material.emissive.copy(material.color).multiplyScalar(0.12);
        }
        return material;
}

export function configureBloodEffects(enemy) {
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

export function getCachedBloodSpriteTexture(texturePath) {
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

export function createHitBloodSpriteCloud(enemy, hitPosition, forwardDirection) {
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

export function createBloodParticles(enemy, hitPosition) {
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

export function spawnMassiveBloodSplash(enemy) {
        const explosionCenter = enemy.position.clone();
        explosionCenter.y += 1.0; // Centro del cuerpo

        // 1. Crear pocos sprites de sangre (4-7), pero mucho más grandes.
        const spriteCount = 4 + Math.floor(Math.random() * 4);

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

            // Tamaño grande y ligeramente deformado para que no parezcan clones.
            const scale = 1.6 + Math.random() * 1.8;
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
        const particleCount = 32 + Math.floor(Math.random() * 17);
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
            const s = 0.65 + Math.random() * 0.75;
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

export function spawnGoreShockwave(position, bloodType = 'red') {
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

        const initialScale = 1.1 + Math.random() * 0.8;
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

export function spawnBloodProjectiles(enemy) {
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

        // Generar solo 5-8 proyectiles: cada impacto deja una mancha grande.
        const projectileCount = 5 + Math.floor(Math.random() * 4);

        // Número de ráfagas (direcciones principales de la explosión)
        const streakCount = 2 + Math.floor(Math.random() * 2); // 2 a 3 ráfagas

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

                // Gotas grandes para acompañar las pocas manchas del suelo.
                const scale = 0.30 + Math.random() * 0.30;
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

export function spawnTrailParticle(position, texture) {
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

export function updateBloodProjectiles(delta) {
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

export function updateBloodParticles(enemy, delta) {
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

export function updateGoreParticles(delta) {
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

export function updateGoreSprites(delta) {
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

export function clearBloodParticles(enemy) {
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
