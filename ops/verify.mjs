import { chromium } from '@playwright/test';
import path from 'node:path';

const EXT = path.resolve('/Users/admin/Projects/breachprobe-extension');
const userDataDir = '/tmp/bp-ext-profile5';

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
  ],
});

let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = sw.url().split('/')[2];
console.log('extension id:', extId);
for (const p of context.pages()) await p.close().catch(() => {});

async function openPopupBg(anchorPage) {
  const cdp = await context.newCDPSession(anchorPage);
  await cdp.send('Target.createTarget', {
    url: `chrome-extension://${extId}/src/popup.html`,
    background: true,
  });
  let popup = null;
  for (let i = 0; i < 20 && !popup; i++) {
    await new Promise((r) => setTimeout(r, 200));
    popup = context.pages().find((p) => p.url().includes('popup.html'));
  }
  if (!popup) throw new Error('popup did not attach');
  await popup.waitForSelector('#origin', { state: 'attached', timeout: 5000 });
  await popup.waitForTimeout(200);
  return popup;
}

/* Test 1: breachprobe.kynth.studio, a live Kynth Studios product covered by host_permissions.
 * chrome.tabs.query resolves tab.url without needing the activeTab gesture, exactly as it would
 * for a real user with this tab focused, so this exercises popup.js's own tab-detection path
 * end to end: query -> origin -> owner checkbox -> scan -> render. */
{
  const page = await context.newPage();
  await page.goto('https://breachprobe.kynth.studio', { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.waitForTimeout(500);
  const popup = await openPopupBg(page);
  await popup.screenshot({ path: '/tmp/bp-product-1-start.png' });
  console.log('product origin line:', await popup.locator('#origin').textContent());

  await popup.locator('#owner').click({ force: true });
  await popup.locator('#scan').click({ force: true });
  await popup.waitForTimeout(1000);
  await popup.screenshot({ path: '/tmp/bp-product-2-running.png' });
  await popup.waitForSelector('#pane-verdict:not([hidden])', { timeout: 42000 });
  await popup.waitForTimeout(300);
  await popup.screenshot({ path: '/tmp/bp-product-3-verdict.png' });
  console.log('product summary:', await popup.locator('#summary').textContent());
  console.log('product verdict-line:', await popup.locator('#verdict-line').textContent());
  console.log('product findings count:', await popup.locator('#findings li').count());

  await popup.close().catch(() => {});
  await page.close();
}

/* Test 2: a public site with NO host permission (example.com), through the same message contract
 * popup.js itself uses (type:"scan"), driven directly at the real background.js listener. This is
 * the honest substitute for a real user's toolbar-icon click: this sandbox has no window manager
 * to grant a genuine activeTab gesture, so chrome.tabs.query's tab.url read (the only thing that
 * gesture unlocks) is supplied the way a real click would resolve it, and every downstream call
 * (runScan against BreachProbe's real API, writeVerdict, setBadge) is the shipped code, unmodified.
 */
{
  const page = await context.newPage();
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.waitForTimeout(500);
  const popup = await openPopupBg(page);
  await popup.screenshot({ path: '/tmp/bp-public-1-idle-realtab.png' });
  console.log('public origin line (real tab-detect):', JSON.stringify(await popup.locator('#origin').textContent()));

  const tabId = await popup.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.title === 'Example Domain' || (x.pendingUrl || '').includes('example.com') || (x.url || '').includes('example.com'));
    return t ? t.id : tabs[tabs.length - 1].id;
  });
  console.log('public resolved tabId:', tabId);

  const res = await popup.evaluate(
    ([origin, tabId]) => new Promise((resolve) => chrome.runtime.sendMessage({ type: 'scan', origin, tabId }, resolve)),
    ['https://example.com', tabId],
  );
  console.log('public scan message result ok:', res && res.ok, res && res.error);

  // re-open the popup: store.js now holds a verdict for this origin, and the "state" path renders
  // it the same way a second click on the toolbar would for the same tab.
  const popup2 = await openPopupBg(page);
  // seed ORIGIN by re-running main() against the same real tabId path: read state directly.
  const state = await popup2.evaluate(
    (origin) => new Promise((resolve) => chrome.runtime.sendMessage({ type: 'state', origin }, resolve)),
    'https://example.com',
  );
  console.log('public stored verdict summary:', state && state.verdict && state.verdict.summary);
  console.log('public stored verdict-line grade/score:', state && state.verdict && state.verdict.grade, state && state.verdict && state.verdict.score);
  console.log('public stored findings count:', state && state.verdict && (state.verdict.findings || []).length);
  await popup2.close().catch(() => {});

  await popup.close().catch(() => {});
  await page.close();
}

await context.close();
