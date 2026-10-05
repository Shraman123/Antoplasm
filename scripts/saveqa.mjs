// Save-safety QA against a production build (`npm run build && npx vite preview --port 4173`):
// save code export -> import on a second "device", bad codes rejected, typing doesn't drive the game,
// tier clamping, service worker offline reload, manifest, install button, iOS home-screen tip.
import { chromium } from 'playwright-core';
import { encodeSave } from '../src/savecode.ts';
const URL = process.env.QA_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];
const open = async (opts = {}, path = '') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL + path);
  await page.waitForFunction(() => !!window.__game);
  return { ctx, page };
};
const ok = (cond, label) => console.log(cond ? 'PASS' : 'FAIL', label);

// Device A: some progress, then export from the pause menu.
const A = await open({}, '?touch=1');
await A.page.evaluate(() => { localStorage.clear(); });
await A.page.reload(); await A.page.waitForFunction(() => !!window.__game);
await A.page.evaluate(() => window.__game.setSave({ money: 512, air: 2, harpoon: 3, armor: 1, caught: 12, journal: ['bluegill', 'perch'] }));
await A.page.click('#btn-start');
await A.page.waitForTimeout(500);
await A.page.tap('.t-pause');
await A.page.waitForTimeout(200);
await A.page.tap('#btn-code-pause');
const code = await A.page.inputValue('#code-out');
ok(/^ML1\.[\w-]+\.\w{4}$/.test(code), `export from pause gives a code (${code.length} chars)`);
await A.page.screenshot({ path: 'qa-out/save-panel.png' });
await A.page.tap('#btn-code-back');
ok(await A.page.evaluate(() => !document.getElementById('pause').classList.contains('hidden')), 'Back returns to the pause menu');

// Device B: fresh browser, import from the title screen.
const B = await open();
ok(await B.page.evaluate(() => document.getElementById('btn-start').textContent === 'Start Fishing'), 'device B starts with no save');
await B.page.tap('#btn-code-title');
// Typing must not drive the game (M = mute, Space = ascend).
await B.page.focus('#code-in');
await B.page.keyboard.type('m m');
ok(await B.page.inputValue('#code-in') === 'm m', 'typing m/space goes into the box (no mute, no preventDefault)');
await B.page.fill('#code-in', 'hello');
await B.page.tap('#btn-code-load');
ok((await B.page.textContent('#code-msg')).includes("isn't a Morrow Lake"), 'garbage code rejected');
await B.page.fill('#code-in', code.slice(0, -9));
await B.page.tap('#btn-code-load');
ok((await B.page.textContent('#code-msg')).includes('incomplete'), 'truncated code rejected');
await B.page.fill('#code-in', ' ' + code.slice(0, 40) + '\n' + code.slice(40) + ' ');
await B.page.tap('#btn-code-load');
await B.page.waitForEvent('load');
await B.page.waitForFunction(() => !!window.__game);
const s = await B.page.evaluate(() => window.__game.save);
ok(s.money === 512 && s.harpoon === 3 && s.air === 2 && s.armor === 1 && s.caught === 12 && s.journal.length === 2, 'code with line breaks/spaces imports full save on device B');
ok(await B.page.evaluate(() => document.getElementById('btn-start').textContent === 'Continue'), 'title shows Continue after import');

// Tier indices from a hand-edited code are clamped.
const forged = encodeSave({ money: 1, air: 99, harpoon: 99, armor: -4, harpoonV: 2 });
if (forged) {
  await B.page.tap('#btn-code-title');
  await B.page.fill('#code-in', forged);
  await B.page.tap('#btn-code-load');
  await B.page.waitForEvent('load');
  await B.page.waitForFunction(() => !!window.__game);
  const f = await B.page.evaluate(() => window.__game.save);
  ok(f.harpoon === 9 && f.air === 5 && f.armor === 0, `out-of-range tiers clamped (${f.air}/${f.harpoon}/${f.armor})`);
}

// Service worker + offline.
const swUrl = await B.page.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.ready).active?.scriptURL : null));
ok(!!swUrl, `service worker active (${swUrl})`);
await B.page.reload(); await B.page.waitForFunction(() => !!window.__game); // let the SW cache the assets
await B.ctx.setOffline(true);
await B.page.reload();
const offline = await B.page.waitForFunction(() => !!window.__game, null, { timeout: 15000 }).then(() => true, () => false);
ok(offline, 'game reloads and runs with the network off');
ok(await B.page.evaluate(() => window.__game.save.money) === 1, 'save still there offline');
await B.ctx.setOffline(false);

// Manifest.
const man = await B.page.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]').href;
  const r = await fetch(href);
  return { type: r.headers.get('content-type'), json: await r.json() };
});
ok(man.json.icons.length === 3 && man.json.display === 'fullscreen', `manifest served (${man.type})`);
const icons = await B.page.evaluate(async (list) => Promise.all(list.map(async (i) => (await fetch(i.src)).status)), man.json.icons);
ok(icons.every((c) => c === 200), 'all manifest icons load');

// Install button appears when the browser offers install.
const shown = await B.page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => Promise.resolve();
  dispatchEvent(e);
  return !document.getElementById('btn-install').classList.contains('hidden');
});
ok(shown, 'Install app button shows on beforeinstallprompt');
ok(await B.page.evaluate(() => document.getElementById('ios-tip').classList.contains('hidden')), 'iOS tip hidden on Android');

// iPhone Safari: tip shown.
const C = await open({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
ok(await C.page.evaluate(() => !document.getElementById('ios-tip').classList.contains('hidden')), 'iOS tip shown on iPhone Safari');
await C.page.screenshot({ path: 'qa-out/save-ios-title.png' });
// Landscape phone: panel must fit.
await C.page.setViewportSize({ width: 844, height: 390 });
await C.page.tap('#btn-code-title');
await C.page.waitForTimeout(200);
await C.page.screenshot({ path: 'qa-out/save-panel-landscape.png' });
const fits = await C.page.evaluate(() => { const r = document.querySelector('.code-panel').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; });
ok(fits, 'save panel fits a landscape phone (scrolls inside)');

console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
await browser.close();
