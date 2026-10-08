// Renders the PWA PNG icons from public/favicon.svg with the preinstalled Chromium.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage();

async function render(file, size, { maskable = false } = {}) {
  // Maskable icons need their content inside the central 80% safe zone on a full-bleed background.
  const inner = maskable ? Math.round(size * 0.72) : size;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html style="background:transparent"><body style="margin:0;background:${maskable ? '#1f1d1a' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px;overflow:hidden">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: !maskable });
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true });
await render('apple-touch-icon.png', 180, { maskable: true });
await browser.close();
console.log('icons written');
