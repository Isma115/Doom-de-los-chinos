/*sección [ARMAS] Gestión de armas del juego*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { WEAPONS_DATA } from '../Constants.js';
import { UIManager } from '../UI.js';

export class WeaponSystem {
    constructor(camera, enemyManager) {
        this.camera = camera;
        this.enemyManager = enemyManager;
        this.currentIndex = 0;
        this.lastShotTime = 0;
        this.weaponMesh = null;
        
        this.raycaster = new THREE.Raycaster();
        this.rayOrigin = new THREE.Vector2(0, 0);
        
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
    }

    switchWeapon(direction) {
        if (direction > 0) {
            this.currentIndex = (this.currentIndex + 1) % WEAPONS_DATA.length;
        } else {
            this.currentIndex = (this.currentIndex - 1 + WEAPONS_DATA.length) % WEAPONS_DATA.length;
        }
        this.updateVisuals();
    }

    updateVisuals() {
        if (this.weaponMesh) {
            this.camera.remove(this.weaponMesh);
            this.weaponMesh.geometry = null;
            this.weaponMesh.material = null;
        }
        
        const data = this.getCurrentWeapon();
        const material = this.weaponMaterials[this.currentIndex];
        
        this.weaponMesh = new THREE.Mesh(data.geo, material);
        this.weaponMesh.position.set(0.5, -0.5, -1);
        this.weaponMesh.matrixAutoUpdate = true;
        this.camera.add(this.weaponMesh);
        
        UIManager.updateWeapon(data.name, data.ammo);
    }

    tryShoot(scoreCallback) {
        const now = performance.now();
        const weapon = this.getCurrentWeapon();

        if (now - this.lastShotTime < weapon.delay) return;
        
        if (typeof weapon.ammo === 'number') {
            if (weapon.ammo <= 0) return;
            weapon.ammo--;
            UIManager.updateAmmo(weapon.ammo);
        }

        this.lastShotTime = now;
        this.performRaycast(weapon, scoreCallback);
        this.animateRecoil();
    }

performRaycast(weapon, scoreCallback) {
    this.raycaster.setFromCamera(this.rayOrigin, this.camera);

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
        this.weaponMesh.position.z += 0.2;
        setTimeout(() => { 
            if (this.weaponMesh) {
                this.weaponMesh.position.z -= 0.2; 
            }
        }, 50);
    }

    dispose() {
        if (this.weaponMesh) {
            this.camera.remove(this.weaponMesh);
            this.weaponMesh.geometry = null;
            this.weaponMesh.material = null;
        }
        
        this.weaponMaterials.forEach(mat => mat.dispose());
        this.weaponMaterials = [];
    }
}
/*[Fin de sección]*/