/*sección [GESTOR DE EVENTOS] Gestión de eventos dentro del juego*/
import * as THREE from '../../node_modules/three/build/three.module.js';
import { UIManager } from '../UI.js';
import { CONFIG } from '../Constants.js';

export class EventManager {
    constructor(scene, enemyManager, audioManager, world) {
        this.scene = scene;
        this.enemyManager = enemyManager;
        this.audioManager = audioManager;
        this.world = world;

        this.events = [];
        this.processedEvents = new Set();
        this.timeElapsed = 0;

        // Contenedor para efectos visuales temporales
        this.postProcessingEnabled = false;

        // Inicializamos algunos eventos de ejemplo (esto podría cargarse desde el mapa en el futuro)
        this.initDefaultEvents();
    }

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
        // EVENTO 1: Emboscada por proximidad
        this.addEvent({
            id: 'ambush_01',
            trigger: {
                type: 'AREA',
                position: new THREE.Vector3(0, 0, 20), // Ajustar según mapa
                radius: 5.0
            },
            actions: [
                { type: 'MESSAGE', text: "¡ES UNA TRAMPA!", duration: 3000 },
                { type: 'SOUND', id: 'roar1' },
                { type: 'SPAWN', enemyType: 'pablo', count: 2, offset: 5 },
                { type: 'LIGHT_FLASH', color: 0xff0000, duration: 500 }
            ]
        });

        // EVENTO 2: Mensaje de atmósfera por tiempo
        this.addEvent({
            id: 'creepy_atmosphere',
            trigger: {
                type: 'TIME',
                value: 10 // A los 10 segundos
            },
            actions: [
                { type: 'MESSAGE', text: "Algo te observa desde la oscuridad...", duration: 4000 },
                { type: 'SOUND', id: 'hiss1', volume: 0.8 }
            ]
        });
    }

    addEvent(eventData) {
        this.events.push(eventData);
    }

    update(delta, playerPosition) {
        this.timeElapsed += delta;

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
/*[Fin de sección]*/