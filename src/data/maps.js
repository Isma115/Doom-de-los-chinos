// Mapas jugables y portal de salida.
export const AVAILABLE_MAPS = [
    { id: 'default', name: 'Nivel de Entrenamiento' },
    { id: 'mapa1', name: 'Parque' },
    { id: 'mapa2', name: 'El Hormiguero' },
    // Se conserva el id para no romper enlaces de prueba existentes.
    { id: 'pruebas_alien', name: 'Pruebas: Esqueleto Minigun' }
];

// Atlas animado que aparece al completar las rondas de Parque.
// Al terminar Parque, el portal lleva al patio de El Hormiguero.
export const EXIT_PORTAL_CONFIG = {
    texture: 'assets/textures/portal_exit.png?v=3',
    columns: 8,
    rows: 1,
    frameWidth: 256,
    frameHeight: 512,
    frames: 8,
    fps: 10,
    width: 5.2,
    height: 7.2,
    groundOffset: 0.55,
    activationDistance: 4.5,
    destinationMap: 'mapa2'
};
