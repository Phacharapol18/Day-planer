import { describe, it, expect } from 'vitest';
import { layoutColumns, freeGaps, findSlot, autoPlan, mergeBusy } from './layout';

describe('layoutColumns', () => {
  it('gives non-overlapping blocks a full column', () => {
    const r = layoutColumns([{ id: 'a', start: 0, end: 60 }, { id: 'b', start: 60, end: 120 }]);
    expect(r.get('a')).toEqual({ col: 0, cols: 1 });
    expect(r.get('b')).toEqual({ col: 0, cols: 1 });
  });
  it('splits overlapping clusters and reuses freed columns', () => {
    const r = layoutColumns([
      { id: 'a', start: 0, end: 120 },
      { id: 'b', start: 30, end: 60 },
      { id: 'c', start: 60, end: 90 },
      { id: 'd', start: 200, end: 230 },
    ]);
    expect(r.get('a')).toEqual({ col: 0, cols: 2 });
    expect(r.get('b')).toEqual({ col: 1, cols: 2 });
    expect(r.get('c')).toEqual({ col: 1, cols: 2 });
    expect(r.get('d')).toEqual({ col: 0, cols: 1 });
  });
});

describe('free time', () => {
  const busy = [{ start: 540, end: 600 }, { start: 570, end: 660 }, { start: 780, end: 840 }];
  it('merges busy', () => expect(mergeBusy(busy)).toEqual([{ start: 540, end: 660 }, { start: 780, end: 840 }]));
  it('finds gaps ≥ min length', () => {
    expect(freeGaps(busy, 480, 900, 30)).toEqual([
      { start: 480, end: 540 },
      { start: 660, end: 780 },
      { start: 840, end: 900 },
    ]);
    expect(freeGaps(busy, 600, 870, 45)).toEqual([{ start: 660, end: 780 }]);
  });
  it('finds the earliest slot that fits', () => {
    expect(findSlot(busy, 60, 480, 1320)).toBe(480);
    expect(findSlot(busy, 90, 480, 1320)).toBe(660);
    expect(findSlot(busy, 30, 545, 1320)).toBe(660);
    expect(findSlot(busy, 600, 480, 1320)).toBe(null);
    expect(findSlot([], 30, 487, 1320)).toBe(495); // snapped to 15m
  });
  it('auto-plans in order without overlap and reports leftovers', () => {
    const r = autoPlan([{ id: 'x', duration: 120 }, { id: 'y', duration: 60 }, { id: 'z', duration: 600 }], busy, 480, 900);
    expect(r.placed).toEqual([{ id: 'x', start: 660 }, { id: 'y', start: 480 }]);
    expect(r.unplaced).toEqual(['z']);
  });
});
