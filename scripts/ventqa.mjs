// Vents: count/depths, air refill inside a column, reserve depletion, and a look at one.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.setSave({ armor: 5, air: 0 }); window.__game.freeze(true); window.__game.clearFish(); });
const vents = await page.evaluate(() => window.__game.vents.list.map((v) => [v.top.x, v.top.y, v.top.z].map(Math.round)));
console.log('vents:', vents.length, 'depths', vents.map((v) => -v[1]).sort((a, b) => a - b).join(','));
const [x, y, z] = vents.reduce((a, b) => (b[1] > a[1] ? b : a));
// Look at it from 25 m away.
await page.evaluate(([x, y, z]) => window.__game.place(x, y + 12, z + 7, -1.0, 0), [x, y, z]);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'qa-out/vent-look.png' });
// Breathe inside the column.
await page.evaluate(([x, y, z]) => { window.__game.place(x, y + 8, z, -0.6, 0); window.__game.setAir(0.2); }, [x, y, z]);
await page.waitForTimeout(100);
const a0 = await page.evaluate(() => window.__game.air);
await page.waitForTimeout(2000);
const a1 = await page.evaluate(() => window.__game.air);
console.log(`air in column: ${a0.toFixed(2)} -> ${a1.toFixed(2)}  hint: "${await page.textContent('#hint')}"`);
await page.screenshot({ path: 'qa-out/vent-inside.png' });
await page.waitForTimeout(5000);
console.log(`after 7s: air ${(await page.evaluate(() => window.__game.air)).toFixed(2)} hint: "${await page.textContent('#hint')}"`);
await page.evaluate(([x, y, z]) => window.__game.place(x + 15, y + 8, z), [x, y, z]);
const b0 = await page.evaluate(() => window.__game.air);
await page.waitForTimeout(2000);
console.log(`outside column air: ${b0.toFixed(2)} -> ${(await page.evaluate(() => window.__game.air)).toFixed(2)}`);
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
