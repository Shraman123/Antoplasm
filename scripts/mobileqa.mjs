// Phone QA (emulated touch): title, start, stick, look, dive, fire, shop, pause, HUD overlap, orientation flip.
// Landscape 844x390 by default; QA_PORTRAIT=1 runs it at 390x844 (screenshots prefixed p-).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const PORTRAIT = !!process.env.QA_PORTRAIT;
const W = PORTRAIT ? 390 : 844, H = PORTRAIT ? 844 : 390, P = PORTRAIT ? 'qa-out/p-' : 'qa-out/m-';
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
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
await page.screenshot({ path: P + 'title.png' });
const [sx, sy] = await box('#btn-start');
await touch('touchStart', [[sx, sy]]); await touch('touchEnd', []);
await page.waitForTimeout(800);
console.log('mode after tapping start:', await g(() => window.__game.mode));
await page.evaluate(() => window.__game.freeze(true));
await page.screenshot({ path: P + 'play.png' });

// Move stick: push up (forward) from the left side for 1.2 s.
const p0 = await g(() => ({ ...window.__game.pos }));
await drag([W * 0.18, H * 0.75], [W * 0.18, H * 0.75 - 70], 6, 1200);
const p1 = await g(() => ({ ...window.__game.pos }));
console.log('stick forward moved', Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1), 'm');
// Look: drag right side left→right.
const v0 = await g(() => window.__game.view);
await drag([W * 0.7, H * 0.45], [W * 0.7 + 100, H * 0.45 - 40], 10);
const v1 = await g(() => window.__game.view);
console.log('look drag: yaw', (v1.yaw - v0.yaw).toFixed(2), 'pitch', (v1.pitch - v0.pitch).toFixed(2));
// Hold DOWN for 2 s.
const d0 = await g(() => -window.__game.pos.y);
const [dx, dy] = await box('.t-down');
await touch('touchStart', [[dx, dy]]); await page.waitForTimeout(2000); await touch('touchEnd', []);
console.log('dive button: depth', d0.toFixed(1), '->', (-(await g(() => window.__game.pos.y))).toFixed(1));
await page.screenshot({ path: P + 'dive.png' });
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
await page.screenshot({ path: P + 'boat.png' });
const [bx, by] = await box('.t-shop');
await touch('touchStart', [[bx, by]]); await touch('touchEnd', []);
await page.waitForTimeout(400);
console.log('mode after SHOP tap:', await g(() => window.__game.mode), '| controls hidden:', await g(() => document.getElementById('touch').classList.contains('hidden')));
await page.screenshot({ path: P + 'shop.png' });
const st0 = await g(() => document.querySelector('.shop-panel').scrollTop);
await drag([W / 2, H * 0.85], [W / 2, H * 0.25], 10);
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
// HUD vs touch buttons: nothing a thumb presses may sit on top of a readout.
await page.evaluate(() => window.__game.place(-4, 0.55, 291, -0.1, Math.PI)); // at the boat, so SHOP shows too
await page.waitForTimeout(400);
const overlaps = await g(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden' && !el.closest('.hidden') ? r : null; };
  const hud = ['#top-left', '#top-right', '#bars', '#hint.show'].map((s) => [s, document.querySelector(s) && vis(document.querySelector(s))]).filter((x) => x[1]);
  const btns = [...document.querySelectorAll('#touch .t-btn')].map((b) => ['.' + [...b.classList].find((c) => c.startsWith('t-') && c !== 't-btn'), vis(b)]).filter((x) => x[1]);
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const all = [...hud, ...btns], out = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (hit(all[i][1], all[j][1])) out.push(all[i][0] + ' x ' + all[j][0]);
  const off = all.filter(([, r]) => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight).map(([s]) => s);
  return { out, off };
});
console.log('HUD/button overlaps:', overlaps.out.length ? overlaps.out.join(', ') : 'none', '| off-screen:', overlaps.off.length ? overlaps.off.join(', ') : 'none');
await page.screenshot({ path: P + 'layout.png' });
// Flip orientation mid-game: the view refits and play continues.
await page.setViewportSize({ width: H, height: W });
await page.waitForTimeout(400);
console.log('after rotating to', W > H ? 'portrait' : 'landscape', '| fov', await g(() => window.__game.fov?.toFixed?.(0) ?? 'n/a'), '| mode', await g(() => window.__game.mode), '| rotate overlay gone:', await g(() => !document.getElementById('rotate')));
await page.screenshot({ path: P + 'flipped.png' });
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
