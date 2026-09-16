// Extraído de src/entities/Weapon.js — se ejecuta con .call(this).
// La clase original delega en estas funciones; no duplicar lógica aquí y allí.
// #region Importaciones WeaponSystem
// Descripción: Importaciones de librerías y dependencias necesarias para WeaponSystem.
import * as THREE from 'three';
import { WEAPONS_DATA, ENEMY_TYPES } from '../../Constants.js';
import { UIManager } from '../../UI.js';
// #endregion

// Descripción: Sistema que gestiona las armas del jugador, incluyendo lógica de disparo, munición y efectos visuales.

export function createBulletSparkEffect(hitPoint, hitNormal) {
        const normal = hitNormal.clone().normalize();
        const origin = hitPoint.clone().add(normal.clone().multiplyScalar(0.08));
        const sparks = [];
        const sparkCount = 8 + Math.floor(Math.random() * 7);

        for (let i = 0; i < sparkCount; i++) {
            const direction = normal.clone()
                .add(new THREE.Vector3(
                    (Math.random() - 0.5) * 1.6,
                    Math.random() * 1.2,
                    (Math.random() - 0.5) * 1.6
                ))
                .normalize();

            const length = 0.25 + Math.random() * 0.55;
            const geometry = new THREE.BufferGeometry().setFromPoints([
                origin,
                origin.clone().add(direction.clone().multiplyScalar(length))
            ]);

            const material = new THREE.LineBasicMaterial({
                color: Math.random() > 0.35 ? 0xfff1a6 : 0xff7a18,
                transparent: true,
                opacity: 1.0,
                depthWrite: false
            });

            const spark = new THREE.Line(geometry, material);
            spark.userData = {
                velocity: direction.multiplyScalar(4 + Math.random() * 7),
                age: 0,
                lifetime: 0.16 + Math.random() * 0.16
            };

            this.scene.add(spark);
            sparks.push(spark);
        }

        const flashGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0xffd46a,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(origin);
        flash.userData = { age: 0, lifetime: 0.12 };
        this.scene.add(flash);

        const effect = {
            sparks,
            flash,
            previousTime: performance.now()
        };
        this.sparkEffects.push(effect);
        this.animateSparkEffect(effect);
}

export function animateSparkEffect(effect) {
        const now = performance.now();
        const delta = Math.min((now - effect.previousTime) / 1000, 0.05);
        effect.previousTime = now;

        let alive = false;

        effect.sparks.forEach(spark => {
            if (!spark.parent) return;

            spark.userData.age += delta;
            const progress = spark.userData.age / spark.userData.lifetime;

            if (progress >= 1) {
                this.scene.remove(spark);
                spark.geometry.dispose();
                spark.material.dispose();
                return;
            }

            const positions = spark.geometry.attributes.position;
            const move = spark.userData.velocity.clone().multiplyScalar(delta);

            for (let i = 0; i < positions.count; i++) {
                positions.setXYZ(
                    i,
                    positions.getX(i) + move.x,
                    positions.getY(i) + move.y - spark.userData.age * 0.08,
                    positions.getZ(i) + move.z
                );
            }

            positions.needsUpdate = true;
            spark.material.opacity = 1 - progress;
            alive = true;
        });

        if (effect.flash && effect.flash.parent) {
            effect.flash.userData.age += delta;
            const flashProgress = effect.flash.userData.age / effect.flash.userData.lifetime;

            if (flashProgress >= 1) {
                this.scene.remove(effect.flash);
                effect.flash.geometry.dispose();
                effect.flash.material.dispose();
            } else {
                const scale = 1 + flashProgress * 2.5;
                effect.flash.scale.set(scale, scale, scale);
                effect.flash.material.opacity = 0.9 * (1 - flashProgress);
                alive = true;
            }
        }

        if (alive) {
            requestAnimationFrame(() => this.animateSparkEffect(effect));
            return;
        }

        const index = this.sparkEffects.indexOf(effect);
        if (index !== -1) {
            this.sparkEffects.splice(index, 1);
        }
}

export function showMuzzleFlash() {
        if (!this.weaponFlashTexture) return;

        const weaponView = this.weaponSwayGroup || this.camera;

        if (this.flashMesh) {
            if (this.flashMesh.parent) {
                this.flashMesh.parent.remove(this.flashMesh);
            }
            this.flashMesh.material.map.dispose();
            this.flashMesh.material.dispose();
        }

        const flashMaterial = new THREE.SpriteMaterial({
            map: this.weaponFlashTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            opacity: 1.0
        });

        this.flashMesh = new THREE.Sprite(flashMaterial);
        this.flashMesh.renderOrder = 999;
        this.flashMesh.scale.set(1.6, 1.6, 1);
        this.flashMesh.position.set(0.5, -0.25, -1.1);

        // También evitar frustum culling
        this.flashMesh.frustumCulled = false;

        weaponView.add(this.flashMesh);

        // Animación de desaparición
        const fadeOut = () => {
            if (this.flashMesh && this.flashMesh.material) {
                this.flashMesh.material.opacity -= 0.08;
                if (this.flashMesh.material.opacity <= 0) {
                    if (this.flashMesh.parent) {
                        this.flashMesh.parent.remove(this.flashMesh);
                    }
                    this.flashMesh.material.dispose();
                    this.flashMesh = null;
                } else {
                    requestAnimationFrame(fadeOut);
                }
            }
        };
        setTimeout(fadeOut, 50);
}

export function createRocketExplosionBlurTexture() {
        if (typeof document === 'undefined') return null;

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        if (!context) return null;

        const center = 64;
        const gradient = context.createRadialGradient(
            center,
            center,
            2,
            center,
            center,
            64
        );
        gradient.addColorStop(0, 'rgba(255, 245, 180, 0.95)');
        gradient.addColorStop(0.18, 'rgba(255, 170, 48, 0.72)');
        gradient.addColorStop(0.45, 'rgba(255, 82, 12, 0.34)');
        gradient.addColorStop(0.75, 'rgba(255, 42, 0, 0.10)');
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
}
