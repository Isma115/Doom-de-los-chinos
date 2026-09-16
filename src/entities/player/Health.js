// Extraído de src/entities/Player.js — se ejecuta con .call(this).
// La clase original delega en estas funciones; no duplicar lógica aquí y allí.
// #region Importaciones Player
// Descripción: Importa las librerías necesarias (Three.js), datos de configuración, y clases dependientes (WeaponSystem, UIManager, Door).
import * as THREE from 'three';
import { CONFIG, WEAPONS_DATA } from '../../Constants.js';
import { WeaponSystem } from '../Weapon.js';
import { UIManager } from '../../UI.js';
import { Door } from '../Door.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { isMobileMode } from '../../mobile/isMobile.js';
import { attachTouchControls } from '../../mobile/TouchControls.js';
import { AimAssist } from '../../core/AimAssist.js';
// #endregion

// #region Clase Player
// Descripción: Gestiona toda la lógica relacionada con el jugador: movimiento, interacción, combate, salud y sistema de cámara.

export function takeDamage(damageAmount = 1, damageSource = null) {
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

export function beginDeath(damageSource = null) {
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

export function updateDeath(delta) {
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

export function respawn() {
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

export function getDamageDirectionAngle(damageSource) {
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

export function gameOver() {
        this.beginDeath();
}
