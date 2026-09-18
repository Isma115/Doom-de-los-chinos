// Gradas del plató de El Hormiguero, extraídas como builder propio.
// Se ejecuta con .call(world) para conservar el acceso a this.*.
// La fila 0 queda en el origen local y las siguientes avanzan hacia +Z;
// es un prop editable como la mesa.
import * as THREE from 'three';
import { HORMIGUERO_TEXTURES } from './hormigueroTextures.js';

export function buildHormigueroBleachers(model = {}) {
    const group = new THREE.Group();
    group.name = model.id || 'hormiguero-bleachers';

    const width = Math.max(10, Math.min(80, Number(model.width) || 62));
    const rows = Math.max(1, Math.min(10, Math.round(Number(model.rows) || 6)));
    const rowDepth = Math.max(1.2, Number(model.rowDepth) || 2.0);
    const rowSpacing = Math.max(1.6, Number(model.rowSpacing) || 2.4);
    const step = Math.max(0.3, Number(model.step) || 0.55);
    const propScale = Number(model.scale) || 1;

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

    const honeyMaterial = makeMaterial(0xd78320, {
        emissive: 0x512004,
        emissiveIntensity: 0.75,
        roughness: 0.72
    });
    const audienceSeatMaterial = makeMaterial(0x651f30, {
        texturePath: HORMIGUERO_TEXTURES.wood,
        textureRepeatX: 2,
        textureRepeatY: 1,
        roughness: 0.92,
        metalness: 0.03
    });
    const audienceTrimMaterial = makeMaterial(0xffffff, {
        texturePath: HORMIGUERO_TEXTURES.metal,
        textureRepeatX: 2,
        textureRepeatY: 1,
        roughness: 0.54,
        metalness: 0.62
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
        group.add(mesh);
        return mesh;
    };

    const addCylinder = (name, radiusTop, radiusBottom, height, segments, coordinates, material) => {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
            material
        );
        mesh.name = name;
        mesh.position.set(...coordinates);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        group.add(mesh);
        return mesh;
    };

    // Seis bancos por fila; la distribución escala con el ancho para
    // conservar las proporciones del diseño original de 62 m.
    const scaleFactor = width / 62;
    const sectionWidth = 8.8 * scaleFactor;
    const sectionCenters = [-26, -15.6, -5.2, 5.2, 15.6, 26].map(x => x * scaleFactor);

    for (let row = 0; row < rows; row++) {
        const rowZ = row * rowSpacing;
        const platformHeight = 0.45 + row * step;

        addBox(
            `hormiguero-audience-platform-${row}`,
            [width, platformHeight, rowDepth],
            [0, platformHeight / 2, rowZ],
            audienceTrimMaterial
        );
        addBox(
            `hormiguero-audience-front-trim-${row}`,
            [width + 0.18, 0.18, 0.16],
            [0, platformHeight - 0.08, rowZ - rowDepth / 2 - 0.05],
            honeyMaterial
        );

        sectionCenters.forEach((x, section) => {
            addBox(
                `hormiguero-audience-bench-${row}-${section}`,
                [sectionWidth, 0.18, 0.78],
                [x, platformHeight + 0.16, rowZ - 0.08],
                audienceSeatMaterial
            );
            addBox(
                `hormiguero-audience-backrest-${row}-${section}`,
                [sectionWidth, 0.58, 0.14],
                [x, platformHeight + 0.5, rowZ + 0.45],
                audienceSeatMaterial
            );
            addBox(
                `hormiguero-audience-backrest-trim-${row}-${section}`,
                [sectionWidth + 0.08, 0.1, 0.18],
                [x, platformHeight + 0.8, rowZ + 0.45],
                honeyMaterial
            );
        });
    }

    // Barandilla perimetral low-poly en ambos laterales.
    const maxPlatformHeight = 0.45 + (rows - 1) * step;
    const railLength = (rows - 1) * rowSpacing + 1.5;
    const railCenterZ = ((rows - 1) * rowSpacing) / 2;
    [-1, 1].forEach(side => {
        const x = side * (width / 2 + 0.42);
        for (let row = 0; row < rows; row++) {
            const rowZ = row * rowSpacing + 0.45;
            const platformHeight = 0.45 + row * step;
            const postHeight = 1.1 + row * 0.12;
            addCylinder(
                `hormiguero-audience-rail-post-${side}-${row}`,
                0.12,
                0.12,
                postHeight,
                6,
                [x, platformHeight + postHeight / 2, rowZ],
                audienceTrimMaterial
            );
        }
        addBox(
            `hormiguero-audience-rail-${side}`,
            [0.16, 0.16, railLength],
            [x, maxPlatformHeight + 0.4, railCenterZ],
            audienceTrimMaterial
        );
    });

    const position = model.position || { x: 0, y: 0, z: 0 };
    group.position.set(
        Number(position.x) || 0,
        Number(position.y) || 0,
        Number(position.z) || 0
    );
    group.rotation.order = model.rotationOrder || 'XYZ';
    group.rotation.x = THREE.MathUtils.degToRad(Number(model.rotationX) || 0);
    group.rotation.y = THREE.MathUtils.degToRad(
        model.rotationY !== undefined ? Number(model.rotationY) : Number(model.rotation) || 0
    );
    group.rotation.z = THREE.MathUtils.degToRad(Number(model.rotationZ) || 0);
    group.scale.setScalar(propScale);
    group.userData = {
        id: model.id || 'hormiguero-bleachers',
        type: 'staticModel',
        propType: 'hormiguero-bleachers',
        bulletImpact: model.bulletImpact !== false,
        bulletImpactFallback: model.collision !== false,
        isStatic: true
    };

    this.scene.add(group);
    group.updateMatrixWorld(true);
    this.decorativeMeshes.push(group);

    if (model.collision !== false) {
        const totalDepth = (rows - 1) * rowSpacing + rowDepth + 0.2;
        const colliderWidth = Math.max(0.5, Number(model.collisionWidth) || width + 1.4);
        const colliderHeight = Math.max(0.5, Number(model.collisionHeight) || maxPlatformHeight + 0.9);
        const colliderDepth = Math.max(0.5, Number(model.collisionDepth) || totalDepth);
        group.userData.simpleBoxCollider = true;
        group.userData.collisionBoxSize = {
            width: colliderWidth,
            height: colliderHeight,
            depth: colliderDepth
        };
        // Caja real medida sobre la geometría: respeta la rotación inicial.
        group.userData.boundingBox = new THREE.Box3().setFromObject(group);
        this.walls.push(group);
        this.staticModels.push(group);
    }

    console.log(`Gradas de El Hormiguero cargadas en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
    return group;
}
