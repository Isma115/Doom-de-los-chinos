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

export function setGenericCorpseSprite(enemy) {
        if (!enemy?.geometry || !enemy.material) return;

        if (enemy.material.map !== this.genericCorpseTexture) {
            enemy.material.map = this.genericCorpseTexture;
            enemy.material.needsUpdate = true;
        }

        // La pila usa su propio atlas cuadrado; no necesita recorte de frames.
        this.resetSpriteSheetGeometry(enemy.geometry);
}

export function selectGenericDeathTexture(enemy) {
        const textures = this.genericDeathTextures?.length
            ? this.genericDeathTextures
            : [this.genericDeathTexture];
        let variant = Math.floor(Math.random() * textures.length);

        // Evita dos muertes genéricas consecutivas con la misma variante.
        if (textures.length > 1 && variant === this.lastGenericDeathVariant) {
            variant = (variant + 1) % textures.length;
        }

        this.lastGenericDeathVariant = variant;
        if (enemy?.userData) {
            enemy.userData.genericDeathVariant = variant;
        }
        return textures[variant];
}

export function setGenericDeathSpriteFrame(enemy, frameIndex) {
        if (!enemy?.geometry || !enemy.material) return;

        const lastFrame = GENERIC_DEATH_SPRITE_SHEET.animations.death.frames - 1;
        if (frameIndex >= lastFrame && this.genericCorpseTexture) {
            this.setGenericCorpseSprite(enemy);
            return;
        }

        const genericDeathTexture =
            enemy.userData.genericDeathTexture || this.genericDeathTexture;
        if (enemy.material.map !== genericDeathTexture) {
            enemy.material.map = genericDeathTexture;
            enemy.material.needsUpdate = true;
        }

        this.setSpriteSheetGeometryFrame(
            enemy.geometry,
            GENERIC_DEATH_SPRITE_SHEET,
            'death',
            frameIndex
        );
}

export function startGenericDeathAnimation(enemy) {
        enemy.userData.usingGenericDeathAnimation = true;
        enemy.userData.genericDeathFrame = 0;
        enemy.userData.genericDeathTimer = 0;
        enemy.userData.genericDeathTexture = this.selectGenericDeathTexture(enemy);
        enemy.position.y += Number(GENERIC_DEATH_SPRITE_SHEET.offsetY) || 0;
        this.setGenericDeathSpriteFrame(enemy, 0);
}

export function updateGenericDeathAnimation(enemy, delta) {
        const animation = GENERIC_DEATH_SPRITE_SHEET.animations.death;
        const frames = Math.max(1, animation.frames || 1);
        const fps = Math.max(1, animation.fps || 8);
        const frameDuration = 1 / fps;

        if (enemy.userData.genericDeathFrame >= frames - 1) return;

        enemy.userData.genericDeathTimer =
            Number(enemy.userData.genericDeathTimer || 0) + Math.max(0, delta);

        let frameChanged = false;
        while (enemy.userData.genericDeathTimer >= frameDuration) {
            enemy.userData.genericDeathTimer -= frameDuration;
            enemy.userData.genericDeathFrame += 1;
            frameChanged = true;

            if (enemy.userData.genericDeathFrame >= frames - 1) {
                enemy.userData.genericDeathFrame = frames - 1;
                enemy.userData.genericDeathTimer = 0;
                break;
            }
        }

        if (frameChanged) {
            this.setGenericDeathSpriteFrame(
                enemy,
                enemy.userData.genericDeathFrame
            );
        }
}
