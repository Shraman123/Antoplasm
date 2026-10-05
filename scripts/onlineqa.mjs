// Accounts end-to-end against the local Supabase (npx supabase start; dev server with .env.local):
// sign-up, cloud save adopted on a second device, cross-device conflict prompt, friends + online
// status, leaderboards, sign-out keeps local play. Each run uses fresh random accounts.
import { chromium } from 'playwright-core';
const URL = process.env.QA_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let fails = 0;
const errs = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const run = Math.random().toString(36).slice(2, 7);

async function device(label) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__game);
  return page;
}
async function signIn(page, who) {
  await page.click('#btn-online-title');
  await page.fill('#dev-email', `${who}-${run}@qa.test`);
  await page.fill('#dev-pass', 'diver-pass-123');
  await page.fill('#dev-name', who);
  await page.click('#dev-login button[type=submit]');
  await page.waitForFunction(() => window.__game.account.status === 'synced', null, { timeout: 15000 });
}
const synced = (page) => page.waitForFunction(() => window.__game.account.status === 'synced', null, { timeout: 15000 });

// ---------- Device A: sign up ----------
const a = await device('A');
check(await page_visible(a, '#btn-online-title'), 'Online button shows when Supabase is configured');
await signIn(a, 'Ana');
check((await a.textContent('#acct-name').catch(() => '')) !== null && (await a.inputValue('#acct-name')) === 'Ana', 'display name comes from sign-up');
const anaCode = await a.textContent('#acct-code');
check(/^[A-Z2-9]{6}$/.test(anaCode), `friend code shown (${anaCode})`);
check(await a.evaluate(() => window.__game.profile.achievements.includes('signed_in')), 'signing in unlocks Signed the Logbook');
await a.click('#btn-online-back');
check((await a.textContent('#account-line')).includes('Ana'), 'title shows who is signed in');

// Play a little on A: real progress, saved and pushed.
await a.evaluate(() => { const g = window.__game; g.setSave({ money: 123, caught: 4, playTime: 300, maxDepth: 77 }); g.profile.deepest = 77; g.persist(); });
await a.evaluate(() => window.__game.account.flush());
await synced(a);

// ---------- Device B: same account, fresh browser -> adopts the cloud run silently ----------
const b = await device('B');
await signIn(b, 'Ana');
await b.click('#btn-online-back');
check(await b.evaluate(() => window.__game.save.money) === 123, 'second device picks up the cloud save');
check((await b.textContent('#btn-start')) === 'Continue', 'title offers Continue for the cloud run');
check(await b.evaluate(() => window.__game.profile.deepest) >= 77, 'lifetime record follows the account');

// ---------- Conflict: both devices play, then sync ----------
await b.evaluate(() => { window.__game.setSave({ money: 300, playTime: 400 }); window.__game.persist(); });
await b.evaluate(() => window.__game.account.flush());
await synced(b);
await a.evaluate(() => { window.__game.setSave({ money: 200, playTime: 350 }); window.__game.persist(); });
const flushA = a.evaluate(() => window.__game.account.flush());
await a.waitForSelector('#conflict:not(.hidden)', { timeout: 10000 }).catch(() => {});
check(await page_visible(a, '#conflict'), 'both devices played: A is asked which run to keep');
check((await a.textContent('#conflict-local')).includes('$200') && (await a.textContent('#conflict-cloud')).includes('$300'), 'the chooser describes both runs');
await a.screenshot({ path: 'qa-out/online-conflict.png' });
await a.click('#btn-keep-cloud');
await flushA;
await synced(a);
check(await a.evaluate(() => window.__game.save.money) === 300, 'choosing the cloud run loads it');

// ---------- Friends ----------
const c = await device('C');
await signIn(c, 'Bo');
await c.click('.tabs button[data-tab=friends]');
await c.fill('#friend-code-in', anaCode.toLowerCase());
await c.click('#friend-add button');
await c.waitForSelector('#friends li .who', { timeout: 8000 }).catch(() => {});
check((await c.textContent('#friends')).includes('Ana'), 'add a friend by code');
check(await c.evaluate(() => window.__game.profile.achievements.includes('friend')), 'adding a friend unlocks Dive Buddy');
await c.fill('#friend-code-in', (await c.textContent('#acct-code')) ?? '');
await c.click('#friend-add button');
await c.waitForTimeout(800);
check((await c.textContent('#friend-msg')).includes('own code'), 'adding yourself explains why not');
await a.click('#btn-online-title');
await a.click('.tabs button[data-tab=friends]');
await a.waitForSelector('#friends li .who', { timeout: 8000 }).catch(() => {});
await a.waitForTimeout(1500); // lobby presence
check((await a.textContent('#friends')).includes('Bo'), 'friendship is mutual');
check((await a.locator('#friends .dot.on').count()) > 0, 'online friends show a green dot');
await a.screenshot({ path: 'qa-out/online-friends.png' });

// ---------- Leaderboards ----------
await a.click('.tabs button[data-tab=boards]');
await a.waitForSelector('#board li.me', { timeout: 8000 }).catch(() => {});
check((await a.locator('#board li.me').count()) === 1, 'deepest board highlights you');
await a.click('#board-scope button[data-s=friends]');
await a.waitForTimeout(800);
const friendRows = await a.locator('#board li:not(.empty):not(.gap)').count();
check(friendRows >= 1 && friendRows <= 2, `friends board shows only you and Bo (${friendRows})`);
await a.click('#board-metrics button[data-m=achievements]');
await a.waitForTimeout(800);
check((await a.textContent('#board')).includes('🏆'), 'achievements board renders counts');
await a.screenshot({ path: 'qa-out/online-boards.png' });
await a.setViewportSize({ width: 390, height: 844 });
await a.waitForTimeout(200);
check(!(await a.evaluate(() => document.querySelector('.online-panel').scrollWidth > document.querySelector('.online-panel').clientWidth + 1)), 'online panel fits a phone');
await a.screenshot({ path: 'qa-out/online-phone.png' });

// ---------- Sign out: still playable as a guest ----------
await c.click('.tabs button[data-tab=account]');
await c.click('#btn-signout');
await c.waitForFunction(() => window.__game.account.status === 'signed-out');
await c.click('#btn-online-back');
await c.click('#btn-start');
await c.waitForTimeout(500);
check(await c.evaluate(() => window.__game.mode === 'play'), 'signed-out players can still dive');

console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
process.exit(fails ? 1 : 0);

async function page_visible(page, sel) {
  return page.locator(sel).isVisible();
}
