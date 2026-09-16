// Pickups de curación disponibles en los mapas y spawners.
import { CONFIG } from './config.js';

export const FOOD_TYPES = [
    {
        id: 'kebab',
        name: 'Kebab',
        texture: 'assets/textures/kebab.png',
        healAmount: CONFIG.FOOD_HEAL_AMOUNT,
        scale: 3
    },
    {
        id: 'ham_tapa',
        name: 'Tapa de jamón',
        texture: 'assets/textures/food_ham_tapa.png',
        healAmount: 20,
        scale: 2.7
    },
    {
        id: 'paella',
        name: 'Paella',
        texture: 'assets/textures/food_paella.png',
        healAmount: 40,
        scale: 2.8
    },
    {
        id: 'cocido',
        name: 'Cuenco de cocido',
        texture: 'assets/textures/food_cocido.png',
        healAmount: 60,
        scale: 2.8
    }
];
