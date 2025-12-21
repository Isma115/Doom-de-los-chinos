// *-- Importaciones EventManager
import * as THREE from '../../node_modules/three/build/three.module.js';
import { UIManager } from '../UI.js';
import { CONFIG } from '../Constants.js';
import { WaveEvent } from '../eventos/WaveEvent.js';

// *-- Clase EventManager
export class EventManager {
    constructor(scene, enemyManager, audioManager, world) {
        this.scene = scene;
        this.enemyManager = enemyManager;
        this.audioManager = audioManager;
        this.world = world;

        this.events = [];
        this.processedEvents = new Set();
        this.timeElapsed = 0;
        this.waveEvent = null;

        this.postProcessingEnabled = false;

        // *-- Inicialización
        this.initDefaultEvents();

        const genericSpawners = world.getGenericSpawners();
        if (genericSpawners && genericSpawners.length > 0) {
            this.waveEvent = new WaveEvent(enemyManager, world);

            // Asignar AudioManager al WaveEvent
            this.waveEvent.audioManager = audioManager;

            console.log('Wave system initialized with', genericSpawners.length, 'generic spawners');
        }
    }

    // *-- Carga de Eventos
    async loadEventsForMap(mapName) {
        try {
            const res = await fetch(`eventos/${mapName}_events.json`);
            const data = await res.json();

            data.forEach(ev => this.addEvent(ev));

            console.log(`Eventos cargados para el mapa: ${mapName}`);
        } catch (err) {
            console.warn(`No hay archivo de eventos para este mapa (${mapName})`);
        }

        // Activar música LPDPM si es el mapa de fortaleza
        if (this.waveEvent && mapName === 'mapa1') {
            this.waveEvent.isFortalezaMap = true;
            console.log('Mapa de fortaleza detectado - Música LPDPM activada para rondas 1 y 2');
        }
    }

    initDefaultEvents() {

    }

    addEvent(eventData) {
        this.events.push(eventData);
    }

    // *-- Loop Principal EventManager
    update(delta, playerPosition) {
        this.timeElapsed += delta;

        // Update wave event if active
        if (this.waveEvent) {
            this.waveEvent.update(delta);
        }

        this.events.forEach(event => {
            if (this.processedEvents.has(event.id)) return;

            let triggered = false;

            // Lógica de Triggers
            if (event.trigger.type === 'AREA') {
                const dist = playerPosition.distanceTo(event.trigger.position);
                if (dist < event.trigger.radius) {
                    triggered = true;
                }
            } else if (event.trigger.type === 'TIME') {
                if (this.timeElapsed >= event.trigger.value) {
                    triggered = true;
                }
            }

            // Ejecución de acciones
            if (triggered) {
                console.log(`Evento disparado: ${event.id}`);
                this.executeActions(event.actions, playerPosition);
                this.processedEvents.add(event.id);
            }
        });
    }

    // *-- Ejecución de Acciones
    executeActions(actions, playerPos) {
        actions.forEach(action => {
            switch (action.type) {
                case 'MESSAGE':
                    UIManager.showEventMessage(action.text, action.duration);
                    break;

                case 'SOUND':
                    if (this.audioManager) {
                        this.audioManager.playSound(action.id, action.volume || 1.0);
                    }
                    break;

                case 'SPAWN':
                    if (this.enemyManager) {
                        for (let i = 0; i < (action.count || 1); i++) {
                            // Calcular posición aleatoria alrededor del jugador
                            const angle = Math.random() * Math.PI * 2;
                            const offset = action.offset || 5;
                            const spawnPos = new THREE.Vector3(
                                playerPos.x + Math.cos(angle) * offset,
                                1,
                                playerPos.z + Math.sin(angle) * offset
                            );

                            // Buscar tipo de enemigo o aleatorio
                            const enemyType = action.enemyType ?
                                { id: action.enemyType } : null; // EnemyManager resolverá el objeto completo si es null o buscará por ID si implementamos la lógica, 
                            // por ahora pasamos null para aleatorio o modificamos EnemyManager para aceptar IDs.

                            // Nota: EnemyManager.spawn espera un objeto tipo o null. 
                            // Para ser robustos, llamamos spawn con null (aleatorio) si no tenemos el objeto tipo a mano,
                            // o modificamos EnemyManager para buscar por string.
                            // Asumiremos spawn aleatorio para simplificar o null.
                            this.enemyManager.spawn(performance.now(), null, spawnPos);
                        }
                    }
                    break;

                case 'LIGHT_FLASH':
                    const originalFog = this.scene.fog ? this.scene.fog.color.getHex() : 0x000000;
                    if (this.scene.fog) {
                        this.scene.fog.color.setHex(action.color);
                        setTimeout(() => {
                            if (this.scene.fog) this.scene.fog.color.setHex(originalFog);
                        }, action.duration);
                    }
                    break;
            }
        });
    }
}