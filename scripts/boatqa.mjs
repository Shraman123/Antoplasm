// Boat views: from the surface (several angles) and from underneath.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.freeze(true); window.__game.clearFish(); window.__game.gun.root.visible = false; });
const views = [
  ['side', [14, 0.6, 300, -0.05, Math.PI / 2]],
  ['front', [0, 1.2, 284, -0.05, Math.PI]],
  ['quarter', [-9, 2.2, 290, -0.12, Math.PI + Math.PI / 4 + 0.2]],
  ['under', [0, -8, 288, 0.75, Math.PI]],
];
for (const [name, [x, y, z, p, yw]] of views) {
  await page.evaluate(([x, y, z, p, yw]) => window.__game.place(x, y, z, p, yw), [x, y, z, p, yw]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `qa-out/boat-${name}.png` });
}
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
