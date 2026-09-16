//  Importaciones EventManager
import * as THREE from 'three';
import { UIManager } from '../UI.js';
import { CONFIG } from '../Constants.js';
import { WaveEvent } from '../eventos/WaveEvent.js';

//  Clase EventManager
export class EventManager {
    constructor(scene, enemyManager, audioManager, world, player = null) {
        this.scene = scene;
        this.enemyManager = enemyManager;
        this.audioManager = audioManager;
        this.world = world;
        this.player = player;

        this.events = [];
        this.processedEvents = new Set();
        this.timeElapsed = 0;
        this.waveEvent = null;
        this.pendingTimeouts = new Set();
        this.disposed = false;

        this.postProcessingEnabled = false;

        //  Inicialización
        this.initDefaultEvents();

        const genericSpawners = world.getGenericSpawners();
        if (world.currentMapName === 'mapa2' || (genericSpawners && genericSpawners.length > 0)) {
            this.waveEvent = new WaveEvent(enemyManager, world, audioManager, player);

            console.log('Wave system initialized with', genericSpawners.length, 'generic spawners');
        }
    }

    //  Carga de Eventos
    async loadEventsForMap(mapName) {
        try {
            const res = await fetch(`eventos/${mapName}_events.json`);
            const data = await res.json();

            data.forEach(ev => this.addEvent(ev));

            console.log(`Eventos cargados para el mapa: ${mapName}`);
        } catch (err) {
            console.warn(`No hay archivo de eventos para este mapa (${mapName})`);
        }
    }

    initDefaultEvents() {

    }

    addEvent(eventData) {
        this.events.push(eventData);
    }

    //  Loop Principal EventManager
    update(delta, playerPosition) {
        if (this.disposed) return;
        this.timeElapsed += delta;

        // Update wave event if active
        if (this.waveEvent) {
            this.waveEvent.update(delta, playerPosition);
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

    //  Ejecución de Acciones
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
                        let timeoutId = null;
                        timeoutId = setTimeout(() => {
                            this.pendingTimeouts.delete(timeoutId);
                            if (!this.disposed && this.scene.fog) {
                                this.scene.fog.color.setHex(originalFog);
                            }
                        }, action.duration);
                        this.pendingTimeouts.add(timeoutId);
                    }
                    break;
            }
        });
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.pendingTimeouts.clear();
        this.waveEvent?.dispose?.();
        this.events = [];
        this.processedEvents.clear();
        this.waveEvent = null;
        this.scene = null;
        this.enemyManager = null;
        this.audioManager = null;
        this.world = null;
        this.player = null;
    }
}
