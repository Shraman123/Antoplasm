// Renders the PWA icons (any + maskable + apple-touch) from the favicon's fish, into public/icons.
import { chromium } from 'playwright-core';
const fish = `<path d='M14 34c8-10 22-12 32-2l6-6v16l-6-6c-10 10-24 8-32-2z' fill='#ffd35a'/><circle cx='24' cy='32' r='2.5' fill='#123'/>`;
const bg = `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#8fd3ee'/><stop offset='1' stop-color='#1f6f96'/></linearGradient></defs>`;
// "any": rounded tile. "maskable": full-bleed square, fish kept inside the 80% safe-zone circle.
const svg = {
  any: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>${bg}<rect width='64' height='64' rx='14' fill='url(#g)'/><g transform='translate(32 32) scale(1.2) translate(-33 -32)'>${fish}</g></svg>`,
  full: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>${bg}<rect width='64' height='64' fill='url(#g)'/><g transform='translate(32 32) scale(1.1) translate(-33 -32)'>${fish}</g></svg>`,
};
const out = [['icon-192.png', 'any', 192], ['icon-512.png', 'any', 512], ['maskable-512.png', 'full', 512], ['apple-touch-icon.png', 'full', 180]];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
for (const [file, kind, size] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg[kind].replace('<svg ', `<svg width='${size}' height='${size}' `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: true });
  console.log('wrote', file);
}
await browser.close();
