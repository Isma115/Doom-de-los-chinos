// Extraído de src/entities/Weapon.js — se ejecuta con .call(this).
// La clase original delega en estas funciones; no duplicar lógica aquí y allí.
// #region Importaciones WeaponSystem
// Descripción: Importaciones de librerías y dependencias necesarias para WeaponSystem.
import * as THREE from 'three';
import { WEAPONS_DATA, ENEMY_TYPES } from '../../Constants.js';
import { UIManager } from '../../UI.js';
// #endregion

// Descripción: Sistema que gestiona las armas del jugador, incluyendo lógica de disparo, munición y efectos visuales.

export function createRocketMesh(direction) {
        const rocket = new THREE.Group();

        const body = new THREE.Mesh(
            this.rocketBodyGeometry,
            this.rocketBodyMaterial
        );
        body.position.y = -0.04;
        rocket.add(body);

        const tip = new THREE.Mesh(
            this.rocketTipGeometry,
            this.rocketTipMaterial
        );
        tip.position.y = 0.39;
        rocket.add(tip);

        const flame = new THREE.Mesh(
            this.rocketFlameGeometry,
            this.rocketFlameMaterial
        );
        flame.position.y = -0.43;
        flame.rotation.z = Math.PI;
        rocket.add(flame);

        rocket.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction
        );
        rocket.renderOrder = 3;
        return rocket;
}

export function launchRocket(weapon, scoreCallback) {
        if (!this.camera || !this.scene) return;

        this.camera.updateMatrixWorld(true);
        const origin = new THREE.Vector3();
        this.camera.getWorldPosition(origin);
        const direction = this.getShotDirection(weapon.projectileSpread || 0);
        const spawnPosition = origin.clone().addScaledVector(direction, 1.0);
        const rocket = this.createRocketMesh(direction);
        const now = performance.now();

        rocket.position.copy(spawnPosition);
        rocket.userData = {
            velocity: direction.clone().multiplyScalar(
                Math.max(1, Number(weapon.projectileSpeed) || 34)
            ),
            radius: Math.max(0.08, Number(weapon.rocketRadius) || 0.22),
            weapon,
            scoreCallback,
            creationTime: now,
            maxLifetime: Math.max(500, Number(weapon.projectileLifetime) || 3200),
            travelDistance: 0,
            armingDistance: Math.max(0.5, Number(weapon.armingDistance) || 2.0)
        };

        this.scene.add(rocket);
        this.rocketProjectiles.push(rocket);
}

export function getRocketImpact(previousPosition, currentPosition, radius = 0.2) {
        const segment = new THREE.Vector3().subVectors(
            currentPosition,
            previousPosition
        );
        const distance = segment.length();
        if (distance <= 0.0001) return null;

        const direction = segment.multiplyScalar(1 / distance);
        this.raycaster.set(previousPosition, direction);
        this.raycaster.far = distance + radius;

        const enemyMeshes = (this.enemyManager?.enemies || []).filter(enemy =>
            enemy.visible &&
            !enemy.userData?.isDying &&
            !enemy.userData?.isCorpse
        );
        const solidObjects = this.getSolidObjects();
        const allObjects = [...new Set(
            enemyMeshes.concat(solidObjects).filter(Boolean)
        )];
        const visualHit = this.raycaster.intersectObjects(allObjects, true)[0] || null;
        const fallbackHit = this.getFallbackBoxHit(
            previousPosition,
            direction,
            solidObjects,
            visualHit
        );
        const hit = fallbackHit || visualHit;

        if (!hit?.point) return null;

        return {
            point: hit.point.clone(),
            normal: this.getImpactNormal(hit, previousPosition, direction),
            distance: Number.isFinite(hit.distance)
                ? hit.distance
                : previousPosition.distanceTo(hit.point)
        };
}

export function getRocketGroundImpact(previousPosition, currentPosition, groundY = 0.02) {
        // El cohete puede saltarse un plano muy fino si cruza el suelo entre
        // dos frames. Detectar ese cruce evita que la explosión nazca bajo el
        // terreno cuando el raycast de la malla no llega a registrar la cara.
        if (
            previousPosition.y <= groundY ||
            currentPosition.y > groundY ||
            currentPosition.y >= previousPosition.y
        ) {
            return null;
        }

        const verticalDistance = previousPosition.y - currentPosition.y;
        if (verticalDistance <= 0.0001) return null;

        const progress = THREE.MathUtils.clamp(
            (previousPosition.y - groundY) / verticalDistance,
            0,
            1
        );
        const point = previousPosition.clone().lerp(currentPosition, progress);
        point.y = groundY;

        return {
            point,
            normal: new THREE.Vector3(0, 1, 0),
            distance: previousPosition.distanceTo(point)
        };
}

export function removeRocket(rocket) {
        if (!rocket) return;

        const index = this.rocketProjectiles.indexOf(rocket);
        if (index !== -1) {
            this.rocketProjectiles.splice(index, 1);
        }
        if (rocket.parent) {
            rocket.parent.remove(rocket);
        }
}

export function applyRocketExplosionDamage(position, weapon, scoreCallback) {
        const radius = Math.max(1, Number(weapon.explosionRadius) || 8.5);
        const directRadius = Math.min(2.2, radius * 0.3);
        const directDamage = Math.max(
            1,
            Number(weapon.damage) || 460
        );
        const baseDamage = Math.max(
            1,
            Number(weapon.explosionDamage) || directDamage
        );
        const edgeMultiplier = Math.max(
            0.05,
            Math.min(1, Number(weapon.explosionFalloff) || 0.55)
        );

        const enemies = [...(this.enemyManager?.enemies || [])];
        enemies.forEach(enemy => {
            if (
                !enemy?.visible ||
                enemy.userData?.isDying ||
                enemy.userData?.isCorpse ||
                !Number.isFinite(enemy.userData?.hp)
            ) {
                return;
            }

            const distance = enemy.position.distanceTo(position);
            if (distance > radius) return;

            const normalizedDistance = Math.min(1, distance / radius);
            const damageMultiplier = distance <= directRadius
                ? 1
                : 1 - normalizedDistance * (1 - edgeMultiplier);
            const damage = Math.max(1, baseDamage * damageMultiplier);
            enemy.userData.hp -= damage;
            enemy.userData.bloodTime = performance.now();

            if (enemy.userData.drawBlood) {
                enemy.userData.drawBlood(enemy.position.clone());
            }

            if (enemy.userData.hp <= 0) {
                this.enemyManager.removeEnemy(enemy);
                if (scoreCallback) scoreCallback();
            }
        });
}

export function createRocketExplosionEffect(position, weapon, impactNormal = null) {
        const group = new THREE.Group();
        // `position` ya está expresada en coordenadas del mundo por el
        // raycast del cohete. Separar el efecto de la superficie evita que el
        // muro o el suelo lo oculten por completo por el depth test.
        group.position.copy(position);
        if (impactNormal?.isVector3 && impactNormal.lengthSq() > 0.0001) {
            const normal = impactNormal.clone().normalize();
            // En un impacto contra el suelo el centro no puede quedarse en
            // Y=0: la mitad inferior de la esfera y del sprite acabaría bajo
            // el plano. Levantarlo más aquí hace visible todo el fogonazo.
            const surfaceOffset = normal.y > 0.45 ? 0.42 : 0.18;
            group.position.addScaledVector(
                normal,
                surfaceOffset
            );
        }
        group.renderOrder = 100;
        group.frustumCulled = false;

        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xffe08a,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false,
            fog: false,
            blending: THREE.AdditiveBlending
        });
        const shellMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4a12,
            transparent: true,
            opacity: 0.75,
            depthTest: false,
            depthWrite: false,
            fog: false,
            blending: THREE.AdditiveBlending
        });
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xff8b1a,
            transparent: true,
            opacity: 0.8,
            depthTest: false,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        const shardMaterial = new THREE.MeshBasicMaterial({
            color: 0xffb52e,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
            fog: false,
            blending: THREE.AdditiveBlending
        });
        const explosionSpriteMaterial = this.rocketExplosionTexture
            ? new THREE.SpriteMaterial({
                map: this.rocketExplosionTexture,
                color: 0xffffff,
                transparent: true,
                opacity: 0.92,
                depthTest: false,
                depthWrite: false,
                fog: false,
                alphaTest: 0.035,
                blending: THREE.NormalBlending,
                toneMapped: false
            })
            : null;
        const explosionBlurMaterial = this.rocketExplosionBlurTexture
            ? new THREE.SpriteMaterial({
                map: this.rocketExplosionBlurTexture,
                color: 0xff7a20,
                transparent: true,
                opacity: 0.44,
                depthTest: false,
                depthWrite: false,
                fog: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false
            })
            : null;

        const core = new THREE.Mesh(this.rocketExplosionGeometry, coreMaterial);
        const shell = new THREE.Mesh(this.rocketExplosionGeometry, shellMaterial);
        const explosionSprite = explosionSpriteMaterial
            ? new THREE.Sprite(explosionSpriteMaterial)
            : null;
        const explosionBlur = explosionBlurMaterial
            ? new THREE.Sprite(explosionBlurMaterial)
            : null;
        const shockwaves = [
            new THREE.Mesh(this.rocketExplosionRingGeometry, ringMaterial),
            new THREE.Mesh(this.rocketExplosionRingGeometry, ringMaterial),
            new THREE.Mesh(this.rocketExplosionRingGeometry, ringMaterial)
        ];
        shockwaves[1].rotation.x = Math.PI / 2;
        shockwaves[2].rotation.y = Math.PI / 2;

        const shards = [];
        for (let index = 0; index < 8; index++) {
            const direction = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 2 - 1
            ).normalize();
            const shard = new THREE.Mesh(
                this.rocketExplosionShardGeometry,
                shardMaterial
            );
            shard.position.copy(direction).multiplyScalar(0.3);
            shard.scale.setScalar(0.65 + Math.random() * 0.65);
            shard.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            shard.userData.velocity = direction.multiplyScalar(2.5 + Math.random() * 4.0);
            shard.userData.spin = new THREE.Vector3(
                Math.random() * 5 - 2.5,
                Math.random() * 5 - 2.5,
                Math.random() * 5 - 2.5
            );
            shards.push(shard);
        }

        core.scale.setScalar(0.32);
        shell.scale.setScalar(0.48);
        shockwaves.forEach(shockwave => shockwave.scale.setScalar(0.35));
        if (explosionSprite) {
            // El billboard acompaña ahora a la bola 3D con una escala mucho
            // más legible, conservando el acabado pixelado del asset. Su
            // tamaño queda deliberadamente por encima de la geometría 3D
            // para que el fogonazo se lea también a distancia.
            explosionSprite.position.y = 0.72;
            explosionSprite.scale.setScalar(2.0);
            explosionSprite.rotation.z = (Math.random() - 0.5) * 0.28;
            explosionSprite.renderOrder = 6;
        }
        if (explosionBlur) {
            // El halo ocupa más superficie y se dibuja detrás del fogonazo
            // pixelado para suavizar sus bordes sin emborronar el centro.
            explosionBlur.position.y = 0.45;
            explosionBlur.scale.setScalar(2.2);
            explosionBlur.renderOrder = 99;
        }
        [core, shell, ...shockwaves, ...shards, explosionSprite, explosionBlur]
            .filter(Boolean)
            .forEach(object => {
                object.renderOrder = 100;
                object.frustumCulled = false;
            });
        if (explosionBlur) explosionBlur.renderOrder = 99;
        if (explosionBlur) group.add(explosionBlur);
        group.add(shell, core, ...shockwaves, ...shards);
        if (explosionSprite) group.add(explosionSprite);

        const light = new THREE.PointLight(0xff7a20, 4.5, 13, 2);
        group.add(light);
        this.scene.add(group);

        this.rocketEffects.push({
            group,
            core,
            shell,
            explosionSprite,
            explosionBlur,
            shockwaves,
            shards,
            light,
            ringMaterial,
            shardMaterial,
            materials: [
                coreMaterial,
                shellMaterial,
                ringMaterial,
                shardMaterial,
                explosionSpriteMaterial,
                explosionBlurMaterial
            ].filter(Boolean),
            age: 0,
            duration: 0.72,
            spriteRotationSpeed: (Math.random() - 0.5) * 1.8,
            spriteStartScale: 2.0,
            spriteMaxScale: Math.min(
                10.0,
                Math.max(5.0, (Number(weapon.explosionRadius) || 8.5) * 0.75)
            ),
            blurStartScale: 2.2,
            blurMaxScale: Math.min(
                12.0,
                Math.max(6.0, (Number(weapon.explosionRadius) || 8.5) * 0.85)
            ),
            maxScale: Math.max(
                2.4,
                Math.min(6.0, (Number(weapon.explosionRadius) || 8.5) * 0.65)
            )
        });
}

export function explodeRocket(position, weapon, scoreCallback, impactNormal = null) {
        this.applyRocketExplosionDamage(position, weapon, scoreCallback);
        // El jugador no recibe daño de su propio RPG, pero sí el impulso
        // radial necesario para hacer rocket jumps y desplazamientos laterales.
        this.player?.applyRocketJumpImpulse?.(
            position,
            weapon.rocketJumpStrength,
            weapon.explosionRadius
        );
        this.createRocketExplosionEffect(position, weapon, impactNormal);

        if (this.audioManager) {
            this.audioManager.playSound(
                weapon.explosionSound || 'rocketExplosion',
                0.9
            );
        }
}

export function updateRocketEffects(delta) {
        for (let i = this.rocketEffects.length - 1; i >= 0; i--) {
            const effect = this.rocketEffects[i];
            effect.age += Math.max(0, delta);
            const progress = Math.min(1, effect.age / effect.duration);

            if (progress >= 1) {
                if (effect.group.parent) this.scene.remove(effect.group);
                effect.materials.forEach(material => material.dispose());
                effect.light.dispose?.();
                this.rocketEffects.splice(i, 1);
                continue;
            }

            const eased = 1 - Math.pow(1 - progress, 2);
            const coreScale = 0.32 + eased * effect.maxScale * 0.62;
            const shellScale = 0.48 + eased * effect.maxScale;
            const ringScale = 0.35 + eased * effect.maxScale * 1.12;
            const spriteScale = effect.spriteStartScale
                + eased * (effect.spriteMaxScale - effect.spriteStartScale);
            const blurScale = effect.blurStartScale
                + eased * (effect.blurMaxScale - effect.blurStartScale);
            effect.core.scale.setScalar(coreScale);
            effect.shell.scale.setScalar(shellScale);
            if (effect.explosionBlur) {
                effect.explosionBlur.scale.setScalar(blurScale);
                effect.explosionBlur.material.opacity = 0.44 * (1 - progress);
            }
            if (effect.explosionSprite) {
                effect.explosionSprite.scale.setScalar(spriteScale);
                effect.explosionSprite.rotation.z += delta * effect.spriteRotationSpeed;
                effect.explosionSprite.material.opacity = 0.92 * (1 - progress);
            }
            effect.shockwaves.forEach((shockwave, index) => {
                shockwave.scale.setScalar(ringScale * (1 + index * 0.08));
                shockwave.rotation.z += delta * (index % 2 === 0 ? 2.8 : -2.2);
            });
            effect.shards.forEach(shard => {
                shard.position.addScaledVector(shard.userData.velocity, delta);
                shard.rotation.x += shard.userData.spin.x * delta;
                shard.rotation.y += shard.userData.spin.y * delta;
                shard.rotation.z += shard.userData.spin.z * delta;
            });
            effect.core.material.opacity = 0.95 * (1 - progress);
            effect.shell.material.opacity = 0.75 * (1 - progress);
            effect.ringMaterial.opacity = 0.8 * (1 - progress);
            effect.shardMaterial.opacity = 0.9 * (1 - progress);
            effect.light.intensity = 4.5 * (1 - progress);
        }
}
