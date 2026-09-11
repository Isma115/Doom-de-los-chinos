// #region Importaciones WeaponSystem
// Descripción: Importaciones de librerías y dependencias necesarias para WeaponSystem.
import * as THREE from '../../node_modules/three/build/three.module.js';
import { WEAPONS_DATA } from '../Constants.js';
import { UIManager } from '../UI.js';
// #endregion

// Descripción: Sistema que gestiona las armas del jugador, incluyendo lógica de disparo, munición y efectos visuales.
export class WeaponSystem {

    // #region Constructor WeaponSystem
    // Descripción: Inicializa el sistema de armas, carga materiales, texturas de impacto y configura el estado inicial.
    constructor(camera, enemyManager, audioManager, player, scene) {
        this.camera = camera;
        this.enemyManager = enemyManager;
        this.audioManager = audioManager;
        this.player = player;
        this.scene = scene;
        this.currentIndex = 0;
        this.lastShotTime = 0;
        this.lastReloadTime = 0;
        this.reloadDuration = 700;
        this.weaponMesh = null;

        this.raycaster = new THREE.Raycaster();
        this.rayOrigin = new THREE.Vector2(0, 0);
        this.impactDecals = [];
        this.maxImpactDecals = 40;
        this.sparkEffects = [];

        // NUEVA ESTRUCTURA: Inicializar bulletLog desde el debugState del player si está disponible
        this.debugState = {
            infiniteAmmo: false,
            bulletLog: (player && player.debugState && player.debugState.bulletLog !== undefined)
                ? player.debugState.bulletLog
                : true,  // Por defecto activado
            fireRateMultiplier: 1.0
        };

        this.weaponMaterials = [];
        WEAPONS_DATA.forEach(weapon => {
            this.weaponMaterials.push(
                new THREE.MeshBasicMaterial({ color: weapon.color })
            );
        });

        // Las texturas permanentes de impacto deben ser únicamente agujeros.
        // Las texturas bullet_wall* son fogonazos/chispas y no deben entrar
        // en la selección aleatoria de decals.
        this.bulletHoleTextures = [];
        const textureLoader = new THREE.TextureLoader();
        const bulletHolePaths = [
            'assets/textures/bullet_hole_generated.png'
        ];
        bulletHolePaths.forEach(path => {
            textureLoader.load(path,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    this.bulletHoleTextures.push(texture);
                },
                undefined,
                (err) => {
                    console.error('No se pudo cargar la textura de agujero de bala', path, err);
                }
            );
        });

        this.updateVisuals();
    }
    // #endregion

    // #region Helpers WeaponSystem
    // Descripción: Métodos de utilidad para obtener el arma actual y los objetos sólidos del entorno.
    getCurrentWeapon() {
        return WEAPONS_DATA[this.currentIndex];
    }

    shouldLeaveBulletHole(weapon) {
        return Boolean(weapon && !weapon.isMelee);
    }

    getSolidObjects() {
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

    getEnemyFromHit(hitObject) {
        let current = hitObject;
        const enemies = this.enemyManager?.enemies || [];

        while (current) {
            if (enemies.includes(current)) return current;
            current = current.parent;
        }

        return null;
    }

    getImpactNormal(hit, origin, direction) {
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

    isDescendantOf(object, ancestor) {
        let current = object;
        while (current) {
            if (current === ancestor) return true;
            current = current.parent;
        }
        return false;
    }

    getBoxImpactNormal(point, box, direction) {
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

    getFallbackBoxHit(origin, direction, solidObjects, visualHit) {
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
    // #endregion

    // #region Efectos Visuales WeaponSystem
    // Descripción: Creación de efectos de impacto en muros y fogonazos de las armas.
    createWallImpactEffect(hitPoint, hitNormal) {
        // ──────────────────────────────────────────────────────────────
        // NUEVA ESTRUCTURA: elegir una textura aleatoria del array
        // ──────────────────────────────────────────────────────────────
        if (this.bulletHoleTextures.length === 0) {
            return; // nada que pintar si el agujero aún no ha cargado
        }

        const texture = this.bulletHoleTextures[
            Math.floor(Math.random() * this.bulletHoleTextures.length)
        ];
        const normal = hitNormal.clone().normalize();

        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: 0xb0aaa0,
            transparent: true,
            opacity: 0.78,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            alphaTest: 0.02,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 2;

        const offset = 0.035;
        const adjustedPosition = hitPoint.clone();
        adjustedPosition.add(normal.clone().multiplyScalar(offset));
        mesh.position.copy(adjustedPosition);

        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        mesh.rotateZ(Math.random() * Math.PI * 2);

        const baseSize = 0.25;
        const randomSize = 0.08 + Math.random() * 0.2;
        const finalSize = baseSize + randomSize;
        mesh.scale.set(finalSize, finalSize, finalSize);

        this.scene.add(mesh);
        this.impactDecals.push(mesh);

        while (this.impactDecals.length > this.maxImpactDecals) {
            this.removeOldestImpactDecal();
        }
    }

    removeOldestImpactDecal() {
        const oldDecal = this.impactDecals.shift();
        if (!oldDecal) return;

        if (oldDecal.parent) {
            oldDecal.parent.remove(oldDecal);
        }

        oldDecal.material.dispose();
        oldDecal.geometry.dispose();
    }

    createBulletSparkEffect(hitPoint, hitNormal) {
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

    animateSparkEffect(effect) {
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

    showMuzzleFlash() {
        if (!this.weaponFlashTexture) return;

        if (this.flashMesh) {
            this.camera.remove(this.flashMesh);
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

        this.camera.add(this.flashMesh);

        // Animación de desaparición
        const fadeOut = () => {
            if (this.flashMesh && this.flashMesh.material) {
                this.flashMesh.material.opacity -= 0.08;
                if (this.flashMesh.material.opacity <= 0) {
                    this.camera.remove(this.flashMesh);
                    this.flashMesh.material.dispose();
                    this.flashMesh = null;
                } else {
                    requestAnimationFrame(fadeOut);
                }
            }
        };
        setTimeout(fadeOut, 50);
    }

    // #region Gestión de Munición WeaponSystem
    // Descripción: Lógica para añadir munición y cambiar entre las armas disponibles.
    addAmmo(amount, weaponIndex = null) {
        if (weaponIndex !== null) {
            const weapon = WEAPONS_DATA[weaponIndex];
            weapon.ammo = Math.min(weapon.maxAmmo, weapon.ammo + amount);
            if (weaponIndex === this.currentIndex) {
                UIManager.updateAmmo(weapon.ammo);
            }
        } else {
            const weapon = this.getCurrentWeapon();
            weapon.ammo = Math.min(weapon.maxAmmo, weapon.ammo + amount);
            UIManager.updateAmmo(weapon.ammo);
        }
    }

    switchWeapon(direction) {
        if (direction > 0) {
            this.currentIndex = (this.currentIndex + 1) % WEAPONS_DATA.length;
        } else {
            this.currentIndex = (this.currentIndex - 1 + WEAPONS_DATA.length) % WEAPONS_DATA.length;
        }
        this.updateVisuals();
    }

    reloadCurrentWeapon() {
        const weapon = this.getCurrentWeapon();
        const now = performance.now();

        if (!weapon || weapon.isMelee || weapon.maxAmmo === Infinity) {
            return false;
        }

        if (now - this.lastReloadTime < this.reloadDuration) {
            return false;
        }

        this.lastReloadTime = now;

        if (this.audioManager) {
            this.audioManager.playSound('reload', 0.8, false, 0.95 + Math.random() * 0.08);
        }

        this.animateReload();
        return true;
    }
    // #endregion

    // #region Visuales Arma WeaponSystem
    // Descripción: Actualiza el sprite del arma visible en pantalla según el arma seleccionada.
    updateVisuals() {
        if (this.weaponMesh) {
            this.camera.remove(this.weaponMesh);
            if (this.weaponMesh.material.map) this.weaponMesh.material.map.dispose();
            this.weaponMesh.material.dispose();
        }

        const loader = new THREE.TextureLoader();
        const weapon = this.getCurrentWeapon();

        // Cargar sprite solo si existe, si no, usar textura transparente/vacía
        if (weapon.sprite) {
            this.weaponTexture = loader.load(
                'assets/weapons/' + weapon.sprite,
                () => { },
                () => { },
                () => { console.error("No se pudo cargar el sprite del arma"); }
            );
        } else {
            // Textura vacía para armas sin sprite
            this.weaponTexture = new THREE.Texture();
            console.warn(`Arma "${weapon.name}" sin sprite definido`);
        }

        // Cargar flash: usar el mismo que sprite si no tiene propio, o vacío si ninguno
        const flashPath = weapon.flash ? 'assets/weapons/' + weapon.flash : (weapon.sprite ? 'assets/weapons/' + weapon.sprite : null);
        if (flashPath) {
            this.weaponFlashTexture = loader.load(
                flashPath,
                () => { },
                () => { },
                () => { console.error("No se pudo cargar el sprite de ataque"); }
            );
        } else {
            this.weaponFlashTexture = this.weaponTexture; // fallback al sprite (aunque sea vacío)
        }

        // El arma NO debe escribirse en el depth buffer ni respetar profundidad de paredes
        const material = new THREE.SpriteMaterial({
            map: this.weaponTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        this.weaponMesh = new THREE.Sprite(material);
        this.weaponMesh.renderOrder = 999;

        // Ajuste de escala y posición según el arma
        let scale = 1.4;        // tamaño base para pistola y ametralladora
        let posY = -0.25;       // posición vertical base
        let posX = 0.5;         // posición horizontal (puedes ajustar si quieres centrar más/menos)

        if (weapon.name === "CUCHILLO") {
            scale = 1.0;        // más pequeño como ya ajustamos antes
            posY = -0.5;        // bajar mucho más para que no se corte por abajo
            posX = 0.6;         // mantener el cuchillo desplazado a la derecha (como estaba originalmente)
        } else if (weapon.name === "ESCOPETA") {
            scale = 1.0;        // más pequeño como ya ajustamos antes
            posY = -0.5;        // bajar mucho más para que no se corte por abajo
            posX = 0.0;         // escopeta centrada horizontalmente en la pantalla (eje X = 0)
        }

        this.weaponMesh.scale.set(scale, scale, 1);
        this.weaponMesh.position.set(posX, posY, -1.1);

        this.weaponMesh.frustumCulled = false;

        this.camera.add(this.weaponMesh);

        UIManager.updateWeapon(weapon.name, weapon.isMelee ? "∞" : weapon.ammo);
    }
    // #endregion

    // #region Lógica de Disparo WeaponSystem
    // Descripción: Gestiona el disparo, cooldowns, gasto de munición y animación de disparo.
    tryShoot(scoreCallback) {
        const now = performance.now();
        const weapon = this.getCurrentWeapon();

        // CORRECCIÓN: Aplicar el multiplicador de cadencia de disparo
        const fireRateMultiplier = this.debugState.fireRateMultiplier || 1.0;
        const adjustedDelay = weapon.delay / fireRateMultiplier;

        if (now - this.lastShotTime < adjustedDelay) return;

        // Sin munición (excepto melee o infinite ammo)
        if (!weapon.isMelee && !this.debugState.infiniteAmmo && weapon.ammo <= 0) {
            // Cooldown separado para el sonido de "sin munición" (no depende de fireRateMultiplier)
            const outOfAmmoDelay = 1000; // 1 segundo de cooldown para el sonido "sin munición"

            // Verificar si ha pasado suficiente tiempo desde el último sonido de "sin munición"
            if (!this.lastOutOfAmmoTime || (now - this.lastOutOfAmmoTime) >= outOfAmmoDelay) {
                // REPARACIÓN DEFINITIVA: Forzar reanudación del AudioContext antes de reproducir out_of_ammo
                if (this.audioManager) {
                    // Reanudar contexto si está suspendido (políticas de autoplay)
                    if (this.audioManager.audioContext && this.audioManager.audioContext.state === 'suspended') {
                        this.audioManager.audioContext.resume().then(() => {
                            console.log("AudioContext reanudado para sonido out_of_ammo");
                        });
                    }
                    // Reproducir el sonido con un pequeño retraso para dar tiempo a la reanudación
                    setTimeout(() => {
                        this.audioManager.playSound('out_of_ammo', 0.6);
                    }, 50);
                }
                // Actualizar el tiempo del último sonido de "sin munición"
                this.lastOutOfAmmoTime = now;
            }
            return false;
        }

        if (!this.debugState.infiniteAmmo) {
            if (weapon.ammo <= 0) return;

            if (!weapon.isMelee) {
                weapon.ammo--;
                UIManager.updateAmmo(weapon.ammo);
            } else {
                UIManager.updateAmmo("∞");
            }
        } else {
            UIManager.updateAmmo("∞");
        }

        this.lastShotTime = now;

        if (this.audioManager && weapon.shootSound) {
            this.audioManager.playSound(weapon.shootSound);
        }

        if (weapon.name === "AMETRALLADORA") {
            this.player.applyRecoil(7);
        } else if (weapon.name === "ESCOPETA") {
            this.player.applyRecoil(12);
        }

        if (this.weaponMesh && this.weaponFlashTexture) {
            this.weaponMesh.material.map = this.weaponFlashTexture;
            this.weaponMesh.material.needsUpdate = true;

            setTimeout(() => {
                if (this.weaponMesh && this.weaponTexture) {
                    this.weaponMesh.material.map = this.weaponTexture;
                    this.weaponMesh.material.needsUpdate = true;
                }
            }, 80);
        }

        this.performRaycast(weapon, scoreCallback);
        this.animateRecoil();
        return true;
    }
    // #endregion

    // #region Sistema Raycast WeaponSystem
    // Descripción: Lógica de detección de impactos mediante Raycasting para determinar aciertos en enemigos o entornos.
    performRaycast(weapon, scoreCallback) {
        const pelletCount = weapon.pelletCount || 1;
        const spread = weapon.spread || 0;
        let lastBulletStopPosition = null;

        // Algunos props se cargan o transforman justo antes de disparar.
        // Actualizar matrices aquí garantiza que el raycast use su posición
        // y rotación actuales.
        if (this.scene?.updateMatrixWorld) {
            this.scene.updateMatrixWorld(true);
        }

        for (let i = 0; i < pelletCount; i++) {
            const direction = this.getShotDirection(spread);
            lastBulletStopPosition = this.performSingleRaycast(weapon, scoreCallback, direction);
        }

        if (lastBulletStopPosition && this.player && this.player.debugState && this.player.debugState.bulletLog) {
            if (pelletCount > 1) {
                console.log(`Escopeta: ${pelletCount} perdigones disparados con dispersión.`);
            }
            console.log(`Última bala disparada se detuvo en X: ${lastBulletStopPosition.x.toFixed(2)}, Y: ${lastBulletStopPosition.y.toFixed(2)}, Z: ${lastBulletStopPosition.z.toFixed(2)}`);
        }
    }

    getShotDirection(spread = 0) {
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

    performSingleRaycast(weapon, scoreCallback, direction) {
        const origin = new THREE.Vector3();
        if (this.camera?.updateMatrixWorld) {
            this.camera.updateMatrixWorld(true);
        }
        this.camera.getWorldPosition(origin);
        this.raycaster.set(origin, direction);
        this.raycaster.far = weapon.isMelee && weapon.range ? weapon.range : Infinity;

        const enemyMeshes = this.enemyManager.enemies.filter(e => e.visible && !e.userData?.isDying);
        const solidObjects = this.getSolidObjects();
        const allObjects = [...new Set(enemyMeshes.concat(solidObjects).filter(Boolean))];
        const intersects = this.raycaster.intersectObjects(allObjects, true);
        const visualHit = intersects[0] || null;
        const fallbackHit = this.getFallbackBoxHit(origin, direction, solidObjects, visualHit);
        const hit = fallbackHit || visualHit;

        if (!hit) {
            const farPoint = new THREE.Vector3();
            this.raycaster.ray.at(200, farPoint);
            return farPoint;
        }

        const hitObj = hit.object;
        const hitPoint = hit.point;
        const hitEnemy = this.getEnemyFromHit(hitObj);

        if (hitEnemy && hitEnemy.userData && hitEnemy.userData.hp !== undefined) {
            hitEnemy.userData.hp -= weapon.damage;

            const impactTime = performance.now();
            hitEnemy.userData.bloodTime = impactTime;
            if (hitEnemy.userData.drawBlood) {
                hitEnemy.userData.drawBlood(hitPoint);
            }

            if (hitEnemy.material && hitEnemy.material.color) {
                hitEnemy.material.color.setHex(0xff3333);
                setTimeout(() => {
                    if (hitEnemy.parent && hitEnemy.userData.hp > 0) {
                        hitEnemy.material.color.setHex(0xffffff);
                    }
                }, 80);
            }

            if (hitEnemy.userData.hp <= 0) {
                this.enemyManager.removeEnemy(hitEnemy);
                if (scoreCallback) scoreCallback();
            }
        } else if (this.shouldLeaveBulletHole(weapon)) {
            if (this.audioManager) {
                this.audioManager.playSound('enemyHit', 0.3);
            }

            const hitNormal = this.getImpactNormal(hit, origin, direction);
            this.createBulletSparkEffect(hitPoint, hitNormal);
            this.createWallImpactEffect(hitPoint, hitNormal);
        }

        return hitPoint.clone();
    }
    // #endregion

    // #region Animación Recoil WeaponSystem
    // Descripción: Animación de retroceso del arma al disparar.
    animateRecoil() {
        if (!this.weaponMesh) return;

        const weapon = this.getCurrentWeapon();

        if (weapon.isMelee) {
            // ARMAS MELEE: Barrido horizontal brusco y largo
            const startX = this.weaponMesh.position.x;
            const swingDistance = 1.8; // Distancia larga del barrido
            const swingDuration = 100; // Milisegundos para el barrido (rápido)

            // Movimiento inicial hacia la izquierda (preparación rápida)
            this.weaponMesh.position.x = startX - 0.3;
            this.weaponMesh.rotation.z = 0.2;

            // Barrido brusco hacia la derecha
            setTimeout(() => {
                if (this.weaponMesh) {
                    this.weaponMesh.position.x = startX + swingDistance;
                    this.weaponMesh.rotation.z = -0.4;
                }
            }, 30);

            // Volver a posición original
            setTimeout(() => {
                if (this.weaponMesh) {
                    this.weaponMesh.position.x = startX;
                    this.weaponMesh.rotation.z = 0;
                }
            }, swingDuration + 50);
        } else {
            // ARMAS A DISTANCIA: Retroceso tradicional REDUCIDO para la ametralladora
            // Valores originales: z += 0.2, y -= 0.05 → ahora más suave y corto
            this.weaponMesh.position.z += 0.1;   // Mitad de retroceso hacia atrás
            this.weaponMesh.position.y -= 0.02; // Mitad de bajada

            setTimeout(() => {
                if (this.weaponMesh) {
                    this.weaponMesh.position.z -= 0.1;
                    this.weaponMesh.position.y += 0.02;
                }
            }, 80);
        }
    }

    animateReload() {
        if (!this.weaponMesh) return;

        const startY = this.weaponMesh.position.y;
        const startZ = this.weaponMesh.position.z;
        const startRotation = this.weaponMesh.rotation.z;

        this.weaponMesh.position.y = startY - 0.14;
        this.weaponMesh.position.z = startZ + 0.05;
        this.weaponMesh.rotation.z = startRotation - 0.18;

        setTimeout(() => {
            if (!this.weaponMesh) return;
            this.weaponMesh.position.y = startY;
            this.weaponMesh.position.z = startZ;
            this.weaponMesh.rotation.z = startRotation;
        }, this.reloadDuration);
    }
    // #endregion

    // #region Limpieza WeaponSystem
    // Descripción: Liberación de recursos y geometrías del sistema de armas.
    dispose() {
        if (this.weaponMesh) {
            this.camera.remove(this.weaponMesh);
            this.weaponMesh.geometry = null; //
            this.weaponMesh.material = null;
        }

        this.weaponMaterials.forEach(mat => mat.dispose());
        this.weaponMaterials = [];

        while (this.impactDecals.length > 0) {
            this.removeOldestImpactDecal();
        }

        this.bulletHoleTextures.forEach(texture => texture.dispose());
        this.bulletHoleTextures = [];
    }
    // #endregion
}
