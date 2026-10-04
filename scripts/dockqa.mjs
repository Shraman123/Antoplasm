// Jetty collision: surface swim into it, underwater into a post, between posts, surfacing beneath.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.freeze(true); window.__game.clearFish(); });
const pos = () => page.evaluate(() => { const p = window.__game.pos; return [p.x, p.y, p.z].map((v) => +v.toFixed(2)); });
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };
const dock = await page.evaluate(() => window.__game.dock);
console.log('dock', dock);
// 1. Surface, swimming west (-x) into the jetty side.
await page.evaluate(() => window.__game.place(9, 0.55, 322, 0, Math.PI / 2));
await hold(['KeyW'], 2500);
console.log('surface into side -> x', (await pos())[0], `(must stay >= ${(dock.x + 1.75).toFixed(2)})`);
// 2. Underwater, straight into a post (z = z0 + 6*3.5).
const pz = dock.z0 + 6 * 3.5;
await page.evaluate((pz) => window.__game.place(9, -3, pz, 0, Math.PI / 2), pz);
await hold(['KeyW'], 2500);
console.log('underwater into post -> x', (await pos())[0], `(post at ${(dock.x + 1.2).toFixed(2)}, must stay >= ${(dock.x + 1.2 + 0.63).toFixed(2)} near z ${pz})`, 'z', (await pos())[2]);
// 3. Underwater between posts: should pass under the jetty.
await page.evaluate((pz) => window.__game.place(9, -3, pz + 1.75, 0, Math.PI / 2), pz);
await hold(['KeyW'], 2500);
console.log('underwater between posts -> x', (await pos())[0], `(should pass below ${dock.x.toFixed(2)})`);
// 4. Surfacing directly under the deck.
await page.evaluate(([x, z]) => window.__game.place(x, -4, z, 0, 0), [dock.x, pz + 1.75]);
await hold(['Space'], 2500);
console.log('surfacing under deck -> y', (await pos())[1], '(must stay <= -0.95)');
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
