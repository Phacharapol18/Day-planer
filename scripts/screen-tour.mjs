// Captures every screen and state of the app (phone light/dark + desktop) for design review.
// Run against `npm run preview` (http://localhost:4173):
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/screen-tour.mjs [outDir]
// Writes <outDir>/<NN>-<screen>-<variant>.png and <outDir>/index.json ({file, screen, variant, note}).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const OUT = process.argv[2] || 'screen-tour';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const T = '2026-10-08';
const MORNING = new Date(2026, 9, 8, 10, 40);
const EVENING = new Date(2026, 9, 8, 18, 30);

let n = 0;
const task = (o) => ({ id: `s${++n}`, notes: '', duration: 60, priority: 0, category: 'work', date: null, start: null, due: null, repeat: 'none', done: false, doneOn: [], skipOn: [], steps: [], stepsDone: {}, createdAt: n, ...o });
const deep = task({ title: 'Deep work — Q4 roadmap', start: 9 * 60 + 30, date: T, duration: 120, priority: 3, notes: 'Draft the three bets. Share with Priya by EOD.', steps: [{ id: 'd1', text: 'Outline the three bets' }, { id: 'd2', text: 'Size each one' }, { id: 'd3', text: 'Write the summary' }], stepsDone: { [T]: ['d1'] } });
const day = [
  task({ title: 'Morning routine', category: 'health', date: T, start: 7 * 60, duration: 45, repeat: 'daily', steps: [{ id: 'a', text: 'Glass of water' }, { id: 'b', text: 'Stretch 10 min' }], doneOn: [T] }),
  deep,
  task({ title: 'Standup', category: 'meeting', date: T, start: 9 * 60, duration: 15, repeat: 'weekdays', doneOn: [T] }),
  task({ title: 'Lunch with Mia', category: 'social', date: T, start: 12 * 60 + 30, duration: 60 }),
  task({ title: 'Design review', category: 'meeting', date: T, start: 14 * 60, duration: 45 }),
  task({ title: 'Groceries & pharmacy', category: 'errand', date: T, start: 17 * 60 + 15, duration: 30 }),
  task({ title: 'Run 5k', category: 'health', date: T, start: 18 * 60, duration: 40 }),
  task({ title: 'Email Dan about the contract', duration: 15, priority: 2 }),
  task({ title: 'File taxes', duration: 120, priority: 3, due: '2026-10-13', category: 'errand' }),
  task({ title: 'Book dentist', duration: 15, category: 'health' }),
];
const history = [];
for (const [d, items] of Object.entries({ 5: [['work', 180], ['meeting', 60], ['health', 45]], 6: [['work', 150], ['meeting', 90], ['social', 60]], 7: [['work', 240], ['personal', 60], ['health', 60]] })) {
  let t = 8 * 60;
  for (const [cat, dur] of items) {
    history.push(task({ title: cat, category: cat, date: `2026-10-0${d}`, start: t, duration: dur, done: true }));
    t += dur + 15;
  }
}
const journal = { '2026-10-05': { planned: 1, mood: 4 }, '2026-10-06': { planned: 1, shutdown: 1, mood: 5 }, '2026-10-07': { shutdown: 1, mood: 3 }, [T]: { planned: 1, highlight: deep.id } };
const FULL = { tasks: [...day, ...history], journal };

const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 };

const index = [];
const errors = [];
async function shot(screen, variant, { device = PHONE, scheme = 'light', now = MORNING, data = FULL, pro = true, fresh = false, note = '' }, act = async () => {}) {
  const ctx = await browser.newContext({ ...device, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${screen}/${variant}: ${e}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${screen}/${variant}: ${m.text()}`));
  await p.clock.setFixedTime(now);
  await p.addInitScript(([d, isPro, isFresh]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    if (!isFresh) localStorage.setItem('dayplanner:v1', JSON.stringify({ version: 1, tasks: d.tasks, settings: { notify: true }, journal: d.journal ?? {} }));
    if (isPro) localStorage.setItem('dayplanner:pro', JSON.stringify({ active: true, source: 'dev', plan: 'yearly', willCancel: false, inTrial: false, expiresAt: null, checkedAt: Date.now() }));
  }, [data, pro, fresh]);
  await p.goto(BASE);
  await p.waitForTimeout(500);
  await act(p);
  await p.waitForTimeout(450);
  const file = `${String(index.length + 1).padStart(2, '0')}-${screen}-${variant}.png`;
  await p.screenshot({ path: `${OUT}/${file}` });
  index.push({ file, screen, variant, note });
  await ctx.close();
}

const both = async (screen, opts, act) => {
  await shot(screen, 'phone-light', { ...opts, scheme: 'light' }, act);
  await shot(screen, 'phone-dark', { ...opts, scheme: 'dark' }, act);
};
const addBtn = (p) => p.getByRole('button', { name: 'Add', exact: true }).last();
const blockOf = (p, title) => p.getByTestId('block').filter({ hasText: title }).first();

await both('timeline', { note: 'Today, Pro user, 10:40am, highlight set, two blocks done' });
await both('timeline-empty', { data: { tasks: [], journal: {} }, note: 'Existing user with nothing planned' });
await both('welcome', { fresh: true, pro: false, note: 'First run, step 1 of 3' });
await shot('welcome', 'phone-light-step2', { fresh: true, pro: false }, async (p) => p.getByTestId('welcome-next').click());
await shot('welcome', 'phone-light-step3', { fresh: true, pro: false }, async (p) => {
  await p.getByTestId('welcome-next').click();
  await p.getByTestId('welcome-next').click();
});
await both('quickadd', { note: 'Natural-language quick add with live parse preview' }, async (p) => {
  await addBtn(p).click();
  await p.getByTestId('quickadd-input').fill('Gym tomorrow 6pm 45m #health');
});
await shot('quickadd', 'phone-light-empty', {}, async (p) => addBtn(p).click());
await shot('quickadd', 'phone-light-braindump', { note: 'Several tasks in one input' }, async (p) => {
  await addBtn(p).click();
  await p.getByTestId('quickadd-input').fill('call mom tomorrow then gym 6pm also buy milk');
});
await both('editor', { note: 'Bottom-sheet editor for a block with steps' }, async (p) => blockOf(p, 'Deep work').click());
await both('focus', { note: 'Focus mode on the live block' }, async (p) => p.getByRole('button', { name: 'Focus' }).last().click());
await both('inbox', { note: 'Inbox drawer' }, async (p) => p.getByRole('button', { name: /Inbox/ }).last().click());
await both('insights', { note: 'Weekly insights, Pro' }, async (p) => p.getByTestId('streak').click());
await shot('insights', 'phone-light-free', { pro: false, note: 'Free user: headline stats, locked chart' }, async (p) => p.getByTestId('streak').click());
await both('plan-ritual', {
  data: { tasks: [task({ title: 'Old call', date: '2026-10-07', start: 16 * 60, duration: 15 }), task({ title: 'Write proposal', duration: 90, priority: 3 }), task({ title: 'Book flights', duration: 30 })], journal: {} },
  now: new Date(2026, 9, 8, 8, 30),
  note: 'Morning "Plan day" ritual, first step',
}, async (p) => p.getByTestId('ritual-cta').click());
await both('shutdown-ritual', {
  data: { tasks: [task({ title: 'Shipped it', date: T, start: 9 * 60, done: true }), task({ title: 'Unfinished review', date: T, start: 15 * 60, duration: 45 })], journal: { '2026-10-07': { planned: 1 } } },
  now: EVENING,
  note: 'Evening shutdown ritual, first step',
}, async (p) => p.getByTestId('ritual-cta').click());
await both('slip-banner', {
  data: { tasks: [task({ title: 'Write spec', date: T, start: 8 * 60, duration: 60, priority: 1 }), task({ title: 'Inbox zero', date: T, start: 9 * 60, duration: 30, priority: 3 }), task({ title: 'Team lunch', date: T, start: 12 * 60, duration: 60 })], journal: {} },
  note: 'Two blocks slipped: re-plan banner',
});
await both('settings', { note: 'Settings sheet' }, async (p) => p.getByRole('button', { name: 'Settings' }).click());
await both('paywall', { pro: false, data: { tasks: day, journal: {} }, note: 'Go Pro paywall (free user)' }, async (p) => p.getByTestId('go-pro').click());

const desk = async (screen, variant, opts, act) => shot(screen, variant, { ...opts, device: DESKTOP }, act);
await desk('timeline', 'desktop-light', { note: 'Desktop: inbox + timeline' });
await desk('timeline', 'desktop-dark', { scheme: 'dark' });
await desk('quickadd', 'desktop-light', {}, async (p) => {
  await p.keyboard.press('n');
  await p.getByTestId('quickadd-input').fill('Taxes by oct 15 2h !!!');
});
await desk('insights', 'desktop-light', {}, async (p) => p.getByTestId('streak').click());
await desk('help', 'desktop-light', { note: 'Keyboard shortcuts' }, async (p) => p.keyboard.press('?'));
await desk('settings', 'desktop-light', {}, async (p) => p.getByRole('button', { name: 'Settings' }).click());
await desk('paywall', 'desktop-light', { pro: false, data: { tasks: day, journal: {} } }, async (p) => p.getByTestId('go-pro').click());

writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 2));
await browser.close();
console.log(`${index.length} screens written to ${OUT}/`);
if (errors.length) {
  console.log(`page errors:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
