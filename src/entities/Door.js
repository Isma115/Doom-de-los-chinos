// #region Clase Door
// Descripción: Clase que representa una puerta en el juego, gestionando su estado (abierta/cerrada), animación y lógica de interacción.
export class Door {
    // #region Propiedades Estáticas Door
    // Descripción: Almacena referencias a todas las puertas instanciadas para gestión global.
    static instances = [];
    // #endregion

    // #region Constructor Door
    // Descripción: Inicializa la puerta con su malla 3D y estado inicial cerrado.
    constructor(doorMesh) {
        this.mesh = doorMesh;
        this.isOpen = false;
        this.openTime = 0;
        this.openDuration = 5000;

        // Agregar esta instancia a la lista global de puertas
        Door.instances.push(this);
    }
    // #endregion

    // #region Métodos Estáticos Door
    // Descripción: Métodos para controlar todas las puertas o buscar interacciones cercanas sin referencia directa a una instancia.
    static tryOpenNearest(playerPosition) {
        let opened = false;
        Door.instances.forEach(door => {
            if (door.isPlayerNear(playerPosition)) {
                door.open();
                opened = true;
            }
        });
        return opened;
    }

    static updateAll(delta, playerPosition) {
        Door.instances.forEach(door => door.update(delta, playerPosition));
    }

    static clearAll() {
        Door.instances = [];
    }
    // #endregion

    // #region Métodos de Instancia Door
    // Descripción: Lógica de apertura, cierre, actualización de animación y detección de proximidad del jugador.
    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.openTime = performance.now();
        this.mesh.userData.targetY = this.mesh.userData.openY;
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.mesh.userData.targetY = this.mesh.userData.closedY;
    }

    update(delta, playerPosition) {
        const targetY = this.mesh.userData.targetY;
        const currentY = this.mesh.position.y;
        // Velocidad ajustada a 2.0 → más rápida que 1.2 pero todavía más suave y lenta que el original (3)
        const speed = 2.0;

        if (Math.abs(currentY - targetY) > 0.1) {
            this.mesh.position.y += (targetY - currentY) * speed * delta;
        } else {
            this.mesh.position.y = targetY;
        }

        // Lógica de cierre automático por distancia
        if (this.isOpen) {
            const dx = playerPosition.x - this.mesh.position.x;
            const dz = playerPosition.z - this.mesh.position.z;
            const distXZ = Math.sqrt(dx * dx + dz * dz);

            const mediumDistance = 15; // Reducir distancia de cierre

            if (distXZ > mediumDistance) {
                this.close();
            }
        }
    }

    isPlayerNear(playerPosition) {
        return playerPosition.distanceTo(this.mesh.position) < 8; // Reducir distancia de apertura
    }
// #endregion
}
// #endregion