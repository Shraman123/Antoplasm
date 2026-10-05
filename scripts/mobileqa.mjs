// Phone QA (emulated touch, landscape 844x390): title, start, stick, look, dive, fire, shop, rotate prompt.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const drag = async (from, to, steps = 8, holdMs = 0) => {
  await touch('touchStart', [from]);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]); await page.waitForTimeout(16); }
  if (holdMs) await page.waitForTimeout(holdMs);
  await touch('touchEnd', []);
};
const box = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const g = (fn) => page.evaluate(fn);

await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => !!window.__game);
console.log('touch mode:', await g(() => document.body.classList.contains('touch')), '| touch help shown:', await g(() => !document.getElementById('controls-touch').classList.contains('hidden')));
await page.screenshot({ path: 'qa-out/m-title.png' });
const [sx, sy] = await box('#btn-start');
await touch('touchStart', [[sx, sy]]); await touch('touchEnd', []);
await page.waitForTimeout(800);
console.log('mode after tapping start:', await g(() => window.__game.mode));
await page.evaluate(() => window.__game.freeze(true));
await page.screenshot({ path: 'qa-out/m-play.png' });

// Move stick: push up (forward) from the left side for 1.2 s.
const p0 = await g(() => ({ ...window.__game.pos }));
await drag([150, 290], [150, 220], 6, 1200);
const p1 = await g(() => ({ ...window.__game.pos }));
console.log('stick forward moved', Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1), 'm');
// Look: drag right side left→right.
const v0 = await g(() => window.__game.view);
await drag([600, 200], [700, 160], 10);
const v1 = await g(() => window.__game.view);
console.log('look drag: yaw', (v1.yaw - v0.yaw).toFixed(2), 'pitch', (v1.pitch - v0.pitch).toFixed(2));
// Hold DOWN for 2 s.
const d0 = await g(() => -window.__game.pos.y);
const [dx, dy] = await box('.t-down');
await touch('touchStart', [[dx, dy]]); await page.waitForTimeout(2000); await touch('touchEnd', []);
console.log('dive button: depth', d0.toFixed(1), '->', (-(await g(() => window.__game.pos.y))).toFixed(1));
await page.screenshot({ path: 'qa-out/m-dive.png' });
// Fire at a fish in front.
await page.evaluate(() => { window.__game.place(0, -20, 220, 0, 0); window.__game.spawn('perch', 8, 0); });
const c0 = await g(() => window.__game.save.caught);
const [fx, fy] = await box('.t-fire');
await touch('touchStart', [[fx, fy]]); await page.waitForTimeout(2500); await touch('touchEnd', []);
console.log('hold FIRE: caught', (await g(() => window.__game.save.caught)) - c0);
// Shop button at the boat.
await page.evaluate(() => window.__game.place(-4, 0.55, 291, -0.1, Math.PI));
await page.waitForTimeout(400);
console.log('shop button visible at boat:', await g(() => !document.querySelector('.t-shop').classList.contains('hidden')));
await page.screenshot({ path: 'qa-out/m-boat.png' });
const [bx, by] = await box('.t-shop');
await touch('touchStart', [[bx, by]]); await touch('touchEnd', []);
await page.waitForTimeout(400);
console.log('mode after SHOP tap:', await g(() => window.__game.mode), '| controls hidden:', await g(() => document.getElementById('touch').classList.contains('hidden')));
await page.screenshot({ path: 'qa-out/m-shop.png' });
const st0 = await g(() => document.querySelector('.shop-panel').scrollTop);
await drag([420, 330], [420, 90], 10);
await page.waitForTimeout(300);
console.log('shop scroll by finger: scrollTop', st0, '->', await g(() => Math.round(document.querySelector('.shop-panel').scrollTop)));
const [cx, cy] = await box('#btn-close-top');
await touch('touchStart', [[cx, cy]]); await touch('touchEnd', []);
await page.waitForTimeout(300);
console.log('mode after closing shop:', await g(() => window.__game.mode));
// Pause button.
const [px, py] = await box('.t-pause');
await touch('touchStart', [[px, py]]); await touch('touchEnd', []);
await page.waitForTimeout(200);
console.log('mode after pause tap:', await g(() => window.__game.mode));
const [rx, ry] = await box('#btn-resume');
await touch('touchStart', [[rx, ry]]); await touch('touchEnd', []);
await page.waitForTimeout(200);
console.log('mode after resume:', await g(() => window.__game.mode));
// Portrait: rotate prompt.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
console.log('rotate prompt in portrait:', await g(() => getComputedStyle(document.getElementById('rotate')).display));
await page.screenshot({ path: 'qa-out/m-portrait.png' });
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
