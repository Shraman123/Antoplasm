// Skiff QA: shop only at the jetty before 150 m; after, surfacing anywhere and pressing E calls Teodor.
//   node scripts/skiffqa.mjs     (needs `npm run dev` on :5173, or QA_URL)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForTimeout(1500);
await page.waitForFunction(() => !!window.__game);
let fails = 0;
const ok = (c, l) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', l); };
await page.evaluate(() => { localStorage.clear(); window.__game.__noPause = true; window.__game.play(); window.__game.spawning = false; window.__game.clearFish(); });
const surfaceFar = () => page.evaluate(() => { window.__game.teleport(0, 0, -60); });
const pressE = async () => { await page.keyboard.down('KeyE'); await page.waitForTimeout(60); await page.keyboard.up('KeyE'); };
const hint = () => page.evaluate(() => document.getElementById('hint').textContent);

await surfaceFar();
await page.waitForTimeout(600);
await pressE();
await page.waitForTimeout(1300);
ok(await page.evaluate(() => window.__game.mode === 'play'), 'before 150 m: E far from the jetty does nothing');

await page.evaluate(() => window.__game.setSave({ maxDepth: 160 }));
await surfaceFar();
await page.waitForTimeout(600);
ok((await page.evaluate(() => document.getElementById('log').textContent)).includes('outboard'), 'radio announces the skiff on first surfacing after 150 m');
ok((await hint()).includes("skiff"), 'surface hint offers the skiff');
await pressE();
await page.waitForTimeout(400);
ok(await page.evaluate(() => window.__game.mode === 'paused'), 'Teodor rowing over: player held still');
await page.waitForTimeout(1200);
ok(await page.evaluate(() => window.__game.mode === 'shop'), 'shop opens where you surfaced');
const p = await page.evaluate(() => window.__game.pos);
ok(Math.abs(p.z + 60) < 3, 'player was not moved back to the jetty');
await page.evaluate(() => document.getElementById('btn-close').click());
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.teleport(40, 0, -60));
await page.waitForTimeout(400);
await pressE();
await page.waitForTimeout(1300);
ok(await page.evaluate(() => window.__game.mode === 'play'), 'underwater: E does not call the skiff');
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
