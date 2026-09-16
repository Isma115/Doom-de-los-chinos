// Extraído de src/entities/Weapon.js — se ejecuta con .call(this).
// La clase original delega en estas funciones; no duplicar lógica aquí y allí.
// #region Importaciones WeaponSystem
// Descripción: Importaciones de librerías y dependencias necesarias para WeaponSystem.
import * as THREE from 'three';
import { WEAPONS_DATA, ENEMY_TYPES } from '../../Constants.js';
import { UIManager } from '../../UI.js';
// #endregion

// Descripción: Sistema que gestiona las armas del jugador, incluyendo lógica de disparo, munición y efectos visuales.

export function getCurrentWeapon() {
        return WEAPONS_DATA[this.currentIndex];
}

export function getWeaponKey(weapon) {
        return weapon?.id || weapon?.name || null;
}

export function getAmmoGroupKey(weapon) {
        return weapon?.ammoGroup || this.getWeaponKey(weapon);
}

export function getAmmoGroupWeapons(weapon) {
        const ammoGroup = this.getAmmoGroupKey(weapon);
        return WEAPONS_DATA.filter(candidate =>
            this.getAmmoGroupKey(candidate) === ammoGroup
        );
}

export function getAmmoAmount(weapon) {
        const groupWeapon = this.getAmmoGroupWeapons(weapon)[0];
        return groupWeapon?.ammo ?? 0;
}

export function getAmmoCapacity(weapon) {
        return this.getAmmoGroupWeapons(weapon).reduce(
            (capacity, groupWeapon) => {
                const maxAmmo = Number(groupWeapon.maxAmmo);
                return Number.isFinite(maxAmmo)
                    ? Math.min(capacity, maxAmmo)
                    : capacity;
            },
            Infinity
        );
}

export function setAmmoAmount(weapon, amount) {
        const capacity = this.getAmmoCapacity(weapon);
        const numericAmount = Number(amount);
        const safeAmount = capacity === Infinity
            ? numericAmount
            : Math.min(
                capacity,
                Math.max(0, Number.isFinite(numericAmount) ? numericAmount : 0)
            );

        this.getAmmoGroupWeapons(weapon).forEach(groupWeapon => {
            groupWeapon.ammo = safeAmount;
        });
        return safeAmount;
}

export function isWeaponUnlocked(weapon) {
        const key = typeof weapon === 'string'
            ? weapon
            : this.getWeaponKey(weapon);
        return Boolean(key && this.unlockedWeapons.has(key));
}

export function findWeaponIndex(weaponId) {
        if (Number.isInteger(weaponId)) {
            return weaponId >= 0 && weaponId < WEAPONS_DATA.length ? weaponId : -1;
        }

        return WEAPONS_DATA.findIndex(weapon =>
            weapon.id === weaponId || weapon.name === weaponId
        );
}

export function unlockWeapon(weaponId, ammoAmount = 0, equip = true) {
        const weaponIndex = this.findWeaponIndex(weaponId);
        const weapon = weaponIndex >= 0 ? WEAPONS_DATA[weaponIndex] : null;
        if (!weapon) return null;

        const weaponKey = this.getWeaponKey(weapon);
        const newlyUnlocked = !this.unlockedWeapons.has(weaponKey);
        this.unlockedWeapons.add(weaponKey);

        const amount = Number(ammoAmount);
        if (Number.isFinite(amount) && amount > 0 && Number.isFinite(weapon.maxAmmo)) {
            this.setAmmoAmount(
                weapon,
                this.getAmmoAmount(weapon) + amount
            );
        }

        if (equip) {
            this.currentIndex = weaponIndex;
            this.updateVisuals();
        }

        return { weapon, weaponIndex, newlyUnlocked };
}

export function unlockAllWeapons(equipLast = true) {
        const grantableWeapons = WEAPONS_DATA.filter(weapon => weapon.requiresPickup);
        const unlockedWeapons = [];

        grantableWeapons.forEach(weapon => {
            const ammoAmount = Number.isFinite(weapon.maxAmmo)
                ? weapon.maxAmmo
                : Number(weapon.pickupAmmo) || 0;
            const unlocked = this.unlockWeapon(
                this.getWeaponKey(weapon),
                ammoAmount,
                false
            );

            if (unlocked) unlockedWeapons.push(unlocked);
        });

        const lastUnlocked = unlockedWeapons[unlockedWeapons.length - 1];
        if (lastUnlocked && equipLast) {
            this.currentIndex = lastUnlocked.weaponIndex;
            this.updateVisuals();
        }

        return unlockedWeapons;
}

export function addAmmo(amount, weaponIndex = null) {
        const weapon = weaponIndex !== null
            ? WEAPONS_DATA[weaponIndex]
            : this.getCurrentWeapon();
        if (!weapon || !this.isWeaponUnlocked(weapon)) return false;

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) return false;

        this.setAmmoAmount(
            weapon,
            this.getAmmoAmount(weapon) + numericAmount
        );
        const currentWeapon = this.getCurrentWeapon();
        if (
            weaponIndex === null
            || this.getAmmoGroupKey(currentWeapon) === this.getAmmoGroupKey(weapon)
        ) {
            UIManager.updateAmmo(this.getAmmoAmount(currentWeapon));
        }
        return true;
}

export function switchWeapon(direction) {
        const step = direction > 0 ? 1 : -1;
        for (let attempts = 0; attempts < WEAPONS_DATA.length; attempts++) {
            const nextIndex = (
                this.currentIndex + step + WEAPONS_DATA.length
            ) % WEAPONS_DATA.length;

            this.currentIndex = nextIndex;
            if (this.isWeaponUnlocked(WEAPONS_DATA[nextIndex])) {
                this.updateVisuals();
                return true;
            }
        }

        return false;
}

export function reloadCurrentWeapon() {
        const weapon = this.getCurrentWeapon();
        const now = performance.now();

        if (!weapon || weapon.isMelee || weapon.maxAmmo === Infinity) {
            return false;
        }

        if (now - this.lastReloadTime < this.reloadDuration) {
            return false;
        }

        this.lastReloadTime = now;

        if (this.audioManager) {
            this.audioManager.playSound('reload', 0.8, false, 0.95 + Math.random() * 0.08);
        }

        this.animateReload();
        return true;
}
