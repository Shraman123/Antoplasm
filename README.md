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
WASD swim · mouse look · click fire · Space/C up/down · Shift sprint · E boat shop (at surface) · M mute

## Design
| Depth | Zone | Fish |
|---|---|---|
| 0–60 m | Sunlit Shallows | Bluegill, Yellow Perch |
| 60–150 m | Green Twilight | Silver Trout, Lake Pike |
| 150–260 m | The Murk | Sallow Eel, Weeping Catfish |
| 260–380 m | Weeping Depths | Hollow Gar |
| 380–500 m | The Rot | Lantern Maw |
| 500–620 m | Antoplasm Trench | Antoplasm Husk → ending |

- The armour's depth rating gates progress: below it, pressure crushes you. Air drains faster the deeper you go. If you drown, you lose your catch.
- Infection is procedural: each fish is a spine of segments, and antoplasm swaps segments for bare rib hoops and pulsing red flesh in proportion to the species' infection level.
- Atmosphere ramps up with depth: fog colour and density, a dying sun, a flickering flashlight, marine snow that turns into flesh flakes, film grain, whispers, a heartbeat and distant whale calls. The calm pentatonic music fades out below 110 m.
- Balance lives in `src/config.ts`.

## QA
`npm run dev`, then `node scripts/qa.mjs` (zones + shop + ending), `node scripts/fishqa.mjs` (species close-ups), `node scripts/cutqa.mjs` (deterministic cutscene stills). Debug hooks are on `window.__game`.
