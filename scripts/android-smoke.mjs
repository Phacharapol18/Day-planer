// End-to-end smoke test on a real Android emulator (run in CI after installing the debug APK).
// Drives the app's WebView with Playwright and verifies native integrations with adb.
import { _android as android } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PKG = 'com.phacharapol.dayplanner';
const OUT = process.env.SMOKE_OUT || 'android-smoke';
mkdirSync(OUT, { recursive: true });

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const sh = (cmd) => adb('shell', cmd);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let failed = 0;

async function step(name, fn, { optional = false } = {}) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`PASS  ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    const msg = String(e?.message || e).split('\n')[0];
    if (optional) results.push(`SKIP  ${name}: ${msg}`);
    else {
      failed++;
      results.push(`FAIL  ${name}: ${msg}`);
    }
  }
  console.log(results[results.length - 1]);
}

async function waitFor(fn, what, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch (e) {
      last = e;
    }
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${what}${last ? `: ${last.message}` : ''}`);
}

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Device time drives "now"; build a block that is running right now.
const deviceNow = new Date(Number(sh('date +%s').trim()) * 1000);
const nowMin = deviceNow.getHours() * 60 + deviceNow.getMinutes();
const startMin = Math.max(0, Math.min(nowMin - 10, 1440 - 61));

sh(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
sh(`pm grant ${PKG} android.permission.READ_CALENDAR`);
sh('logcat -c');
sh(`am start -W -n ${PKG}/.MainActivity`);

const [device] = await android.devices();
if (!device) throw new Error('no adb device');
const webview = await device.webView({ pkg: PKG, timeout: 60000 });
const page = await webview.page();
page.setDefaultTimeout(15000);

await step('app boots to the timeline', async () => {
  await page.getByRole('heading', { level: 1 }).waitFor();
  const h = await page.getByRole('heading', { level: 1 }).textContent();
  if (!/Today/.test(h)) throw new Error(`heading was "${h}"`);
  writeFileSync(`${OUT}/01-launch.png`, await device.screenshot());
});

await step('seeded plan renders and syncs to native', async () => {
  const data = {
    version: 1,
    settings: { notify: true, nowCard: true, leadMinutes: 5 },
    tasks: [
      { id: 'smoke-now', title: 'Smoke focus block', notes: '', duration: 60, priority: 0, category: 'work', date: key(deviceNow), start: startMin, due: null, repeat: 'none', done: false, doneOn: [], skipOn: [], createdAt: 1 },
      { id: 'smoke-next', title: 'Smoke next block', notes: '', duration: 30, priority: 0, category: 'health', date: key(deviceNow), start: Math.min(startMin + 90, 1410), due: null, repeat: 'none', done: false, doneOn: [], skipOn: [], createdAt: 2 },
    ],
  };
  await page.evaluate((d) => {
    localStorage.setItem('dayplanner:v1', JSON.stringify(d));
    // Debug builds honour a dev Pro unlock so Pro-only native features can be exercised.
    localStorage.setItem('dayplanner:pro', JSON.stringify({ active: true, source: 'dev', plan: 'yearly', willCancel: false, inTrial: false, expiresAt: null, checkedAt: Date.now() }));
  }, data);
  await page.reload();
  await page.locator('[data-testid="block"]', { hasText: 'Smoke focus block' }).waitFor();
});

await step('ongoing Now card appears in the notification shade', async () => {
  await waitFor(() => sh('dumpsys notification --noredact').includes('Smoke focus block'), 'Now notification');
  sh('cmd statusbar expand-notifications');
  await sleep(1200);
  writeFileSync(`${OUT}/02-now-card.png`, await device.screenshot());
});

await step('tapping Done on the Now card completes the block in the app', async () => {
  // The Now card's live countdown keeps the UI from ever being "idle", so `uiautomator dump`
  // can't snapshot it; Playwright's Android driver finds and taps the button directly.
  await device.tap({ text: 'Done' }, { timeout: 15000 });
  await sleep(800);
  sh('cmd statusbar collapse');
  await waitFor(async () => {
    const label = await page.locator('[data-testid="block"]', { hasText: 'Smoke focus block' }).getAttribute('aria-label');
    return /done/.test(label || '');
  }, 'block marked done in the app');
  await waitFor(() => !sh('dumpsys notification --noredact').includes('Smoke focus block'), 'Now card cleared');
});

await step('share text from another app lands in the inbox', async () => {
  sh(`am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "Buy oat milk 15m" -n ${PKG}/.MainActivity`);
  await page.locator('[data-testid="inbox-item"]', { hasText: 'Buy oat milk' }).first().waitFor({ state: 'attached' });
});

await step('dayplanner://quickadd deep link opens quick add; Back closes it (3 rounds)', async () => {
  // Count Capacitor's DOM 'backbutton' events so a failure says whether Back reached the web layer.
  await page.evaluate(() => {
    window.__bb = 0;
    document.addEventListener('backbutton', () => window.__bb++);
  });
  for (let round = 1; round <= 3; round++) {
    sh('am start -a android.intent.action.VIEW -d dayplanner://quickadd');
    await page.getByTestId('quickadd-input').waitFor();
    if (round === 1) writeFileSync(`${OUT}/03-quickadd.png`, await device.screenshot());
    await sleep(400);
    // First Back may only hide the keyboard (as in any Android app); press again if still open.
    sh('input keyevent 4');
    await sleep(700);
    if ((await page.getByTestId('quickadd-input').count()) > 0) {
      sh('input keyevent 4');
      await sleep(700);
    }
    const bb = await page.evaluate(() => window.__bb);
    const ime = sh('dumpsys input_method | grep -m1 mInputShown || true').trim();
    await waitFor(async () => (await page.getByTestId('quickadd-input').count()) === 0, `round ${round}: quick add closed by back (backbutton events=${bb}, ${ime})`, 5000);
  }
});

await step('widgets and Quick Settings tile are registered', async () => {
  const widgets = sh('dumpsys appwidget');
  if (!widgets.includes(`${PKG}/.NowWidget`) && !widgets.includes(`${PKG}/${PKG}.NowWidget`)) throw new Error('NowWidget provider missing');
  if (!widgets.includes('AgendaWidget')) throw new Error('AgendaWidget provider missing');
  const svc = sh(`dumpsys package ${PKG}`);
  if (!svc.includes('QuickAddTileService')) throw new Error('tile service missing');
});

await step('an exact or fallback alarm is armed for the next boundary', async () => {
  const alarms = sh('dumpsys alarm');
  if (!alarms.includes(PKG)) throw new Error('no alarm registered for the app');
});

await step(
  'phone calendar events appear on the timeline',
  async () => {
    // Create a local calendar + an event 2 hours from now through the provider (sync-adapter URI).
    const calUri = 'content://com.android.calendar/calendars?caller_is_syncadapter=true&account_name=smoke&account_type=LOCAL';
    sh(`content insert --uri "${calUri}" --bind account_name:s:smoke --bind account_type:s:LOCAL --bind name:s:Smoke --bind calendar_displayName:s:Smoke --bind calendar_color:i:-14575885 --bind calendar_access_level:i:700 --bind ownerAccount:s:smoke --bind visible:i:1 --bind sync_events:i:1`);
    const cals = sh('content query --uri content://com.android.calendar/calendars --projection _id:calendar_displayName');
    const m = /_id=(\d+), calendar_displayName=Smoke/.exec(cals);
    if (!m) throw new Error('could not create a test calendar');
    const calId = m[1];
    const begin = Date.now() + 2 * 3600_000;
    sh(`content insert --uri content://com.android.calendar/events --bind calendar_id:i:${calId} --bind title:s:SmokeCalEvent --bind dtstart:l:${begin} --bind dtend:l:${begin + 1800_000} --bind eventTimezone:s:UTC`);
    await page.evaluate((id) => {
      const d = JSON.parse(localStorage.getItem('dayplanner:v1'));
      d.settings.calendarIds = [id];
      localStorage.setItem('dayplanner:v1', JSON.stringify(d));
    }, calId);
    await page.reload();
    await page.locator('[data-testid="event"]', { hasText: 'SmokeCalEvent' }).waitFor({ state: 'attached', timeout: 20000 });
  },
);

await step('no crashes in logcat', async () => {
  const log = adb('logcat', '-d', '-b', 'crash');
  if (log.includes(PKG)) {
    writeFileSync(`${OUT}/crash.txt`, log);
    throw new Error('crash buffer mentions the app');
  }
});

writeFileSync(`${OUT}/04-final.png`, await device.screenshot());
writeFileSync(`${OUT}/results.txt`, results.join('\n') + '\n');
await device.close();
console.log(`\n${results.length - failed}/${results.length} steps ok`);
process.exit(failed ? 1 : 0);
