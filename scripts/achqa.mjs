// Achievements: unlock + toast, death-cause mapping, persistence across reload and New Game,
// carried by save codes, and the achievements screen renders (screenshot in qa-out/).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const URL = process.env.QA_URL ?? 'http://localhost:5173/';
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const ready = () => page.waitForFunction(() => !!window.__game);

await page.goto(URL); await ready();
await page.evaluate(() => localStorage.clear()); await page.reload(); await ready();
check((await page.textContent('#btn-ach-title')).includes('0/'), 'title button shows 0 unlocked');

// Catch a fish for real: spear it.
await page.evaluate(() => { const g = window.__game; g.play(); g.freeze(true); g.place(0, -20, 250, 0, 0); g.spawn('bluegill', 6, 0); g.fire(); });
await page.waitForFunction(() => window.__game.profile.achievements.includes('first_catch'), null, { timeout: 8000 }).catch(() => {});
check(await page.evaluate(() => window.__game.profile.achievements.includes('first_catch')), 'spearing a fish unlocks First Bite');
check(await page.locator('.toast.ach').count() > 0, 'achievement toast shown');
check((await page.textContent('.toast.ach')).includes('First Bite'), 'toast names the achievement');

// Depth milestone by swimming down past 100 m (place just above, let the sim cross it).
await page.evaluate(() => { const g = window.__game; g.setSave({ armor: 2 }); g.place(0, -98, 0, -1.4, 0); g.keys.add('KeyW'); });
await page.waitForFunction(() => window.__game.profile.achievements.includes('depth_100'), null, { timeout: 8000 }).catch(() => {});
await page.evaluate(() => window.__game.keys.delete('KeyW'));
check(await page.evaluate(() => window.__game.profile.achievements.includes('depth_100')), 'diving past 100 m unlocks Green Twilight');

// Drowning maps to Lungful.
await page.evaluate(() => { const g = window.__game; g.setAir(0); g.setHp(1); });
await page.waitForFunction(() => window.__game.mode === 'dead', null, { timeout: 8000 });
check(await page.evaluate(() => window.__game.profile.achievements.includes('die_drown')), 'drowning unlocks Lungful');
await page.click('#btn-respawn');
await page.waitForTimeout(400);
check(!(await page.evaluate(() => window.__game.profile.achievements.includes('close_call'))), 'respawning after drowning is not a close call');

// Persistence: reload, then New Game keeps the profile.
await page.reload(); await ready();
check(await page.evaluate(() => window.__game.profile.achievements.length >= 3), 'achievements survive a reload');
await page.click('#btn-new');
await page.waitForTimeout(300);
check(await page.evaluate(() => window.__game.profile.achievements.includes('first_catch') && window.__game.save.caught === 0), 'New Game wipes the run but keeps achievements');

// Save code carries them to a fresh browser.
await page.evaluate(() => { window.__game.setSave({}); document.querySelector('#btn-ach-pause'); });
await page.reload(); await ready();
await page.click('#btn-code-title');
const code = await page.inputValue('#code-out');
await page.click('#btn-code-back');
const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
await p2.goto(URL); await p2.waitForFunction(() => !!window.__game);
await p2.click('#btn-code-title');
await p2.fill('#code-in', code);
await p2.click('#btn-code-load');
await p2.waitForTimeout(1500); await p2.waitForFunction(() => !!window.__game);
check(await p2.evaluate(() => window.__game.profile.achievements.includes('die_drown')), 'save code carries achievements to another browser');

// Screen.
await page.click('#btn-ach-title');
await page.waitForTimeout(300);
const cards = await page.locator('.ach-card').count();
const got = await page.locator('.ach-card.got').count();
check(cards >= 25 && got >= 3, `achievements screen lists ${cards} cards, ${got} unlocked`);
check((await page.locator('.ach-card:not(.got) .ach-bar').count()) > 0, 'goal achievements show progress bars');
await page.screenshot({ path: 'qa-out/achievements.png' });
await p2.setViewportSize({ width: 390, height: 844 });
await p2.click('#btn-ach-title'); await p2.waitForTimeout(300);
const overflow = await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('.ach-panel').scrollWidth > document.querySelector('.ach-panel').clientWidth);
check(!overflow, 'achievements screen fits a phone width');
await p2.screenshot({ path: 'qa-out/achievements-phone.png' });

console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
process.exit(fails ? 1 : 0);
