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

export function toggleRay() {
        if (this.rayActive) {
            this.deactivateRay();
        } else {
            this.activateRay();
        }
}

export function activateRay() {
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

export function deactivateRay() {
        this.rayActive = false;
        console.log("Ray desactivado");
        if (this.rayLine) {
            this.rayLine.visible = false;
        }
}

export function updateRay() {
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

export function showImpactEffect(position) {
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

export function highlightImpactPoint(position) {
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
