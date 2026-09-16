// #region Importaciones WeaponSystem
// Descripción: Importaciones de librerías y dependencias necesarias para WeaponSystem.
import * as THREE from 'three';
import { WEAPONS_DATA, ENEMY_TYPES } from '../Constants.js';
import { UIManager } from '../UI.js';
import {
    getCurrentWeapon as getCurrentWeaponFn,
    getWeaponKey as getWeaponKeyFn,
    getAmmoGroupKey as getAmmoGroupKeyFn,
    getAmmoGroupWeapons as getAmmoGroupWeaponsFn,
    getAmmoAmount as getAmmoAmountFn,
    getAmmoCapacity as getAmmoCapacityFn,
    setAmmoAmount as setAmmoAmountFn,
    isWeaponUnlocked as isWeaponUnlockedFn,
    findWeaponIndex as findWeaponIndexFn,
    unlockWeapon as unlockWeaponFn,
    unlockAllWeapons as unlockAllWeaponsFn,
    selectWeapon as selectWeaponFn,
    addAmmo as addAmmoFn,
    switchWeapon as switchWeaponFn,
    reloadCurrentWeapon as reloadCurrentWeaponFn
} from './weapons/Ammo.js';
import {
    shouldLeaveBulletHole as shouldLeaveBulletHoleFn,
    getSolidObjects as getSolidObjectsFn,
    getEnemyFromHit as getEnemyFromHitFn,
    getImpactNormal as getImpactNormalFn,
    isDescendantOf as isDescendantOfFn,
    getBoxImpactNormal as getBoxImpactNormalFn,
    getFallbackBoxHit as getFallbackBoxHitFn,
    getShotDirection as getShotDirectionFn
} from './weapons/Hitscan.js';
import {
    createWallImpactEffect as createWallImpactEffectFn,
    removeOldestImpactDecal as removeOldestImpactDecalFn
} from './weapons/ImpactDecals.js';
import {
    createBulletSparkEffect as createBulletSparkEffectFn,
    animateSparkEffect as animateSparkEffectFn,
    showMuzzleFlash as showMuzzleFlashFn,
    createRocketExplosionBlurTexture as createRocketExplosionBlurTextureFn
} from './weapons/WeaponEffects.js';
import {
    createRocketMesh as createRocketMeshFn,
    launchRocket as launchRocketFn,
    getRocketImpact as getRocketImpactFn,
    getRocketGroundImpact as getRocketGroundImpactFn,
    removeRocket as removeRocketFn,
    applyRocketExplosionDamage as applyRocketExplosionDamageFn,
    createRocketExplosionEffect as createRocketExplosionEffectFn,
    explodeRocket as explodeRocketFn,
    updateRocketEffects as updateRocketEffectsFn
} from './weapons/Rockets.js';
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

        // El sprite del arma conserva sus animaciones propias (retroceso y
        // recarga), mientras este grupo aplica únicamente el balanceo al
        // caminar. Separarlos evita que una animación sobrescriba a la otra.
        this.weaponSwayGroup = new THREE.Group();
        this.weaponSwayGroup.name = 'weapon-sway-group';
        this.camera.add(this.weaponSwayGroup);
        // Secuencia fija para que cada paso reproduzca exactamente el mismo
        // arco: izquierda, caída central, derecha y regreso. No depende de
        // senos ni de la velocidad concreta del jugador.
        this.weaponWalkCycle = 0;
        this.weaponWalkSwayActive = false;
        this.weaponWalkCycleRate = 0.34;
        this.weaponWalkSwayKeyframes = [
            { offset: [-0.24, 0, 0], rotation: [0, 0, 0.012] },
            { offset: [-0.224, -0.030, 0], rotation: [0, 0, 0.010] },
            { offset: [-0.192, -0.060, 0], rotation: [0, 0, 0.007] },
            { offset: [-0.144, -0.090, 0], rotation: [0, 0, 0.004] },
            { offset: [-0.072, -0.115, 0], rotation: [0, 0, 0.002] },
            { offset: [0, -0.135, 0], rotation: [0, 0, 0] },
            { offset: [0.072, -0.115, 0], rotation: [0, 0, -0.002] },
            { offset: [0.144, -0.090, 0], rotation: [0, 0, -0.004] },
            { offset: [0.192, -0.060, 0], rotation: [0, 0, -0.007] },
            { offset: [0.224, -0.030, 0], rotation: [0, 0, -0.010] },
            { offset: [0.24, 0, 0], rotation: [0, 0, -0.012] },
            { offset: [0.224, -0.030, 0], rotation: [0, 0, -0.010] },
            { offset: [0.192, -0.060, 0], rotation: [0, 0, -0.007] },
            { offset: [0.144, -0.090, 0], rotation: [0, 0, -0.004] },
            { offset: [0.072, -0.115, 0], rotation: [0, 0, -0.002] },
            { offset: [0, -0.135, 0], rotation: [0, 0, 0] },
            { offset: [-0.072, -0.115, 0], rotation: [0, 0, 0.002] },
            { offset: [-0.144, -0.090, 0], rotation: [0, 0, 0.004] },
            { offset: [-0.192, -0.060, 0], rotation: [0, 0, 0.007] },
            { offset: [-0.224, -0.030, 0], rotation: [0, 0, 0.010] }
        ].map(({ offset, rotation }) => ({
            offset: new THREE.Vector3(...offset),
            rotation: new THREE.Vector3(...rotation)
        }));
        this.weaponSwayBlend = 0;
        this.weaponSwayOffset = new THREE.Vector3();
        this.weaponSwayRotation = new THREE.Vector3();
        this.weaponSwayTargetOffset = new THREE.Vector3();
        this.weaponSwayTargetRotation = new THREE.Vector3();

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
        return createRocketExplosionBlurTextureFn.call(this);
    }

    // #region Helpers WeaponSystem
    // Descripción: Métodos de utilidad para obtener el arma actual y los objetos sólidos del entorno.
    getCurrentWeapon() {
        return getCurrentWeaponFn.call(this);
    }

    getWeaponKey(weapon) {
        return getWeaponKeyFn.call(this, weapon);
    }

    getAmmoGroupKey(weapon) {
        return getAmmoGroupKeyFn.call(this, weapon);
    }

    getAmmoGroupWeapons(weapon) {
        return getAmmoGroupWeaponsFn.call(this, weapon);
    }

    getAmmoAmount(weapon) {
        return getAmmoAmountFn.call(this, weapon);
    }

    getAmmoCapacity(weapon) {
        return getAmmoCapacityFn.call(this, weapon);
    }

    setAmmoAmount(weapon, amount) {
        return setAmmoAmountFn.call(this, weapon, amount);
    }

    isWeaponUnlocked(weapon) {
        return isWeaponUnlockedFn.call(this, weapon);
    }

    findWeaponIndex(weaponId) {
        return findWeaponIndexFn.call(this, weaponId);
    }

    unlockWeapon(weaponId, ammoAmount = 0, equip = true) {
        return unlockWeaponFn.call(this, weaponId, ammoAmount, equip);
    }

    unlockAllWeapons(equipLast = true) {
        return unlockAllWeaponsFn.call(this, equipLast);
    }

    selectWeapon(weaponId) {
        return selectWeaponFn.call(this, weaponId);
    }

    shouldLeaveBulletHole(weapon) {
        return shouldLeaveBulletHoleFn.call(this, weapon);
    }

    getSolidObjects() {
        return getSolidObjectsFn.call(this);
    }

    getEnemyFromHit(hitObject) {
        return getEnemyFromHitFn.call(this, hitObject);
    }

    getImpactNormal(hit, origin, direction) {
        return getImpactNormalFn.call(this, hit, origin, direction);
    }

    isDescendantOf(object, ancestor) {
        return isDescendantOfFn.call(this, object, ancestor);
    }

    getBoxImpactNormal(point, box, direction) {
        return getBoxImpactNormalFn.call(this, point, box, direction);
    }

    getFallbackBoxHit(origin, direction, solidObjects, visualHit) {
        return getFallbackBoxHitFn.call(this, origin, direction, solidObjects, visualHit);
    }
    // #endregion

    // #region Efectos Visuales WeaponSystem
    // Descripción: Creación de efectos de impacto en muros y fogonazos de las armas.
    createWallImpactEffect(hitPoint, hitNormal) {
        return createWallImpactEffectFn.call(this, hitPoint, hitNormal);
    }

    removeOldestImpactDecal() {
        return removeOldestImpactDecalFn.call(this);
    }

    createBulletSparkEffect(hitPoint, hitNormal) {
        return createBulletSparkEffectFn.call(this, hitPoint, hitNormal);
    }

    animateSparkEffect(effect) {
        return animateSparkEffectFn.call(this, effect);
    }

    showMuzzleFlash() {
        return showMuzzleFlashFn.call(this);
    }

    // #region Gestión de Munición WeaponSystem
    // Descripción: Lógica para añadir munición y cambiar entre las armas disponibles.
    addAmmo(amount, weaponIndex = null) {
        return addAmmoFn.call(this, amount, weaponIndex);
    }

    switchWeapon(direction) {
        return switchWeaponFn.call(this, direction);
    }

    reloadCurrentWeapon() {
        return reloadCurrentWeaponFn.call(this);
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
            if (this.weaponMesh.parent) {
                this.weaponMesh.parent.remove(this.weaponMesh);
            }
            if (this.weaponMesh.material.map) this.weaponMesh.material.map.dispose();
            this.weaponMesh.material.dispose();
        }

        const loader = new THREE.TextureLoader();
        const weapon = this.getCurrentWeapon();

        // Herramienta de construcción: sin sprite visible. Se oculta la
        // malla y el HUD de construcción informa del estado.
        if (weapon?.isConstruction || weapon?.isTool) {
            this.weaponTexture = null;
            this.weaponFlashTexture = null;
            if (this.weaponMesh) {
                this.weaponMesh.visible = false;
            }
            UIManager.updateWeapon('🔨 ' + weapon.name, '🔨');
            if (typeof document !== 'undefined') {
                document.body?.classList?.add('build-mode-active');
            }
            return;
        }
        if (typeof document !== 'undefined') {
            document.body?.classList?.remove('build-mode-active');
        }

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
            posY = -0.58;
            posX = 0.72;
        }

        this.weaponMesh.scale.set(scale, scale, 1);
        this.weaponMesh.position.set(posX, posY, -1.1);

        this.weaponMesh.frustumCulled = false;

        (this.weaponSwayGroup || this.camera).add(this.weaponMesh);

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

        // La herramienta de construcción no dispara: los clics los
        // gestiona ConstructionMode desde Player.
        if (weapon.isConstruction || weapon.isTool) return false;

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
        return getShotDirectionFn.call(this, spread);
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
        return createRocketMeshFn.call(this, direction);
    }

    launchRocket(weapon, scoreCallback) {
        return launchRocketFn.call(this, weapon, scoreCallback);
    }

    getRocketImpact(previousPosition, currentPosition, radius = 0.2) {
        return getRocketImpactFn.call(this, previousPosition, currentPosition, radius);
    }

    getRocketGroundImpact(previousPosition, currentPosition, groundY = 0.02) {
        return getRocketGroundImpactFn.call(this, previousPosition, currentPosition, groundY);
    }

    removeRocket(rocket) {
        return removeRocketFn.call(this, rocket);
    }

    applyRocketExplosionDamage(position, weapon, scoreCallback) {
        return applyRocketExplosionDamageFn.call(this, position, weapon, scoreCallback);
    }

    createRocketExplosionEffect(position, weapon, impactNormal = null) {
        return createRocketExplosionEffectFn.call(this, position, weapon, impactNormal);
    }

    explodeRocket(position, weapon, scoreCallback, impactNormal = null) {
        return explodeRocketFn.call(this, position, weapon, scoreCallback, impactNormal);
    }

    updateRocketEffects(delta) {
        return updateRocketEffectsFn.call(this, delta);
    }

    // #region Balanceo al caminar WeaponSystem
    // Descripción: Reproduce una animación fija de balanceo mientras el
    // jugador camina, sin variar su recorrido según la velocidad.
    sampleWeaponWalkSway(progress) {
        const keyframes = this.weaponWalkSwayKeyframes;
        if (!keyframes?.length) return;

        const framePosition = progress * keyframes.length;
        const currentIndex = Math.floor(framePosition) % keyframes.length;
        const nextIndex = (currentIndex + 1) % keyframes.length;
        const interpolation = framePosition - Math.floor(framePosition);
        const currentFrame = keyframes[currentIndex];
        const nextFrame = keyframes[nextIndex];

        this.weaponSwayTargetOffset
            .copy(currentFrame.offset)
            .lerp(nextFrame.offset, interpolation);
        this.weaponSwayTargetRotation
            .copy(currentFrame.rotation)
            .lerp(nextFrame.rotation, interpolation);
    }

    updateWeaponSway(delta) {
        if (!this.weaponSwayGroup) return;

        const frameDelta = Math.min(
            0.05,
            Math.max(0, Number(delta) || 0)
        );
        const velocity = this.player?.velocity;
        const horizontalSpeed = velocity
            ? Math.hypot(velocity.x, velocity.z)
            : 0;
        const hasMovementInput = Boolean(
            this.player?.direction?.lengthSq() > 0.0001
        );
        const isWalking = Boolean(
            this.player?.controls?.isLocked
            && this.player?.canJump
            && hasMovementInput
            && horizontalSpeed > 0.05
        );
        const targetBlend = isWalking ? 1 : 0;

        // La respuesta exponencial mantiene el efecto suave aunque cambie
        // la tasa de frames, y permite que el arma vuelva a su centro al
        // dejar de caminar.
        const blendSmoothing = 1 - Math.exp(-7 * frameDelta);
        this.weaponSwayBlend += (
            targetBlend - this.weaponSwayBlend
        ) * blendSmoothing;

        if (isWalking) {
            if (!this.weaponWalkSwayActive) {
                this.weaponWalkCycle = 0;
            }
            this.weaponWalkSwayActive = true;
            this.weaponWalkCycle = (
                this.weaponWalkCycle + frameDelta * this.weaponWalkCycleRate
            ) % 1;
            this.sampleWeaponWalkSway(this.weaponWalkCycle);
        } else {
            this.weaponWalkSwayActive = false;
            this.weaponWalkCycle = 0;
            this.weaponSwayTargetOffset.set(0, 0, 0);
            this.weaponSwayTargetRotation.set(0, 0, 0);
        }

        const movementSmoothing = 1 - Math.exp(-7 * frameDelta);
        this.weaponSwayOffset.lerp(
            this.weaponSwayTargetOffset,
            movementSmoothing
        );
        this.weaponSwayRotation.lerp(
            this.weaponSwayTargetRotation,
            movementSmoothing
        );

        this.weaponSwayGroup.position.copy(this.weaponSwayOffset);
        this.weaponSwayGroup.rotation.set(
            this.weaponSwayRotation.x,
            this.weaponSwayRotation.y,
            this.weaponSwayRotation.z
        );
    }
    // #endregion

    update(delta, scoreCallback = null) {
        const now = performance.now();

        this.updateWeaponSway(delta);

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
        if (typeof document !== 'undefined') {
            document.body?.classList?.remove('build-mode-active');
        }
        if (this.weaponFlashTimeout !== null) {
            clearTimeout(this.weaponFlashTimeout);
            this.weaponFlashTimeout = null;
        }

        if (this.weaponMesh) {
            if (this.weaponMesh.parent) {
                this.weaponMesh.parent.remove(this.weaponMesh);
            }
            this.weaponMesh.geometry = null; //
            this.weaponMesh.material = null;
        }

        if (this.flashMesh) {
            if (this.flashMesh.parent) {
                this.flashMesh.parent.remove(this.flashMesh);
            }
            this.flashMesh.material?.dispose();
            this.flashMesh = null;
        }

        if (this.weaponSwayGroup) {
            this.camera.remove(this.weaponSwayGroup);
            this.weaponSwayGroup = null;
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
