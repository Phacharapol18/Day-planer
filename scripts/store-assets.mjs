// Generates Google Play assets from the real app: 6 captioned phone screenshots (1080×2160) and the
// 1024×500 feature graphic. Run against `npm run preview` (http://localhost:4173).
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/store-assets.mjs
import { chromium, devices } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const OUT = new URL('../docs/store/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const NOW = new Date(2026, 9, 8, 10, 40);
const T = '2026-10-08';

let n = 0;
const task = (o) => ({ id: `s${++n}`, notes: '', duration: 60, priority: 0, category: 'work', date: null, start: null, due: null, repeat: 'none', done: false, doneOn: [], skipOn: [], steps: [], stepsDone: {}, createdAt: n, ...o });
const routineSteps = [{ id: 'a', text: 'Glass of water' }, { id: 'b', text: 'Stretch 10 min' }, { id: 'c', text: 'Pick today’s one thing' }];
const deep = task({ title: 'Deep work — Q4 roadmap', start: 9 * 60 + 30, date: T, duration: 120, priority: 3, notes: 'Draft the three bets. Share with Priya by EOD.', steps: [{ id: 'd1', text: 'Outline the three bets' }, { id: 'd2', text: 'Size each one' }, { id: 'd3', text: 'Write the summary' }], stepsDone: { [T]: ['d1'] } });
const tasks = [
  task({ title: 'Morning routine', category: 'health', date: T, start: 7 * 60, duration: 45, repeat: 'daily', steps: routineSteps, doneOn: [T] }),
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
// A believable week behind it for Insights.
const plan = { 5: [['work', 180, 1], ['meeting', 60, 1], ['health', 45, 1]], 6: [['work', 150, 1], ['meeting', 90, 1], ['social', 60, 1]], 7: [['work', 240, 1], ['personal', 60, 0], ['health', 60, 1]] };
for (const [d, items] of Object.entries(plan)) {
  let t = 8 * 60;
  for (const [cat, dur, done] of items) {
    tasks.push(task({ title: cat, category: cat, date: `2026-10-0${d}`, start: t, duration: dur, done: !!done }));
    t += dur + 15;
  }
}
const journal = { '2026-10-05': { planned: 1, mood: 4 }, '2026-10-06': { planned: 1, shutdown: 1, mood: 5, highlight: 's1' }, '2026-10-07': { shutdown: 1, mood: 3 }, [T]: { planned: 1, highlight: deep.id } };

async function phone(scheme = 'light') {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], colorScheme: scheme, viewport: { width: 412, height: 824 }, deviceScaleFactor: 2.625 });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(NOW);
  await p.addInitScript(([t, j]) => {
    localStorage.setItem('dayplanner:v1', JSON.stringify({ version: 1, tasks: t, settings: { notify: true }, journal: j }));
    localStorage.setItem('dayplanner:pro', JSON.stringify({ active: true, source: 'dev', plan: 'yearly', checkedAt: Date.now() }));
  }, [tasks, journal]);
  await p.goto(BASE);
  await p.waitForTimeout(600);
  return { ctx, p };
}

const shots = [];
async function capture(name, scheme, act) {
  const { ctx, p } = await phone(scheme);
  await act(p);
  await p.waitForTimeout(500);
  const buf = await p.screenshot();
  shots.push({ name, scheme, data: buf.toString('base64') });
  await ctx.close();
}

await capture('timeline', 'light', async () => {});
await capture('quickadd', 'light', async (p) => {
  await p.getByRole('button', { name: 'Add', exact: true }).last().click();
  await p.getByTestId('quickadd-input').fill('Gym tomorrow 6pm 45m #health');
});
await capture('focus', 'light', async (p) => {
  await p.getByRole('button', { name: 'Focus' }).last().click();
});
await capture('insights', 'light', async (p) => {
  await p.getByTestId('streak').click();
});
await capture('inbox', 'light', async (p) => {
  await p.getByRole('button', { name: /Inbox/ }).last().click();
});
await capture('dark', 'dark', async () => {});

const captions = {
  timeline: ['Your day, as a timeline.', 'See now, next, and the free time you really have.'],
  quickadd: ['Type it like you’d say it.', '“Gym tomorrow 6pm 45m” — done.'],
  focus: ['One thing at a time.', 'A live countdown, steps, and what’s next.'],
  insights: ['See where your time goes.', 'Weekly insights, streaks and highlights.'],
  inbox: ['Capture now, plan later.', 'Drag tasks in — or let Auto-plan fill the gaps.'],
  dark: ['Beautiful, day or night.', 'Plus widgets and a live Now card on Android.'],
};

const fontCss = (fam, pkg) => {
  const file = readFileSync(new URL(`../node_modules/@fontsource-variable/${pkg}/files/${pkg}-latin-wght-normal.woff2`, import.meta.url));
  return `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${file.toString('base64')}) format('woff2');font-weight:100 900}`;
};
const fonts = fontCss('Inter', 'inter') + fontCss('Fraunces', 'fraunces');

const page = await browser.newPage({ viewport: { width: 1080, height: 2160 } });
for (const s of shots) {
  const [h, sub] = captions[s.name];
  const dark = s.scheme === 'dark';
  await page.setContent(`<html><head><style>${fonts}
    body{margin:0;width:1080px;height:2160px;overflow:hidden;font-family:Inter;
      background:${dark ? 'radial-gradient(120% 80% at 50% 0%,#2a1d16,#131210 60%)' : 'radial-gradient(120% 80% at 50% 0%,#fbe3d6,#f6f3ee 60%)'};
      color:${dark ? '#eeeae3' : '#1f1d1a'};display:flex;flex-direction:column;align-items:center}
    h1{font:600 84px/1.05 Fraunces;letter-spacing:-2px;margin:120px 80px 18px;text-align:center}
    p{font:500 38px/1.35 Inter;margin:0 100px;text-align:center;color:${dark ? '#b8b1a6' : '#5f5a52'}}
    .phone{margin-top:80px;width:820px;height:1640px;border-radius:72px;overflow:hidden;
      box-shadow:0 60px 120px rgba(0,0,0,${dark ? 0.6 : 0.22}),0 0 0 14px ${dark ? '#2b2925' : '#1f1d1a'}}
    .phone img{width:100%;display:block}
  </style></head><body><h1>${h}</h1><p>${sub}</p><div class="phone"><img src="data:image/png;base64,${s.data}"></div></body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}${shots.indexOf(s) + 1}-${s.name}.png` });
}

// Feature graphic 1024×500
const icon = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(`<html><head><style>${fonts}
  body{margin:0;width:1024px;height:500px;overflow:hidden;font-family:Inter;background:#1f1d1a;color:#f6f3ee;display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;
    background:radial-gradient(90% 120% at 100% 0%,rgba(240,112,63,.28),transparent 60%),#1f1d1a}
  .mark{width:168px;height:168px;flex:none;filter:drop-shadow(0 20px 40px rgba(0,0,0,.5))}
  h1{font:600 76px/1 Fraunces;letter-spacing:-2px;margin:0 0 16px}
  p{font:500 30px/1.35 Inter;margin:0;color:#c9c3b9;max-width:560px}
  b{color:#f0703f;font-weight:600}
</style></head><body><div class="mark">${icon.replace('<svg ', '<svg width="168" height="168" ')}</div>
<div><h1>Day Planner</h1><p>Your day as a timeline. <b>Plan it</b>, protect your free time, and actually get the important thing done.</p></div></body></html>`);
await page.screenshot({ path: `${OUT}feature-graphic.png` });
await browser.close();
console.log('store assets written to docs/store/');
