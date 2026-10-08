import { type Task, occurrencesOn } from './model';
import { autoPlan } from './layout';
import type { DateKey } from './time';

/** One-off blocks today that already ended without being done. Repeating ones are left alone. */
export function slippedTasks(tasks: Task[], today: DateKey, nowMin: number): Task[] {
  return occurrencesOn(tasks, today)
    .filter((o) => !o.done && o.task.repeat === 'none' && o.end <= nowMin)
    .map((o) => o.task);
}

export interface ReplanResult {
  /** New start times for blocks that fit later today. */
  placed: { id: string; start: number }[];
  /** Blocks that no longer fit today: they go to the inbox, due tomorrow. */
  overflow: string[];
}

/**
 * Move slipped blocks into the rest of today without touching anything else: higher priority first,
 * then their original order. Everything still upcoming (blocks and calendar events) stays fixed.
 */
export function replanSlipped(
  tasks: Task[],
  busyExtra: { start: number; end: number }[],
  today: DateKey,
  nowMin: number,
  dayEnd: number,
): ReplanResult {
  const slipped = slippedTasks(tasks, today, nowMin);
  if (!slipped.length) return { placed: [], overflow: [] };
  const ids = new Set(slipped.map((t) => t.id));
  const fixed = occurrencesOn(tasks, today).filter((o) => !ids.has(o.task.id) && o.end > nowMin);
  const queue = [...slipped].sort((a, b) => b.priority - a.priority || (a.start as number) - (b.start as number));
  const { placed, unplaced } = autoPlan(
    queue.map((t) => ({ id: t.id, duration: t.duration })),
    [...fixed, ...busyExtra],
    Math.ceil(nowMin / 5) * 5,
    dayEnd,
  );
  return { placed, overflow: unplaced };
}
