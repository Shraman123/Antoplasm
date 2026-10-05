// Fish behaviour QA: one hunter at a time in a controlled tank (ambient spawning off).
// Logs each fish's state sequence and bites, then checks the counterplay works:
//   - charge/ambush/lure: dodging sideways during the tell makes the attack miss
//   - stalk: looking at it keeps it away; looking away lets it close in and bite
//   - pack: husks attack one at a time
//   node scripts/behaviorqa.mjs        (needs `npm run dev` on :5173, or QA_URL)
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForTimeout(1500);
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.setSave({ armor: 5, air: 5, harpoon: 0 }); window.__game.spawning = false; });
let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', label); };

/** Run a scenario for `secs`, sampling every 100 ms. `react(sample)` may move/turn the diver. */
async function run({ id, depth, dist = 20, dx = 0, n = 1, secs = 10, look = 0, react }) {
  await page.evaluate(([id, depth, dist, dx, n, look]) => {
    const g = window.__game;
    g.clearFish();
    g.teleport(depth, 0, -25); // near the trench: the floor is deep enough for every species
    g.look(0, look);
    g.setHp(100);
    for (let i = 0; i < n; i++) g.spawn(id, dist, dx + (i - (n - 1) / 2) * 6);
    window.__bites = 0;
    window.__lastHp = 100;
  }, [id, depth, dist, dx, n, look]);
  const states = [];
  let bites = 0, minDist = 1e9, maxDist = 0, simultaneous = 0;
  for (let i = 0; i < secs * 10; i++) {
    await page.waitForTimeout(100);
    const s = await page.evaluate(() => {
      const g = window.__game;
      const bit = g.hp < window.__lastHp - 0.5;
      window.__lastHp = g.hp;
      if (g.hp < 40) { g.setHp(100); window.__lastHp = 100; }
      return { fish: g.fishes, bit, air: g.air };
    });
    await page.evaluate(() => window.__game.setSave({ air: 5 }));
    if (s.bit) bites++;
    const f = s.fish[0];
    if (!f) break;
    if (states[states.length - 1] !== f.state) states.push(f.state);
    minDist = Math.min(minDist, f.dist);
    maxDist = Math.max(maxDist, f.dist);
    simultaneous = Math.max(simultaneous, s.fish.filter((x) => x.state === 'attack' || x.state === 'tell').length);
    if (react) await react(s, i);
  }
  return { states: states.join(' > '), bites, minDist: +minDist.toFixed(1), maxDist: +maxDist.toFixed(1), simultaneous };
}

const dodgeOn = (stateName) => {
  let done = false;
  return async (s) => {
    if (!done && s.fish[0]?.state === stateName) {
      done = true;
      await page.evaluate(() => window.__game.move(9, 0, 0)); // sidestep 9 m
    }
  };
};

// Ambush (pike)
let r = await run({ id: 'pike', depth: 120, dist: 12, secs: 6 });
console.log('pike     stand still:', r);
ok(r.states.includes('tell > dart') && r.bites >= 1, 'pike: tell -> dart, hits a diver who stands still');
r = await run({ id: 'pike', depth: 120, dist: 12, secs: 3, react: dodgeOn('tell') });
console.log('pike     sidestep   :', r);
ok(r.states.includes('dart') && r.bites === 0, 'pike: sidestepping during the tell dodges the dart');

// Weave (eel)
r = await run({ id: 'eel', depth: 220, dist: 18, secs: 10 });
console.log('eel      stand still:', r);
ok(r.bites >= 1 && r.states.includes('retreat'), 'eel: weaves in, bites, retreats');

// Stalk (catfish): diver looks at it the whole time, then away.
r = await run({ id: 'catfish', depth: 300, dist: 16, secs: 6 });
console.log('catfish  watched    :', r);
ok(r.bites === 0 && r.minDist > 6, 'catfish: watched, it keeps its distance');
r = await run({ id: 'catfish', depth: 300, dist: 16, secs: 8, look: 0, react: async (s, i) => { if (i === 0) await page.evaluate(() => window.__game.look(0, Math.PI)); } });
console.log('catfish  back turned:', r);
ok(r.bites >= 1, 'catfish: back turned, it creeps in and bites');

// Charge (gar)
r = await run({ id: 'gar', depth: 380, dist: 20, secs: 9 });
console.log('gar      stand still:', r);
ok(r.states.includes('tell > charge') && r.bites >= 1, 'gar: circles, tells, charges, hits a still diver');
r = await run({ id: 'gar', depth: 380, dist: 20, secs: 9, react: dodgeOn('charge') });
console.log('gar      sidestep   :', r);
ok(r.states.includes('charge') && r.bites === 0, 'gar: sidestepping as it charges makes it miss');

// Lure (maw)
r = await run({ id: 'maw', depth: 470, dist: 20, secs: 5 });
console.log('maw      at range   :', r);
ok(r.bites === 0 && r.states.startsWith('hang') && !r.states.includes('lunge'), 'maw: hangs still while you keep your distance');
r = await run({ id: 'maw', depth: 470, dist: 7, secs: 4 });
console.log('maw      too close  :', r);
ok(r.states.includes('tell > lunge') && r.bites >= 1, 'maw: get close and it lunges');

// Pack (husks)
r = await run({ id: 'husk', depth: 560, dist: 18, n: 4, secs: 14 });
console.log('husk x4             :', r);
ok(r.bites >= 1 && r.simultaneous <= 1, 'husks: circle and attack one at a time');

console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
