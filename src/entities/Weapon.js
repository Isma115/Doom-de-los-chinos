/*sección [CONSTRUCTOR Y ESTADO] Inicialización del sistema de armas*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { WEAPONS_DATA } from '../Constants.js'; //
import { UIManager } from '../UI.js';
export class WeaponSystem { //
    constructor(camera, enemyManager, audioManager, player) {
        this.camera = camera;
        this.enemyManager = enemyManager;
        this.audioManager = audioManager;
        this.player = player;
        this.currentIndex = 0;
        this.lastShotTime = 0;
        this.weaponMesh = null;

        this.raycaster = new THREE.Raycaster();
        this.rayOrigin = new THREE.Vector2(0, 0);

        this.debugState = {
            infiniteAmmo: false
        };

        this.weaponMaterials = [];
        WEAPONS_DATA.forEach(weapon => {
            this.weaponMaterials.push(
                new THREE.MeshBasicMaterial({ color: weapon.color })
            );
        });
        this.updateVisuals();
    }
    getCurrentWeapon() {
        return WEAPONS_DATA[this.currentIndex];
    } //



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
    /*[Fin de sección]*/

    /*sección [GESTIÓN DE MUNICIÓN] Añadir munición y cambio de arma*/
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
        } else { //
            this.currentIndex = (this.currentIndex - 1 + WEAPONS_DATA.length) % WEAPONS_DATA.length;
        } //
        this.updateVisuals();
    }

    /*[Fin de sección]*/

    /*sección [VISUALES DEL ARMA] Actualización de sprites y texturas del arma equipada*/
    updateVisuals() {
        if (this.weaponMesh) {
            this.camera.remove(this.weaponMesh);
            if (this.weaponMesh.material.map) this.weaponMesh.material.map.dispose();
            this.weaponMesh.material.dispose();
        }

        const loader = new THREE.TextureLoader();
        const weapon = this.getCurrentWeapon();

        this.weaponTexture = loader.load(
            'assets/weapons/' + weapon.sprite,
            () => { },
            () => { },
            () => { console.error("No se pudo cargar el sprite del arma"); }
        );

        this.weaponFlashTexture = loader.load(
            'assets/weapons/' + (weapon.flash || weapon.sprite),
            () => { },
            () => { },
            () => { console.error("No se pudo cargar el sprite de ataque"); }
        );

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
        this.weaponMesh.scale.set(1.4, 1.4, 1);
        this.weaponMesh.position.set(0.5, -0.25, -1.1);


        this.weaponMesh.frustumCulled = false;

        this.camera.add(this.weaponMesh);

        UIManager.updateWeapon(weapon.name, weapon.isMelee ? "∞" : weapon.ammo);
    } //

    /*[Fin de sección]*/

    /*sección [SISTEMA DE DISPARO Y ANIMACIÓN] Lógica de disparo, raycast, retroceso y limpieza*/
    tryShoot(scoreCallback) {
        const now = performance.now();
        const weapon = this.getCurrentWeapon();

        if (now - this.lastShotTime < weapon.delay) return;

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
    }

    performRaycast(weapon, scoreCallback) {
        this.raycaster.setFromCamera(this.rayOrigin, this.camera);

        // Aplicar rango limitado para armas melee
        if (weapon.isMelee && weapon.range) {
            this.raycaster.far = weapon.range;
        } else {
            this.raycaster.far = Infinity; // Armas de fuego sin límite
        }

        const enemyMeshes = this.enemyManager.enemies.filter(e => e.visible);
        const intersects = this.raycaster.intersectObjects(enemyMeshes, false);

        if (intersects.length > 0) {
            const hitObj = intersects[0].object;
            const hitPoint = intersects[0].point;
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
        }
    }

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
            // ARMAS A DISTANCIA: Retroceso tradicional
            this.weaponMesh.position.z += 0.2;
            this.weaponMesh.position.y -= 0.05;

            setTimeout(() => {
                if (this.weaponMesh) {
                    this.weaponMesh.position.z -= 0.2;
                    this.weaponMesh.position.y += 0.05;
                }
            }, 80);
        }
    }

    dispose() {
        if (this.weaponMesh) {
            this.camera.remove(this.weaponMesh);
            this.weaponMesh.geometry = null; //
            this.weaponMesh.material = null;
        }

        this.weaponMaterials.forEach(mat => mat.dispose());
        this.weaponMaterials = [];
    } //
}
/*[Fin de sección]*/