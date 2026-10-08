import { describe, it, expect } from 'vitest';
import { exampleDay } from './example';
import { occurrencesOn, inboxTasks } from './model';

describe('exampleDay', () => {
  it('builds a day around now with a current block, free time and an inbox', () => {
    const { tasks, highlightId } = exampleDay('2026-10-08', 10 * 60 + 20);
    const occ = occurrencesOn(tasks, '2026-10-08');
    expect(occ).toHaveLength(5);
    const current = occ.find((o) => o.start <= 620 && o.end > 620);
    expect(current?.task.id).toBe(highlightId);
    expect(occ[0]).toMatchObject({ done: true });
    expect(inboxTasks(tasks)).toHaveLength(3);
    // No overlaps.
    for (let i = 1; i < occ.length; i++) expect(occ[i].start).toBeGreaterThanOrEqual(occ[i - 1].end);
  });
  it('plans tomorrow when it is late', () => {
    const { tasks } = exampleDay('2026-10-08', 22 * 60);
    expect(occurrencesOn(tasks, '2026-10-09')).toHaveLength(5);
    expect(occurrencesOn(tasks, '2026-10-08')).toHaveLength(0);
  });
});
