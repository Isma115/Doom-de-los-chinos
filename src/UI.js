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
        const ammoText = (ammo === Infinity || ammo === "∞") ? "∞" : ammo;
        document.getElementById('ammo-display').innerText = "Munición: " + ammoText;
    }


    static updateAngle(angleDegrees) {
        let el = document.getElementById('angle-display');
        if (!el) {
            el = document.createElement('div');
            el.id = 'angle-display';
            el.style.position = 'absolute';
            el.style.top = '10px';
            el.style.right = '10px';
            el.style.background = 'rgba(0,0,0,0.5)';
            el.style.color = 'white';
            el.style.padding = '5px 10px';
            el.style.borderRadius = '4px';
            el.style.fontFamily = 'Arial, sans-serif';
            el.style.fontSize = '14px';
            el.style.zIndex = '1000';
            document.getElementById('ui-layer').appendChild(el);
        }
        el.innerText = `Ángulo: ${angleDegrees.toFixed(0)}°`;
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
        const settingsBtn = document.getElementById('settings-toggle-btn');

        if (isLocked) {
            screen.style.display = 'none';
            // Ocultar botón de ajustes cuando el juego está activo
            if (settingsBtn) {
                settingsBtn.classList.remove('visible');
                // También cerrar el menú de ajustes si estaba abierto
                const settingsMenu = document.getElementById('settings-menu');
                if (settingsMenu) settingsMenu.classList.remove('active');
            }
        } else {
            if (!isGameOver) {
                screen.style.display = 'flex';
                screen.querySelector('p').innerText = "Pausa - Click para continuar";
            }
            // Mostrar botón de ajustes cuando el juego está pausado
            if (settingsBtn) {
                settingsBtn.classList.add('visible');
            }
        }
    }
}

/*sección [GESTOR DE AJUSTES] Código de gestión de ajustes de audio*/
export class SettingsManager {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.settingsMenu = document.getElementById('settings-menu');
        this.toggleBtn = document.getElementById('settings-toggle-btn');
        this.closeBtn = document.getElementById('settings-close-btn');
        this.musicSlider = document.getElementById('music-volume');
        this.sfxSlider = document.getElementById('sfx-volume');
        this.musicValueEl = document.getElementById('music-volume-value');
        this.sfxValueEl = document.getElementById('sfx-volume-value');

        this.loadSettings();
        this.setupEventListeners();
    }

    loadSettings() {
        // Cargar configuración desde localStorage
        const savedSettings = localStorage.getItem('gameAudioSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            this.musicSlider.value = settings.musicVolume ?? 30;
            this.sfxSlider.value = settings.sfxVolume ?? 50;
        }

        // Aplicar valores iniciales
        this.updateMusicVolume();
        this.updateSFXVolume();
    }

    saveSettings() {
        const settings = {
            musicVolume: parseInt(this.musicSlider.value),
            sfxVolume: parseInt(this.sfxSlider.value)
        };
        localStorage.setItem('gameAudioSettings', JSON.stringify(settings));
    }

    setupEventListeners() {
        // Botón para abrir/cerrar el menú
        this.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Botón de cerrar
        this.closeBtn.addEventListener('click', () => {
            this.closeMenu();
        });

        // Slider de música
        this.musicSlider.addEventListener('input', () => {
            this.updateMusicVolume();
            this.saveSettings();
        });

        // Slider de efectos
        this.sfxSlider.addEventListener('input', () => {
            this.updateSFXVolume();
            this.saveSettings();
        });

        // Cerrar con Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.closeMenu();
            }
        });

        // Evitar que clics dentro del panel cierren el menú
        this.settingsMenu.querySelector('.settings-panel').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Clic fuera del panel cierra el menú
        this.settingsMenu.addEventListener('click', () => {
            this.closeMenu();
        });
    }

    updateMusicVolume() {
        const value = parseInt(this.musicSlider.value);
        this.musicValueEl.textContent = `${value}%`;
        if (this.audioManager) {
            this.audioManager.setMusicVolume(value / 100);
        }
    }

    updateSFXVolume() {
        const value = parseInt(this.sfxSlider.value);
        this.sfxValueEl.textContent = `${value}%`;
        if (this.audioManager) {
            this.audioManager.setSFXVolume(value / 100);
        }
    }

    toggleMenu() {
        if (this.isOpen()) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        this.settingsMenu.classList.add('active');
    }

    closeMenu() {
        this.settingsMenu.classList.remove('active');
    }

    isOpen() {
        return this.settingsMenu.classList.contains('active');
    }

    showButton() {
        this.toggleBtn.classList.add('visible');
    }

    hideButton() {
        this.toggleBtn.classList.remove('visible');
        this.closeMenu(); // También cerrar el menú si estaba abierto
    }
}
/*[Fin de sección]*/