import * as THREE from 'three';
import { CONFIG, WEAPONS_DATA, AUDIO_CONFIG } from '../Constants.js';
import { getAimAssistStrength, setAimAssistStrength } from '../core/AimAssist.js';
import { isMobileMode } from '../mobile/isMobile.js';

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
        this.aimSlider = document.getElementById('aim-assist-strength');
        this.aimValueEl = document.getElementById('aim-assist-value');

        // AUDIO_CONFIG ya viene importado de data/config; el fallback
        // solo cubre partidas viejas que lo inyectaban en window.
        if (typeof window !== 'undefined' && !window.AUDIO_CONFIG && AUDIO_CONFIG) {
            window.AUDIO_CONFIG = AUDIO_CONFIG;
        }

        this.loadSettings();
        this.setupEventListeners();
    }
    // #endregion

    // #region Persistencia SettingsManager
    loadSettings() {
        const savedSettings = localStorage.getItem('gameAudioSettings');
        const mobile = isMobileMode();
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                this.musicSlider.value = settings.musicVolume ?? 30;
                this.sfxSlider.value = settings.sfxVolume ?? 50;

                if (this.resolutionSelect) {
                    this.resolutionSelect.value = mobile
                        ? '720p'
                        : ((settings.resolution === '1080p' || settings.resolution === '720p')
                            ? settings.resolution
                            : '1080p');
                }
            } catch (error) {
                console.warn('No se pudieron cargar los ajustes guardados:', error);
            }
        }

        if (this.resolutionSelect && mobile) {
            this.resolutionSelect.value = '720p';
            this.resolutionSelect.disabled = true;
        }

        this.updateMusicVolume();
        this.updateSFXVolume();
        this.updateAimAssistUI();
        this.applyResolution();
    }

    saveSettings() {
        const settings = {
            musicVolume: parseInt(this.musicSlider.value),
            sfxVolume: parseInt(this.sfxSlider.value),
            resolution: isMobileMode() ? '720p' : (this.resolutionSelect?.value ?? '1080p')
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

        if (this.aimSlider) {
            this.aimSlider.addEventListener('input', () => {
                const strength = setAimAssistStrength(this.aimSlider.value);
                this.aimSlider.value = strength;
                this.updateAimAssistUI();
            });
        }

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

    updateAimAssistUI() {
        const strength = getAimAssistStrength();
        if (this.aimSlider) this.aimSlider.value = strength;
        if (this.aimValueEl) {
            this.aimValueEl.textContent = strength === 0 ? 'OFF' : `${strength}`;
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
