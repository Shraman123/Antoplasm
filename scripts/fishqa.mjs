// Close-up lineup of every species (AI frozen) to check the procedural models.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'qa-out';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { window.__game.play(); window.__game.setSave({ armor: 5, air: 5 }); window.__game.freeze(true); });
const groups = [[25, ['bluegill', 'perch', 'trout']], [150, ['pike', 'eel', 'catfish']], [330, ['gar', 'maw', 'husk']]];
for (const [d, ids] of groups) {
  await page.evaluate(([d, ids]) => {
    const g = window.__game; g.teleport(d, 0, -330 + d * 0.5); g.look(0, Math.PI);
    ids.forEach((id, i) => g.spawn(id, 10, (i - 1) * 5));
  }, [d, ids]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/fish-${d}.png` });
}
await page.evaluate(() => { window.__game.teleport(0.5, 0, 296); window.__game.look(-0.05, 0); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/surface-boat.png` });
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
