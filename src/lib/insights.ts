import { type CategoryId, type PlannerData, type Task, occurrencesOn } from './model';
import { type DateKey, addDays } from './time';
import { streak, bestStreak } from './journal';

/** Stacking / legend order for category charts — validated for CVD + normal-vision separation in both themes. */
export const CHART_ORDER: CategoryId[] = ['work', 'health', 'social', 'errand', 'meeting', 'personal'];

export interface DayStats {
  date: DateKey;
  /** Planned minutes per category (planner blocks only, not calendar events). */
  byCat: Record<CategoryId, number>;
  total: number;
  count: number;
  done: number;
  mood?: 1 | 2 | 3 | 4 | 5;
  ritual: boolean;
}

export interface WeekStats {
  days: DayStats[];
  totals: Record<CategoryId, number>;
  planned: number;
  /** Every block this week, including ones still ahead. */
  count: number;
  /** Blocks that have ended, or were finished early: the ones completion is measured against. */
  due: number;
  done: number;
  completion: number | null;
  avgMood: number | null;
  streak: number;
  bestStreak: number;
  highlightsHit: number;
  highlightsSet: number;
  /** Today has a highlight that isn't done yet (neither hit nor missed). */
  highlightPending: boolean;
}

const zero = (): Record<CategoryId, number> => ({ work: 0, health: 0, social: 0, errand: 0, meeting: 0, personal: 0 });

/**
 * `nowMin` is the current minute of `today`. Blocks still ahead (later today, later this week) are
 * neither done nor missed yet, so they are left out of completion and highlights.
 */
export function weekStats(data: Pick<PlannerData, 'tasks' | 'journal'>, weekStart: DateKey, today: DateKey, nowMin = 24 * 60): WeekStats {
  const days: DayStats[] = [];
  const totals = zero();
  let hit = 0;
  let set = 0;
  let due = 0;
  let pending = false;
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const occ = occurrencesOn(data.tasks as Task[], date);
    const byCat = zero();
    for (const o of occ) {
      const m = o.end - o.start;
      byCat[o.task.category] += m;
      totals[o.task.category] += m;
    }
    due += occ.filter((o) => o.done || date < today || (date === today && o.end <= nowMin)).length;
    const e = data.journal[date];
    if (e?.highlight) {
      const gotDone = occ.some((o) => o.task.id === e.highlight && o.done);
      if (gotDone || date < today) set++;
      if (gotDone) hit++;
      else if (date === today) pending = true;
    }
    days.push({
      date,
      byCat,
      total: occ.reduce((s, o) => s + (o.end - o.start), 0),
      count: occ.length,
      done: occ.filter((o) => o.done).length,
      mood: e?.mood,
      ritual: !!e && (!!e.planned || !!e.shutdown),
    });
  }
  const count = days.reduce((s, d) => s + d.count, 0);
  const done = days.reduce((s, d) => s + d.done, 0);
  const moods = days.map((d) => d.mood).filter((m): m is NonNullable<typeof m> => !!m);
  return {
    days,
    totals,
    planned: days.reduce((s, d) => s + d.total, 0),
    count,
    due,
    done,
    completion: due ? done / due : null,
    avgMood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    streak: streak(data.journal, today),
    bestStreak: bestStreak(data.journal),
    highlightsHit: hit,
    highlightsSet: set,
    highlightPending: pending,
  };
}

/** Clean y-axis ticks in hours for a max value in minutes. */
export function hourTicks(maxMin: number): number[] {
  const maxH = Math.max(1, Math.ceil(maxMin / 60));
  const step = maxH <= 4 ? 1 : maxH <= 8 ? 2 : maxH <= 16 ? 4 : 6;
  const top = Math.ceil(maxH / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}
