// #region Importaciones Player
// Descripción: Importa las librerías necesarias (Three.js), datos de configuración, y clases dependientes (WeaponSystem, UIManager, Door).
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, WEAPONS_DATA } from '../Constants.js';
import { WeaponSystem } from './Weapon.js';
import { UIManager } from '../UI.js';
import { Door } from '../entities/Door.js';
import { PointerLockControls } from '../../node_modules/three/examples/jsm/controls/PointerLockControls.js';
// #endregion

// #region Clase Player
// Descripción: Gestiona toda la lógica relacionada con el jugador: movimiento, interacción, combate, salud y sistema de cámara.
export class Player {

    // #region Constructor Player
    // Descripción: Inicializa los controles, la cámara, los sistemas de física, salud, y el sistema de armas del jugador.
    constructor(scene, camera, domElement, enemyManager, world, audioManager, gameInstance) {
        this.controls = new PointerLockControls(camera, domElement);
        this.camera = camera;
        this.audioManager = audioManager;
        this.enemyManager = enemyManager;
        this.gameInstance = gameInstance;

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

        // NUEVAS PROPIEDADES PARA EL RAYO AZUL
        this.rayActive = false;
        this.rayLine = null;
        this.lastRayHit = null;
        this.impactEffect = null;
        this.impactTimeout = null;

        camera.position.set(0, CONFIG.PLAYER_HEIGHT, 0);

        // NUEVA ESTRUCTURA: Inicializar debugState con bulletLog antes de crear WeaponSystem
        this.debugState = {
            godMode: false,
            infiniteAmmo: false,
            flyMode: false,
            noClip: false,
            speedMultiplier: 1.0,
            bulletLog: true  // Valor por defecto
        };

        this.weaponSystem = new WeaponSystem(camera, enemyManager, audioManager, this, scene);
        this.isShooting = false;

        this.initEvents(domElement);
    }
    // #endregion

    // #region Teletransporte Player
    // Descripción: Mueve instantáneamente al jugador a una posición y rotación específicas, reseteando su velocidad.
    teleport(position, rotation = 0) {
        this.camera.position.copy(position);
        this.camera.position.y = CONFIG.PLAYER_HEIGHT;
        this.velocity.set(0, 0, 0);

        const rotationRadians = (rotation * Math.PI) / 180;
        this.camera.rotation.y = rotationRadians;

        this.camera.updateMatrixWorld(true);
    }
    // #endregion

    // #region Inicialización de Eventos Player
    // Descripción: Configura los listeners del DOM para teclado, ratón y elementos de la interfaz (como la pantalla de inicio).
    initEvents(domElement) {
        const startScreen = document.getElementById('start-screen');
        startScreen.addEventListener('click', () => {
            // Reanudamos el audio tras el clic del usuario (User Gesture)
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
    // #endregion

    // #region Getters y Utilidades Player
    // Descripción: Métodos auxiliares para obtener información del mundo o del estado del jugador.
    getWorldWalls() {
        if (this.world && this.world.getWalls) {
            return this.world.getWalls();
        }
        return [];
    }

    getPosition() {
        return this.camera.position;
    }
    // #endregion

    // #region Control de Input (Teclado) Player
    // Descripción: Procesa las pulsaciones de teclas para movimiento, salto, interacción con puertas y habilidades especiales.
    onKey(event, isDown) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.moveFlags.fwd = isDown;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.moveFlags.left = isDown;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.moveFlags.bwd = isDown;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.moveFlags.right = isDown;
                break;
            case 'Space':
                if (isDown) {
                    if (this.debugState.flyMode) {
                        this.velocity.y = CONFIG.JUMP_FORCE * 1.5;
                    } else if (this.canJump) {
                        this.velocity.y += CONFIG.JUMP_FORCE;
                        this.canJump = false;
                    }
                }
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                if (isDown && this.debugState.flyMode) {
                    this.velocity.y = -CONFIG.JUMP_FORCE * 1.5;
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
            case 'Digit1':
                if (isDown) {
                    this.toggleRay();
                }
                break;
        }
    }
    // #endregion

    // #region Sistema de Rayo Azul Player
    // Descripción: Implementación de la habilidad especial "Rayo Azul", incluyendo activación, raycasting y visualización de impacto.
    toggleRay() {
        if (this.rayActive) {
            this.deactivateRay();
        } else {
            this.activateRay();
        }
    }

    // NUEVA FUNCIÓN: Activar rayo
    activateRay() {
        this.rayActive = true;
        console.log("Ray azul activado");

        // Crear visualización del rayo azul si no existe
        if (!this.rayLine) {
            const rayGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -100)
            ]);
            const rayMaterial = new THREE.LineBasicMaterial({
                color: 0x0066ff, // AZUL brillante
                linewidth: 3,
                transparent: true,
                opacity: 0.8
            });
            this.rayLine = new THREE.Line(rayGeometry, rayMaterial);
            this.camera.add(this.rayLine);
        }

        this.rayLine.visible = true;
    }

    // NUEVA FUNCIÓN: Desactivar rayo
    deactivateRay() {
        this.rayActive = false;
        console.log("Ray desactivado");
        if (this.rayLine) {
            this.rayLine.visible = false;
        }
    }

    // NUEVA FUNCIÓN: Actualizar visualización del rayo
    updateRay() {
        if (!this.rayActive || !this.rayLine || !this.rayLine.visible) return;

        const raycaster = new THREE.Raycaster();
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.camera.quaternion);

        raycaster.set(this.camera.position, direction);

        // Obtener todos los objetos colisionables
        const walls = this.world.getWalls();
        const doors = Door.instances.filter(d => !d.isOpen).map(d => d.mesh);
        const staticModels = this.world.getStaticModels ? this.world.getStaticModels() : [];

        const intersectObjects = [...walls, ...doors, ...staticModels];

        const intersects = raycaster.intersectObjects(intersectObjects, true);

        if (intersects.length > 0) {
            const hitPoint = intersects[0].point;

            // Actualizar línea del rayo
            const points = [
                this.camera.position,
                hitPoint
            ];

            this.rayLine.geometry.setFromPoints(points);
            this.rayLine.geometry.attributes.position.needsUpdate = true;

            // Almacenar información del último impacto
            this.lastRayHit = {
                position: hitPoint.clone(),
                time: Date.now()
            };

            // Crear un efecto visual en el punto de impacto (círculo azul)
            this.showImpactEffect(hitPoint);
        } else {
            // Si no hay colisión, mostrar rayo a distancia máxima
            const maxDistance = 100;
            const endPoint = this.camera.position.clone().add(
                direction.clone().multiplyScalar(maxDistance)
            );

            const points = [
                this.camera.position,
                endPoint
            ];

            this.rayLine.geometry.setFromPoints(points);
            this.rayLine.geometry.attributes.position.needsUpdate = true;
            this.lastRayHit = null;
        }
    }

    // NUEVA FUNCIÓN: Mostrar efecto de impacto
    showImpactEffect(position) {
        // Limpiar efecto anterior si existe
        if (this.impactEffect && this.impactEffect.parent) {
            this.impactEffect.parent.remove(this.impactEffect);
        }

        // Crear un pequeño círculo azul en el punto de impacto
        const circleGeometry = new THREE.CircleGeometry(0.3, 16);
        const circleMaterial = new THREE.MeshBasicMaterial({
            color: 0x0066ff,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });

        this.impactEffect = new THREE.Mesh(circleGeometry, circleMaterial);

        // Orientar el círculo hacia la cámara
        this.impactEffect.lookAt(this.camera.position);
        this.impactEffect.position.copy(position);

        // Añadir a la escena
        this.world.scene.add(this.impactEffect);

        // Eliminar después de 0.5 segundos
        if (this.impactTimeout) clearTimeout(this.impactTimeout);
        this.impactTimeout = setTimeout(() => {
            if (this.impactEffect && this.impactEffect.parent) {
                this.impactEffect.parent.remove(this.impactEffect);
            }
        }, 500);
    }
    // #endregion

    // #region Interacciones Player
    // Descripción: Lógica para acciones del jugador como gritar o pulsar botones del ratón (disparar).
    scream() {
        if (this.audioManager && this.controls.isLocked && !this.isGameOver) {
            this.audioManager.playSound('playerScream', 1.0, false, 0.9 + Math.random() * 0.2);
            console.log("¡GRITO!");
        }
    }

    //  Control de Input (Ratón) Player
    onMouseDown() {
        if (this.controls.isLocked && !this.isGameOver) {
            this.isShooting = true;

            // NUEVA FUNCIONALIDAD: Si el rayo está activo, mostrar coordenadas de impacto
            if (this.rayActive && this.lastRayHit) {
                const hitPos = this.lastRayHit.position;
                console.log(`📍 Ray Impact Coordinates: X: ${hitPos.x.toFixed(2)}, Y: ${hitPos.y.toFixed(2)}, Z: ${hitPos.z.toFixed(2)}`);

                // Mostrar en UI con estilo azul para coincidir con el rayo
                UIManager.showEventMessage(
                    `📍 IMPACTO RAYO AZUL: X:${hitPos.x.toFixed(1)} Y:${hitPos.y.toFixed(1)} Z:${hitPos.z.toFixed(1)}`,
                    3000
                );

                // Destacar visualmente el punto de impacto
                this.highlightImpactPoint(hitPos);

                // También disparar normal si se mantiene presionado
                this.weaponSystem.tryShoot(() => {
                    this.score++;
                    UIManager.updateScore(this.score);
                });
            } else {
                // Disparo normal
                this.weaponSystem.tryShoot(() => {
                    this.score++;
                    UIManager.updateScore(this.score);
                });
            }
        }
    }

    // NUEVA FUNCIÓN: Destacar punto de impacto
    highlightImpactPoint(position) {
        // Crear un efecto visual más prominente para el clic
        const sphereGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0x0066ff,
            transparent: true,
            opacity: 0.9,
            wireframe: false
        });

        const highlightSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        highlightSphere.position.copy(position);

        this.world.scene.add(highlightSphere);

        // Animación de pulsación
        let scale = 1.0;
        const animate = () => {
            scale += 0.1;
            highlightSphere.scale.set(scale, scale, scale);
            sphereMaterial.opacity -= 0.05;

            if (sphereMaterial.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                this.world.scene.remove(highlightSphere);
            }
        };

        animate();
    }

    onMouseUp() {
        this.isShooting = false;
    }
    // #endregion

    // #region Sistema de Salud Player
    // Descripción: Administra la vida del jugador, incluyendo la lógica de recibir daño y curarse.
    takeDamage(damageAmount = 1) {
        if (this.isGameOver) return;

        if (this.debugState.godMode) {
            console.log('Daño bloqueado por God Mode');
            return;
        }

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

            // Desactivar rayo al morir
            if (this.rayActive) {
                this.deactivateRay();
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
    // #endregion

    // #region Sistema de Munición Player
    // Descripción: Lógica para la recolección de munición y recarga de armas.
    collectAmmo(amount, weaponIndex) {
        if (this.isGameOver) return;
        this.weaponSystem.addAmmo(amount, weaponIndex);

        if (this.audioManager) {
            this.audioManager.playSound('collectItem', 0.5);
        }
    }

    checkAmmoItems() {
        const ammoItems = this.world.getAmmoMeshes();
        const playerPos = this.getPosition();

        ammoItems.forEach(ammoMesh => {
            if (ammoMesh.userData.collected) return;

            const distance = playerPos.distanceTo(ammoMesh.position);
            if (distance < CONFIG.PICKUP_DISTANCE) {
                const ammoAmount = ammoMesh.userData.ammoAmount;
                const weaponIndex = ammoMesh.userData.weaponIndex;

                // Check if ammo is full
                const weapon = WEAPONS_DATA[weaponIndex];
                if (weapon && weapon.ammo >= weapon.maxAmmo) {
                    return; // Don't collect if full
                }

                this.collectAmmo(ammoAmount, weaponIndex);

                ammoMesh.userData.collected = true;
                this.world.scene.remove(ammoMesh);
            }
        });
    }
    // #endregion

    // #region Físicas Player
    // Descripción: Aplica fuerzas físicas al jugador, como retroceso por disparo.
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
    // #endregion

    // #region Bucle Principal Player
    // Descripción: Actualiza el estado del jugador frame a frame: movimiento, gravedad, colisiones y UI.
    update(delta) {
        if (!this.controls.isLocked) return;
        if (this.isShooting) {
            this.weaponSystem.tryShoot(() => {
                this.score++;
                UIManager.updateScore(this.score);
            });
        }

        const speedMultiplier = this.debugState.speedMultiplier || 1.0;

        this.velocity.x -= this.velocity.x * 12.0 * delta;
        this.velocity.z -= this.velocity.z * 12.0 * delta;

        if (!this.debugState.flyMode) {
            this.velocity.y -= CONFIG.GRAVITY * delta;
        } else {
            this.velocity.y -= this.velocity.y * 12.0 * delta;
        }

        this.direction.z = Number(this.moveFlags.fwd) - Number(this.moveFlags.bwd);
        this.direction.x = Number(this.moveFlags.right) - Number(this.moveFlags.left);
        this.direction.normalize();

        // Detectar si el jugador está intentando moverse (presiona teclas de movimiento)
        const isTryingToMove = this.moveFlags.fwd || this.moveFlags.bwd || this.moveFlags.left || this.moveFlags.right;

        // Guardar posición antes de aplicar movimiento para detectar colisión posterior
        const oldPosition = this.camera.position.clone();

        if (this.moveFlags.fwd || this.moveFlags.bwd) {
            this.velocity.z -= this.direction.z * CONFIG.PLAYER_SPEED * delta * speedMultiplier;
        }
        if (this.moveFlags.left || this.moveFlags.right) {
            this.velocity.x -= this.direction.x * CONFIG.PLAYER_SPEED * delta * speedMultiplier;
        }

        this.controls.moveRight(-this.velocity.x * delta);
        this.controls.moveForward(-this.velocity.z * delta);
        this.camera.position.y += (this.velocity.y * delta);

        if (!this.debugState.flyMode) {
            if (this.camera.position.y < CONFIG.PLAYER_HEIGHT) {
                this.velocity.y = 0;
                this.camera.position.y = CONFIG.PLAYER_HEIGHT;
                this.canJump = true;
            }
        }

        const angleRadians = this.camera.rotation.y;
        let angleDegrees = (angleRadians * 180) / Math.PI;
        if (angleDegrees < 0) angleDegrees += 360;
        UIManager.updateAngle(angleDegrees);

        // NUEVA ESTRUCTURA: Actualizar las coordenadas del jugador
        UIManager.updateCoordinates(
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z
        );

        // Variable para detectar si hubo colisión con pared (bloqueo de movimiento)
        let wallSliding = false;

        if (!this.debugState.noClip) {
            const previousPosition = this.camera.position.clone();

            this.checkCollisions(oldPosition);

            // Si después de checkCollisions la posición volvió a oldPosition → movimiento completamente bloqueado
            // Si la posición cambió pero es muy cercana a oldPosition → estamos rozando pared (slide parcial)
            const distanceMoved = previousPosition.distanceTo(this.camera.position);
            const expectedMoveDistance = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z) * delta;

            // Si intentábamos movernos pero apenas avanzamos → estamos rozando pared
            if (isTryingToMove && expectedMoveDistance > 0.5 && distanceMoved < expectedMoveDistance * 0.4) {
                wallSliding = true;
            }
        }

        // Ajuste de velocidad cuando se roza pared:
        // - Normal: 1.0 × speedMultiplier
        // - Rozando pared: 1.15 × speedMultiplier (un poco más rápido que normal)
        // - Pero aún más lento que caminar libremente sin rozar (el efecto natural de colisión ya lo ralentiza)
        if (wallSliding && isTryingToMove) {
            const wallSlideBoost = 1.15; // Aumenta ligeramente la velocidad cuando se roza
            this.controls.moveRight(-this.velocity.x * delta * (wallSlideBoost - 1.0));
            this.controls.moveForward(-this.velocity.z * delta * (wallSlideBoost - 1.0));
        }

        this.checkAmmoItems();

        // NUEVA ESTRUCTURA: Actualizar visualización del rayo azul
        if (this.rayActive) {
            this.updateRay();
        }
    }
// #endregion

    // #region Gestión de Game Over Player
    // Descripción: Maneja el estado de fin de juego, desbloqueando controles y mostrando la pantalla final.
    gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;

        // Notificamos al Game que estamos en Game Over
        if (this.gameInstance) {
            this.gameInstance.isGameOver = true;
        }

        UIManager.showGameOver();
        this.controls.unlock();

        // Desactivar rayo al morir
        if (this.rayActive) {
            this.deactivateRay();
        }
    }
    // #endregion

    // #region Sistema de Colisiones Player
    // Descripción: Detecta colisiones con muros y puertas, impidiendo que el jugador atraviese objetos sólidos.
    checkCollisions(oldPosition) {
        const playerPos = this.camera.position;
        const offset = CONFIG.PLAYER_COLLISION_OFFSET;

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
// #endregion
}
// #endregion