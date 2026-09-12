import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const assetRoot = path.join(root, 'assets/3D/decoracion/urban');
const modelsJsonPath = path.join(root, 'modelos/mapa1_models.json');
const packCategory = 'urban_street_pack';

const sharedMaterials = {
    mat_dark: { kd: '0.05 0.055 0.06' },
    mat_metal: { kd: '0.45 0.47 0.46' },
    mat_glass: { kd: '0.45 0.68 0.82', d: '0.55' },
    mat_red: { kd: '0.9 0.05 0.03' },
    mat_yellow: { kd: '1.0 0.75 0.05' },
    mat_green: { kd: '0.05 0.85 0.2' },
    mat_orange: { kd: '1.0 0.42 0.04' },
    mat_blue: { kd: '0.08 0.22 0.9' },
    mat_white: { kd: '0.96 0.96 0.9' },
};

const modelDefs = [
    {
        id: 'bus_stop_shelter',
        label: 'BUS',
        colors: ['#1f2933', '#b8e7ff', '#f2c94c'],
        build: (m) => {
            const atlas = {
                base: [0.02, 0.70, 0.98, 0.98],
                roof: [0.02, 0.02, 0.98, 0.26],
                seat: [0.02, 0.30, 0.62, 0.58],
                sign: [0.66, 0.30, 0.98, 0.68],
            };

            m.box([0, 0.2, -1.9], [9, 0.4, 0.35], 'mat_texture', atlas.base);
            m.box([0, 4.6, -2.05], [9.5, 0.35, 0.35], 'mat_metal');
            m.box([-4.4, 2.4, -2.05], [0.25, 4.8, 0.3], 'mat_metal');
            m.box([4.4, 2.4, -2.05], [0.25, 4.8, 0.3], 'mat_metal');
            m.box([0, 2.7, -2.16], [7.6, 3.4, 0.12], 'mat_glass');
            m.box([0, 5.15, 0], [10, 0.45, 5.3], 'mat_texture', atlas.roof);
            m.box([0, 1.35, 0.85], [5.6, 0.35, 1.1], 'mat_texture', atlas.seat);
            m.box([-2.1, 0.7, 0.85], [0.35, 1.35, 0.35], 'mat_metal');
            m.box([2.1, 0.7, 0.85], [0.35, 1.35, 0.35], 'mat_metal');
            m.box([-3.6, 2.9, 2.35], [1.9, 1.3, 0.12], 'mat_texture', atlas.sign);
        }
    },
    {
        id: 'street_lamp',
        label: 'LUZ',
        colors: ['#2b3036', '#f7f2c4', '#6b7280'],
        build: (m) => {
            m.cylinder([0, 0.2, 0], 0.85, 0.4, 16, 'mat_metal');
            m.cylinder([0, 6.2, 0], 0.16, 12, 16, 'mat_dark');
            m.box([1.65, 12, 0], [3.4, 0.18, 0.18], 'mat_dark');
            m.box([3.05, 11.6, 0], [1.2, 0.55, 0.9], 'mat_white');
            m.box([3.25, 11.35, 0], [0.7, 0.12, 0.55], 'mat_yellow');
        }
    },
    {
        id: 'traffic_light',
        label: 'SEMAFORO',
        colors: ['#111827', '#ef4444', '#22c55e'],
        build: (m) => {
            m.cylinder([0, 3.6, 0], 0.13, 7.2, 16, 'mat_dark');
            m.box([0, 7.4, 0], [1.25, 3, 0.75], 'mat_texture');
            m.cylinder([0, 8.3, -0.42], 0.28, 0.12, 18, 'mat_red', 'x');
            m.cylinder([0, 7.4, -0.42], 0.28, 0.12, 18, 'mat_yellow', 'x');
            m.cylinder([0, 6.5, -0.42], 0.28, 0.12, 18, 'mat_green', 'x');
            m.box([0, 0.15, 0], [1, 0.3, 1], 'mat_metal');
        }
    },
    {
        id: 'stop_sign',
        label: 'STOP',
        colors: ['#b91c1c', '#ffffff', '#404040'],
        build: (m) => {
            m.cylinder([0, 2.2, 0], 0.1, 4.4, 12, 'mat_metal');
            m.cylinder([0, 4.7, -0.05], 1.35, 0.14, 8, 'mat_red', 'x');
            m.cylinder([0, 4.7, -0.13], 1.05, 0.06, 8, 'mat_texture', 'x');
        }
    },
    {
        id: 'concrete_bollard',
        label: 'BOLARDO',
        colors: ['#9ca3af', '#f59e0b', '#4b5563'],
        build: (m) => {
            m.cylinder([0, 0.15, 0], 0.6, 0.3, 20, 'mat_dark');
            m.cylinder([0, 1.35, 0], 0.38, 2.4, 20, 'mat_texture');
            m.cylinder([0, 2.6, 0], 0.32, 0.18, 20, 'mat_metal');
        }
    },
    {
        id: 'trash_bin',
        label: 'PAPEL',
        colors: ['#14532d', '#22c55e', '#0f172a'],
        build: (m) => {
            m.box([0, 1.25, 0], [2.2, 2.5, 1.7], 'mat_texture');
            m.box([0, 2.65, 0], [2.45, 0.28, 1.95], 'mat_dark');
            m.box([0, 2.92, 0], [1.3, 0.18, 0.65], 'mat_dark');
            m.box([0, 1.35, -0.9], [1.3, 0.22, 0.12], 'mat_white');
        }
    },
    {
        id: 'recycling_container',
        label: 'RECICLA',
        colors: ['#1d4ed8', '#60a5fa', '#e5e7eb'],
        build: (m) => {
            m.box([0, 1.65, 0], [4.6, 3.3, 2.5], 'mat_texture');
            m.box([0, 3.45, 0], [4.9, 0.35, 2.8], 'mat_blue');
            m.box([0, 3.75, 0], [1.7, 0.24, 1.1], 'mat_dark');
            m.box([0, 1.7, -1.28], [2.5, 0.55, 0.12], 'mat_white');
        }
    },
    {
        id: 'dumpster',
        label: 'CONTENEDOR',
        colors: ['#374151', '#16a34a', '#111827'],
        build: (m) => {
            m.box([0, 1.45, 0], [6.4, 2.9, 3.1], 'mat_texture');
            m.box([-1.7, 3.15, 0], [3.1, 0.35, 3.25], 'mat_dark');
            m.box([1.7, 3.15, 0], [3.1, 0.35, 3.25], 'mat_dark');
            m.cylinder([-2.5, 0.15, -1.35], 0.35, 0.35, 12, 'mat_dark', 'x');
            m.cylinder([2.5, 0.15, -1.35], 0.35, 0.35, 12, 'mat_dark', 'x');
        }
    },
    {
        id: 'road_barrier',
        label: 'OBRAS',
        colors: ['#f97316', '#ffffff', '#6b7280'],
        build: (m) => {
            m.box([0, 1.55, 0], [7.8, 1.1, 0.45], 'mat_texture');
            m.box([-3.3, 0.75, 0], [0.35, 1.5, 0.35], 'mat_metal');
            m.box([3.3, 0.75, 0], [0.35, 1.5, 0.35], 'mat_metal');
            m.box([-3.3, 0.08, 0], [1.8, 0.16, 1.2], 'mat_dark');
            m.box([3.3, 0.08, 0], [1.8, 0.16, 1.2], 'mat_dark');
        }
    },
    {
        id: 'construction_cone',
        label: 'CONO',
        colors: ['#f97316', '#ffffff', '#111827'],
        build: (m) => {
            m.box([0, 0.08, 0], [2.3, 0.16, 2.3], 'mat_dark');
            m.cylinder([0, 0.85, 0], 0.75, 1.5, 20, 'mat_orange');
            m.cylinder([0, 1.55, 0], 0.38, 0.18, 20, 'mat_white');
            m.cylinder([0, 2.05, 0], 0.22, 0.9, 20, 'mat_orange');
        }
    },
    {
        id: 'street_bench',
        label: 'BANCO',
        colors: ['#7c2d12', '#d97706', '#222222'],
        build: (m) => {
            m.box([0, 1.35, 0], [6.5, 0.32, 1.25], 'mat_texture');
            m.box([0, 2.35, 0.75], [6.5, 0.35, 0.35], 'mat_texture');
            m.box([0, 2.8, 0.9], [6.5, 0.35, 0.35], 'mat_texture');
            m.box([-2.7, 0.65, 0], [0.3, 1.3, 0.3], 'mat_dark');
            m.box([2.7, 0.65, 0], [0.3, 1.3, 0.3], 'mat_dark');
            m.box([-2.7, 1.85, 0.8], [0.3, 1.8, 0.3], 'mat_dark');
            m.box([2.7, 1.85, 0.8], [0.3, 1.8, 0.3], 'mat_dark');
        }
    },
    {
        id: 'bike_rack',
        label: 'BICI',
        colors: ['#71717a', '#d4d4d8', '#27272a'],
        build: (m) => {
            for (let x = -2.4; x <= 2.4; x += 1.2) {
                m.cylinder([x, 0.9, -0.45], 0.08, 1.9, 12, 'mat_metal');
                m.cylinder([x, 0.9, 0.45], 0.08, 1.9, 12, 'mat_metal');
                m.box([x, 1.85, 0], [0.2, 0.2, 1], 'mat_metal');
            }
            m.box([0, 0.06, -0.72], [6.4, 0.12, 0.22], 'mat_dark');
            m.box([0, 0.06, 0.72], [6.4, 0.12, 0.22], 'mat_dark');
        }
    },
    {
        id: 'newspaper_kiosk',
        label: 'KIOSCO',
        colors: ['#991b1b', '#facc15', '#f3f4f6'],
        build: (m) => {
            m.box([0, 2.35, 0], [5.2, 4.7, 4.4], 'mat_texture');
            m.box([0, 4.95, 0], [6, 0.5, 5.2], 'mat_red');
            m.box([0, 2.4, -2.25], [3.4, 2.2, 0.12], 'mat_glass');
            m.box([0, 1.0, -2.33], [4.4, 0.5, 0.16], 'mat_yellow');
        }
    },
    {
        id: 'utility_box',
        label: 'ELEC',
        colors: ['#64748b', '#94a3b8', '#f8fafc'],
        build: (m) => {
            m.box([0, 1.65, 0], [3, 3.3, 1.4], 'mat_texture');
            m.box([0, 2, -0.75], [1.6, 1.5, 0.08], 'mat_metal');
            m.box([-0.55, 1.25, -0.8], [0.22, 0.22, 0.08], 'mat_yellow');
            m.box([0.55, 1.25, -0.8], [0.22, 0.22, 0.08], 'mat_red');
        }
    },
    {
        id: 'fire_hydrant',
        label: 'BOCA',
        colors: ['#dc2626', '#fbbf24', '#7f1d1d'],
        build: (m) => {
            m.cylinder([0, 0.4, 0], 0.48, 0.8, 18, 'mat_red');
            m.cylinder([0, 1.45, 0], 0.34, 1.8, 18, 'mat_red');
            m.cylinder([0, 2.45, 0], 0.46, 0.38, 18, 'mat_yellow');
            m.cylinder([-0.62, 1.55, 0], 0.22, 0.7, 14, 'mat_red', 'z');
            m.cylinder([0.62, 1.55, 0], 0.22, 0.7, 14, 'mat_red', 'z');
        }
    },
    {
        id: 'parking_meter',
        label: 'PARK',
        colors: ['#475569', '#cbd5e1', '#111827'],
        build: (m) => {
            m.cylinder([0, 1.6, 0], 0.11, 3.2, 12, 'mat_dark');
            m.box([0, 3.45, 0], [1.1, 1.35, 0.72], 'mat_texture');
            m.box([0, 3.62, -0.39], [0.65, 0.32, 0.08], 'mat_glass');
            m.box([0, 0.08, 0], [0.9, 0.16, 0.9], 'mat_metal');
        }
    },
    {
        id: 'manhole_cover',
        label: 'ALCANTARILLA',
        colors: ['#1f2937', '#4b5563', '#9ca3af'],
        collision: false,
        build: (m) => {
            m.cylinder([0, 0.08, 0], 1.55, 0.16, 32, 'mat_texture');
            m.box([0, 0.18, 0], [2.2, 0.05, 0.12], 'mat_metal');
            m.box([0, 0.19, 0], [0.12, 0.05, 2.2], 'mat_metal');
        }
    },
    {
        id: 'storm_drain',
        label: 'REJILLA',
        colors: ['#111827', '#6b7280', '#374151'],
        collision: false,
        build: (m) => {
            m.box([0, 0.06, 0], [4, 0.12, 1.6], 'mat_texture');
            for (let x = -1.5; x <= 1.5; x += 0.5) {
                m.box([x, 0.16, 0], [0.13, 0.08, 1.5], 'mat_dark');
            }
        }
    },
    {
        id: 'planter_box',
        label: 'JARDINERA',
        colors: ['#78350f', '#16a34a', '#84cc16'],
        build: (m) => {
            m.box([0, 0.75, 0], [5.8, 1.5, 2.2], 'mat_texture');
            m.box([0, 1.58, 0], [5.2, 0.2, 1.6], 'mat_dark');
            for (let x = -2; x <= 2; x += 1) {
                m.cylinder([x, 2.2, 0], 0.45, 1.1, 8, 'mat_green');
            }
        }
    },
    {
        id: 'phone_booth',
        label: 'TELEFONO',
        colors: ['#be123c', '#e5e7eb', '#38bdf8'],
        build: (m) => {
            m.box([0, 3.2, 0], [3, 6.4, 2.6], 'mat_texture');
            m.box([0, 3.1, -1.33], [2.1, 4.1, 0.12], 'mat_glass');
            m.box([0, 6.65, 0], [3.3, 0.45, 2.9], 'mat_red');
            m.box([0, 0.12, 0], [3.1, 0.24, 2.7], 'mat_dark');
        }
    }
];

const placements = [
    ['bus_stop_shelter', -115, 0, -120, 90, true],
    ['street_lamp', -100, 0, -118, 0, true],
    ['traffic_light', -70, 0, -120, 0, true],
    ['stop_sign', -40, 0, -118, 0, true],
    ['concrete_bollard', -18, 0, -120, 0, true],
    ['trash_bin', 10, 0, -118, -20, true],
    ['recycling_container', 40, 0, -118, 0, true],
    ['dumpster', 78, 0, -118, 90, true],
    ['road_barrier', 115, 0, -120, 0, true],
    ['construction_cone', 138, 0, -120, 20, true],
    ['street_bench', -122, 0, -82, 0, true],
    ['bike_rack', -82, 0, -82, 90, true],
    ['newspaper_kiosk', -35, 0, -82, 0, true],
    ['utility_box', 8, 0, -82, 180, true],
    ['fire_hydrant', 45, 0, -82, 0, true],
    ['parking_meter', 72, 0, -82, -20, true],
    ['manhole_cover', 99, 0, -82, 0, false],
    ['storm_drain', 128, 0, -82, 0, false],
    ['planter_box', 158, 0, -82, 90, true],
    ['phone_booth', 170, 0, -118, 180, true],
];

class ObjBuilder {
    constructor(id) {
        this.id = id;
        this.vertices = [];
        this.uvs = [];
        this.faces = [];
    }

    addVertex(v) {
        this.vertices.push(v);
        return this.vertices.length;
    }

    addUv(uv) {
        this.uvs.push(uv);
        return this.uvs.length;
    }

    face(indices, material, uvRect = [0, 0, 1, 1]) {
        const [u0, v0, u1, v1] = uvRect;
        const uv = [
            this.addUv([u0, v0]),
            this.addUv([u1, v0]),
            this.addUv([u1, v1]),
            this.addUv([u0, v1]),
        ];
        this.faces.push({ indices, uv, material });
    }

    box(center, size, material = 'mat_texture', uvRect = [0, 0, 1, 1]) {
        const [cx, cy, cz] = center;
        const [sx, sy, sz] = size.map((n) => n / 2);
        const v = [
            this.addVertex([cx - sx, cy - sy, cz - sz]),
            this.addVertex([cx + sx, cy - sy, cz - sz]),
            this.addVertex([cx + sx, cy + sy, cz - sz]),
            this.addVertex([cx - sx, cy + sy, cz - sz]),
            this.addVertex([cx - sx, cy - sy, cz + sz]),
            this.addVertex([cx + sx, cy - sy, cz + sz]),
            this.addVertex([cx + sx, cy + sy, cz + sz]),
            this.addVertex([cx - sx, cy + sy, cz + sz]),
        ];
        this.face([v[0], v[1], v[2], v[3]], material, uvRect);
        this.face([v[5], v[4], v[7], v[6]], material, uvRect);
        this.face([v[4], v[0], v[3], v[7]], material, uvRect);
        this.face([v[1], v[5], v[6], v[2]], material, uvRect);
        this.face([v[3], v[2], v[6], v[7]], material, uvRect);
        this.face([v[4], v[5], v[1], v[0]], material, uvRect);
    }

    cylinder(center, radius, height, segments = 16, material = 'mat_texture', axis = 'y') {
        const [cx, cy, cz] = center;
        const bottom = [];
        const top = [];
        for (let i = 0; i < segments; i++) {
            const a = (Math.PI * 2 * i) / segments;
            const ca = Math.cos(a) * radius;
            const sa = Math.sin(a) * radius;
            let b;
            let t;
            if (axis === 'x') {
                b = [cx - height / 2, cy + ca, cz + sa];
                t = [cx + height / 2, cy + ca, cz + sa];
            } else if (axis === 'z') {
                b = [cx + ca, cy + sa, cz - height / 2];
                t = [cx + ca, cy + sa, cz + height / 2];
            } else {
                b = [cx + ca, cy - height / 2, cz + sa];
                t = [cx + ca, cy + height / 2, cz + sa];
            }
            bottom.push(this.addVertex(b));
            top.push(this.addVertex(t));
        }

        const bottomCenter = this.addVertex(axis === 'x' ? [cx - height / 2, cy, cz] : axis === 'z' ? [cx, cy, cz - height / 2] : [cx, cy - height / 2, cz]);
        const topCenter = this.addVertex(axis === 'x' ? [cx + height / 2, cy, cz] : axis === 'z' ? [cx, cy, cz + height / 2] : [cx, cy + height / 2, cz]);

        for (let i = 0; i < segments; i++) {
            const n = (i + 1) % segments;
            this.face([bottom[i], bottom[n], top[n], top[i]], material);
            this.face([bottomCenter, bottom[i], bottom[n], bottomCenter], material);
            this.face([topCenter, top[n], top[i], topCenter], material);
        }
    }

    toObj(mtlName) {
        const lines = [`mtllib ${mtlName}`, `o ${this.id}`];
        this.vertices.forEach(([x, y, z]) => lines.push(`v ${fmt(x)} ${fmt(y)} ${fmt(z)}`));
        this.uvs.forEach(([u, v]) => lines.push(`vt ${fmt(u)} ${fmt(v)}`));
        let current = null;
        this.faces.forEach((face) => {
            if (face.material !== current) {
                lines.push(`usemtl ${face.material}`);
                current = face.material;
            }
            lines.push(`f ${face.indices.map((vi, i) => `${vi}/${face.uv[i]}`).join(' ')}`);
        });
        return `${lines.join('\n')}\n`;
    }
}

function fmt(n) {
    return Number.parseFloat(n.toFixed(4));
}

function makeMtl(id, textureName) {
    const lines = [
        'newmtl mat_texture',
        'Ka 1 1 1',
        'Kd 1 1 1',
        'Ks 0.05 0.05 0.05',
        'Ns 16',
        `map_Kd ${textureName}`,
    ];

    for (const [name, value] of Object.entries(sharedMaterials)) {
        lines.push('', `newmtl ${name}`, 'Ka 1 1 1', `Kd ${value.kd}`, 'Ks 0.02 0.02 0.02', 'Ns 12');
        if (value.d) {
            lines.push(`d ${value.d}`, 'Tr 0.45');
        }
    }

    return `${lines.join('\n')}\n`;
}

function makeSvg({ id, label, colors }) {
    if (id === 'street_bench') {
        return makeBenchSvg();
    }
    if (id === 'bus_stop_shelter') {
        return makeBusStopSvg();
    }

    const [base, accent, light] = colors;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>
  <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
    <stop offset="0" stop-color="${base}"/>
    <stop offset="0.55" stop-color="${accent}"/>
    <stop offset="1" stop-color="${base}"/>
  </linearGradient>
  <pattern id="scratches" width="64" height="64" patternUnits="userSpaceOnUse">
    <path d="M4 24h56M-10 50h40M30 10h48" stroke="${light}" stroke-opacity=".32" stroke-width="4"/>
    <circle cx="20" cy="40" r="3" fill="#000" opacity=".18"/>
    <circle cx="48" cy="17" r="2" fill="#fff" opacity=".28"/>
  </pattern>
</defs>
<rect width="512" height="512" fill="url(#g)"/>
<rect width="512" height="512" fill="url(#scratches)"/>
<rect x="28" y="28" width="456" height="456" rx="18" fill="none" stroke="${light}" stroke-width="18" stroke-opacity=".75"/>
<path d="M32 420L480 92" stroke="#000" stroke-opacity=".18" stroke-width="36"/>
<text x="256" y="286" fill="${light}" stroke="#111" stroke-width="8" paint-order="stroke" font-family="Arial, sans-serif" font-size="68" font-weight="900" text-anchor="middle">${escapeXml(label)}</text>
<text x="256" y="338" fill="#111" opacity=".55" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="middle">${escapeXml(id)}</text>
</svg>
`;
}

function makeBenchSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>
  <linearGradient id="woodBase" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#3b1c12"/>
    <stop offset="0.28" stop-color="#714027"/>
    <stop offset="0.55" stop-color="#9a6032"/>
    <stop offset="0.78" stop-color="#60321f"/>
    <stop offset="1" stop-color="#30150f"/>
  </linearGradient>
  <pattern id="grain" width="128" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(-4)">
    <path d="M-20 12 C18 2 45 22 82 12 S142 4 164 17" fill="none" stroke="#d38a4a" stroke-opacity=".28" stroke-width="4"/>
    <path d="M-12 30 C22 18 42 40 76 29 S133 19 160 34" fill="none" stroke="#1e0d09" stroke-opacity=".34" stroke-width="3"/>
    <path d="M-22 53 C10 43 45 62 92 51 S145 45 170 59" fill="none" stroke="#e0a15b" stroke-opacity=".19" stroke-width="2"/>
    <path d="M18 70 C43 57 63 72 92 66" fill="none" stroke="#25110b" stroke-opacity=".3" stroke-width="2"/>
  </pattern>
  <filter id="softNoise" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="7"/>
    <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .12 0"/>
  </filter>
</defs>
<rect width="512" height="512" fill="url(#woodBase)"/>
<rect width="512" height="512" fill="url(#grain)"/>
<rect width="512" height="512" filter="url(#softNoise)" opacity=".18"/>
<g fill="none" stroke-linecap="round">
  <path d="M20 112 C90 88 130 132 205 104 S344 80 492 112" stroke="#d99551" stroke-opacity=".48" stroke-width="5"/>
  <path d="M14 116 C84 94 132 138 202 110 S344 86 498 118" stroke="#2a120b" stroke-opacity=".45" stroke-width="2"/>
  <path d="M32 324 C108 294 156 344 244 312 S384 292 486 326" stroke="#1d0c08" stroke-opacity=".42" stroke-width="5"/>
  <path d="M30 331 C114 305 158 352 248 320 S390 301 488 334" stroke="#d99551" stroke-opacity=".26" stroke-width="2"/>
</g>
<g fill="#261109" opacity=".78">
  <circle cx="102" cy="177" r="10"/><circle cx="402" cy="392" r="9"/>
</g>
<g fill="none" stroke="#c98545" stroke-opacity=".45" stroke-width="2">
  <ellipse cx="102" cy="177" rx="24" ry="10"/><ellipse cx="102" cy="177" rx="38" ry="17"/>
  <ellipse cx="402" cy="392" rx="22" ry="9"/><ellipse cx="402" cy="392" rx="34" ry="15"/>
</g>
<g fill="#d7a36a" opacity=".72">
  <circle cx="74" cy="78" r="3"/><circle cx="286" cy="218" r="2"/><circle cx="452" cy="266" r="3"/>
</g>
<rect x="12" y="12" width="488" height="488" rx="12" fill="none" stroke="#160905" stroke-opacity=".55" stroke-width="8"/>
</svg>
`;
}

function makeBusStopSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>
  <linearGradient id="atlasBase" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#071a22"/>
    <stop offset="0.45" stop-color="#174b57"/>
    <stop offset="1" stop-color="#06151c"/>
  </linearGradient>
  <linearGradient id="roofMetal" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#244f59"/>
    <stop offset=".45" stop-color="#0e313c"/>
    <stop offset="1" stop-color="#061b24"/>
  </linearGradient>
  <linearGradient id="seatMetal" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4b9aa0"/>
    <stop offset=".5" stop-color="#1a5b66"/>
    <stop offset="1" stop-color="#0b303c"/>
  </linearGradient>
  <pattern id="brushed" width="32" height="32" patternUnits="userSpaceOnUse">
    <path d="M0 4H32M0 13H32M0 25H32" stroke="#9bd8df" stroke-opacity=".13" stroke-width="2"/>
    <path d="M0 8H32M0 29H32" stroke="#03141b" stroke-opacity=".22" stroke-width="2"/>
  </pattern>
  <pattern id="seatDots" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="4" cy="4" r="1.7" fill="#c4f5f5" opacity=".3"/>
    <circle cx="17" cy="17" r="1.3" fill="#06212b" opacity=".42"/>
  </pattern>
</defs>
<!-- One atlas: roof / seat / sign / base. The OBJ assigns each part to one zone. -->
<rect width="512" height="512" fill="#0b2730"/>

<!-- Roof zone: u=.02..98, v=.02..26 -->
<rect x="10" y="10" width="492" height="123" rx="12" fill="url(#roofMetal)" stroke="#061820" stroke-width="8"/>
<rect x="18" y="18" width="476" height="107" fill="url(#brushed)" opacity=".82"/>
<path d="M18 87H494" stroke="#f2c94c" stroke-width="14"/>
<path d="M18 101H494" stroke="#d8f6f4" stroke-opacity=".45" stroke-width="4"/>
<path d="M38 39H470M38 57H470" stroke="#9bd8df" stroke-opacity=".28" stroke-width="4"/>

<!-- Seat zone: u=.02..62, v=.30..58 -->
<rect x="10" y="154" width="307" height="143" rx="12" fill="url(#seatMetal)" stroke="#071b23" stroke-width="8"/>
<rect x="18" y="162" width="291" height="127" fill="url(#seatDots)" opacity=".52"/>
<path d="M25 181H301M25 270H301" stroke="#a9e4e5" stroke-opacity=".36" stroke-width="5"/>
<path d="M37 224H290" stroke="#06242d" stroke-opacity=".62" stroke-width="12"/>
<g fill="#f2c94c"><circle cx="39" cy="181" r="5"/><circle cx="288" cy="181" r="5"/><circle cx="39" cy="270" r="5"/><circle cx="288" cy="270" r="5"/></g>

<!-- Sign zone: u=.66..98, v=.30..68 -->
<rect x="338" y="154" width="164" height="194" rx="18" fill="#08212a" stroke="#f2c94c" stroke-width="10"/>
<rect x="353" y="169" width="134" height="164" rx="12" fill="#276b77" stroke="#b7eef0" stroke-opacity=".62" stroke-width="5"/>
<path d="M376 264V220c0-12 9-21 21-21h45c12 0 21 9 21 21v44" fill="none" stroke="#f7f4de" stroke-width="11" stroke-linejoin="round"/>
<path d="M368 268h104M390 276v18M450 276v18" stroke="#f7f4de" stroke-width="11" stroke-linecap="round"/>
<circle cx="398" cy="264" r="8" fill="#08212a"/><circle cx="446" cy="264" r="8" fill="#08212a"/>

<!-- Base zone: u=.02..98, v=.70..98 -->
<rect x="10" y="358" width="492" height="144" rx="12" fill="url(#atlasBase)" stroke="#061820" stroke-width="8"/>
<path d="M-20 486L116 350H174L38 506Z" fill="#f2c94c" opacity=".86"/>
<path d="M94 506L230 370H262L126 506Z" fill="#f2c94c" opacity=".28"/>
<path d="M28 446H484" stroke="#b7eef0" stroke-opacity=".34" stroke-width="5"/>
<path d="M28 468H484" stroke="#03141b" stroke-opacity=".7" stroke-width="6"/>
</svg>
`;
}

function escapeXml(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

fs.mkdirSync(assetRoot, { recursive: true });

const defsById = new Map(modelDefs.map((def) => [def.id, def]));

for (const def of modelDefs) {
    const dir = path.join(assetRoot, def.id);
    fs.mkdirSync(dir, { recursive: true });

    const builder = new ObjBuilder(def.id);
    def.build(builder);

    fs.writeFileSync(path.join(dir, `${def.id}.obj`), builder.toObj(`${def.id}.mtl`));
    fs.writeFileSync(path.join(dir, `${def.id}.mtl`), makeMtl(def.id, `${def.id}.svg`));
    fs.writeFileSync(path.join(dir, `${def.id}.svg`), makeSvg(def));
}

const current = JSON.parse(fs.readFileSync(modelsJsonPath, 'utf8'));
const preserved = current.filter((entry) => entry.category !== packCategory);
const generated = placements.map(([id, x, y, z, rotationY, collision]) => {
    const def = defsById.get(id);
    if (!def) {
        throw new Error(`Missing model definition for ${id}`);
    }

    return {
        type: 'obj',
        id,
        category: packCategory,
        path: `assets/3D/decoracion/urban/${id}/${id}.obj`,
        position: { x, y, z },
        rotationX: 0,
        rotationY,
        rotationZ: 0,
        scale: 1,
        collision,
    };
});

fs.writeFileSync(modelsJsonPath, `${JSON.stringify([...preserved, ...generated], null, 4)}\n`);
console.log(`Generated ${modelDefs.length} urban OBJ models and placed ${generated.length} in modelos/mapa1_models.json`);
