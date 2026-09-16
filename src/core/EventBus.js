// Bus de eventos mínimo para desacoplar gameplay de UI/audio.
// Uso: bus.emit('player:damage', { amount }); bus.on('enemy:killed', cb).
// Sustituye llamadas directas UIManager.xxx desde Player/Weapon/EnemyManager.
export class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    once(event, callback) {
        const wrapper = (payload) => {
            this.off(event, wrapper);
            callback(payload);
        };
        return this.on(event, wrapper);
    }

    off(event, callback) {
        this.listeners.get(event)?.delete(callback);
    }

    emit(event, payload) {
        const set = this.listeners.get(event);
        if (!set || set.size === 0) return;
        // Copia para que un listener pueda desuscribirse sin romper el bucle.
        for (const cb of [...set]) {
            try {
                cb(payload);
            } catch (err) {
                console.error(`[EventBus] error en listener de "${event}":`, err);
            }
        }
    }

    clear(event = null) {
        if (event) this.listeners.delete(event);
        else this.listeners.clear();
    }
}

// Instancia compartida por defecto. Los tests o una segunda partida
// pueden crear su propio EventBus y pasarlo en el GameContext.
export const globalEventBus = new EventBus();
