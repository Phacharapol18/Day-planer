import { describe, it, expect } from 'vitest';
import { replanSlipped, slippedTasks } from './replan';
import { makeTask } from './model';

const T = '2026-10-08';

describe('replanSlipped', () => {
  const a = makeTask({ title: 'Write spec', date: T, start: 540, duration: 60, priority: 1 }); // 9-10, slipped
  const b = makeTask({ title: 'Email', date: T, start: 600, duration: 30, priority: 3 }); // 10-10:30, slipped
  const c = makeTask({ title: 'Done one', date: T, start: 480, duration: 30, done: true });
  const d = makeTask({ title: 'Meeting', date: T, start: 690, duration: 60 }); // 11:30-12:30 upcoming, fixed
  const r = makeTask({ title: 'Standup', date: T, start: 555, duration: 15, repeat: 'daily' }); // repeating: ignored
  const tasks = [a, b, c, d, r];
  const now = 645; // 10:45

  it('finds only unfinished one-off blocks that already ended', () => {
    expect(slippedTasks(tasks, T, now).map((t) => t.title)).toEqual(['Write spec', 'Email']);
  });

  it('re-places by priority around fixed blocks and calendar events, overflowing what no longer fits', () => {
    const res = replanSlipped(tasks, [{ start: 765, end: 800 }], T, now, 900);
    // Email (p3) first at 10:45. Write spec (60m) fits neither before the 11:30 meeting nor between it
    // and the 12:45 calendar event, so it lands after the event, snapped to 13:30.
    expect(res.placed).toEqual([
      { id: b.id, start: 645 },
      { id: a.id, start: 810 },
    ]);
    expect(res.overflow).toEqual([]);
    const tight = replanSlipped(tasks, [{ start: 765, end: 800 }], T, now, 840);
    expect(tight.placed).toEqual([{ id: b.id, start: 645 }]);
    expect(tight.overflow).toEqual([a.id]);
  });

  it('does nothing when nothing slipped', () => {
    expect(replanSlipped([d], [], T, now, 1320)).toEqual({ placed: [], overflow: [] });
  });
});
