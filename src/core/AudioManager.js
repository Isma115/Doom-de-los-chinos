// #region Importaciones AudioManager
// Descripción: Importación de constantes de configuración de audio.
import { AUDIO_CONFIG } from '../Constants.js';
// #endregion
// #region Constructor AudioManager
// Descripción: Inicialización del gestor de audio y sus propiedades.
export class AudioManager {
    constructor() {
        this.sounds = {};
        this.music = {};
        this.audioContext = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.initialized = false;
    }
    // #endregion
    // #region Inicialización y Contexto Audio
    // Descripción: Configuración del contexto de audio y carga inicial de sonidos.
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);

            this.musicGain = this.audioContext.createGain();
            this.musicGain.connect(this.masterGain);
            this.musicGain.gain.value = AUDIO_CONFIG.MUSIC_VOLUME;

            this.sfxGain = this.audioContext.createGain();
            this.sfxGain.connect(this.masterGain);
            this.sfxGain.gain.value = AUDIO_CONFIG.SFX_VOLUME;

            await this.loadAllSounds();
            this.initialized = true;
            console.log('AudioManager inicializado correctamente');
        } catch (error) {
            console.warn('No se pudo inicializar el audio:', error);
            this.initialized = false;
        }
    }

    // Método para reanudar el contexto de audio tras interacción del usuario
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log("AudioContext reanudado por gesto del usuario.");
            });
        }
    }
    // #endregion

    // #region Carga de Assets Audio
    // Descripción: Carga asíncrona de archivos de sonido y música.
    async loadAllSounds() {
        const soundFiles = {
            pistol: 'assets/sound/weapons/pistol.mp3',
            machinegun: 'assets/sound/weapons/ametra.mp3',
            shotgun: 'assets/sound/weapons/shotgun.mp3',
            knife: 'assets/sound/weapons/knife.mp3',  // ← NUEVO: sonido del cuchillo
            out_of_ammo: 'assets/sound/weapons/out_of_ammo.mp3',
            enemyDeath: 'assets/sound/enemy_death.mp3',
            enemyHit: 'assets/sound/enemy_hit.mp3',
            bloodSplat1: 'assets/sound/misc/blood-splat-1.wav',
            bloodSplat2: 'assets/sound/misc/blood-splat-2.wav',
            bloodSplat3: 'assets/sound/misc/blood-splat-3.mp3',
            bloodSplat4: 'assets/sound/misc/blood-splat-4.mp3',
            bloodSplat5: 'assets/sound/misc/blood-splat-5.mp3',
            playerScream: 'assets/sound/misc/gas.mp3',
            playerHurt: 'assets/sound/player_hurt.mp3',
            grunt1: 'assets/sound/enemy_grunt1.mp3',
            grunt2: 'assets/sound/enemy_grunt2.mp3',
            growl1: 'assets/sound/enemy_growl1.mp3',
            growl2: 'assets/sound/enemy_growl2.mp3',
            hiss1: 'assets/sound/enemy_hiss1.mp3',
            roar1: 'assets/sound/enemy_roar1.mp3',
            doorOpen: 'assets/sound/door_open.mp3',
            collectItem: 'assets/sound/collect.mp3',
            background: 'assets/sound/background_music.mp3',
            lpdpm: 'assets/sound/music/LPDPM.mp3',
            lpdmc: 'assets/sound/music/LPDMC.mp3'
        };
        const loadPromises = Object.entries(soundFiles).map(async ([key, path]) => {
            try {
                const buffer = await this.loadSound(path);
                if (key === 'background' || key === 'lpdpm' || key === 'lpdmc') {
                    this.music[key] = buffer;
                } else {
                    this.sounds[key] = buffer;
                }
            } catch (error) {
                console.warn(`No se pudo cargar el sonido ${key}:`, error);
            }
        });
        await Promise.all(loadPromises);
    }

    async loadSound(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (error) {
            console.warn(`Error cargando sonido ${url}:`, error);
            return null;
        }
    }
    // #endregion

    // #region Reproducción SFX Audio
    // Descripción: Métodos para reproducir efectos de sonido puntuales.
    playSound(soundName, volume = 1.0, loop = false, pitch = 1.0) {
        if (!this.initialized || !this.sounds[soundName]) {
            return null;
        }

        try {
            const source = this.audioContext.createBufferSource();
            source.buffer = this.sounds[soundName];

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = volume;

            source.playbackRate.value = pitch;
            source.loop = loop;

            source.connect(gainNode);
            gainNode.connect(this.sfxGain);

            source.start(0);
            return source;
        } catch (error) {
            console.warn(`Error reproduciendo sonido ${soundName}:`, error);
            return null;
        }
    }
    // #endregion
    // #region Reproducción Música Audio
    // Descripción: Gestión de la música de fondo, incluyendo loops y cambio de pistas.
    playMusic(musicName, volume = 1.0) {
        if (!this.initialized || !this.music[musicName]) {
            return null;
        }

        try {
            if (this.currentMusic) {
                this.currentMusic.stop();
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = this.music[musicName];

            // FORZAR SIEMPRE LOOP GLOBAL
            source.loop = true;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = volume * 2.5;  // Aumentado aún más (de 1.8 → 2.5) para que la música suene claramente más fuerte incluso al 100%

            source.connect(gainNode);
            gainNode.connect(this.musicGain);

            source.start(0);

            this.currentMusic = source;
            this.currentMusicGain = gainNode;
            return source;
        } catch (error) {
            console.warn(`Error reproduciendo música ${musicName}:`, error);
            return null;
        }
    }

    stopMusic() {
        if (this.currentMusic) {
            try {
                this.currentMusic.stop();
                this.currentMusic = null;
            } catch (error) {
                console.warn('Error deteniendo música:', error);
            }
        }
    }
    // #endregion
    // #region Control de Volumen Audio
    // Descripción: Ajuste dinámico del volumen de música y efectos.
    setMusicVolume(volume) {
        if (this.musicGain) {
            // Aumentamos el límite máximo permitido para que al 100% realmente suene mucho más alto
            const clampedVolume = Math.max(0, Math.min(AUDIO_CONFIG.MAX_VOLUME_MULTIPLIER * 2.5, volume));
            this.musicGain.gain.value = clampedVolume;
        }
    }

    setSFXVolume(volume) {
        if (this.sfxGain) {
            const clampedVolume = Math.max(0, Math.min(AUDIO_CONFIG.MAX_VOLUME_MULTIPLIER, volume));
            this.sfxGain.gain.value = clampedVolume;
        }
    }
    // #endregion    // #region Utilidades de Sonido Audio
    // Descripción: Funciones auxiliares para sonido aleatorio y audio posicional 3D.
    playRandomEnemySound(enemyType) {
        if (!enemyType.sounds || enemyType.sounds.length === 0) return;
        const randomSound = enemyType.sounds[Math.floor(Math.random() * enemyType.sounds.length)];
        const randomPitch = 0.8 + Math.random() * 0.4;
        const randomVolume = 0.3 + Math.random() * 0.3;

        this.playSound(randomSound, randomVolume, false, randomPitch);
    }

    play3DSound(soundName, listenerPos, soundPos, maxDistance = 50, volume = 1.0) {
        if (!this.initialized || !this.sounds[soundName]) {
            return null;
        }

        const distance = listenerPos.distanceTo(soundPos);
        if (distance > maxDistance) return null;
        const attenuation = 1 - (distance / maxDistance);
        const finalVolume = volume * attenuation * attenuation;

        return this.playSound(soundName, finalVolume);
    }
    // #endregion

    // #region Limpieza Audio
    // Descripción: Liberación de recursos del contexto de audio.
    dispose() {
        this.stopMusic();
        if (this.audioContext) {
            this.audioContext.close();
        }

        this.sounds = {};
        this.music = {};
        this.initialized = false;
    }
    // #endregion
}
