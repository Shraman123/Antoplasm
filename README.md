# Morrow Lake (ANTOPLASM)

A first-person underwater horror fishing game for the browser (Vite + TypeScript + Three.js, no assets: all models, textures and audio are procedural).

It starts as a cosy spearfishing game. Spear fish, sell them at Teodor's boat, and upgrade your **air tank**, **harpoon** and **armour**. The deeper fish sell for more, hit harder, and are being eaten alive by **antoplasm**. Reach 600 m to see what's at the bottom.

## Run
```
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## Controls
WASD swim Â· mouse look Â· click fire Â· Space/C up/down Â· Shift sprint Â· E boat shop (at surface) Â· M mute

## Design
| Depth | Zone | Fish |
|---|---|---|
| 0â€“60 m | Sunlit Shallows | Bluegill, Yellow Perch |
| 60â€“150 m | Green Twilight | Silver Trout, Lake Pike |
| 150â€“260 m | The Murk | Sallow Eel, Weeping Catfish |
| 260â€“380 m | Weeping Depths | Hollow Gar |
| 380â€“500 m | The Rot | Lantern Maw |
| 500â€“620 m | Antoplasm Trench | Antoplasm Husk â†’ ending |

- **Big game:** six large species (Grandfather Carp, Lake Sturgeon, Muskellunge, Paddlefish, Wels Catfish, Cathedral Sturgeon). Each one rolls healthy or infected when it spawns, and the deeper it is, the likelier the rot. Infected ones are tougher, aggressive and worth up to about 2.6× as much.
- **Harpoon:** 10 tiers (Sling Spear → Band Gun → Twin-Band → Pneumatic → Barbed Railgun → Long Rail → Powerhead → Gas Lance → Bone Splitter → **Antoplasm Scattergun**). The view-model changes per tier. The final tier is a shotgun: a cone of 8 barbed flechettes, 6 damage each, out to about 32 m. Old saves are migrated so you keep the same gun.
- **Hydrothermal vents:** 16 glowing chimneys on the floor from the Weeping Depths (260 m) down. Swim into a bubble column to breathe (+16 air-seconds/s). Each vent holds about 45 s of air and recovers slowly, so you can't camp on one.
- The armour's depth rating gates progress: below it, pressure crushes you. Air drains faster the deeper you go. If you drown, you lose your catch.
- Infection is procedural: each fish is a spine of segments, and antoplasm swaps segments for bare rib hoops and pulsing red flesh in proportion to the species' infection level.
- Atmosphere ramps up with depth: fog colour and density, a dying sun, a flickering flashlight, marine snow that turns into flesh flakes, film grain, whispers, a heartbeat and distant whale calls. The calm pentatonic music fades out below 110 m.
- Balance lives in `src/config.ts`.

## QA
`npm run dev`, then `node scripts/qa.mjs` (zones + shop + ending), `node scripts/fishqa.mjs` (species close-ups), `node scripts/cutqa.mjs` (deterministic cutscene stills). Debug hooks are on `window.__game`.
