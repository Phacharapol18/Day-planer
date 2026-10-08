// Legacy (pre-Android 8) launcher PNGs rendered from public/favicon.svg with Chromium.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [dpi, px] of Object.entries(sizes)) {
  for (const round of [false, true]) {
    await page.setViewportSize({ width: px, height: px });
    const inner = round ? `<div style="width:${px}px;height:${px}px;border-radius:50%;overflow:hidden;background:#1f1d1a;display:grid;place-items:center">${svg.replace('<svg ', `<svg width="${Math.round(px * 0.92)}" height="${Math.round(px * 0.92)}" `)}</div>` : svg.replace('<svg ', `<svg width="${px}" height="${px}" `);
    await page.setContent(`<html style="background:transparent"><body style="margin:0;background:transparent">${inner}</body></html>`);
    const file = new URL(`../android/app/src/main/res/mipmap-${dpi}/${round ? 'ic_launcher_round' : 'ic_launcher'}.png`, import.meta.url).pathname;
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  }
}
await browser.close();
console.log('android icons written');
