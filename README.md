# Morrow Lake (ANTOPLASM)

A first-person underwater horror fishing game for the browser (Vite + TypeScript + Three.js, no assets: all models, textures and audio are procedural).

It starts as a cosy spearfishing game. Spear fish, sell them at Teodor's boat, and upgrade your **air tank**, **harpoon** and **armour**. The deeper fish sell for more, hit harder, and are being eaten alive by **antoplasm**. Reach 600 m to see what's at the bottom.

**Play:** https://morrow-lake.vercel.app (desktop and mobile)

## Run
```
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## Controls
WASD swim · mouse look · click fire · Space/C up/down · Shift sprint · E boat shop (at surface) · H bandage · M mute

**Touch:** left-side floating stick to swim, drag the right side to look, hold FIRE, plus up/down/sprint/bandage/pause/SHOP buttons. Works in portrait and landscape. Add `?touch=1` to force touch controls on desktop.

## Saves
Progress saves in the browser (localStorage) on every sell, purchase, death and pause. Nothing is sent to a server, and there's no login.

- **Save code:** Pause → *Save code* (or the button on the title screen) shows the whole save as a copyable code. Paste it on another device to carry progress over. Codes carry a checksum, so a partial paste is rejected.
- **Persistent storage:** the game asks the browser (`navigator.storage.persist()`) not to evict its data.
- **Installable app (PWA):** there's a manifest, icons and an offline service worker (`public/sw.js`). Android/desktop Chrome get an *Install app* button. iPhone Safari gets a tip to use *Add to Home Screen*, because iOS clears a normal site's storage after about 7 days without a visit but keeps a home-screen app's. On iOS the home-screen app has its own storage, so use a save code to move progress into it.

## Design
| Depth | Zone | Fish |
|---|---|---|
| 0–60 m | Sunlit Shallows | Bluegill, Yellow Perch |
| 60–150 m | Green Twilight | Silver Trout, Lake Pike |
| 150–260 m | The Murk | Sallow Eel, Weeping Catfish |
| 260–380 m | Weeping Depths | Hollow Gar |
| 380–500 m | The Rot | Lantern Maw |
| 500–620 m | Antoplasm Trench | Antoplasm Husk → ending |

- **Big game:** six large species (Grandfather Carp, Lake Sturgeon, Muskellunge, Paddlefish, Wels Catfish, Cathedral Sturgeon). Each one rolls healthy or infected when it spawns, and the deeper it is, the likelier the rot. Infected ones are tougher, aggressive and worth up to about 2.6× as much.
- **Harpoon:** 10 tiers (Sling Spear → Band Gun → Twin-Band → Pneumatic → Barbed Railgun → Long Rail → Powerhead → Gas Lance → Bone Splitter → **Antoplasm Scattergun**). The view-model changes per tier. The final tier is a shotgun: a wide cone of 10 barbed flechettes, 10 damage each, out to about 34 m, with a 1 s cooldown. Old saves are migrated so you keep the same gun.
- **Hydrothermal vents:** 16 glowing chimneys on the floor from the Weeping Depths (260 m) down. Swim into a bubble column to breathe (+16 air-seconds/s). Each vent holds about 45 s of air and recovers slowly, so you can't camp on one.
- The armour's depth rating gates progress: below it, pressure crushes you. Air drains faster the deeper you go. If you drown, you lose your catch.
- Infection is procedural: each fish is a spine of segments, and antoplasm swaps segments for bare rib hoops and pulsing red flesh in proportion to the species' infection level.
- Atmosphere ramps up with depth: fog colour and density, a dying sun, a flickering flashlight, marine snow that turns into flesh flakes, film grain, whispers, a heartbeat and distant whale calls. The calm pentatonic music fades out below 110 m.
- **Water and light** (`src/fx.ts`, shader-only: no extra lights, no post-processing): a wave-normal water surface with sky reflection and sun glint from above and Snell's window from below, a sky dome with sun and drifting clouds, caustics rippling over the sand, rocks and kelp (fading out with depth), sand ripples, slanting light shafts in the shallows, and a visible flashlight beam once it gets dark.
- Balance lives in `src/config.ts`.

## QA
`npm run dev`, then `node scripts/qa.mjs` (zones + shop + ending), `node scripts/fishqa.mjs` (species close-ups), `node scripts/cutqa.mjs` (deterministic cutscene stills), `node scripts/mobileqa.mjs` (touch; `QA_PORTRAIT=1` for portrait), `node scripts/saveqa.mjs` (save codes, offline, install; run against `npx vite preview --port 4173`). `node scripts/gfxqa.mjs <dir>` (one still + FPS per depth zone, for before/after comparisons). `node scripts/icons.mjs` regenerates the app icons. Debug hooks are on `window.__game`.
