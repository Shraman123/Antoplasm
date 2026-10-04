// Browser QA: drives the dev server with the local Chrome, screenshots each depth zone,
// the shop, and the ending cutscene, and reports console errors + FPS.
//   node scripts/qa.mjs [outDir]       (needs `npm run dev` on :5173, or QA_URL)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const outDir = process.argv[2] ?? 'qa-out';
const url = process.env.QA_URL ?? 'http://localhost:5173/';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url);
await page.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/00-title.png` });

const fps = (ms) => page.evaluate((ms) => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); };
  requestAnimationFrame(f);
}), ms);

await page.evaluate(() => { window.__game.play(); window.__game.setSave({ armor: 5, air: 5, harpoon: 5 }); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/01-surface.png` });

const shots = [[15, 0.1, 'shallows'], [70, -0.1, 'twilight'], [200, -0.2, 'murk'], [320, -0.2, 'weeping'], [440, -0.3, 'rot'], [560, -0.4, 'trench']];
for (const [d, p, name] of shots) {
  await page.evaluate(([d, p]) => { window.__game.teleport(d, 0, -330 + d * 0.5); window.__game.look(p, Math.PI); }, [d, p]);
  // let fish spawn and swim in
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => ({ fish: window.__game.fish, hp: Math.round(window.__game.hp), mode: window.__game.mode }));
  console.log(name, d, 'm', JSON.stringify(info));
  await page.screenshot({ path: `${outDir}/02-${d}-${name}.png` });
}
console.log('fps @560m:', await fps(2000));

// Close-up fish lineup for model QA: lure every species in front of the camera.
await page.evaluate(() => { window.__game.give('maw'); window.__game.give('bluegill'); window.__game.shop(); });
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/03-shop.png` });
await page.evaluate(() => document.getElementById('btn-close').click());

await page.evaluate(() => { window.__game.teleport(590, 2, 2); window.__game.ending(); });
for (const t of [2, 7, 12, 17, 21, 24, 26.5, 28]) {
  await page.waitForTimeout(t === 2 ? 2000 : 0);
  await page.waitForFunction((t) => true, t);
  await page.screenshot({ path: `${outDir}/04-cut-${String(t).replace('.', '_')}.png` });
  await page.waitForTimeout(t < 21 ? 4000 : t < 24 ? 2500 : 1500);
}
await page.waitForTimeout(5000);
console.log('mode after cutscene:', await page.evaluate(() => window.__game.mode));
await page.screenshot({ path: `${outDir}/05-ending.png` });

console.log(logs.length ? logs.slice(0, 20).join('\n') : 'no console errors');
await browser.close();
