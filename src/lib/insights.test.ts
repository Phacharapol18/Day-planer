import { describe, it, expect } from 'vitest';
import { weekStats, hourTicks, CHART_ORDER } from './insights';
import { makeTask } from './model';

describe('weekStats', () => {
  it('sums planned minutes by category and day, completion, mood, highlights', () => {
    const a = makeTask({ title: 'deep', date: '2026-10-05', start: 540, duration: 120, done: true });
    const b = makeTask({ title: 'gym', date: '2026-10-05', start: 1080, duration: 60, category: 'health' });
    const r = makeTask({ title: 'standup', date: '2026-10-05', start: 570, duration: 15, category: 'meeting', repeat: 'weekdays', doneOn: ['2026-10-06'] });
    const s = weekStats(
      { tasks: [a, b, r], journal: { '2026-10-05': { planned: 1, mood: 4, highlight: a.id }, '2026-10-06': { mood: 2, highlight: b.id } } },
      '2026-10-05',
      '2026-10-06',
    );
    expect(s.days[0]).toMatchObject({ date: '2026-10-05', total: 195, count: 3, done: 1, mood: 4, ritual: true });
    expect(s.days[0].byCat).toMatchObject({ work: 120, health: 60, meeting: 15 });
    expect(s.days[5]).toMatchObject({ count: 0, total: 0 }); // Saturday: no weekday standup
    expect(s.totals.meeting).toBe(75);
    expect(s.planned).toBe(255);
    expect(s.count).toBe(7);
    expect(s.done).toBe(2);
    expect(s.completion).toBeCloseTo(2 / 7);
    expect(s.avgMood).toBe(3);
    expect(s).toMatchObject({ highlightsSet: 2, highlightsHit: 1, streak: 1, bestStreak: 1 });
  });
  it('handles an empty week', () => {
    const s = weekStats({ tasks: [], journal: {} }, '2026-10-05', '2026-10-08');
    expect(s).toMatchObject({ planned: 0, completion: null, avgMood: null, streak: 0 });
  });
});

describe('hourTicks', () => {
  it('rounds to clean hour steps', () => {
    expect(hourTicks(0)).toEqual([0, 1]);
    expect(hourTicks(150)).toEqual([0, 1, 2, 3]);
    expect(hourTicks(7 * 60 + 5)).toEqual([0, 2, 4, 6, 8]);
    expect(hourTicks(13 * 60)).toEqual([0, 4, 8, 12, 16]);
  });
  it('chart order covers every category once', () => {
    expect(new Set(CHART_ORDER).size).toBe(6);
  });
});
