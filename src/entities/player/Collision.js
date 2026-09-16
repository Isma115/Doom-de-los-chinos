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

export function getWorldWalls() {
        if (this.world && this.world.getWalls) {
            return this.world.getWalls();
        }
        return [];
}

export function getPlayerCollisionBox(position) {
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

export function getCollisionEntries() {
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

export function rangesOverlap(minA, maxA, minB, maxB) {
        // Ignorar el contacto exacto evita que caminar por la parte superior
        // de un prop se interprete como una colisión lateral.
        return Math.min(maxA, maxB) - Math.max(minA, minB) > 0.001;
}

export function movePlayerAlongAxis(position, axis, amount, collisionEntries) {
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

export function resolvePlayerPenetration(position, collisionEntries) {
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

export function checkCollisions(oldPosition) {
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
