/*sección [GESTIÓN DE UI] Código de gestión de interfaz*/
export class UIManager {
    static updateHealth(amount) {
        const el = document.getElementById('health-display');
        el.innerText = "Salud: " + Math.floor(amount);
        if (amount <= 30) el.style.color = "red";
    }

    static updateScore(score) {
        document.getElementById('score-display').innerText = "Enemigos: " + score;
    }

    static updateWeapon(name, ammo) {
        document.getElementById('weapon-name').innerText = "Arma: " + name;
        this.updateAmmo(ammo);
    }

    static updateAmmo(ammo) {
        document.getElementById('ammo-display').innerText = "Munición: " + ammo;
    }

    // ⭐ NUEVO: Mostrar mensaje de evento
    static showEventMessage(text, duration = 3000) {
        // Crear elemento si no existe (asumiendo que no está en el HTML base)
        let msgEl = document.getElementById('event-message');
        if (!msgEl) {
            msgEl = document.createElement('div');
            msgEl.id = 'event-message';
            document.getElementById('ui-layer').appendChild(msgEl);
        }

        msgEl.innerText = text;
        msgEl.style.opacity = '1';
        
        // Limpiar timeout anterior si existe
        if (this.currentMsgTimeout) clearTimeout(this.currentMsgTimeout);

        this.currentMsgTimeout = setTimeout(() => {
            msgEl.style.opacity = '0';
        }, duration);
    }

    static showGameOver() {
        document.querySelector('#start-screen h1').innerText = "GAME OVER";
        document.querySelector('#start-screen p').innerText = "Recarga para reiniciar";
        document.getElementById('start-screen').style.display = 'flex';
    }
    
    static togglePauseScreen(isLocked, isGameOver) {
        const screen = document.getElementById('start-screen');
        if (isLocked) {
            screen.style.display = 'none';
        } else {
            if (!isGameOver) {
                screen.style.display = 'flex';
                screen.querySelector('p').innerText = "Pausa - Click para continuar";
            }
        }
    }
}
/*[Fin de sección]*/