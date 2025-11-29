/*sección [JUGADOR] Código de gestión del jugador*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG } from '../Constants.js';
import { WeaponSystem } from './Weapon.js';
import { UIManager } from '../UI.js';
import { Door } from '../entities/Door.js';
import { PointerLockControls } from '../../node_modules/three/examples/jsm/controls/PointerLockControls.js';
export class Player {

    constructor(scene, camera, domElement, enemyManager, world, audioManager) {

        this.controls = new PointerLockControls(camera, domElement);
        this.camera = camera;
        this.audioManager = audioManager;

        scene.add(camera);

        this.world = world;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moveFlags = { fwd: false, bwd: false, left: false, right: false };
        this.canJump = false;

        this.health = 100;
        this.score = 0;
        this.isGameOver = false;

        this.radius = 2.0;

        camera.position.set(0, CONFIG.PLAYER_HEIGHT, 0);
        this.weaponSystem = new WeaponSystem(camera, enemyManager, audioManager, this);
        this.isShooting = false;

        this.initEvents(domElement);
    }


    teleport(position, rotation = 0) {
        this.camera.position.copy(position);
        this.camera.position.y = CONFIG.PLAYER_HEIGHT;
        this.velocity.set(0, 0, 0);

        const rotationRadians = (rotation * Math.PI) / 180;
        this.camera.rotation.y = rotationRadians;

        this.camera.updateMatrixWorld(true);
    }

    initEvents(domElement) {
        const startScreen = document.getElementById('start-screen');
        startScreen.addEventListener('click', () => {
            // ⭐ NUEVO: Reanudamos el audio tras el clic del usuario (User Gesture)
            if (this.audioManager) {
                this.audioManager.resume();
            }

            if (!this.isGameOver) this.controls.lock();
        });
        this.controls.addEventListener('lock', () => UIManager.togglePauseScreen(true, this.isGameOver));
        this.controls.addEventListener('unlock', () => UIManager.togglePauseScreen(false, this.isGameOver));

        document.addEventListener('keydown', (e) => this.onKey(e, true));
        document.addEventListener('keyup', (e) => this.onKey(e, false));
        document.addEventListener('mousedown', () => this.onMouseDown());
        document.addEventListener('mouseup', () => this.onMouseUp());

        document.addEventListener('wheel', (e) => this.weaponSystem.switchWeapon(e.deltaY));

        const screamButton = document.getElementById('scream-button');
        if (screamButton) {
            screamButton.addEventListener('click', () => this.scream());
        }
    }

    onKey(event, isDown) {
        switch (event.code) {
            case 'ArrowUp': case 'KeyW': this.moveFlags.fwd = isDown;
                break;
            case 'ArrowLeft': case 'KeyA': this.moveFlags.left = isDown; break;
            case 'ArrowDown': case 'KeyS': this.moveFlags.bwd = isDown; break;
            case 'ArrowRight': case 'KeyD': this.moveFlags.right = isDown; break;
            case 'Space':
                if (isDown && this.canJump) {
                    this.velocity.y += CONFIG.JUMP_FORCE;
                    this.canJump = false;
                }
                break;
            case 'KeyE':
                if (isDown) {
                    if (Door.tryOpenNearest(this.getPosition())) {
                        console.log("PUERTA ABIERTA");
                        if (this.audioManager) {
                            this.audioManager.playSound('doorOpen', 0.5);
                        }
                    }
                }
                break;
            case 'KeyV':
                if (isDown) {
                    this.scream();
                }
                break;
        }
    }

    scream() {
        if (this.audioManager && this.controls.isLocked && !this.isGameOver) {
            this.audioManager.playSound('playerScream', 1.0, false, 0.9 + Math.random() * 0.2);
            console.log("¡GRITO!");
        }
    }

    onMouseDown() {
        if (this.controls.isLocked && !this.isGameOver) {
            this.isShooting = true;
            this.weaponSystem.tryShoot(() => {
                this.score++;
                UIManager.updateScore(this.score);
            });
        }
    }

    onMouseUp() {
        this.isShooting = false;
    }

    takeDamage(damageAmount = 1) {
        if (this.isGameOver) return;
        this.health -= damageAmount;
        UIManager.updateHealth(this.health);

        if (this.audioManager) {
            this.audioManager.playSound('playerHurt', 0.6, false, 0.9 + Math.random() * 0.2);
        }

        if (this.health <= 0) {
            this.isGameOver = true;
            this.controls.unlock();
            UIManager.showGameOver();
            if (this.audioManager) {
                this.audioManager.stopMusic();
            }
        }
    }

    collectFood(amount) {
        if (this.isGameOver) return;
        this.health = Math.min(100, this.health + amount);
        UIManager.updateHealth(this.health);

        if (this.audioManager) {
            this.audioManager.playSound('collectItem', 0.5);
        }
    }

    collectAmmo(amount, weaponIndex) {
        if (this.isGameOver) return;
        this.weaponSystem.addAmmo(amount, weaponIndex);

        if (this.audioManager) {
            this.audioManager.playSound('collectItem', 0.5);
        }
    }

    /**
     * Aplica retroceso al jugador en dirección opuesta a donde está mirando
     * @param {number} strength - Fuerza del retroceso (valor recomendado: 0.5 - 1.5)
     */
    applyRecoil(strength = 0.5) {
        if (this.isGameOver || !this.controls.isLocked) return;

        // Aumentar velocity.z para retroceder hacia atrás
        // moveForward(-velocity.z) se encarga automáticamente de aplicar
        // el retroceso en la dirección correcta según el ángulo actual
        this.velocity.z += strength;
    }


    update(delta) {
        if (!this.controls.isLocked) return;
        if (this.isShooting) {
            this.weaponSystem.tryShoot(() => {
                this.score++;
                UIManager.updateScore(this.score);
            });
        }

        // Aplicar fricción (decaerá el retroceso y cualquier otro movimiento)
        this.velocity.x -= this.velocity.x * 12.0 * delta;
        this.velocity.z -= this.velocity.z * 12.0 * delta;
        this.velocity.y -= CONFIG.GRAVITY * delta;

        this.direction.z = Number(this.moveFlags.fwd) - Number(this.moveFlags.bwd);
        this.direction.x = Number(this.moveFlags.right) - Number(this.moveFlags.left);
        this.direction.normalize();

        // Movimiento del jugador (input)
        if (this.moveFlags.fwd || this.moveFlags.bwd) this.velocity.z -= this.direction.z * CONFIG.PLAYER_SPEED * delta;
        if (this.moveFlags.left || this.moveFlags.right) this.velocity.x -= this.direction.x * CONFIG.PLAYER_SPEED * delta;

        const oldPosition = this.camera.position.clone();

        this.controls.moveRight(-this.velocity.x * delta);
        this.controls.moveForward(-this.velocity.z * delta);
        this.camera.position.y += (this.velocity.y * delta);

        if (this.camera.position.y < CONFIG.PLAYER_HEIGHT) {
            this.velocity.y = 0;
            this.camera.position.y = CONFIG.PLAYER_HEIGHT;
            this.canJump = true;
        }

        // Mostrar siempre el ángulo de rotación del jugador (eje Y)
        const angleRadians = this.camera.rotation.y;
        let angleDegrees = (angleRadians * 180) / Math.PI;
        if (angleDegrees < 0) angleDegrees += 360;
        UIManager.updateAngle(angleDegrees);

        this.checkCollisions(oldPosition);
        this.checkAmmoItems();
    }

    checkAmmoItems() {
        const ammoItems = this.world.getAmmoMeshes();
        const playerPos = this.getPosition();

        ammoItems.forEach(ammoMesh => {
            if (ammoMesh.userData.collected) return;

            const distance = playerPos.distanceTo(ammoMesh.position);
            if (distance < 2.0) {
                const ammoAmount = ammoMesh.userData.ammoAmount;
                const weaponIndex = ammoMesh.userData.weaponIndex;

                this.collectAmmo(ammoAmount, weaponIndex);

                ammoMesh.userData.collected = true;
                this.world.scene.remove(ammoMesh);
            }
        });
    }

    checkCollisions(oldPosition) {
        const playerPos = this.camera.position;
        const offset = 1.0;

        const playerBox = new THREE.Box3();
        playerBox.min.set(playerPos.x - offset, playerPos.y - 1.0, playerPos.z - offset);
        playerBox.max.set(playerPos.x + offset, playerPos.y + 1.0, playerPos.z + offset);

        for (const door of Door.instances) {
            if (!door.isOpen) {
                if (!door.mesh.userData.boundingBox) {
                    door.mesh.geometry.computeBoundingBox();
                    door.mesh.userData.boundingBox = new THREE.Box3().setFromObject(door.mesh);
                }

                const doorBox = door.mesh.userData.boundingBox.clone();
                doorBox.min.x -= 0.2;
                doorBox.max.x += 0.2;
                doorBox.min.z -= 0.2;
                doorBox.max.z += 0.2;

                const playerTempBox = new THREE.Box3();
                playerTempBox.min.set(playerPos.x - offset, playerPos.y - 1.0, playerPos.z - offset);
                playerTempBox.max.set(playerPos.x + offset, playerPos.y + 1.0, playerPos.z + offset);
                if (playerTempBox.intersectsBox(doorBox)) {
                    playerPos.copy(oldPosition);
                    this.velocity.x = 0;
                    this.velocity.z = 0;
                    return;
                }
            }
        }

        const walls = this.world.getWalls();
        let collided = false;

        for (const wall of walls) {
            if (!wall.userData.boundingBox) continue;
            if (playerBox.intersectsBox(wall.userData.boundingBox)) {
                collided = true;
                break;
            }
        }

        if (!collided) return;
        const slidePosX = new THREE.Vector3(oldPosition.x, playerPos.y, playerPos.z);
        const slideBoxX = new THREE.Box3(
            new THREE.Vector3(slidePosX.x - offset, slidePosX.y - 1.0, slidePosX.z - offset),
            new THREE.Vector3(slidePosX.x + offset, slidePosX.y + 1.0, slidePosX.z + offset)
        );
        let blockedX = false;
        for (const wall of walls) {
            if (wall.userData.boundingBox && slideBoxX.intersectsBox(wall.userData.boundingBox)) {
                blockedX = true;
                break;
            }
        }

        const slidePosZ = new THREE.Vector3(playerPos.x, playerPos.y, oldPosition.z);
        const slideBoxZ = new THREE.Box3(
            new THREE.Vector3(slidePosZ.x - offset, slidePosZ.y - 1.0, slidePosZ.z - offset),
            new THREE.Vector3(slidePosZ.x + offset, slidePosZ.y + 1.0, slidePosZ.z + offset)
        );
        let blockedZ = false;
        for (const wall of walls) {
            if (wall.userData.boundingBox && slideBoxZ.intersectsBox(wall.userData.boundingBox)) {
                blockedZ = true;
                break;
            }
        }
        if (!blockedX) {
            playerPos.copy(slidePosX);
            this.velocity.z = 0;
            return;
        } if (!blockedZ) {
            playerPos.copy(slidePosZ);
            this.velocity.x = 0;
            return;
        }
        playerPos.copy(oldPosition);
        this.velocity.x = 0;
        this.velocity.z = 0;
    }
    getPosition() {
        return this.camera.position;
    }
}
/*[Fin de sección]*/