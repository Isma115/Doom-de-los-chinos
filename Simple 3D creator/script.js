import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// --- State Management ---
const viewData = {
    top: { points: [], lines: [], nextId: 1, selected: [] },
    front: { points: [], lines: [], nextId: 1, selected: [] },
    side: { points: [], lines: [], nextId: 1, selected: [] }
};

const model3D = {
    vertices: [],
    edges: []
};

const state = {
    scale: 20,
    gridSize: 1,
    hoverPos: null,
    activeView: null,
    // Drag State
    isDragging: false,
    dragStartPoint: null, // {id, u, v}
    dragCurrentPos: null  // {u, v}
};

// --- DOM Elements ---
const canvasTop = document.getElementById('canvas-top');
const canvasFront = document.getElementById('canvas-front');
const canvasSide = document.getElementById('canvas-side');
const vertexCountEl = document.getElementById('vertex-count');
const edgeCountEl = document.getElementById('edge-count');

const ctxTop = canvasTop.getContext('2d');
const ctxFront = canvasFront.getContext('2d');
const ctxSide = canvasSide.getContext('2d');

// --- Three.js Setup ---
let scene, camera, renderer, controls;
const objectsParams = {
    vertexRadius: 0.15,
    edgeWidth: 0.05
};

function initThree() {
    const container = document.getElementById('three-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121212);

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Grid Helper
    const gridHelper = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    animate();
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const container = document.getElementById('three-container');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    resizeCanvases();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// --- 2D Editor Logic ---

function resizeCanvases() {
    [canvasTop, canvasFront, canvasSide].forEach(canvas => {
        const rect = canvas.parentElement.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }
    });
    renderAllViews();
}

function worldToCanvas(u, v, canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(w, h) / (state.scale * 2.2);
    const cx = w / 2 + u * scale;
    const cy = h / 2 - v * scale;
    return { x: cx, y: cy };
}

function canvasToWorld(cx, cy, canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(w, h) / (state.scale * 2.2);
    const u = (cx - w / 2) / scale;
    const v = -(cy - h / 2) / scale;
    const snap = state.gridSize;
    return {
        u: Math.round(u / snap) * snap,
        v: Math.round(v / snap) * snap
    };
}

function drawGrid(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width, height) / (state.scale * 2.2);
    const centerW = width / 2;
    const centerH = height / 2;

    const start = -state.scale;
    const end = state.scale;
    const step = state.gridSize;

    for (let i = start; i <= end; i += step) {
        const screenOffset = i * scale;
        // Vert
        ctx.strokeStyle = (i === 0) ? '#666' : '#2a2a2a';
        ctx.lineWidth = (i === 0) ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(centerW + screenOffset, 0); ctx.lineTo(centerW + screenOffset, height); ctx.stroke();
        // Horiz
        ctx.beginPath(); ctx.moveTo(0, centerH - screenOffset); ctx.lineTo(width, centerH - screenOffset); ctx.stroke();
    }
}

function renderView(canvas, ctx, type) {
    drawGrid(ctx, canvas.width, canvas.height);
    const data = viewData[type];

    // Draw Points
    data.points.forEach(p => {
        const p2d = worldToCanvas(p.u, p.v, canvas);
        const isSelected = data.selected.includes(p.id);

        ctx.fillStyle = isSelected ? '#ffcc00' : '#4a9eff';
        ctx.globalAlpha = isSelected ? 1.0 : 0.6;
        ctx.beginPath();
        ctx.arc(p2d.x, p2d.y, isSelected ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // Draw Lines
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    data.lines.forEach(line => {
        const p1 = data.points.find(p => p.id === line.start);
        const p2 = data.points.find(p => p.id === line.end);
        if (p1 && p2) {
            const start = worldToCanvas(p1.u, p1.v, canvas);
            const end = worldToCanvas(p2.u, p2.v, canvas);
            ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
        }
    });

    // Draw Dragging Line
    if (state.isDragging && state.activeView === type && state.dragStartPoint && state.dragCurrentPos) {
        const start = worldToCanvas(state.dragStartPoint.u, state.dragStartPoint.v, canvas);
        const end = worldToCanvas(state.dragCurrentPos.u, state.dragCurrentPos.v, canvas);

        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.globalAlpha = 1.0;

    // Cursor
    if (state.activeView === type && state.hoverPos) {
        const p2d = worldToCanvas(state.hoverPos.u, state.hoverPos.v, canvas);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath(); ctx.arc(p2d.x, p2d.y, 4, 0, Math.PI * 2); ctx.fill();
    }
}

function renderAllViews() {
    renderView(canvasTop, ctxTop, 'top');
    renderView(canvasFront, ctxFront, 'front');
    renderView(canvasSide, ctxSide, 'side');
}

// --- Interaction ---

function getPointAt(pos, data) {
    for (let p of data.points) {
        if (Math.abs(p.u - pos.u) < 0.1 && Math.abs(p.v - pos.v) < 0.1) {
            return p;
        }
    }
    return null;
}

function handleCanvasDown(e, type) {
    const canvas = e.target;
    // Capture to handle move/up outside canvas comfortably
    // But since independent views, let's keep it simple.

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const pos = canvasToWorld(cx, cy, canvas);
    const data = viewData[type];

    // Find point or Create new one
    let point = getPointAt(pos, data);

    if (!point) {
        // Create new
        point = { id: data.nextId++, u: pos.u, v: pos.v };
        data.points.push(point);
    }

    // Start Drag
    state.isDragging = true;
    state.activeView = type;
    state.dragStartPoint = point;
    state.dragCurrentPos = { ...pos };

    // Select this point
    data.selected = [point.id];

    renderAllViews();
}

function handleCanvasMove(e, type) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const worldPos = canvasToWorld(cx, cy, canvas);

    if (state.isDragging && state.activeView === type) {
        state.dragCurrentPos = worldPos;
    }

    // Only update hover if same view
    state.hoverPos = worldPos;
    renderAllViews();
}

function handleCanvasUp(e, type) {
    if (!state.isDragging || state.activeView !== type) {
        state.isDragging = false;
        state.dragStartPoint = null;
        return;
    }

    // End Drag
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const pos = canvasToWorld(cx, cy, canvas);
    const data = viewData[type];

    let endPoint = getPointAt(pos, data);

    // If released on empty space, create point
    if (!endPoint) {
        // Create new
        endPoint = { id: data.nextId++, u: pos.u, v: pos.v };
        data.points.push(endPoint);
    }

    // Create Line if different points
    if (state.dragStartPoint && endPoint.id !== state.dragStartPoint.id) {
        // Check duplicates
        const exists = data.lines.some(l =>
            (l.start === state.dragStartPoint.id && l.end === endPoint.id) ||
            (l.start === endPoint.id && l.end === state.dragStartPoint.id)
        );
        if (!exists) {
            data.lines.push({ start: state.dragStartPoint.id, end: endPoint.id });
        }
        data.selected = [endPoint.id]; // Select the new end
    }

    state.isDragging = false;
    state.dragStartPoint = null;
    state.dragCurrentPos = null;
    renderAllViews();
}

function handleCanvasOut(e) {
    // If dragging, we might want to keep dragging? 
    // For now, cancel drag if out
    // Actually, dragging outside canvas is tricky without window listener.
    // Let's just hide cursor but keep drag state invalid visually? 
    // Better to just simplify: cancel hover. Drag continues logic in Move.
    state.hoverPos = null;
    renderAllViews();
}

// Global Up to catch release outside?
window.addEventListener('mouseup', () => {
    if (state.isDragging) {
        state.isDragging = false;
        state.dragStartPoint = null;
        state.dragCurrentPos = null;
        renderAllViews();
    }
});


function handleRightClick(e, type) {
    e.preventDefault();
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const pos = canvasToWorld(cx, cy, canvas);

    const data = viewData[type];

    // Line detection
    let lineToRemove = -1;
    const threshold = 0.5;

    for (let i = 0; i < data.lines.length; i++) {
        const line = data.lines[i];
        const p1 = data.points.find(p => p.id === line.start);
        const p2 = data.points.find(p => p.id === line.end);
        if (!p1 || !p2) continue;

        // dist point to segment
        const A = pos.u - p1.u;
        const B = pos.v - p1.v;
        const C = p2.u - p1.u;
        const D = p2.v - p1.v;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = (A * C + B * D) / len_sq;

        let xx, yy;
        if (param < 0) { xx = p1.u; yy = p1.v; }
        else if (param > 1) { xx = p2.u; yy = p2.v; }
        else { xx = p1.u + param * C; yy = p1.v + param * D; }

        const dist = Math.sqrt((pos.u - xx) * (pos.u - xx) + (pos.v - yy) * (pos.v - yy));
        if (dist < threshold) {
            lineToRemove = i;
            break;
        }
    }

    if (lineToRemove !== -1) {
        data.lines.splice(lineToRemove, 1);
        renderAllViews();
    }
}

function handleKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        ['top', 'front', 'side'].forEach(type => {
            const data = viewData[type];
            if (data.selected.length > 0) {
                data.points = data.points.filter(p => !data.selected.includes(p.id));
                data.lines = data.lines.filter(l => !data.selected.includes(l.start) && !data.selected.includes(l.end));
                data.selected = [];
            }
        });
        renderAllViews();
    }
    if (e.key === 'Escape') {
        ['top', 'front', 'side'].forEach(type => viewData[type].selected = []);
        renderAllViews();
    }
}

function handleWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.05;
    const delta = Math.sign(e.deltaY) * state.scale * zoomSpeed;
    state.scale += delta;
    state.scale = Math.max(2, Math.min(100, state.scale));
    renderAllViews();
}

// --- Reconstruction Algorithm ---

function reconstruct3D() {
    const candidates = [];
    const tolerance = 0.1;
    let initialMatchCount = 0;

    viewData.top.points.forEach(pt => {
        viewData.front.points.forEach(pf => {
            if (Math.abs(pt.u - pf.u) < tolerance) {
                initialMatchCount++;
                const candidate = { x: pt.u, y: pf.v, z: pt.v };

                const sideMatch = viewData.side.points.some(ps =>
                    Math.abs(ps.u - candidate.z) < tolerance &&
                    Math.abs(ps.v - candidate.y) < tolerance
                );

                const sideEmpty = viewData.side.points.length === 0;

                if (sideMatch || sideEmpty) {
                    candidates.push(candidate);
                }
            }
        });
    });

    if (viewData.top.points.length === 0 && viewData.front.points.length === 0) {
        alert("Please draw points in at least Top and Front views.");
        return;
    }

    if (initialMatchCount === 0) {
        alert("No matching points found. Points in Top and Front views must share the same X (horizontal) coordinate.");
    } else if (candidates.length === 0) {
        alert("Points matched in Top/Front but were filtered by Side view.");
    }

    model3D.vertices = candidates.map((c, i) => ({ ...c, id: i }));
    model3D.edges = [];

    // Reconstruct Edges
    for (let i = 0; i < model3D.vertices.length; i++) {
        for (let j = i + 1; j < model3D.vertices.length; j++) {
            const v1 = model3D.vertices[i];
            const v2 = model3D.vertices[j];

            const isConnected = (points, lines, u1, v1_coord, u2, v2_coord) => {
                if (points.length === 0) return true;
                const p1 = points.find(p => Math.abs(p.u - u1) < tolerance && Math.abs(p.v - v1_coord) < tolerance);
                const p2 = points.find(p => Math.abs(p.u - u2) < tolerance && Math.abs(p.v - v2_coord) < tolerance);
                if (!p1 || !p2) return false;
                return lines.some(l => (l.start === p1.id && l.end === p2.id) || (l.start === p2.id && l.end === p1.id));
            };

            const topConn = isConnected(viewData.top.points, viewData.top.lines, v1.x, v1.z, v2.x, v2.z);
            const frontConn = isConnected(viewData.front.points, viewData.front.lines, v1.x, v1.y, v2.x, v2.y);
            const sideConn = isConnected(viewData.side.points, viewData.side.lines, v1.z, v1.y, v2.z, v2.y);

            if (topConn && frontConn && sideConn) {
                model3D.edges.push({ start: v1.id, end: v2.id });
            }
        }
    }

    update3DScene();
}

function updateUI() {
    if (vertexCountEl) vertexCountEl.textContent = model3D.vertices.length;
    if (edgeCountEl) edgeCountEl.textContent = model3D.edges.length;
}

function update3DScene() {
    const objectsToRemove = [];
    scene.traverse((child) => {
        if (child.isMesh || child.isLine) {
            if (!child.geometry || child.isGridHelper) return;
            objectsToRemove.push(child);
        }
    });
    objectsToRemove.forEach(obj => scene.remove(obj));

    const geometry = new THREE.SphereGeometry(objectsParams.vertexRadius, 16, 16);
    const material = new THREE.MeshLambertMaterial({ color: 0x4a9eff });

    model3D.vertices.forEach(v => {
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(v.x, v.y, v.z);
        scene.add(sphere);
    });

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    model3D.edges.forEach(edge => {
        const v1 = model3D.vertices.find(v => v.id === edge.start);
        const v2 = model3D.vertices.find(v => v.id === edge.end);
        if (!v1 || !v2) return;
        const points = [new THREE.Vector3(v1.x, v1.y, v1.z), new THREE.Vector3(v2.x, v2.y, v2.z)];
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat);
        scene.add(line);
    });

    if (model3D.vertices.length >= 4) {
        const points = model3D.vertices.map(v => new THREE.Vector3(v.x, v.y, v.z));
        try {
            const mesh = new THREE.Mesh(
                new ConvexGeometry(points),
                new THREE.MeshLambertMaterial({ color: 0x4a9eff, opacity: 0.3, transparent: true, side: THREE.DoubleSide })
            );
            scene.add(mesh);
        } catch (e) { }
    }

    updateUI();
}

// Events
['top', 'front', 'side'].forEach(type => {
    const cvs = (type === 'top' ? canvasTop : (type === 'front' ? canvasFront : canvasSide));
    cvs.addEventListener('mousedown', (e) => handleCanvasDown(e, type));
    cvs.addEventListener('mousemove', (e) => handleCanvasMove(e, type));
    cvs.addEventListener('mouseup', (e) => handleCanvasUp(e, type));
    cvs.addEventListener('mouseout', (e) => handleCanvasOut(e));
    cvs.addEventListener('contextmenu', (e) => handleRightClick(e, type));
    cvs.addEventListener('wheel', handleWheel, { passive: false });
});

window.addEventListener('keydown', handleKeyDown);

document.getElementById('btn-clear').addEventListener('click', () => {
    ['top', 'front', 'side'].forEach(k => {
        viewData[k].points = [];
        viewData[k].lines = [];
        viewData[k].selected = [];
        viewData[k].nextId = 1;
    });
    model3D.vertices = [];
    model3D.edges = [];
    renderAllViews();
    update3DScene();
});

document.getElementById('btn-transform').addEventListener('click', () => {
    reconstruct3D();
});

document.getElementById('btn-export').addEventListener('click', () => {
    const data = JSON.stringify(model3D, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'model.json';
    a.click();
});

initThree();
resizeCanvases();
setTimeout(resizeCanvases, 500);
