// #region Importaciones AimAssist
// Descripción: Asistencia sutil de apuntado (imán de cruceta) para mando
// táctil y ratón. Barato por diseño: solo mates vectoriales sobre los
// enemigos activos, sin raycasts ni reservas de memoria por frame.
import * as THREE from '../../node_modules/three/build/three.module.js';
import { AIM_ASSIST } from '../Constants.js';
// #endregion

// Vectores temporales reutilizados: cero reservas en el bucle.
const _forward = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

// #region Potencia configurable AimAssist
// Descripción: Intensidad 0-10 persistida (0 = desactivado, 5 = valor de
// referencia). Se cachea en memoria para no tocar localStorage por frame.
const STRENGTH_STORAGE_KEY = 'gameAimAssistStrength';
const DEFAULT_STRENGTH = 5;
let cachedStrength = null;

export function getAimAssistStrength() {
    if (cachedStrength !== null) return cachedStrength;
    cachedStrength = DEFAULT_STRENGTH;
    try {
        const raw = localStorage.getItem(STRENGTH_STORAGE_KEY);
        if (raw !== null) {
            const parsed = Math.round(Number(raw));
            if (Number.isFinite(parsed)) {
                cachedStrength = Math.max(0, Math.min(10, parsed));
            }
        }
    } catch (err) {
        cachedStrength = DEFAULT_STRENGTH;
    }
    return cachedStrength;
}

export function setAimAssistStrength(value) {
    const parsed = Math.round(Number(value) || 0);
    cachedStrength = Math.max(0, Math.min(10, parsed));
    try {
        localStorage.setItem(STRENGTH_STORAGE_KEY, String(cachedStrength));
    } catch (err) {
        // Sin almacenamiento (p. ej. modo privado): se mantiene en memoria.
    }
    return cachedStrength;
}
// #endregion

// #region Clase AimAssist
// Descripción: Cada frame busca el enemigo vivo más cercano al centro de la
// cruceta dentro de un cono pequeño y gira la cámara un poco hacia él.
export class AimAssist {
    // #region Constructor AimAssist
    // Descripción: Recibe la cámara y una función que devuelve los enemigos
    // activos (se evalúa tarde para no acoplarse al EnemyManager).
    constructor(camera, getEnemies) {
        this.camera = camera;
        this.getEnemies = getEnemies;
        this.currentTarget = null;
    }
    // #endregion

    // #region Búsqueda de Objetivo AimAssist
    // Descripción: Devuelve el enemigo con menor ángulo respecto a la
    // cruceta dentro del cono y rango, o null. Cono y alcance crecen con
    // el nivel (0-10). Compara con cosenos para evitar acos() por enemigo.
    findTarget(strength = getAimAssistStrength()) {
        if (!AIM_ASSIST.ENABLED) return null;

        const enemies = this.getEnemies?.();
        if (!enemies || enemies.length === 0) return null;

        _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const maxAngleDeg = AIM_ASSIST.MIN_ANGLE_DEG + strength * AIM_ASSIST.ANGLE_PER_LEVEL;
        const cosMax = Math.cos((maxAngleDeg * Math.PI) / 180);
        const maxDist = AIM_ASSIST.MIN_RANGE + strength * AIM_ASSIST.DIST_PER_LEVEL;
        const camPos = this.camera.position;

        let best = null;
        let bestCos = cosMax;
        let bestDistSq = Infinity;

        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            if (!enemy?.visible) continue;
            if ((enemy.userData?.hp ?? 1) <= 0) continue;

            const dx = enemy.position.x - camPos.x;
            const dy = enemy.position.y - camPos.y;
            const dz = enemy.position.z - camPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < AIM_ASSIST.MIN_DISTANCE * AIM_ASSIST.MIN_DISTANCE) continue;
            if (distSq > maxDist * maxDist) continue;

            const invDist = 1 / Math.sqrt(distSq);
            const cosAngle =
                (dx * _forward.x + dy * _forward.y + dz * _forward.z) * invDist;
            // Más centrado gana; a igual ángulo, el más cercano.
            if (cosAngle > bestCos || (cosAngle === bestCos && distSq < bestDistSq)) {
                best = enemy;
                bestCos = cosAngle;
                bestDistSq = distSq;
            }
        }

        return best;
    }
    // #endregion

    // #region Corrección Sutil AimAssist
    // Descripción: Gira la cámara hacia el objetivo una fracción del error
    // por segundo, con tope de grados/segundo. Vía yaw/pitch (orden YXZ)
    // para no introducir nunca roll.
    update(delta, isFiring = false) {
        const strength = getAimAssistStrength();
        if (!AIM_ASSIST.ENABLED || strength <= 0 || !(delta > 0)) {
            this.currentTarget = null;
            return null;
        }

        const target = this.findTarget(strength);
        this.currentTarget = target;
        if (!target) return null;

        _toEnemy.copy(target.position).sub(this.camera.position).normalize();
        _euler.setFromQuaternion(this.camera.quaternion);

        const targetYaw = Math.atan2(-_toEnemy.x, -_toEnemy.z);
        const targetPitch = Math.asin(
            Math.max(-1, Math.min(1, _toEnemy.y))
        );

        let deltaYaw = targetYaw - _euler.y;
        // Atajo angular: girar por el lado corto (-PI..PI).
        if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
        else if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
        const deltaPitch = targetPitch - _euler.x;

        // 5 = comportamiento de referencia; 10 = doble de ayuda.
        const power = (strength / 5) * (isFiring ? AIM_ASSIST.FIRE_BOOST : 1);
        const step = Math.min(1, AIM_ASSIST.PULL_PER_SEC * power * delta);
        let stepYaw = deltaYaw * step;
        let stepPitch = deltaPitch * step;

        // Tope total para que la corrección nunca se note brusca.
        const maxStep = ((AIM_ASSIST.MAX_DEG_PER_SEC * power * delta) * Math.PI) / 180;
        const applied = Math.hypot(stepYaw, stepPitch);
        if (applied > maxStep && applied > 0) {
            const scale = maxStep / applied;
            stepYaw *= scale;
            stepPitch *= scale;
        }

        // Zona muerta diminuta: evita microtemblor cuando ya está centrado.
        if (Math.abs(stepYaw) < 0.00004) stepYaw = 0;
        if (Math.abs(stepPitch) < 0.00004) stepPitch = 0;
        if (stepYaw === 0 && stepPitch === 0) return target;

        _euler.y += stepYaw;
        const pitchLimit = Math.PI / 2 - 0.05;
        _euler.x = Math.max(-pitchLimit, Math.min(pitchLimit, _euler.x + stepPitch));
        _euler.z = 0;
        this.camera.quaternion.setFromEuler(_euler);
        this.camera.updateMatrixWorld(true);

        return target;
    }
    // #endregion
}
// #endregion
