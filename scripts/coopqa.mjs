// Co-op end-to-end with real browsers against the local Supabase Realtime:
// create/join by code and by invite link, one agreed host, avatars, shared fish, hits routed to the
// host with kill credit to the shooter (and assists), bites routed to the bitten diver, host
// handover when the host leaves, room cap of 4.
import { chromium } from 'playwright-core';
const URL = process.env.QA_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let fails = 0;
const errs = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const run = Math.random().toString(36).slice(2, 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function diver(name, url = URL) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__game);
  await page.click('#btn-online-title');
  await page.fill('#dev-email', `${name.toLowerCase()}-${run}@qa.test`);
  await page.fill('#dev-pass', 'diver-pass-123');
  await page.fill('#dev-name', name);
  await page.click('#dev-login button[type=submit]');
  await page.waitForFunction(() => window.__game.account.status === 'synced', null, { timeout: 15000 });
  if (url !== URL) {
    await page.goto(url);
    await page.waitForFunction(() => !!window.__game);
  }
  page.ctxRef = ctx;
  return page;
}
const g = (page, fn, arg) => page.evaluate(fn, arg);
/** Look straight at the nearest fish this player can see (wherever it has swum to) and fire. */
const shootNearest = (page) => page.evaluate(() => {
  const gm = window.__game;
  const p = gm.pos;
  const f = gm.fishList.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) - Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z))[0];
  if (!f) return false;
  const dx = f.x - p.x, dy = f.y - p.y, dz = f.z - p.z;
  gm.look(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz));
  setTimeout(() => gm.trigger(), 50);
  return true;
});

// ---------- Rooms ----------
const a = await diver('Ana');
await a.click('.tabs button[data-tab=coop]');
await a.click('#btn-room-create');
await a.waitForSelector('#coop-in:not(.hidden)', { timeout: 10000 });
const code = (await a.textContent('#room-code')).trim();
check(/^[A-Z2-9]{6}$/.test(code), `room created (${code})`);

const b = await diver('Bo');
await b.click('.tabs button[data-tab=coop]');
await b.fill('#room-code-in', code.toLowerCase());
await b.click('#room-join button');
await b.waitForSelector('#coop-in:not(.hidden)', { timeout: 10000 });
check(true, 'joined by typing the code');

const c = await diver('Cy', `${URL}?room=${code}`);
await c.waitForFunction(() => window.__game.coop.active, null, { timeout: 15000 }).catch(() => {});
check(await g(c, () => window.__game.coop.active), 'joined from an invite link');

for (const p of [a, b, c]) await p.click('#btn-room-dive');
await sleep(3000);
const hosts = await Promise.all([a, b, c].map((p) => g(p, () => window.__game.coop.hostId)));
const aId = await g(a, () => window.__game.myId);
check(hosts.every((h) => h === aId), 'everyone agrees the first diver hosts');
check(await g(a, () => window.__game.fishAuthority) && !(await g(b, () => window.__game.fishAuthority)) && !(await g(c, () => window.__game.fishAuthority)), 'only the host runs fish AI');
check((await g(a, () => window.__game.coop.peers.size)) === 3, 'room lists 3 divers');

// Put everyone together in mid-water and look at the avatars.
await g(a, () => window.__game.place(20, -30, 120, 0, 0));
await g(b, () => window.__game.place(24, -30, 120, 0, 0));
await g(c, () => window.__game.place(16, -30, 124, 0, 0));
await sleep(1500);
const seen = await g(a, () => window.__game.remoteDivers);
const bOnA = seen.find((d) => Math.abs(d.x - 24) < 1.5 && Math.abs(d.z - 120) < 1.5);
check(seen.length === 2 && !!bOnA, `host sees both other divers where they are (${JSON.stringify(seen.map((d) => [Math.round(d.x), Math.round(d.y), Math.round(d.z)]))})`);
check(await g(b, () => window.__game.profile.achievements.includes('coop_dive')), 'diving together unlocks Shared Waters');
check(await g(a, (c) => document.querySelector('#coop-hud').textContent.includes(c), code), 'in-game HUD shows the room');
await g(a, () => window.__game.look(-0.15, -1.45));
await sleep(300);
await a.screenshot({ path: 'qa-out/coop-host-view.png' });

// ---------- Shared fish ----------
await g(a, () => { window.__game.spawning = false; window.__game.clearFish(); });
await sleep(800);
const key = await g(a, () => window.__game.spawnAt('bluegill', 24, -30, 112));
await sleep(1200);
const bHas = await g(b, (k) => window.__game.fishes.length && window.__game.fishList.some(() => true), key);
check(bHas, 'a fish the host spawns appears for the others');
const [fishPosA, fishPosB] = await Promise.all([g(a, () => window.__game.fishList[0]), g(b, () => window.__game.fishList[0])]);
const drift = fishPosA && fishPosB ? Math.hypot(fishPosA.x - fishPosB.x, fishPosA.y - fishPosB.y, fishPosA.z - fishPosB.z) : 99;
check(drift < 3, `and in the same place (${drift.toFixed(2)} m apart)`);

// Bo spears it: the host decides, Bo gets the fish, it vanishes for everyone.
for (let i = 0; i < 4 && (await g(b, () => window.__game.cargoCount)) < 1; i++) {
  await shootNearest(b);
  await sleep(1500);
}
check(await g(b, () => window.__game.cargoCount) === 1, "the shooter's catch lands in their own net");
check(await g(a, () => window.__game.cargoCount) === 0, 'the host does not get it');
check(await g(c, () => window.__game.fishList.length) === 0 && (await g(a, () => window.__game.fishList.length)) === 0, 'the caught fish is gone for everyone');

// Assist: Ana wounds a perch (2 hp, 1-damage sling), Bo finishes it.
await g(a, () => window.__game.spawnAt('perch', 20, -30, 112));
await sleep(1200);
await g(a, () => window.__game.place(20, -30, 122, 0, 0));
await shootNearest(a);
await sleep(1500);
check(await g(a, () => window.__game.fishes.some((f) => f.id === 'perch' && f.hp === 1)), 'host wounds the perch');
await g(b, () => window.__game.place(22, -30, 121, 0, 0));
for (let i = 0; i < 4 && (await g(b, () => window.__game.cargoCount)) < 2; i++) {
  await shootNearest(b);
  await sleep(1500);
}
check(await g(b, () => window.__game.cargoCount) === 2, 'finishing a wounded fish still lands it');
check(await g(b, () => window.__game.profile.achievements.includes('coop_catch')), 'that counts as an Assist');

// Bites are routed to whoever the fish attacked.
const hpA0 = await g(a, () => window.__game.hp);
await g(c, () => window.__game.place(16, -100, 160, 0, 0));
await g(a, () => window.__game.spawnAt('pike', 16, -100, 162));
await sleep(6000);
const hpC = await g(c, () => window.__game.hp);
check(hpC < 100, `a pike near Cy bites Cy (hp ${Math.round(hpC)})`);
check((await g(a, () => window.__game.hp)) >= hpA0, 'the host is not hurt by a bite meant for someone else');

// ---------- Host handover ----------
await a.ctxRef.close();
await sleep(4500);
const bId = await g(b, () => window.__game.myId);
check(await g(b, () => window.__game.coop.hostId) === bId && (await g(c, () => window.__game.coop.hostId)) === bId, 'when the host leaves, the next diver takes over');
check(await g(b, () => window.__game.fishAuthority), 'the new host now runs the fish');
await sleep(2500);
check(await g(c, () => window.__game.fishList.length) > 0 || (await g(b, () => window.__game.fishList.length)) === 0, 'guests keep getting fish from the new host');

// ---------- Room cap ----------
const d = await diver('Di');
await d.click('.tabs button[data-tab=coop]');
await d.fill('#room-code-in', code);
await d.click('#room-join button');
await d.waitForSelector('#coop-in:not(.hidden)', { timeout: 10000 });
const e = await diver('Ed');
await e.click('.tabs button[data-tab=coop]');
await e.fill('#room-code-in', code);
await e.click('#room-join button');
await e.waitForSelector('#coop-in:not(.hidden)', { timeout: 10000 });
await sleep(1500);
check(await g(e, () => window.__game.coop.peers.size) === 4, 'four divers fit in a room');
await e.click('#btn-room-dive');
await sleep(1500);
check(await g(e, () => window.__game.profile.achievements.includes('coop_full')), 'a full room unlocks Expedition');
const f = await diver('Fi');
await f.click('.tabs button[data-tab=coop]');
await f.fill('#room-code-in', code);
await f.click('#room-join button');
await f.waitForFunction(() => document.querySelector('#coop-msg').textContent.length > 8 && !document.querySelector('#coop-msg').textContent.startsWith('Joining'), null, { timeout: 12000 }).catch(() => {});
check((await f.textContent('#coop-msg')).includes('full'), 'a fifth diver is told the room is full');
check(!(await g(f, () => window.__game.coop.active)), 'and is not left half-joined');
await b.screenshot({ path: 'qa-out/coop-room.png' });

console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
process.exit(fails ? 1 : 0);
