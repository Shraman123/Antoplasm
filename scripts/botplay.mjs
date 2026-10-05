// Full-game bot playthrough: fresh save -> ending, using only player controls (keys, look, trigger, E, shop buttons).
// No teleports, spawns or money edits. Runs the sim fast-forwarded (QA_SPEED steps per rendered frame).
// The bot is deliberately an average player: greedy cheapest-upgrade shopping, no vent use, imperfect aim.
// Usage: node scripts/botplay.mjs   (QA_URL, QA_SPEED=10, QA_MAX_MIN=180 game-minutes cap)
import { chromium } from 'playwright-core';

const SPEED = Number(process.env.QA_SPEED ?? 10);
const MAX_MIN = Number(process.env.QA_MAX_MIN ?? 180);
const SKILL = process.env.QA_SKILL ?? 'avg'; // 'pro' = perfect aim + long sight; 'avg' = human-ish
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => !!window.__game);

await page.evaluate(([speed, skill]) => {
  const g = window.__game;
  const pro = skill === 'pro';
  // What a person can actually make out: ~55% of the fog's half-visibility distance (world.ts ZONES).
  const FOG = [[0, 0.011], [60, 0.014], [150, 0.019], [260, 0.024], [380, 0.028], [500, 0.03], [640, 0.032]];
  const sight = (d) => {
    if (pro) return 45;
    let i = 0;
    while (i < FOG.length - 2 && d > FOG[i + 1][0]) i++;
    const t = Math.max(0, Math.min(1, (d - FOG[i][0]) / (FOG[i + 1][0] - FOG[i][0])));
    return Math.min(45, 0.55 * 0.83 / (FOG[i][1] + (FOG[i + 1][1] - FOG[i][1]) * t));
  };
  const REACT = pro ? 0 : 0.35; // seconds on a new target before the first shot
  const WOBBLE = pro ? 0 : 0.035; // radians of aim error, redrawn every half second
  let wob = [0, 0], wobT = 0, seenT = 0, lastKey = '';
  const SPEAR = [55, 65, 72, 80, 90, 100, 108, 118, 125, 95];
  // Radius where the bowl floor sits at depth D (inverse of world.floorY without its noise).
  const radiusFor = (D) => 20 + 310 * (1 - Math.pow(Math.max(0, Math.min(1, (D - 15) / 605)), 1 / 1.7));
  const press = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const hold = (codes) => {
    for (const c of ['KeyW', 'KeyS', 'Space', 'KeyC', 'ShiftLeft']) if (!codes.includes(c)) g.keys.delete(c);
    for (const c of codes) g.keys.add(c);
  };
  const bot = (window.__bot = { phase: 'dive', target: null, last: null, angle: Math.random() * 6.28, stats: { shots: 0, dives: 0, ascentsLowAir: 0, ascentsHurt: 0 }, events: [] });
  const log = (t) => bot.events.push(`[${(g.save.playTime / 60).toFixed(1)}m] ${t}`);
  bot.log = log;
  let turnRate = pro ? 3.5 : 2.5; // rad/s, roughly a relaxed mouse hand
  function aimAt(dx, dy, dz, dt) {
    const wantY = Math.atan2(-dx, -dz) + wob[0];
    const wantP = Math.atan2(dy, Math.hypot(dx, dz)) + wob[1];
    const { yaw, pitch } = g.view;
    let dy_ = ((wantY - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const step = turnRate * dt;
    const ny = yaw + Math.max(-step, Math.min(step, dy_));
    const np = pitch + Math.max(-step, Math.min(step, wantP - pitch));
    g.look(Math.max(-1.45, Math.min(1.45, np)), ny);
    return Math.abs(dy_) + Math.abs(wantP - pitch);
  }
  // Air (0..1) needed to rise from depth d at ~12 m/s, with drain growing with depth.
  const airToSurface = (d) => ((d / 12) * (1 + d / 700)) / g.airSeconds;
  const diveDepth = () => {
    const s = g.save;
    const byArmour = g.rating >= 600 ? 615 : g.rating - 25;
    // Deepest depth where the round trip uses at most ~55% of the tank, leaving time to fish.
    let byAir = 20;
    for (let d = 20; d <= 620; d += 5) if (2 * airToSurface(d) < 0.55) byAir = d;
    return Math.max(15, Math.min(byArmour, byAir));
  };
  let prevFish = new Map();
  g.bot = (dt) => {
    const p = g.pos;
    const depth = -p.y;
    const hp = g.hp, air = g.air;
    // Damage ledger: drops in hp from bites/pressure (air never runs out for this bot).
    if (bot.lastHp !== undefined && hp < bot.lastHp - 0.5) {
      const z = depth < 150 ? '<150' : depth < 300 ? '150-300' : depth < 450 ? '300-450' : '450+';
      bot.stats.dmg = bot.stats.dmg ?? {};
      bot.stats.dmg[z] = Math.round((bot.stats.dmg[z] ?? 0) + bot.lastHp - hp);
      bot.stats.bites = (bot.stats.bites ?? 0) + 1;
    }
    bot.lastHp = hp;
    bot.stats.minHp = Math.min(bot.stats.minHp ?? 100, hp | 0);
    // Bandage when hurt.
    if (hp < 55 && g.save.bandages > 0 && depth > 2) g.bandage();
    if (bot.phase !== 'ascend' && bot.phase !== 'surface' && depth > 3) {
      if (air < airToSurface(depth) * 1.5 + 0.06) { bot.phase = 'ascend'; bot.stats.ascentsLowAir++; }
      else if (hp < 35 && g.save.bandages === 0) { bot.phase = 'ascend'; bot.stats.ascentsHurt++; log(`hurt (${hp | 0} hp) at ${depth | 0} m, surfacing`); }
    }
    if (bot.phase === 'dive') {
      const D = diveDepth();
      bot.D = D;
      const r = Math.min(330, radiusFor(D + 30));
      const tx = Math.sin(bot.angle) * r, tz = Math.cos(bot.angle) * r;
      const dx = tx - p.x, dz = tz - p.z, dy = -D - p.y;
      aimAt(dx, dy, dz, dt);
      hold(['KeyW', 'ShiftLeft']);
      if (Math.abs(dy) < 6 && Math.hypot(dx, dz) < 25) { bot.phase = 'hunt'; bot.stats.dives++; bot.huntT = 0; }
      else if (Math.abs(dy) < 6) { /* keep travelling */ }
    }
    if (bot.phase === 'hunt') {
      bot.huntT += dt;
      wobT -= dt;
      if (wobT <= 0) { wobT = 0.5; wob = [(Math.random() - 0.5) * 2 * WOBBLE, (Math.random() - 0.5) * 2 * WOBBLE]; }
      const fl = g.fishList;
      const cur = new Map();
      // Pick a target: anything attacking us first, then the most valuable fish in range.
      let best = null, bestScore = -1e9;
      for (const f of fl) {
        const d = Math.hypot(f.x - p.x, f.y - p.y, f.z - p.z);
        if (d > sight(-f.y)) continue;
        if (!pro && d > 6 && `${f.id}` !== lastKey) {
          // Only what's on screen (~45° off-centre), unless it's close enough to feel in the water.
          const { yaw, pitch } = g.view;
          const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
          if (((f.x - p.x) * fx + (f.y - p.y) * fy + (f.z - p.z) * fz) / d < 0.7) continue;
        }
        if (-f.y > g.rating - 5) continue;
        const threat = f.aggressive && d < 18 ? 1000 : 0;
        const score = threat + f.price * 2 - d * 3;
        if (score > bestScore) { bestScore = score; best = { ...f, d }; }
      }
      if (best) {
        const key = `${best.id}`;
        const prev = prevFish.get(key);
        const vx = prev ? (best.x - prev.x) / dt : 0, vy = prev ? (best.y - prev.y) / dt : 0, vz = prev ? (best.z - prev.z) / dt : 0;
        cur.set(key, best);
        if (key !== lastKey) { lastKey = key; seenT = 0; }
        seenT += dt;
        const t = best.d / SPEAR[g.save.harpoon];
        const err = aimAt(best.x + vx * t - p.x, best.y + vy * t - p.y, best.z + vz * t - p.z, dt);
        const tooDeep = -best.y > g.rating - 8;
        hold(best.d > 14 && !tooDeep ? ['KeyW'] : best.d < 5 ? ['KeyS'] : []);
        if (err < 0.06 + best.r / Math.max(best.d, 1) && best.d < 34 && seenT >= REACT && !g.reloading) { g.trigger(); bot.stats.shots++; }
      } else {
        lastKey = '';
        wob = [0, 0];
        // Patrol a slow circle at the dive depth.
        bot.angle += dt * 0.02;
        const D = bot.D ?? diveDepth();
        const r = Math.min(330, radiusFor(D + 30));
        const tx = Math.sin(bot.angle) * r, tz = Math.cos(bot.angle) * r;
        aimAt(tx - p.x, -D - p.y, tz - p.z, dt);
        hold(['KeyW']);
      }
      prevFish = cur;
    }
    if (bot.phase === 'ascend') {
      aimAt(0.001, 1, 0, dt);
      hold(['KeyW', 'Space', ...(air > 0.15 ? [] : ['ShiftLeft'])]);
      if (depth < 1.5) bot.phase = 'surface';
    }
    if (bot.phase === 'surface') {
      // Shop: Teodor's skiff if he'll come, otherwise swim back to the boat.
      const hint = document.getElementById('hint')?.textContent ?? '';
      if (/Press E/.test(hint)) { hold([]); press('KeyE'); bot.phase = 'waitshop'; return; }
      aimAt(0 - p.x, 0, 300 - p.z, dt);
      hold(['KeyW', 'ShiftLeft']);
    }
  };
  g.speed = speed;
  g.play();
}, [SPEED, SKILL]);

// Outer loop: handle shop, death and progress reporting.
const t0 = Date.now();
let lastReport = -1;
let result = 'timeout';
const deaths = [];
while (true) {
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => ({ mode: window.__game.mode, t: window.__game.save.playTime, phase: window.__bot.phase }));
  if (st.mode === 'ending' || st.mode === 'cutscene') { result = 'ending'; break; }
  if (st.t / 60 > MAX_MIN) break;
  if (st.mode === 'dead') {
    const why = await page.evaluate(() => {
      const s = window.__game.save;
      return `${document.getElementById('dead-title').textContent} (max ${Math.round(s.maxDepth)} m, phase ${window.__bot.phase}, D ${window.__bot.D})`;
    });
    deaths.push(`[${(st.t / 60).toFixed(1)}m] ${why}`);
    await page.click('#btn-respawn');
    await page.evaluate(() => { window.__bot.phase = 'dive'; window.__bot.angle = Math.random() * 6.28; });
  }
  if (st.mode === 'shop') {
    const bought = await page.evaluate(() => {
      const g = window.__game;
      const out = [];
      const sold = g.cargo.reduce((s, f) => s + f.price, 0);
      window.__bot.stats.income = window.__bot.stats.income ?? {};
      for (const f of g.cargo) { const inc = window.__bot.stats.income; inc[f.id] = (inc[f.id] ?? 0) + f.price; }
      document.getElementById('btn-sell').click();
      // Average player: top bandages up to 3, then buy the cheapest affordable upgrade until broke.
      for (let guard = 0; guard < 20; guard++) {
        const rows = [...document.querySelectorAll('#upgrades .upg')];
        if (g.save.bandages < 3 && g.save.money >= 20 + 60) { rows[0].querySelector('button').click(); out.push('bandage'); continue; }
        const opts = rows.slice(1).map((r, i) => ({ i, b: r.querySelector('.row:last-child button'), name: r.querySelector('.name').textContent }))
          .filter((o) => o.b && !o.b.disabled)
          .map((o) => ({ ...o, cost: Number(o.b.textContent.replace(/\D/g, '')) }))
          .sort((a, b) => a.cost - b.cost);
        if (!opts.length) break;
        opts[0].b.click();
        out.push(document.querySelectorAll('#upgrades .upg')[opts[0].i + 1].querySelector('.name').textContent);
      }
      document.getElementById('btn-close').click();
      window.__bot.phase = 'dive';
      window.__bot.angle = Math.random() * 6.28;
      return { sold, out, s: { ...g.save, journal: g.save.journal.length, logs: undefined } };
    });
    await page.evaluate((b) => window.__bot.log(`shop: sold $${b.sold}${b.out.length ? ' · bought ' + b.out.filter((x) => x !== 'bandage').join(', ') + (b.out.includes('bandage') ? ' +bandages' : '') : ''} · $${b.s.money} left · tiers A${b.s.air} H${b.s.harpoon} R${b.s.armor}`), bought);
  }
  const min = Math.floor(st.t / 60 / 5) * 5;
  if (min !== lastReport) {
    lastReport = min;
    const s = await page.evaluate(() => { const s = window.__game.save; return `t=${(s.playTime / 60).toFixed(1)}m money=$${s.money} earned=$${s.earned} caught=${s.caught} max=${Math.round(s.maxDepth)}m deaths=${s.deaths} tiers A${s.air} H${s.harpoon} R${s.armor}`; });
    console.log(`${s}  (real ${((Date.now() - t0) / 1000) | 0}s)`);
  }
}
if (result === 'ending') await page.waitForFunction(() => window.__game.mode === 'ending', null, { timeout: 120000 }).catch(() => {});
const final = await page.evaluate(() => ({ achievements: window.__game.profile.achievements, save: { ...window.__game.save, logs: window.__game.save.logs.length }, bot: window.__bot.stats, events: window.__bot.events }));
console.log('\nRESULT:', result);
console.log('save:', JSON.stringify(final.save));
console.log('bot:', JSON.stringify(final.bot));
console.log('achievements:', final.achievements.length, final.achievements.join(' '));
console.log('\nDEATHS:\n' + (deaths.join('\n') || 'none'));
console.log('\nTIMELINE:\n' + final.events.join('\n'));
console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '\nno page errors');
await browser.close();
