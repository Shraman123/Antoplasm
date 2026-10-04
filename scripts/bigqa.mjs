// Close-ups: harpoon per tier, and the six large species healthy vs infected.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'qa-out';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.setSave({ armor: 5, air: 5 }); window.__game.freeze(true); window.__game.teleport(20, 0, 250); window.__game.look(0.1, 0); });
for (const tier of [0, 2, 4, 5]) {
  await page.evaluate((t) => window.__game.setSave({ harpoon: t }), tier);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/gun-${tier}.png` });
}
await page.evaluate(() => window.__game.fire());
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/gun-fired.png` });
const rows = [['carp', 'sturgeon', 'muskie'], ['paddlefish', 'wels', 'cathedral']];
for (const [ri, ids] of rows.entries()) {
  for (const [label, roll] of [['healthy', -1], ['infected', 600]]) {
    const names = await page.evaluate(([ids, roll, ri]) => {
      const g = window.__game; g.teleport(ri ? 150 : 40, 0, ri ? 120 : 230); g.look(0, 0);
      const made = [];
      ids.forEach((id, i) => {
        let f; let tries = 0;
        do { f = g.spawn(id, ri ? 26 : 20, (i - 1) * (ri ? 11 : 8), roll < 0 ? 0 : roll); tries++; if ((roll < 0) === (f.sp.infection > f.sp.infection * 0 && f.sp.name.startsWith('Infected'))) { f.root.removeFromParent(); } else break; } while (tries < 20);
        made.push(`${f.sp.name} hp${f.hp} dmg${f.sp.damage} $${f.sp.price}`);
      });
      return made;
    }, [ids, roll, ri]);
    console.log(label, names.join(' | '));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/big-${ri}-${label}.png` });
    await page.evaluate(() => window.__game.clearFish());
  }
}
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
