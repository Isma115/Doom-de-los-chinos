/*sección [PUERTA] Puerta abrir y cerrar*/
export class Door {
    // Array estático para guardar todas las puertas activas
    static instances = [];

    constructor(doorMesh) {
        this.mesh = doorMesh;
        this.isOpen = false;
        this.openTime = 0;
        this.openDuration = 5000;
        
        // Agregar esta instancia a la lista global de puertas
        Door.instances.push(this);
    }

    // Método estático para intentar abrir la puerta más cercana
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

    // Método estático para actualizar todas las puertas
    static updateAll(delta, playerPosition) {
        Door.instances.forEach(door => door.update(delta, playerPosition));
    }

    // Método estático para limpiar referencias al cambiar de mapa
    static clearAll() {
        Door.instances = [];
    }

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
        const speed = 8;

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
}
/*[Fin de sección]*/