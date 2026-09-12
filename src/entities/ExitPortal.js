import * as THREE from '../../node_modules/three/build/three.module.js';
import { EXIT_PORTAL_CONFIG } from '../Constants.js';

// #region Clase ExitPortal
// Descripción: Portal animado que se materializa al completar todas las rondas.
// El destino se deja preparado en userData para conectar el siguiente nivel.
export class ExitPortal {
    constructor(scene, position, audioManager = null, config = EXIT_PORTAL_CONFIG) {
        this.scene = scene;
        this.audioManager = audioManager;
        this.config = config;
        this.elapsed = 0;
        this.animationTimer = 0;
        this.frame = 0;
        this.disposed = false;

        const textureLoader = new THREE.TextureLoader();
        this.texture = textureLoader.load(
            config.texture,
            () => { },
            undefined,
            () => console.error(`No se pudo cargar la textura del portal: ${config.texture}`)
        );
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.generateMipmaps = false;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.needsUpdate = true;

        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            color: 0xffffff,
            transparent: true,
            depthWrite: false,
            // Descarta los restos de alfa casi transparente del borde del PNG.
            alphaTest: 0.12,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'exit-portal';
        this.mesh.scale.set(config.width, config.height, 1);
        this.mesh.position.set(
            position.x,
            config.height / 2 - (config.groundOffset || 0),
            position.z
        );
        this.mesh.renderOrder = 2;
        this.mesh.userData = {
            type: 'exit_portal',
            active: true,
            destinationMap: config.destinationMap || null,
            activationDistance: config.activationDistance
        };

        this.setFrame(0);
        this.scene.add(this.mesh);

        // Reutiliza el efecto de materialización ya disponible mientras el
        // sonido definitivo del siguiente nivel todavía no está decidido.
        if (this.audioManager) {
            this.audioManager.playSound(
                'enemySpawnTeleport',
                0.55,
                false,
                0.8 + Math.random() * 0.12
            );
        }
    }

    setFrame(frameIndex) {
        const columns = Math.max(1, this.config.columns || 1);
        const rows = Math.max(1, this.config.rows || 1);
        const frameWidth = Math.max(1, this.config.frameWidth || 1);
        const frameHeight = Math.max(1, this.config.frameHeight || 1);
        const frame = Math.max(
            0,
            Math.min(Math.max(1, this.config.frames || 1) - 1, frameIndex)
        );
        const column = Math.min(columns - 1, frame);
        const row = 0;
        const textureWidth = columns * frameWidth;
        const textureHeight = rows * frameHeight;
        const halfPixelX = 0.5 / textureWidth;
        const halfPixelY = 0.5 / textureHeight;
        const uv = this.geometry.attributes.uv;

        const u0 = column * frameWidth / textureWidth + halfPixelX;
        const u1 = (column + 1) * frameWidth / textureWidth - halfPixelX;
        const v0 = 1 - (row + 1) * frameHeight / textureHeight + halfPixelY;
        const v1 = 1 - row * frameHeight / textureHeight - halfPixelY;

        // PlaneGeometry: arriba-izquierda, arriba-derecha, abajo-izquierda,
        // abajo-derecha. El margen de medio píxel evita sangrado entre frames.
        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        uv.needsUpdate = true;
        this.frame = frame;
    }

    update(delta, cameraPosition = null) {
        if (this.disposed || !this.mesh.userData.active) return;

        const safeDelta = Math.max(0, Number(delta) || 0);
        this.elapsed += safeDelta;
        this.animationTimer += safeDelta;

        const frameDuration = 1 / Math.max(1, this.config.fps || 10);
        while (this.animationTimer >= frameDuration) {
            this.animationTimer -= frameDuration;
            this.setFrame((this.frame + 1) % Math.max(1, this.config.frames || 1));
        }

        const pulse = 1 + Math.sin(this.elapsed * 5.4) * 0.018;
        this.mesh.scale.set(this.config.width * pulse, this.config.height * pulse, 1);

        if (cameraPosition) {
            const deltaX = cameraPosition.x - this.mesh.position.x;
            const deltaZ = cameraPosition.z - this.mesh.position.z;
            if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaZ) > 0.0001) {
                this.mesh.lookAt(
                    cameraPosition.x,
                    this.mesh.position.y,
                    cameraPosition.z
                );
            }
        }
    }

    isPlayerNear(playerPosition) {
        if (!playerPosition || this.disposed || !this.mesh.userData.active) return false;

        const dx = playerPosition.x - this.mesh.position.x;
        const dz = playerPosition.z - this.mesh.position.z;
        const distance = Math.hypot(dx, dz);
        return distance <= (this.config.activationDistance || 4.5);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.mesh.userData.active = false;
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
    }
}
// #endregion
