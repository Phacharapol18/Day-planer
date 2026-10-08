import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './snapshot';
import { makeTask, DEFAULT_SETTINGS } from './model';
import type { ExternalEvent } from './external';

const TODAY = '2026-10-08';

describe('buildSnapshot', () => {
  it('covers yesterday…+2 days, expands repeats, includes calendar events, counts inbox', () => {
    const tasks = [
      makeTask({ title: 'Run', date: TODAY, start: 420, duration: 30, repeat: 'daily', doneOn: [TODAY] }),
      makeTask({ title: 'Old', date: '2026-10-01', start: 600 }),
      makeTask({ title: 'Inbox thing' }),
    ];
    const ev: ExternalEvent = { id: 'e1@2026-10-09', title: 'Sync', date: '2026-10-09', start: 540, end: 570, color: 0x112233, calendar: 'Work', location: '', allDay: false };
    const s = buildSnapshot(tasks, { ...DEFAULT_SETTINGS, notify: true, use24h: true }, TODAY, (d) => (d === '2026-10-09' ? [ev] : []));
    expect(s).toMatchObject({ v: 1, reminders: true, use24h: true, leadMinutes: 5, nowCard: true, inboxCount: 1 });
    // Daily run: anchor is today, so it appears today, +1, +2 (not yesterday). Plus the event.
    expect(s.items.map((i) => `${i.date}:${i.title}:${i.done}`)).toEqual([
      '2026-10-08:Run:true',
      '2026-10-09:Run:false',
      '2026-10-09:Sync:false',
      '2026-10-10:Run:false',
    ]);
    expect(s.items.find((i) => i.ext)).toMatchObject({ color: 0x112233, start: 540, end: 570 });
  });
});
