import * as THREE from 'three';
import { CONFIG, WEAPONS_DATA } from '../Constants.js';
import { getAimAssistStrength, setAimAssistStrength } from '../core/AimAssist.js';
import { isMobileMode } from '../mobile/isMobile.js';

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

    // El marcador interno sigue disponible para la lógica del juego, pero
    // no se muestra ningún contador de enemigos en pantalla.
    static updateScore() {
        // Se conserva el método para que las llamadas existentes no alteren
        // la lógica de puntuación ni creen elementos en el HUD.
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
    static hideEventMessage() {
        const msgEl = document.getElementById('event-message');
        if (this.currentMsgTimeout) {
            clearTimeout(this.currentMsgTimeout);
            this.currentMsgTimeout = null;
        }
        if (msgEl) msgEl.style.opacity = '0';
    }

    static showEventMessage(text, duration = 3000) {
        // El Hormiguero no muestra textos emergentes; se mantiene el HUD
        // jugable, pero se silencian mensajes de oleadas, armas y eventos.
        if (this.currentMapName === 'mapa2') {
            this.hideEventMessage();
            return;
        }

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
        if (this.currentMapName === 'mapa2') {
            this.hideCountdown();
            return;
        }

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

    static showLoadingScreen(mapName = 'default') {
        this.currentMapName = mapName;
        this.hideEventMessage();

        const screen = document.getElementById('loading-screen');
        if (!screen) return;

        const mapLabels = {
            mapa1: 'PARQUE',
            mapa2: 'EL HORMIGUERO',
            pruebas_alien: 'PRUEBAS: ESQUELETO MINIGUN'
        };
        const label = mapLabels[mapName] || String(mapName || 'MAPA').toUpperCase();
        const mapNameElement = document.getElementById('loading-map-name');
        if (mapNameElement) mapNameElement.textContent = label;

        screen.classList.add('visible');
        screen.setAttribute('aria-busy', 'true');
        screen.setAttribute('aria-hidden', 'false');
    }

    static hideLoadingScreen() {
        const screen = document.getElementById('loading-screen');
        if (!screen) return;

        screen.classList.remove('visible');
        screen.setAttribute('aria-busy', 'false');
        screen.setAttribute('aria-hidden', 'true');
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
                if (pauseSubtitle) {
                    pauseSubtitle.innerText = isMobileMode()
                        ? "Pausa - Toca para continuar"
                        : "Pausa - Click para continuar";
                }
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
