// Texturas del plató de El Hormiguero.
// Vivía como const de módulo en World.js; se extrae aquí porque los
// builders (HormigueroSetBuilder, SecretRoomBuilder) también la usan.
export const HORMIGUERO_TEXTURES = Object.freeze({
    floor: 'assets/textures/hormiguero/studio_floor.png',
    wood: 'assets/textures/hormiguero/crate_wood.png',
    metal: 'assets/textures/hormiguero/studio_metal.png',
    concrete: 'assets/textures/hormiguero/studio_concrete.jpg',
    buildingWall: 'assets/textures/hormiguero/concrete_wall.png'
});
