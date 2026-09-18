// Mesa del plató de El Hormiguero, extraída como builder propio.
// Se ejecuta con .call(world) para conservar el acceso a this.*.
// El frontal (+Z) mira a las gradas; es un prop editable como la fuente.
import * as THREE from 'three';
import { HORMIGUERO_TEXTURES } from './hormigueroTextures.js';

export function buildHormigueroDesk(model = {}) {
    const group = new THREE.Group();
    group.name = model.id || 'hormiguero-desk';

    const width = Math.max(6, Math.min(20, Number(model.width) || 14));
    const depth = Math.max(2, Math.min(6, Number(model.depth) || 3.4));
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

    const wood = makeMaterial(0xffffff, {
        texturePath: HORMIGUERO_TEXTURES.wood,
        textureRepeatX: 2,
        textureRepeatY: 1,
        roughness: 0.68,
        metalness: 0.18
    });
    const steelDark = makeMaterial(0xffffff, {
        texturePath: HORMIGUERO_TEXTURES.metal,
        textureRepeatX: 1,
        textureRepeatY: 1,
        roughness: 0.56,
        metalness: 0.68
    });
    const red = makeMaterial(0xb63b32, {
        emissive: 0x260302,
        emissiveIntensity: 0.35,
        roughness: 0.72
    });
    const honey = makeMaterial(0xd78320, {
        emissive: 0x4d1f05,
        emissiveIntensity: 0.68,
        roughness: 0.7
    });
    const honeyLight = makeMaterial(0xffbd45, {
        emissive: 0x7a2e05,
        emissiveIntensity: 0.9,
        roughness: 0.58
    });
    const darkInlay = makeMaterial(0x071d3c, {
        emissive: 0x0b4f85,
        emissiveIntensity: 0.6,
        roughness: 0.38,
        metalness: 0.18
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

    const addSphere = (name, radius, coordinates, material) => {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 8, 5),
            material
        );
        mesh.name = name;
        mesh.position.set(...coordinates);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        group.add(mesh);
        return mesh;
    };

    const addHex = (name, radius, coordinates, material) => {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, 0.22, 6),
            material
        );
        mesh.name = name;
        mesh.position.set(...coordinates);
        mesh.rotation.x = Math.PI / 2;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        group.add(mesh);
        return mesh;
    };

    // Zócalo, patas laterales y panel frontal rojo con ribete miel.
    const desktopTopY = 3.03;
    addBox('hormiguero-desk-plinth', [width * 0.86, 0.35, depth * 0.8], [0, 0.175, 0], steelDark);
    [-1, 1].forEach(side => {
        addBox(
            `hormiguero-desk-leg-${side < 0 ? 'left' : 'right'}`,
            [0.9, 2.2, depth * 0.78],
            [side * (width / 2 - 0.75), 1.45, 0],
            wood
        );
    });
    addBox('hormiguero-desk-front', [width * 0.8, 1.8, 0.35], [0, 1.45, depth / 2 - 0.35], red);
    addBox('hormiguero-desk-front-trim', [width * 0.8, 0.2, 0.1], [0, 2.28, depth / 2 - 0.12], honey);
    addHex('hormiguero-desk-logo', 0.55, [0, 1.45, depth / 2 - 0.05], honeyLight);

    // Sobremesa de madera con tira de luz y tarima oscura central.
    addBox('hormiguero-desk-top', [width, 0.55, depth], [0, 2.75, 0], wood);
    addBox('hormiguero-desk-glow', [width * 0.84, 0.12, 0.1], [0, 2.52, depth / 2 + 0.01], honeyLight);
    addBox('hormiguero-desk-inlay', [width * 0.66, 0.06, depth * 0.42], [0, desktopTopY + 0.03, -0.2], darkInlay);

    // Dos micrófonos de sobremesa.
    [-1, 1].forEach(side => {
        const x = side * width * 0.2;
        const label = side < 0 ? 'left' : 'right';
        addCylinder(`hormiguero-desk-mic-stand-${label}`, 0.07, 0.07, 1.3, 6, [x, desktopTopY + 0.65, -0.3], steelDark);
        addSphere(`hormiguero-desk-mic-head-${label}`, 0.22, [x, desktopTopY + 1.39, -0.3], honeyLight);
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
        id: model.id || 'hormiguero-desk',
        type: 'staticModel',
        propType: 'hormiguero-desk',
        bulletImpact: model.bulletImpact !== false,
        bulletImpactFallback: model.collision !== false,
        isStatic: true
    };

    this.scene.add(group);
    group.updateMatrixWorld(true);
    this.decorativeMeshes.push(group);

    // Colisión ajustada a la silueta en tres niveles: base con patas y
    // panel frontal (el hueco bajo la sobremesa queda libre), sobremesa y
    // pilares de micrófono. Cada celda es un rectángulo en espacio local
    // que se proyecta al mundo con la matriz del grupo, así la colisión
    // respeta la rotación en vez de usar la caja ejes-alineada (que se
    // hincha en diagonal). La celda guarda su rectángulo en `colliderCell`
    // (números planos) para recalcularse al mover/rotar desde el editor.
    const buildDeskCells = () => {
        const hitWidth = Math.max(0.5, Number(model.collisionWidth) || width);
        const micTopY = Math.max(0.5, Number(model.collisionHeight) || 4.7);
        const frontZ = depth / 2;
        const names = { base: 0, top: 0 };
        const addCell = (prefix, x, z, w, d, y0, y1) => {
            const collider = new THREE.Object3D();
            collider.name = `${group.name}-collider-${prefix}-${names[prefix]++}`;
            collider.userData = {
                type: 'staticCollider',
                isStatic: true,
                bulletImpact: false,
                bulletImpactFallback: false,
                simpleBoxCollider: true,
                colliderCell: { x, z, w, d, y0, y1 },
                boundingBox: new THREE.Box3(
                    new THREE.Vector3(x - w / 2, y0, z - d / 2),
                    new THREE.Vector3(x + w / 2, y1, z + d / 2)
                ).applyMatrix4(group.matrixWorld)
            };
            group.add(collider);
            this.walls.push(collider);
        };
        const tileRow = (prefix, totalW, centerX, z, d, y0, y1, target) => {
            const n = Math.max(1, Math.round(totalW / target));
            const w = totalW / n;
            for (let i = 0; i < n; i++) {
                addCell(prefix, centerX - totalW / 2 + w * (i + 0.5), z, w + 0.02, d, y0, y1);
            }
        };

        // Nivel base: tacos sobre cada pata (y 0..2.55), franja del panel
        // frontal (y 0..2.5) y losa baja del zócalo (y 0..0.4). El hueco
        // bajo la sobremesa queda libre.
        const legX = hitWidth / 2 - 0.75;
        const legDepth = depth * 0.78 + 0.2;
        [-1, 1].forEach(side => {
            const n = Math.max(1, Math.round(legDepth / 1.0));
            const step = legDepth / n;
            for (let i = 0; i < n; i++) {
                addCell('base', side * legX, -legDepth / 2 + step * (i + 0.5), 1.1, step + 0.04, 0, 2.55);
            }
        });
        tileRow('base', width * 0.8 + 0.3, 0, frontZ - 0.225, 0.85, 0, 2.5, 1.6);
        tileRow('base', width * 0.86 + 0.1, 0, 0, depth * 0.8 + 0.1, 0, 0.4, 1.75);

        // Nivel sobremesa (y 2.5..3.15): toda la huella por tramos.
        tileRow('top', hitWidth, 0, 0.025, depth + 0.2, 2.5, 3.15, 1.75);

        // Nivel micrófonos (y 3.0..4.7): dos pilares puntuales.
        [-1, 1].forEach(side => {
            const label = side < 0 ? 'left' : 'right';
            const mx = side * width * 0.2;
            const collider = new THREE.Object3D();
            collider.name = `${group.name}-collider-mic-${label}`;
            collider.userData = {
                type: 'staticCollider',
                isStatic: true,
                bulletImpact: false,
                bulletImpactFallback: false,
                simpleBoxCollider: true,
                colliderCell: { x: mx, z: -0.3, w: 0.7, d: 0.7, y0: 3.0, y1: micTopY },
                boundingBox: new THREE.Box3(
                    new THREE.Vector3(mx - 0.35, 3.0, -0.65),
                    new THREE.Vector3(mx + 0.35, micTopY, 0.05)
                ).applyMatrix4(group.matrixWorld)
            };
            group.add(collider);
            this.walls.push(collider);
        });
    };

    if (model.collision !== false) {
        buildDeskCells();
        group.userData.simpleBoxCollider = true;
        group.userData.collisionBoxSize = {
            width: Math.max(0.5, Number(model.collisionWidth) || width),
            height: 4.7,
            depth: depth + 0.2
        };
        this.staticModels.push(group);
    }

    console.log(`Mesa de El Hormiguero cargada en (${position.x || 0}, ${position.y || 0}, ${position.z || 0})`);
    return group;
}
