// #region Importaciones UI
import * as THREE from '../node_modules/three/build/three.module.js';
import { CONFIG, WEAPONS_DATA } from './Constants.js';
// #endregion

// #region Clase UIManager
// Descripción: Clase estática para gestionar la interfaz de usuario del juego (HUD), incluyendo salud, munición y mensajes.
export class UIManager {
    // #region Métodos de HUD UIManager
    static updateHealth(amount) {
        const maxHealth = CONFIG.PLAYER_MAX_HEALTH;
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
            text.innerText = `${maxHealth} / ${maxHealth}`;

            container.appendChild(bg);
            container.appendChild(fill);
            container.appendChild(text);

            document.getElementById('ui-layer').appendChild(container);
        }

        const fill = document.getElementById('health-bar-fill');
        const text = document.getElementById('health-bar-text');

        const percent = Math.max(0, Math.min(100, (amount / maxHealth) * 100));
        fill.style.width = percent + '%';
        text.innerText = Math.floor(amount) + ' / ' + maxHealth;
    }

    static showDamageIndicator(angleDegrees = 0, intensity = 1) {
        this.showDamageFlash();

        let overlay = document.getElementById('damage-direction-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'damage-direction-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            document.getElementById('ui-layer').appendChild(overlay);
        }

        const clampedIntensity = Math.max(0.25, Math.min(1, intensity));
        const angle = Number.isFinite(angleDegrees) ? angleDegrees : 0;
        const radians = angle * Math.PI / 180;
        const directionX = Math.sin(radians);
        const directionY = -Math.cos(radians);
        const edgeScale = 50 / Math.max(Math.abs(directionX), Math.abs(directionY), 0.0001);

        // El centro del óvalo se coloca exactamente en el borde desde el que llega el daño.
        overlay.style.setProperty('--damage-angle', `${angle}deg`);
        overlay.style.setProperty('--damage-x', `${50 + directionX * edgeScale}%`);
        overlay.style.setProperty('--damage-y', `${50 + directionY * edgeScale}%`);
        overlay.style.setProperty('--damage-opacity', (0.45 + clampedIntensity * 0.4).toFixed(3));
        overlay.style.opacity = '1';

        if (this.damageIndicatorTimeout) clearTimeout(this.damageIndicatorTimeout);
        this.damageIndicatorTimeout = setTimeout(() => {
            overlay.style.opacity = '0';
        }, 420 + clampedIntensity * 260);
    }

    static showScreenFlash(overlayId, timeoutProperty, duration = 65) {
        let overlay = document.getElementById(overlayId);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = overlayId;
            overlay.setAttribute('aria-hidden', 'true');
            document.getElementById('ui-layer').appendChild(overlay);
        }

        if (this[timeoutProperty]) clearTimeout(this[timeoutProperty]);
        overlay.classList.remove('active');
        // Forzar un nuevo ciclo de transición cuando llegan impactos consecutivos.
        void overlay.offsetWidth;
        overlay.classList.add('active');

        this[timeoutProperty] = setTimeout(() => {
            overlay.classList.remove('active');
        }, duration);
    }

    static showDamageFlash() {
        this.showScreenFlash('damage-flash-overlay', 'damageFlashTimeout');
    }

    static showHealFlash() {
        this.showScreenFlash('heal-flash-overlay', 'healFlashTimeout');
    }

    static updateScore(score) {
        let el = document.getElementById('score-display');
        if (!el) {
            el = document.createElement('div');
            el.id = 'score-display';
            document.getElementById('ui-layer').appendChild(el);
        }
        el.innerText = "Enemigos: " + score;
    }

    static updateWeapon(name, ammo) {
        this.updateAmmo(ammo);
    }

    static updateAmmo(ammo) {
        let el = document.getElementById('ammo-display');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ammo-display';
            const hud = document.getElementById('hud-top-right') || document.getElementById('ui-layer');
            hud.appendChild(el);
        }
        const ammoText = (ammo === Infinity || ammo === "∞") ? "∞" : ammo;
        el.innerText = ammoText;
    }

    static updateFPS(fps) {
        const el = document.getElementById('hud-fps-info');
        if (!el) return;

        const value = Number.isFinite(fps) ? Math.max(0, Math.round(fps)) : 0;
        el.innerText = `${value}`;
    }

    static showRespawnHint() {
        const hint = document.getElementById('respawn-hint');
        if (hint) hint.classList.add('visible');
    }

    static hideRespawnHint() {
        const hint = document.getElementById('respawn-hint');
        if (hint) hint.classList.remove('visible');
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

        if (isLocked) {
            screen.style.display = 'none';
            if (pauseButtons) pauseButtons.classList.remove('visible');
            const settingsMenu = document.getElementById('settings-menu');
            if (settingsMenu) settingsMenu.classList.remove('active');

            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) debugPanel.classList.remove('active');

            if (debugBtn) debugBtn.style.display = 'none';

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
    constructor(audioManager, onResolutionChange = null) {
        this.audioManager = audioManager;
        this.onResolutionChange = typeof onResolutionChange === 'function' ? onResolutionChange : null;
        this.settingsMenu = document.getElementById('settings-menu');
        this.settingsBtn = document.getElementById('settings-btn');
        this.menuBtn = document.getElementById('menu-btn');
        this.closeBtn = document.getElementById('settings-close-btn');
        this.musicSlider = document.getElementById('music-volume');
        this.sfxSlider = document.getElementById('sfx-volume');
        this.musicValueEl = document.getElementById('music-volume-value');
        this.sfxValueEl = document.getElementById('sfx-volume-value');
        this.resolutionSelect = document.getElementById('resolution-select');

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
            try {
                const settings = JSON.parse(savedSettings);
                this.musicSlider.value = settings.musicVolume ?? 30;
                this.sfxSlider.value = settings.sfxVolume ?? 50;

                if (this.resolutionSelect && (settings.resolution === '1080p' || settings.resolution === '720p')) {
                    this.resolutionSelect.value = settings.resolution;
                }
            } catch (error) {
                console.warn('No se pudieron cargar los ajustes guardados:', error);
            }
        }

        this.updateMusicVolume();
        this.updateSFXVolume();
        this.applyResolution();
    }

    saveSettings() {
        const settings = {
            musicVolume: parseInt(this.musicSlider.value),
            sfxVolume: parseInt(this.sfxSlider.value),
            resolution: this.resolutionSelect?.value ?? '1080p'
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

        if (this.resolutionSelect) {
            this.resolutionSelect.addEventListener('change', () => {
                this.applyResolution();
                this.saveSettings();
            });
        }

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

    applyResolution() {
        if (this.onResolutionChange && this.resolutionSelect) {
            this.onResolutionChange(this.resolutionSelect.value);
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
        this.infoUpdateInterval = null;
        this.performanceUpdateInterval = null;
        this.metricsRequestInFlight = false;
        this.lastMetricsRequestAt = 0;

        const savedDebugSettings = localStorage.getItem('gameDebugSettings');
        if (savedDebugSettings) {
            const settings = JSON.parse(savedDebugSettings);
            this.debugState = {
                godMode: settings.godMode || false,
                infiniteAmmo: settings.infiniteAmmo || false,
                flyMode: settings.flyMode || false,
                noClip: settings.noClip || false,
                hitboxes: settings.hitboxes === true,
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
                hitboxes: false,
                speedMultiplier: 1.0,
                bulletLog: true,
                fireRateMultiplier: 1.0
            };
        }

        // Sincronizar el multiplicador de cadencia con el WeaponSystem
        this.weaponSystem.debugState.fireRateMultiplier = this.debugState.fireRateMultiplier;
        this.applyHitboxVisibility(this.debugState.hitboxes);

        // Sincronización inicial con Player
        if (this.player && this.player.debugState) {
            this.player.debugState.godMode = this.debugState.godMode;
            this.player.debugState.infiniteAmmo = this.debugState.infiniteAmmo;
            this.player.debugState.flyMode = this.debugState.flyMode;
            this.player.debugState.noClip = this.debugState.noClip;
            this.player.debugState.speedMultiplier = this.debugState.speedMultiplier;
            this.player.debugState.bulletLog = this.debugState.bulletLog;
        }

        this.createDebugPanel();
        this.setupEventListeners();
        this.setupPauseMenuIntegration();
        this.startPerformanceUpdate();
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
                    <button class="debug-btn" id="debug-give-all-weapons">Dar todas las armas (RPG)</button>
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
                    <h4>COLISIONES</h4>
                    <label class="debug-toggle">
                        <input type="checkbox" id="debug-hitboxes">
                        <span class="debug-toggle-label">Cajas de colisión (verde)</span>
                    </label>
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
                    <h4>RONDAS</h4>
                    <button class="debug-btn" id="debug-next-wave">Pasar de ronda</button>
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
                
                <div class="debug-section debug-performance-section">
                    <h4>RENDIMIENTO</h4>
                    <div class="debug-info debug-performance-info">
                        <p><strong>CPU:</strong> <span id="debug-cpu-info">N/D</span></p>
                        <p><strong>GPU (proceso):</strong> <span id="debug-gpu-info">N/D</span></p>
                        <p><strong>RAM del juego:</strong> <span id="debug-ram-info">N/D</span></p>
                        <p><strong>RAM del sistema:</strong> <span id="debug-system-ram-info">N/D</span></p>
                    </div>
                    <small id="debug-metrics-source">Disponible con la versión de escritorio</small>
                </div>

                <div class="debug-info">
                    <p><strong>Posición:</strong> <span id="debug-pos-info">X: 0, Y: 0, Z: 0</span></p>
                    <p><strong>Salud:</strong> <span id="debug-health-info">${CONFIG.PLAYER_MAX_HEALTH}</span></p>
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
            hitboxes: this.debugState.hitboxes,
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
            this.player.debugState.godMode = e.target.checked; // Sincronizar con Player
            this.saveDebugSettings();
        });

        document.getElementById('debug-infinite-ammo').addEventListener('change', (e) => {
            this.debugState.infiniteAmmo = e.target.checked;
            this.player.debugState.infiniteAmmo = e.target.checked; // Sincronizar con Player
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
            this.player.debugState.flyMode = e.target.checked; // Sincronizar con Player
            this.saveDebugSettings();
        });

        document.getElementById('debug-noclip').addEventListener('change', (e) => {
            this.debugState.noClip = e.target.checked;
            this.player.debugState.noClip = e.target.checked; // Sincronizar con Player
            this.saveDebugSettings();
        });

        document.getElementById('debug-hitboxes').addEventListener('change', (e) => {
            this.debugState.hitboxes = e.target.checked;
            this.applyHitboxVisibility(this.debugState.hitboxes);
            this.saveDebugSettings();
        });

        document.getElementById('debug-speed').addEventListener('input', (e) => {
            this.debugState.speedMultiplier = parseFloat(e.target.value);
            this.player.debugState.speedMultiplier = this.debugState.speedMultiplier; // Sincronizar con Player
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

        document.getElementById('debug-give-all-weapons').addEventListener('click', () => {
            const unlockedWeapons = this.weaponSystem?.unlockAllWeapons?.(true) || [];
            if (unlockedWeapons.length === 0) {
                UIManager.showEventMessage('NO HAY ARMAS DESBLOQUEABLES EN ESTE MAPA', 2500);
                return;
            }

            const weaponNames = unlockedWeapons
                .map(({ weapon }) => weapon.name)
                .join(', ');
            UIManager.showEventMessage(
                `¡ARMAS DEBUG DESBLOQUEADAS: ${weaponNames}!`,
                3000
            );
        });

        document.getElementById('debug-heal-full').addEventListener('click', () => {
            this.player.health = CONFIG.PLAYER_MAX_HEALTH;
            UIManager.updateHealth(this.player.health);
        });

        document.getElementById('debug-damage-self').addEventListener('click', () => {
            this.player.takeDamage(20);
        });

        document.getElementById('debug-kill-all').addEventListener('click', () => {
            this.player.enemyManager.removeAllEnemies();
        });

        document.getElementById('debug-next-wave').addEventListener('click', () => {
            const waveEvent = this.player?.gameInstance?.eventManager?.waveEvent;
            if (!waveEvent) {
                UIManager.showEventMessage('ESTE MAPA NO TIENE RONDAS', 2500);
                return;
            }

            waveEvent.skipCurrentWave(this.player.getPosition());
        });

        document.getElementById('debug-teleport').addEventListener('click', () => {
            const x = parseFloat(document.getElementById('debug-tp-x').value);
            const y = parseFloat(document.getElementById('debug-tp-y').value);
            const z = parseFloat(document.getElementById('debug-tp-z').value);
            this.player.teleport(x, y, z);
        });
    }
    // #endregion

    applyHitboxVisibility(visible) {
        const shouldShow = Boolean(visible);
        CONFIG.DEBUG_SHOW_HITBOXES = shouldShow;

        if (this.player?.enemyManager?.setCollisionDebugVisible) {
            this.player.enemyManager.setCollisionDebugVisible(shouldShow);
        }

        if (this.player?.world?.setCollisionDebugVisible) {
            this.player.world.setCollisionDebugVisible(shouldShow);
        }
    }

    // #region Visibilidad y Actualización DebugPanel
    show() {
        this.isVisible = true;
        this.panel.classList.add('active');

        document.getElementById('debug-god-mode').checked = this.debugState.godMode;
        document.getElementById('debug-infinite-ammo').checked = this.debugState.infiniteAmmo;
        document.getElementById('debug-fly-mode').checked = this.debugState.flyMode;
        document.getElementById('debug-noclip').checked = this.debugState.noClip;
        document.getElementById('debug-bullet-log').checked = this.debugState.bulletLog;
        document.getElementById('debug-hitboxes').checked = this.debugState.hitboxes;

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
        document.getElementById('debug-hitboxes').checked = this.debugState.hitboxes;

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
        this.stopInfoUpdate();
        this.updateDebugInfo();
        this.infoUpdateInterval = setInterval(() => {
            this.updateDebugInfo();
        }, 100);
    }

    stopInfoUpdate() {
        if (this.infoUpdateInterval) {
            clearInterval(this.infoUpdateInterval);
            this.infoUpdateInterval = null;
        }
    }

    startPerformanceUpdate() {
        this.stopPerformanceUpdate();
        this.updatePerformanceInfo();
        this.performanceUpdateInterval = setInterval(() => {
            this.updatePerformanceInfo();
        }, 500);
    }

    stopPerformanceUpdate() {
        if (this.performanceUpdateInterval) {
            clearInterval(this.performanceUpdateInterval);
            this.performanceUpdateInterval = null;
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

        this.updatePerformanceInfo();
    }

    updatePerformanceInfo() {
        const metricsApi = globalThis.systemMetrics;
        const now = performance.now();

        if (!metricsApi || typeof metricsApi.get !== 'function') {
            this.renderBrowserPerformanceFallback();
            return;
        }

        if (this.metricsRequestInFlight || now - this.lastMetricsRequestAt < 500) {
            return;
        }

        this.metricsRequestInFlight = true;
        this.lastMetricsRequestAt = now;

        metricsApi.get()
            .then(metrics => this.renderPerformanceMetrics(metrics))
            .catch(() => this.renderBrowserPerformanceFallback())
            .finally(() => {
                this.metricsRequestInFlight = false;
            });
    }

    renderPerformanceMetrics(metrics) {
        const cpuText = this.formatPercentage(metrics?.cpuPercent);
        const gpuText = this.formatPercentage(metrics?.gpuPercent);
        const gameRam = this.formatMemory(metrics?.ramUsedMb, metrics?.ramPercent);
        const systemRam = this.formatPercentage(metrics?.systemRamUsedPercent);

        this.setPerformanceValue('debug-cpu-info', cpuText);
        this.setPerformanceValue('debug-gpu-info', gpuText);
        this.setPerformanceValue('debug-ram-info', gameRam);
        this.setPerformanceValue('debug-system-ram-info', systemRam);
        this.setPerformanceValue('hud-cpu-info', cpuText);
        this.setPerformanceValue('hud-gpu-info', gpuText);
        this.setPerformanceValue('hud-ram-info', gameRam);

        const source = document.getElementById('debug-metrics-source');
        if (source) {
            source.textContent = 'Electron · GPU = carga del proceso gráfico';
        }
    }

    renderBrowserPerformanceFallback() {
        const memory = globalThis.performance?.memory;
        const heapUsedMb = memory?.usedJSHeapSize / (1024 * 1024);
        const heapLimitMb = memory?.jsHeapSizeLimit / (1024 * 1024);
        const heapPercent = Number.isFinite(heapUsedMb) && Number.isFinite(heapLimitMb) && heapLimitMb > 0
            ? (heapUsedMb / heapLimitMb) * 100
            : null;

        this.setPerformanceValue('debug-cpu-info', 'N/D');
        this.setPerformanceValue('debug-gpu-info', 'N/D');
        this.setPerformanceValue('debug-ram-info', this.formatMemory(heapUsedMb, heapPercent, 'heap JS'));
        this.setPerformanceValue('debug-system-ram-info', 'N/D');
        this.setPerformanceValue('hud-cpu-info', 'N/D');
        this.setPerformanceValue('hud-gpu-info', 'N/D');
        this.setPerformanceValue(
            'hud-ram-info',
            this.formatMemory(heapUsedMb, heapPercent, 'heap JS')
        );

        const source = document.getElementById('debug-metrics-source');
        if (source) {
            source.textContent = memory
                ? 'Navegador · solo memoria del heap JS'
                : 'Abre el juego con npm run desktop para ver CPU/GPU/RAM';
        }
    }

    setPerformanceValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    formatPercentage(value) {
        if (value === null || value === undefined || value === '') {
            return 'N/D';
        }

        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            return 'N/D';
        }

        return `${Math.max(0, Math.min(100, numericValue)).toFixed(1)}%`;
    }

    formatMemory(megabytes, percentage, suffix = 'sist.') {
        if (megabytes === null || megabytes === undefined || !Number.isFinite(Number(megabytes))) {
            return 'N/D';
        }

        const memoryText = `${Number(megabytes).toFixed(0)} MB`;
        const percentageText = this.formatPercentage(percentage);
        return percentageText === 'N/D'
            ? `${memoryText} · ${suffix}`
            : `${memoryText} (${percentageText} ${suffix})`;
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
