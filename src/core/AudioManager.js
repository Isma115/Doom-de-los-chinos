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
        this.currentMusic = null;
        this.currentMusicGain = null;
        this.currentMusicName = null;
        this.proceduralSoundBuffers = {};
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
            shotgun: 'assets/sound/weapons/shotgun_realistic.mp3',
            reload: 'assets/sound/weapons/reload.mp3',
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
            collectItem: 'assets/sound/collect.mp3',
            background: 'assets/sound/background_music.mp3',
            lpdpm: 'assets/sound/music/LPDPM.mp3',
            lpdmc: 'assets/sound/music/LPDMC.mp3',
            cocayCocaina: 'assets/sound/music/CocayCocaina.mp3',
            conejitoCocainomano: 'assets/sound/music/ConejitoCocainomano.mp3'
        };
        const loadPromises = Object.entries(soundFiles).map(async ([key, path]) => {
            try {
                const buffer = await this.loadSound(path);
                if (
                    key === 'background'
                    || key === 'lpdpm'
                    || key === 'lpdmc'
                    || key === 'cocayCocaina'
                    || key === 'conejitoCocainomano'
                ) {
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
        if (!this.initialized) {
            return null;
        }

        // door_open.mp3 no está disponible en los assets actuales; usar un
        // efecto mecánico sintetizado mantiene la apertura audible igualmente.
        if (soundName === 'doorOpen' && !this.sounds[soundName]) {
            return this.playDoorOpenSound(volume, pitch);
        }

        if (soundName === 'enemySpawnTeleport' && !this.sounds[soundName]) {
            return this.playTeleportSound(volume, pitch);
        }

        if (soundName === 'rocketLaunch' && !this.sounds[soundName]) {
            return this.playRocketLaunchSound(volume, pitch);
        }

        if (soundName === 'rocketExplosion' && !this.sounds[soundName]) {
            return this.playRocketExplosionSound(volume, pitch);
        }

        if (!this.sounds[soundName]) {
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

    playRocketLaunchSound(volume = 1.0, pitch = 1.0) {
        if (!this.audioContext || !this.sfxGain) return null;

        try {
            const context = this.audioContext;
            const startTime = context.currentTime;
            const duration = 0.42;
            const safeVolume = Math.max(0, Math.min(1, volume));
            const safePitch = Math.max(0.5, pitch);
            const outputGain = context.createGain();
            outputGain.gain.setValueAtTime(0.0001, startTime);
            outputGain.gain.exponentialRampToValueAtTime(
                Math.max(0.015, safeVolume * 0.34),
                startTime + 0.025
            );
            outputGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            outputGain.connect(this.sfxGain);

            const motor = context.createOscillator();
            const motorGain = context.createGain();
            const motorFilter = context.createBiquadFilter();
            motor.type = 'sawtooth';
            motor.frequency.setValueAtTime(145 * safePitch, startTime);
            motor.frequency.exponentialRampToValueAtTime(48 * safePitch, startTime + duration);
            motorFilter.type = 'lowpass';
            motorFilter.frequency.setValueAtTime(1200, startTime);
            motorFilter.frequency.exponentialRampToValueAtTime(260, startTime + duration);
            motorGain.gain.value = 0.8;
            motor.connect(motorFilter);
            motorFilter.connect(motorGain);
            motorGain.connect(outputGain);
            motor.start(startTime);
            motor.stop(startTime + duration);

            return motor;
        } catch (error) {
            console.warn('Error reproduciendo sonido de lanzamiento del RPG:', error);
            return null;
        }
    }

    playRocketExplosionSound(volume = 1.0, pitch = 1.0) {
        if (!this.audioContext || !this.sfxGain) return null;

        try {
            const context = this.audioContext;
            const startTime = context.currentTime;
            const duration = 0.58;
            const safeVolume = Math.max(0, Math.min(1, volume));
            const safePitch = Math.max(0.5, pitch);
            const outputGain = context.createGain();
            outputGain.gain.setValueAtTime(0.0001, startTime);
            outputGain.gain.exponentialRampToValueAtTime(
                Math.max(0.02, safeVolume * 0.55),
                startTime + 0.015
            );
            outputGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            outputGain.connect(this.sfxGain);

            const boom = context.createOscillator();
            const boomGain = context.createGain();
            boom.type = 'sine';
            boom.frequency.setValueAtTime(115 * safePitch, startTime);
            boom.frequency.exponentialRampToValueAtTime(34 * safePitch, startTime + duration);
            boomGain.gain.value = 1.0;
            boom.connect(boomGain);
            boomGain.connect(outputGain);
            boom.start(startTime);
            boom.stop(startTime + duration);

            if (!this.proceduralSoundBuffers.rocketExplosion) {
                const frameCount = Math.floor(context.sampleRate * duration);
                const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
                const noiseData = noiseBuffer.getChannelData(0);
                for (let index = 0; index < frameCount; index++) {
                    const progress = index / frameCount;
                    noiseData[index] = (Math.random() * 2 - 1) * (1 - progress * 0.9);
                }
                this.proceduralSoundBuffers.rocketExplosion = noiseBuffer;
            }

            const noise = context.createBufferSource();
            const noiseFilter = context.createBiquadFilter();
            const noiseGain = context.createGain();
            noise.buffer = this.proceduralSoundBuffers.rocketExplosion;
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(2200, startTime);
            noiseFilter.frequency.exponentialRampToValueAtTime(160, startTime + duration);
            noiseGain.gain.value = 0.75;
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(outputGain);
            noise.start(startTime);
            noise.stop(startTime + duration);

            return boom;
        } catch (error) {
            console.warn('Error reproduciendo sonido de explosión del RPG:', error);
            return null;
        }
    }

    playDoorOpenSound(volume = 1.0, pitch = 1.0) {
        if (!this.audioContext || !this.sfxGain) {
            return null;
        }

        try {
            const context = this.audioContext;
            const startTime = context.currentTime;
            const duration = 0.85;
            const safeVolume = Math.max(0, Math.min(1, volume));
            const safePitch = Math.max(0.5, pitch);

            const outputGain = context.createGain();
            outputGain.gain.setValueAtTime(0.0001, startTime);
            outputGain.gain.exponentialRampToValueAtTime(
                Math.max(0.02, safeVolume * 0.45),
                startTime + 0.04
            );
            outputGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            outputGain.connect(this.sfxGain);

            const motor = context.createOscillator();
            motor.type = 'sawtooth';
            motor.frequency.setValueAtTime(75 * safePitch, startTime);
            motor.frequency.exponentialRampToValueAtTime(185 * safePitch, startTime + duration);
            motor.connect(outputGain);
            motor.start(startTime);
            motor.stop(startTime + duration);

            const metalTone = context.createOscillator();
            const metalGain = context.createGain();
            metalTone.type = 'triangle';
            metalTone.frequency.setValueAtTime(420 * safePitch, startTime);
            metalTone.frequency.exponentialRampToValueAtTime(260 * safePitch, startTime + duration);
            metalGain.gain.setValueAtTime(0.0001, startTime);
            metalGain.gain.linearRampToValueAtTime(safeVolume * 0.16, startTime + 0.06);
            metalGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            metalTone.connect(metalGain);
            metalGain.connect(outputGain);
            metalTone.start(startTime);
            metalTone.stop(startTime + duration);

            if (!this.proceduralSoundBuffers.doorOpen) {
                const frameCount = Math.floor(context.sampleRate * duration);
                const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
                const noiseData = noiseBuffer.getChannelData(0);

                for (let index = 0; index < frameCount; index++) {
                    const fade = 1 - index / frameCount;
                    noiseData[index] = (Math.random() * 2 - 1) * fade;
                }

                this.proceduralSoundBuffers.doorOpen = noiseBuffer;
            }

            const noise = context.createBufferSource();
            const noiseFilter = context.createBiquadFilter();
            const noiseGain = context.createGain();
            noise.buffer = this.proceduralSoundBuffers.doorOpen;
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(900, startTime);
            noiseFilter.frequency.exponentialRampToValueAtTime(1800, startTime + duration);
            noiseFilter.Q.value = 0.8;
            noiseGain.gain.setValueAtTime(0.0001, startTime);
            noiseGain.gain.linearRampToValueAtTime(safeVolume * 0.2, startTime + 0.03);
            noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(outputGain);
            noise.start(startTime);
            noise.stop(startTime + duration);

            return motor;
        } catch (error) {
            console.warn('Error reproduciendo sonido de apertura de puerta:', error);
            return null;
        }
    }

    playTeleportSound(volume = 0.35, pitch = 1.0) {
        if (!this.audioContext || !this.sfxGain) {
            return null;
        }

        try {
            const context = this.audioContext;
            const startTime = context.currentTime;
            const duration = 0.38;
            const safeVolume = Math.max(0, Math.min(1, volume));
            const safePitch = Math.max(0.5, pitch);

            const outputGain = context.createGain();
            outputGain.gain.setValueAtTime(0.0001, startTime);
            outputGain.gain.exponentialRampToValueAtTime(
                Math.max(0.02, safeVolume * 0.9),
                startTime + 0.025
            );
            outputGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            outputGain.connect(this.sfxGain);

            // Barrido grave descendente: da la sensación de cruzar un túnel
            // temporal y cerrar el portal detrás del enemigo.
            const warp = context.createOscillator();
            const warpGain = context.createGain();
            warp.type = 'sawtooth';
            warp.frequency.setValueAtTime(1450 * safePitch, startTime);
            warp.frequency.exponentialRampToValueAtTime(75 * safePitch, startTime + duration * 0.9);
            warpGain.gain.setValueAtTime(0.0001, startTime);
            warpGain.gain.exponentialRampToValueAtTime(0.55, startTime + 0.035);
            warpGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            warp.connect(warpGain);
            warpGain.connect(outputGain);
            warp.start(startTime);
            warp.stop(startTime + duration);

            // Tono central que sube al abrirse y cae al materializarse.
            const portalTone = context.createOscillator();
            const portalGain = context.createGain();
            portalTone.type = 'triangle';
            portalTone.frequency.setValueAtTime(180 * safePitch, startTime);
            portalTone.frequency.exponentialRampToValueAtTime(2300 * safePitch, startTime + 0.16);
            portalTone.frequency.exponentialRampToValueAtTime(125 * safePitch, startTime + duration);
            portalGain.gain.setValueAtTime(0.0001, startTime);
            portalGain.gain.exponentialRampToValueAtTime(0.5, startTime + 0.045);
            portalGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            portalTone.connect(portalGain);
            portalGain.connect(outputGain);
            portalTone.start(startTime);
            portalTone.stop(startTime + duration);

            // Vibrato breve para que el tono no suene como un simple pitido.
            const modulation = context.createOscillator();
            const modulationGain = context.createGain();
            modulation.type = 'sine';
            modulation.frequency.value = 24;
            modulationGain.gain.value = 105;
            modulation.connect(modulationGain);
            modulationGain.connect(portalTone.frequency);
            modulation.start(startTime);
            modulation.stop(startTime + duration);

            // Destello agudo, como energía del portal al atravesar el espacio.
            const shimmer = context.createOscillator();
            const shimmerGain = context.createGain();
            shimmer.type = 'sine';
            shimmer.frequency.setValueAtTime(3000 * safePitch, startTime);
            shimmer.frequency.exponentialRampToValueAtTime(520 * safePitch, startTime + duration * 0.85);
            shimmerGain.gain.setValueAtTime(0.0001, startTime);
            shimmerGain.gain.exponentialRampToValueAtTime(0.28, startTime + 0.02);
            shimmerGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.62);
            shimmer.connect(shimmerGain);
            shimmerGain.connect(outputGain);
            shimmer.start(startTime);
            shimmer.stop(startTime + duration);

            if (!this.proceduralSoundBuffers.teleportPortal) {
                const frameCount = Math.floor(context.sampleRate * duration);
                const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
                const noiseData = noiseBuffer.getChannelData(0);

                for (let index = 0; index < frameCount; index++) {
                    const progress = index / frameCount;
                    noiseData[index] = (Math.random() * 2 - 1) * (1 - progress * 0.85);
                }

                this.proceduralSoundBuffers.teleportPortal = noiseBuffer;
            }

            const noise = context.createBufferSource();
            const noiseFilter = context.createBiquadFilter();
            const noiseGain = context.createGain();
            noise.buffer = this.proceduralSoundBuffers.teleportPortal;
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(300, startTime);
            noiseFilter.frequency.exponentialRampToValueAtTime(4500, startTime + duration * 0.48);
            noiseFilter.frequency.exponentialRampToValueAtTime(500, startTime + duration);
            noiseFilter.Q.value = 0.9;
            noiseGain.gain.setValueAtTime(0.0001, startTime);
            noiseGain.gain.exponentialRampToValueAtTime(
                0.3,
                startTime + 0.035
            );
            noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(outputGain);
            noise.start(startTime);
            noise.stop(startTime + duration);

            return portalTone;
        } catch (error) {
            console.warn('Error reproduciendo sonido de teletransporte:', error);
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

            source.onended = () => {
                if (this.currentMusic === source) {
                    this.currentMusic = null;
                    this.currentMusicGain = null;
                    this.currentMusicName = null;
                }
            };

            source.start(0);

            this.currentMusic = source;
            this.currentMusicGain = gainNode;
            this.currentMusicName = musicName;
            return source;
        } catch (error) {
            console.warn(`Error reproduciendo música ${musicName}:`, error);
            return null;
        }
    }

    playRandomMusic(previousMusicName = null, volume = 1.0, excludedMusicNames = []) {
        const availableMusic = Object.entries(this.music)
            .filter(([, buffer]) => buffer)
            .map(([name]) => name);

        if (availableMusic.length === 0) {
            return null;
        }

        const excluded = new Set(
            Array.isArray(excludedMusicNames) ? excludedMusicNames : []
        );
        const candidatesWithoutHistory = availableMusic.filter(name =>
            name !== previousMusicName && !excluded.has(name)
        );
        // Si ya se han usado todas las pistas disponibles, empezar otro ciclo
        // permitiendo las antiguas, pero seguir evitando repetir la anterior.
        const differentMusic = availableMusic.filter(name => name !== previousMusicName);
        const candidates = candidatesWithoutHistory.length > 0
            ? candidatesWithoutHistory
            : (differentMusic.length > 0 ? differentMusic : availableMusic);
        const musicName = candidates[Math.floor(Math.random() * candidates.length)];

        return this.playMusic(musicName, volume) ? musicName : null;
    }

    stopMusic() {
        const musicSource = this.currentMusic;
        this.currentMusic = null;
        this.currentMusicGain = null;
        this.currentMusicName = null;

        if (musicSource) {
            try {
                musicSource.stop();
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

    play3DSound(soundName, listenerPos, soundPos, maxDistance = 50, volume = 1.0, loop = false, pitch = 1.0) {
        if (!this.initialized || !this.sounds[soundName]) {
            return null;
        }

        const distance = listenerPos.distanceTo(soundPos);
        if (distance > maxDistance) return null;
        const attenuation = 1 - (distance / maxDistance);
        const finalVolume = volume * attenuation * attenuation;

        return this.playSound(soundName, finalVolume, loop, pitch);
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
