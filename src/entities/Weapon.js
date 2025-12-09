/*sección [CONSTRUCTOR Y ESTADO] Inicialización del sistema de armas*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { WEAPONS_DATA } from '../Constants.js'; //
import { UIManager } from '../UI.js';
export class WeaponSystem { //

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

    this.debugState = {
        infiniteAmmo: false
    };

    this.weaponMaterials = [];
    WEAPONS_DATA.forEach(weapon => {
        this.weaponMaterials.push(
            new THREE.MeshBasicMaterial({ color: weapon.color })
        );
    });

    // ──────────────────────────────────────────────────────────────
    // NUEVA ESTRUCTURA: cargar las dos texturas de impacto en muros
    // ──────────────────────────────────────────────────────────────
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

    // Si por alguna razón alguna textura falla, siempre tendremos al menos una
    if (this.impactTextures.length === 0) {
        // fallback: crear una textura en blanco (evita errores)
        this.impactTextures.push(new THREE.Texture());
    }

    this.updateVisuals();
}
    getCurrentWeapon() {
        return WEAPONS_DATA[this.currentIndex];
    } //



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
    
    // Obtener todos los objetos sólidos (muros, puertas cerradas, etc.)
    const solidObjects = this.getSolidObjects();
    
    // Combinar enemigos y objetos sólidos para la detección de colisiones
    const allObjects = enemyMeshes.concat(solidObjects);
    
    const intersects = this.raycaster.intersectObjects(allObjects, false);

    if (intersects.length > 0) {
        const hitObj = intersects[0].object;
        const hitPoint = intersects[0].point;
        
        // Verificar si el objeto impactado es un enemigo
        if (hitObj.userData && hitObj.userData.hp !== undefined) {
            // Es un enemigo - aplicar daño
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
            // Es un objeto sólido (muro, puerta cerrada, etc.)
            // El disparo se detiene aquí, no atraviesa
            if (this.audioManager) {
                this.audioManager.playSound('enemyHit', 0.3); // Sonido de impacto en pared
            }
            
            // Crear efecto visual de impacto en la pared
            // Obtener la normal de la superficie para colocar el sprite correctamente
            if (intersects[0].face) {
                const hitNormal = intersects[0].face.normal.clone();
                hitNormal.transformDirection(hitObj.matrixWorld);
                this.createWallImpactEffect(hitPoint, hitNormal);
            } else {
                // Si no hay normal (no debería pasar), usamos un vector por defecto (por ejemplo, hacia la cámara)
                const hitNormal = new THREE.Vector3().subVectors(hitPoint, this.camera.position).normalize();
                this.createWallImpactEffect(hitPoint, hitNormal);
            }
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