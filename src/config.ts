// Game balance tables. Depths are positive metres below the surface.

export interface Species {
  id: string;
  name: string;
  minDepth: number;
  maxDepth: number;
  price: number;
  hp: number;
  damage: number; // per bite, before armour
  speed: number;
  size: number; // body length in metres
  color: number;
  belly: number;
  infection: number; // 0 = healthy, 1 = mostly eaten by antoplasm
  aggressive: boolean;
  shape: 'round' | 'long' | 'eel' | 'flat' | 'angler';
  lore: string;
}

export const SPECIES: Species[] = [
  { id: 'bluegill', name: 'Bluegill', minDepth: 1, maxDepth: 45, price: 5, hp: 1, damage: 0, speed: 3.2, size: 0.75, color: 0x4f8fc0, belly: 0xf2c46a, infection: 0, aggressive: false, shape: 'round', lore: 'A bright little sunfish. Harmless.' },
  { id: 'perch', name: 'Yellow Perch', minDepth: 8, maxDepth: 80, price: 10, hp: 2, damage: 0, speed: 3.6, size: 1.0, color: 0xc9b23c, belly: 0xeee6b0, infection: 0, aggressive: false, shape: 'long', lore: 'Striped and skittish. Sells well at the market.' },
  { id: 'trout', name: 'Silver Trout', minDepth: 40, maxDepth: 135, price: 20, hp: 3, damage: 0, speed: 4.4, size: 1.3, color: 0x9fb4c0, belly: 0xe7eef2, infection: 0.05, aggressive: false, shape: 'long', lore: 'Some have small grey spots near the gills. Probably nothing.' },
  { id: 'pike', name: 'Lake Pike', minDepth: 90, maxDepth: 210, price: 38, hp: 5, damage: 7, speed: 5.2, size: 1.9, color: 0x55703c, belly: 0xc8c89a, infection: 0.18, aggressive: true, shape: 'long', lore: 'It bites. There are wet red patches where its scales have fallen out.' },
  { id: 'eel', name: 'Sallow Eel', minDepth: 150, maxDepth: 285, price: 65, hp: 6, damage: 11, speed: 4.6, size: 2.8, color: 0x6d6450, belly: 0x9a8f78, infection: 0.32, aggressive: true, shape: 'eel', lore: 'Its skin comes away in sheets. Underneath, something red keeps moving.' },
  { id: 'catfish', name: 'Weeping Catfish', minDepth: 230, maxDepth: 365, price: 115, hp: 9, damage: 17, speed: 4.2, size: 2.6, color: 0x4a3d36, belly: 0x86715e, infection: 0.5, aggressive: true, shape: 'flat', lore: 'Antoplasm has eaten through to the spine. It is still alive. It is still hungry.' },
  { id: 'gar', name: 'Hollow Gar', minDepth: 320, maxDepth: 455, price: 195, hp: 12, damage: 25, speed: 5.8, size: 3.3, color: 0x3c3a36, belly: 0x6e655a, infection: 0.68, aggressive: true, shape: 'long', lore: 'More ribcage than fish. The red mass inside it pulses when it sees your light.' },
  { id: 'maw', name: 'Lantern Maw', minDepth: 400, maxDepth: 545, price: 330, hp: 16, damage: 35, speed: 5.0, size: 3.0, color: 0x241c1c, belly: 0x4a3434, infection: 0.82, aggressive: true, shape: 'angler', lore: 'The lure is not a light. It is a swollen knot of antoplasm, glowing.' },
  { id: 'husk', name: 'Antoplasm Husk', minDepth: 480, maxDepth: 640, price: 560, hp: 22, damage: 46, speed: 6.2, size: 4.0, color: 0x1e1414, belly: 0x3a2020, infection: 1, aggressive: true, shape: 'long', lore: 'There is no fish left. Only bone, wrapped in something that learned how to swim.' },
];

export interface Tier { cost: number; label: string }
export interface AirTier extends Tier { seconds: number }
export interface HarpoonTier extends Tier { damage: number; reload: number; speed: number }
export interface ArmorTier extends Tier { reduction: number; rating: number }

export const AIR: AirTier[] = [
  { cost: 0, label: 'Rental Tank', seconds: 50 },
  { cost: 45, label: 'Steel 12L', seconds: 80 },
  { cost: 140, label: 'Twin 15L', seconds: 120 },
  { cost: 340, label: 'Rebreather', seconds: 175 },
  { cost: 750, label: 'Closed-Circuit Rig', seconds: 250 },
  { cost: 1500, label: 'Abyssal Lung', seconds: 360 },
];

export const HARPOON: HarpoonTier[] = [
  { cost: 0, label: 'Sling Spear', damage: 1, reload: 1.15, speed: 55 },
  { cost: 55, label: 'Band Gun', damage: 2, reload: 1.0, speed: 65 },
  { cost: 160, label: 'Pneumatic Gun', damage: 3, reload: 0.85, speed: 78 },
  { cost: 380, label: 'Barbed Railgun', damage: 5, reload: 0.7, speed: 90 },
  { cost: 820, label: 'Powerhead', damage: 8, reload: 0.55, speed: 105 },
  { cost: 1650, label: 'Bone Splitter', damage: 12, reload: 0.42, speed: 125 },
];

export const ARMOR: ArmorTier[] = [
  { cost: 0, label: 'Wetsuit', reduction: 0, rating: 90 },
  { cost: 60, label: 'Neoprene Plate', reduction: 0.15, rating: 175 },
  { cost: 180, label: 'Chainmail Suit', reduction: 0.3, rating: 275 },
  { cost: 420, label: 'Pressure Shell', reduction: 0.45, rating: 395 },
  { cost: 900, label: 'Atmospheric Hardsuit', reduction: 0.58, rating: 525 },
  { cost: 1800, label: 'Leviathan Hardsuit', reduction: 0.7, rating: 700 },
];

export const MAX_DEPTH = 620; // trench floor
export const ENDING_DEPTH = 600;
export const LAKE_RADIUS = 360;
export const BOAT_POS = { x: 0, z: 300 };

// Thoughts that surface the first time the diver passes a depth.
export const DEPTH_LOGS: { depth: number; text: string }[] = [
  { depth: 20, text: 'The water is clear and warm. Good fishing today.' },
  { depth: 70, text: 'Quieter down here. The light goes green, then grey.' },
  { depth: 120, text: 'Some of the trout have grey spots. Old Teodor says it\'s parasites.' },
  { depth: 180, text: 'RADIO: "...diver, you\'re breaking up... fish at this depth fetch triple, but..."' },
  { depth: 240, text: 'The flesh is coming off them. They don\'t seem to notice.' },
  { depth: 300, text: 'Antoplasm. The fishermen whisper the word like a prayer. It eats them from the inside.' },
  { depth: 360, text: 'Something very large just passed beyond the light. I felt the water move.' },
  { depth: 430, text: 'RADIO: "...come up... come up now... the lake wasn\'t always a la—" [static]' },
  { depth: 500, text: 'There are shapes on the floor. Too straight to be rock. Steps?' },
  { depth: 560, text: 'It is singing. Whatever is down there is singing to me.' },
];
