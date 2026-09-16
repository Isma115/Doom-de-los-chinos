// Modo Construcción: herramienta sin sprite para editar el mapa en tiempo
// real mientras se juega. Mapeo acordado: clic IZQUIERDO recoge el objeto
// bajo la cruceta a estado "preview" (fantasma que sigue al punto de mira),
// clic DERECHO coloca el objeto y autogarda el mapa. Flechas con preview:
// ←/→ rotan Y, ↑/↓ suben/bajan altura (props e items; muros van al suelo).
// La rueda (y, como atajo, N/B) recorre el catálogo para añadir objetos
// nuevos, Supr borra y Esc/X cancela el preview.
import * as THREE from 'three';
import { CONFIG } from '../../data/config.js';

// Catálogo para añadir objetos nuevos. Los de rejilla se colocan por celda
// (.txt); los props son libres (modelos/*.json).
export const BUILD_GRID_CATALOG = [
    { kind: 'grid', base: '#', label: 'Muro' },
    { kind: 'grid', base: 'B', label: 'Arbusto' },
    { kind: 'grid', base: 'L', label: 'Ladrillo' },
    { kind: 'grid', base: 'D', label: 'Puerta' },
    { kind: 'grid', base: '+', label: 'Comida' },
    { kind: 'grid', base: 'MA', label: 'Munición ametralladora' },
    { kind: 'grid', base: 'MP', label: 'Munición pistola' }
];

export const BUILD_PROP_CATALOG = [
    {
        kind: 'prop', label: 'Caja',
        template: { type: 'crate', width: 4, height: 3, depth: 4, collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Panel',
        template: { type: 'square', width: 6, height: 6, rotationX: 0, collision: false, bulletImpact: true, billboard: false }
    },
    {
        kind: 'prop', label: 'Estantería',
        template: { type: 'hormiguero_prop', variant: 'warehouse_rack', width: 7, height: 8, depth: 2.5, shelfLevels: 3, collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Palé',
        template: { type: 'hormiguero_prop', variant: 'warehouse_pallet', width: 6, depth: 4, collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Cámara TV',
        template: { type: 'hormiguero_prop', variant: 'studio_camera', width: 3.4, height: 5.4, depth: 2.5, collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Monitor',
        template: { type: 'hormiguero_prop', variant: 'studio_monitor', width: 3.6, height: 3.3, depth: 0.55, collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Fuente',
        template: { type: 'fountain', width: 7, height: 3.2, depth: 7, collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Macetero',
        template: { type: 'flower_pot_3d', width: 8.5, height: 3.5, depth: 2.4, texture: 'assets/textures/park/park_flower_pot.png', collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Columpio',
        template: { type: 'swing', width: 8, height: 6.5, depth: 3.8, collisionCubeSize: 6.5, seatWidth: 2.6, seatDepth: 0.75, seatHeight: 2.1, texture: 'assets/textures/park/park_swing.png', collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Árbol de parque',
        template: { type: 'square', width: 8.5, height: 12.5, position: { x: 0, y: 5.8, z: 0 }, texture: 'assets/textures/park/park_tree.png', collisionWidth: 1, collisionHeight: 3, collisionDepth: 1, collisionBottom: 0, collision: true, bulletImpact: true, billboard: true }
    },
    {
        kind: 'prop', label: 'Mesa de picnic',
        template: { type: 'square', width: 8, height: 4.5, position: { x: 0, y: 1.35, z: 0 }, texture: 'assets/textures/park/park_picnic_table.png', collision: true, bulletImpact: true, billboard: false }
    },
    {
        kind: 'prop', label: 'Castillo de arena',
        template: { type: 'square', width: 3, height: 2.8, position: { x: 0, y: 0.72, z: 0 }, texture: 'assets/textures/park/park_sandcastle.png', collision: false, bulletImpact: false, billboard: false }
    },
    {
        kind: 'prop', label: 'Conducto de ventilación',
        template: { type: 'vent_duct', length: 60, width: 10, ceilingY: 3.2, collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Reja de ventilación',
        template: { type: 'vent_grate', collision: false, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Esquina de conducto',
        template: { type: 'hormiguero_prop', variant: 'vent_corner', width: 10, ceilingY: 3.2, collision: true, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Escalera de conducto',
        template: { type: 'hormiguero_prop', variant: 'vent_ladder', width: 3.4, height: 7.2, collision: false, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Foco de estudio',
        template: { type: 'hormiguero_prop', variant: 'studio_softbox', width: 3.1, height: 7.6, depth: 1.5, collision: false, bulletImpact: true }
    },
    {
        kind: 'prop', label: 'Rótulo exterior',
        template: { type: 'hormiguero_prop', variant: 'facade_sign', width: 92, height: 11, collision: false, bulletImpact: true }
    }
];

export const BUILD_CATALOG = [...BUILD_GRID_CATALOG, ...BUILD_PROP_CATALOG];

const ROTATE_STEP = 15;
const ROTATE_STEP_FINE = 1;
const LIFT_STEP = 0.5;
const LIFT_STEP_FINE = 0.1;
const REACH_DISTANCE = 80;

function isGridGrounded(record, template) {
    const base = record?.base ?? template?.base;
    return base === '#' || base === 'B' || base === 'L' || base === 'D';
}

export class ConstructionMode {
    constructor({ scene, camera, world, player }) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;
        this.player = player;
        this.raycaster = new THREE.Raycaster();
        this.center = new THREE.Vector2(0, 0);
        this.preview = null; // { holder, record, isNew, template, yawDeg, lift, ... }
        this.catalogIndex = 0;
        this.catalog = this.buildCatalog();
        this.textureLoader = new THREE.TextureLoader();
        this.saveTimer = null;
        this.saving = false;
        this.saveStatus = '';
        this.hud = null;
        this.statusMessage = '';
        this.statusTimeout = null;
        this.disposed = false;
        // Transiciones de herramienta: al activar se entra en god-mode y se
        // pausa el combate; al salir se restaura todo.
        this.wasActive = false;
        this.prevGodMode = null;
        this.onContextMenu = (e) => {
            if (this.isActive()) e.preventDefault();
        };
        if (typeof document !== 'undefined') {
            document.addEventListener('contextmenu', this.onContextMenu);
        }
        this.ensureHud();
    }

    dispose() {
        this.disposed = true;
        // Si se destruye con la herramienta puesta, restaurar god-mode.
        if (this.wasActive) {
            try {
                if (this.prevGodMode !== null && this.player?.debugState) {
                    this.player.debugState.godMode = this.prevGodMode;
                }
            } catch { /* noop */ }
            this.wasActive = false;
            this.prevGodMode = null;
        }
        if (typeof document !== 'undefined') {
            document.removeEventListener('contextmenu', this.onContextMenu);
            this.hud?.remove?.();
        }
        this.hud = null;
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = null;
        if (this.statusTimeout) clearTimeout(this.statusTimeout);
        this.statusTimeout = null;
    }

    setWorld(world) {
        this.world = world;
        this.catalog = this.buildCatalog();
        if (this.preview) this.cancelPreview();
        this.updateHud();
    }

    // Combina los objetos procedurales con las variantes que realmente trae
    // el mapa actual. Así la rueda también ofrece árboles, bancos OBJ y
    // cualquier prop adicional definido en modelos/<mapa>_models.json.
    buildCatalog() {
        const catalog = [...BUILD_CATALOG];
        const signatures = new Set(
            catalog
                .filter(entry => entry.kind === 'prop')
                .map(entry => this.catalogSignature(entry.template))
        );
        const models = Array.isArray(this.world?.propModels)
            ? this.world.propModels
            : [];

        models.forEach((source, sourceIndex) => {
            if (!source || source.type === 'hormiguero_set' || source.type === 'hormiguero_secret_room') return;
            const template = {
                ...source,
                position: {
                    x: 0,
                    y: source.position?.y ?? 0,
                    z: 0
                },
                rotation: 0,
                rotationY: 0,
                sourceModelId: source.id || null,
                sourceModelIndex: sourceIndex
            };
            const signature = this.catalogSignature(template);
            if (signatures.has(signature)) return;
            signatures.add(signature);
            catalog.push({
                kind: 'prop',
                label: `Objeto: ${source.id || source.variant || source.type || 'modelo'}`,
                template
            });
        });
        return catalog;
    }

    catalogSignature(template = {}) {
        const {
            id, position, rotation, rotationY, sourceModelId, sourceModelIndex,
            ...stableTemplate
        } = template;
        void id;
        void position;
        void rotation;
        void rotationY;
        void sourceModelId;
        void sourceModelIndex;
        return JSON.stringify(stableTemplate);
    }

    getCatalog() {
        if (!Array.isArray(this.catalog) || this.catalog.length === 0) {
            this.catalog = this.buildCatalog();
        }
        return this.catalog;
    }

    isActive() {
        try {
            const weapon = this.player?.weaponSystem?.getCurrentWeapon?.();
            return Boolean(weapon?.isConstruction || weapon?.isTool);
        } catch {
            return false;
        }
    }

    isPreviewing() {
        return Boolean(this.preview?.holder || this.preview?.template);
    }

    // #region Entrada: teclado
    // Devuelve true si la tecla queda consumida por construcción (Player no
    // debe mover ni recargar en ese caso).
    handleKey(event, isDown) {
        if (!this.isActive()) return false;
        const code = event?.code;
        if (!code) return false;

        // R recarga: desactivada con la herramienta.
        if (code === 'KeyR') return true;

        if (code === 'Delete' || code === 'Backspace') {
            if (isDown) this.deleteAction();
            if (event.cancelable) event.preventDefault();
            return true;
        }
        if (code === 'Escape' || code === 'KeyX') {
            if (isDown) this.cancelPreview();
            return true;
        }
        if (code === 'KeyN') {
            if (isDown) this.cycleCatalog(event.shiftKey ? -1 : 1);
            return true;
        }
        if (code === 'KeyB') {
            if (isDown) this.cycleCatalog(-1);
            return true;
        }

        // Flechas: solo editan cuando hay preview; si no, mueven al jugador.
        if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
            if (!this.isPreviewing()) return false;
            if (isDown) this.handleArrow(code, event.shiftKey);
            if (event.cancelable) event.preventDefault();
            return true;
        }
        return false;
    }

    handleArrow(code, fine) {
        const preview = this.preview;
        if (!preview) return;
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
            const step = fine ? ROTATE_STEP_FINE : ROTATE_STEP;
            preview.yawDeg = (preview.yawDeg + (code === 'ArrowRight' ? step : -step)) % 360;
            if (preview.yawDeg > 180) preview.yawDeg -= 360;
            if (preview.yawDeg <= -180) preview.yawDeg += 360;
            if (preview.holder) {
                preview.holder.rotation.y = THREE.MathUtils.degToRad(preview.yawDeg);
                preview.holder.updateMatrixWorld(true);
            }
        } else {
            // ↑/↓: altura solo para props e items; muros/puertas van al suelo.
            if (isGridGrounded(preview.record, preview.template)) {
                this.flashStatus('Los muros y puertas van fijos al suelo');
                return;
            }
            const step = fine ? LIFT_STEP_FINE : LIFT_STEP;
            preview.lift = Math.max(0, (preview.lift || 0) + (code === 'ArrowUp' ? step : -step));
        }
        this.updateHud();
    }
    // #endregion

    // #region Entrada: ratón (izq recoge, der coloca)
    handleMouseButton(button) {
        if (!this.isActive()) return;
        if (button === 0) this.pickAction();
        else if (button === 2) this.placeAction();
    }

    handleWheel(deltaY) {
        if (!this.isActive() || !Number.isFinite(deltaY) || deltaY === 0) return false;
        this.cycleCatalog(deltaY > 0 ? 1 : -1);
        return true;
    }

    pickAction() {
        if (!this.isActive()) return;
        if (this.isPreviewing()) {
            this.flashStatus('Ya llevas un objeto: colócalo (clic der.) o cancela (Esc)');
            return;
        }
        const hit = this.pickEditableUnderCrosshair();
        if (!hit) {
            this.flashStatus('Sin objeto: apunta a un muro, item o prop');
            return;
        }
        this.enterPreviewExisting(hit.holder, hit.record);
        this.flashStatus(`Editando: ${hit.record.label || hit.record.base || hit.record.id || 'objeto'}`);
    }

    placeAction() {
        if (!this.isActive() || !this.isPreviewing()) return;
        const preview = this.preview;
        if (preview.template && !preview.holder) {
            this.placeCatalogGhost();
            return;
        }
        this.commitPreview();
    }

    deleteAction() {
        if (!this.isActive()) return;
        if (this.preview?.holder && !this.preview?.isNew) {
            const label = this.preview.record?.label || this.preview.record?.base || 'objeto';
            this.detachPreviewVisuals(false);
            this.world.removeEditableObject(this.preview.holder);
            this.preview = null;
            this.flashStatus(`Eliminado: ${label} (guardando…)`);
            this.updateHud();
            this.scheduleSave();
            return;
        }
        if (this.preview?.isNew) {
            this.cancelPreview();
            return;
        }
        const hit = this.pickEditableUnderCrosshair();
        if (!hit) {
            this.flashStatus('Nada que borrar bajo la cruceta');
            return;
        }
        const label = hit.record?.label || hit.record?.base || 'objeto';
        this.world.removeEditableObject(hit.holder);
        this.flashStatus(`Eliminado: ${label} (guardando…)`);
        this.updateHud();
        this.scheduleSave();
    }

    cycleCatalog(direction) {
        if (!this.isActive()) return;
        if (this.preview?.holder && !this.preview.isNew) {
            this.flashStatus('Coloca o cancela el objeto actual antes de cambiar');
            return;
        }
        // Cambiar con la rueda siempre debe liberar el fantasma anterior,
        // incluidos los props nuevos que ya tienen un holder real.
        if (this.preview?.isNew) this.cancelPreviewSilent();
        const catalog = this.getCatalog();
        this.catalogIndex = (this.catalogIndex + direction + catalog.length) % catalog.length;
        const entry = catalog[this.catalogIndex];
        this.preview = {
            holder: null,
            record: null,
            isNew: true,
            template: entry,
            yawDeg: 0,
            lift: entry.kind === 'prop' ? 0 : 0,
            ghost: this.makeGridGhost(entry)
        };
        if (entry.kind === 'prop') {
            // El fantasma de prop es el objeto real (registrado pero sin
            // colisión y translúcido) para previsualizar el resultado final.
            this.spawnPropGhost(entry);
        } else if (this.preview.ghost && this.scene) {
            this.scene.add(this.preview.ghost);
        }
        this.flashStatus(`Nuevo: ${entry.label} (clic der. para colocar, Esc para cancelar)`);
        this.updateHud();
    }
    // #endregion

    // #region Pick / preview
    pickEditableUnderCrosshair() {
        if (!this.world || !this.camera) return null;
        const objects = this.world.getEditableObjects();
        if (!objects.length) return null;
        this.camera.updateMatrixWorld(true);
        this.raycaster.setFromCamera(this.center, this.camera);
        this.raycaster.far = REACH_DISTANCE;
        const hits = this.raycaster.intersectObjects(objects, true);
        for (const hit of hits) {
            const found = this.world.getEditableRecord(hit.object);
            if (found?.holder && found?.record) return { ...found, point: hit.point };
            // Ignorar impactos en hijos no registrados (p. ej. set completo).
        }
        return null;
    }

    enterPreviewExisting(holder, record) {
        const yawDeg = record.kind === 'prop'
            ? (THREE.MathUtils.radToDeg(holder.rotation.y) || 0)
            : (record.rotation || 0);
        this.preview = {
            holder,
            record,
            isNew: false,
            template: null,
            yawDeg,
            lift: 0,
            baseY: holder.position.y,
            originalPosition: holder.position.clone(),
            originalRotationY: holder.rotation.y,
            wasInWalls: this.world.walls?.includes(holder) || false,
            wasInStatic: this.world.staticModels?.includes(holder) || false,
            storedMaterials: []
        };
        // Sacar de colisión para poder atravesar el fantasma y que el rayo
        // de apuntado no choque contra sí mismo.
        if (this.preview.wasInWalls) {
            const i = this.world.walls.indexOf(holder);
            if (i >= 0) this.world.walls.splice(i, 1);
        }
        if (this.preview.wasInStatic) {
            const i = this.world.staticModels.indexOf(holder);
            if (i >= 0) this.world.staticModels.splice(i, 1);
        }
        this.applyGhostLook(holder, this.preview);
        if (record.kind === 'prop') {
            this.preview.lift = 0;
            this.preview.baseY = holder.position.y;
        }
        this.updateHud();
    }

    applyGhostLook(holder, preview) {
        preview.storedMaterials = [];
        holder.traverse?.((child) => {
            if (!child?.isMesh && !child?.isSprite) return;
            preview.storedMaterials.push({ obj: child, material: child.material });
            const ghost = child.material?.clone?.() || child.material;
            if (ghost) {
                ghost.transparent = true;
                ghost.opacity = 0.55;
                ghost.depthWrite = false;
                if (ghost.emissive) {
                    ghost.emissive = ghost.emissive.clone?.() || ghost.emissive;
                    ghost.emissive.setHex?.(0x1a5c1a);
                    ghost.emissiveIntensity = 0.55;
                }
            }
            child.material = ghost;
        });
        // Sprites y grupos sin traverse útil (THREE.Group sí tiene traverse).
        if ((holder.isSprite || holder.isMesh) && preview.storedMaterials.length === 0) {
            preview.storedMaterials.push({ obj: holder, material: holder.material });
            const ghost = holder.material?.clone?.();
            if (ghost) {
                ghost.transparent = true;
                ghost.opacity = 0.55;
                ghost.depthWrite = false;
            }
            holder.material = ghost || holder.material;
        }
    }

    detachPreviewVisuals(restoreCollision) {
        const preview = this.preview;
        if (!preview?.holder) return;
        const holder = preview.holder;
        (preview.storedMaterials || []).forEach(({ obj, material }) => {
            if (obj) {
                // Liberar el material fantasma clonado.
                if (obj.material && obj.material !== material) obj.material.dispose?.();
                obj.material = material;
            }
        });
        preview.storedMaterials = [];
        if (restoreCollision) {
            if (preview.wasInWalls && !this.world.walls.includes(holder)) this.world.walls.push(holder);
            if (preview.wasInStatic && !this.world.staticModels.includes(holder)) this.world.staticModels.push(holder);
        }
    }

    cancelPreview() {
        const preview = this.preview;
        if (!preview) return;
        if (preview.holder && !preview.isNew) {
            this.detachPreviewVisuals(false);
            preview.holder.position.copy(preview.originalPosition);
            preview.holder.rotation.y = preview.originalRotationY;
            preview.holder.updateMatrixWorld(true);
            this.world.refreshColliderFor?.(preview.holder);
            if (preview.wasInWalls && !this.world.walls.includes(preview.holder)) {
                this.world.walls.push(preview.holder);
            }
            if (preview.wasInStatic && !this.world.staticModels.includes(preview.holder)) {
                this.world.staticModels.push(preview.holder);
            }
        } else if (preview.holder && preview.isNew) {
            // Fantasma de prop nuevo: eliminarlo sin guardar.
            this.detachPreviewVisuals(false);
            this.world.removeEditableObject(preview.holder);
        } else if (preview.ghost && preview.ghost.parent) {
            preview.ghost.parent.remove(preview.ghost);
            preview.ghost.geometry?.dispose?.();
            preview.ghost.material?.dispose?.();
        }
        this.preview = null;
        this.flashStatus('Edición cancelada');
        this.updateHud();
    }

    clearTemplateGhost() {
        const preview = this.preview;
        if (preview?.ghost?.parent) {
            preview.ghost.parent.remove(preview.ghost);
            preview.ghost.geometry?.dispose?.();
            preview.ghost.material?.dispose?.();
        }
    }
    // #endregion

    // #region Fantasmas de catálogo
    makeGridGhost(entry) {
        if (!entry || entry.kind !== 'grid') return null;
        const blockSize = CONFIG.BLOCK_SIZE || 10;
        const heights = { '#': blockSize, B: blockSize * 0.5, L: blockSize * 0.6, D: blockSize, '+': 1, MA: 1, MP: 1 };
        const h = heights[entry.base] ?? 2;
        const geo = new THREE.BoxGeometry(blockSize * 0.98, Math.max(0.5, h), blockSize * 0.98);
        const mat = new THREE.MeshBasicMaterial({ color: 0x35d05a, transparent: true, opacity: 0.45, depthWrite: false });
        const ghost = new THREE.Mesh(geo, mat);
        ghost.userData.isBuildGhost = true;
        return ghost;
    }

    spawnPropGhost(entry) {
        const template = entry.template || {};
        const { sourceModelId = null, sourceModelIndex = null, ...modelTemplate } = template;
        const yawDeg = this.preview?.yawDeg || 0;
        const target = this.aimPoint(new THREE.Vector3());
        const model = {
            ...modelTemplate,
            id: `build_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`,
            position: { x: target.x, y: template.position?.y ?? 0, z: target.z },
            rotationY: yawDeg
        };
        this.world.propModels.push(model);
        const modelIndex = this.world.propModels.length - 1;
        let holder = null;
        try {
            if (model.type === 'crate' || model.type === 'caja') holder = this.world.createCrateProp(model);
            else if (model.type === 'square' || model.type === 'cuadrado') holder = this.createSquareForConstruction(model);
            else if (model.type === 'hormiguero_prop' || model.type === 'map2_prop') holder = this.world.createHormigueroProp(model);
            else if (model.type === 'vent_duct' || model.type === 'conducto') holder = this.world.createVentDuctProp(model);
            else if (model.type === 'vent_grate' || model.type === 'reja') holder = this.world.createVentGrateProp(model);
            else if (model.type === 'fountain' || model.type === 'fuente') holder = this.world.createFountainProp(model);
            else if (model.type === 'flower_pot' || model.type === 'flower_pot_3d' || model.type === 'maceta_3d') {
                holder = this.world.createFlowerPotProp(model, this.textureLoader);
            } else if (model.type === 'swing' || model.type === 'columpio') {
                holder = this.world.createSwingProp(model, this.textureLoader);
            } else {
                // OBJ/3DS y cualquier tipo adicional del mapa se clona desde
                // su instancia cargada para que también estén disponibles.
                holder = this.cloneLoadedProp(sourceModelId, sourceModelIndex, model);
            }
        } catch (err) {
            console.error('[Construcción] No se pudo previsualizar el prop:', err);
        }
        if (!holder) {
            this.world.propModels.splice(modelIndex, 1);
            this.preview.holder = null;
            this.preview.ghost = this.makeGridGhost({ kind: 'grid', base: '#' });
            if (this.preview.ghost) this.scene.add(this.preview.ghost);
            return;
        }
        this.world.registerPropEditable(holder, modelIndex);
        const record = this.world.editableRegistry.get(holder);
        if (record && this.preview?.template?.label) {
            record.label = this.preview.template.label;
        }
        this.preview.holder = holder;
        this.preview.record = record;
        this.preview.baseY = holder.position.y;
        this.preview.lift = 0;
        this.preview.wasInWalls = this.world.walls?.includes(holder) || false;
        this.preview.wasInStatic = this.world.staticModels?.includes(holder) || false;
        if (this.preview.wasInWalls) this.world.walls.splice(this.world.walls.indexOf(holder), 1);
        if (this.preview.wasInStatic) this.world.staticModels.splice(this.world.staticModels.indexOf(holder), 1);
        this.preview.storedMaterials = [];
        this.applyGhostLook(holder, this.preview);
    }

    cloneLoadedProp(sourceModelId, sourceModelIndex, model) {
        if (!this.world || !this.scene) return null;
        const models = this.world.propModels || [];
        let index = sourceModelId
            ? models.findIndex(candidate => candidate?.id === sourceModelId)
            : -1;
        if (index < 0 && Number.isInteger(sourceModelIndex)) index = sourceModelIndex;
        if (index < 0) return null;

        const sourceEntry = [...(this.world.editableRegistry?.entries?.() || [])]
            .find(([, record]) => record?.kind === 'prop' && record.modelIndex === index);
        const sourceHolder = sourceEntry?.[0];
        if (!sourceHolder) return null;

        const holder = sourceHolder.clone(true);
        holder.name = model.id;
        holder.userData = { ...(sourceHolder.userData || {}) };
        if (sourceHolder.userData?.boundingBox?.clone) {
            holder.userData.boundingBox = sourceHolder.userData.boundingBox.clone();
        }
        const position = model.position || { x: 0, y: 0, z: 0 };
        holder.position.set(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0);
        holder.rotation.order = model.rotationOrder || sourceHolder.rotation.order || 'XYZ';
        holder.rotation.x = THREE.MathUtils.degToRad(Number(model.rotationX) || 0);
        holder.rotation.y = THREE.MathUtils.degToRad(
            model.rotationY !== undefined ? Number(model.rotationY) : Number(model.rotation) || 0
        );
        holder.rotation.z = THREE.MathUtils.degToRad(Number(model.rotationZ) || 0);
        holder.scale.setScalar(Number(model.scale) || 1);
        this.scene.add(holder);
        holder.updateMatrixWorld(true);

        const wasInWalls = this.world.walls?.includes(sourceHolder);
        const wasInStatic = this.world.staticModels?.includes(sourceHolder);
        const wasDecorative = this.world.decorativeMeshes?.includes(sourceHolder);
        if (model.collision !== false && (wasInWalls || sourceHolder.userData?.isStatic)) {
            this.world.walls.push(holder);
        }
        if (wasInStatic) this.world.staticModels.push(holder);
        if (model.collision === false || wasDecorative) this.world.decorativeMeshes.push(holder);
        this.world.refreshColliderFor?.(holder);
        return holder;
    }

    createSquareForConstruction(model) {
        // Réplica ligera del builder de World para squares de catálogo.
        const width = Number(model.width) || 6;
        const height = Number(model.height) || 6;
        const geometry = new THREE.PlaneGeometry(width, height);
        const rotationX = Number(model.rotationX) || 0;
        const isGroundPlane = model.groundPlane === true || Math.abs(Math.abs(rotationX) - 90) < 0.001;
        let texture = null;
        if (model.texture) {
            texture = this.textureLoader.load(
                model.texture,
                () => { },
                undefined,
                () => { texture = null; }
            );
            texture.colorSpace = THREE.SRGBColorSpace;
        }
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: model.color !== undefined ? Number(model.color) : 0x9fd08a,
            side: THREE.DoubleSide,
            transparent: !isGroundPlane,
            opacity: isGroundPlane ? 1 : 0.9,
            depthWrite: true,
            polygonOffset: isGroundPlane,
            polygonOffsetFactor: isGroundPlane ? -4 : 0,
            polygonOffsetUnits: isGroundPlane ? -4 : 0
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(model.position?.x || 0, model.position?.y ?? 1, model.position?.z || 0);
        mesh.rotation.x = THREE.MathUtils.degToRad(rotationX);
        mesh.rotation.y = THREE.MathUtils.degToRad(model.rotationY || 0);
        mesh.rotation.z = THREE.MathUtils.degToRad(Number(model.rotationZ) || 0);
        mesh.userData = {
            isDecorative: true,
            type: 'square',
            bulletImpact: model.bulletImpact !== false,
            bulletImpactFallback: model.collision !== false,
            billboard: model.billboard === true,
            isGroundPlane
        };
        this.scene.add(mesh);
        mesh.updateMatrixWorld(true);
        if (model.collision !== false) {
            const colliderWidth = Math.max(0.5, Number(model.collisionWidth) || width);
            const colliderHeight = Math.max(1, Number(model.collisionHeight) || height);
            const colliderDepth = Math.max(0.5, Number(model.collisionDepth) || Math.min(width, height) * 0.25);
            const collisionBottom = Number.isFinite(Number(model.collisionBottom))
                ? Number(model.collisionBottom)
                : mesh.position.y - colliderHeight / 2;
            mesh.userData.simpleBoxCollider = true;
            mesh.userData.collisionBoxSize = { width: colliderWidth, height: colliderHeight, depth: colliderDepth };
            mesh.userData.boundingBox = new THREE.Box3(
                new THREE.Vector3(mesh.position.x - colliderWidth / 2, collisionBottom, mesh.position.z - colliderDepth / 2),
                new THREE.Vector3(mesh.position.x + colliderWidth / 2, collisionBottom + colliderHeight, mesh.position.z + colliderDepth / 2)
            );
            mesh.userData.isStatic = true;
            this.world.walls.push(mesh);
            this.world.staticModels.push(mesh);
        } else {
            this.world.decorativeMeshes.push(mesh);
        }
        return mesh;
    }

    placeCatalogGhost() {
        const preview = this.preview;
        const entry = preview?.template;
        if (!entry) return;
        if (entry.kind === 'grid') {
            const ghost = preview.ghost;
            if (!ghost) return;
            const cell = this.world.worldToGridCell(ghost.position);
            if (!cell) {
                this.flashStatus('Fuera del mapa');
                return;
            }
            const holder = this.world.addGridEditableAtCell(entry.base, cell.x, cell.y, preview.yawDeg || 0);
            if (!holder) {
                this.flashStatus(this.blockedMessage(this.world.lastPlaceBlocked));
                return;
            }
            this.flashStatus(this.placedMessage(this.world.lastCellCleared));
            this.scheduleSave();
            this.updateHud();
            return;
        }
        // Prop nuevo: el holder ya existe; se consolida y se encadena otro.
        this.commitPreview({ chainNew: true });
    }
    // #endregion

    // Sincroniza transiciones de herramienta (god-mode + pausa). Se llama
    // cada frame y también al cambiar de arma para que sea inmediato.
    syncToolState() {
        if (this.disposed) return;
        const active = this.isActive();
        if (active && !this.wasActive) this.onActivateTool();
        if (!active && this.wasActive) this.onDeactivateTool();
        this.wasActive = active;
    }

    // #region Activación: god-mode + pausa de combate
    // Descripción: mientras la herramienta está seleccionada el jugador es
    // inmortal y GameLoop congela oleadas/enemigos para construir tranquilo.
    onActivateTool() {
        try {
            this.prevGodMode = Boolean(this.player?.debugState?.godMode);
            if (this.player?.debugState) this.player.debugState.godMode = true;
            const panel = this.player?.gameInstance?.debugPanel;
            if (panel?.debugState) panel.debugState.godMode = true;
            const checkbox = typeof document !== 'undefined'
                ? document.getElementById('debug-god-mode')
                : null;
            if (checkbox) checkbox.checked = true;
        } catch { /* noop */ }
        this.flashStatus('🛡 God mode + enemigos en pausa: construye tranquilo');
        this.updateHud();
    }

    onDeactivateTool() {
        this.cancelPreviewSilent();
        if (this.player) this.player.buildFlyHeld = false;
        try {
            if (this.prevGodMode !== null && this.player?.debugState) {
                this.player.debugState.godMode = this.prevGodMode;
            }
            const panel = this.player?.gameInstance?.debugPanel;
            if (panel?.debugState && this.prevGodMode !== null) {
                panel.debugState.godMode = this.prevGodMode;
            }
            const checkbox = typeof document !== 'undefined'
                ? document.getElementById('debug-god-mode')
                : null;
            if (checkbox && this.prevGodMode !== null) checkbox.checked = this.prevGodMode;
        } catch { /* noop */ }
        this.prevGodMode = null;
        this.updateHud();
    }
    // #endregion

    // #region Colocar / frame
    commitPreview({ chainNew = false } = {}) {
        const preview = this.preview;
        if (!preview?.holder || !preview?.record) return;
        const { holder, record } = preview;

        if (record.kind === 'grid' && !preview.isNew) {
            const cell = this.world.worldToGridCell(holder.position);
            if (!cell) {
                this.flashStatus('Fuera del mapa');
                return;
            }
            this.detachPreviewVisuals(false);
            const ok = this.world.moveGridEditableToCell(holder, record, cell.x, cell.y, preview.yawDeg || 0);
            if (!ok) {
                // Devolver a su celda original para no perder el objeto.
                this.world.moveGridEditableToCell(holder, record, record.cellX, record.cellY, record.rotation || 0);
                this.applyGhostLook(holder, preview);
                this.flashStatus(this.blockedMessage(this.world.lastPlaceBlocked));
                this.updateHud();
                return;
            }
            if (!this.world.walls.includes(holder) && (record.base === '#' || record.base === 'B' || record.base === 'L')) {
                this.world.walls.push(holder);
            }
            this.preview = null;
            this.flashStatus(this.placedMessage(this.world.lastCellCleared));
            this.updateHud();
            this.scheduleSave();
            return;
        }

        // Prop existente o prop nuevo del catálogo.
        this.detachPreviewVisuals(false);
        holder.rotation.y = THREE.MathUtils.degToRad(preview.yawDeg || 0);
        holder.updateMatrixWorld(true);
        this.world.refreshColliderFor?.(holder);
        const model = this.world.propModels?.[record.modelIndex];
        if (model) {
            model.position = { x: holder.position.x, y: holder.position.y, z: holder.position.z };
            model.rotationY = preview.yawDeg || 0;
            if (model.rotation !== undefined && record.kind === 'prop') {
                // Compatibilidad con builders que leen `rotation` como Y.
                model.rotation = preview.yawDeg || 0;
            }
        }
        // Devolver colisión salvo que el modelo pida lo contrario.
        const wantsCollision = model ? model.collision !== false : true;
        if (wantsCollision) {
            if (!this.world.walls.includes(holder)) this.world.walls.push(holder);
            if (holder.userData?.isStatic && !this.world.staticModels.includes(holder)) {
                this.world.staticModels.push(holder);
            }
        }
        const label = record.label || record.id || 'objeto';
        const wasNew = preview.isNew;
        const template = preview.template;
        this.preview = null;
        this.flashStatus(`Colocado: ${label} (guardando…)`);
        this.updateHud();
        this.scheduleSave();
        if (wasNew && chainNew && template) {
            // Encadenar: nuevo fantasma del mismo catálogo para colocar varios.
            this.preview = {
                holder: null, record: null, isNew: true, template,
                yawDeg: 0, lift: 0, ghost: null
            };
            this.spawnPropGhost(template);
            this.updateHud();
        }
    }

    aimPoint(out = new THREE.Vector3()) {
        if (!this.camera) return out.set(0, 0, 0);
        this.camera.updateMatrixWorld(true);
        this.raycaster.setFromCamera(this.center, this.camera);
        this.raycaster.far = REACH_DISTANCE;
        const targets = [];
        if (this.world?.floorGroup) targets.push(this.world.floorGroup);
        (this.world?.walls || []).forEach((wall) => {
            if (wall && wall !== this.preview?.holder && !this.isDescendantOf(wall, this.preview?.holder)) {
                targets.push(wall);
            }
        });
        (this.world?.staticModels || []).forEach((model) => {
            if (model && model !== this.preview?.holder && !targets.includes(model)) targets.push(model);
        });
        if (targets.length === 0 && this.scene) targets.push(this.scene);
        const hits = this.raycaster.intersectObjects(targets, true);
        const previewHolder = this.preview?.holder;
        for (const hit of hits) {
            if (previewHolder && (hit.object === previewHolder || this.isDescendantOf(hit.object, previewHolder))) {
                continue;
            }
            return out.copy(hit.point);
        }
        // Sin impacto: punto fijo a 8 m frente a la cámara, a ras de suelo.
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        out.copy(this.camera.position).addScaledVector(direction, 8);
        out.y = Math.max(0, out.y - 1.5);
        return out;
    }

    isDescendantOf(object, ancestor) {
        if (!object || !ancestor) return false;
        let current = object.parent;
        while (current) {
            if (current === ancestor) return true;
            current = current.parent;
        }
        return false;
    }

    update() {
        if (this.disposed) return;
        this.syncToolState();
        const active = this.wasActive;
        if (this.hud) this.hud.classList.toggle('visible', active);
        if (typeof document !== 'undefined') {
            document.body?.classList?.toggle('build-mode-active', active);
        }
        if (!active) {
            if (this.preview) this.cancelPreviewSilent();
            return;
        }
        const preview = this.preview;
        if (!preview) {
            this.updateHud();
            return;
        }
        const target = this.aimPoint(new THREE.Vector3());
        if (preview.holder) {
            if (preview.record?.kind === 'grid') {
                const cell = this.world.worldToGridCell(target);
                if (cell) {
                    const worldPos = this.world.gridToWorldPos(cell.x, cell.y);
                    preview.holder.position.set(worldPos.x, preview.record.groundY ?? preview.holder.position.y, worldPos.z);
                } else {
                    preview.holder.position.set(target.x, preview.record.groundY ?? preview.holder.position.y, target.z);
                }
            } else {
                const baseY = preview.isNew
                    ? (preview.baseY ?? preview.template?.position?.y ?? 0)
                    : (preview.baseY ?? 0);
                const lift = preview.lift || 0;
                preview.holder.position.set(target.x, Math.max(0, baseY + lift), target.z);
            }
            preview.holder.rotation.y = THREE.MathUtils.degToRad(preview.yawDeg || 0);
            preview.holder.updateMatrixWorld(true);
        } else if (preview.ghost) {
            const cell = this.world.worldToGridCell(target);
            if (cell) {
                const worldPos = this.world.gridToWorldPos(cell.x, cell.y);
                const heights = { '#': CONFIG.BLOCK_SIZE / 2, B: (CONFIG.BLOCK_SIZE * 0.5) / 2, L: (CONFIG.BLOCK_SIZE * 0.6) / 2, D: CONFIG.BLOCK_SIZE / 2 };
                const y = heights[preview.template?.base] ?? 0.5;
                preview.ghost.position.set(worldPos.x, y, worldPos.z);
            } else {
                preview.ghost.position.copy(target);
            }
            preview.ghost.rotation.y = THREE.MathUtils.degToRad(preview.yawDeg || 0);
        }
        this.updateHud(false);
    }

    cancelPreviewSilent() {
        const preview = this.preview;
        if (!preview) return;
        try {
            if (preview.holder && !preview.isNew) {
                this.detachPreviewVisuals(false);
                preview.holder.position.copy(preview.originalPosition);
                preview.holder.rotation.y = preview.originalRotationY;
                preview.holder.updateMatrixWorld(true);
                this.world.refreshColliderFor?.(preview.holder);
                if (preview.wasInWalls && !this.world.walls.includes(preview.holder)) {
                    this.world.walls.push(preview.holder);
                }
                if (preview.wasInStatic && !this.world.staticModels.includes(preview.holder)) {
                    this.world.staticModels.push(preview.holder);
                }
            } else if (preview.holder && preview.isNew) {
                this.detachPreviewVisuals(false);
                this.world.removeEditableObject(preview.holder);
            } else if (preview.ghost?.parent) {
                preview.ghost.parent.remove(preview.ghost);
            }
        } catch { /* noop */ }
        this.preview = null;
    }
    // #endregion

    blockedMessage(reason) {
        if (reason === 'protected') return 'Protegido: no se puede construir sobre el spawn o el portal';
        if (reason === 'outside') return 'Fuera del mapa: apunta dentro de la rejilla (o usa un prop con N)';
        return 'No se pudo colocar ahí';
    }

    placedMessage(cleared) {
        const names = [...new Set(cleared || [])].filter(Boolean);
        if (names.length > 0) return `Colocado (se retiró: ${names.join(', ')}) — guardando…`;
        return 'Colocado (guardando…)';
    }

    // #region Autoguardado
    scheduleSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.doSave(), 400);
        this.saveStatus = 'Guardando…';
        this.updateHud();
    }

    async doSave() {
        this.saveTimer = null;
        if (!this.world?.currentMapName) return;
        if (this.saving) {
            this.scheduleSave();
            return;
        }
        this.saving = true;
        this.saveStatus = 'Guardando…';
        this.updateHud();
        try {
            const mapId = this.world.currentMapName;
            const txt = this.world.serializeGridToTxt();
            const modelsJson = JSON.stringify(this.world.propModels || [], null, 2) + '\n';
            const backupKey = `doom3d_build_${mapId}`;
            try {
                localStorage.setItem(`${backupKey}_txt`, txt || '');
                localStorage.setItem(`${backupKey}_models`, modelsJson);
                localStorage.setItem(`${backupKey}_at`, new Date().toISOString());
            } catch { /* almacenamiento lleno: se sigue intentando fichero */ }

            if (mapId === '__custom') {
                this.saveStatus = 'Guardado en editor (local)';
                this.flashStatus('Guardado en el mapa del editor');
            } else {
                const desktop = typeof window !== 'undefined' ? window.doom3dDesktop : null;
                if (desktop?.saveBuildFiles) {
                    const result = await desktop.saveBuildFiles({ mapId, txt, modelsJson });
                    if (result?.ok) {
                        this.saveStatus = `Guardado ✓ ${new Date().toLocaleTimeString()}`;
                        this.flashStatus(`Mapa guardado: ${result.txtPath || mapId}`);
                    } else {
                        throw new Error(result?.error || 'Electron no pudo guardar');
                    }
                } else {
                    // Web sin Electron: descargar copias para copiar a mano a
                    // mapas/ y modelos/. El trabajo no se pierde (localStorage).
                    this.downloadText(`${mapId}.txt`, txt || '', 'text/plain');
                    this.downloadText(`${mapId}_models.json`, modelsJson, 'application/json');
                    this.saveStatus = 'Exportado (descargas)';
                    this.flashStatus('Sin Electron: se descargaron .txt y _models.json (cópialos a mapas/ y modelos/)');
                }
            }
        } catch (err) {
            console.error('[Construcción] Error al guardar:', err);
            this.saveStatus = 'Error al guardar (ver consola)';
            this.flashStatus('No se pudo guardar el mapa (ver consola)');
        } finally {
            this.saving = false;
            this.updateHud();
        }
    }

    downloadText(filename, content, mime) {
        try {
            const blob = new Blob([content], { type: mime || 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (err) {
            console.warn('[Construcción] No se pudo descargar:', err);
        }
    }
    // #endregion

    // #region HUD
    ensureHud() {
        if (typeof document === 'undefined' || this.hud) return;
        const hud = document.createElement('div');
        hud.id = 'build-mode-hud';
        hud.innerHTML = `
            <div class="build-title">🔨 CONSTRUCCIÓN</div>
            <div class="build-state" id="build-state">Sin selección</div>
            <div class="build-hints">
                <span><b>Rueda</b> elegir objeto</span>
                <span><b>Clic izq.</b> recoger</span>
                <span><b>Clic der.</b> colocar</span>
                <span><b>←→</b> rotar</span>
                <span><b>↑↓</b> altura</span>
                <span><b>Espacio</b> volar hacia la mira</span>
                <span><b>Supr</b> borrar</span>
                <span><b>Esc</b> cancelar</span>
                <span><b>0</b> salir</span>
                <span>Shift sprint ×3 · atraviesas muros</span>
            </div>
            <div class="build-save" id="build-save"></div>
        `;
        document.body.appendChild(hud);
        this.hud = hud;
    }

    flashStatus(message) {
        this.statusMessage = message;
        if (this.statusTimeout) clearTimeout(this.statusTimeout);
        this.statusTimeout = setTimeout(() => {
            this.statusMessage = '';
            this.updateHud();
        }, 3500);
        this.updateHud();
    }

    describePreview() {
        const preview = this.preview;
        const shield = '🛡';
        if (!preview) {
            const entry = this.getCatalog()[this.catalogIndex];
            return `${shield} Sin selección · catálogo: ${entry?.label || '—'} (rueda para elegir)`;
        }
        if (preview.template && !preview.holder) {
            const pos = preview.ghost?.position;
            return `Nuevo ${preview.template.label} · rot ${Math.round(preview.yawDeg || 0)}°` +
                (pos ? ` · X:${pos.x.toFixed(1)} Z:${pos.z.toFixed(1)}` : '');
        }
        if (preview.holder && preview.record) {
            const pos = preview.holder.position;
            const name = preview.isNew
                ? `Nuevo ${preview.record.label || preview.record.id}`
                : (preview.record.label || preview.record.base || preview.record.id || 'objeto');
            const kind = preview.record.kind === 'grid'
                ? `celda ${preview.record.cellX},${preview.record.cellY}`
                : 'libre';
            return `${name} · ${kind} · rot ${Math.round(preview.yawDeg || 0)}° · Y:${pos.y.toFixed(2)} · X:${pos.x.toFixed(1)} Z:${pos.z.toFixed(1)}`;
        }
        return 'Preview';
    }

    updateHud(force = true) {
        void force;
        if (!this.hud) return;
        const stateEl = this.hud.querySelector('#build-state');
        const saveEl = this.hud.querySelector('#build-save');
        if (stateEl) {
            const previewText = this.describePreview();
            stateEl.textContent = this.statusMessage ? `${previewText} — ${this.statusMessage}` : previewText;
        }
        if (saveEl) saveEl.textContent = this.saveStatus || '';
    }
    // #endregion
}
