import { describe, it, expect } from 'vitest';
import { streak, bestStreak } from './journal';
import { makeTask, DEFAULT_SETTINGS } from './model';
import { reduce } from './store';
import { emptyData, sanitizeData } from './storage';

const T = '2026-10-08';

describe('streaks', () => {
  it('counts back from today, or from yesterday while today is still open', () => {
    const j = { '2026-10-05': { planned: 1 }, '2026-10-06': { shutdown: 1 }, '2026-10-07': { planned: 1 } };
    expect(streak(j, T)).toBe(3);
    expect(streak({ ...j, [T]: { planned: 2 } }, T)).toBe(4);
    expect(streak({ '2026-10-05': { planned: 1 } }, T)).toBe(0);
    expect(streak({ [T]: { mood: 3 } }, T)).toBe(0); // a mood alone isn't a ritual
  });
  it('finds the best run', () => {
    expect(bestStreak({ '2026-10-01': { planned: 1 }, '2026-10-02': { planned: 1 }, '2026-10-05': { planned: 1 } })).toBe(2);
    expect(bestStreak({})).toBe(0);
  });
});

describe('journal + steps in the store', () => {
  it('merges journal patches and toggles steps per occurrence', () => {
    const t = makeTask({ title: 'Morning routine', date: T, start: 420, repeat: 'daily', steps: [{ id: 'a', text: 'Water' }, { id: 'b', text: 'Stretch' }] });
    let d = { ...emptyData(), tasks: [t] };
    d = reduce(d, { type: 'journal', date: T, patch: { highlight: t.id } });
    d = reduce(d, { type: 'journal', date: T, patch: { planned: 5 } });
    expect(d.journal[T]).toEqual({ highlight: t.id, planned: 5 });
    d = reduce(d, { type: 'toggleStep', id: t.id, date: T, stepId: 'a' });
    expect(d.tasks[0].stepsDone).toEqual({ [T]: ['a'] });
    d = reduce(d, { type: 'toggleStep', id: t.id, date: '2026-10-09', stepId: 'b' });
    d = reduce(d, { type: 'toggleStep', id: t.id, date: T, stepId: 'a' });
    expect(d.tasks[0].stepsDone).toEqual({ [T]: [], '2026-10-09': ['b'] });
  });
  it('sanitizes journal and steps from storage', () => {
    const d = sanitizeData({
      tasks: [{ id: 'x', title: 't', steps: [{ id: 's', text: 'ok' }, { id: 1 }, 'bad'], stepsDone: { [T]: ['s', 3], nope: ['s'] } }],
      settings: DEFAULT_SETTINGS,
      journal: { [T]: { planned: 1, mood: 9, note: 'hi', extra: true }, 'not-a-date': { planned: 1 } },
    })!;
    expect(d.tasks[0].steps).toEqual([{ id: 's', text: 'ok' }]);
    expect(d.tasks[0].stepsDone).toEqual({ [T]: ['s'] });
    expect(d.journal).toEqual({ [T]: { planned: 1, note: 'hi' } });
  });
});
