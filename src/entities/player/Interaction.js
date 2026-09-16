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

export function tryInteract() {
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

export function collectFood(amount, foodName = 'Comida') {
        if (this.isGameOver) return;

        this.health = Math.min(CONFIG.PLAYER_MAX_HEALTH, this.health + amount);
        UIManager.updateHealth(this.health);
        UIManager.showHealFlash();

        if (this.audioManager) {
            this.audioManager.playSound('collectItem', 0.5);
        }
}

export function collectAmmo(amount, weaponIndex) {
        if (this.isGameOver) return;
        this.weaponSystem.addAmmo(amount, weaponIndex);

        if (this.audioManager) {
            // La recogida de munición usa el mismo sonido que la recarga
            // manual para reforzar claramente qué tipo de objeto se obtuvo.
            this.audioManager.playSound('reload', 0.8, false, 0.95 + Math.random() * 0.08);
        }
}

export function checkAmmoItems() {
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

export function collectWeapon(weaponId, ammoAmount = 0) {
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

export function checkWeaponItems() {
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
