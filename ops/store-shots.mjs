/* THE STORE SCREENSHOTS. Real popup captures, composed onto the 1280x800 canvas the Chrome Web
 * Store dashboard asks for. The popup itself is only 372px wide; nothing here draws on top of it,
 * it is placed on BreachProbe's own page ground (#0a0a0a) so the frame around it is the product's
 * real background colour and not an invented scene.
 *
 *   node ops/store-shots.mjs
 *
 * Reuses ops/verify.mjs's own popup-opening path (host_permissions origin, so tab detection needs
 * no synthetic gesture) against breachprobe.kynth.studio, a live Kynth Studios product, through a
 * real scan against the real API.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const EXT = path.resolve('/Users/admin/CompoundLabs/breachprobe-extension');
const OUT = path.join(EXT, 'store', 'screenshots');
mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext('/tmp/bp-ext-store-shots', {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
});
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = sw.url().split('/')[2];
for (const p of context.pages()) await p.close().catch(() => {});

async function compose(bodyPng, outFile) {
  const meta = await sharp(bodyPng).metadata();
  const canvas = sharp({
    create: { width: 1280, height: 800, channels: 3, background: { r: 10, g: 10, b: 10 } },
  });
  const left = Math.round((1280 - meta.width) / 2);
  const top = Math.round((800 - meta.height) / 2);
  await canvas
    .composite([{ input: bodyPng, left, top }])
    .png()
    .toFile(outFile);
  console.log('wrote', outFile);
}

const page = await context.newPage();
await page.goto('https://breachprobe.kynth.studio', { waitUntil: 'domcontentloaded' });
await page.bringToFront();
await page.waitForTimeout(500);

const cdp = await context.newCDPSession(page);
await cdp.send('Target.createTarget', {
  url: `chrome-extension://${extId}/src/popup.html`,
  background: true,
});
let popup = null;
for (let i = 0; i < 20 && !popup; i++) {
  await new Promise((r) => setTimeout(r, 200));
  popup = context.pages().find((p) => p.url().includes('popup.html'));
}
await popup.waitForSelector('#origin', { state: 'attached', timeout: 5000 });
await popup.waitForTimeout(200);

const startPng = await popup.locator('body').screenshot();
await compose(startPng, path.join(OUT, 'screenshot-1-start.png'));

await popup.locator('#owner').click({ force: true });
await popup.locator('#scan').click({ force: true });
await popup.waitForTimeout(900);
const runningPng = await popup.locator('body').screenshot();
await compose(runningPng, path.join(OUT, 'screenshot-2-running.png'));

await popup.waitForSelector('#pane-verdict:not([hidden])', { timeout: 42000 });
await popup.waitForTimeout(300);
const verdictPng = await popup.locator('body').screenshot();
await compose(verdictPng, path.join(OUT, 'screenshot-3-verdict.png'));

await context.close();
console.log('done');
