import { test, expect, type Page } from '@playwright/test';

const NOW = new Date(2026, 9, 8, 10, 0, 0); // Thu Oct 8 2026, 10:00 local
const TODAY = '2026-10-08';
const HOUR = 72; // default px per hour

async function boot(page: Page, seed?: { tasks?: unknown[]; legacy?: unknown; pro?: boolean }) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ([s]) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      if (s?.tasks) localStorage.setItem('dayplanner:v1', JSON.stringify({ version: 1, tasks: s.tasks, settings: {} }));
      if (s?.legacy) localStorage.setItem('saveArr', JSON.stringify(s.legacy));
      if (s?.pro) localStorage.setItem('dayplanner:pro', JSON.stringify({ active: true, source: 'dev', plan: 'yearly', willCancel: false, inTrial: false, expiresAt: null, checkedAt: Date.now() }));
    },
    [seed ?? null] as const,
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Today');
  return errors;
}

let n = 0;
const task = (o: Record<string, unknown>) => ({
  id: `t${++n}`,
  notes: '',
  duration: 60,
  priority: 0,
  category: 'work',
  date: null,
  start: null,
  due: null,
  repeat: 'none',
  done: false,
  doneOn: [],
  skipOn: [],
  createdAt: n,
  ...o,
});

/** Scroll the timeline so `minute` is visible and return its viewport Y. */
async function yFor(page: Page, minute: number) {
  const scroller = page.getByTestId('timeline-scroll');
  await scroller.evaluate((el, top) => (el.scrollTop = top), Math.max(0, (minute - 120) * (HOUR / 60)));
  const lane = await page.getByTestId('timeline-lane').boundingBox();
  return { y: lane!.y + (minute * HOUR) / 60, x: lane!.x + lane!.width / 2 };
}

async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 6, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

const block = (page: Page, title: string) => page.getByTestId('block').filter({ hasText: title });

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only interactions');

  test('first run: empty state, no console errors, PWA wired', async ({ page }) => {
    const errors = await boot(page);
    await expect(page.getByText('A blank page.')).toBeVisible();
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    });
    expect(sw).toBe(true);
    expect(errors).toEqual([]);
  });

  test('quick add understands plain language and persists across reloads', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Control+k');
    const input = page.getByTestId('quickadd-input');
    await input.fill('Gym 6pm 45m #health !!');
    await expect(page.locator('.qa-dest')).toHaveText(/Today · 6pm–6:45pm/);
    await expect(page.locator('.qa-chips')).toContainText('Health');
    await expect(page.locator('.qa-chips')).toContainText('Medium priority');
    await input.press('Enter');
    await expect(block(page, 'Gym')).toHaveAttribute('aria-label', /Gym, 6pm – 6:45pm/);
    await expect(block(page, 'Gym')).toHaveAttribute('data-cat', 'health');

    // No time → inbox, with a due date chip.
    await page.keyboard.press('n');
    await page.getByTestId('quickadd-input').fill('Pay rent fri');
    await expect(page.locator('.qa-dest')).toHaveText(/Inbox · due Tomorrow/);
    await page.getByTestId('quickadd-input').press('Enter');
    await expect(page.getByTestId('inbox-item').filter({ hasText: 'Pay rent' })).toContainText('Tmrw');

    await page.reload();
    await expect(block(page, 'Gym')).toBeVisible();
    await expect(page.getByTestId('inbox-item').filter({ hasText: 'Pay rent' })).toBeVisible();
  });

  test('inbox: add, schedule into next free slot, auto-plan around existing blocks', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Existing', date: TODAY, start: 600, duration: 60 })], pro: true });
    const input = page.getByTestId('inbox-input');
    await input.fill('Taxes 30m !!!');
    await input.press('Enter');
    await input.fill('Email Dan 15m');
    await input.press('Enter');
    await input.fill('Read 45m');
    await input.press('Enter');
    await expect(page.getByTestId('inbox-item')).toHaveCount(3);
    // Highest priority first.
    await expect(page.getByTestId('inbox-item').first()).toContainText('Taxes');

    await page.getByTestId('inbox-item').filter({ hasText: 'Taxes' }).getByRole('button', { name: /next free slot/ }).click();
    // 10:00–11:00 is taken, so the next slot is 11am.
    await expect(block(page, 'Taxes')).toHaveAttribute('aria-label', /11am – 11:30am/);

    await page.getByRole('button', { name: 'Auto-plan' }).click();
    await expect(page.getByTestId('toast').last()).toContainText('Planned 2 tasks today');
    await expect(block(page, 'Email Dan')).toHaveAttribute('aria-label', /11:30am – 11:45am/);
    await expect(block(page, 'Read')).toHaveAttribute('aria-label', /11:45am – 12:30pm/);
    await expect(page.getByTestId('inbox-item')).toHaveCount(0);

    // Undo from the toast puts them back.
    await page.getByTestId('toast').last().getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('inbox-item')).toHaveCount(2);
  });

  test('drag from inbox onto the timeline, move, resize, and drag back to inbox', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Write brief', duration: 60 })] });
    const item = page.getByTestId('inbox-item').filter({ hasText: 'Write brief' });
    const ib = (await item.boundingBox())!;
    const target = await yFor(page, 14 * 60 + 10);
    await mouseDrag(page, { x: ib.x + 60, y: ib.y + ib.height / 2 }, target);
    await expect(block(page, 'Write brief')).toHaveAttribute('aria-label', /2pm – 3pm/);
    await expect(page.getByTestId('inbox-item')).toHaveCount(0);

    // Move down by one hour.
    let bb = (await block(page, 'Write brief').boundingBox())!;
    await mouseDrag(page, { x: bb.x + bb.width / 2, y: bb.y + 20 }, { x: bb.x + bb.width / 2, y: bb.y + 20 + HOUR });
    await expect(block(page, 'Write brief')).toHaveAttribute('aria-label', /3pm – 4pm/);

    // Resize from the bottom edge by +30 min.
    bb = (await block(page, 'Write brief').boundingBox())!;
    const handle = block(page, 'Write brief').locator('.block-resize');
    const hb = (await handle.boundingBox())!;
    await mouseDrag(page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 + HOUR / 2 });
    await expect(block(page, 'Write brief')).toHaveAttribute('aria-label', /3pm – 4:30pm/);

    // Drag back to the inbox.
    bb = (await block(page, 'Write brief').boundingBox())!;
    const inbox = (await page.getByRole('complementary', { name: 'Inbox' }).boundingBox())!;
    await mouseDrag(page, { x: bb.x + bb.width / 2, y: bb.y + 20 }, { x: inbox.x + inbox.width / 2, y: inbox.y + inbox.height / 2 });
    await expect(page.getByTestId('inbox-item').filter({ hasText: 'Write brief' })).toBeVisible();
    await expect(page.getByTestId('block')).toHaveCount(0);

    // Undo restores it to the timeline.
    await page.keyboard.press('Control+z');
    await expect(block(page, 'Write brief')).toHaveAttribute('aria-label', /3pm – 4:30pm/);
  });

  test('Esc cancels a drag without changing anything', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Stay', date: TODAY, start: 13 * 60 })] });
    await yFor(page, 13 * 60);
    const bb = (await block(page, 'Stay').boundingBox())!;
    await page.mouse.move(bb.x + 50, bb.y + 20);
    await page.mouse.down();
    await page.mouse.move(bb.x + 50, bb.y + 140, { steps: 8 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(block(page, 'Stay')).toHaveAttribute('aria-label', /1pm – 2pm/);
  });

  test('draw a block on the timeline, then edit and delete it with undo', async ({ page }) => {
    await boot(page);
    const a = await yFor(page, 15 * 60 + 2);
    const lane = (await page.getByTestId('timeline-lane').boundingBox())!;
    await mouseDrag(page, { x: lane.x + 40, y: a.y }, { x: lane.x + 40, y: a.y + (HOUR * 3) / 2 });
    const dialog = page.getByRole('dialog', { name: 'New block' });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('editor-time')).toHaveValue('15:00');
    await page.getByTestId('editor-title').fill('Design review');
    await dialog.getByRole('radio', { name: 'Meetings' }).click();
    await page.getByTestId('editor-save').click();
    await expect(block(page, 'Design review')).toHaveAttribute('aria-label', /3pm – 4:30pm/);
    await expect(block(page, 'Design review')).toHaveAttribute('data-cat', 'meeting');

    // Click opens the editor; rename and save.
    await block(page, 'Design review').click();
    await page.getByTestId('editor-title').fill('Design crit');
    await page.getByTestId('editor-title').press('Enter');
    await expect(block(page, 'Design crit')).toBeVisible();

    await block(page, 'Design crit').click();
    await page.getByTestId('editor-delete').click();
    await expect(page.getByTestId('block')).toHaveCount(0);
    await page.getByTestId('toast').filter({ hasText: 'Deleted' }).getByRole('button', { name: 'Undo' }).click();
    await expect(block(page, 'Design crit')).toBeVisible();
  });

  test('empty title is rejected, Esc closes the editor without saving', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: /Free/ }).first().click();
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('editor-title')).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('block')).toHaveCount(0);
  });

  test('keyboard control of blocks', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Focus time', date: TODAY, start: 11 * 60 })] });
    const b = block(page, 'Focus time');
    await b.focus();
    await page.keyboard.press('ArrowDown');
    await expect(b).toHaveAttribute('aria-label', /11:15am – 12:15pm/);
    await page.keyboard.press('Shift+ArrowDown');
    await expect(b).toHaveAttribute('aria-label', /11:15am – 12:30pm/);
    await page.keyboard.press(' ');
    await expect(b).toHaveAttribute('aria-label', /done/);
    await expect(page.locator('.summary-text')).toContainText('1/1');
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('block')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(block(page, 'Focus time')).toBeVisible();
  });

  test('day navigation, week strip and repeating blocks', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Standup', date: TODAY, start: 9 * 60 + 30, duration: 15, repeat: 'weekdays' })] });
    await expect(block(page, 'Standup')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tomorrow');
    await expect(block(page, 'Standup')).toBeVisible();
    await page.keyboard.press('ArrowRight'); // Saturday
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saturday');
    await expect(page.getByTestId('block')).toHaveCount(0);
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saturday');
    await page.getByRole('button', { name: /Monday October 12/ }).click();
    await expect(block(page, 'Standup')).toBeVisible();

    // Remove just this occurrence.
    await block(page, 'Standup').click();
    await page.getByRole('button', { name: 'This day only' }).click();
    await expect(page.getByTestId('block')).toHaveCount(0);
    await page.keyboard.press('t');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Today');
    await expect(block(page, 'Standup')).toBeVisible();
  });

  test('missed tasks from earlier days surface in the inbox', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Call landlord', date: '2026-10-06', start: 16 * 60, duration: 15 })] });
    const missed = page.getByRole('region', { name: 'Missed from earlier days' });
    await expect(missed).toContainText('Call landlord');
    await missed.getByRole('button', { name: /next free slot/ }).click();
    await expect(block(page, 'Call landlord')).toHaveAttribute('aria-label', /10am – 10:15am/);
    await expect(missed).toHaveCount(0);
  });

  test('imports notes from the old hour-row planner', async ({ page }) => {
    await boot(page, { legacy: [{ myContent: 'Team sync', hour: '09:00' }, { myContent: 'Gym', hour: '18:00' }] });
    await expect(page.getByTestId('toast').first()).toContainText('Imported 2 notes');
    await expect(block(page, 'Team sync')).toHaveAttribute('aria-label', /9am – 10am/);
    await expect(block(page, 'Gym')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('block')).toHaveCount(2);
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test('focus mode shows the live block and completes it', async ({ page }) => {
    await boot(page, {
      tasks: [task({ title: 'Deep work', date: TODAY, start: 9 * 60 + 30, duration: 60 }), task({ title: 'Lunch', date: TODAY, start: 12 * 60 })],
    });
    await expect(block(page, 'Deep work')).toHaveAttribute('aria-label', /happening now/);
    await page.keyboard.press('f');
    const focus = page.getByRole('dialog', { name: 'Focus mode' });
    await expect(focus.getByRole('heading')).toHaveText('Deep work');
    await expect(focus.getByRole('timer')).toHaveAttribute('aria-label', '30:00 remaining');
    await expect(focus).toContainText('Then Lunch at 12pm');
    await focus.getByRole('button', { name: 'Done' }).click();
    await expect(focus.getByRole('heading')).toHaveText('Lunch');
    await page.keyboard.press('Escape');
    await expect(block(page, 'Deep work')).toHaveAttribute('aria-label', /done/);
  });

  test('settings: theme, 24h clock, and backup round-trip', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Gym', date: TODAY, start: 18 * 60 })] });
    await page.getByRole('button', { name: 'Settings' }).click();
    const s = page.getByRole('dialog', { name: 'Settings' });
    await s.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await s.getByRole('radio', { name: '13:30' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), s.getByRole('button', { name: /Back up/ }).click()]);
    const backup = await (await dl.createReadStream()).toArray();
    const json = JSON.parse(Buffer.concat(backup).toString());
    expect(json.tasks[0].title).toBe('Gym');
    const [ics] = await Promise.all([page.waitForEvent('download'), s.getByRole('button', { name: /Export to calendar/ }).click()]);
    const icsText = Buffer.concat(await (await ics.createReadStream()).toArray()).toString();
    expect(icsText).toContain('SUMMARY:Gym');
    expect(icsText).toContain('DTSTART:20261008T180000');
    await page.keyboard.press('Escape');
    await expect(block(page, 'Gym')).toHaveAttribute('aria-label', /18:00 – 19:00/);

    // Theme survives reload without a flash (set before first paint).
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('two tabs stay in sync', async ({ page, context }) => {
    await boot(page);
    const other = await context.newPage();
    await other.clock.setFixedTime(NOW);
    await other.goto('/');
    await page.getByTestId('inbox-input').fill('Shared task');
    await page.getByTestId('inbox-input').press('Enter');
    await expect(other.getByTestId('inbox-item').filter({ hasText: 'Shared task' })).toBeVisible();
  });
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only');

  test('bottom bar, inbox drawer and quick add work on a phone', async ({ page }) => {
    const errors = await boot(page, { tasks: [task({ title: 'Book dentist', duration: 15 })] });
    const drawer = page.getByRole('complementary', { name: 'Inbox' });
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: /Inbox · 1/ }).click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: /next free slot/ }).click();
    await expect(page.getByTestId('toast').first()).toContainText('Scheduled “Book dentist” today at 10am');
    await drawer.getByRole('button', { name: 'Close inbox' }).click();
    await expect(drawer).toBeHidden();
    await expect(block(page, 'Book dentist')).toBeVisible();

    await page.getByRole('button', { name: 'Add', exact: true }).last().click();
    await page.getByTestId('quickadd-input').fill('Pick up kids 3:15pm 30m');
    await page.getByTestId('quickadd-input').press('Enter');
    await expect(block(page, 'Pick up kids')).toHaveAttribute('aria-label', /3:15pm – 3:45pm/);

    // Tap a block → bottom-sheet editor.
    await block(page, 'Pick up kids').click();
    await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    // No horizontal overflow at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('long-press drags a block on touch', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Walk', date: TODAY, start: 13 * 60 })] });
    await yFor(page, 13 * 60);
    const bb = (await block(page, 'Walk').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const pt = (y: number) => [{ x: bb.x + bb.width / 2, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(bb.y + 20) });
    await page.waitForTimeout(400);
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(bb.y + 20 + (HOUR * i) / 10) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(block(page, 'Walk')).toHaveAttribute('aria-label', /2pm – 3pm/);
  });
});

test.describe('phone calendar events', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only');

  test('calendar events show read-only, count as busy, and steer scheduling', async ({ page }) => {
    await page.addInitScript(() => {
      const at = (h: number, m = 0) => new Date(2026, 9, 8, h, m).getTime();
      window.__dpMockCalendar = () => [
        { id: 'standup', title: 'Team standup', begin: at(10, 0), end: at(10, 30), allDay: false, color: 0x1f7fb8, calendar: 'Work' },
        { id: 'lunch', title: 'Lunch w/ client', begin: at(12, 0), end: at(13, 0), allDay: false, color: 0xa23f8c, calendar: 'Work' },
        { id: 'trip', title: 'Company offsite', begin: Date.UTC(2026, 9, 8), end: Date.UTC(2026, 9, 9), allDay: true, calendar: 'Work' },
      ];
    });
    await boot(page, { tasks: [task({ title: 'Write spec', duration: 60, priority: 3 }), task({ title: 'Quick call', duration: 30 })], pro: true });
    const ev = page.getByTestId('event');
    await expect(ev).toHaveCount(2);
    await expect(ev.first()).toHaveAttribute('aria-label', /Team standup, 10am – 10:30am, from Work/);
    await expect(page.getByRole('list', { name: 'All-day events' })).toContainText('Company offsite');
    await expect(page.locator('.summary-text')).toContainText('2 events');

    // Events are not draggable: a drag on one does nothing, a click just informs.
    await ev.first().click();
    await expect(page.getByTestId('toast').last()).toContainText('Team standup');

    // Auto-plan fills around meetings: 10:30–11:30 for the 1h task, 11:30–12:00 for the 30m one.
    await page.getByRole('button', { name: 'Auto-plan' }).click();
    await expect(block(page, 'Write spec')).toHaveAttribute('aria-label', /10:30am – 11:30am/);
    await expect(block(page, 'Quick call')).toHaveAttribute('aria-label', /11:30am – 12pm/);
  });
});

test.describe('Pro', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only');

  test('free users hit a contextual paywall on Auto-plan; web points to the Android app', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Inbox task', duration: 30 })] });
    await expect(page.getByRole('button', { name: /Auto-plan/ })).toContainText('Pro');
    await page.getByRole('button', { name: /Auto-plan/ }).click();
    const pw = page.getByTestId('paywall');
    await expect(pw).toBeVisible();
    await expect(pw.getByRole('heading')).toHaveText('Let your day plan itself.');
    await expect(pw.locator('.pw-features li').first()).toContainText('Auto-plan');
    await expect(pw.getByRole('link', { name: 'Get it on Google Play' })).toHaveAttribute('href', /play\.google\.com.*com\.phacharapol\.dayplanner/);
    await page.keyboard.press('Escape');
    // Nothing got scheduled.
    await expect(page.getByTestId('block')).toHaveCount(0);
    await expect(page.getByTestId('inbox-item')).toHaveCount(1);
  });

  test('free plan allows 3 routines; the 4th is added once with an upgrade prompt', async ({ page }) => {
    const rep = (i: number) => task({ title: `Routine ${i}`, date: TODAY, start: 6 * 60 + i * 30, duration: 15, repeat: 'daily' });
    await boot(page, { tasks: [rep(1), rep(2), rep(3)] });
    await page.keyboard.press('Control+k');
    await page.getByTestId('quickadd-input').fill('Stretch 7pm 15m daily');
    await page.getByTestId('quickadd-input').press('Enter');
    await expect(page.getByTestId('toast').filter({ hasText: 'Free includes 3 routines' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(block(page, 'Stretch')).toHaveCount(0); // not repeating
    await page.keyboard.press('t');
    // Editor: choosing a repeat on a new block opens the paywall instead.
    await block(page, 'Stretch').click();
    await page.getByLabel('Repeat').selectOption('daily');
    await expect(page.getByTestId('paywall')).toBeVisible();
    await expect(page.getByTestId('paywall').getByRole('heading')).toHaveText('Build routines that run themselves.');
  });

  test('Pro users see no gates and an active status in Settings', async ({ page }) => {
    await boot(page, { pro: true });
    await expect(page.getByTestId('go-pro')).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Pro is active')).toBeVisible();
    await expect(page.getByText('Developer unlock')).toBeVisible();
  });

  test('Go Pro in the header opens the general paywall', async ({ page }) => {
    await boot(page);
    await page.getByTestId('go-pro').click();
    await expect(page.getByTestId('paywall').getByRole('heading')).toHaveText('Plan your day like you mean it.');
  });
});

test.describe('rituals', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only');

  test('morning plan: clear loose ends, pick tasks, set a highlight, start a streak', async ({ page }) => {
    await boot(page, {
      tasks: [
        task({ title: 'Old call', date: '2026-10-07', start: 16 * 60, duration: 15 }),
        task({ title: 'Write proposal', duration: 90, priority: 3 }),
        task({ title: 'Book flights', duration: 30 }),
      ],
      pro: true,
    });
    await page.getByTestId('ritual-cta').click();
    const r = page.getByTestId('ritual-plan');
    await expect(r.getByRole('heading')).toHaveText('Yesterday’s loose ends');
    await r.getByRole('button', { name: 'Keep' }).click(); // back to inbox
    await r.getByRole('button', { name: /Next/ }).click();
    await expect(r.getByRole('heading')).toHaveText('What matters today?');
    await r.getByText('Write proposal').click();
    await r.getByText('Book flights').click();
    await expect(r.locator('.rt-meter-text')).toContainText('2h picked');
    await r.getByRole('button', { name: /Fit them into my day/ }).click();
    await expect(r.getByRole('heading')).toHaveText('Your one thing');
    await r.getByRole('radio', { name: /Write proposal/ }).click();
    await page.getByTestId('ritual-finish').click();
    await expect(page.getByTestId('toast').last()).toContainText('Day planned');
    // Placed on the timeline after "now" (10:00), highlight marked everywhere.
    await expect(block(page, 'Write proposal')).toHaveAttribute('aria-label', /10am – 11:30am.*today’s highlight/);
    await expect(block(page, 'Book flights')).toHaveAttribute('aria-label', /11:30am – 12pm/);
    await expect(page.getByTestId('highlight')).toContainText('Write proposal');
    await expect(page.getByTestId('streak')).toHaveText(/1-day streak/);
    await expect(page.getByTestId('ritual-cta')).toHaveCount(0);
    await expect(page.getByTestId('inbox-item').filter({ hasText: 'Old call' })).toBeVisible();
  });

  test('evening shutdown: move leftovers to tomorrow, reflect, carry a note forward', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 8, 18, 30));
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(
      (tasks) => {
        if (sessionStorage.getItem('__seeded')) return;
        sessionStorage.setItem('__seeded', '1');
        localStorage.clear();
        localStorage.setItem('dayplanner:v1', JSON.stringify({ version: 1, tasks, settings: {}, journal: { '2026-10-07': { planned: 1 } } }));
      },
      [
        task({ title: 'Shipped it', date: TODAY, start: 9 * 60, done: true }),
        task({ title: 'Unfinished review', date: TODAY, start: 15 * 60, duration: 45 }),
      ],
    );
    await page.goto('/');
    await expect(page.getByTestId('ritual-cta')).toContainText('Shut down');
    await page.getByTestId('ritual-cta').click();
    const r = page.getByTestId('ritual-shutdown');
    await expect(r.getByRole('heading')).toHaveText('1 done today.');
    await r.getByRole('button', { name: 'Tomorrow' }).click();
    await r.getByRole('button', { name: /Next/ }).click();
    await r.getByRole('radio', { name: 'Good' }).click();
    await r.getByLabel('Tomorrow’s first thing (optional)').fill('Call the bank');
    await r.getByLabel('Add it to my inbox for tomorrow').check();
    await page.getByTestId('ritual-finish').click();
    await expect(page.getByTestId('toast').last()).toContainText('2-day streak');
    await expect(page.getByTestId('inbox-item').filter({ hasText: 'Call the bank' })).toContainText('Tmrw');
    await page.keyboard.press('ArrowRight');
    await expect(block(page, 'Unfinished review')).toHaveAttribute('aria-label', /3pm – 3:45pm/);
    expect(errors).toEqual([]);
  });

  test('steps: edit a checklist and tick it off in focus mode', async ({ page }) => {
    await boot(page, { tasks: [task({ title: 'Morning routine', date: TODAY, start: 9 * 60 + 45, duration: 45 })] });
    await block(page, 'Morning routine').click();
    await page.getByRole('button', { name: 'Add a step' }).click();
    await page.keyboard.type('Water');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Stretch');
    await page.getByTestId('editor-save').click();
    await page.keyboard.press('f');
    const focus = page.getByRole('dialog', { name: 'Focus mode' });
    await expect(focus.getByRole('list', { name: 'Steps' })).toContainText('Water');
    await focus.getByRole('button', { name: 'Water' }).click();
    await expect(focus.getByRole('button', { name: 'Water' })).toHaveAttribute('aria-pressed', 'true');
    await expect(focus.getByRole('button', { name: 'Stretch' })).toHaveClass(/is-next/);
  });
});

test.describe('insights', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only');

  const weekTasks = () => [
    task({ title: 'Deep work', date: '2026-10-05', start: 9 * 60, duration: 120, done: true }),
    task({ title: 'Gym', date: '2026-10-06', start: 18 * 60, duration: 60, category: 'health', done: true }),
    task({ title: 'Standup', date: '2026-10-05', start: 9 * 60 + 30, duration: 15, category: 'meeting', repeat: 'weekdays' }),
  ];

  test('Pro: weekly stats, stacked columns with tooltips, and a table view', async ({ page }) => {
    await boot(page, { tasks: weekTasks(), pro: true });
    await page.keyboard.press('w');
    const ins = page.getByTestId('insights');
    await expect(ins.getByText('This week')).toBeVisible();
    await expect(ins.locator('.ins-tile').first()).toContainText('4h 15m'); // 2h + 1h + 5×15m
    await expect(ins.locator('.ins-tile').nth(1)).toContainText('29%'); // 2 of 7 done
    await expect(ins.getByRole('list', { name: 'Categories' })).toContainText('Deep work');
    const mon = ins.getByRole('button', { name: /^Mon: 2h 15m planned, 1 of 2 done/ });
    await mon.hover();
    await expect(mon.getByRole('tooltip')).toContainText('Deep work');
    await expect(ins.locator('.ins-bars li').first()).toContainText('Deep work');
    await ins.getByRole('button', { name: 'Show as table' }).click();
    await expect(ins.getByRole('table')).toContainText('Mon 5');
    await ins.getByRole('button', { name: 'Previous week' }).click();
    await expect(ins.getByText('Nothing was planned that week yet.')).toBeVisible();
  });

  test('free users see headline stats and a locked chart', async ({ page }) => {
    await boot(page, { tasks: weekTasks() });
    await page.keyboard.press('w');
    await expect(page.getByTestId('insights').locator('.ins-tile').first()).toContainText('4h 15m');
    await page.getByTestId('insights-unlock').click();
    await expect(page.getByTestId('paywall').getByRole('heading')).toHaveText('See where your time really goes.');
  });
});
