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

export function isSpriteSheetEnemy(type) {
        return Boolean(type?.spriteSheet?.animations);
}

export function createEnemyMaterial(type) {
        const baseTexture = this.enemyTextures[type.id];
        const texture = baseTexture;

        if (this.isSpriteSheetEnemy(type)) {
            // La textura original se comparte entre enemigos; las UV de cada
            // geometría son las que seleccionan su frame. Así no se pierde la
            // imagen si el enemigo aparece antes de que termine el preload.
            texture.minFilter = THREE.NearestFilter;
            texture.magFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
        }

        return new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            alphaTest: 0.05,
            side: THREE.DoubleSide
        });
}

export function resetSpriteSheetGeometry(geometry) {
        const uv = geometry?.attributes?.uv;
        if (!uv) return;

        uv.setXY(0, 0, 1);
        uv.setXY(1, 1, 1);
        uv.setXY(2, 0, 0);
        uv.setXY(3, 1, 0);
        uv.needsUpdate = true;
}

export function setEnemySpriteOffset(enemy, type) {
        if (!enemy?.geometry) return;

        const height = type?.height || 2.0;
        const desiredOffset = Number(type?.spriteOffsetY || 0);
        const desiredLocalOffset = desiredOffset / (height / 2.0);
        const currentLocalOffset = Number(enemy.userData.spriteOffsetLocalY || 0);
        const delta = desiredLocalOffset - currentLocalOffset;

        if (Math.abs(delta) > 0.0001) {
            enemy.geometry.translate(0, delta, 0);
        }

        enemy.userData.spriteOffsetLocalY = desiredLocalOffset;
}

export function setSpriteSheetGeometryFrame(geometry, spriteSheet, animationName, frameIndex) {
        const animation = spriteSheet?.animations?.[animationName] || spriteSheet?.animations?.idle;
        const uv = geometry?.attributes?.uv;
        if (!spriteSheet || !animation || !uv) return;

        const columns = Math.max(1, spriteSheet.columns || 1);
        const rows = Math.max(1, spriteSheet.rows || 1);
        const frameWidth = Math.max(1, spriteSheet.frameWidth || 1);
        const frameHeight = Math.max(1, spriteSheet.frameHeight || 1);
        const frames = Math.max(1, animation.frames || 1);
        const frame = Math.max(0, Math.min(frames - 1, frameIndex));
        const row = Math.max(0, Math.min(rows - 1, animation.row || 0));
        const column = Math.min(columns - 1, frame);
        const textureWidth = columns * frameWidth;
        const textureHeight = rows * frameHeight;
        const pixelInsetX = 0.5 / textureWidth;
        // El atlas tiene sprites muy cerca de los límites verticales. Un margen
        // ligeramente mayor evita que el filtrado muestree la fila contigua.
        const pixelInsetY = 1.5 / textureHeight;

        // PlaneGeometry tiene las UV ordenadas como: arriba-izquierda,
        // arriba-derecha, abajo-izquierda, abajo-derecha. Se deja un margen
        // de seguridad para que nunca entre el frame contiguo del atlas.
        const u0 = (column * frameWidth) / textureWidth + pixelInsetX;
        const u1 = ((column + 1) * frameWidth) / textureWidth - pixelInsetX;
        const v0 = 1 - ((row + 1) * frameHeight) / textureHeight + pixelInsetY;
        const v1 = 1 - (row * frameHeight) / textureHeight - pixelInsetY;

        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        uv.needsUpdate = true;
}

export function disposeEnemyMaterial(enemy) {
        const material = enemy?.material;
        if (!material) return;

        if (material.map?.userData?.isEnemySpriteSheetFrame) {
            material.map.dispose();
        }
        material.dispose();
}

export function initializeEnemyAnimation(enemy, type) {
        enemy.userData.animationName = null;
        enemy.userData.animationFrame = 0;
        enemy.userData.animationTimer = 0;
        enemy.userData.attackAnimUntil = 0;

        if (this.isSpriteSheetEnemy(type)) {
            this.updateSpriteSheetAnimation(enemy, type, 'idle', 0);
        }
}

export function setSpriteSheetFrame(enemy, type, animationName, frameIndex) {
        const spriteSheet = type.spriteSheet;
        const animation = spriteSheet?.animations?.[animationName] || spriteSheet?.animations?.idle;
        if (!spriteSheet || !animation || !enemy.geometry) return;

        this.setSpriteSheetGeometryFrame(
            enemy.geometry,
            spriteSheet,
            animationName,
            frameIndex
        );
}

export function updateSpriteSheetAnimation(enemy, type, animationName, delta) {
        const spriteSheet = type.spriteSheet;
        const animation = spriteSheet?.animations?.[animationName] || spriteSheet?.animations?.idle;
        if (!spriteSheet || !animation || !enemy.material?.map) return;

        const frames = Math.max(1, animation.frames || 1);
        const fps = Math.max(1, animation.fps || 8);
        const frameDuration = 1 / fps;

        if (enemy.userData.animationName !== animationName) {
            enemy.userData.animationName = animationName;
            enemy.userData.animationFrame = 0;
            enemy.userData.animationTimer = 0;
            this.setSpriteSheetFrame(enemy, type, animationName, 0);
        }

        if (!animation.loop && enemy.userData.animationFrame >= frames - 1) {
            return;
        }

        enemy.userData.animationTimer += Math.max(0, delta);
        let frameChanged = false;

        while (enemy.userData.animationTimer >= frameDuration) {
            enemy.userData.animationTimer -= frameDuration;
            let nextFrame = enemy.userData.animationFrame + 1;

            if (nextFrame >= frames) {
                nextFrame = animation.loop ? 0 : frames - 1;
            }

            if (nextFrame === enemy.userData.animationFrame) {
                enemy.userData.animationTimer = 0;
                break;
            }

            enemy.userData.animationFrame = nextFrame;
            frameChanged = true;
        }

        if (frameChanged) {
            this.setSpriteSheetFrame(
                enemy,
                type,
                animationName,
                enemy.userData.animationFrame
            );
        }
}

export function getSpriteSheetAnimationDuration(animation) {
        const frames = Math.max(1, animation?.frames || 1);
        const fps = Math.max(1, animation?.fps || 8);
        return frames / fps;
}

export function updateEnemyVisual(enemy, type, isMoving, now, delta) {
        if (this.isSpriteSheetEnemy(type)) {
            let animationName = 'idle';

            if (enemy.userData.isDying) {
                animationName = 'death';
            } else if (enemy.userData.isShooting || now < enemy.userData.attackAnimUntil) {
                animationName = 'attack';
            } else if (
                enemy.userData.bloodTime > 0 &&
                now - enemy.userData.bloodTime < this.getSpriteSheetAnimationDuration(
                    type.spriteSheet.animations.hurt
                ) * 1000
            ) {
                animationName = 'hurt';
            } else if (isMoving) {
                animationName = 'walk';
            }

            this.updateSpriteSheetAnimation(enemy, type, animationName, delta);
            return;
        }

        if (!isMoving || enemy.userData.isShooting || !this.enemyWalkTextures[enemy.userData.enemyType]) {
            return;
        }

        enemy.userData.walkAnimTimer += delta;
        if (enemy.userData.walkAnimTimer >= 0.7) {
            enemy.userData.walkAnimTimer = 0;
            enemy.userData.walkAnimState = !enemy.userData.walkAnimState;

            const newTexture = enemy.userData.walkAnimState
                ? this.enemyWalkTextures[enemy.userData.enemyType]
                : this.enemyTextures[enemy.userData.enemyType];

            if (enemy.material.map !== newTexture) {
                enemy.material.map = newTexture;
                enemy.material.needsUpdate = true;
            }
        }
}
