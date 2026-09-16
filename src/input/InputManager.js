// Abstracción de entrada: teclado + ratón + táctil emiten los mismos eventos.
// Player y WeaponSystem se suscriben aquí en vez de a `document` directamente,
// así añadir un botón táctil o cambiar una tecla no toca la lógica de juego.
//
// Eventos: 'move' {x,z}, 'jump', 'fire:start', 'fire:stop', 'interact',
//          'crouch', 'weapon:next', 'weapon:prev', 'pause'
export class InputManager {
    constructor(target = (typeof document !== 'undefined' ? document : null)) {
        this.target = target;
        this.listeners = new Map();
        this.state = {
            forward: false, back: false, left: false, right: false,
            crouch: false, fire: false,
        };
        this.cleanups = [];
        this.touchState = null;
    }

    on(event, cb) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(cb);
        return () => this.off(event, cb);
    }

    off(event, cb) {
        this.listeners.get(event)?.delete(cb);
    }

    emit(event, payload) {
        for (const cb of [...(this.listeners.get(event) ?? [])]) {
            try { cb(payload); } catch (e) { console.error(`[Input] ${event}:`, e); }
        }
    }

    /** Movimiento normalizado -1..1 listo para PlayerMovement. */
    getMoveVector() {
        const { forward, back, left, right } = this.state;
        let x = (right ? 1 : 0) - (left ? 1 : 0);
        let z = (forward ? 1 : 0) - (back ? 1 : 0);
        if (this.touchState?.move) {
            x += this.touchState.move.x ?? 0;
            z += this.touchState.move.y ?? 0;
        }
        const len = Math.hypot(x, z) || 1;
        if (len > 1) { x /= len; z /= len; }
        return { x, z };
    }

    setKey(code, down) {
        switch (code) {
            case 'KeyW': case 'ArrowUp': this.state.forward = down; break;
            case 'KeyS': case 'ArrowDown': this.state.back = down; break;
            case 'KeyA': case 'ArrowLeft': this.state.left = down; break;
            case 'KeyD': case 'ArrowRight': this.state.right = down; break;
            case 'ControlLeft': case 'ControlRight': case 'KeyC':
                this.state.crouch = down;
                if (down) this.emit('crouch', true);
                break;
            case 'Space':
                if (down) this.emit('jump');
                break;
            case 'KeyE': case 'KeyF':
                if (down) this.emit('interact');
                break;
        }
        this.emit('move', this.getMoveVector());
    }

    setFire(down) {
        if (this.state.fire === down) return;
        this.state.fire = down;
        this.emit(down ? 'fire:start' : 'fire:stop');
    }

    /** Conecta el joystick táctil existente sin romperlo. */
    attachTouchState(touchState) {
        this.touchState = touchState;
    }

    reset() {
        this.state.forward = this.state.back = false;
        this.state.left = this.state.right = false;
        this.state.crouch = false;
        this.state.fire = false;
        this.emit('move', { x: 0, z: 0 });
    }

    dispose() {
        this.cleanups.splice(0).forEach(fn => { try { fn(); } catch {} });
        this.listeners.clear();
    }
}

export const globalInput = new InputManager();
