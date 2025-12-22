// #region Importaciones UI
import * as THREE from '../node_modules/three/build/three.module.js';
import { WEAPONS_DATA } from './Constants.js';
// #endregion

// #region Clase UIManager
// Descripción: Clase estática para gestionar la interfaz de usuario del juego (HUD), incluyendo salud, munición y mensajes.
export class UIManager {
    // #region Métodos de HUD UIManager
    static updateHealth(amount) {
        let container = document.getElementById('health-bar-container');
        if (!container) {

            container = document.createElement('div');
            container.id = 'health-bar-container';

            const bg = document.createElement('div');
            bg.id = 'health-bar-bg';

            const fill = document.createElement('div');
            fill.id = 'health-bar-fill';

            const text = document.createElement('div');
            text.id = 'health-bar-text';
            text.innerText = '100 / 100';

            container.appendChild(bg);
            container.appendChild(fill);
            container.appendChild(text);

            document.getElementById('ui-layer').appendChild(container);
        }

        const fill = document.getElementById('health-bar-fill');
        const text = document.getElementById('health-bar-text');

        const percent = Math.max(0, Math.min(100, amount));
        fill.style.width = percent + '%';
        text.innerText = Math.floor(amount) + ' / 100';

        // Cambios de color según nivel de salud
        if (percent <= 30) {
            fill.style.background = 'linear-gradient(90deg, #880000, #ff2222)';
        } else if (percent <= 60) {
            fill.style.background = 'linear-gradient(90deg, #cc4400, #ff8800)';
        } else {
            fill.style.background = 'linear-gradient(90deg, #ff0000, #ff4444)';
        }
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

    static updateCoordinates(x, y, z) {
        let coordsEl = document.getElementById('coordinates-display');
        if (!coordsEl) {
            coordsEl = document.createElement('div');
            coordsEl.id = 'coordinates-display';
            coordsEl.style.display = 'block';
            document.getElementById('ui-layer').appendChild(coordsEl);
        }
        coordsEl.innerText = `X: ${x.toFixed(1)}  Y: ${y.toFixed(1)}  Z: ${z.toFixed(1)}`;
    }
    // #endregion

    // #region Mensajes y Eventos UIManager
    static showEventMessage(text, duration = 3000) {
        let msgEl = document.getElementById('event-message');
        if (!msgEl) {
            msgEl = document.createElement('div');
            msgEl.id = 'event-message';
            document.getElementById('ui-layer').appendChild(msgEl);
        }

        msgEl.innerText = text;
        msgEl.style.opacity = '1';

        if (this.currentMsgTimeout) clearTimeout(this.currentMsgTimeout);

        this.currentMsgTimeout = setTimeout(() => {
            msgEl.style.opacity = '0';
        }, duration);
    }

    static showCountdown(seconds) {
        let countdownEl = document.getElementById('wave-countdown');
        if (!countdownEl) {
            countdownEl = document.createElement('div');
            countdownEl.id = 'wave-countdown';
            document.getElementById('ui-layer').appendChild(countdownEl);
        }

        countdownEl.innerHTML = `
            <div class="countdown-label">SIGUIENTE RONDA EN</div>
            <div class="countdown-number">${seconds}</div>
        `;
        countdownEl.style.opacity = '1';
        countdownEl.style.display = 'flex';
    }

    static hideCountdown() {
        const countdownEl = document.getElementById('wave-countdown');
        if (countdownEl) {
            countdownEl.style.opacity = '0';
            setTimeout(() => {
                countdownEl.style.display = 'none';
            }, 300);
        }
    }
    // #endregion

    // #region Pantallas de Estado UIManager
    static showGameOver() {
        document.querySelector('#start-screen h1').innerText = "GAME OVER";
        document.querySelector('#start-screen p').innerText = "Pulsa la tecla R para reiniciar";
        document.getElementById('start-screen').style.display = 'flex';
    }

    static togglePauseScreen(isLocked, isGameOver) {
        const screen = document.getElementById('start-screen');
        const pauseButtons = document.getElementById('pause-buttons');
        const pauseSubtitle = screen.querySelector('.pause-subtitle');

        const debugBtn = document.getElementById('debug-btn');
        const coordsDisplay = document.getElementById('coordinates-display');

        if (isLocked) {
            screen.style.display = 'none';
            if (pauseButtons) pauseButtons.classList.remove('visible');
            const settingsMenu = document.getElementById('settings-menu');
            if (settingsMenu) settingsMenu.classList.remove('active');

            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) debugPanel.classList.remove('active');

            if (debugBtn) debugBtn.style.display = 'none';

            // NUEVA ESTRUCTURA: Mostrar coordenadas cuando el juego está activo
            if (coordsDisplay) coordsDisplay.style.display = 'block';
        } else {
            screen.style.display = 'flex';
            if (!isGameOver) {
                if (pauseSubtitle) pauseSubtitle.innerText = "Pausa - Click para continuar";
                if (pauseButtons) pauseButtons.classList.add('visible');

                if (debugBtn) debugBtn.style.display = 'block';
            } else {
                if (pauseButtons) pauseButtons.classList.remove('visible');
                if (debugBtn) debugBtn.style.display = 'none';
            }

            // NUEVA ESTRUCTURA: Ocultar coordenadas cuando el juego está en pausa
            if (coordsDisplay) coordsDisplay.style.display = 'none';
        }
    }
    // #endregion
}
// #endregion

//  Gestor de Ajustes
// #region Clase SettingsManager
// Descripción: Gestiona la configuración de audio y las interacciones con el menú de ajustes.
export class SettingsManager {
    // #region Constructor SettingsManager
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.settingsMenu = document.getElementById('settings-menu');
        this.settingsBtn = document.getElementById('settings-btn');
        this.menuBtn = document.getElementById('menu-btn');
        this.closeBtn = document.getElementById('settings-close-btn');
        this.musicSlider = document.getElementById('music-volume');
        this.sfxSlider = document.getElementById('sfx-volume');
        this.musicValueEl = document.getElementById('music-volume-value');
        this.sfxValueEl = document.getElementById('sfx-volume-value');

        if (typeof AUDIO_CONFIG === 'undefined') {
            window.AUDIO_CONFIG = {
                MUSIC_VOLUME: 0.6,
                SFX_VOLUME: 0.8,
                ENEMY_SOUND_MIN_INTERVAL: 5000,
                ENEMY_SOUND_MAX_INTERVAL: 7000,
                ENEMY_SOUND_DISTANCE: 60,
                MAX_SIMULTANEOUS_ENEMY_SOUNDS: 10,
                MAX_VOLUME_MULTIPLIER: 3.0
            };
        }

        this.loadSettings();
        this.setupEventListeners();
    }
    // #endregion

    // #region Persistencia SettingsManager
    loadSettings() {
        const savedSettings = localStorage.getItem('gameAudioSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            this.musicSlider.value = settings.musicVolume ?? 30;
            this.sfxSlider.value = settings.sfxVolume ?? 50;
        }

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
    // #endregion

    // #region Eventos SettingsManager
    setupEventListeners() {
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openMenu();
            });
        }

        if (this.menuBtn) {
            this.menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.location.reload();
            });
        }

        this.closeBtn.addEventListener('click', () => {
            this.closeMenu();
        });

        this.musicSlider.addEventListener('input', () => {
            this.updateMusicVolume();
            this.saveSettings();
        });

        this.sfxSlider.addEventListener('input', () => {
            this.updateSFXVolume();
            this.saveSettings();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.closeMenu();
            }
        });

        this.settingsMenu.querySelector('.settings-panel').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        this.settingsMenu.addEventListener('click', () => {
            this.closeMenu();
        });
    }

    updateMusicVolume() {
        const value = parseInt(this.musicSlider.value);
        this.musicValueEl.textContent = `${value}%`;
        if (this.audioManager) {
            const normalizedVolume = (value / 100) * AUDIO_CONFIG.MAX_VOLUME_MULTIPLIER;
            this.audioManager.setMusicVolume(normalizedVolume);
        }
    }

    updateSFXVolume() {
        const value = parseInt(this.sfxSlider.value);
        this.sfxValueEl.textContent = `${value}%`;
        if (this.audioManager) {
            const normalizedVolume = (value / 100) * AUDIO_CONFIG.MAX_VOLUME_MULTIPLIER;
            this.audioManager.setSFXVolume(normalizedVolume);
        }
    }
    // #endregion

    // #region Control de Menu SettingsManager
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
        this.closeMenu();
    }
    // #endregion
}
// #endregion

//  Panel Debug - Constructor y Creación

// Descripción: Panel de depuración para desarrolladores con trucos (God Mode, Ammo infinita) y teletransporte.
export class DebugPanel {
    // #region Constructor DebugPanel
    constructor(player, weaponSystem) {
        this.player = player;
        this.weaponSystem = weaponSystem;
        this.isVisible = false;

        const savedDebugSettings = localStorage.getItem('gameDebugSettings');
        if (savedDebugSettings) {
            const settings = JSON.parse(savedDebugSettings);
            this.debugState = {
                godMode: settings.godMode || false,
                infiniteAmmo: settings.infiniteAmmo || false,
                flyMode: settings.flyMode || false,
                noClip: settings.noClip || false,
                speedMultiplier: settings.speedMultiplier || 1.0,
                bulletLog: settings.bulletLog !== undefined ? settings.bulletLog : true,
                // CORRECCIÓN: Cargar correctamente fireRateMultiplier, con fallback a 1.0
                fireRateMultiplier: settings.fireRateMultiplier !== undefined ? settings.fireRateMultiplier : 1.0
            };
        } else {
            this.debugState = {
                godMode: false,
                infiniteAmmo: false,
                flyMode: false,
                noClip: false,
                speedMultiplier: 1.0,
                bulletLog: true,
                fireRateMultiplier: 1.0
            };
        }

        // Sincronizar el multiplicador de cadencia con el WeaponSystem
        this.weaponSystem.debugState.fireRateMultiplier = this.debugState.fireRateMultiplier;

        this.createDebugPanel();
        this.setupEventListeners();
        this.setupPauseMenuIntegration();
    }
// #endregion

    // #region Creación de Interfaz DebugPanel
    createDebugPanel() {
        // Limpiar panel existente si hay alguno para evitar duplicados e IDs repetidos
        const existingPanel = document.getElementById('debug-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.className = 'debug-panel';

        panel.innerHTML = `
            <div class="debug-header">
                <h3>🛠️ HERRAMIENTAS DE DEBUG</h3>
                <button id="debug-close-btn" class="debug-close-btn">✖</button>
            </div>
            
            <div class="debug-content">
                <div class="debug-section">
                    <h4>MODO DIOS</h4>
                    <label class="debug-toggle">
                        <input type="checkbox" id="debug-god-mode">
                        <span class="debug-toggle-label">Inmortalidad</span>
                    </label>
                </div>
                
                <div class="debug-section">
                    <h4>ARMAS</h4>
                    <label class="debug-toggle">
                        <input type="checkbox" id="debug-infinite-ammo">
                        <span class="debug-toggle-label">Munición Infinita</span>
                    </label>
                    <button class="debug-btn" id="debug-refill-ammo">Rellenar Munición</button>
                    <label class="debug-toggle">
                        <input type="checkbox" id="debug-bullet-log" checked>
                        <span class="debug-toggle-label">Console Log de Impacto de Balas</span>
                    </label>

                    <div class="debug-slider-container">
                        <label>Cadencia de disparo: <span id="fire-rate-value">1.0x</span></label>
                        <input type="range" id="debug-fire-rate" min="0.1" max="5.0" step="0.1" value="1.0">
                    </div>
                </div>
                
                <div class="debug-section">
                    <h4>MOVIMIENTO</h4>
                    <label class="debug-toggle">
                        <input type="checkbox" id="debug-fly-mode">
                        <span class="debug-toggle-label">Modo Vuelo</span>
                    </label>
                    <label class="debug-toggle">
                        <input type="checkbox" id="debug-noclip">
                        <span class="debug-toggle-label">NoClip (Atravesar Muros)</span>
                    </label>
                    
                    <div class="debug-slider-container">
                        <label>Velocidad: <span id="speed-value">1.0x</span></label>
                        <input type="range" id="debug-speed" min="0.5" max="5.0" step="0.1" value="1.0">
                    </div>
                </div>
                
                <div class="debug-section">
                    <h4>SALUD</h4>
                    <button class="debug-btn" id="debug-heal-full">Curar Completamente</button>
                    <button class="debug-btn debug-btn-danger" id="debug-damage-self">Hacerse Daño (-20)</button>
                </div>
                
                <div class="debug-section">
                    <h4>ENEMIGOS</h4>
                    <button class="debug-btn" id="debug-kill-all">Matar Todos los Enemigos</button>
                </div>
                
                <div class="debug-section">
                    <h4>TELETRANSPORTE</h4>
                    <div class="debug-input-group">
                        <input type="number" id="debug-tp-x" placeholder="X" value="0">
                        <input type="number" id="debug-tp-y" placeholder="Y" value="10">
                        <input type="number" id="debug-tp-z" placeholder="Z" value="0">
                        <button class="debug-btn" id="debug-teleport">Teletransportar</button>
                    </div>
                </div>
                
                <div class="debug-info">
                    <p><strong>Posición:</strong> <span id="debug-pos-info">X: 0, Y: 0, Z: 0</span></p>
                    <p><strong>Salud:</strong> <span id="debug-health-info">100</span></p>
                    <p><strong>Enemigos vivos:</strong> <span id="debug-enemies-info">0</span></p>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        this.panel = panel;
    }

    saveDebugSettings() {
        const settings = {
            godMode: this.debugState.godMode,
            infiniteAmmo: this.debugState.infiniteAmmo,
            flyMode: this.debugState.flyMode,
            noClip: this.debugState.noClip,
            speedMultiplier: this.debugState.speedMultiplier,
            bulletLog: this.debugState.bulletLog,
            // CORRECCIÓN: Siempre guardar fireRateMultiplier, incluso si es 1.0
            fireRateMultiplier: this.debugState.fireRateMultiplier ?? 1.0
        };
        localStorage.setItem('gameDebugSettings', JSON.stringify(settings));
    }
// #endregion

    // #region Eventos DebugPanel
    setupEventListeners() {
        document.getElementById('debug-close-btn').addEventListener('click', () => {
            this.hide();
        });

        document.getElementById('debug-god-mode').addEventListener('change', (e) => {
            this.debugState.godMode = e.target.checked;
            this.saveDebugSettings();
        });

        document.getElementById('debug-infinite-ammo').addEventListener('change', (e) => {
            this.debugState.infiniteAmmo = e.target.checked;
            this.saveDebugSettings();

            // NUEVA ESTRUCTURA: Sincronizar con weapon system
            if (this.weaponSystem) {
                this.weaponSystem.debugState.infiniteAmmo = e.target.checked;
            }
        });

        // NUEVA ESTRUCTURA: Event listener para Console Log de Impacto de Balas
        document.getElementById('debug-bullet-log').addEventListener('change', (e) => {
            this.debugState.bulletLog = e.target.checked;
            this.saveDebugSettings();

            // Sincronizar con weapon system
            if (this.weaponSystem) {
                this.weaponSystem.debugState.bulletLog = e.target.checked;
            }

            // Sincronizar con player debugState para consistencia
            if (this.player) {
                this.player.debugState.bulletLog = e.target.checked;
            }
        });

        document.getElementById('debug-fly-mode').addEventListener('change', (e) => {
            this.debugState.flyMode = e.target.checked;
            this.saveDebugSettings();
        });

        document.getElementById('debug-noclip').addEventListener('change', (e) => {
            this.debugState.noClip = e.target.checked;
            this.saveDebugSettings();
        });

        document.getElementById('debug-speed').addEventListener('input', (e) => {
            this.debugState.speedMultiplier = parseFloat(e.target.value);
            document.getElementById('speed-value').textContent = this.debugState.speedMultiplier.toFixed(1) + 'x';
            this.saveDebugSettings();
        });

        document.getElementById('debug-fire-rate').addEventListener('input', (e) => {
            this.debugState.fireRateMultiplier = parseFloat(e.target.value);
            document.getElementById('fire-rate-value').textContent = this.debugState.fireRateMultiplier.toFixed(1) + 'x';
            this.saveDebugSettings();

            // CORRECCIÓN: Sincronizar inmediatamente con el WeaponSystem (crítico para que funcione en tiempo real)
            if (this.weaponSystem && this.weaponSystem.debugState) {
                this.weaponSystem.debugState.fireRateMultiplier = this.debugState.fireRateMultiplier;
            }
        });

        document.getElementById('debug-refill-ammo').addEventListener('click', () => {
            this.weaponSystem.refillAllAmmo();
        });

        document.getElementById('debug-heal-full').addEventListener('click', () => {
            this.player.health = 100;
            UIManager.updateHealth(100);
        });

        document.getElementById('debug-damage-self').addEventListener('click', () => {
            this.player.takeDamage(20);
        });

        document.getElementById('debug-kill-all').addEventListener('click', () => {
            this.player.enemyManager.removeAllEnemies();
        });

        document.getElementById('debug-teleport').addEventListener('click', () => {
            const x = parseFloat(document.getElementById('debug-tp-x').value);
            const y = parseFloat(document.getElementById('debug-tp-y').value);
            const z = parseFloat(document.getElementById('debug-tp-z').value);
            this.player.teleport(x, y, z);
        });
    }
// #endregion

    // #region Visibilidad y Actualización DebugPanel
    show() {
        this.isVisible = true;
        this.panel.classList.add('active');

        document.getElementById('debug-god-mode').checked = this.debugState.godMode;
        document.getElementById('debug-infinite-ammo').checked = this.debugState.infiniteAmmo;
        document.getElementById('debug-fly-mode').checked = this.debugState.flyMode;
        document.getElementById('debug-noclip').checked = this.debugState.noClip;
        document.getElementById('debug-bullet-log').checked = this.debugState.bulletLog;

        const speedSlider = document.getElementById('debug-speed');
        if (speedSlider) {
            speedSlider.value = this.debugState.speedMultiplier;
            document.getElementById('speed-value').textContent = this.debugState.speedMultiplier.toFixed(1) + 'x';
        }

        // CORRECCIÓN: Restaurar correctamente el valor y texto del slider de cadencia
        const fireRateSlider = document.getElementById('debug-fire-rate');
        if (fireRateSlider) {
            const value = this.debugState.fireRateMultiplier ?? 1.0;
            fireRateSlider.value = value;
            document.getElementById('fire-rate-value').textContent = value.toFixed(1) + 'x';
        }

        this.startInfoUpdate();
    }

    hide() {
        this.isVisible = false;
        this.panel.classList.remove('active');
        this.stopInfoUpdate();

        // También actualizar los sliders al cerrar (por consistencia)
        document.getElementById('debug-god-mode').checked = this.debugState.godMode;
        document.getElementById('debug-infinite-ammo').checked = this.debugState.infiniteAmmo;
        document.getElementById('debug-fly-mode').checked = this.debugState.flyMode;
        document.getElementById('debug-noclip').checked = this.debugState.noClip;
        document.getElementById('debug-bullet-log').checked = this.debugState.bulletLog;

        const speedSlider = document.getElementById('debug-speed');
        if (speedSlider) {
            speedSlider.value = this.debugState.speedMultiplier;
            document.getElementById('speed-value').textContent = this.debugState.speedMultiplier.toFixed(1) + 'x';
        }

        const fireRateSlider = document.getElementById('debug-fire-rate');
        if (fireRateSlider) {
            const value = this.debugState.fireRateMultiplier ?? 1.0;
            fireRateSlider.value = value;
            document.getElementById('fire-rate-value').textContent = value.toFixed(1) + 'x';
        }
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }

        const startScreen = document.getElementById('start-screen');
        if (startScreen && this.isVisible) {
            startScreen.style.display = 'flex';
        }
    }

    startInfoUpdate() {
        this.infoUpdateInterval = setInterval(() => {
            this.updateDebugInfo();
        }, 100);
    }

    stopInfoUpdate() {
        if (this.infoUpdateInterval) {
            clearInterval(this.infoUpdateInterval);
        }
    }

    updateDebugInfo() {
        const pos = this.player.getPosition();
        document.getElementById('debug-pos-info').textContent =
            `X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}`;

        document.getElementById('debug-health-info').textContent =
            Math.floor(this.player.health);

        document.getElementById('debug-enemies-info').textContent =
            this.player.enemyManager.enemies.length;
    }

    setupPauseMenuIntegration() {
        const debugBtn = document.getElementById('debug-btn');
        if (debugBtn) {
            debugBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }
    }
// #endregion
}