/*sección [GESTOR DE ENEMIGOS] Código de gestión de enemigos*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, ENEMY_TYPES } from '../Constants.js';

export class EnemyManager {

    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.enemies = [];
        this.lastSpawnTime = 0;

        this.sharedGeometry = new THREE.PlaneGeometry(2, 2);

        const textureLoader = new THREE.TextureLoader();
        this.enemyTextures = {};
        ENEMY_TYPES.forEach(enemyType => {
            this.enemyTextures[enemyType.id] = textureLoader.load(enemyType.texture);
            this.enemyTextures[enemyType.id].colorSpace = THREE.SRGBColorSpace;
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

        // ⭐ Helpers de colisión, ahora controlados por CONFIG.DEBUG_SHOW_HITBOXES
        this.enemyCollisionHelpers = new Map();
    }

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
                    y: (Math.random() - 0.5) * 10.0
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
        const type = enemyType || this.getRandomEnemyType();
        
        const width = type.width || 2.0;
        const height = type.height || 2.0;

        if (this.enemyPool.length > 0) {
            const enemy = this.enemyPool.pop();
            enemy.visible = true;
            enemy.userData.hp = type.hp;
            enemy.userData.speed = type.speed;
            enemy.userData.damage = type.damage;
            enemy.userData.enemyType = type.id;
            enemy.userData.bloodTime = 0;
            enemy.userData.velocity = new THREE.Vector3();
            enemy.userData.canJump = false;

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

                // ⭐ Aquí se respeta el toggle
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
        enemy.userData.speed = type.speed;
        enemy.userData.damage = type.damage;
        enemy.userData.enemyType = type.id;
        enemy.userData.bloodTime = 0;
        enemy.userData.velocity = new THREE.Vector3();
        enemy.userData.canJump = false;

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

        // ⭐ Respeta el toggle
        helper.visible = CONFIG.DEBUG_SHOW_HITBOXES;

        this.scene.add(helper);
        this.enemyCollisionHelpers.set(enemy, helper);

        return enemy;
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

    returnEnemyToPool(enemy) {
        enemy.visible = false;
        enemy.userData.hp = 200;
        enemy.userData.velocity.set(0, 0, 0);

        this.clearBloodParticles(enemy);

        if (this.enemyCollisionHelpers.has(enemy)) {
            const helper = this.enemyCollisionHelpers.get(enemy);
            helper.visible = CONFIG.DEBUG_SHOW_HITBOXES;
        }

        if (this.enemyPool.length < this.maxPoolSize) {
            this.enemyPool.push(enemy);
        } else {
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
                ? specificPosition
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

            if (!specificPosition) {
                this.lastSpawnTime = time;
            }
        }
    }

    update(delta, playerPos, onHitPlayer) {
        const tempEnemyBox = new THREE.Box3();

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (!enemy.visible) continue;

            enemy.userData.velocity.x -= enemy.userData.velocity.x * 10.0 * delta;
            enemy.userData.velocity.z -= enemy.userData.velocity.z * 10.0 * delta;
            enemy.userData.velocity.y -= CONFIG.GRAVITY * delta;

            enemy.lookAt(playerPos.x, enemy.position.y, playerPos.z);

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

                // ⭐ Mostrar u ocultar dinámicamente si se cambia CONFIG.DEBUG_SHOW_HITBOXES
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
            }

            const floorHeight = s.y / 2.0;
            if (enemy.position.y <= floorHeight) {
                enemy.userData.velocity.y = 0;
                enemy.position.y = floorHeight;
                enemy.userData.canJump = true;
            }

            if (enemy.position.distanceTo(playerPos) < 2.5) {
                onHitPlayer(enemy.userData.damage);
            }
        }

        const allBloodKeys = Array.from(this.bloodParticles.keys());
        for (const enemy of allBloodKeys) {
            this.updateBloodParticles(enemy, delta);
        }
    }

    removeEnemy(enemy) {
        this.clearBloodParticles(enemy);

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