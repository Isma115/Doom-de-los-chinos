import * as THREE from '../node_modules/three/build/three.module.js';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';

// Editor 3D de mapas para Doom3D.
// El formato de datos sigue siendo el mismo que el editor 2D anterior:
// { format, version, name, width, height, grid }.

const BLOCKS = [
  { code: '#', name: 'Muro', color: '#888888' },
  { code: '.', name: 'Suelo', color: '#44AA44' },
  { code: ' ', name: 'Vacío', color: '#1a1a22' },
  { code: 'P', name: 'Jugador', color: '#4488ff' },
  { code: 'D', name: 'Puerta', color: '#00FFFF' },
  { code: '+', name: 'Comida', color: '#ff5555' },
  { code: 'MP', name: 'Munición pistola', color: '#FFFF00' },
  { code: 'MA', name: 'Munición ametralladora', color: '#FF8800' },
  { code: 'SMuni', name: 'Spawner munición', color: '#6666ff' },
  { code: 'SComida', name: 'Spawner comida', color: '#66ff66' },
  { code: '1', name: 'Enemigo Pablo', color: '#FF00FF' },
  { code: '2', name: 'Enemigo Pera', color: '#FF8800' },
  { code: '3', name: 'Enemigo Slow', color: '#8800FF' },
  { code: '4', name: 'Enemigo Medium', color: '#FF0088' },
  { code: '5', name: 'Enemigo Medium 2', color: '#00FF88' },
  { code: '6', name: 'Enemigo Patica (dispara)', color: '#880088' },
  { code: '7', name: 'Enemigo Charo (melee)', color: '#FF5500' },
  { code: 'A', name: 'Esqueleto Minigun', color: '#aa0000' },
  { code: 'S', name: 'Spawner genérico S+ID', color: '#CCFF00' },
  { code: 'S1', name: 'Spawner S1', color: '#CCFF00' },
  { code: 'S2', name: 'Spawner S2', color: '#b8e600' },
  { code: 'S3', name: 'Spawner S3', color: '#a3cc00' },
  { code: 'S4', name: 'Spawner S4', color: '#8fb300' },
  { code: 'B', name: 'Arbusto', color: '#336633' },
  { code: 'L', name: 'Ladrillo', color: '#AA4444' },
  { code: 'T', name: 'Árbol / Palmera', color: '#228822' },
  { code: 'IMG', name: 'Imagen decorativa', color: '#FFD700' },
  { code: 'PORTAL', name: 'Portal de salida', color: '#9d4dff' },
];

const ENEMY_WITH_SPAWN = new Set(['1', '2', '3', '4', '5', '6', '7', 'A', 'ALIEN', 'MINIGUN']);
const BLOCK_SIZE = 10;
const blockColor = (code) => {
  const exact = BLOCKS.find(block => block.code === code);
  if (exact) return exact.color;
  if (/^S\d+$/.test(code)) return '#CCFF00';
  return '#44AA44';
};
const blockName = (code) => {
  const exact = BLOCKS.find(block => block.code === code);
  if (exact) return exact.name;
  if (/^S\d+$/.test(code)) return 'Spawner genérico';
  return code;
};

const DEFAULT_GAME_URL = 'http://127.0.0.1:5175/index.html';
const GAME_URL_KEY = 'doom3d_editor_game_url';
const desktopApi = window.doom3dDesktop || null;

const $ = (id) => document.getElementById(id);

// ---------- Estado del editor ----------
let grid = [];
let W = 12;
let H = 10;
let brush = { code: '#', rotation: 0, maxSpawns: 5, spawnRate: 5000 };
let tool = 'paint';
let editorMode = 'edit';
let sel = null;
let history = [];
let historyIndex = -1;
let painting = false;
let paintButton = 0;
let historyPushedForStroke = false;
let pendingFileMode = 'json';

// ---------- Escena 3D ----------
let scene = null;
let camera = null;
let renderer = null;
let orbitControls = null;
let editPlane = null;
let gridHelper = null;
let selectionMarker = null;
let hoverMarker = null;
let cellGroup = null;
let cellObjects = new Map();
let raycaster = new THREE.Raycaster();
let pointer = new THREE.Vector2();

function blankCell() {
  return { code: '.', rotation: 0, maxSpawns: null, spawnRate: null };
}

function newGrid(width, height, fill = '.') {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      code: fill,
      rotation: 0,
      maxSpawns: null,
      spawnRate: null,
    }))
  );
}

function normalizeCell(cell) {
  if (typeof cell === 'string') return tokenToCell(cell.replace(/^\((.*)\)$/, '$1'));
  if (!cell || typeof cell !== 'object') return blankCell();
  return {
    code: cell.code ?? '.',
    rotation: Number(cell.rotation) || 0,
    maxSpawns: cell.maxSpawns != null ? Number(cell.maxSpawns) : null,
    spawnRate: cell.spawnRate != null ? Number(cell.spawnRate) : null,
  };
}

function snapshot() {
  return JSON.stringify(grid);
}

function pushHistory() {
  const state = snapshot();
  if (history[historyIndex] === state) return;
  history = history.slice(0, historyIndex + 1);
  history.push(state);
  if (history.length > 60) history.shift();
  historyIndex = history.length - 1;
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  grid = JSON.parse(history[historyIndex]);
  syncSizeFromGrid();
  sel = null;
  render();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  grid = JSON.parse(history[historyIndex]);
  syncSizeFromGrid();
  sel = null;
  render();
}

function syncSizeFromGrid() {
  H = grid.length;
  W = grid[0]?.length || 0;
  $('map-width').value = W;
  $('map-height').value = H;
}

function setGrid(nextGrid) {
  const safeRows = Array.isArray(nextGrid) && nextGrid.length > 0 ? nextGrid : newGrid(12, 10);
  const width = Math.max(1, ...safeRows.map(row => Array.isArray(row) ? row.length : 0));
  grid = safeRows.map(row => {
    const safeRow = Array.isArray(row) ? row.map(normalizeCell) : [];
    while (safeRow.length < width) safeRow.push(blankCell());
    return safeRow;
  });
  syncSizeFromGrid();
  sel = null;
  history = [];
  historyIndex = -1;
  pushHistory();
  render();
}

// ---------- Paleta ----------
function baseOf(code) {
  if (/^S\d+$/.test(code)) return 'S';
  return code;
}

function buildPalette(filter = '') {
  const palette = $('palette');
  palette.innerHTML = '';
  const query = filter.toLowerCase().trim();
  BLOCKS
    .filter(block => !query || block.code.toLowerCase().includes(query) || block.name.toLowerCase().includes(query))
    .forEach(block => {
      const button = document.createElement('button');
      button.className = 'palette-btn' + (baseOf(brush.code) === block.code ? ' active' : '');
      button.title = `${block.code} — ${block.name}`;
      button.innerHTML = `<span class="palette-swatch" style="background:${block.color}">${escapeHtml(block.code)}</span><span class="palette-name">${escapeHtml(block.name)}</span>`;
      button.onclick = () => selectBrush(block.code);
      palette.appendChild(button);
    });
}

function selectBrush(code) {
  brush.code = code === 'S'
    ? `S${($('brush-spawner-id').value || '1').trim() || '1'}`
    : code;
  brush.rotation = Number($('brush-rotation').value) || 0;
  updateBrushPreview();
  buildPalette($('palette-search').value);
}

function updateBrushPreview() {
  const preview = $('brush-preview');
  preview.textContent = brush.code + (brush.rotation ? ` [${brush.rotation}°]` : '');
  preview.style.background = blockColor(brush.code);
}

// ---------- Construcción de la escena 3D ----------
function disposeObject(object) {
  object.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.84,
    metalness: 0.08,
    flatShading: true,
    ...options,
  });
}

function meshBox(parent, name, width, height, depth, position, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(color, options)
  );
  mesh.name = name;
  mesh.position.copy(position);
  parent.add(mesh);
  return mesh;
}

function meshCylinder(parent, name, radiusTop, radiusBottom, height, segments, position, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material(color, options)
  );
  mesh.name = name;
  mesh.position.copy(position);
  parent.add(mesh);
  return mesh;
}

function worldCellPosition(x, y) {
  return new THREE.Vector3(
    (x - W / 2 + 0.5) * BLOCK_SIZE,
    0,
    (y - H / 2 + 0.5) * BLOCK_SIZE
  );
}

function tileColor(code) {
  if (code === '#') return 0x3b424f;
  if (code === ' ') return 0x11151d;
  if (code === 'B') return 0x203d29;
  if (code === 'L') return 0x4f2429;
  return 0x252d37;
}

function createCellVisual(cell, x, y) {
  const root = new THREE.Group();
  root.name = `cell-${x}-${y}`;
  root.userData = { gridX: x, gridY: y };

  const tile = meshBox(
    root,
    'floor-tile',
    BLOCK_SIZE * 0.96,
    0.18,
    BLOCK_SIZE * 0.96,
    new THREE.Vector3(0, 0.09, 0),
    tileColor(cell.code),
    { roughness: 0.95, metalness: 0.02 }
  );
  tile.userData.gridCell = true;

  const rotation = THREE.MathUtils.degToRad(Number(cell.rotation) || 0);
  const token = new THREE.Group();
  token.name = 'token';
  token.rotation.y = rotation;
  root.add(token);

  if (cell.code === '#') {
    meshBox(token, 'wall-volume', BLOCK_SIZE * 0.9, 5.8, BLOCK_SIZE * 0.9, new THREE.Vector3(0, 2.99, 0), 0x626b78, {
      roughness: 0.88,
      metalness: 0.18,
    });
    meshBox(token, 'wall-cap', BLOCK_SIZE * 0.92, 0.14, BLOCK_SIZE * 0.92, new THREE.Vector3(0, 5.95, 0), 0xb2bdc3, {
      roughness: 0.55,
      metalness: 0.46,
    });
  } else if (cell.code === 'B') {
    meshCylinder(token, 'bush-base', 3.5, 3.1, 0.55, 8, new THREE.Vector3(0, 0.36, 0), 0x18301f);
    meshCylinder(token, 'bush-crown', 3.25, 2.35, 4.2, 7, new THREE.Vector3(0, 2.55, 0), 0x357a3c, { roughness: 0.96 });
    meshCylinder(token, 'bush-crown-high', 2.0, 1.55, 2.8, 7, new THREE.Vector3(0.5, 5.2, -0.2), 0x4f9a47, { roughness: 0.96 });
  } else if (cell.code === 'L') {
    meshBox(token, 'brick-volume', BLOCK_SIZE * 0.72, 3.5, BLOCK_SIZE * 0.72, new THREE.Vector3(0, 1.84, 0), 0x8d3f3e, { roughness: 0.96 });
    meshBox(token, 'brick-cap', BLOCK_SIZE * 0.78, 0.18, BLOCK_SIZE * 0.78, new THREE.Vector3(0, 3.7, 0), 0xc15b42, { roughness: 0.88 });
  } else if (cell.code === 'P') {
    meshCylinder(token, 'player-marker-base', 1.7, 1.9, 0.38, 8, new THREE.Vector3(0, 0.38, 0), 0x1d4fa0, { metalness: 0.35 });
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 2.5, 4),
      material(0x5aa1ff, { emissive: 0x123b8a, emissiveIntensity: 0.7 })
    );
    arrow.name = 'player-marker-direction';
    arrow.position.set(0, 1.8, -0.3);
    arrow.rotation.y = Math.PI / 4;
    token.add(arrow);
  } else if (cell.code === 'D') {
    meshBox(token, 'door-frame', 2.2, 6.0, 0.65, new THREE.Vector3(0, 3.05, 0), 0x273641, { metalness: 0.65 });
    meshBox(token, 'door-panel', 1.65, 5.35, 0.18, new THREE.Vector3(0, 2.75, -0.38), 0x16a6b3, { emissive: 0x063d49, emissiveIntensity: 0.6, metalness: 0.55 });
    meshBox(token, 'door-handle', 0.18, 0.22, 0.24, new THREE.Vector3(0.55, 2.65, -0.58), 0xffc74c, { metalness: 0.72 });
  } else if (cell.code === '+') {
    meshBox(token, 'food-cross-a', 3.8, 0.45, 0.8, new THREE.Vector3(0, 1.15, 0), 0xff5b56, { emissive: 0x5a0808, emissiveIntensity: 0.5 });
    meshBox(token, 'food-cross-b', 0.8, 0.45, 3.8, new THREE.Vector3(0, 1.15, 0), 0xff5b56, { emissive: 0x5a0808, emissiveIntensity: 0.5 });
  } else if (cell.code === 'MP' || cell.code === 'MA') {
    const ammoColor = cell.code === 'MP' ? 0xe8d239 : 0xe9822d;
    meshBox(token, 'ammo-box', 3.0, 1.45, 2.5, new THREE.Vector3(0, 0.86, 0), ammoColor, { metalness: 0.35, roughness: 0.58 });
    meshBox(token, 'ammo-band', 0.28, 1.58, 2.62, new THREE.Vector3(0, 0.86, 0), 0x3b2a18, { metalness: 0.4 });
  } else if (cell.code === 'SMuni' || cell.code === 'SComida' || /^S\d+$/.test(cell.code)) {
    const spawnColor = cell.code === 'SComida' ? 0x5ee886 : (cell.code === 'SMuni' ? 0x667fff : 0xb8e83f);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.22, 6, 12),
      material(spawnColor, { emissive: spawnColor, emissiveIntensity: 0.7, metalness: 0.35 })
    );
    ring.name = 'spawner-ring';
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.48;
    token.add(ring);
    meshCylinder(token, 'spawner-core', 0.55, 0.9, 1.8, 6, new THREE.Vector3(0, 1.1, 0), spawnColor, { emissive: spawnColor, emissiveIntensity: 0.55 });
  } else if (ENEMY_WITH_SPAWN.has(cell.code)) {
    const enemyColor = cell.code === 'A' ? 0x9d2f36 : new THREE.Color(blockColor(cell.code)).getHex();
    meshCylinder(token, 'enemy-body', 1.45, 1.8, 2.2, 7, new THREE.Vector3(0, 1.2, 0), enemyColor, { roughness: 0.74, metalness: 0.18 });
    meshCylinder(token, 'enemy-head', 0.92, 1.05, 1.25, 7, new THREE.Vector3(0, 2.95, 0), 0xd5b08c, { roughness: 0.92 });
    meshBox(token, 'enemy-weapon', 0.28, 0.28, 2.7, new THREE.Vector3(0, 1.65, -1.5), 0x20242a, { metalness: 0.72 });
    meshCylinder(token, 'enemy-marker', 0.18, 0.18, 1.0, 6, new THREE.Vector3(0, 4.2, 0), enemyColor, { emissive: enemyColor, emissiveIntensity: 0.7 });
  } else if (cell.code === 'T') {
    meshCylinder(token, 'tree-trunk', 0.58, 0.82, 4.3, 7, new THREE.Vector3(0, 2.2, 0), 0x6b4528, { roughness: 0.96 });
    meshCylinder(token, 'tree-crown', 2.5, 3.35, 4.1, 7, new THREE.Vector3(0, 5.8, 0), 0x31713a, { roughness: 0.96 });
  } else if (cell.code === 'IMG') {
    meshBox(token, 'decorative-panel', 6.5, 4.6, 0.18, new THREE.Vector3(0, 2.5, 0), 0xd7a72c, { emissive: 0x4b2705, emissiveIntensity: 0.48 });
  } else if (cell.code === 'PORTAL') {
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(2.3, 0.35, 8, 16),
      material(0x9d4dff, { emissive: 0x5b17a1, emissiveIntensity: 1.3, metalness: 0.28 })
    );
    portal.name = 'portal-marker';
    portal.rotation.x = Math.PI / 2;
    portal.position.y = 2.2;
    token.add(portal);
    meshCylinder(token, 'portal-core', 1.75, 1.75, 0.12, 16, new THREE.Vector3(0, 0.38, 0), 0x471e7c, { emissive: 0x6b26a4, emissiveIntensity: 1.1 });
  } else if (cell.code !== '.') {
    meshBox(token, 'generic-token', 4.2, 1.8, 4.2, new THREE.Vector3(0, 1.0, 0), new THREE.Color(blockColor(cell.code)).getHex(), { emissive: 0x151515, emissiveIntensity: 0.25 });
  }

  root.position.copy(worldCellPosition(x, y));
  return root;
}

function createMarker(color, opacity) {
  const marker = new THREE.Mesh(
    new THREE.PlaneGeometry(BLOCK_SIZE * 0.92, BLOCK_SIZE * 0.92),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.24;
  marker.visible = false;
  marker.renderOrder = 20;
  return marker;
}

function render3D() {
  if (!scene || !cellGroup) return;

  cellObjects.forEach(object => {
    cellGroup.remove(object);
    disposeObject(object);
  });
  cellObjects.clear();

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const visual = createCellVisual(grid[y][x], x, y);
      cellGroup.add(visual);
      cellObjects.set(`${x}:${y}`, visual);
    }
  }

  if (gridHelper) {
    scene.remove(gridHelper);
    disposeObject(gridHelper);
  }
  const gridSize = Math.max(W, H) * BLOCK_SIZE;
  gridHelper = new THREE.GridHelper(gridSize, Math.max(W, H), 0x697585, 0x303846);
  gridHelper.position.y = 0.205;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.68;
  scene.add(gridHelper);

  if (editPlane) {
    scene.remove(editPlane);
    disposeObject(editPlane);
  }
  editPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(W * BLOCK_SIZE, H * BLOCK_SIZE),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  editPlane.rotation.x = -Math.PI / 2;
  editPlane.position.y = 0.01;
  scene.add(editPlane);

  updateMarkers();
  updateViewportMeta();
}

function init3D() {
  const canvas = $('viewport');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090d14);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  camera.position.set(100, 110, 120);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x090d14, 1);

  scene.add(new THREE.HemisphereLight(0xb8d6ff, 0x20222d, 1.45));
  const keyLight = new THREE.DirectionalLight(0xffe7c1, 2.4);
  keyLight.position.set(100, 180, 90);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x638fff, 0.65);
  fillLight.position.set(-120, 80, -100);
  scene.add(fillLight);

  cellGroup = new THREE.Group();
  scene.add(cellGroup);
  selectionMarker = createMarker(0xffffff, 0.22);
  hoverMarker = createMarker(0xffb13d, 0.24);
  scene.add(selectionMarker, hoverMarker);

  orbitControls = new OrbitControls(camera, canvas);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.075;
  orbitControls.maxPolarAngle = Math.PI / 2.02;
  orbitControls.minDistance = 15;
  orbitControls.maxDistance = 1800;
  orbitControls.target.set(0, 0, 0);
  orbitControls.enabled = false;

  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', onViewportPointerDown);
  canvas.addEventListener('pointermove', onViewportPointerMove);
  canvas.addEventListener('pointerleave', () => {
    if (!painting) setHoverCell(null);
  });
  window.addEventListener('pointerup', onViewportPointerUp);
  window.addEventListener('resize', resizeRenderer);

  resizeRenderer();
  fitCamera();
  requestAnimationFrame(animate3D);
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const rect = $('viewport-wrap').getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate3D() {
  requestAnimationFrame(animate3D);
  orbitControls?.update();
  renderer?.render(scene, camera);
}

function fitCamera() {
  if (!camera || !orbitControls) return;
  const span = Math.max(W, H) * BLOCK_SIZE;
  const distance = Math.max(60, span * 1.28);
  camera.position.set(distance * 0.82, distance * 0.82, distance * 0.82);
  orbitControls.target.set(0, 0, 0);
  camera.far = Math.max(1000, span * 8);
  camera.updateProjectionMatrix();
  orbitControls.update();
  $('zoom').value = 58;
}

function applyZoomSlider() {
  if (!camera || !orbitControls) return;
  const normalized = (Number($('zoom').value) - 20) / 80;
  const span = Math.max(W, H) * BLOCK_SIZE;
  const distance = span * 1.8 - normalized * span * 1.5;
  const direction = camera.position.clone().sub(orbitControls.target).normalize();
  if (direction.lengthSq() < 0.001) direction.set(0.58, 0.58, 0.58).normalize();
  camera.position.copy(orbitControls.target).add(direction.multiplyScalar(Math.max(15, distance)));
  orbitControls.update();
}

function updateViewportMeta() {
  $('viewport-meta').textContent = `${$('map-name').value || 'mapa'} — ${W} × ${H} · ${W * H} celdas · escala ${BLOCK_SIZE}`;
}

function updateMarkers() {
  if (selectionMarker) {
    selectionMarker.visible = Boolean(sel);
    if (sel) selectionMarker.position.copy(worldCellPosition(sel.x, sel.y)).setY(0.24);
  }
  if (hoverMarker && hoverCell) {
    hoverMarker.position.copy(worldCellPosition(hoverCell.x, hoverCell.y)).setY(0.25);
    hoverMarker.visible = editorMode === 'edit';
  } else if (hoverMarker) {
    hoverMarker.visible = false;
  }
}

let hoverCell = null;
function setHoverCell(cell) {
  hoverCell = cell;
  const coordinates = $('viewport-coordinates');
  if (!cell) {
    coordinates.textContent = 'X: — · Z: —';
  } else {
    const world = worldCellPosition(cell.x, cell.y);
    coordinates.textContent = `Celda ${cell.x},${cell.y} · X: ${world.x.toFixed(0)} · Z: ${world.z.toFixed(0)}`;
  }
  updateMarkers();
}

function cellFromPointer(event) {
  if (!editPlane || !camera) return null;
  const rect = $('viewport').getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(editPlane, false)[0];
  if (!hit) return null;
  const x = Math.floor((hit.point.x + W * BLOCK_SIZE / 2) / BLOCK_SIZE);
  const y = Math.floor((hit.point.z + H * BLOCK_SIZE / 2) / BLOCK_SIZE);
  if (x < 0 || x >= W || y < 0 || y >= H) return null;
  return { x, y };
}

function onViewportPointerDown(event) {
  if (editorMode !== 'edit' || (event.button !== 0 && event.button !== 2)) return;
  event.preventDefault();
  $('viewport').focus();
  $('viewport').setPointerCapture?.(event.pointerId);
  painting = true;
  paintButton = event.button;
  const cell = cellFromPointer(event);
  if (!cell) return;
  setHoverCell(cell);
  if (tool === 'pick') {
    selectCell(cell.x, cell.y);
    copyCellToBrush(cell.x, cell.y);
    painting = false;
    return;
  }
  if (!historyPushedForStroke) {
    historyPushedForStroke = true;
    pushHistory();
  }
  paintCell(cell.x, cell.y, paintButton);
}

function onViewportPointerMove(event) {
  const cell = cellFromPointer(event);
  setHoverCell(cell);
  if (!painting || editorMode !== 'edit' || tool === 'pick' || !cell) return;
  paintCell(cell.x, cell.y, paintButton);
}

function onViewportPointerUp() {
  if (!painting && !historyPushedForStroke) return;
  painting = false;
  if (historyPushedForStroke) {
    pushHistory();
    historyPushedForStroke = false;
  }
}

function paintCell(x, y, button) {
  const nextCell = button === 2 ? blankCell() : brushToCell();
  if (JSON.stringify(grid[y][x]) === JSON.stringify(nextCell)) return;
  grid[y][x] = nextCell;
  render3D();
  selectCell(x, y);
}

function setEditorMode(mode) {
  editorMode = mode === 'orbit' ? 'orbit' : 'edit';
  orbitControls.enabled = editorMode === 'orbit';
  $('mode-edit').classList.toggle('active', editorMode === 'edit');
  $('mode-orbit').classList.toggle('active', editorMode === 'orbit');
  $('viewport-mode').textContent = editorMode === 'edit' ? 'EDITAR CELDAS' : 'NAVEGAR ESCENA';
  $('viewport-hint').textContent = editorMode === 'edit'
    ? 'Clic/arrastre pinta · clic derecho borra · selecciona una brocha en la izquierda'
    : 'Arrastra para orbitar · rueda para acercar · botón central para desplazar';
  updateMarkers();
}

// ---------- Inspector y brocha ----------
function selectCell(x, y) {
  if (!grid[y]?.[x]) return;
  sel = { x, y };
  const cell = grid[y][x];
  $('cell-info').textContent = `Celda (${x}, ${y}) → ${cellToken(cell)}`;
  $('cell-code').value = cell.code;
  $('cell-rotation').value = cell.rotation || 0;
  $('cell-max').value = cell.maxSpawns ?? '';
  $('cell-rate').value = cell.spawnRate ?? '';
  updateMarkers();
}

function copyCellToBrush(x, y) {
  const cell = grid[y][x];
  brush.code = cell.code;
  $('brush-rotation').value = cell.rotation || 0;
  $('brush-max').value = cell.maxSpawns ?? $('brush-max').value;
  $('brush-rate').value = cell.spawnRate ?? $('brush-rate').value;
  if (/^S\d*$/.test(cell.code)) {
    $('brush-spawner-id').value = cell.code.slice(1) || '1';
  }
  setTool('paint');
  updateBrushPreview();
  buildPalette($('palette-search').value);
  flashStatus(`Brocha ← ${cellToken(cell)}`);
}

function brushToCell() {
  let code = brush.code;
  if (code === 'S') code = `S${($('brush-spawner-id').value || '1').trim() || '1'}`;
  const rotation = ((Number($('brush-rotation').value) || 0) % 360 + 360) % 360;
  const cell = { code, rotation, maxSpawns: null, spawnRate: null };
  if (ENEMY_WITH_SPAWN.has(code)) {
    cell.maxSpawns = Math.max(1, Number($('brush-max').value) || 5);
    cell.spawnRate = Math.max(100, Number($('brush-rate').value) || 5000);
  }
  return cell;
}

function setTool(nextTool) {
  tool = nextTool === 'pick' ? 'pick' : 'paint';
  $('tool-paint').classList.toggle('active', tool === 'paint');
  $('tool-pick').classList.toggle('active', tool === 'pick');
}

// ---------- Tokens y formatos ----------
function cellToken(cell) {
  let token = cell.code === '' ? '.' : cell.code;
  if (cell.rotation) token += `[${cell.rotation}]`;
  if (cell.maxSpawns != null) token += `{${cell.maxSpawns}}`;
  if (cell.spawnRate != null) token += `<${cell.spawnRate}>`;
  return token;
}

function gridToTxt() {
  return grid.map(row => row.map(cell => `(${cellToken(cell)})`).join('')).join('\n');
}

function tokenToCell(raw) {
  const match = String(raw).match(/^(.+?)(?:\[(\d+)\])?(?:\{(\d+)\})?(?:<(\d+)>)?$/);
  if (!match) return blankCell();
  return {
    code: match[1] === '' ? '.' : match[1],
    rotation: match[2] ? parseInt(match[2], 10) : 0,
    maxSpawns: match[3] ? parseInt(match[3], 10) : null,
    spawnRate: match[4] ? parseInt(match[4], 10) : null,
  };
}

function parseTxtToGrid(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n').filter(line => line.trim() !== '');
  const parsed = lines.map(line => {
    const row = [];
    let index = 0;
    while (index < line.length) {
      if (line[index] === '(') {
        const end = line.indexOf(')', index);
        if (end !== -1) {
          row.push(tokenToCell(line.slice(index + 1, end)));
          index = end + 1;
          continue;
        }
      }
      index++;
    }
    return row;
  }).filter(row => row.length > 0);
  if (!parsed.length) throw new Error('TXT vacío o sin formato de celdas');
  const width = Math.max(...parsed.map(row => row.length));
  parsed.forEach(row => { while (row.length < width) row.push(blankCell()); });
  return parsed;
}

function gridToJson() {
  const name = ($('map-name').value || 'mi_mapa').trim() || 'mi_mapa';
  return {
    format: 'doom3d-map',
    version: 1,
    name,
    width: W,
    height: H,
    grid: grid.map(row => row.map(cell => {
      const value = { code: cell.code };
      if (cell.rotation) value.rotation = cell.rotation;
      if (cell.maxSpawns != null) value.maxSpawns = cell.maxSpawns;
      if (cell.spawnRate != null) value.spawnRate = cell.spawnRate;
      return value;
    })),
  };
}

function jsonToGrid(data) {
  if (!data || !Array.isArray(data.grid)) throw new Error('JSON inválido: falta "grid" (array de filas)');
  if (data.name) $('map-name').value = String(data.name).slice(0, 32);
  const parsed = data.grid.map(row => {
    if (typeof row === 'string') return parseTxtToGrid(row)[0] || [];
    if (!Array.isArray(row)) return [];
    return row.map(normalizeCell);
  });
  if (!parsed.length) throw new Error('JSON sin filas');
  return parsed;
}

// ---------- Archivos ----------
function safeName() {
  return (($('map-name').value || 'mi_mapa').trim() || 'mi_mapa')
    .replace(/[^\w\-áéíóúñ]+/gi, '_');
}

function download(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 500);
}

async function saveMapFile(extension, content, mime) {
  if (desktopApi?.saveMap) {
    const result = await desktopApi.saveMap({
      filename: `${safeName()}.${extension}`,
      content,
      mime,
    });
    if (result?.canceled) return;
    flashStatus(`Guardado en ${result?.filePath || 'el archivo seleccionado'} ✔`);
    return;
  }
  download(`${safeName()}.${extension}`, content, mime);
  flashStatus(`Guardado ${safeName()}.${extension} ✔`);
}

async function openMapFile(mode) {
  pendingFileMode = mode;
  if (desktopApi?.openMap) {
    const result = await desktopApi.openMap(mode);
    if (result?.canceled) return;
    const text = result?.content || '';
    if (mode === 'json' || result.filePath?.toLowerCase().endsWith('.json')) {
      setGrid(jsonToGrid(JSON.parse(text)));
    } else {
      setGrid(parseTxtToGrid(text));
    }
    flashStatus(`Cargado ${result.filePath || 'mapa'} ✔`);
    return;
  }
  $('file-input').accept = mode === 'json' ? '.json' : '.txt';
  $('file-input').click();
}

async function loadBundledMap(id) {
  if (desktopApi?.readBundledMap) {
    const result = await desktopApi.readBundledMap(id);
    if (result?.content) {
      if (result.extension === '.json') setGrid(jsonToGrid(JSON.parse(result.content)));
      else setGrid(parseTxtToGrid(result.content));
      return flashStatus(`Mapa "${id}" cargado desde el proyecto ✔`);
    }
  }

  const candidates = [`mapas/${id}.json`, `mapas/${id}.txt`, `${id}.json`, `${id}.txt`];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      if (url.endsWith('.json')) setGrid(jsonToGrid(await response.json()));
      else setGrid(parseTxtToGrid(await response.text()));
      return flashStatus(`Mapa "${url}" cargado ✔`);
    } catch {
      // Probar el siguiente formato/ruta.
    }
  }
  alert(`No se pudo cargar el mapa "${id}".`);
}

// ---------- Estadísticas y UI ----------
function updateStats() {
  const counts = {};
  grid.flat().forEach(cell => { counts[cell.code] = (counts[cell.code] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 16);
  $('stats').innerHTML = entries.map(([code, amount]) =>
    `<div class="row"><span style="color:${blockColor(code)}">■</span><span>${escapeHtml(code)} ${escapeHtml(blockName(code))}</span><b>${amount}</b></div>`
  ).join('') || '<span class="muted">Vacío</span>';
}

function updateValidation() {
  const players = grid.flat().filter(cell => cell.code === 'P').length;
  const validation = $('validation');
  if (players === 0) {
    validation.className = 'warn';
    validation.textContent = '⚠ Sin jugador (P): el juego usará el centro. Coloca una P.';
  } else if (players > 1) {
    validation.className = 'warn';
    validation.textContent = `⚠ Hay ${players} jugadores: el juego usará el último. Deja solo uno.`;
  } else {
    validation.className = 'ok';
    validation.textContent = '✔ Mapa válido: 1 jugador, listo para guardar o probar.';
  }
}

function render() {
  render3D();
  updateStats();
  updateValidation();
  updateViewportMeta();
}

function flashStatus(message) {
  const status = $('save-status');
  status.textContent = message;
  clearTimeout(flashStatus.timer);
  flashStatus.timer = setTimeout(() => { status.textContent = ''; }, 4500);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function getGameUrl() {
  return (localStorage.getItem(GAME_URL_KEY) || DEFAULT_GAME_URL).trim() || DEFAULT_GAME_URL;
}

function gameUrlForMap(name) {
  const url = new URL(getGameUrl(), location.href);
  url.searchParams.set('map', name);
  url.searchParams.set('autostart', '1');
  return url.toString();
}

function initGameUrlField() {
  const input = $('game-url');
  input.value = getGameUrl();
  $('back-link').href = getGameUrl();
  input.addEventListener('change', () => {
    const value = input.value.trim() || DEFAULT_GAME_URL;
    try {
      new URL(value, location.href);
      localStorage.setItem(GAME_URL_KEY, value);
      input.value = value;
      $('back-link').href = value;
      flashStatus('URL del juego guardada ✔');
    } catch {
      alert('URL del juego no válida');
      input.value = getGameUrl();
    }
  });
}

// ---------- Eventos de controles ----------
$('btn-new').onclick = () => {
  if (!confirm('¿Crear un mapa nuevo vacío? Se perderán los cambios no guardados.')) return;
  setGrid(newGrid(Number($('map-width').value) || 12, Number($('map-height').value) || 10));
};

$('btn-clear').onclick = () => {
  if (!confirm('¿Vaciar todo el mapa a suelo?')) return;
  setGrid(newGrid(W, H, '.'));
};

$('btn-borders').onclick = () => {
  for (let x = 0; x < W; x++) {
    grid[0][x] = { ...blankCell(), code: '#' };
    grid[H - 1][x] = { ...blankCell(), code: '#' };
  }
  for (let y = 0; y < H; y++) {
    grid[y][0] = { ...blankCell(), code: '#' };
    grid[y][W - 1] = { ...blankCell(), code: '#' };
  }
  pushHistory();
  render();
};

$('btn-resize').onclick = () => {
  const newWidth = Math.min(100, Math.max(5, Number($('map-width').value) || W));
  const newHeight = Math.min(100, Math.max(5, Number($('map-height').value) || H));
  const nextGrid = newGrid(newWidth, newHeight, '.');
  for (let y = 0; y < Math.min(H, newHeight); y++) {
    for (let x = 0; x < Math.min(W, newWidth); x++) nextGrid[y][x] = grid[y][x];
  }
  setGrid(nextGrid);
  fitCamera();
  flashStatus(`Mapa redimensionado a ${newWidth} × ${newHeight}`);
};

$('btn-undo').onclick = undo;
$('btn-redo').onclick = redo;
$('mode-edit').onclick = () => setEditorMode('edit');
$('mode-orbit').onclick = () => setEditorMode('orbit');
$('btn-reset-camera').onclick = fitCamera;
$('zoom').addEventListener('input', applyZoomSlider);
$('palette-search').addEventListener('input', event => buildPalette(event.target.value));
$('brush-rotation').addEventListener('input', () => {
  brush.rotation = Number($('brush-rotation').value) || 0;
  updateBrushPreview();
});
$('brush-spawner-id').addEventListener('input', () => {
  if (brush.code.startsWith('S')) selectBrush('S');
});
$('tool-paint').onclick = () => setTool('paint');
$('tool-pick').onclick = () => setTool('pick');
$('map-name').addEventListener('input', updateViewportMeta);

$('btn-apply-cell').onclick = () => {
  if (!sel) return flashStatus('Selecciona una celda primero');
  const nextCell = {
    code: ($('cell-code').value || '.').trim() || '.',
    rotation: ((Number($('cell-rotation').value) || 0) % 360 + 360) % 360,
    maxSpawns: $('cell-max').value === '' ? null : Math.max(1, Number($('cell-max').value)),
    spawnRate: $('cell-rate').value === '' ? null : Math.max(100, Number($('cell-rate').value)),
  };
  pushHistory();
  grid[sel.y][sel.x] = nextCell;
  render();
  selectCell(sel.x, sel.y);
};

$('btn-cell-to-brush').onclick = () => {
  if (sel) copyCellToBrush(sel.x, sel.y);
};

$('btn-load-json').onclick = () => openMapFile('json').catch(error => alert(`No se pudo cargar el JSON:\n${error.message}`));
$('btn-import-txt').onclick = () => openMapFile('txt').catch(error => alert(`No se pudo cargar el TXT:\n${error.message}`));
$('btn-save-json').onclick = () => saveMapFile('json', JSON.stringify(gridToJson(), null, 2), 'application/json').catch(error => alert(`No se pudo guardar el JSON:\n${error.message}`));
$('btn-export-txt').onclick = () => saveMapFile('txt', `${gridToTxt()}\n`, 'text/plain').catch(error => alert(`No se pudo guardar el TXT:\n${error.message}`));
$('btn-load-game-map').onclick = () => loadBundledMap($('game-map-select').value).catch(error => alert(`No se pudo cargar el mapa:\n${error.message}`));

$('file-input').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    if (pendingFileMode === 'json' || file.name.toLowerCase().endsWith('.json')) setGrid(jsonToGrid(JSON.parse(text)));
    else setGrid(parseTxtToGrid(text));
    flashStatus(`Cargado ${file.name} ✔`);
  } catch (error) {
    alert(`No se pudo cargar el fichero:\n${error.message}`);
  }
});

$('btn-play').onclick = () => {
  const data = gridToJson();
  try {
    sessionStorage.setItem('doom3d_custom_map', JSON.stringify(data));
    localStorage.setItem('doom3d_custom_map', JSON.stringify(data));
  } catch {
    // El mapa también se puede guardar manualmente con Guardar JSON.
  }
  download(`${safeName()}.json`, JSON.stringify(data, null, 2));
  window.open(gameUrlForMap(safeName()), '_blank');
  flashStatus(`Exportado ${safeName()}.json para probarlo en el juego`);
};

document.addEventListener('keydown', event => {
  if (event.target.matches('input, select, textarea')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo();
  } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
    event.preventDefault();
    redo();
  } else if (event.key.toLowerCase() === 'b') {
    setTool(tool === 'paint' ? 'pick' : 'paint');
  } else if (event.key.toLowerCase() === 'n') {
    setEditorMode(editorMode === 'edit' ? 'orbit' : 'edit');
  }
});

// ---------- Arranque ----------
init3D();
buildPalette();
updateBrushPreview();
initGameUrlField();
setGrid(newGrid(12, 10, '.'));
setEditorMode('edit');
flashStatus(desktopApi ? 'Editor 3D Electron listo ✔' : 'Editor 3D listo ✔');
