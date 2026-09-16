// #region Importaciones Player
// Descripción: Importa las librerías necesarias (Three.js), datos de configuración, y clases dependientes (WeaponSystem, UIManager, Door).
import * as THREE from 'three';
import { CONFIG, WEAPONS_DATA } from '../Constants.js';
import { WeaponSystem } from './Weapon.js';
import { UIManager } from '../UI.js';
import { Door } from '../entities/Door.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { isMobileMode } from '../mobile/isMobile.js';
import { attachTouchControls } from '../mobile/TouchControls.js';
import { AimAssist } from '../core/AimAssist.js';
import {
    takeDamage as takeDamageFn,
    beginDeath as beginDeathFn,
    updateDeath as updateDeathFn,
    respawn as respawnFn,
    getDamageDirectionAngle as getDamageDirectionAngleFn,
    gameOver as gameOverFn
} from './player/Health.js';
import {
    tryInteract as tryInteractFn,
    collectFood as collectFoodFn,
    collectAmmo as collectAmmoFn,
    checkAmmoItems as checkAmmoItemsFn,
    collectWeapon as collectWeaponFn,
    checkWeaponItems as checkWeaponItemsFn
} from './player/Interaction.js';
import {
    getWorldWalls as getWorldWallsFn,
    getPlayerCollisionBox as getPlayerCollisionBoxFn,
    getCollisionEntries as getCollisionEntriesFn,
    rangesOverlap as rangesOverlapFn,
    movePlayerAlongAxis as movePlayerAlongAxisFn,
    resolvePlayerPenetration as resolvePlayerPenetrationFn,
    checkCollisions as checkCollisionsFn
} from './player/Collision.js';
import { ConstructionMode } from './build/ConstructionMode.js';
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
        // Sprint del modo Construcción (Shift): se rastrea aquí para no
        // interferir con el descenso de vuelo, que también usa Shift.
        this.shiftHeld = false;
        // En construcción, mantener Espacio desplaza la cámara hacia donde
        // mira, en vez de aplicar un salto vertical.
        this.buildFlyHeld = false;
        this.buildFlyDirection = new THREE.Vector3();
        this.previousCombatWeaponIndex = null;
        this.canJump = false;

        this.health = CONFIG.PLAYER_MAX_HEALTH;
        this.score = 0;
        this.isGameOver = false;
        this.isDead = false;
        this.deathAnimation = null;

        this.radius = 2.0;

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
        // Modo Construcción: herramienta sin sprite para editar el mapa.
        this.constructionMode = new ConstructionMode({ scene, camera, world, player: this });

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

        // Fuera de construcción, la rueda sigue cambiando de arma. Al entrar
        // con 0, la misma rueda queda reservada para recorrer objetos nuevos.
        listen(document, 'wheel', (e) => {
            if (this.constructionMode?.isActive()) {
                this.constructionMode.handleWheel?.(e.deltaY);
                if (e.cancelable) e.preventDefault();
                return;
            }
            this.weaponSystem.switchWeapon(e.deltaY);
        }, { passive: false });

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

        this.constructionMode?.dispose?.();
        this.constructionMode = null;
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
        return getWorldWallsFn.call(this);
    }

    getPosition() {
        return this.camera.position;
    }
    // #endregion

    // #region Control de Input (Teclado) Player
    // Descripción: Procesa las pulsaciones de teclas para movimiento, salto, interacción con puertas y habilidades especiales.
    onKey(event, isDown) {
        // El constructor tiene una tecla propia: no entra en el ciclo de
        // armas y al pulsar 0 de nuevo se vuelve al arma anterior.
        if (event.code === 'Digit0' || event.code === 'Numpad0') {
            if (isDown && !this.isGameOver) this.toggleConstructionTool();
            if (event.cancelable) event.preventDefault();
            return;
        }

        // Espacio es vuelo direccional mientras la herramienta está activa.
        if (this.constructionMode?.isActive() && event.code === 'Space') {
            this.buildFlyHeld = isDown;
            if (event.cancelable) event.preventDefault();
            return;
        }

        // Modo Construcción: flechas editan el preview, N/B catálogo,
        // Supr borra, Esc cancela, R queda desactivada.
        if (this.constructionMode?.handleKey(event, isDown)) {
            return;
        }
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
                this.shiftHeld = isDown;
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
        this.shiftHeld = false;
        this.buildFlyHeld = false;
        this.velocity.x = 0;
        this.velocity.z = 0;
        if (this.touchState) {
            this.touchState.moveX = 0;
            this.touchState.moveY = 0;
            this.touchState.active = false;
        }
    }

    jumpPressed() {
        if (this.constructionMode?.isActive()) {
            this.buildFlyHeld = true;
            return;
        }
        if (this.debugState.flyMode) {
            this.velocity.y = CONFIG.JUMP_FORCE * 1.5;
        } else if (this.canJump) {
            this.velocity.y += CONFIG.JUMP_FORCE;
            this.canJump = false;
        }
    }

    toggleConstructionTool() {
        const currentWeapon = this.weaponSystem?.getCurrentWeapon?.();
        if (!currentWeapon || !this.weaponSystem) return false;

        if (currentWeapon.isConstruction || currentWeapon.isTool) {
            const fallback = Number.isInteger(this.previousCombatWeaponIndex)
                ? this.previousCombatWeaponIndex
                : WEAPONS_DATA.findIndex(weapon =>
                    !weapon.isTool && !weapon.isConstruction &&
                    this.weaponSystem.isWeaponUnlocked(weapon)
                );
            const selected = fallback >= 0
                ? this.weaponSystem.selectWeapon(fallback)
                : false;
            if (selected) this.previousCombatWeaponIndex = null;
            return selected;
        }

        this.previousCombatWeaponIndex = this.weaponSystem.currentIndex;
        return this.weaponSystem.selectWeapon('constructor');
    }

    tryInteract() {
        return tryInteractFn.call(this);
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

        // Modo Construcción: clic izq. recoge a preview, clic der. coloca.
        // No se dispara con la herramienta seleccionada.
        if (this.constructionMode?.isActive()) {
            if (this.controls.isLocked && !this.isGameOver && event) {
                this.constructionMode.handleMouseButton(event.button ?? 0);
            }
            this.isShooting = false;
            return;
        }

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
    // #endregion

    // #region Sistema de Salud Player
    // Descripción: Administra la vida del jugador, incluyendo la lógica de recibir daño y curarse.
    takeDamage(damageAmount = 1, damageSource = null) {
        return takeDamageFn.call(this, damageAmount, damageSource);
    }

    beginDeath(damageSource = null) {
        return beginDeathFn.call(this, damageSource);
    }

    updateDeath(delta) {
        return updateDeathFn.call(this, delta);
    }

    respawn() {
        return respawnFn.call(this);
    }

    getDamageDirectionAngle(damageSource) {
        return getDamageDirectionAngleFn.call(this, damageSource);
    }

    collectFood(amount, foodName = 'Comida') {
        return collectFoodFn.call(this, amount, foodName);
    }
    // #endregion

    // #region Sistema de Munición Player
    // Descripción: Lógica para la recolección de munición y recarga de armas.
    collectAmmo(amount, weaponIndex) {
        return collectAmmoFn.call(this, amount, weaponIndex);
    }

    checkAmmoItems() {
        return checkAmmoItemsFn.call(this);
    }

    collectWeapon(weaponId, ammoAmount = 0) {
        return collectWeaponFn.call(this, weaponId, ammoAmount);
    }

    checkWeaponItems() {
        return checkWeaponItemsFn.call(this);
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
        // Modo Construcción: atraviesa muros/objetos (el suelo sigue sólido)
        // y Shift multiplica la velocidad para recorrer el mapa.
        const buildActive = this.constructionMode?.isActive?.() === true;
        const buildSprint = buildActive && this.shiftHeld
            ? (CONFIG.BUILD_SPRINT_MULTIPLIER || 3.0)
            : 1.0;
        const movementMultiplier = speedMultiplier * crouchSpeedMultiplier * buildSprint;

        this.velocity.x -= this.velocity.x * 12.0 * delta;
        this.velocity.z -= this.velocity.z * 12.0 * delta;

        if (buildActive) {
            // El constructor no tiene gravedad: la altura solo cambia con
            // el vuelo direccional de Espacio.
            this.velocity.y = 0;
        } else if (!this.debugState.flyMode) {
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
        if (buildActive && this.buildFlyHeld) {
            this.camera.getWorldDirection(this.buildFlyDirection);
            this.camera.position.addScaledVector(
                this.buildFlyDirection,
                (CONFIG.BUILD_FLY_SPEED || 45) * movementMultiplier * delta
            );
        } else if (!buildActive) {
            this.camera.position.y += (this.velocity.y * delta);
        }

        if (!buildActive && !this.debugState.flyMode) {
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

        // En construcción no hay colisión con muros/objetos (solo suelo).
        if (!this.debugState.noClip && !buildActive) {
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

        // Modo Construcción: el fantasma sigue al punto de mira.
        this.constructionMode?.update?.();

    }
    // #endregion

    // #region Gestión de Game Over Player
    // Descripción: Maneja el estado de fin de juego, desbloqueando controles y mostrando la pantalla final.
    gameOver() {
        return gameOverFn.call(this);
    }
    // #endregion

    // #region Sistema de Colisiones Player
    // Descripción: Detecta colisiones con muros y puertas, impidiendo que el jugador atraviese objetos sólidos.
    getPlayerCollisionBox(position) {
        return getPlayerCollisionBoxFn.call(this, position);
    }

    getCollisionEntries() {
        return getCollisionEntriesFn.call(this);
    }

    rangesOverlap(minA, maxA, minB, maxB) {
        return rangesOverlapFn.call(this, minA, maxA, minB, maxB);
    }

    movePlayerAlongAxis(position, axis, amount, collisionEntries) {
        return movePlayerAlongAxisFn.call(this, position, axis, amount, collisionEntries);
    }

    resolvePlayerPenetration(position, collisionEntries) {
        return resolvePlayerPenetrationFn.call(this, position, collisionEntries);
    }

    checkCollisions(oldPosition) {
        return checkCollisionsFn.call(this, oldPosition);
    }
    // #endregion
}
// #endregion
