// Checks: opaque surface from above, long-range spear hits, swim speed.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.freeze(true); window.__game.teleport(-0.7, 0, 260); window.__game.look(-0.35, 0); });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'qa-out/tweak-surface.png' });
let hits = 0;
for (const [dist, dx] of [[25, 1.2], [35, 1.6], [45, 2.0], [55, 2.2]]) {
  const before = await page.evaluate(() => window.__game.save.caught);
  await page.evaluate(([dist, dx]) => { window.__game.teleport(30, 0, 200); window.__game.look(0, 0); window.__game.spawn('bluegill', dist, dx); }, [dist, dx]);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__game.fire());
  await page.waitForTimeout(6000);
  const got = (await page.evaluate(() => window.__game.save.caught)) > before;
  console.log(`bluegill at ${dist} m, ${dx} m off-centre: ${got ? 'HIT' : 'miss'}`);
}
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
