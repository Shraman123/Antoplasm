// Close-ups of the bow from several angles.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.freeze(true); window.__game.clearFish(); window.__game.gun.root.visible = false; });
// Boat bow is at z = 305 (+Z); camera yaw: forward = (-sin yaw, -cos yaw).
const views = [
  ['bow-front', [0, 1.6, 313, -0.08, 0]],
  ['bow-left', [-5, 1.6, 310, -0.1, -Math.PI / 2 + 0.6]],
  ['bow-top', [0, 5, 310, -0.7, 0]],
];
for (const [name, v] of views) {
  await page.evaluate((v) => { window.__noPause = true; window.__game.place(...v); }, v);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `qa-out/${name}.png` });
}
await browser.close();
