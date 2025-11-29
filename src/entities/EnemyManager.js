/*sección [INICIALIZACIÓN Y CONFIGURACIÓN] Configuración inicial del gestor de enemigos, texturas, geometrías compartidas y sistema de pooling*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, ENEMY_TYPES, AUDIO_CONFIG } from '../Constants.js';

export class EnemyManager {

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
    }

    /*[Fin de sección]*/

    /* sección [SISTEMA DE PARTÍCULAS DE SANGRE] Creación, actualización y gestión de partículas de sangre con física y efectos visuales */

    createBloodParticles(enemy, hitPosition) {
        const existingParticles = this.bloodParticles.get(enemy);
        if (existingParticles && existingParticles.length > 50) {
            return existingParticles;
        }

        const particles = existingParticles || [];
        const particleCount = 12 + Math.floor(Math.random() * 8);

        const spawnPos = hitPosition ? hitPosition.clone() : enemy.position.clone();
        if (!hitPosition) {
            spawnPos.y += 1.0;
        }

        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(this.bloodGeometry, this.bloodMaterial.clone());
            particle.position.copy(spawnPos);

            particle.position.x += (Math.random() - 0.5) * 0.4;
            particle.position.y += (Math.random() - 0.5) * 0.4;
            particle.position.z += (Math.random() - 0.5) * 0.4;

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
                    y: (Math.random()
                        - 0.5) * 10.0
                },
                isOnGround: false,
                creationTime: performance.now(),
            };
            const scale = 0.5 + Math.random() * 0.8;
            particle.scale.set(scale, scale, scale);

            particles.push(particle);
            this.scene.add(particle);
        }

        this.bloodParticles.set(enemy, particles);
        return particles;
    }

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

    clearBloodParticles(enemy) {
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

    /* [Fin de sección] */

    /*sección [GESTIÓN DE ENEMIGOS Y PROYECTILES] Sistema de pooling de enemigos, spawn, actualización con IA, disparos y detección de colisiones*/
    getRandomEnemyType() {
        const weightedTypes = [];
        ENEMY_TYPES.forEach(enemyType => {
            for (let i = 0; i < enemyType.spawnWeight; i++) {
                weightedTypes.push(enemyType);
            }
        });
        return weightedTypes[Math.floor(Math.random() * weightedTypes.length)];
    }

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
            enemy.visible = true;
            enemy.userData.hp = type.hp;
            enemy.userData.maxHp = type.hp;
            enemy.userData.speed = type.speed;
            enemy.userData.damage = type.damage;
            enemy.userData.enemyType = type.id;
            enemy.userData.bloodTime = 0;
            enemy.userData.velocity = new THREE.Vector3();
            enemy.userData.canJump = false;
            enemy.userData.lastMeleeAttackTime = 0; // Initialize cooldown

            enemy.userData.lastSoundTime = performance.now();

            enemy.userData.isShooter = isShooter;
            enemy.userData.shootRate = shootRate;
            enemy.userData.projectileSpeed = projSpeed;
            enemy.userData.projectileSize = projSize;
            enemy.userData.lastShootTime = performance.now();

            enemy.userData.walkAnimTimer = 0;
            enemy.userData.walkAnimState = false;
            enemy.userData.isShooting = false;

            enemy.scale.set(width / 2.0, height / 2.0, 1.0);
            enemy.material = new THREE.MeshBasicMaterial({
                map: this.enemyTextures[type.id],
                transparent: true,
                alphaTest: 0.01
            });
            this.clearBloodParticles(enemy);

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

        const textureLoader = new THREE.TextureLoader();
        const enemyTexture = textureLoader.load(type.texture);
        enemyTexture.colorSpace = THREE.SRGBColorSpace;
        const enemyMaterial = new THREE.MeshBasicMaterial({
            map: enemyTexture,
            transparent: true,
            depthWrite: false,
            alphaTest: 0.01
        });
        const enemy = new THREE.Mesh(this.sharedGeometry, enemyMaterial);
        enemy.scale.set(width / 2.0, height / 2.0, 1.0);

        enemy.matrixAutoUpdate = true;
        enemy.userData.hp = type.hp;
        enemy.userData.maxHp = type.hp;
        enemy.userData.speed = type.speed;
        enemy.userData.damage = type.damage;
        enemy.userData.enemyType = type.id;
        enemy.userData.bloodTime = 0;
        enemy.userData.velocity = new THREE.Vector3();
        enemy.userData.canJump = false;
        enemy.userData.lastMeleeAttackTime = 0; // Initialize cooldown

        enemy.userData.lastSoundTime = performance.now();

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

        enemy.userData.drawBlood = (hitPosition = null) => {
            const actualHitPosition = enemy.position.clone();
            actualHitPosition.y = height / 2.0;

            const forward = new THREE.Vector3(0, 0, 1);
            forward.applyQuaternion(enemy.quaternion);
            forward.multiplyScalar(0.5);

            actualHitPosition.add(forward);
            const particles = this.createBloodParticles(enemy, actualHitPosition);
            this.bloodParticles.set(enemy, particles);
        };

        enemy.userData.clearBlood = () => { this.clearBloodParticles(enemy); };
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
            if (enemy.parent) this.scene.remove(enemy);
        }
    }

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

            const tex = this.enemyTextures[enemy.userData.enemyType];
            enemy.material = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.01
            });
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
        if (this.enemyShootTextures[enemy.userData.enemyType]) {
            enemy.material.map = this.enemyShootTextures[enemy.userData.enemyType];
            enemy.material.needsUpdate = true;
        }

        setTimeout(() => {
            enemy.userData.isShooting = false;
            const currentTexture = enemy.userData.walkAnimState
                ? this.enemyWalkTextures[enemy.userData.enemyType]
                : this.enemyTextures[enemy.userData.enemyType];
            if (currentTexture) {
                enemy.material.map = currentTexture;
                enemy.material.needsUpdate = true;
            }
        }, 700);
    }

    update(delta, playerPos, onHitPlayer) {
        const tempEnemyBox = new THREE.Box3();
        const now = performance.now();

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (!enemy.visible) continue;

            if (enemy.userData.hp < enemy.userData.maxHp) {
                if (this.audioManager) {
                    this.audioManager.playSound('enemyHit', 0.5);
                }
                enemy.userData.maxHp = enemy.userData.hp;
            }

            // ★ SONIDOS 3D ALEATORIOS
            if (this.audioManager && Math.random() < AUDIO_CONFIG.ENEMY_SOUND_CHANCE) {
                if (now - enemy.userData.lastSoundTime > AUDIO_CONFIG.ENEMY_SOUND_COOLDOWN) {
                    const typeInfo = ENEMY_TYPES.find(t => t.id === enemy.userData.enemyType);
                    if (typeInfo && typeInfo.sounds && typeInfo.sounds.length > 0) {
                        const randomSound = typeInfo.sounds[Math.floor(Math.random() * typeInfo.sounds.length)];
                        const vol = 0.3 + Math.random() * 0.3;

                        // ★ REPRODUCCIÓN 3D
                        this.audioManager.play3DSound(
                            randomSound,
                            playerPos,
                            enemy.position,
                            60,
                            vol
                        );

                        enemy.userData.lastSoundTime = now;
                    }
                }
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

            if (!blocked) {
                enemy.position.copy(tentativePos);

                if (!enemy.userData.isShooting && this.enemyWalkTextures[enemy.userData.enemyType]) {
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
            }

            const floorHeight = s.y / 2.0;
            if (enemy.position.y <= floorHeight) {
                enemy.userData.velocity.y = 0;
                enemy.position.y = floorHeight;
                enemy.userData.canJump = true;
            }

            if (enemy.position.distanceTo(playerPos) < 2.5) {
                if (now - enemy.userData.lastMeleeAttackTime > 500) { // 0.5s cooldown
                    onHitPlayer(enemy.userData.damage);
                    enemy.userData.lastMeleeAttackTime = now;
                }
            }
        }

        const projBox = new THREE.Box3();
        const playerHitBox = new THREE.Box3().setFromCenterAndSize(playerPos, new THREE.Vector3(1, 2, 1));

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.position.addScaledVector(proj.userData.velocity, delta);
            const r = proj.userData.radius;
            projBox.min.set(proj.position.x - r, proj.position.y - r, proj.position.z - r);
            projBox.max.set(proj.position.x + r, proj.position.y + r, proj.position.z + r);
            let destroyed = false;

            if (projBox.intersectsBox(playerHitBox)) {
                onHitPlayer(proj.userData.damage);
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
    }

    removeEnemy(enemy) {
        this.clearBloodParticles(enemy);

        if (this.audioManager) {
            this.audioManager.playSound('enemyDeath', 0.5);
        }

        this.scene.remove(enemy);
        this.enemies = this.enemies.filter(e => e !== enemy);
        this.activeEnemies.delete(enemy);
        this.returnEnemyToPool(enemy);
    }

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

        this.enemies.forEach(enemy => {
            if (enemy.geometry) enemy.geometry.dispose();
            if (enemy.material) enemy.material.dispose();
        });
        this.enemies = [];
        this.enemyPool = [];
        this.activeEnemies.clear();
    }
}

/*[Fin de sección]*/