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
    await ensurePage();
    await fn();
    results.push(`PASS  ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    const msg = String(e?.message || e).split('\n')[0];
    if (optional) results.push(`SKIP  ${name}: ${msg}`);
    else {
      failed++;
      results.push(`FAIL  ${name}: ${msg}`);
    }
    console.log(results[results.length - 1]);
    diagnose(name);
    return;
  }
  console.log(results[results.length - 1]);
}

const attempt = (f) => {
  try {
    return f();
  } catch (e) {
    return `(${String(e?.message || e).split('\n')[0]})`;
  }
};

/** Device state at a failure, printed to the CI log (artifacts can't always be fetched). */
function diagnose(name) {
  const focus = attempt(() => (sh('dumpsys window').match(/mCurrentFocus=Window\{\S+ \S+ ([^}]+)\}/) || [])[1]);
  const top = attempt(() => (sh('dumpsys activity activities').match(/topResumedActivity=\S+ \S+ (\S+)/) || [])[1]);
  const pid = attempt(() => sh(`pidof ${PKG} || true`).trim());
  const ime = attempt(() => /mInputShown=true/.test(sh('dumpsys input_method')));
  console.log(`  state: focus=${focus} top=${top} pid=${pid} ime=${ime}`);
  const log = attempt(() =>
    adb('logcat', '-d', '-v', 'time')
      .split('\n')
      .filter((l) => /ANR in|AndroidRuntime|FATAL|Renderer|render process|RenderProcessGone|lowmemorykiller|Killing \d+:com\.phacharapol|ActivityTaskManager.*dayplanner|Process com\.phacharapol.* died|WebViewFactory|chromium.*(ERROR|FATAL)|Capacitor.*(Loading app|Error)/.test(l))
      .slice(-30)
      .join('\n    '),
  );
  console.log(`  logcat:\n    ${log || '(no matching lines)'}`);
  const png = attempt(() => execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
  if (Buffer.isBuffer(png)) {
    const file = `fail-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`;
    writeFileSync(`${OUT}/${file}`, png);
    console.log(`::group::png ${file}\nPNG-BEGIN ${file}\n${png.toString('base64')}\nPNG-END\n::endgroup::`);
  }
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
// The emulator action presses MENU right after boot; a launcher that is still starting can ANR on it,
// and its "isn't responding" dialog later takes window focus and Back presses. Don't let system error
// dialogs cover the app (as CTS does). The app's own ANRs still fail the run via logcat (last step).
sh('settings put global hide_error_dialogs 1');
sh('logcat -c');
sh(`am start -W -n ${PKG}/.MainActivity`);

const [device] = await android.devices();
if (!device) throw new Error('no adb device');

const focus = () => (sh('dumpsys window').match(/mCurrentFocus=Window\{\S+ \S+ ([^}]+)\}/) || [])[1] || '?';
const anrDialogs = () => sh('dumpsys window windows').match(/Application Not Responding: [\w.]+/g) || [];
/** Steps drive the app through its window: make sure it has focus, clearing other apps' ANR dialogs. */
async function ensureAppFocused(why) {
  for (const w of new Set(anrDialogs())) {
    if (w.endsWith(PKG)) throw new Error(`the app is not responding (${w})`);
    console.log(`  ${why}: dismissing a dialog left by another app: "${w}"`);
    await device.tap({ text: 'Wait' }, { timeout: 15000 }).catch((e) => console.log(`  could not tap Wait: ${String(e.message).split('\n')[0]}`));
  }
  await waitFor(async () => focus().includes(`${PKG}/`), 'app window focused', 15000).catch((e) => {
    throw new Error(`${e.message} (focus=${focus()})`);
  });
}
let page;
let pagePid = '';
/** (Re)attach to the app's WebView. A closed page means the WebView went away: say why we reconnect. */
async function ensurePage() {
  if (page && !page.isClosed()) return;
  const pid = sh(`pidof ${PKG} || true`).trim();
  if (page) console.log(`  WebView page was closed; reconnecting (app pid ${pagePid} -> ${pid || 'none'})`);
  if (!pid) sh(`am start -W -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG, timeout: 60000 });
  page = await webview.page();
  page.setDefaultTimeout(15000);
  pagePid = sh(`pidof ${PKG} || true`).trim();
}

await step('app boots to the timeline', async () => {
  await ensureAppFocused('startup');
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
  // SystemUI renders the card asynchronously after the shade opens: wait for its own "visible" event
  // (system event log) before capturing, instead of guessing a delay.
  const shown = () => adb('logcat', '-d', '-b', 'events').split('\n').filter((l) => /notification_visibility.*\|com\.phacharapol\.dayplanner\|1\|[^,]*,1,/.test(l)).length;
  const before = shown();
  sh('cmd statusbar expand-notifications');
  await waitFor(() => shown() > before, 'Now card rendered in the shade', 15000);
  await sleep(500);
  const png = await device.screenshot();
  writeFileSync(`${OUT}/02-now-card.png`, png);
  // Inline in the log: how the shade lays out the Now card (expanded, actions visible) is part of the check.
  console.log(`::group::png 02-now-card.png\nPNG-BEGIN 02-now-card.png\n${png.toString('base64')}\nPNG-END\n::endgroup::`);
});

await step('tapping Done on the Now card completes the block in the app', async () => {
  // The Now card's live countdown keeps the UI from ever being "idle", so `uiautomator dump`
  // can't snapshot it; Playwright's Android driver finds and taps the button directly.
  // Each lookup waits out the driver's idle timeout (the countdown never idles): ~8s per tap on CI.
  await device.tap({ text: 'Done' }, { timeout: 30000 });
  await sleep(800);
  sh('cmd statusbar collapse');
  await waitFor(async () => {
    const label = await page.locator('[data-testid="block"]', { hasText: 'Smoke focus block' }).getAttribute('aria-label');
    return /done/.test(label || '');
  }, 'block marked done in the app');
  await waitFor(() => !sh('dumpsys notification --noredact').includes('Smoke focus block'), 'Now card cleared');
  // Every post/cancel of the app's notifications so far (system event log): shows any churn of the Now card.
  const events = adb('logcat', '-d', '-b', 'events', '-v', 'time')
    .split('\n')
    .filter((l) => /notification_(enqueue|cancel|canceled|visibility|expansion|clicked|action_clicked)/.test(l) && l.includes(PKG));
  console.log(`  notification events (${events.length}):\n    ${events.slice(-40).join('\n    ')}`);
  // Updates are fine; a cancel before the user acted means the card flickered off and back on.
  const clicked = events.findIndex((l) => l.includes('notification_action_clicked'));
  if (clicked < 0) throw new Error('no notification_action_clicked event for the Done tap');
  if (events.slice(0, clicked).some((l) => l.includes('notification_canceled'))) throw new Error('Now card was cancelled before Done was tapped');
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
  const imeShown = () => /mInputShown=true/.test(sh('dumpsys input_method'));
  const open = async () => (await page.getByTestId('quickadd-input').count()) > 0;
  // Back goes to the top-most window: make sure that is the app, not a shade left open by an earlier step.
  sh('cmd statusbar collapse');
  await ensureAppFocused('before Back');
  for (let round = 1; round <= 3; round++) {
    // A trace of where each Back press went, printed every round: on a failure it is the evidence.
    const t0 = Date.now();
    const trace = [];
    const mark = async (what) => trace.push(`+${Date.now() - t0}ms ${what} [open=${await open()} ime=${imeShown()} bb=${await page.evaluate(() => window.__bb)} focus=${focus()}]`);
    sh('am start -a android.intent.action.VIEW -d dayplanner://quickadd');
    await page.getByTestId('quickadd-input').waitFor();
    await mark('quick add visible');
    if (round === 1) writeFileSync(`${OUT}/03-quickadd.png`, await device.screenshot());
    // The keyboard may still be on its way up; let it settle so the first Back is deterministic.
    await waitFor(async () => imeShown(), 'keyboard', 2500).catch(() => undefined);
    await mark('settled');
    let closed = false;
    for (let press = 1; press <= 3 && !closed; press++) {
      sh('input keyevent 4');
      await waitFor(async () => !(await open()) || !imeShown(), 'back handled', 1500).catch(() => undefined);
      await sleep(300);
      closed = !(await open());
      await mark(`back #${press}`);
    }
    console.log(`  round ${round}: ${trace.join(' | ')}`);
    if (!closed) {
      writeFileSync(`${OUT}/03-back-fail-${round}.png`, await device.screenshot());
      const log = adb('logcat', '-d', '-v', 'time')
        .split('\n')
        .filter((l) => /backButton|backbutton|ImeTracker|InputMethodManager|OnBackPressed|BackNavigation|Capacitor\/AppPlugin|KEYCODE_BACK/.test(l))
        .slice(-40);
      console.log(`  logcat:\n    ${log.join('\n    ')}`);
      sh(`am start -n ${PKG}/.MainActivity`); // a stray Back may have minimized the app; later steps need it in front
      throw new Error(`round ${round}: quick add still open after 3 Back presses`);
    }
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

await step('no crashes, ANRs or Play services provider links for the app', async () => {
  const log = adb('logcat', '-d', '-b', 'crash');
  if (log.includes(PKG)) {
    writeFileSync(`${OUT}/crash.txt`, log);
    throw new Error('crash buffer mentions the app');
  }
  const main = adb('logcat', '-d', '-v', 'time').split('\n');
  const anrs = main.filter((l) => /ANR in /.test(l));
  // Device health: other apps' ANRs and very slow frames mean the emulator was starved, not that the app failed.
  const daveys = main.map((l) => Number((l.match(/Davey! duration=(\d+)ms/) || [])[1] || 0)).filter((ms) => ms >= 1000);
  console.log(`  device health: ${daveys.length} frames >=1s (max ${Math.max(0, ...daveys)}ms); ANRs: ${anrs.length ? anrs.join(' | ') : 'none'}`);
  const ours = anrs.filter((l) => l.includes(`ANR in ${PKG}`));
  if (ours.length) throw new Error(`the app stopped responding: ${ours[0]}`);
  // A live link to Play services' font provider gets the app killed whenever Play services restarts.
  const fonts = sh('dumpsys activity providers').split(/\n\s*\* ContentProviderRecord/).find((b) => b.includes('fonts.provider.FontsProvider')) || '';
  const links = fonts.split('\n').filter((l) => /->\s+\d+:/.test(l)).map((l) => l.trim());
  console.log(`  Play services font provider connections: ${links.length ? links.join(' | ') : 'none'}`);
  if (links.some((l) => l.includes(`:${PKG}/`))) throw new Error('the app holds a connection to Play services\' font provider');
  // And prove it end to end: restart Play services (as an update does) and the app must keep running.
  const gms = sh('pidof com.google.android.gms.persistent || true').trim();
  const app = sh(`pidof ${PKG} || true`).trim();
  if (!gms || !app || !sh('command -v su || true').trim()) {
    console.log(`  Play services restart check skipped (gms=${gms || 'none'} app=${app || 'none'})`);
    return;
  }
  sh(`su 0 kill -9 ${gms}`);
  await sleep(3000);
  const after = sh(`pidof ${PKG} || true`).trim();
  console.log(`  killed Play services (pid ${gms}); app pid ${app} -> ${after || 'none'}`);
  if (after !== app) throw new Error('the app was killed when Play services restarted');
});

writeFileSync(`${OUT}/04-final.png`, await device.screenshot());
writeFileSync(`${OUT}/results.txt`, results.join('\n') + '\n');
await device.close();
console.log(`\n${results.length - failed}/${results.length} steps ok`);
process.exit(failed ? 1 : 0);
