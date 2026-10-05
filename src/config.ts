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
  shape: 'round' | 'long' | 'eel' | 'flat' | 'angler' | 'deep';
  lore: string;
  large?: boolean; // big game: rarer spawn, can roll healthy or infected per individual
  weight?: number; // relative spawn weight (default 1)
  features?: ('scutes' | 'barbels' | 'snout')[];
  /** How an aggressive fish hunts. Each has a readable tell, so fights reward watching. Default: plain chase. */
  behavior?: 'ambush' | 'weave' | 'stalk' | 'charge' | 'lure' | 'pack';
}

export const SPECIES: Species[] = [
  { id: 'bluegill', name: 'Bluegill', minDepth: 1, maxDepth: 45, price: 5, hp: 1, damage: 0, speed: 3.2, size: 0.75, color: 0x4f8fc0, belly: 0xf2c46a, infection: 0, aggressive: false, shape: 'round', lore: 'A bright little sunfish. Harmless.' },
  { id: 'perch', name: 'Yellow Perch', minDepth: 8, maxDepth: 80, price: 10, hp: 2, damage: 0, speed: 3.6, size: 1.0, color: 0xc9b23c, belly: 0xeee6b0, infection: 0, aggressive: false, shape: 'long', lore: 'Striped and skittish. Sells well at the market.' },
  { id: 'trout', name: 'Silver Trout', minDepth: 40, maxDepth: 135, price: 20, hp: 3, damage: 0, speed: 4.4, size: 1.3, color: 0x9fb4c0, belly: 0xe7eef2, infection: 0.05, aggressive: false, shape: 'long', lore: 'Some have small grey spots near the gills. Probably nothing.' },
  { id: 'pike', name: 'Lake Pike', minDepth: 90, maxDepth: 210, price: 38, hp: 5, damage: 7, speed: 5.2, size: 1.9, color: 0x55703c, belly: 0xc8c89a, infection: 0.18, aggressive: true, shape: 'long', lore: 'It bites. There are wet red patches where its scales have fallen out.' , behavior: 'ambush' },
  { id: 'eel', name: 'Sallow Eel', minDepth: 150, maxDepth: 285, price: 65, hp: 6, damage: 11, speed: 4.6, size: 2.8, color: 0x6d6450, belly: 0x9a8f78, infection: 0.32, aggressive: true, shape: 'eel', lore: 'Its skin comes away in sheets. Underneath, something red keeps moving.' , behavior: 'weave' },
  { id: 'catfish', name: 'Weeping Catfish', minDepth: 230, maxDepth: 365, price: 115, hp: 9, damage: 17, speed: 4.2, size: 2.6, color: 0x4a3d36, belly: 0x86715e, infection: 0.5, aggressive: true, shape: 'flat', lore: 'Antoplasm has eaten through to the spine. It is still alive. It is still hungry.' , behavior: 'stalk' },
  { id: 'gar', name: 'Hollow Gar', minDepth: 320, maxDepth: 455, price: 195, hp: 12, damage: 25, speed: 5.8, size: 3.3, color: 0x3c3a36, belly: 0x6e655a, infection: 0.68, aggressive: true, shape: 'long', lore: 'More ribcage than fish. The red mass inside it pulses when it sees your light.' , behavior: 'charge' },
  { id: 'maw', name: 'Lantern Maw', minDepth: 400, maxDepth: 545, price: 330, hp: 16, damage: 35, speed: 5.0, size: 3.0, color: 0x241c1c, belly: 0x4a3434, infection: 0.82, aggressive: true, shape: 'angler', lore: 'The lure is not a light. It is a swollen knot of antoplasm, glowing.' , behavior: 'lure' },
  { id: 'husk', name: 'Antoplasm Husk', minDepth: 480, maxDepth: 640, price: 560, hp: 22, damage: 46, speed: 6.2, size: 4.0, color: 0x1e1414, belly: 0x3a2020, infection: 1, aggressive: true, shape: 'long', lore: 'There is no fish left. Only bone, wrapped in something that learned how to swim.' , behavior: 'pack' },
  // Big game. Each one rolls healthy or infected when it spawns; the deeper, the likelier the rot.
  { id: 'carp', name: 'Grandfather Carp', minDepth: 12, maxDepth: 120, price: 85, hp: 8, damage: 0, speed: 2.4, size: 3.4, color: 0x8a6a2a, belly: 0xe0c070, infection: 0, aggressive: false, shape: 'deep', lore: 'Older than Teodor, maybe older than the town. Scales like brass coins.', large: true, weight: 0.3, features: ['barbels'] },
  { id: 'sturgeon', name: 'Lake Sturgeon', minDepth: 25, maxDepth: 170, price: 110, hp: 9, damage: 0, speed: 2.6, size: 4.2, color: 0x6b6458, belly: 0xcfc6b0, infection: 0, aggressive: false, shape: 'long', lore: 'An armoured relic, plated in rows of bony scutes. Gentle.', large: true, weight: 0.3, features: ['scutes', 'barbels'] },
  { id: 'muskie', name: 'Muskellunge', minDepth: 60, maxDepth: 220, price: 140, hp: 10, damage: 12, speed: 5.6, size: 3.6, color: 0x6f7a44, belly: 0xd8d2a8, infection: 0, aggressive: true, shape: 'long', lore: 'The fish of ten thousand casts. It strikes like a thrown knife.', large: true, weight: 0.3 , behavior: 'ambush' },
  { id: 'paddlefish', name: 'Paddlefish', minDepth: 110, maxDepth: 300, price: 210, hp: 12, damage: 0, speed: 3.0, size: 4.6, color: 0x5a6a78, belly: 0xc8d0d8, infection: 0, aggressive: false, shape: 'long', lore: 'A long flat paddle of a snout, sweeping the dark for food.', large: true, weight: 0.25, features: ['snout'] },
  { id: 'wels', name: 'Wels Catfish', minDepth: 200, maxDepth: 400, price: 320, hp: 18, damage: 20, speed: 3.8, size: 5.8, color: 0x3e3a34, belly: 0x8a7e6a, infection: 0.2, aggressive: true, shape: 'flat', lore: 'Big enough to swallow a dog. The old men say it has swallowed worse.', large: true, weight: 0.25, features: ['barbels'] , behavior: 'stalk' },
  { id: 'cathedral', name: 'Cathedral Sturgeon', minDepth: 380, maxDepth: 620, price: 850, hp: 30, damage: 40, speed: 3.6, size: 8, color: 0x2a2422, belly: 0x4a3a34, infection: 0.5, aggressive: true, shape: 'long', lore: 'Eight metres of plated bone. Its scutes are carved with the same patterns as the steps below.', large: true, weight: 0.2, features: ['scutes', 'barbels'] , behavior: 'charge' },
];

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Roll one individual. Big game may come out infected: tougher, angrier and worth far more. */
export function rollIndividual(sp: Species, depth: number): Species {
  if (!sp.large) return sp;
  const chance = 0.06 + 0.9 * smoothstep(30, 450, depth) + sp.infection * 0.3;
  if (Math.random() > chance) return sp;
  const inf = Math.min(1, Math.max(sp.infection + 0.2, 0.3 + Math.random() * 0.3 + depth / 1000));
  return {
    ...sp,
    name: `Infected ${sp.name}`,
    infection: inf,
    hp: Math.round(sp.hp * (1 + inf * 0.6)),
    damage: Math.max(sp.damage, Math.round((6 + 30 * inf) * Math.min(1.6, sp.size / 4))),
    aggressive: true,
    speed: sp.speed * (1 + inf * 0.35),
    price: Math.round(sp.price * (1 + inf * 1.6)),
    lore: `${sp.lore} This one was rotting from the inside, antoplasm ${Math.round(inf * 100)}% through it.`,
  };
}

export interface Tier { cost: number; label: string }
export interface AirTier extends Tier { seconds: number }
export interface HarpoonTier extends Tier { damage: number; reload: number; speed: number; pellets?: number; spread?: number; range?: number }
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
  { cost: 0, label: 'Sling Spear', damage: 1, reload: 0.6, speed: 55 },
  { cost: 55, label: 'Band Gun', damage: 2, reload: 0.5, speed: 65 },
  { cost: 110, label: 'Twin-Band Gun', damage: 3, reload: 0.48, speed: 72 },
  { cost: 200, label: 'Pneumatic Gun', damage: 4, reload: 0.42, speed: 80 },
  { cost: 380, label: 'Barbed Railgun', damage: 5, reload: 0.34, speed: 90 },
  { cost: 560, label: 'Long Rail', damage: 7, reload: 0.32, speed: 100 },
  { cost: 820, label: 'Powerhead', damage: 9, reload: 0.27, speed: 108 },
  { cost: 1150, label: 'Gas Lance', damage: 11, reload: 0.25, speed: 118 },
  { cost: 1650, label: 'Bone Splitter', damage: 13, reload: 0.2, speed: 125 },
  // Shotgun: a cone of barbed flechettes, deadly up close, falls off past ~30 m.
  { cost: 2400, label: 'Antoplasm Scattergun', damage: 10, reload: 1.0, speed: 95, pellets: 10, spread: 0.16, range: 34 },
];

export const ARMOR: ArmorTier[] = [
  { cost: 0, label: 'Wetsuit', reduction: 0, rating: 90 },
  { cost: 60, label: 'Neoprene Plate', reduction: 0.25, rating: 175 },
  { cost: 180, label: 'Chainmail Suit', reduction: 0.42, rating: 275 },
  { cost: 420, label: 'Pressure Shell', reduction: 0.57, rating: 395 },
  { cost: 900, label: 'Atmospheric Hardsuit', reduction: 0.7, rating: 525 },
  { cost: 1800, label: 'Leviathan Hardsuit', reduction: 0.82, rating: 700 },
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
