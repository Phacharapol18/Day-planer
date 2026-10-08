import type { DayEntry, PlannerData } from './model';
import { type DateKey, addDays } from './time';

/** A day "counts" toward the streak when you planned it in the morning or closed it in the evening. */
export const ritualDone = (e: DayEntry | undefined) => !!e && (!!e.planned || !!e.shutdown);

/**
 * Consecutive ritual days ending today. Today not being done yet doesn't break the streak
 * (you still have time), so counting starts from yesterday in that case.
 */
export function streak(journal: PlannerData['journal'], today: DateKey): number {
  let d = ritualDone(journal[today]) ? today : addDays(today, -1);
  let n = 0;
  for (let guard = 0; guard < 3660 && ritualDone(journal[d]); guard++) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function bestStreak(journal: PlannerData['journal']): number {
  const days = Object.keys(journal).filter((k) => ritualDone(journal[k])).sort();
  let best = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
