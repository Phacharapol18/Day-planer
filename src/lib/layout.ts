import { SNAP } from './time';

export interface Interval {
  id: string;
  start: number;
  end: number;
}

export interface Placement {
  col: number;
  cols: number;
}

/**
 * Side-by-side layout for overlapping blocks. Blocks that overlap (transitively) form a cluster;
 * inside a cluster each block takes the first column that is free at its start time.
 */
export function layoutColumns(items: Interval[]): Map<string, Placement> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<string, Placement>();
  let cluster: { id: string; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols = colEnds.length;
    for (const c of cluster) result.set(c.id, { col: c.col, cols });
    cluster = [];
    colEnds = [];
  };

  for (const it of sorted) {
    const end = Math.max(it.end, it.start + 1);
    if (it.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let col = colEnds.findIndex((e) => e <= it.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(end);
    } else {
      colEnds[col] = end;
    }
    cluster.push({ id: it.id, col });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}

/** Merge overlapping busy intervals into a sorted, disjoint list. */
export function mergeBusy(items: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.start <= last.end) last.end = Math.max(last.end, it.end);
    else out.push({ start: it.start, end: it.end });
  }
  return out;
}

/** Open stretches of time in [from, to] that are at least `minLength` minutes long. */
export function freeGaps(
  busy: { start: number; end: number }[],
  from: number,
  to: number,
  minLength = 30,
): { start: number; end: number }[] {
  const gaps: { start: number; end: number }[] = [];
  let cursor = from;
  for (const b of mergeBusy(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= to) break;
    if (b.start - cursor >= minLength) gaps.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (to - cursor >= minLength) gaps.push({ start: cursor, end: to });
  return gaps;
}

const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;

/** Earliest start ≥ `earliest` where `duration` fits before `latest` without overlapping `busy`. */
export function findSlot(
  busy: { start: number; end: number }[],
  duration: number,
  earliest: number,
  latest: number,
): number | null {
  let cursor = ceilTo(earliest, SNAP);
  for (const b of mergeBusy(busy)) {
    if (b.end <= cursor) continue;
    if (b.start - cursor >= duration) break;
    cursor = Math.max(cursor, ceilTo(b.end, SNAP));
  }
  return cursor + duration <= latest ? cursor : null;
}

export interface AutoPlanItem {
  id: string;
  duration: number;
}

/**
 * Greedy auto-planner: takes items in the given (priority) order and drops each into the earliest
 * open slot. Items that do not fit are returned as `unplaced` rather than squeezed or overlapped.
 */
export function autoPlan(
  items: AutoPlanItem[],
  busy: { start: number; end: number }[],
  earliest: number,
  latest: number,
): { placed: { id: string; start: number }[]; unplaced: string[] } {
  const occupied = [...busy];
  const placed: { id: string; start: number }[] = [];
  const unplaced: string[] = [];
  for (const it of items) {
    const start = findSlot(occupied, it.duration, earliest, latest);
    if (start === null) {
      unplaced.push(it.id);
      continue;
    }
    placed.push({ id: it.id, start });
    occupied.push({ start, end: start + it.duration });
  }
  return { placed, unplaced };
}
