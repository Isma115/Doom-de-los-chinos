// Habitación secreta del Hormiguero, extraída de World.js (ver nota .call).
import * as THREE from 'three';
import { HORMIGUERO_TEXTURES } from './hormigueroTextures.js';

export function buildHormigueroSecretRoom(model = {}) {
        const root = new THREE.Group();
        root.name = model.id || 'hormiguero-secret-room';

        const position = model.position || {};
        root.position.set(
            Number(position.x) || 0,
            Number(position.y) || 0,
            Number(position.z) || 0
        );
        root.scale.setScalar(Number(model.scale) || 1);

        const width = Math.max(20, Number(model.width) || 40);
        const depth = Math.max(14, Number(model.depth) || 19);
        const height = Math.max(5, Number(model.height) || 8);
        const wallThickness = Math.max(0.5, Number(model.wallThickness) || 0.8);
        const entryWidth = Math.min(width - 2, Math.max(3, Number(model.entryWidth) || 10));
        const entryHeight = Math.min(height - 0.5, Math.max(2.5, Number(model.entryHeight) || 5));
        const exitWidth = Math.min(depth - 2, Math.max(3, Number(model.exitWidth) || 10));
        const exitHeight = Math.min(height - 0.5, Math.max(2.5, Number(model.exitHeight) || 5));
        const entryX = Number.isFinite(Number(model.entryX))
            ? Number(model.entryX)
            : width / 2 - entryWidth / 2 - wallThickness;
        const exitZ = Number.isFinite(Number(model.exitZ))
            ? Number(model.exitZ)
            : 0;

        const wallMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.buildingWall,
            Math.max(2, width / 6),
            Math.max(1, height / 3),
            { roughness: 0.96, metalness: 0 }
        );
        const floorMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.floor,
            Math.max(1, width / 12),
            Math.max(1, depth / 8),
            { roughness: 0.9, metalness: 0.08 }
        );
        const metalMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            2,
            1,
            { roughness: 0.55, metalness: 0.62 }
        );
        const darkMetalMaterial = this.createTexturedStandardMaterial(
            0xffffff,
            HORMIGUERO_TEXTURES.metal,
            1,
            1,
            { roughness: 0.62, metalness: 0.48 }
        );
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: 0xc64b2d,
            emissive: 0x4a0e06,
            emissiveIntensity: 0.75,
            roughness: 0.58,
            metalness: 0.24,
            flatShading: true
        });
        const lightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffb34a,
            emissive: 0xff6a16,
            emissiveIntensity: 1.8,
            roughness: 0.42,
            metalness: 0.12,
            flatShading: true
        });

        const addBox = (name, dimensions, coordinates, material) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(...dimensions),
                material
            );
            mesh.name = name;
            mesh.position.set(...coordinates);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            root.add(mesh);
            return mesh;
        };

        const minX = -width / 2;
        const maxX = width / 2;
        const minZ = -depth / 2;
        const maxZ = depth / 2;
        const entryMinX = Math.max(minX + wallThickness, entryX - entryWidth / 2);
        const entryMaxX = Math.min(maxX - wallThickness, entryX + entryWidth / 2);
        const exitMinZ = Math.max(minZ + wallThickness, exitZ - exitWidth / 2);
        const exitMaxZ = Math.min(maxZ - wallThickness, exitZ + exitWidth / 2);

        // Entrada norte desde el almacén y salida oeste hacia el conducto que
        // continúa hasta el plató.
        addBox('secret-room-floor', [width, 0.16, depth], [0, 0.08, 0], floorMaterial);
        addBox('secret-room-ceiling', [width, 0.5, depth], [0, height + 0.25, 0], metalMaterial);
        addBox('secret-room-wall-south', [width, height, wallThickness], [0, height / 2, minZ], wallMaterial);
        addBox('secret-room-wall-east', [wallThickness, height, depth], [maxX, height / 2, 0], wallMaterial);
        addBox(
            'secret-room-wall-north-left',
            [entryMinX - minX, height, wallThickness],
            [(minX + entryMinX) / 2, height / 2, maxZ],
            wallMaterial
        );
        addBox(
            'secret-room-wall-north-right',
            [maxX - entryMaxX, height, wallThickness],
            [(entryMaxX + maxX) / 2, height / 2, maxZ],
            wallMaterial
        );
        addBox(
            'secret-room-wall-north-header',
            [entryMaxX - entryMinX, height - entryHeight, wallThickness],
            [(entryMinX + entryMaxX) / 2, entryHeight + (height - entryHeight) / 2, maxZ],
            wallMaterial
        );
        addBox(
            'secret-room-wall-west-front',
            [wallThickness, height, exitMinZ - minZ],
            [minX, height / 2, (minZ + exitMinZ) / 2],
            wallMaterial
        );
        addBox(
            'secret-room-wall-west-back',
            [wallThickness, height, maxZ - exitMaxZ],
            [minX, height / 2, (exitMaxZ + maxZ) / 2],
            wallMaterial
        );
        addBox(
            'secret-room-wall-west-header',
            [wallThickness, height - exitHeight, exitMaxZ - exitMinZ],
            [minX, exitHeight + (height - exitHeight) / 2, (exitMinZ + exitMaxZ) / 2],
            wallMaterial
        );

        // Detalles visuales de la estancia, sin textos flotantes en el mapa.
        addBox('secret-room-entry-trim', [entryWidth, 0.28, 0.18], [entryX, entryHeight, maxZ + 0.48], accentMaterial);
        addBox('secret-room-exit-trim', [0.18, 0.28, exitWidth], [minX - 0.48, exitHeight, exitZ], accentMaterial);
        addBox('secret-room-console', [5.5, 1.1, 2.6], [0, 0.75, 1.2], darkMetalMaterial);
        addBox('secret-room-console-panel', [3.6, 1.25, 0.12], [0, 1.85, -0.14], lightMaterial);
        addBox('secret-room-seal', [7.5, 0.22, 0.22], [0, 3.7, maxZ - 0.5], accentMaterial);
        [-1, 1].forEach(side => {
            addBox(
                `secret-room-light-${side < 0 ? 'left' : 'right'}`,
                [0.28, 3.8, 0.28],
                [side * (width / 2 - 2.2), 4.4, 0],
                lightMaterial
            );
        });

        root.userData = {
            id: root.name,
            type: 'staticModel',
            propType: 'hormiguero-secret-room',
            bulletImpact: true,
            isStatic: true
        };

        this.scene.add(root);
        root.updateMatrixWorld(true);

        const addCollider = (name, min, max) => {
            if (model.collision === false) return;

            const collider = new THREE.Object3D();
            collider.name = `${root.name}-${name}-collider`;
            collider.userData = {
                type: 'staticCollider',
                isStatic: true,
                bulletImpact: false,
                bulletImpactFallback: false,
                simpleBoxCollider: true,
                boundingBox: new THREE.Box3(
                    new THREE.Vector3(...min),
                    new THREE.Vector3(...max)
                ).applyMatrix4(root.matrixWorld)
            };
            root.add(collider);
            this.walls.push(collider);
        };

        addCollider('ceiling', [minX, height, minZ], [maxX, height + 0.5, maxZ]);
        addCollider('wall-south', [minX, 0, minZ - wallThickness / 2], [maxX, height, minZ + wallThickness / 2]);
        addCollider('wall-east', [maxX - wallThickness / 2, 0, minZ], [maxX + wallThickness / 2, height, maxZ]);
        addCollider('wall-north-left', [minX, 0, maxZ - wallThickness / 2], [entryMinX, height, maxZ + wallThickness / 2]);
        addCollider('wall-north-right', [entryMaxX, 0, maxZ - wallThickness / 2], [maxX, height, maxZ + wallThickness / 2]);
        addCollider('wall-north-header', [entryMinX, entryHeight, maxZ - wallThickness / 2], [entryMaxX, height, maxZ + wallThickness / 2]);
        addCollider('wall-west-front', [minX - wallThickness / 2, 0, minZ], [minX + wallThickness / 2, height, exitMinZ]);
        addCollider('wall-west-back', [minX - wallThickness / 2, 0, exitMaxZ], [minX + wallThickness / 2, height, maxZ]);
        addCollider('wall-west-header', [minX - wallThickness / 2, exitHeight, exitMinZ], [minX + wallThickness / 2, height, exitMaxZ]);

        this.staticModels.push(root);
        console.log(`Habitación secreta de El Hormiguero cargada en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
        return root;
}
