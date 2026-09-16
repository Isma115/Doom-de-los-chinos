// Extraído de src/entities/Weapon.js — se ejecuta con .call(this).
// La clase original delega en estas funciones; no duplicar lógica aquí y allí.
// #region Importaciones WeaponSystem
// Descripción: Importaciones de librerías y dependencias necesarias para WeaponSystem.
import * as THREE from 'three';
import { WEAPONS_DATA, ENEMY_TYPES } from '../../Constants.js';
import { UIManager } from '../../UI.js';
// #endregion

// Descripción: Sistema que gestiona las armas del jugador, incluyendo lógica de disparo, munición y efectos visuales.

export function shouldLeaveBulletHole(weapon) {
        return Boolean(weapon && !weapon.isMelee);
}

export function getSolidObjects() {
        const solidObjects = new Set();
        const addObjects = (objects) => {
            if (!objects) return;
            const list = Array.isArray(objects) ? objects : [objects];
            list.forEach(object => {
                if (object) solidObjects.add(object);
            });
        };

        const world = this.player && this.player.world;

        if (!world) {
            return [];
        }

        // La API específica reúne muros, modelos, props y suelo. No salir
        // aquí: los fallbacks permiten compatibilidad con mundos antiguos que
        // todavía exponen sus objetos mediante getters separados.
        if (world.getBulletImpactObjects) {
            addObjects(world.getBulletImpactObjects());
        }

        if (world.getSolidObjects) {
            addObjects(world.getSolidObjects());
        }

        // Obtener muros del mundo
        if (world.getWalls) {
            addObjects(world.getWalls());
        }

        // Obtener modelos estáticos 3D que sean sólidos
        if (world.getStaticModels) {
            addObjects(world.getStaticModels());
        }

        // Obtener objetos decorativos (squares) para efectos de impacto de balas
        if (world.getDecorativeMeshes) {
            addObjects(world.getDecorativeMeshes());
        }

        if (world.getFloorGroup) {
            addObjects(world.getFloorGroup());
        }

        if (world.getDoorMeshes) {
            const doors = world.getDoorMeshes().filter(doorMesh => {
                const data = doorMesh?.userData || {};
                return data.isOpen !== true && (
                    data.targetY === undefined ||
                    data.closedY === undefined ||
                    Math.abs(data.targetY - data.closedY) < 0.001
                );
            });
            addObjects(doors);
        }

        return [...solidObjects];
}

export function getEnemyFromHit(hitObject) {
        let current = hitObject;
        const enemies = this.enemyManager?.enemies || [];

        while (current) {
            if (enemies.includes(current)) return current;
            current = current.parent;
        }

        return null;
}

export function getImpactNormal(hit, origin, direction) {
        const normal = new THREE.Vector3();

        if (hit?.normal) {
            normal.copy(hit.normal);
        } else if (hit?.face && hit.object?.matrixWorld) {
            // face.normal está en espacio local; aplicar la matriz normal
            // evita normales incorrectas en props rotados o escalados.
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
            normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix);
        }

        if (normal.lengthSq() < 0.000001) {
            normal.copy(direction).negate();
        }

        normal.normalize();

        // El agujero debe quedar ligeramente hacia el jugador para no
        // incrustarse en la cara opuesta de un modelo de doble cara.
        if (normal.dot(direction) > 0) normal.negate();

        return normal;
}

export function isDescendantOf(object, ancestor) {
        let current = object;
        while (current) {
            if (current === ancestor) return true;
            current = current.parent;
        }
        return false;
}

export function getBoxImpactNormal(point, box, direction) {
        const candidates = [
            { distance: Math.abs(point.x - box.min.x), normal: new THREE.Vector3(-1, 0, 0) },
            { distance: Math.abs(point.x - box.max.x), normal: new THREE.Vector3(1, 0, 0) },
            { distance: Math.abs(point.y - box.min.y), normal: new THREE.Vector3(0, -1, 0) },
            { distance: Math.abs(point.y - box.max.y), normal: new THREE.Vector3(0, 1, 0) },
            { distance: Math.abs(point.z - box.min.z), normal: new THREE.Vector3(0, 0, -1) },
            { distance: Math.abs(point.z - box.max.z), normal: new THREE.Vector3(0, 0, 1) }
        ];

        candidates.sort((a, b) => a.distance - b.distance);
        const normal = candidates[0].normal;
        if (normal.dot(direction) > 0) normal.negate();
        return normal;
}

export function getFallbackBoxHit(origin, direction, solidObjects, visualHit) {
        const fallbackObjects = this.player?.world?.getBulletImpactFallbackObjects
            ? this.player.world.getBulletImpactFallbackObjects()
            : solidObjects.filter(object => object.userData?.bulletImpactFallback && object.userData.boundingBox);

        let closestHit = null;

        fallbackObjects.forEach(object => {
            const box = object.userData?.boundingBox;
            if (!box) return;

            // Si ya se ha encontrado una cara real de este mismo prop, esa
            // intersección es más precisa que su caja envolvente.
            if (visualHit && this.isDescendantOf(visualHit.object, object)) return;

            const point = new THREE.Vector3();
            if (!this.raycaster.ray.intersectBox(box, point)) return;

            const distance = origin.distanceTo(point);
            if (distance > this.raycaster.far) return;
            if (visualHit && distance >= visualHit.distance - 0.0001) return;

            const candidate = {
                object,
                point,
                distance,
                normal: this.getBoxImpactNormal(point, box, direction),
                isBoundingBoxFallback: true
            };

            if (!closestHit || candidate.distance < closestHit.distance) {
                closestHit = candidate;
            }
        });

        return closestHit;
}

export function getShotDirection(spread = 0) {
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

        if (spread <= 0) {
            return direction.normalize();
        }

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * spread;

        direction
            .add(right.multiplyScalar(Math.cos(angle) * radius))
            .add(up.multiplyScalar(Math.sin(angle) * radius));

        return direction.normalize();
}
