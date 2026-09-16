// Extraído de src/entities/Weapon.js — se ejecuta con .call(this).
// La clase original delega en estas funciones; no duplicar lógica aquí y allí.
// #region Importaciones WeaponSystem
// Descripción: Importaciones de librerías y dependencias necesarias para WeaponSystem.
import * as THREE from 'three';
import { WEAPONS_DATA, ENEMY_TYPES } from '../../Constants.js';
import { UIManager } from '../../UI.js';
// #endregion

// Descripción: Sistema que gestiona las armas del jugador, incluyendo lógica de disparo, munición y efectos visuales.

export function createWallImpactEffect(hitPoint, hitNormal) {
        // ──────────────────────────────────────────────────────────────
        // NUEVA ESTRUCTURA: elegir una textura aleatoria del array
        // ──────────────────────────────────────────────────────────────
        if (this.bulletHoleTextures.length === 0) {
            return; // nada que pintar si el agujero aún no ha cargado
        }

        const texture = this.bulletHoleTextures[
            Math.floor(Math.random() * this.bulletHoleTextures.length)
        ];
        const normal = hitNormal.clone().normalize();

        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: 0xb0aaa0,
            transparent: true,
            opacity: 0.78,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            alphaTest: 0.02,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });

        const mesh = new THREE.Mesh(geometry, material);
        // Los NPC y enemigos son planos transparentes que no escriben en el
        // depth buffer. Dibujar el agujero antes que ellos permite que sus
        // sprites lo oculten cuando se encuentran entre la cámara y la pared.
        mesh.renderOrder = -10;

        const offset = 0.035;
        const adjustedPosition = hitPoint.clone();
        adjustedPosition.add(normal.clone().multiplyScalar(offset));
        mesh.position.copy(adjustedPosition);

        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        mesh.rotateZ(Math.random() * Math.PI * 2);

        const baseSize = 0.25;
        const randomSize = 0.08 + Math.random() * 0.2;
        const finalSize = baseSize + randomSize;
        mesh.scale.set(finalSize, finalSize, finalSize);

        this.scene.add(mesh);
        this.impactDecals.push(mesh);

        while (this.impactDecals.length > this.maxImpactDecals) {
            this.removeOldestImpactDecal();
        }
}

export function removeOldestImpactDecal() {
        const oldDecal = this.impactDecals.shift();
        if (!oldDecal) return;

        if (oldDecal.parent) {
            oldDecal.parent.remove(oldDecal);
        }

        oldDecal.material.dispose();
        oldDecal.geometry.dispose();
}
