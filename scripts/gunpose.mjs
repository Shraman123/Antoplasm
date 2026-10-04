import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.setSave({ armor: 5, harpoon: 3 }); window.__game.freeze(true); window.__game.teleport(250, 0, -20); window.__game.look(0.1, 0); });
const poses = JSON.parse(process.argv[2]);
for (const [i, p] of poses.entries()) {
  await page.evaluate((p) => { const r = window.__game.gun.root; r.position.set(p[0], p[1], p[2]); r.rotation.set(p[3], p[4], p[5]); }, p);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `qa-out/pose-${i}.png` });
}
await browser.close();
