/*sección [GESTIÓN DE UI] Código de gestión de interfaz*/
export class UIManager {
    static updateHealth(amount) {
        const el = document.getElementById('health-display');
        el.innerText = "Salud: " + Math.floor(amount);
        if (amount <= 30) el.style.color = "red";
        else el.style.color = "white";
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

    static showGameOver() {
        document.querySelector('#start-screen h1').innerText = "GAME OVER";
        document.querySelector('#start-screen p').innerText = "Recarga para reiniciar";
        document.getElementById('start-screen').style.display = 'flex';
    }

    static togglePauseScreen(isLocked, isGameOver) {
        const screen = document.getElementById('start-screen');
        const pauseButtons = document.getElementById('pause-buttons');
        const pauseSubtitle = screen.querySelector('.pause-subtitle');

        // ⭐ NUEVO: Obtener referencia al botón debug
        const debugBtn = document.getElementById('debug-btn');

        if (isLocked) {
            screen.style.display = 'none';
            if (pauseButtons) pauseButtons.classList.remove('visible');
            const settingsMenu = document.getElementById('settings-menu');
            if (settingsMenu) settingsMenu.classList.remove('active');

            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) debugPanel.classList.remove('active');

            // ⭐ NUEVO: Esconder botón debug cuando se reanuda el juego
            if (debugBtn) debugBtn.style.display = 'none';
        } else {
            screen.style.display = 'flex';
            if (!isGameOver) {
                if (pauseSubtitle) pauseSubtitle.innerText = "Pausa - Click para continuar";
                if (pauseButtons) pauseButtons.classList.add('visible');

                // ⭐ NUEVO: Mostrar botón debug cuando se pausa el juego
                if (debugBtn) debugBtn.style.display = 'block';
            } else {
                if (pauseButtons) pauseButtons.classList.remove('visible');
                if (debugBtn) debugBtn.style.display = 'none';
            }
        }
    }
}

/*sección [GESTOR DE AJUSTES] Código de gestión de ajustes de audio*/
export class SettingsManager {
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

        this.loadSettings();
        this.setupEventListeners();
    }

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
        this.closeMenu();
    }
}

/*sección [PANEL DEBUG - CONSTRUCTOR Y CREACIÓN] Inicialización y generación del HTML del panel de debug*/

export class DebugPanel {
    constructor(player, weaponSystem) {
        this.player = player;
        this.weaponSystem = weaponSystem;
        this.isVisible = false;

        this.debugState = {
            godMode: false,
            infiniteAmmo: false,
            flyMode: false,
            noClip: false,
            speedMultiplier: 1.0
        };

        this.createDebugPanel();
        this.setupEventListeners();
        this.setupPauseMenuIntegration(); // ⭐ NUEVO: Integración con menú de pausa
    }

    createDebugPanel() {
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

/*[Fin de sección]*/

    /*sección [PANEL DEBUG - EVENTOS] Listeners de todos los controles del panel de debug*/
setupEventListeners() {
        document.getElementById('debug-close-btn').addEventListener('click', () => {
            this.hide();
        });

        document.getElementById('debug-god-mode').addEventListener('change', (e) => {
            this.debugState.godMode = e.target.checked;
            this.player.debugState.godMode = e.target.checked;
            console.log('God Mode:', e.target.checked);
        });

        document.getElementById('debug-infinite-ammo').addEventListener('change', (e) => {
            this.debugState.infiniteAmmo = e.target.checked;
            this.weaponSystem.debugState.infiniteAmmo = e.target.checked;
            console.log('Infinite Ammo:', e.target.checked);
        });

        document.getElementById('debug-fly-mode').addEventListener('change', (e) => {
            this.debugState.flyMode = e.target.checked;
            this.player.debugState.flyMode = e.target.checked;
            console.log('Fly Mode:', e.target.checked);
        });

        document.getElementById('debug-noclip').addEventListener('change', (e) => {
            this.debugState.noClip = e.target.checked;
            this.player.debugState.noClip = e.target.checked;
            console.log('NoClip:', e.target.checked);
        });

        document.getElementById('debug-speed').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.debugState.speedMultiplier = value;
            this.player.debugState.speedMultiplier = value;
            document.getElementById('speed-value').textContent = value.toFixed(1) + 'x';
        });

        document.getElementById('debug-refill-ammo').addEventListener('click', () => {
            WEAPONS_DATA.forEach((weapon, index) => {
                if (!weapon.isMelee) {
                    weapon.ammo = weapon.maxAmmo;
                }
            });
            UIManager.updateAmmo(this.weaponSystem.getCurrentWeapon().ammo);
            console.log('Munición rellenada');
        });

        document.getElementById('debug-heal-full').addEventListener('click', () => {
            this.player.health = 100;
            UIManager.updateHealth(this.player.health);
            console.log('Salud restaurada');
        });

        document.getElementById('debug-damage-self').addEventListener('click', () => {
            this.player.takeDamage(20);
            console.log('Daño auto-infligido');
        });

        document.getElementById('debug-kill-all').addEventListener('click', () => {
            const enemies = [...this.player.enemyManager.enemies];
            enemies.forEach(enemy => {
                this.player.enemyManager.removeEnemy(enemy);
            });
            console.log('Todos los enemigos eliminados');
        });

        document.getElementById('debug-teleport').addEventListener('click', () => {
            const x = parseFloat(document.getElementById('debug-tp-x').value) || 0;
            const y = parseFloat(document.getElementById('debug-tp-y').value) || 10;
            const z = parseFloat(document.getElementById('debug-tp-z').value) || 0;

            this.player.teleport(new THREE.Vector3(x, y, z));
            console.log(`Teletransportado a: ${x}, ${y}, ${z}`);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'F3') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

/*[Fin de sección]*/

    /*sección [PANEL DEBUG - VISIBILIDAD Y ACTUALIZACIÓN] Control de visibilidad e información en tiempo real*/
show() {
        this.isVisible = true;
        this.panel.classList.add('active');
        this.startInfoUpdate();
    }

    hide() {
        this.isVisible = false;
        this.panel.classList.remove('active');
        this.stopInfoUpdate();

        // ⭐ NUEVO: Resetear los checkboxes al estado del debugState actual
        document.getElementById('debug-god-mode').checked = this.debugState.godMode;
        document.getElementById('debug-infinite-ammo').checked = this.debugState.infiniteAmmo;
        document.getElementById('debug-fly-mode').checked = this.debugState.flyMode;
        document.getElementById('debug-noclip').checked = this.debugState.noClip;

        const speedSlider = document.getElementById('debug-speed');
        if (speedSlider) {
            speedSlider.value = this.debugState.speedMultiplier;
            document.getElementById('speed-value').textContent = this.debugState.speedMultiplier.toFixed(1) + 'x';
        }
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }

        // ⭐ NUEVO: Asegurarse de que el menú de pausa permanezca visible
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
                e.stopPropagation(); // Evitar que el clic cierre el menú de pausa
                this.toggle();
            });
        }
    }
}

/*[Fin de sección]*/