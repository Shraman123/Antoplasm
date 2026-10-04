// Deterministic cutscene stills: steps the cutscene clock directly instead of waiting on frame rate.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'qa-out';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { window.__game.play(); window.__game.setSave({ armor: 5, air: 5 }); window.__game.teleport(590, 2, 2); });
await page.waitForTimeout(500);
console.log('draw calls in play:', await page.evaluate(() => window.__game.calls));
await page.evaluate(() => window.__game.ending());
let t = 0;
for (const target of [1.5, 8, 14, 19, 22, 24.5, 25.5, 26.5, 27.3, 27.9]) {
  await page.evaluate((d) => window.__game.stepCut(d), target - t);
  t = target;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/cut-${String(target).replace('.', '_')}.png` });
}
console.log('draw calls in city:', await page.evaluate(() => window.__game.calls));
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
