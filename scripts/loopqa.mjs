// Gameplay loop check: spear a fish, sell it, buy an upgrade, then drown and lose the catch.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.freeze(true); window.__game.teleport(20, 0, 250); window.__game.look(0, 0); });
await page.waitForTimeout(300);
let caught = 0;
for (let i = 0; i < 4 && caught < 2; i++) {
  await page.evaluate(() => { window.__game.spawn('perch', 6, 0); window.__game.fire(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__game.fire());
  await page.waitForTimeout(1500);
  caught = await page.evaluate(() => window.__game.save.caught);
}
console.log('caught', caught);
await page.evaluate(() => { window.__game.teleport(0.5, 0, 292); window.__game.shop(); });
await page.click('#btn-sell');
console.log('money after sell', await page.evaluate(() => window.__game.save.money));
await page.click('#btn-close'); await page.evaluate(() => { window.__game.setSave({ money: 100 }); window.__game.shop(); });
await page.click('#btn-sell', { force: true }).catch(() => {});
await page.evaluate(() => document.querySelector('#upgrades button').click());
console.log('air tier after buy', await page.evaluate(() => [window.__game.save.air, window.__game.save.money]));
await page.click('#btn-close');
await page.evaluate(() => { window.__game.give('trout'); window.__game.teleport(200, 0, -100); });
await page.waitForFunction(() => window.__game.mode === 'dead', null, { timeout: 120000 });
console.log('died:', await page.textContent('#dead-title'), '|', await page.textContent('#dead-text'));
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
