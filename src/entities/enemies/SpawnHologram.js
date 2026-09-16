// Extraído de src/entities/EnemyManager.js — se ejecuta con .call(this).
// La clase original delega en estas funciones; no duplicar lógica aquí y allí.
// #region Importaciones EnemyManager
import * as THREE from 'three';
import {
    CONFIG,
    ENEMY_TYPES,
    AUDIO_CONFIG,
    GENERIC_DEATH_SPRITE_SHEET,
    HIT_BLOOD_SPRITE_VARIANTS
} from '../../Constants.js';
import { BloodDecalManager } from '../../core/BloodDecalManager.js';
// #endregion

// #region Clase EnemyManager

export function createSpawnHologram(enemy) {
        const hologramMaterial = new THREE.ShaderMaterial({
            uniforms: {
                map: { value: enemy.material?.map || null },
                uTime: { value: 0 },
                uOpacity: { value: 0 },
                uProgress: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D map;
                uniform float uTime;
                uniform float uOpacity;
                uniform float uProgress;
                varying vec2 vUv;

                void main() {
                    vec4 sprite = texture2D(map, vUv);
                    if (sprite.a < 0.03) discard;

                    float scanLines = 0.5 + 0.5 * sin(vUv.y * 280.0 - uTime * 38.0);
                    float scanBand = 0.5 + 0.5 * sin(vUv.x * 70.0 + uTime * 16.0);
                    float sweepPosition = fract(uTime * 2.6);
                    float sweep = exp(-abs(vUv.y - sweepPosition) * 95.0);
                    float arrivalFlash = exp(-uProgress * 16.0);
                    float flicker = 0.82 + 0.18 * sin(uTime * 105.0);
                    float alpha = sprite.a * uOpacity *
                        (0.48 + scanLines * 0.52 + scanBand * 0.18 + sweep * 1.65 + arrivalFlash * 1.9) * flicker;

                    vec3 hologramColor = mix(
                        vec3(0.0, 0.72, 1.0),
                        vec3(1.0, 1.0, 1.0),
                        clamp(arrivalFlash * 0.9 + sweep * 0.4, 0.0, 1.0)
                    );

                    gl_FragColor = vec4(hologramColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        const hologram = new THREE.Mesh(enemy.geometry, hologramMaterial);
        hologram.position.z = 0.01;
        hologram.renderOrder = 1;
        hologram.visible = false;
        enemy.add(hologram);

        const spawnLight = new THREE.PointLight(0x72efff, 0, 8, 2);
        spawnLight.position.set(0, 0.45, 0.35);
        spawnLight.visible = false;
        enemy.add(spawnLight);

        enemy.userData.spawnHologram = hologram;
        enemy.userData.spawnHologramLight = spawnLight;

        return hologram;
}

export function startSpawnHologram(enemy) {
        const hologram = enemy.userData.spawnHologram || this.createSpawnHologram(enemy);
        const material = hologram.material;

        material.uniforms.map.value = enemy.material?.map || null;
        material.uniforms.uTime.value = 0;
        material.uniforms.uOpacity.value = 0;
        material.uniforms.uProgress.value = 0;
        hologram.visible = true;

        hologram.scale.setScalar(1.18);

        const spawnLight = enemy.userData.spawnHologramLight;
        if (spawnLight) {
            spawnLight.intensity = 5.5;
            spawnLight.visible = true;
        }

        enemy.userData.spawnHologramStartedAt = performance.now();
        enemy.userData.spawnHologramUntil =
            enemy.userData.spawnHologramStartedAt + this.spawnHologramDuration;
}

export function updateSpawnHologram(enemy, now) {
        const hologram = enemy.userData.spawnHologram;
        if (!hologram?.visible) return;

        const elapsed = now - enemy.userData.spawnHologramStartedAt;
        if (elapsed >= this.spawnHologramDuration) {
            hologram.visible = false;
            hologram.material.uniforms.uOpacity.value = 0;
            hologram.scale.setScalar(1);
            const spawnLight = enemy.userData.spawnHologramLight;
            if (spawnLight) {
                spawnLight.intensity = 0;
                spawnLight.visible = false;
            }
            return;
        }

        const progress = Math.max(0, elapsed / this.spawnHologramDuration);
        const fadeIn = Math.min(1, elapsed / 55);
        const fadeOut = Math.min(1, (1 - progress) / 0.28);
        const arrivalFlash = Math.exp(-progress * 16);
        const pulse = 0.9 + 0.1 * Math.sin(elapsed * 0.08);

        hologram.material.uniforms.map.value = enemy.material?.map || null;
        hologram.material.uniforms.uTime.value = elapsed / 1000;
        hologram.material.uniforms.uProgress.value = progress;
        hologram.material.uniforms.uOpacity.value = 1.35 * fadeIn * fadeOut * pulse;
        hologram.scale.setScalar(1 + 0.18 * (1 - progress) + 0.025 * Math.sin(elapsed * 0.06));

        const spawnLight = enemy.userData.spawnHologramLight;
        if (spawnLight) {
            spawnLight.intensity = fadeIn * fadeOut * (0.5 + arrivalFlash * 5.5);
        }
}

export function stopSpawnHologram(enemy) {
        const hologram = enemy?.userData?.spawnHologram;
        if (!hologram) return;

        hologram.visible = false;
        hologram.material.uniforms.uOpacity.value = 0;
        hologram.material.uniforms.uProgress.value = 0;
        hologram.scale.setScalar(1);

        const spawnLight = enemy.userData.spawnHologramLight;
        if (spawnLight) {
            spawnLight.intensity = 0;
            spawnLight.visible = false;
        }
}

export function disposeSpawnHologram(enemy) {
        const hologram = enemy?.userData?.spawnHologram;
        if (!hologram) return;

        if (hologram.parent) hologram.parent.remove(hologram);
        hologram.material.dispose();
        delete enemy.userData.spawnHologram;

        const spawnLight = enemy.userData.spawnHologramLight;
        if (spawnLight?.parent) spawnLight.parent.remove(spawnLight);
        delete enemy.userData.spawnHologramLight;
}
