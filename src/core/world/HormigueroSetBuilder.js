// Carcasa del edificio del plató de El Hormiguero (las gradas y la mesa
// viven ahora en sus propios builders: HormigueroBleachersBuilder y
// HormigueroDeskBuilder).
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

        // La carcasa solo necesita el material de muro.
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

        // Las gradas y la mesa se construyen con sus propios builders
        // (hormiguero_bleachers / hormiguero_desk en modelos/*_models.json).

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
        console.log('Carcasa del plató de El Hormiguero cargada');
        return root;
}
