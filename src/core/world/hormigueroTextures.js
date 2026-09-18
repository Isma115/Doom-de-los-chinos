// Texturas del plató de El Hormiguero.
// Vivía como const de módulo en World.js; se extrae aquí porque los
// builders (HormigueroSetBuilder, SecretRoomBuilder, HormigueroDeskBuilder,
// HormigueroBleachersBuilder) también la usan.
export const HORMIGUERO_TEXTURES = Object.freeze({
    floor: 'assets/textures/hormiguero/studio_floor.png',
    wood: 'assets/textures/hormiguero/crate_wood.png',
    metal: 'assets/textures/hormiguero/studio_metal.png',
    concrete: 'assets/textures/hormiguero/studio_concrete.jpg',
    buildingWall: 'assets/textures/hormiguero/concrete_wall.png',
    // Atlas y recortes pixel-art propios del prop de cámara de estudio.
    // Los recortes permiten que cada pieza use un material legible sin
    // mostrar todo el atlas en cada cara de una caja.
    cameraAtlas: 'assets/textures/studio_camera_lowres.png',
    cameraBody: 'assets/textures/studio_camera_body_lowres.png',
    cameraMetal: 'assets/textures/studio_camera_metal_lowres.png',
    cameraLens: 'assets/textures/studio_camera_lens_lowres.png',
    cameraAmber: 'assets/textures/studio_camera_amber_lowres.png'
});
