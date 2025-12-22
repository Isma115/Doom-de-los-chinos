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
        this.weaponMesh = null;

        this.raycaster = new THREE.Raycaster();
        this.rayOrigin = new THREE.Vector2(0, 0);

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

        this.impactTextures = [];
        const textureLoader = new THREE.TextureLoader();
        const paths = ['assets/textures/bullet_wall.png', 'assets/textures/bullet_wall2.png'];
        paths.forEach(path => {
            textureLoader.load(path,
                (texture) => {
                    this.impactTextures.push(texture);
                },
                undefined,
                (err) => {
                    console.error('No se pudo cargar la textura de impacto en muros', path, err);
                }
            );
        });

        if (this.impactTextures.length === 0) {
            this.impactTextures.push(new THREE.Texture());
        }

        this.updateVisuals();
    }
// #endregion

    // #region Helpers WeaponSystem
    // Descripción: Métodos de utilidad para obtener el arma actual y los objetos sólidos del entorno.
    getCurrentWeapon() {
        return WEAPONS_DATA[this.currentIndex];
    }

    getSolidObjects() {
        const solidObjects = [];

        // Obtener muros del mundo
        if (this.player && this.player.world && this.player.world.getWalls) {
            const walls = this.player.world.getWalls();
            solidObjects.push(...walls);
        }

        // Obtener puertas cerradas
        if (window.Door && Door.instances) {
            Door.instances.forEach(door => {
                if (!door.isOpen && door.mesh) {
                    solidObjects.push(door.mesh);
                }
            });
        }

        // Obtener modelos estáticos 3D que sean sólidos
        if (this.player && this.player.world && this.player.world.getStaticModels) {
            const staticModels = this.player.world.getStaticModels();
            solidObjects.push(...staticModels);
        }

        return solidObjects;
    }
    // #endregion

    // #region Efectos Visuales WeaponSystem
// Descripción: Creación de efectos de impacto en muros y fogonazos de las armas.
    createWallImpactEffect(hitPoint, hitNormal) {
        // ──────────────────────────────────────────────────────────────
        // NUEVA ESTRUCTURA: elegir una textura aleatoria del array
        // ──────────────────────────────────────────────────────────────
        if (this.impactTextures.length === 0) {
            return; // nada que pintar si no hay texturas cargadas
        }

        const texture = this.impactTextures[Math.floor(Math.random() * this.impactTextures.length)];

        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        const offset = 0.05;
        const adjustedPosition = hitPoint.clone();
        adjustedPosition.add(hitNormal.clone().multiplyScalar(offset));
        mesh.position.copy(adjustedPosition);

        mesh.lookAt(adjustedPosition.clone().add(hitNormal.clone().negate()));

        mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2);

        const baseSize = 0.4;
        const randomSize = 0.2 + Math.random() * 0.4;
        const finalSize = baseSize + randomSize;
        mesh.scale.set(finalSize, finalSize, finalSize);

        this.scene.add(mesh);

        const fadeOut = () => {
            if (mesh.parent) {
                mesh.material.opacity -= 0.05;
                if (mesh.material.opacity <= 0) {
                    mesh.parent.remove(mesh);
                    if (mesh.material.map) mesh.material.map.dispose();
                    mesh.material.dispose();
                    mesh.geometry.dispose();
                } else {
                    requestAnimationFrame(fadeOut);
                }
            }
        };

        setTimeout(fadeOut, 300);
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

    tryShoot(onKillCallback) {
        const currentWeapon = this.getCurrentWeapon();
        const now = performance.now();

        // Aplicar multiplicador de cadencia correctamente
        // fireRateMultiplier > 1.0 → mayor cadencia (delay más corto)
        // fireRateMultiplier < 1.0 → menor cadencia (delay más largo)
        const fireRateMultiplier = this.debugState.fireRateMultiplier || 1.0;
        const effectiveDelay = currentWeapon.delay / fireRateMultiplier;

        if (now - this.lastShotTime < effectiveDelay) {
            return false;
        }

        // Sin munición (excepto melee o infinite ammo)
        if (!currentWeapon.isMelee && !this.debugState.infiniteAmmo && currentWeapon.ammo <= 0) {
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
            return false;
        }

        // Disparo válido
        this.lastShotTime = now;
        this.showMuzzleFlash();
        this.audioManager.playSound(currentWeapon.shootSound, 0.8);

        // Raycast y lógica de impacto
        this.raycaster.setFromCamera(this.rayOrigin, this.camera);

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        let hitEnemy = null;
        let hitPoint = null;
        let hitNormal = new THREE.Vector3(0, 0, 1);

        for (const intersect of intersects) {
            if (this.enemyManager.enemies.includes(intersect.object)) {
                hitEnemy = intersect.object;
                hitPoint = intersect.point;
                hitNormal = intersect.face.normal;
                break;
            } else if (intersect.object.geometry && intersect.object.geometry.type.includes('Box')) {
                hitPoint = intersect.point;
                hitNormal = intersect.face.normal;
                break;
            }
        }

        if (hitEnemy) {
            hitEnemy.userData.hp -= currentWeapon.damage;
            if (hitEnemy.userData.hp <= 0) {
                this.enemyManager.removeEnemy(hitEnemy);
                if (onKillCallback) onKillCallback();
            } else {
                hitEnemy.userData.drawBlood(hitPoint);
            }

            if (this.debugState.bulletLog) {
                console.log(`Impacto en enemigo: ${currentWeapon.damage} daño`);
            }
        } else if (hitPoint) {
            this.createWallImpactEffect(hitPoint, hitNormal);

            if (this.debugState.bulletLog) {
                console.log(`Impacto en pared en ${hitPoint.x.toFixed(1)}, ${hitPoint.y.toFixed(1)}, ${hitPoint.z.toFixed(1)}`);
            }
        }

        // Gastar munición
        if (!currentWeapon.isMelee && !this.debugState.infiniteAmmo) {
            currentWeapon.ammo--;
            UIManager.updateWeapon(currentWeapon.name, currentWeapon.ammo);
        }

        return true;
    }
// #endregion

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
        this.raycaster.setFromCamera(this.rayOrigin, this.camera);

        if (weapon.isMelee && weapon.range) {
            this.raycaster.far = weapon.range;
        } else {
            this.raycaster.far = Infinity;
        }

        const enemyMeshes = this.enemyManager.enemies.filter(e => e.visible);

        const solidObjects = this.getSolidObjects();

        const allObjects = enemyMeshes.concat(solidObjects);

        const intersects = this.raycaster.intersectObjects(allObjects, false);

        let lastBulletStopPosition = null;

        if (intersects.length > 0) {
            const hitObj = intersects[0].object;
            const hitPoint = intersects[0].point;
            lastBulletStopPosition = hitPoint.clone();

            if (hitObj.userData && hitObj.userData.hp !== undefined) {
                hitObj.userData.hp -= weapon.damage;

                const impactTime = performance.now();
                hitObj.userData.bloodTime = impactTime;
                if (hitObj.userData.drawBlood) {
                    hitObj.userData.drawBlood(hitPoint);
                }

                hitObj.material.color.setHex(0xff3333);
                setTimeout(() => {
                    if (hitObj.parent && hitObj.userData.hp > 0) {
                        hitObj.material.color.setHex(0xffffff);
                    }
                }, 80);
                if (hitObj.userData.hp <= 0) {
                    this.enemyManager.removeEnemy(hitObj);
                    scoreCallback();
                }
            } else {
                if (this.audioManager) {
                    this.audioManager.playSound('enemyHit', 0.3);
                }

                if (intersects[0].face) {
                    const hitNormal = intersects[0].face.normal.clone();
                    hitNormal.transformDirection(hitObj.matrixWorld);
                    this.createWallImpactEffect(hitPoint, hitNormal);
                } else {
                    const hitNormal = new THREE.Vector3().subVectors(hitPoint, this.camera.position).normalize();
                    this.createWallImpactEffect(hitPoint, hitNormal);
                }
            }
        } else {
            const farPoint = new THREE.Vector3();
            this.raycaster.ray.at(200, farPoint);
            lastBulletStopPosition = farPoint;
        }

        // NUEVA ESTRUCTURA: Verificar bulletLog antes de imprimir el console log

        if (lastBulletStopPosition && this.player && this.player.debugState && this.player.debugState.bulletLog) {
            console.log(`Última bala disparada se detuvo en X: ${lastBulletStopPosition.x.toFixed(2)}, Y: ${lastBulletStopPosition.y.toFixed(2)}, Z: ${lastBulletStopPosition.z.toFixed(2)}`);
        }
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
    }
    // #endregion
}