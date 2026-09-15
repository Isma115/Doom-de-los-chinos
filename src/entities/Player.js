// #region Importaciones Player
// Descripción: Importa las librerías necesarias (Three.js), datos de configuración, y clases dependientes (WeaponSystem, UIManager, Door).
import * as THREE from '../../node_modules/three/build/three.module.js';
import { CONFIG, WEAPONS_DATA } from '../Constants.js';
import { WeaponSystem } from './Weapon.js';
import { UIManager } from '../UI.js';
import { Door } from '../entities/Door.js';
import { PointerLockControls } from '../../node_modules/three/examples/jsm/controls/PointerLockControls.js';
import { isMobileMode } from '../mobile/isMobile.js';
import { attachTouchControls } from '../mobile/TouchControls.js';
import { AimAssist } from '../core/AimAssist.js';
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
        this.isMobile = isMobileMode();
        this.touchState = { moveX: 0, moveY: 0, active: false };

        // En móvil no hay Pointer Lock: simular lock/unlock para reutilizar
        // el mismo flujo de pausa, HUD y disparo que en escritorio.
        if (this.isMobile) {
            this.controls.isLocked = false;
            this.controls.lock = () => {
                if (this.controls.isLocked) return;
                this.controls.isLocked = true;
                this.controls.dispatchEvent({ type: 'lock' });
            };
            this.controls.unlock = () => {
                if (!this.controls.isLocked) return;
                this.controls.isLocked = false;
                this.controls.dispatchEvent({ type: 'unlock' });
            };
        }

        scene.add(camera);

        this.world = world;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moveFlags = { fwd: false, bwd: false, left: false, right: false };
        this.isCrouching = false;
        this.canJump = false;

        this.health = CONFIG.PLAYER_MAX_HEALTH;
        this.score = 0;
        this.isGameOver = false;
        this.isDead = false;
        this.deathAnimation = null;

        this.radius = 2.0;

        // NUEVAS PROPIEDADES PARA EL RAYO AZUL
        this.rayActive = false;
        this.rayLine = null;
        this.lastRayHit = null;
        this.impactEffect = null;
        this.impactTimeout = null;
        this.highlightEffects = new Set();
        this.eventCleanup = [];
        this.touchControlsCleanup = null;
        this.disposed = false;

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
        // Imán de cruceta sutil: barato (mates vectoriales, sin raycasts).
        this.aimAssist = new AimAssist(camera, () => this.enemyManager?.enemies);

        this.initEvents(domElement);
    }
    // #endregion

    // #region Teletransporte Player
    // Descripción: Mueve instantáneamente al jugador a una posición y rotación específicas, reseteando su velocidad.
    teleport(position, rotation = 0) {
        this.camera.position.copy(position);
        this.camera.position.y = CONFIG.PLAYER_HEIGHT;
        this.velocity.set(0, 0, 0);
        this.canJump = true;
        this.isCrouching = false;

        const rotationRadians = (rotation * Math.PI) / 180;
        this.camera.rotation.set(0, rotationRadians, 0);

        this.camera.updateMatrixWorld(true);
    }
    // #endregion

    // #region Inicialización de Eventos Player
    // Descripción: Configura los listeners del DOM para teclado, ratón y elementos de la interfaz (como la pantalla de inicio).
    initEvents(domElement) {
        const listen = (target, type, handler, options) => {
            if (!target) return;
            target.addEventListener(type, handler, options);
            this.eventCleanup.push(() => target.removeEventListener(type, handler, options));
        };

        const startScreen = document.getElementById('start-screen');
        const onStartScreenClick = () => {
            // Reanudamos el audio tras el clic del usuario (User Gesture)
            if (this.audioManager) {
                this.audioManager.resume();
            }

            if (!this.isGameOver) this.controls.lock();
        };
        listen(startScreen, 'click', onStartScreenClick);

        const onControlsLock = () => UIManager.togglePauseScreen(true, this.isGameOver);
        const onControlsUnlock = () => {
            if (!this.isDead) {
                UIManager.togglePauseScreen(false, this.isGameOver);
            }
            this.resetMovementState();
        };
        listen(this.controls, 'lock', onControlsLock);
        listen(this.controls, 'unlock', onControlsUnlock);

        listen(document, 'keydown', (e) => this.onKey(e, true));
        listen(document, 'keyup', (e) => this.onKey(e, false));
        // En macOS, Fn/Globe puede cambiar el foco o impedir que llegue el
        // keyup de la tecla de movimiento que se estaba manteniendo pulsada.
        // Limpiar el estado al perder el foco evita que el jugador se quede
        // caminando lateralmente de forma indefinida.
        listen(window, 'blur', () => this.resetMovementState());
        listen(document, 'visibilitychange', () => {
            if (document.hidden) this.resetMovementState();
        });
        listen(document, 'mousedown', (event) => this.onMouseDown(event));
        listen(document, 'mouseup', () => this.onMouseUp());

        listen(document, 'wheel', (e) => this.weaponSystem.switchWeapon(e.deltaY));

        const screamButton = document.getElementById('scream-button');
        if (screamButton) {
            listen(screamButton, 'click', () => this.scream());
        }

        if (this.isMobile) {
            this.touchControlsCleanup = attachTouchControls(this) || null;
        }
    }
    // #endregion

    // #region Limpieza Player
    // Descripción: Retira listeners y recursos del jugador antes de cambiar de
    // mapa para que la escena anterior pueda ser recolectada por el navegador.
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.onMouseUp();
        this.resetMovementState();

        if (this.controls?.isLocked) {
            this.controls.unlock();
        }

        this.touchControlsCleanup?.();
        this.touchControlsCleanup = null;
        this.eventCleanup.forEach(cleanup => cleanup());
        this.eventCleanup = [];
        this.controls?.dispose?.();

        if (this.impactTimeout !== null) {
            clearTimeout(this.impactTimeout);
            this.impactTimeout = null;
        }
        if (this.impactEffect) {
            this.impactEffect.parent?.remove(this.impactEffect);
            this.impactEffect.geometry?.dispose?.();
            this.impactEffect.material?.dispose?.();
            this.impactEffect = null;
        }

        if (this.rayLine) {
            this.camera.remove(this.rayLine);
            this.rayLine.geometry?.dispose?.();
            this.rayLine.material?.dispose?.();
            this.rayLine = null;
        }

        this.highlightEffects.forEach(effect => {
            effect.mesh.parent?.remove(effect.mesh);
            effect.mesh.geometry?.dispose?.();
            effect.material?.dispose?.();
        });
        this.highlightEffects.clear();

        this.weaponSystem?.dispose?.();
        this.aimAssist = null;
        this.gameInstance = null;
        this.world = null;
        this.enemyManager = null;
        this.audioManager = null;
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
        // Las teclas Fn/Globe y Command no siempre tienen un keyup fiable en
        // macOS. Si se pulsan mientras una tecla de movimiento está activa,
        // dejamos el movimiento en un estado seguro inmediatamente.
        const isMacModifierKey = [
            'Fn', 'Globe', 'Function',
            'Meta', 'MetaLeft', 'MetaRight'
        ].includes(event.code)
            || ['Fn', 'Globe', 'Function', 'Meta', 'Command'].includes(event.key);
        const isCommandCombination = event.metaKey && isDown;
        if (isMacModifierKey || isCommandCombination) {
            this.resetMovementState();

            // Mientras el pointer lock está activo, evitar que Command +
            // otra tecla dispare atajos del navegador (por ejemplo cerrar la
            // pestaña con Command+W) y saque al jugador del juego.
            if (this.controls.isLocked && event.cancelable) {
                event.preventDefault();
            }
            return;
        }

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
                    this.jumpPressed();
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
                    this.tryInteract();
                }
                break;
            case 'KeyV':
                if (isDown) {
                    this.scream();
                }
                break;
            case 'KeyR':
                if (isDown && this.controls.isLocked && !this.isGameOver) {
                    this.weaponSystem.reloadCurrentWeapon();
                }
                break;
            case 'ControlLeft':
            case 'ControlRight':
            case 'Control':
                if (event.cancelable) event.preventDefault();
                this.setCrouching(isDown);
                break;
            case 'Digit1':
                if (isDown) {
                    this.toggleRay();
                }
                break;
        }
    }

    setCrouching(isCrouching) {
        const nextState = Boolean(isCrouching);
        if (this.isCrouching === nextState) return;

        this.isCrouching = nextState;

        // Cortar parte de la inercia al empezar a agacharse evita que
        // conserve de golpe la velocidad de la marcha normal.
        if (nextState) {
            this.velocity.x *= CONFIG.CROUCH_SPEED_MULTIPLIER;
            this.velocity.z *= CONFIG.CROUCH_SPEED_MULTIPLIER;
        }
    }

    resetMovementState() {
        this.moveFlags.fwd = false;
        this.moveFlags.bwd = false;
        this.moveFlags.left = false;
        this.moveFlags.right = false;
        this.isCrouching = false;
        this.velocity.x = 0;
        this.velocity.z = 0;
        if (this.touchState) {
            this.touchState.moveX = 0;
            this.touchState.moveY = 0;
            this.touchState.active = false;
        }
    }

    jumpPressed() {
        if (this.debugState.flyMode) {
            this.velocity.y = CONFIG.JUMP_FORCE * 1.5;
        } else if (this.canJump) {
            this.velocity.y += CONFIG.JUMP_FORCE;
            this.canJump = false;
        }
    }

    tryInteract() {
        if (Door.tryOpenNearest(this.getPosition())) {
            console.log("PUERTA ABIERTA");
            if (this.audioManager) {
                this.audioManager.playSound('doorOpen', 0.5);
            }
            return true;
        }
        if (this.world?.tryEnterExitPortal?.(this.getPosition())) {
            const destinationMap = this.world.getExitPortalDestination?.();
            if (destinationMap && this.gameInstance?.loadMap) {
                this.gameInstance.loadMap(destinationMap);
            } else {
                UIManager.showEventMessage(
                    'PORTAL ESTABLE — EL SIGUIENTE NIVEL SE AÑADIRÁ PRÓXIMAMENTE',
                    4000
                );
            }
            return true;
        }
        return false;
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
    onMouseDown(event = null) {
        if (this.isDead) {
            if (!event || event.button === 0) {
                this.respawn();
            }
            return;
        }

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
        const effect = { mesh: highlightSphere, material: sphereMaterial };
        this.highlightEffects.add(effect);

        this.world.scene.add(highlightSphere);

        // Animación de pulsación
        let scale = 1.0;
        const animate = () => {
            if (this.disposed) return;
            scale += 0.1;
            highlightSphere.scale.set(scale, scale, scale);
            sphereMaterial.opacity -= 0.05;

            if (sphereMaterial.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                this.world.scene.remove(highlightSphere);
                sphereGeometry.dispose();
                sphereMaterial.dispose();
                this.highlightEffects.delete(effect);
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
    takeDamage(damageAmount = 1, damageSource = null) {
        if (this.isGameOver) return;

        if (this.debugState.godMode) {
            console.log('Daño bloqueado por God Mode');
            return;
        }

        this.health -= damageAmount;
        UIManager.updateHealth(this.health);
        UIManager.showDamageIndicator(
            this.getDamageDirectionAngle(damageSource),
            Math.max(0.35, Math.min(1, damageAmount / 35))
        );

        if (this.audioManager) {
            this.audioManager.playSound('playerHurt', 0.6, false, 0.9 + Math.random() * 0.2);
        }

        if (this.health <= 0) {
            this.beginDeath(damageSource);
        }
    }

    beginDeath(damageSource = null) {
        if (this.isDead) return;

        this.isDead = true;
        this.isGameOver = true;
        UIManager.showRespawnHint();
        if (this.gameInstance) {
            this.gameInstance.isGameOver = true;
            this.gameInstance.isPaused = false;
        }

        this.isShooting = false;
        this.resetMovementState();
        this.velocity.set(0, 0, 0);

        const startRotation = this.camera.rotation.clone();
        const incoming = damageSource
            ? damageSource.x - this.camera.position.x
            : 1;
        const fallDirection = Math.sign(incoming) || 1;

        this.deathAnimation = {
            elapsed: 0,
            duration: 650,
            startY: this.camera.position.y,
            targetY: 0.42,
            startRotationX: startRotation.x,
            startRotationZ: startRotation.z,
            targetRotationX: startRotation.x + 0.18,
            targetRotationZ: startRotation.z - fallDirection * Math.PI * 0.48
        };

        // Reutilizar el sonido que se reproduce al eliminar un enemigo.
        if (this.audioManager) {
            this.audioManager.playSound('enemyDeath', 0.5);
        }

        if (this.rayActive) {
            this.deactivateRay();
        }

        // Liberar el pointer lock sin abrir la pantalla de game over. El
        // bucle principal mantiene la escena viva para mostrar la caída.
        if (this.controls.isLocked) {
            this.controls.unlock();
        }
    }

    updateDeath(delta) {
        if (!this.isDead || !this.deathAnimation) return;

        const animation = this.deathAnimation;
        animation.elapsed = Math.min(
            animation.duration,
            animation.elapsed + Math.max(0, delta) * 1000
        );

        const progress = animation.duration > 0
            ? animation.elapsed / animation.duration
            : 1;
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        this.camera.position.y = THREE.MathUtils.lerp(
            animation.startY,
            animation.targetY,
            easedProgress
        );
        this.camera.rotation.x = THREE.MathUtils.lerp(
            animation.startRotationX,
            animation.targetRotationX,
            easedProgress
        );
        this.camera.rotation.z = THREE.MathUtils.lerp(
            animation.startRotationZ,
            animation.targetRotationZ,
            easedProgress
        );
    }

    respawn() {
        if (!this.isDead) return;

        const spawnPosition = this.world?.getPlayerSpawn?.();
        const spawnRotation = this.world?.getPlayerRotation?.() || 0;

        this.isDead = false;
        this.isGameOver = false;
        this.deathAnimation = null;
        UIManager.hideRespawnHint();
        if (this.gameInstance) {
            this.gameInstance.isGameOver = false;
            this.gameInstance.isPaused = false;
        }

        this.health = CONFIG.PLAYER_MAX_HEALTH;
        UIManager.updateHealth(this.health);
        this.isShooting = false;
        this.resetMovementState();

        if (spawnPosition) {
            this.teleport(spawnPosition, spawnRotation);
        } else {
            this.camera.position.y = CONFIG.PLAYER_HEIGHT;
            this.camera.rotation.set(0, (spawnRotation * Math.PI) / 180, 0);
            this.velocity.set(0, 0, 0);
            this.canJump = true;
        }

        if (this.audioManager) {
            this.audioManager.resume();
        }

        // El clic que solicita el respawn también es un gesto válido para
        // recuperar el pointer lock y devolver el control al jugador.
        this.controls.lock();
    }

    getDamageDirectionAngle(damageSource) {
        if (!damageSource) return 0;

        const incoming = new THREE.Vector3(
            damageSource.x - this.camera.position.x,
            0,
            damageSource.z - this.camera.position.z
        );
        if (incoming.lengthSq() < 0.0001) return 0;
        incoming.normalize();

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) return 0;
        forward.normalize();

        const signedCross = forward.x * incoming.z - forward.z * incoming.x;
        return Math.atan2(signedCross, forward.dot(incoming)) * 180 / Math.PI;
    }

    collectFood(amount, foodName = 'Comida') {
        if (this.isGameOver) return;

        this.health = Math.min(CONFIG.PLAYER_MAX_HEALTH, this.health + amount);
        UIManager.updateHealth(this.health);
        UIManager.showHealFlash();

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
            // La recogida de munición usa el mismo sonido que la recarga
            // manual para reforzar claramente qué tipo de objeto se obtuvo.
            this.audioManager.playSound('reload', 0.8, false, 0.95 + Math.random() * 0.08);
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
                const currentAmmo = weapon
                    ? (this.weaponSystem.getAmmoAmount?.(weapon) ?? weapon.ammo)
                    : 0;
                const maxAmmo = weapon
                    ? (this.weaponSystem.getAmmoCapacity?.(weapon) ?? weapon.maxAmmo)
                    : 0;
                if (weapon && currentAmmo >= maxAmmo) {
                    return; // Don't collect if full
                }

                this.collectAmmo(ammoAmount, weaponIndex);

                ammoMesh.userData.collected = true;
                this.world.scene.remove(ammoMesh);
            }
        });
    }

    collectWeapon(weaponId, ammoAmount = 0) {
        if (this.isGameOver) return false;

        const unlocked = this.weaponSystem.unlockWeapon(
            weaponId,
            ammoAmount,
            true
        );
        if (!unlocked) return false;

        if (this.audioManager) {
            this.audioManager.playSound('collectItem', 0.8);
        }
        UIManager.showEventMessage(
            `¡${unlocked.weapon.name} DESBLOQUEADO!`,
            3000
        );
        return true;
    }

    checkWeaponItems() {
        const weaponItems = this.world.getWeaponMeshes?.() || [];
        const playerPos = this.getPosition();

        for (let i = weaponItems.length - 1; i >= 0; i--) {
            const weaponMesh = weaponItems[i];
            if (!weaponMesh || weaponMesh.userData?.collected) continue;

            if (playerPos.distanceTo(weaponMesh.position) >= CONFIG.PICKUP_DISTANCE) {
                continue;
            }

            const collected = this.collectWeapon(
                weaponMesh.userData.weaponId,
                weaponMesh.userData.ammoAmount
            );
            if (!collected) continue;

            weaponMesh.userData.collected = true;
            this.world.scene.remove(weaponMesh);
            if (weaponMesh.material?.map) weaponMesh.material.map.dispose();
            if (weaponMesh.material) weaponMesh.material.dispose();
            weaponItems.splice(i, 1);
        }
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

    /**
     * Impulsa al jugador alejándolo del punto de explosión del RPG.
     * La fuerza cae con la distancia y el vector horizontal se convierte a
     * los ejes locales que usa PointerLockControls para que el empuje respete
     * la orientación actual de la cámara.
     *
     * El RPG no llama a takeDamage: esta función solo modifica la velocidad,
     * permitiendo usar el impacto contra el suelo, paredes o enemigos para
     * desplazarse de forma distinta.
     *
     * @param {THREE.Vector3} explosionPosition - Centro de la explosión.
     * @param {number} strength - Impulso máximo a distancia cero.
     * @param {number} radius - Distancia máxima a la que afecta el impulso.
     */
    applyRocketJumpImpulse(explosionPosition, strength = 24, radius = 17) {
        if (
            this.isGameOver
            || this.isDead
            || this.disposed
            || !explosionPosition?.isVector3
        ) {
            return;
        }

        const safeStrength = Number(strength);
        const safeRadius = Number(radius);
        if (
            !Number.isFinite(safeStrength)
            || safeStrength <= 0
            || !Number.isFinite(safeRadius)
            || safeRadius <= 0
        ) {
            return;
        }

        const away = this.camera.position.clone().sub(explosionPosition);
        const distance = away.length();
        if (!Number.isFinite(distance) || distance > safeRadius) return;

        if (distance <= 0.0001) {
            away.set(0, 1, 0);
        } else {
            away.multiplyScalar(1 / distance);
        }

        // Un impacto contra el suelo ya genera una componente vertical
        // natural. Este mínimo también permite saltar al rozar una pared o
        // cuando el cohete explota casi a la misma altura que el jugador.
        away.y = Math.max(away.y, 0.35);
        away.normalize();

        const distanceRatio = THREE.MathUtils.clamp(
            distance / safeRadius,
            0,
            1
        );
        const falloff = 1 - distanceRatio;
        const impulse = safeStrength * (0.2 + 0.8 * falloff);

        // velocity.x/z están expresadas en los ejes de movimiento locales:
        // moveRight(-x) y moveForward(-z). Convertir el vector mundial evita
        // que el impulso cambie de sentido al girar la cámara.
        const right = new THREE.Vector3(1, 0, 0)
            .applyQuaternion(this.camera.quaternion);
        right.y = 0;
        if (right.lengthSq() <= 0.0001) {
            right.set(1, 0, 0);
        } else {
            right.normalize();
        }
        const forward = new THREE.Vector3(0, 1, 0)
            .cross(right)
            .normalize();

        const rightComponent = away.x * right.x + away.z * right.z;
        const forwardComponent = away.x * forward.x + away.z * forward.z;
        this.velocity.x -= rightComponent * impulse;
        this.velocity.z -= forwardComponent * impulse;

        // No se puede aterrizar durante el impulso. Si el jugador ya estaba
        // cayendo, la explosión debe vencer esa caída para que el salto sea
        // consistente; el límite evita acumular velocidad infinita.
        const verticalImpulse = Math.max(0.1, away.y) * impulse;
        this.velocity.y = Math.min(
            50,
            Math.max(verticalImpulse, this.velocity.y + verticalImpulse)
        );
        this.canJump = false;
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
        const crouchSpeedMultiplier = this.isCrouching
            ? CONFIG.CROUCH_SPEED_MULTIPLIER
            : 1.0;
        const movementMultiplier = speedMultiplier * crouchSpeedMultiplier;

        this.velocity.x -= this.velocity.x * 12.0 * delta;
        this.velocity.z -= this.velocity.z * 12.0 * delta;

        if (!this.debugState.flyMode) {
            if (!this.canJump) {
                this.velocity.y -= CONFIG.GRAVITY * delta;
            } else {
                this.velocity.y = 0;
            }
        } else {
            this.velocity.y -= this.velocity.y * 12.0 * delta;
        }

        this.direction.z = Number(this.moveFlags.fwd) - Number(this.moveFlags.bwd);
        this.direction.x = Number(this.moveFlags.right) - Number(this.moveFlags.left);
        // Joystick táctil: moveY negativo = avanzar, moveX = strafe.
        if (this.touchState?.active) {
            this.direction.z += -this.touchState.moveY;
            this.direction.x += this.touchState.moveX;
        }
        this.direction.normalize();

        // Detectar si el jugador está intentando moverse (presiona teclas de movimiento)
        const isTryingToMove = this.moveFlags.fwd || this.moveFlags.bwd || this.moveFlags.left || this.moveFlags.right || this.touchState?.active;

        // Guardar posición antes de aplicar movimiento para detectar colisión posterior
        const oldPosition = this.camera.position.clone();

        // El joystick táctil también debe integrar velocidad: antes solo
        // lo hacían las teclas y el jugador móvil no se movía.
        const touchActive = Boolean(this.touchState?.active);
        if (this.moveFlags.fwd || this.moveFlags.bwd || touchActive) {
            this.velocity.z -= this.direction.z * CONFIG.PLAYER_SPEED * delta * movementMultiplier;
        }
        if (this.moveFlags.left || this.moveFlags.right || touchActive) {
            this.velocity.x -= this.direction.x * CONFIG.PLAYER_SPEED * delta * movementMultiplier;
        }

        this.controls.moveRight(-this.velocity.x * delta);
        this.controls.moveForward(-this.velocity.z * delta);
        this.camera.position.y += (this.velocity.y * delta);

        if (!this.debugState.flyMode) {
            const targetHeight = this.isCrouching
                ? CONFIG.CROUCH_HEIGHT
                : CONFIG.PLAYER_HEIGHT;

            if (!this.canJump && this.camera.position.y < targetHeight) {
                this.velocity.y = 0;
                this.camera.position.y = targetHeight;
                this.canJump = true;
            } else if (this.canJump) {
                // Cambiar de altura de forma suave al pulsar o soltar Ctrl.
                const heightDelta = targetHeight - this.camera.position.y;
                const maxStep = CONFIG.CROUCH_TRANSITION_SPEED * delta;
                if (Math.abs(heightDelta) <= maxStep) {
                    this.camera.position.y = targetHeight;
                } else {
                    this.camera.position.y += Math.sign(heightDelta) * maxStep;
                }
            }
        }

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
        this.checkWeaponItems();

        // Corrección sutil hacia el enemigo encarado (si lo hay).
        this.aimAssist?.update(delta, this.isShooting);

        // NUEVA ESTRUCTURA: Actualizar visualización del rayo azul
        if (this.rayActive) {
            this.updateRay();
        }
    }
    // #endregion

    // #region Gestión de Game Over Player
    // Descripción: Maneja el estado de fin de juego, desbloqueando controles y mostrando la pantalla final.
    gameOver() {
        this.beginDeath();
    }
    // #endregion

    // #region Sistema de Colisiones Player
    // Descripción: Detecta colisiones con muros y puertas, impidiendo que el jugador atraviese objetos sólidos.
    getPlayerCollisionBox(position) {
        const horizontalHalfSize = CONFIG.PLAYER_COLLISION_OFFSET || 1.0;
        const verticalHalfSize = 1.0;

        return new THREE.Box3(
            new THREE.Vector3(
                position.x - horizontalHalfSize,
                position.y - verticalHalfSize,
                position.z - horizontalHalfSize
            ),
            new THREE.Vector3(
                position.x + horizontalHalfSize,
                position.y + verticalHalfSize,
                position.z + horizontalHalfSize
            )
        );
    }

    getCollisionEntries() {
        const entries = [];
        const seenObjects = new Set();

        const addObject = (object, boundingBox = object?.userData?.boundingBox) => {
            if (!object || seenObjects.has(object) || !boundingBox || boundingBox.isEmpty()) return;

            const min = boundingBox.min;
            const max = boundingBox.max;
            if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)) return;

            seenObjects.add(object);
            entries.push({ object, box: boundingBox.clone() });
        };

        const worldObjects = [
            ...(this.world?.getWalls?.() || []),
            ...(this.world?.getStaticModels?.() || [])
        ];
        worldObjects.forEach(object => addObject(object));

        // Las puertas cambian de altura mientras se abren y se cierran, por lo
        // que su caja debe recalcularse antes de cada resolución de movimiento.
        Door.instances.forEach(door => {
            if (door.isOpen || !door.mesh) return;

            door.mesh.updateMatrixWorld(true);
            const doorBox = new THREE.Box3().setFromObject(door.mesh);
            doorBox.min.x -= 0.2;
            doorBox.max.x += 0.2;
            doorBox.min.z -= 0.2;
            doorBox.max.z += 0.2;

            // Mantenerlo también en userData permite que el modo debug dibuje
            // la misma caja que usa la física.
            door.mesh.userData = door.mesh.userData || {};
            door.mesh.userData.boundingBox = doorBox;
            addObject(door.mesh, doorBox);
        });

        return entries;
    }

    rangesOverlap(minA, maxA, minB, maxB) {
        // Ignorar el contacto exacto evita que caminar por la parte superior
        // de un prop se interprete como una colisión lateral.
        return Math.min(maxA, maxB) - Math.max(minA, minB) > 0.001;
    }

    movePlayerAlongAxis(position, axis, amount, collisionEntries) {
        if (Math.abs(amount) < 0.000001) return false;

        const offset = CONFIG.PLAYER_COLLISION_OFFSET || 1.0;
        const halfSize = axis === 'y' ? 1.0 : offset;
        const start = position[axis];
        const desired = start + amount;
        const direction = Math.sign(amount);
        const separation = 0.02;
        let resolved = desired;
        let blocked = false;

        for (const entry of collisionEntries) {
            const box = entry.box;
            const playerBox = this.getPlayerCollisionBox(position);

            let overlapsOtherAxes = true;
            for (const otherAxis of ['x', 'y', 'z']) {
                if (otherAxis === axis) continue;
                if (!this.rangesOverlap(
                    playerBox.min[otherAxis],
                    playerBox.max[otherAxis],
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

            // Detectar el cruce del volumen ampliado, no solo la posición
            // final. Así no se puede atravesar una caja en un frame de salto.
            if (direction > 0 && start <= expandedMin && desired > expandedMin) {
                resolved = Math.min(resolved, expandedMin - separation);
                blocked = true;
            } else if (direction < 0 && start >= expandedMax && desired < expandedMax) {
                resolved = Math.max(resolved, expandedMax + separation);
                blocked = true;
            }
        }

        position[axis] = resolved;

        if (!blocked) return false;

        if (axis === 'y') {
            this.velocity.y = 0;
            if (direction < 0) {
                // El jugador ha descendido sobre la parte superior del prop.
                this.canJump = true;
            }
        } else {
            // x/z son los ejes locales que usa PointerLockControls. Mantener
            // este corte de inercia evita que vuelva a penetrar en el siguiente
            // frame, conservando el deslizamiento por el otro eje.
            this.velocity[axis] = 0;
        }

        return true;
    }

    resolvePlayerPenetration(position, collisionEntries) {
        const separation = 0.02;
        const floorHeight = this.isCrouching ? CONFIG.CROUCH_HEIGHT : CONFIG.PLAYER_HEIGHT;
        let grounded = false;

        // Recuperación defensiva: si el jugador ya estaba dentro por un salto
        // o por una caja mal colocada, expulsarlo por el eje de menor
        // penetración antes de continuar con el movimiento.
        for (let iteration = 0; iteration < 8; iteration++) {
            const playerBox = this.getPlayerCollisionBox(position);
            let bestResolution = null;

            for (const entry of collisionEntries) {
                const box = entry.box;
                const overlap = {
                    x: Math.min(playerBox.max.x, box.max.x) - Math.max(playerBox.min.x, box.min.x),
                    y: Math.min(playerBox.max.y, box.max.y) - Math.max(playerBox.min.y, box.min.y),
                    z: Math.min(playerBox.max.z, box.max.z) - Math.max(playerBox.min.z, box.min.z)
                };

                if (overlap.x <= 0.001 || overlap.y <= 0.001 || overlap.z <= 0.001) continue;

                for (const axis of ['x', 'z', 'y']) {
                    const direction = position[axis] < (box.min[axis] + box.max[axis]) / 2 ? -1 : 1;
                    const amount = direction * (overlap[axis] + separation);

                    // No expulsar al jugador por debajo del suelo cuando la
                    // caja nace en el suelo; en ese caso se prioriza salir por
                    // un lateral o por arriba.
                    if (
                        axis === 'y'
                        && direction < 0
                        && !this.debugState.flyMode
                        && position.y + amount < floorHeight - separation
                    ) {
                        continue;
                    }

                    if (!bestResolution || Math.abs(amount) < Math.abs(bestResolution.amount)) {
                        bestResolution = { axis, amount };
                    }
                }
            }

            if (!bestResolution) break;

            position[bestResolution.axis] += bestResolution.amount;
            if (bestResolution.axis === 'y') {
                this.velocity.y = 0;
                if (bestResolution.amount > 0) {
                    this.canJump = true;
                    grounded = true;
                }
            } else {
                this.velocity[bestResolution.axis] = 0;
            }
        }

        return grounded;
    }

    checkCollisions(oldPosition) {
        const targetPosition = this.camera.position.clone();
        const collisionEntries = this.getCollisionEntries();
        if (collisionEntries.length === 0) return;

        const movement = targetPosition.sub(oldPosition);
        const resolvedPosition = oldPosition.clone();

        this.resolvePlayerPenetration(resolvedPosition, collisionEntries);

        // Subdividir el desplazamiento evita el tunneling cuando la velocidad
        // horizontal y el impulso de salto hacen que el jugador avance varios
        // metros entre dos frames.
        const largestMovement = Math.max(
            Math.abs(movement.x),
            Math.abs(movement.y),
            Math.abs(movement.z)
        );
        const maxStepDistance = 0.5;
        const stepCount = Math.max(1, Math.min(128, Math.ceil(largestMovement / maxStepDistance)));
        const stepMovement = movement.clone().multiplyScalar(1 / stepCount);

        for (let step = 0; step < stepCount; step++) {
            this.movePlayerAlongAxis(resolvedPosition, 'x', stepMovement.x, collisionEntries);
            this.movePlayerAlongAxis(resolvedPosition, 'z', stepMovement.z, collisionEntries);
            this.movePlayerAlongAxis(resolvedPosition, 'y', stepMovement.y, collisionEntries);
            this.resolvePlayerPenetration(resolvedPosition, collisionEntries);
        }

        // Última garantía frente a cajas solapadas o a una posición heredada
        // de una versión anterior de la física.
        this.resolvePlayerPenetration(resolvedPosition, collisionEntries);
        this.camera.position.copy(resolvedPosition);
    }
    // #endregion
}
// #endregion
