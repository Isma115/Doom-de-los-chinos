// Lógica del portal de salida, extraída de World.js (ver nota .call).
// World delega en estas funciones para no crecer como god-object.
import * as THREE from 'three';
import { EXIT_PORTAL_CONFIG } from '../../Constants.js';
import { ExitPortal } from '../../entities/ExitPortal.js';

export function findExitPortalPosition(playerPosition = null) {
        const explicitPosition = this.exitPortalSpawn
            ? new THREE.Vector3(this.exitPortalSpawn.x, 0, this.exitPortalSpawn.z)
            : null;
        const genericPositions = (this.genericSpawners || [])
            .map(spawner => spawner?.position)
            .filter(Boolean)
            .map(position => new THREE.Vector3(position.x, 0, position.z));

        const referencePosition = playerPosition || this.getPlayerSpawn();
        if (referencePosition) {
            genericPositions.sort((first, second) => {
                const firstDistance = first.distanceToSquared(referencePosition);
                const secondDistance = second.distanceToSquared(referencePosition);
                return secondDistance - firstDistance;
            });
        }
        const candidatePositions = explicitPosition
            ? [explicitPosition, ...genericPositions]
            : genericPositions;

        const portalWidth = Number(EXIT_PORTAL_CONFIG.width) || 5.2;
        const portalHeight = Number(EXIT_PORTAL_CONFIG.height) || 7.2;
        const portalDepth = 1.5;
        const solidObjects = this.getSolidObjects();
        const canPlace = position => {
            if (!position) return false;

            if (playerPosition) {
                const distanceFromPlayer = Math.hypot(
                    playerPosition.x - position.x,
                    playerPosition.z - position.z
                );
                if (distanceFromPlayer < 6) return false;
            }

            const portalBox = new THREE.Box3(
                new THREE.Vector3(
                    position.x - portalWidth / 2,
                    0,
                    position.z - portalDepth / 2
                ),
                new THREE.Vector3(
                    position.x + portalWidth / 2,
                    portalHeight,
                    position.z + portalDepth / 2
                )
            );

            return solidObjects.every(object => {
                const boundingBox = object?.userData?.boundingBox;
                return !boundingBox || !portalBox.intersectsBox(boundingBox);
            });
        };

        const freePosition = candidatePositions.find(canPlace);
        if (freePosition) return freePosition;

        // Fallback para mapas de Parque modificados: probar el centro y una
        // pequeña cuadrícula antes de renunciar a mostrar la salida.
        const bounds = this.mapData?.terrainBounds;
        if (bounds) {
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerZ = (bounds.minZ + bounds.maxZ) / 2;
            const fallbackPositions = [
                new THREE.Vector3(centerX, 0, centerZ),
                new THREE.Vector3(centerX - 10, 0, centerZ),
                new THREE.Vector3(centerX + 10, 0, centerZ),
                new THREE.Vector3(centerX, 0, centerZ - 10),
                new THREE.Vector3(centerX, 0, centerZ + 10)
            ];
            const fallbackPosition = fallbackPositions.find(canPlace);
            if (fallbackPosition) return fallbackPosition;
        }

        return null;
}

export function spawnExitPortal(playerPosition = null, audioManager = null) {
        if (!['mapa1', 'pruebas_alien'].includes(this.currentMapName)) return null;
        if (this.exitPortal) return this.exitPortal;

        const position = this.findExitPortalPosition(playerPosition);
        if (!position) {
            console.warn('No se encontró una zona libre para el portal de salida');
            return null;
        }

        this.exitPortal = new ExitPortal(this.scene, position, audioManager);
        console.log(`Portal de salida abierto en (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
        return this.exitPortal;
}

export function updateExitPortal(delta, cameraPosition) {
        this.exitPortal?.update(delta, cameraPosition);
}

export function tryEnterExitPortal(playerPosition) {
        if (!this.exitPortal?.isPlayerNear(playerPosition)) return false;

        const destinationMap = this.exitPortal.mesh.userData.destinationMap;
        if (destinationMap) {
            return destinationMap;
        }

        // El siguiente mapa aún no existe; mantener el portal interactivo
        // permite conectar la transición sin rehacer la entidad más adelante.
        return true;
}

export function getExitPortalDestination() {
        return this.exitPortal?.mesh?.userData?.destinationMap || null;
}

