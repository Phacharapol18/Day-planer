import { describe, it, expect } from 'vitest';
import { toExternalEvents, groupByDate, colorHex } from './external';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('toExternalEvents', () => {
  it('maps a timed event to local minutes', () => {
    const [e] = toExternalEvents([{ id: '1', title: 'Sync', begin: at(2026, 10, 8, 9, 30), end: at(2026, 10, 8, 10, 15), allDay: false, color: 0x1f7fb8 }]);
    expect(e).toMatchObject({ date: '2026-10-08', start: 570, end: 615, allDay: false, color: 0x1f7fb8, title: 'Sync' });
  });

  it('splits events that cross midnight', () => {
    const r = toExternalEvents([{ id: '2', title: 'Flight', begin: at(2026, 10, 8, 22), end: at(2026, 10, 9, 2), allDay: false }]);
    expect(r.map((e) => [e.date, e.start, e.end])).toEqual([
      ['2026-10-08', 1320, 1440],
      ['2026-10-09', 0, 120],
    ]);
  });

  it('gives zero-length events a visible minimum and a fallback title', () => {
    const [e] = toExternalEvents([{ id: '3', title: '  ', begin: at(2026, 10, 8, 14), end: at(2026, 10, 8, 14), allDay: false }]);
    expect(e).toMatchObject({ start: 840, end: 855, title: 'Busy' });
  });

  it('expands all-day events (UTC midnights, end exclusive) per date', () => {
    const r = toExternalEvents([{ id: '4', title: 'Trip', begin: Date.UTC(2026, 9, 8), end: Date.UTC(2026, 9, 10), allDay: true }]);
    expect(r.map((e) => [e.date, e.allDay])).toEqual([
      ['2026-10-08', true],
      ['2026-10-09', true],
    ]);
  });

  it('ignores garbage and groups by date', () => {
    const r = toExternalEvents([
      { id: 'x', title: 'bad', begin: NaN, end: 1, allDay: false },
      { id: 'a', title: 'A', begin: at(2026, 10, 9, 8), end: at(2026, 10, 9, 9), allDay: false },
      { id: 'b', title: 'B', begin: at(2026, 10, 8, 8), end: at(2026, 10, 8, 9), allDay: false },
    ]);
    expect(r.map((e) => e.title)).toEqual(['B', 'A']);
    expect(groupByDate(r).get('2026-10-09')?.[0].title).toBe('A');
    expect(colorHex(0x00ff)).toBe('#0000ff');
    expect(colorHex(null)).toBeNull();
  });
});
