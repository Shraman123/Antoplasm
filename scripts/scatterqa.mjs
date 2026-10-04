// Scattergun: view-model, a blast into a school, damage on a big fish at close range, shop text, save migration.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
// Old v1 save with the Bone Splitter (old tier 5) should migrate to the new Bone Splitter (tier 8).
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.evaluate(() => localStorage.setItem('morrow-lake-save-v1', JSON.stringify({ money: 0, air: 0, harpoon: 5, armor: 0, journal: [], logs: [] })));
await page.reload();
await page.waitForFunction(() => !!window.__game);
console.log('v1 harpoon 5 migrated to', await page.evaluate(() => window.__game.save.harpoon));
await page.evaluate(() => { window.__game.play(); window.__game.setSave({ harpoon: 9, armor: 9 > 5 ? 5 : 5 }); window.__game.freeze(true); window.__game.clearFish(); window.__game.place(0, -40, 200, 0, 0); });
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-out/scatter-loaded.png' });
// School of 6 bluegill at 10 m.
const before = await page.evaluate(() => window.__game.save.caught);
await page.evaluate(() => { for (const [dx, d] of [[-0.6, 10], [0, 10], [0.6, 10], [-0.3, 11], [0.3, 11], [0, 12]]) window.__game.spawn('bluegill', d, dx); });
await page.waitForTimeout(200);
await page.evaluate(() => window.__game.fire());
await page.waitForTimeout(60);
await page.screenshot({ path: 'qa-out/scatter-fired.png' });
await page.waitForTimeout(1200);
console.log('one blast into 6 bluegill caught:', (await page.evaluate(() => window.__game.save.caught)) - before);
// Big fish at 8 m: hp 30 Cathedral Sturgeon, healthy.
await page.evaluate(() => { window.__game.clearFish(); window.__game.place(0, -40, 200, 0, 0); window.__fishC = window.__game.spawn('cathedral', 9, 0); });
for (let i = 0; i < 2; i++) { await page.evaluate(() => window.__game.fire()); await page.waitForTimeout(900); }
console.log('Cathedral Sturgeon hp after 2 blasts at 9 m:', await page.evaluate(() => window.__fishC.hp), '/ 30 (alive:', await page.evaluate(() => window.__fishC.alive), ')');
await page.evaluate(() => { window.__game.setSave({ money: 5000 }); window.__game.shop(); });
await page.waitForTimeout(300);
console.log('shop harpoon text:', (await page.textContent('#upgrades')).match(/Harpoon[^$]*/)?.[0].slice(0, 120));
await page.screenshot({ path: 'qa-out/scatter-shop.png' });
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
