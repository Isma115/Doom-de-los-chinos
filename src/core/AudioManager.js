/*sección [GESTOR DE AUDIO] Código de gestión de audio*/
import { AUDIO_CONFIG } from '../Constants.js';
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

    // ⭐ NUEVO: Método para reanudar el contexto de audio tras interacción del usuario
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log("AudioContext reanudado por gesto del usuario.");
            });
        }
    }

    async loadAllSounds() {
        const soundFiles = {
            pistol: 'assets/sound/weapons/pistol.mp3',
            machinegun: 'assets/sound/weapons/ametra.mp3',
            enemyDeath: 'assets/sound/enemy_death.mp3',
            enemyHit: 'assets/sound/enemy_hit.mp3',
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
            background: 'assets/sound/background_music.mp3'
        };
        const loadPromises = Object.entries(soundFiles).map(async ([key, path]) => {
            try {
                const buffer = await this.loadSound(path);
                if (key === 'background') {
                    this.music[key] = buffer;
                } else 
                {
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

        // ⭐ FORZAR SIEMPRE LOOP GLOBAL
        source.loop = true;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;

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

    setMusicVolume(volume) {
        if (this.musicGain) {
            this.musicGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    setSFXVolume(volume) {
        if (this.sfxGain) {
            this.sfxGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

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

    dispose() {
        this.stopMusic();
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.sounds = {};
        this.music = {};
        this.initialized = false;
    }
}
/*[Fin de sección]*/