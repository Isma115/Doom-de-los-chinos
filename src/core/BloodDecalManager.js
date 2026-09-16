// #region Importaciones BloodDecalManager
// Descripción: Importa Three.js para crear decals de sangre persistentes en el escenario.
import * as THREE from 'three';
import { isMobileMode } from '../mobile/isMobile.js';
// #endregion

// #region Clase BloodDecalManager
// Descripción: Gestiona los decals de sangre permanentes en suelos y paredes cuando los enemigos reciben daño.
export class BloodDecalManager {
    // #region Constructor BloodDecalManager
    // Descripción: Inicializa el sistema de decals, carga texturas y configura parámetros.
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.decals = [];
        this.maxDecals = 2880; // Cuatro veces el límite anterior de manchas persistentes
        // En móvil se desactivan las manchas del suelo: ahorra texturas,
        // raycasts y planos persistentes (draw calls). Paredes intactas.
        this.floorBloodEnabled = !isMobileMode();

        // Cargar texturas de charcos de sangre
        const textureLoader = new THREE.TextureLoader();
        this.bloodTextures = [
            textureLoader.load('assets/textures/blood_puddle_1.png'),
            textureLoader.load('assets/textures/blood_splash.png'),
            textureLoader.load('assets/textures/blood_splash2.png'),
            textureLoader.load('assets/textures/blood_splash3.png'),
            textureLoader.load('assets/textures/blood_splash4.png'),
            textureLoader.load('assets/textures/blood_droplets.png'),
            textureLoader.load('assets/textures/blood_streak.png')
        ];
        this.bloodTextures.forEach(texture => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
        });

        // Las manchas del suelo usan copias de 64 px para mantener un coste
        // bajo sin que se vean excesivamente pixeladas. Las salpicaduras de
        // pared conservan las texturas originales.
        // En móvil no se cargan: los decals de suelo están desactivados.
        if (this.floorBloodEnabled) {
            this.floorBloodTextures = [
                textureLoader.load('assets/textures/blood_floor_lowres/blood_puddle_1.png'),
                textureLoader.load('assets/textures/blood_floor_lowres/blood_splash.png'),
                textureLoader.load('assets/textures/blood_floor_lowres/blood_splash2.png'),
                textureLoader.load('assets/textures/blood_floor_lowres/blood_splash3.png'),
                textureLoader.load('assets/textures/blood_floor_lowres/blood_splash4.png'),
                textureLoader.load('assets/textures/blood_floor_lowres/blood_droplets.png'),
                textureLoader.load('assets/textures/blood_floor_lowres/blood_streak.png')
            ];
            this.floorBloodTextures.forEach(texture => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;
                texture.needsUpdate = true;
            });
        } else {
            this.floorBloodTextures = [];
        }

        // El alien utiliza una salpicadura propia de sangre blanca.
        this.whiteBloodTexture = textureLoader.load('assets/textures/white_blood_splash.png');
        this.whiteBloodTexture.colorSpace = THREE.SRGBColorSpace;
        this.whiteBloodTexture.needsUpdate = true;

        this.floorWhiteBloodTexture = null;
        if (this.floorBloodEnabled) {
            this.floorWhiteBloodTexture = textureLoader.load(
                'assets/textures/blood_floor_lowres/white_blood_splash.png'
            );
            this.floorWhiteBloodTexture.colorSpace = THREE.SRGBColorSpace;
            this.floorWhiteBloodTexture.minFilter = THREE.LinearFilter;
            this.floorWhiteBloodTexture.magFilter = THREE.LinearFilter;
            this.floorWhiteBloodTexture.generateMipmaps = false;
            this.floorWhiteBloodTexture.needsUpdate = true;
        }

        // Raycaster para detectar superficies
        this.raycaster = new THREE.Raycaster();
    }
    // #endregion

    // #region Sistema de Spawning BloodDecalManager
    // Descripción: Crea múltiples decals aleatorios alrededor del punto de impacto.
    spawnBloodSplatter(hitPosition, hitNormal, bloodType = 'red') {
        // Cada impacto deja pocas manchas grandes en el suelo. Reducir el
        // número de planos evita dibujar decenas de decals por enemigo.
        const floorDecalCount = 2 + Math.floor(Math.random() * 2);

        for (let i = 0; i < floorDecalCount; i++) {
            const randomOffset = new THREE.Vector3(
                (Math.random() - 0.5) * 5.0, // Mayor dispersión horizontal
                0,
                (Math.random() - 0.5) * 5.0
            );

            const decalPosition = hitPosition.clone().add(randomOffset);

            this.createFloorDecal(decalPosition, bloodType);
        }

        // Mantener la variedad de salpicaduras de pared sin hacer que su
        // cantidad determine cuántas manchas se dibujan en el suelo.
        const wallDecalCount = 6 + Math.floor(Math.random() * 5);
        for (let i = 0; i < wallDecalCount; i++) {
            const randomOffset = new THREE.Vector3(
                (Math.random() - 0.5) * 5.0,
                0,
                (Math.random() - 0.5) * 5.0
            );

            const decalPosition = hitPosition.clone().add(randomOffset);
            if (Math.random() > 0.5) {
                this.createWallDecal(decalPosition, bloodType);
            }
        }
    }
    // #endregion

    // #region Sistema de Explosión de Sangre BloodDecalManager
    // Descripción: Genera una explosión masiva de sangre al morir un enemigo.
    spawnBloodExplosion(position, bloodType = 'red') {
        // La muerte deja una huella amplia con pocas manchas grandes.
        const centralDecalCount = 1 + Math.floor(Math.random() * 2);
        const floorDecalCount = 2 + Math.floor(Math.random() * 2);

        // Crear decals centrales (grandes)
        for (let i = 0; i < centralDecalCount; i++) {
            const randomOffset = new THREE.Vector3(
                (Math.random() - 0.5) * 2.0,
                0,
                (Math.random() - 0.5) * 2.0
            );
            this.createFloorDecal(position.clone().add(randomOffset), bloodType);
        }

        // Crear pocas manchas de suelo dispersas (explosión)
        for (let i = 0; i < floorDecalCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 1.0 + Math.random() * 9.0;

            const offset = new THREE.Vector3(
                Math.cos(angle) * distance,
                0,
                Math.sin(angle) * distance
            );

            const decalPos = position.clone().add(offset);

            this.createFloorDecal(decalPos, bloodType);
        }

        // Las paredes conservan algunas salpicaduras, sin llenar la escena.
        const wallDecalCount = 6 + Math.floor(Math.random() * 4);
        for (let i = 0; i < wallDecalCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 1.0 + Math.random() * 9.0;
            const decalPos = position.clone().add(new THREE.Vector3(
                Math.cos(angle) * distance,
                0,
                Math.sin(angle) * distance
            ));

            if (Math.random() > 0.35) { // 65% probabilidad
                this.createWallDecal(decalPos, bloodType);
            }
        }
    }
    // #endregion

    // #region Creación de Decals en Suelo BloodDecalManager
    // Descripción: Crea un charco de sangre en el suelo cerca del punto especificado.
    createFloorDecal(position, bloodType = 'red') {
        // En móvil los decals de suelo están desactivados (rendimiento).
        if (!this.floorBloodEnabled) return null;
        // Raycast hacia abajo para encontrar el suelo - desde MÁS ALTO
        const downDirection = new THREE.Vector3(0, -1, 0);
        // Comenzar desde 10 unidades arriba para asegurar que detecte el suelo
        this.raycaster.set(position.clone().add(new THREE.Vector3(0, 10, 0)), downDirection);
        this.raycaster.far = 20; // Rango de 20 unidades hacia abajo

        // Obtener objetos sólidos del mundo
        const solidObjects = this.getSolidObjects();
        const intersects = this.raycaster.intersectObjects(solidObjects, false);

        let floorPoint, floorNormal;

        if (intersects.length > 0) {
            // Encontró el suelo con raycast
            floorPoint = intersects[0].point;
            floorNormal = intersects[0].face.normal.clone();
            floorNormal.transformDirection(intersects[0].object.matrixWorld);
            floorNormal.normalize();

            // Algunos planos de suelo del Parque (como el camino de piedras)
            // están orientados con la cara normal hacia abajo. El raycast los
            // detecta igualmente, pero el offset acabaría colocando la mancha
            // debajo del plano. Los decals del suelo siempre deben levantarse
            // sobre la cara visible.
            if (floorNormal.y < 0) {
                floorNormal.negate();
            }
        } else {
            // Si no encuentra con raycast, crear en Y=0.05 (suelo por defecto)
            floorPoint = position.clone();
            floorPoint.y = 0.05;
            floorNormal = new THREE.Vector3(0, 1, 0); // Normal apuntando arriba
        }

        // Seleccionar textura aleatoria
        const bloodTextures = this.getFloorBloodTextures(bloodType);
        const texture = bloodTextures[Math.floor(Math.random() * bloodTextures.length)];

        // SIEMPRE crear el decal (incluso si el raycast falló, usamos Y=0.05)
        this.createDecal(floorPoint, floorNormal, texture, 'floor');
    }
    // #endregion

    // #region Creación de Decals en Paredes BloodDecalManager
    // Descripción: Crea salpicaduras de sangre en paredes cercanas al punto de impacto.
    createWallDecal(position, bloodType = 'red') {
        // Intentar en 4 direcciones cardinales
        const directions = [
            new THREE.Vector3(1, 0, 0),   // Este
            new THREE.Vector3(-1, 0, 0),  // Oeste
            new THREE.Vector3(0, 0, 1),   // Norte
            new THREE.Vector3(0, 0, -1)   // Sur
        ];

        const randomDir = directions[Math.floor(Math.random() * directions.length)];
        this.raycaster.set(position, randomDir);
        this.raycaster.far = 3.0; // Solo paredes cercanas (3 unidades máximo)

        const solidObjects = this.getSolidObjects();
        const intersects = this.raycaster.intersectObjects(solidObjects, false);

        if (intersects.length > 0) {
            const wallPoint = intersects[0].point;
            const wallNormal = intersects[0].face.normal.clone();
            wallNormal.transformDirection(intersects[0].object.matrixWorld);

            // Usar texturas de splash para paredes; la sangre blanca solo tiene una textura.
            const splashTextures = bloodType === 'white'
                ? [this.whiteBloodTexture]
                : this.bloodTextures.slice(1); // Excluir blood_puddle_1
            const texture = splashTextures[Math.floor(Math.random() * splashTextures.length)];

            this.createDecal(wallPoint, wallNormal, texture, 'wall');
        }
    }
    // #endregion

    // #region Creación de Decal Individual BloodDecalManager
    // Descripción: Crea un mesh de plano con textura de sangre orientado según la superficie.
    createDecal(position, normal, texture, type) {
        // Menos decals, pero con una silueta mucho más grande y legible.
        const baseSize = type === 'floor'
            ? (0.35 + Math.random() * 0.75) * 5.5
            : (0.65 + Math.random() * 0.75) * 1.8;
        const width = baseSize * (0.65 + Math.random() * 0.6);
        const height = baseSize * (0.65 + Math.random() * 0.6);

        // Crear geometría de plano
        const geometry = new THREE.PlaneGeometry(width, height);

        // Material con la textura de sangre
        const isFloorDecal = type === 'floor';
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.8 + Math.random() * 0.2, // Opacidad variable
            side: THREE.DoubleSide,
            depthWrite: false, // Evitar problemas de z-fighting
            depthTest: true,
            alphaTest: 0.02,
            // El camino de piedras aplica su propio polygonOffset; usar uno
            // suave aquí evita el z-fighting sin convertir el decal en una
            // capa que se dibuje por encima de otros objetos.
            polygonOffset: isFloorDecal,
            polygonOffsetFactor: isFloorDecal ? -1 : 0,
            polygonOffsetUnits: isFloorDecal ? -1 : 0,
            blending: THREE.NormalBlending
        });

        const decalMesh = new THREE.Mesh(geometry, material);

        // Posicionar ligeramente por encima de la superficie para evitar z-fighting
        const offset = normal.clone().multiplyScalar(isFloorDecal ? 0.05 : 0.01);
        decalMesh.position.copy(position).add(offset);

        // Orientar el decal según la normal de la superficie
        if (type === 'floor') {
            // Para suelos, rotar para que quede horizontal
            decalMesh.lookAt(position.clone().add(normal));
            decalMesh.rotateZ(Math.random() * Math.PI * 2); // Rotación aleatoria
        } else {
            // Para paredes, orientar perpendicular a la normal
            decalMesh.lookAt(position.clone().add(normal));
            decalMesh.rotateZ(Math.random() * Math.PI * 2);
        }

        // Añadir a la escena
        this.scene.add(decalMesh);

        // Guardar en el array de decals
        this.decals.push({
            mesh: decalMesh,
            creationTime: performance.now()
        });

        // Programar desvanecimiento después de 5 segundos
        setTimeout(() => {
            this.fadeOutDecal(decalMesh);
        }, 30000);

        // Limpieza si excedemos el límite
        if (this.decals.length > this.maxDecals) {
            this.removeOldestDecal();
        }
    }
    // #endregion

    // #region Helpers BloodDecalManager
    getBloodTextures(bloodType = 'red') {
        return bloodType === 'white' ? [this.whiteBloodTexture] : this.bloodTextures;
    }

    getFloorBloodTextures(bloodType = 'red') {
        return bloodType === 'white'
            ? [this.floorWhiteBloodTexture]
            : this.floorBloodTextures;
    }

    // Descripción: Métodos auxiliares para obtener objetos sólidos del mundo.
    getSolidObjects() {
        const objects = [];

        // Añadir muros del mundo
        if (this.world && this.world.wallMeshes) {
            objects.push(...this.world.wallMeshes);
        }

        // Alternativa: usar getWalls()
        if (this.world && this.world.getWalls) {
            const walls = this.world.getWalls();
            objects.push(...walls);
        }

        // Añadir el suelo. En Parque es una única malla; en los mapas
        // antiguos sigue siendo un Group con sus tiles hijos.
        const floor = this.world?.getFloorGroup?.() || this.world?.floorGroup;
        if (floor) {
            if (floor.children && floor.children.length > 0) {
                objects.push(...floor.children);
            } else if (floor.isMesh) {
                objects.push(floor);
            }
        }

        // Añadir objetos decorativos (squares) para efectos de sangre
        if (this.world && this.world.getDecorativeMeshes) {
            const decoratives = this.world.getDecorativeMeshes();
            objects.push(...decoratives);
        }

        return objects;
    }
    // #endregion

    // #region Limpieza de Decals BloodDecalManager
    // Descripción: Sistema de desvanecimiento y limpieza de decals.

    // Desvanecer un decal gradualmente
    fadeOutDecal(decalMesh) {
        if (!decalMesh || !decalMesh.parent) return; // Ya fue eliminado

        const fadeOutAnimation = () => {
            if (!decalMesh.parent) return; // Verificar que aún está en la escena

            decalMesh.material.opacity -= 0.02; // Desvanecimiento gradual

            if (decalMesh.material.opacity <= 0) {
                // Eliminar completamente cuando sea invisible
                this.scene.remove(decalMesh);
                decalMesh.geometry.dispose();
                decalMesh.material.dispose();

                // Eliminar del array
                const index = this.decals.findIndex(d => d.mesh === decalMesh);
                if (index !== -1) {
                    this.decals.splice(index, 1);
                }
            } else {
                requestAnimationFrame(fadeOutAnimation);
            }
        };

        fadeOutAnimation();
    }

    // Eliminar el decal más antiguo solo si ha existido por al menos 5 segundos
    removeOldestDecalIfExpired() {
        if (this.decals.length === 0) return;

        const now = performance.now();
        const minLifetime = 5000; // 5 segundos mínimo

        // Buscar el decal más antiguo que haya existido al menos 5 segundos
        for (let i = 0; i < this.decals.length; i++) {
            const decal = this.decals[i];
            const age = now - decal.creationTime;

            if (age >= minLifetime) {
                // Encontró un decal antiguo, eliminarlo
                this.scene.remove(decal.mesh);
                decal.mesh.geometry.dispose();
                decal.mesh.material.dispose();
                this.decals.splice(i, 1);
                return; // Solo eliminar uno
            }
        }
        // Si no hay decals antiguos, no eliminar nada
    }

    removeOldestDecal() {
        if (this.decals.length > 0) {
            const oldestDecal = this.decals.shift();
            this.scene.remove(oldestDecal.mesh);
            oldestDecal.mesh.geometry.dispose();
            oldestDecal.mesh.material.dispose();
        }
    }

    // Actualización por frame (opcional, para futuras mejoras)
    update(delta) {
        // Aquí se podría añadir lógica para desvanecer decals antiguos gradualmente
        // Por ahora dejamos los decals permanentes hasta alcanzar el límite
    }

    // Limpieza de todos los recursos
    dispose() {
        // Eliminar todos los decals
        this.decals.forEach(decal => {
            this.scene.remove(decal.mesh);
            decal.mesh.geometry.dispose();
            decal.mesh.material.dispose();
        });
        this.decals = [];

        // Limpiar texturas
        this.bloodTextures.forEach(texture => {
            texture.dispose();
        });
        this.floorBloodTextures.forEach(texture => {
            texture.dispose();
        });
        if (this.whiteBloodTexture) {
            this.whiteBloodTexture.dispose();
        }
        if (this.floorWhiteBloodTexture) {
            this.floorWhiteBloodTexture.dispose();
        }
    }
    // #endregion
}
// #endregion
