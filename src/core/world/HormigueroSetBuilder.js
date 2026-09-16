// Escenario del plató de El Hormiguero, extraído de World.js.
// Se ejecuta con .call(world) para conservar el acceso a this.* sin reescribir el cuerpo.
import * as THREE from 'three';
import { HORMIGUERO_TEXTURES } from './hormigueroTextures.js';

export function buildHormigueroSet(model = {}) {
        const root = new THREE.Group();
        root.name = model.id || 'hormiguero_tv_studio';

        const position = model.position || {};
        root.position.set(
            Number(position.x) || 0,
            Number(position.y) || 0,
            Number(position.z) || 0
        );
        root.scale.setScalar(Number(model.scale) || 1);
        root.userData = {
            id: root.name,
            type: 'staticModel',
            propType: 'hormiguero-set',
            bulletImpact: true,
            isStatic: true
        };

        const makeMaterial = (color, options = {}) => {
            const {
                texturePath,
                textureRepeatX = 1,
                textureRepeatY = 1,
                ...materialOptions
            } = options;

            return this.createTexturedStandardMaterial(
                color,
                texturePath,
                textureRepeatX,
                textureRepeatY,
                {
                    roughness: 0.82,
                    metalness: 0.08,
                    flatShading: true,
                    ...materialOptions
                }
            );
        };

        const backdropMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 4,
            textureRepeatY: 2,
            roughness: 0.96,
            metalness: 0.02
        });
        const stageMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.floor,
            textureRepeatX: 4,
            textureRepeatY: 2,
            roughness: 0.9
        });
        const carpetMaterial = makeMaterial(0x651f30, {
            roughness: 0.98
        });
        const trimMaterial = makeMaterial(0xb84c2d, {
            emissive: 0x260604,
            emissiveIntensity: 0.45
        });
        const honeyMaterial = makeMaterial(0xd78320, {
            emissive: 0x512004,
            emissiveIntensity: 0.75,
            roughness: 0.72
        });
        const honeyDarkMaterial = makeMaterial(0x8a461c, {
            emissive: 0x241003,
            emissiveIntensity: 0.3
        });
        const screenMaterial = makeMaterial(0x071b38, {
            emissive: 0x082b5b,
            emissiveIntensity: 1.1,
            roughness: 0.45,
            metalness: 0.2
        });
        const frameMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 2,
            textureRepeatY: 2,
            metalness: 0.38,
            roughness: 0.62
        });
        const metalMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.metal,
            textureRepeatX: 2,
            textureRepeatY: 2,
            metalness: 0.7,
            roughness: 0.42
        });
        const deskMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.wood,
            textureRepeatX: 2,
            textureRepeatY: 1,
            metalness: 0.18,
            roughness: 0.68
        });
        const lightMaterial = makeMaterial(0xffb34a, {
            emissive: 0xff6a16,
            emissiveIntensity: 1.8,
            roughness: 0.45
        });
        const buildingWallMaterial = makeMaterial(0xffffff, {
            texturePath: HORMIGUERO_TEXTURES.buildingWall,
            textureRepeatX: 7,
            textureRepeatY: 3,
            roughness: 0.98,
            metalness: 0
        });

        const addBox = (name, dimensions, coordinates, material, rotation = {}) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(...dimensions),
                material
            );
            mesh.name = name;
            mesh.position.set(...coordinates);
            mesh.rotation.set(
                rotation.x || 0,
                rotation.y || 0,
                rotation.z || 0
            );
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            root.add(mesh);
            return mesh;
        };

        const addCylinder = (
            name,
            radiusTop,
            radiusBottom,
            height,
            segments,
            coordinates,
            material,
            rotation = {}
        ) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    radiusTop,
                    radiusBottom,
                    height,
                    segments
                ),
                material
            );
            mesh.name = name;
            mesh.position.set(...coordinates);
            mesh.rotation.set(
                rotation.x || 0,
                rotation.y || 0,
                rotation.z || 0
            );
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            root.add(mesh);
            return mesh;
        };

        const addSphere = (name, radius, coordinates, material) => {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 8, 5),
                material
            );
            mesh.name = name;
            mesh.position.set(...coordinates);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            root.add(mesh);
            return mesh;
        };

        // El plató queda dentro de una carcasa de edificio. La fachada frontal
        // es continua para que desde el patio no se vea el escenario; se deja
        // una entrada lateral con dintel para conservar el acceso jugable.
        const building = {
            minX: -44,
            maxX: 44,
            frontZ: -14,
            backZ: -64,
            wallHeight: 24,
            wallThickness: 1.6,
            sideEntryCenterZ: -39,
            sideEntryWidth: 14,
            sideEntryHeight: 10
        };
        const buildingCenterZ = (building.frontZ + building.backZ) / 2;
        const buildingDepth = building.frontZ - building.backZ;
        const sideWallX = building.maxX - building.wallThickness / 2;
        const leftWallX = building.minX + building.wallThickness / 2;
        const sideSectionDepth = (buildingDepth - building.sideEntryWidth) / 2;
        const frontSectionCenterZ = building.frontZ - sideSectionDepth / 2;
        const backSectionCenterZ = building.backZ + sideSectionDepth / 2;

        addBox(
            'hormiguero-building-front-wall',
            [building.maxX - building.minX, building.wallHeight, building.wallThickness],
            [0, building.wallHeight / 2, building.frontZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-back-wall',
            [building.maxX - building.minX, building.wallHeight, building.wallThickness],
            [0, building.wallHeight / 2, building.backZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-left-wall',
            [building.wallThickness, building.wallHeight, buildingDepth],
            [leftWallX, building.wallHeight / 2, buildingCenterZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-right-wall-front',
            [building.wallThickness, building.wallHeight, sideSectionDepth],
            [sideWallX, building.wallHeight / 2, frontSectionCenterZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-right-wall-back',
            [building.wallThickness, building.wallHeight, sideSectionDepth],
            [sideWallX, building.wallHeight / 2, backSectionCenterZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-right-entry-lintel',
            [building.wallThickness, building.wallHeight - building.sideEntryHeight, building.sideEntryWidth],
            [sideWallX, building.sideEntryHeight + (building.wallHeight - building.sideEntryHeight) / 2, building.sideEntryCenterZ],
            buildingWallMaterial
        );
        addBox(
            'hormiguero-building-roof',
            [building.maxX - building.minX, building.wallThickness, buildingDepth],
            [0, building.wallHeight + building.wallThickness / 2, buildingCenterZ],
            buildingWallMaterial
        );

        // Escenario, alfombra y pared de fondo.
        addBox('hormiguero-stage-platform', [76, 1.2, 34], [0, 0.6, -38], stageMaterial);
        addBox('hormiguero-stage-carpet', [66, 0.16, 25], [0, 1.28, -38], carpetMaterial);
        addBox('hormiguero-stage-front-step', [74, 0.45, 2.8], [0, 0.22, -20.6], metalMaterial);
        addBox('hormiguero-backdrop', [76, 20, 0.8], [0, 10, -55], backdropMaterial);
        addBox('hormiguero-backdrop-left', [4, 16, 1.1], [-36, 8, -53.9], honeyDarkMaterial);
        addBox('hormiguero-backdrop-right', [4, 16, 1.1], [36, 8, -53.9], honeyDarkMaterial);
        addBox('hormiguero-side-light-left', [0.55, 16, 0.2], [-33.8, 8, -53.2], lightMaterial);
        addBox('hormiguero-side-light-right', [0.55, 16, 0.2], [33.8, 8, -53.2], lightMaterial);

        // Pantalla central y una H geométrica de bloques, legible desde el
        // área de juego sin introducir una fuente o una textura adicional.
        addBox('hormiguero-screen-frame', [31, 10, 0.8], [0, 12.1, -54.1], frameMaterial);
        addBox('hormiguero-screen', [27.5, 7.25, 0.14], [0, 12.1, -53.62], screenMaterial);
        addBox('hormiguero-logo-left', [1.45, 5.1, 0.2], [-3.2, 12.1, -53.48], honeyMaterial);
        addBox('hormiguero-logo-right', [1.45, 5.1, 0.2], [3.2, 12.1, -53.48], honeyMaterial);
        addBox('hormiguero-logo-crossbar', [5.8, 1.2, 0.2], [0, 12.1, -53.48], honeyMaterial);

        // Paneles hexagonales que recuerdan a una colmena y mantienen el
        // lenguaje visual del programa con pocos polígonos.
        const honeycombX = [-30, -22, 22, 30];
        const honeycombY = [4.2, 9.2, 14.2];
        honeycombY.forEach((y, row) => {
            honeycombX.forEach((x, column) => {
                addCylinder(
                    `hormiguero-hex-${row}-${column}`,
                    3.05,
                    3.05,
                    0.28,
                    6,
                    [x, y, -54.2],
                    (row + column) % 2 === 0 ? honeyMaterial : honeyDarkMaterial,
                    { x: Math.PI / 2 }
                );
            });
        });

        // Mesa del presentador y dos asientos sencillos para invitados.
        addBox('hormiguero-desk-top', [20, 0.9, 4], [0, 4.35, -32], deskMaterial);
        addBox('hormiguero-desk-front', [18, 2.2, 0.5], [0, 3.0, -29.85], trimMaterial);
        addBox('hormiguero-desk-left-leg', [1.25, 2.7, 3], [-8.3, 2.45, -32], deskMaterial);
        addBox('hormiguero-desk-right-leg', [1.25, 2.7, 3], [8.3, 2.45, -32], deskMaterial);
        addBox('hormiguero-desk-trim', [18, 0.22, 0.18], [0, 4.0, -29.55], honeyMaterial);

        [-14, 14].forEach((x, index) => {
            addCylinder(
                `hormiguero-stool-seat-${index}`,
                2.0,
                2.0,
                0.65,
                8,
                [x, 2.45, -31.5],
                frameMaterial
            );
            addCylinder(
                `hormiguero-stool-base-${index}`,
                0.28,
                0.42,
                1.9,
                8,
                [x, 1.45, -31.5],
                metalMaterial
            );
            addBox(
                `hormiguero-stool-back-${index}`,
                [3.5, 2.1, 0.42],
                [x, 3.85, -33.1],
                frameMaterial
            );
        });

        [-4, 4].forEach((x, index) => {
            addCylinder(
                `hormiguero-microphone-stand-${index}`,
                0.07,
                0.07,
                1.35,
                6,
                [x, 5.4, -31.7],
                metalMaterial
            );
            addSphere(`hormiguero-microphone-head-${index}`, 0.22, [x, 6.15, -31.7], lightMaterial);
        });

        // Truss superior, focos y una cámara lateral muy simplificada.
        addBox('hormiguero-truss-top', [74, 0.5, 0.5], [0, 19, -46], metalMaterial);
        addBox('hormiguero-truss-left', [0.5, 18, 0.5], [-35, 10, -46], metalMaterial);
        addBox('hormiguero-truss-right', [0.5, 18, 0.5], [35, 10, -46], metalMaterial);

        [-24, -8, 8, 24].forEach((x, index) => {
            addBox(`hormiguero-light-housing-${index}`, [1.4, 0.9, 1.4], [x, 17.8, -40], metalMaterial);
            addCylinder(
                `hormiguero-light-lens-${index}`,
                0.42,
                0.42,
                0.18,
                8,
                [x, 17.25, -40],
                lightMaterial,
                { x: Math.PI / 2 }
            );
            const pointLight = new THREE.PointLight(
                index % 2 === 0 ? 0xff9b38 : 0x936dff,
                2.4,
                42,
                2
            );
            pointLight.position.set(x, 17.1, -39.3);
            root.add(pointLight);
        });

        addBox('hormiguero-camera-body', [3.2, 2.1, 2.3], [-28, 4.0, -23.5], metalMaterial);
        addCylinder(
            'hormiguero-camera-lens',
            0.72,
            0.72,
            1.1,
            8,
            [-28, 4.0, -22.1],
            screenMaterial,
            { x: Math.PI / 2 }
        );
        addCylinder(
            'hormiguero-camera-tripod',
            0.25,
            0.48,
            2.4,
            6,
            [-28, 1.95, -23.5],
            metalMaterial
        );

        this.scene.add(root);
        root.updateMatrixWorld(true);

        const addCollider = (name, min, max) => {
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

        addCollider('backdrop', [-38, 0, -55.6], [38, 20.4, -54.1]);
        addCollider('desk', [-10, 1.25, -34.2], [10, 4.9, -29.5]);
        addCollider('camera', [-30, 0, -25], [-26, 6, -21.5]);
        addCollider(
            'building-front-wall',
            [building.minX, 0, building.frontZ - building.wallThickness / 2],
            [building.maxX, building.wallHeight, building.frontZ + building.wallThickness / 2]
        );
        addCollider(
            'building-back-wall',
            [building.minX, 0, building.backZ - building.wallThickness / 2],
            [building.maxX, building.wallHeight, building.backZ + building.wallThickness / 2]
        );
        addCollider(
            'building-left-wall',
            [building.minX - building.wallThickness / 2, 0, building.backZ],
            [building.minX + building.wallThickness / 2, building.wallHeight, building.frontZ]
        );
        addCollider(
            'building-right-wall-front',
            [building.maxX - building.wallThickness / 2, 0, building.frontZ - sideSectionDepth],
            [building.maxX + building.wallThickness / 2, building.wallHeight, building.frontZ]
        );
        addCollider(
            'building-right-wall-back',
            [building.maxX - building.wallThickness / 2, 0, building.backZ],
            [building.maxX + building.wallThickness / 2, building.wallHeight, building.backZ + sideSectionDepth]
        );
        addCollider(
            'building-right-entry-lintel',
            [building.maxX - building.wallThickness / 2, building.sideEntryHeight, building.sideEntryCenterZ - building.sideEntryWidth / 2],
            [building.maxX + building.wallThickness / 2, building.wallHeight, building.sideEntryCenterZ + building.sideEntryWidth / 2]
        );
        addCollider(
            'building-roof',
            [building.minX, building.wallHeight, building.backZ],
            [building.maxX, building.wallHeight + building.wallThickness, building.frontZ]
        );

        this.staticModels.push(root);
        console.log('Plató low poly de El Hormiguero cargado');
        return root;
}
