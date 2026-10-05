// Scripted-scare QA: descend to each trigger depth on a fresh save, confirm the event fires
// once, screenshot its key moment, and check cleanup (death mid-event restores the lamp) and
// Teodor's changed line afterwards.
//   node scripts/scareqa.mjs     (needs `npm run dev` on :5173, or QA_URL)
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL ?? 'http://localhost:5173/');
await page.waitForTimeout(1500);
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => { localStorage.clear(); window.__game.play(); window.__game.setSave({ armor: 5, air: 5, logs: [10, 20, 70, 120, 180, 240, 300, 360, 430, 500, 560, 9999] }); window.__game.spawning = false; window.__game.clearFish(); });
let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', label); };
const keep = () => page.evaluate(() => { window.__game.setSave({ air: 5 }); window.__game.setHp(100); });
const logText = () => page.evaluate(() => document.getElementById('log').textContent);
const at = async (depth) => page.evaluate((d) => { window.__game.teleport(d, 0, -25); window.__game.look(0, 0); }, depth);
const wait = async (ms) => { for (let t = 0; t < ms; t += 250) { await page.waitForTimeout(250); await keep(); } };
const idle = async () => { for (let i = 0; i < 120 && (await page.evaluate(() => window.__game.scareBusy)); i++) await wait(250); };
const seen = (id) => page.evaluate((id) => window.__game.save.logs.includes(id), id);

// Shadow (140 m)
await at(145);
await wait(600);
ok(await seen(10001), 'shadow fires at 140 m');
await wait(6400);
await page.screenshot({ path: 'qa-out/scare-1-shadow.png' });
await wait(4000);
ok((await logText()).includes('ferry'), 'shadow log line shows');
await wait(4000);
ok(!(await page.evaluate(() => window.__game.scareBusy)), 'shadow finishes and cleans up');

// Blackout (235 m)
await idle();
await at(240);
await wait(1500);
ok(await seen(10002), 'blackout fires at 235 m');
ok(await page.evaluate(() => window.__game.world.lampMult === 0), 'lamp is dead during the blackout');
await page.screenshot({ path: 'qa-out/scare-2a-dark.png' });
await wait(2300);
await page.screenshot({ path: 'qa-out/scare-2b-diver.png' });
ok((await logText()).includes('TEODOROV'), 'drowned diver revealed with name');
ok(await page.evaluate(() => window.__game.world.lampMult === 1), 'lamp back on after the reveal');
await wait(11000);

// Radio (330 m)
await idle();
await at(335);
await wait(2000);
const radioSeen = await seen(10003), radioLog = await logText(), radioBusy = await page.evaluate(() => window.__game.scareBusy);
if (!radioLog.includes('My boy')) console.log('  radio debug:', { radioSeen, radioBusy, radioLog });
ok(radioSeen && radioLog.includes('My boy'), 'radio message at 330 m');
await wait(9000);

// Beneath (420 m)
await idle();
await at(425);
await wait(7000);
await page.evaluate(() => window.__game.look(-1.1, 0));
await wait(300);
await page.screenshot({ path: 'qa-out/scare-4-beneath.png' });
ok(await seen(10004), 'beneath fires at 420 m');
await page.evaluate(() => window.__game.look(0, 0));
await wait(10000);

// Eyes (520 m)
await idle();
await at(525);
await wait(1500);
ok(await seen(10005), 'eyes fire at 520 m');
await page.screenshot({ path: 'qa-out/scare-5-eyes.png' });
await wait(7000);
ok(await page.evaluate(() => window.__game.world.lampMult === 1), 'lamp restored after the eyes');

// Once only: going back past every trigger fires nothing new.
await at(145); await wait(1000); await at(425); await wait(1000);
ok(!(await page.evaluate(() => window.__game.scareBusy)), 'events do not repeat on the same save');

// Death mid-blackout: lamp restored, nothing left running.
await page.evaluate(() => window.__game.scare('blackout'));
await wait(800);
await page.evaluate(() => window.__game.setHp(-1));
await page.waitForTimeout(500);
ok(await page.evaluate(() => window.__game.mode === 'dead' && window.__game.world.lampMult === 1 && !window.__game.scareBusy), 'dying mid-event cleans up (lamp on, no event running)');

// Teodor knows.
await page.evaluate(() => document.getElementById('btn-respawn').click());
await page.waitForTimeout(500);
await page.evaluate(() => window.__game.shop());
await page.waitForTimeout(300);
ok((await page.evaluate(() => document.getElementById('teodor').textContent)).includes('You found him'), "Teodor's line changes after the blackout");

console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
