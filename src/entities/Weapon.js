// #region Importaciones WeaponSystem
// Descripción: Importaciones de librerías y dependencias necesarias para WeaponSystem.
import * as THREE from '../../node_modules/three/build/three.module.js';
import { WEAPONS_DATA, ENEMY_TYPES } from '../Constants.js';
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
        this.weaponFlashTimeout = null;

        this.raycaster = new THREE.Raycaster();
        this.rayOrigin = new THREE.Vector2(0, 0);
        this.impactDecals = [];
        this.maxImpactDecals = 40;
        this.sparkEffects = [];
        this.rocketProjectiles = [];
        this.rocketEffects = [];

        // Las armas normales están disponibles desde el inicio. El RPG se
        // incorpora bloqueado y solo se añade a este conjunto al recogerlo.
        this.unlockedWeapons = new Set(
            WEAPONS_DATA
                .filter(weapon => !weapon.requiresPickup)
                .map(weapon => this.getWeaponKey(weapon))
        );

        // Normalizar los miembros de cada grupo para que la ametralladora y
        // la minigun comiencen con un único contador de munición compartido.
        const syncedAmmoGroups = new Set();
        WEAPONS_DATA.forEach(weapon => {
            const ammoGroup = this.getAmmoGroupKey(weapon);
            if (syncedAmmoGroups.has(ammoGroup)) return;
            syncedAmmoGroups.add(ammoGroup);
            this.setAmmoAmount(weapon, this.getAmmoAmount(weapon));
        });

        // Geometría compartida para los cohetes; así disparar varias veces no
        // crea una geometría nueva por proyectil.
        this.rocketBodyGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.62, 8);
        this.rocketTipGeometry = new THREE.ConeGeometry(0.12, 0.24, 8);
        this.rocketFlameGeometry = new THREE.ConeGeometry(0.065, 0.18, 6);
        this.rocketExplosionGeometry = new THREE.SphereGeometry(1, 12, 8);
        this.rocketExplosionRingGeometry = new THREE.TorusGeometry(
            0.78,
            0.085,
            6,
            18
        );
        this.rocketExplosionShardGeometry = new THREE.TetrahedronGeometry(0.14, 0);
        this.rocketBodyMaterial = new THREE.MeshBasicMaterial({ color: 0x68764d });
        this.rocketTipMaterial = new THREE.MeshBasicMaterial({ color: 0xa32720 });
        this.rocketFlameMaterial = new THREE.MeshBasicMaterial({
            color: 0xff8a18,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

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
        this.rocketExplosionTexture = textureLoader.load(
            'assets/textures/rocket_explosion_pixel.png',
            (texture) => {
                texture.needsUpdate = true;
            },
            undefined,
            (err) => {
                this.rocketExplosionTexture = null;
                console.error('No se pudo cargar el sprite de explosión del RPG', err);
            }
        );
        this.rocketExplosionTexture.colorSpace = THREE.SRGBColorSpace;
        // El asset está diseñado con píxeles grandes: no suavizarlo conserva
        // la silueta legible cuando el billboard se ve a poca escala.
        this.rocketExplosionTexture.magFilter = THREE.NearestFilter;
        this.rocketExplosionTexture.minFilter = THREE.NearestFilter;
        this.rocketExplosionTexture.generateMipmaps = false;
        this.rocketExplosionTexture.needsUpdate = true;
        // Halo suave independiente del sprite pixelado: añade difusión sin
        // cambiar el filtrado Nearest del PNG central.
        this.rocketExplosionBlurTexture = this.createRocketExplosionBlurTexture();
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

    createRocketExplosionBlurTexture() {
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

    // #region Helpers WeaponSystem
    // Descripción: Métodos de utilidad para obtener el arma actual y los objetos sólidos del entorno.
    getCurrentWeapon() {
        return WEAPONS_DATA[this.currentIndex];
    }

    getWeaponKey(weapon) {
        return weapon?.id || weapon?.name || null;
    }

    getAmmoGroupKey(weapon) {
        return weapon?.ammoGroup || this.getWeaponKey(weapon);
    }

    getAmmoGroupWeapons(weapon) {
        const ammoGroup = this.getAmmoGroupKey(weapon);
        return WEAPONS_DATA.filter(candidate =>
            this.getAmmoGroupKey(candidate) === ammoGroup
        );
    }

    getAmmoAmount(weapon) {
        const groupWeapon = this.getAmmoGroupWeapons(weapon)[0];
        return groupWeapon?.ammo ?? 0;
    }

    getAmmoCapacity(weapon) {
        return this.getAmmoGroupWeapons(weapon).reduce(
            (capacity, groupWeapon) => {
                const maxAmmo = Number(groupWeapon.maxAmmo);
                return Number.isFinite(maxAmmo)
                    ? Math.min(capacity, maxAmmo)
                    : capacity;
            },
            Infinity
        );
    }

    setAmmoAmount(weapon, amount) {
        const capacity = this.getAmmoCapacity(weapon);
        const numericAmount = Number(amount);
        const safeAmount = capacity === Infinity
            ? numericAmount
            : Math.min(
                capacity,
                Math.max(0, Number.isFinite(numericAmount) ? numericAmount : 0)
            );

        this.getAmmoGroupWeapons(weapon).forEach(groupWeapon => {
            groupWeapon.ammo = safeAmount;
        });
        return safeAmount;
    }

    isWeaponUnlocked(weapon) {
        const key = typeof weapon === 'string'
            ? weapon
            : this.getWeaponKey(weapon);
        return Boolean(key && this.unlockedWeapons.has(key));
    }

    findWeaponIndex(weaponId) {
        if (Number.isInteger(weaponId)) {
            return weaponId >= 0 && weaponId < WEAPONS_DATA.length ? weaponId : -1;
        }

        return WEAPONS_DATA.findIndex(weapon =>
            weapon.id === weaponId || weapon.name === weaponId
        );
    }

    unlockWeapon(weaponId, ammoAmount = 0, equip = true) {
        const weaponIndex = this.findWeaponIndex(weaponId);
        const weapon = weaponIndex >= 0 ? WEAPONS_DATA[weaponIndex] : null;
        if (!weapon) return null;

        const weaponKey = this.getWeaponKey(weapon);
        const newlyUnlocked = !this.unlockedWeapons.has(weaponKey);
        this.unlockedWeapons.add(weaponKey);

        const amount = Number(ammoAmount);
        if (Number.isFinite(amount) && amount > 0 && Number.isFinite(weapon.maxAmmo)) {
            this.setAmmoAmount(
                weapon,
                this.getAmmoAmount(weapon) + amount
            );
        }

        if (equip) {
            this.currentIndex = weaponIndex;
            this.updateVisuals();
        }

        return { weapon, weaponIndex, newlyUnlocked };
    }

    unlockAllWeapons(equipLast = true) {
        const grantableWeapons = WEAPONS_DATA.filter(weapon => weapon.requiresPickup);
        const unlockedWeapons = [];

        grantableWeapons.forEach(weapon => {
            const ammoAmount = Number.isFinite(weapon.maxAmmo)
                ? weapon.maxAmmo
                : Number(weapon.pickupAmmo) || 0;
            const unlocked = this.unlockWeapon(
                this.getWeaponKey(weapon),
                ammoAmount,
                false
            );

            if (unlocked) unlockedWeapons.push(unlocked);
        });

        const lastUnlocked = unlockedWeapons[unlockedWeapons.length - 1];
        if (lastUnlocked && equipLast) {
            this.currentIndex = lastUnlocked.weaponIndex;
            this.updateVisuals();
        }

        return unlockedWeapons;
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
        // Los NPC y enemigos son planos transparentes que no escriben en el
        // depth buffer. Dibujar el agujero antes que ellos permite que sus
        // sprites lo oculten cuando se encuentran entre la cámara y la pared.
        mesh.renderOrder = -10;

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
        const weapon = weaponIndex !== null
            ? WEAPONS_DATA[weaponIndex]
            : this.getCurrentWeapon();
        if (!weapon || !this.isWeaponUnlocked(weapon)) return false;

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) return false;

        this.setAmmoAmount(
            weapon,
            this.getAmmoAmount(weapon) + numericAmount
        );
        const currentWeapon = this.getCurrentWeapon();
        if (
            weaponIndex === null
            || this.getAmmoGroupKey(currentWeapon) === this.getAmmoGroupKey(weapon)
        ) {
            UIManager.updateAmmo(this.getAmmoAmount(currentWeapon));
        }
        return true;
    }

    switchWeapon(direction) {
        const step = direction > 0 ? 1 : -1;
        for (let attempts = 0; attempts < WEAPONS_DATA.length; attempts++) {
            const nextIndex = (
                this.currentIndex + step + WEAPONS_DATA.length
            ) % WEAPONS_DATA.length;

            this.currentIndex = nextIndex;
            if (this.isWeaponUnlocked(WEAPONS_DATA[nextIndex])) {
                this.updateVisuals();
                return true;
            }
        }

        return false;
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
        if (this.weaponFlashTimeout !== null) {
            clearTimeout(this.weaponFlashTimeout);
            this.weaponFlashTimeout = null;
        }

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
        } else if (weapon.id === 'rpg') {
            scale = 0.82;
            posY = -0.48;
            posX = 0.36;
        } else if (weapon.id === 'minigun') {
            scale = 0.9;
            posY = -0.42;
            posX = 0.72;
        }

        this.weaponMesh.scale.set(scale, scale, 1);
        this.weaponMesh.position.set(posX, posY, -1.1);

        this.weaponMesh.frustumCulled = false;

        this.camera.add(this.weaponMesh);

        UIManager.updateWeapon(
            weapon.name,
            weapon.isMelee ? "∞" : this.getAmmoAmount(weapon)
        );
    }
    // #endregion

    // #region Lógica de Disparo WeaponSystem
    // Descripción: Gestiona el disparo, cooldowns, gasto de munición y animación de disparo.
    tryShoot(scoreCallback) {
        const now = performance.now();
        const weapon = this.getCurrentWeapon();

        if (!weapon || !this.isWeaponUnlocked(weapon)) return false;

        // CORRECCIÓN: Aplicar el multiplicador de cadencia de disparo
        const fireRateMultiplier = this.debugState.fireRateMultiplier || 1.0;
        const adjustedDelay = weapon.delay / fireRateMultiplier;

        if (now - this.lastShotTime < adjustedDelay) return;

        // Sin munición (excepto melee o infinite ammo)
        if (
            !weapon.isMelee
            && !this.debugState.infiniteAmmo
            && this.getAmmoAmount(weapon) <= 0
        ) {
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
            if (!weapon.isMelee && this.getAmmoAmount(weapon) <= 0) return;

            if (!weapon.isMelee) {
                this.setAmmoAmount(
                    weapon,
                    this.getAmmoAmount(weapon) - 1
                );
                UIManager.updateAmmo(this.getAmmoAmount(weapon));
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
        } else if (weapon.id === 'minigun') {
            this.player.applyRecoil(weapon.recoil || 14);
        } else if (weapon.name === "ESCOPETA") {
            this.player.applyRecoil(12);
        } else if (weapon.id === 'rpg') {
            this.player.applyRecoil(18);
        }

        if (this.weaponMesh && this.weaponFlashTexture) {
            this.weaponMesh.material.map = this.weaponFlashTexture;
            this.weaponMesh.material.needsUpdate = true;

            if (this.weaponFlashTimeout !== null) {
                clearTimeout(this.weaponFlashTimeout);
            }
            this.weaponFlashTimeout = setTimeout(() => {
                this.weaponFlashTimeout = null;
                if (this.weaponMesh && this.weaponTexture) {
                    this.weaponMesh.material.map = this.weaponTexture;
                    this.weaponMesh.material.needsUpdate = true;
                }
            }, Math.max(20, Number(weapon.flashDuration) || 80));
        }

        if (weapon.projectileType === 'rocket') {
            this.launchRocket(weapon, scoreCallback);
        } else {
            this.performRaycast(weapon, scoreCallback);
        }
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

            const hitEnemyType = ENEMY_TYPES.find(
                type => type.id === hitEnemy.userData.enemyType
            );
            const isAnimatedSpriteSheetEnemy = Boolean(hitEnemyType?.spriteSheet);

            if (!isAnimatedSpriteSheetEnemy && hitEnemy.material && hitEnemy.material.color) {
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

    // #region Cohetes y explosión de área WeaponSystem
    // Descripción: Proyectiles visibles del RPG, colisión continua y daño de
    // área con caída de potencia según la distancia al centro.
    createRocketMesh(direction) {
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

    launchRocket(weapon, scoreCallback) {
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

    getRocketImpact(previousPosition, currentPosition, radius = 0.2) {
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

    getRocketGroundImpact(previousPosition, currentPosition, groundY = 0.02) {
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

    removeRocket(rocket) {
        if (!rocket) return;

        const index = this.rocketProjectiles.indexOf(rocket);
        if (index !== -1) {
            this.rocketProjectiles.splice(index, 1);
        }
        if (rocket.parent) {
            rocket.parent.remove(rocket);
        }
    }

    applyRocketExplosionDamage(position, weapon, scoreCallback) {
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

    createRocketExplosionEffect(position, weapon, impactNormal = null) {
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

    explodeRocket(position, weapon, scoreCallback, impactNormal = null) {
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

    updateRocketEffects(delta) {
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

    update(delta, scoreCallback = null) {
        const now = performance.now();

        for (let i = this.rocketProjectiles.length - 1; i >= 0; i--) {
            const rocket = this.rocketProjectiles[i];
            const data = rocket?.userData;
            if (!rocket || !data) {
                this.rocketProjectiles.splice(i, 1);
                continue;
            }

            const previousPosition = rocket.position.clone();
            rocket.position.addScaledVector(data.velocity, Math.max(0, delta));
            data.travelDistance += previousPosition.distanceTo(rocket.position);

            const rayImpact = data.travelDistance >= data.armingDistance
                ? this.getRocketImpact(
                    previousPosition,
                    rocket.position,
                    data.radius
                )
                : null;
            const groundImpact = data.travelDistance >= data.armingDistance
                ? this.getRocketGroundImpact(previousPosition, rocket.position)
                : null;
            const impact = [rayImpact, groundImpact]
                .filter(Boolean)
                .sort((first, second) => first.distance - second.distance)[0] || null;
            const expired = now - data.creationTime >= data.maxLifetime;

            if (impact || expired) {
                const explosionPosition = impact?.point || rocket.position.clone();
                this.removeRocket(rocket);
                this.explodeRocket(
                    explosionPosition,
                    data.weapon,
                    data.scoreCallback || scoreCallback,
                    impact?.normal || null
                );
            }
        }

        this.updateRocketEffects(delta);
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
            const recoilDistance = Math.max(
                0,
                Number(weapon.viewRecoilDistance) || 0.1
            );
            const recoilDrop = Math.max(
                0,
                Number(weapon.viewRecoilDrop) || 0.02
            );
            const recoilDuration = Math.max(
                20,
                Number(weapon.viewRecoilDuration) || 80
            );

            this.weaponMesh.position.z += recoilDistance;
            this.weaponMesh.position.y -= recoilDrop;

            setTimeout(() => {
                if (this.weaponMesh) {
                    this.weaponMesh.position.z -= recoilDistance;
                    this.weaponMesh.position.y += recoilDrop;
                }
            }, recoilDuration);
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
        if (this.weaponFlashTimeout !== null) {
            clearTimeout(this.weaponFlashTimeout);
            this.weaponFlashTimeout = null;
        }

        if (this.weaponMesh) {
            this.camera.remove(this.weaponMesh);
            this.weaponMesh.geometry = null; //
            this.weaponMesh.material = null;
        }

        this.rocketProjectiles.forEach(rocket => {
            if (rocket?.parent) rocket.parent.remove(rocket);
        });
        this.rocketProjectiles = [];

        this.rocketEffects.forEach(effect => {
            if (effect?.group?.parent) this.scene.remove(effect.group);
            effect?.materials?.forEach(material => material.dispose());
        });
        this.rocketEffects = [];

        this.weaponMaterials.forEach(mat => mat.dispose());
        this.weaponMaterials = [];

        while (this.impactDecals.length > 0) {
            this.removeOldestImpactDecal();
        }

        this.bulletHoleTextures.forEach(texture => texture.dispose());
        this.bulletHoleTextures = [];

        this.rocketBodyGeometry?.dispose();
        this.rocketTipGeometry?.dispose();
        this.rocketFlameGeometry?.dispose();
        this.rocketExplosionGeometry?.dispose();
        this.rocketExplosionRingGeometry?.dispose();
        this.rocketExplosionShardGeometry?.dispose();
        this.rocketBodyMaterial?.dispose();
        this.rocketTipMaterial?.dispose();
        this.rocketFlameMaterial?.dispose();
        this.rocketExplosionTexture?.dispose();
        this.rocketExplosionTexture = null;
        this.rocketExplosionBlurTexture?.dispose();
        this.rocketExplosionBlurTexture = null;
    }
    // #endregion
}
