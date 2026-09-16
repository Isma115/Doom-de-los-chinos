// Definición de estadísticas y propiedades visuales de las armas.
// Extraído de src/Constants.js sin cambios de balance.
import * as THREE from 'three';

export const pistolGeometry = new THREE.BoxGeometry(0.2, 0.2, 1);
export const machineGunGeometry = new THREE.BoxGeometry(0.15, 0.15, 1.5);

export const WEAPONS_DATA = [
    {
        name: "PISTOLA TÁCTICA",
        color: 0x00ff00,
        damage: 25,
        delay: 400,
        ammo: 100,
        maxAmmo: 100,
        geo: pistolGeometry,
        shootSound: 'pistol',
        sprite: 'pistol.png',
        flash: 'pistol_flash.png',
        isMelee: false
    },
    {
        name: "AMETRALLADORA",
        color: 0xff0000,
        damage: 10,
        delay: 100,
        ammo: 600,
        maxAmmo: 600,
        ammoGroup: 'machinegun',
        geo: machineGunGeometry,
        shootSound: 'machinegun',
        sprite: 'ametralla.png',
        flash: 'ametralla_flash.png',
        isMelee: false
    },
    {
        name: "CUCHILLO",
        damage: 45,
        delay: 600,               // cadencia media (más lento que pistola)
        range: 5.6,               // rango duplicado
        ammo: Infinity,
        maxAmmo: Infinity,
        shootSound: 'knife',
        sprite: 'knife.png',
        flash: 'knife.png',
        isMelee: true
    },
    {
        name: "ESCOPETA",
        color: 0xffff00,
        damage: 18,
        delay: 650,
        ammo: 50,
        maxAmmo: 50,
        geo: pistolGeometry,      // reutilizamos geometría temporalmente hasta tener modelo
        shootSound: 'shotgun',
        sprite: 'shotgun.png',
        flash: 'shotgun_flash.png',
        isMelee: false,
        pelletCount: 9,
        spread: 0.085
    },
    {
        id: 'rpg',
        name: "LANZACOHETES",
        color: 0x667744,
        damage: 460,
        delay: 900,
        ammo: 0,
        maxAmmo: 20,
        shootSound: 'rocketLaunch',
        explosionSound: 'rocketExplosion',
        sprite: 'rpg.png',
        flash: 'rpg_flash.png',
        isMelee: false,
        projectileType: 'rocket',
        projectileSpeed: 82,
        rocketRadius: 0.22,
        armingDistance: 2.0,
        explosionRadius: 17.0,
        rocketJumpStrength: 24,
        explosionDamage: 340,
        explosionFalloff: 0.55,
        pickupAmmo: 6,
        pickupTexture: 'assets/textures/rpg_pickup.png',
        pickupScale: 1.35,
        requiresPickup: true
    },
    {
        id: 'minigun',
        name: "MINIGUN",
        color: 0x7c8791,
        damage: 18,
        delay: 32,
        ammo: 600,
        maxAmmo: 600,
        ammoGroup: 'machinegun',
        geo: machineGunGeometry,
        shootSound: 'machinegun',
        sprite: 'minigun.png',
        flash: 'minigun_flash.png',
        flashDuration: 50,
        recoil: 5,
        viewRecoilDistance: 0.1,
        viewRecoilDrop: 0.02,
        viewRecoilDuration: 70,
        isMelee: false
    },
    {
        id: 'constructor',
        name: "CONSTRUCTOR",
        damage: 0,
        delay: 200,
        ammo: Infinity,
        maxAmmo: Infinity,
        shootSound: null,
        // Sin sprite: es una herramienta, no un arma. WeaponSystem la
        // oculta y muestra el HUD de construcción en su lugar.
        sprite: null,
        flash: null,
        isMelee: false,
        isTool: true,
        isConstruction: true
    }
];

export function findWeaponDef(idOrIndex) {
    if (Number.isInteger(idOrIndex)) return WEAPONS_DATA[idOrIndex] ?? null;
    return WEAPONS_DATA.find(w => w.id === idOrIndex || w.name === idOrIndex) ?? null;
}
