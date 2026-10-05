// Graphics before/after: one still + FPS per depth zone, same camera every run.
//   node scripts/gfxqa.mjs <outDir>     (needs `npm run dev` on :5173, or QA_URL)
// QA_W/QA_H set the viewport; QA_TOUCH=1 emulates a phone (lower pixel ratio path).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const outDir = process.argv[2] ?? 'qa-out/gfx';
fs.mkdirSync(outDir, { recursive: true });
const W = +(process.env.QA_W ?? 1280), H = +(process.env.QA_H ?? 720);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(process.env.QA_TOUCH ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.setSave({ armor: 5, air: 5, harpoon: 5 }); });
const fps = () => page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); };
  requestAnimationFrame(f);
}));
const shots = [[0, 0.05, 'surface'], [8, 0.35, 'shallows-up'], [15, -0.25, 'shallows'], [70, -0.1, 'twilight'], [200, -0.25, 'murk'], [320, -0.3, 'weeping'], [440, -0.3, 'rot'], [560, -0.4, 'trench']];
for (const [d, p, name] of shots) {
  // The dev server can hot-reload the page under us; restart play if that happened.
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => { if (window.__game.mode !== 'play') { window.__game.play(); window.__game.setSave({ armor: 5, air: 5, harpoon: 5 }); } });
  await page.evaluate(([d, p]) => {
    Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); // same fish each run
    window.__game.teleport(d, 0, -330 + d * 0.5); window.__game.look(p, Math.PI);
  }, [d, p]);
  await page.waitForTimeout(3000);
  const f = await fps();
  await page.screenshot({ path: `${outDir}/${String(d).padStart(3, '0')}-${name}.png` });
  console.log(name.padEnd(12), String(d).padStart(3), 'm  fps', f, '| mode', await page.evaluate(() => window.__game.mode), '| calls', await page.evaluate(() => window.__game.calls));
}
console.log(errs.length ? errs.slice(0, 10).join('\n') : 'no errors');
await browser.close();
