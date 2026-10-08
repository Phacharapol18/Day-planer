import { type DateKey, addDays, toKey, fromKey, MINUTES_PER_DAY } from './time';

/** An event from a calendar on the device (Google, Outlook, Samsung…). Read-only in the planner. */
export interface ExternalEvent {
  id: string;
  title: string;
  date: DateKey;
  /** Minutes from midnight on `date`, clipped to the day. */
  start: number;
  end: number;
  /** 0xRRGGBB from the calendar, or null. */
  color: number | null;
  calendar: string;
  location: string;
  allDay: boolean;
}

/** Shape returned by the native Planner.listEvents call (epoch millis). */
export interface RawDeviceEvent {
  id: string;
  title: string;
  begin: number;
  end: number;
  allDay: boolean;
  color?: number;
  calendar?: string;
  location?: string;
}

const MIN_VISIBLE = 15;

/**
 * Turn device events into per-day pieces. Timed events that cross midnight are split; all-day events
 * (stored by Android as UTC midnights, end exclusive) become one all-day entry per covered date.
 */
export function toExternalEvents(raw: RawDeviceEvent[]): ExternalEvent[] {
  const out: ExternalEvent[] = [];
  for (const r of raw) {
    if (!Number.isFinite(r.begin) || !Number.isFinite(r.end)) continue;
    const base = {
      title: (r.title || '').trim() || 'Busy',
      color: typeof r.color === 'number' ? r.color & 0xffffff : null,
      calendar: r.calendar ?? '',
      location: r.location ?? '',
    };
    if (r.allDay) {
      const startUtc = new Date(r.begin);
      let day = toKey(new Date(startUtc.getUTCFullYear(), startUtc.getUTCMonth(), startUtc.getUTCDate()));
      const endUtc = new Date(Math.max(r.end, r.begin + 1));
      const last = toKey(new Date(endUtc.getUTCFullYear(), endUtc.getUTCMonth(), endUtc.getUTCDate()));
      for (let guard = 0; day < last && guard < 366; guard++, day = addDays(day, 1)) {
        out.push({ ...base, id: `${r.id}@${day}`, date: day, start: 0, end: MINUTES_PER_DAY, allDay: true });
      }
      continue;
    }
    const end = Math.max(r.end, r.begin + MIN_VISIBLE * 60_000);
    let day = toKey(new Date(r.begin));
    for (let guard = 0; guard < 366; guard++) {
      const dayStart = fromKey(day).getTime();
      const next = fromKey(addDays(day, 1)).getTime();
      if (dayStart >= end) break;
      const s = Math.max(r.begin, dayStart);
      const e = Math.min(end, next);
      const startMin = Math.round((s - dayStart) / 60_000);
      const endMin = e >= next ? MINUTES_PER_DAY : Math.round((e - dayStart) / 60_000);
      if (endMin > startMin) out.push({ ...base, id: `${r.id}@${day}`, date: day, start: startMin, end: endMin, allDay: false });
      day = addDays(day, 1);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

export function groupByDate(events: ExternalEvent[]): Map<DateKey, ExternalEvent[]> {
  const m = new Map<DateKey, ExternalEvent[]>();
  for (const e of events) {
    const list = m.get(e.date);
    if (list) list.push(e);
    else m.set(e.date, [e]);
  }
  return m;
}

export const colorHex = (c: number | null) => (c === null ? null : `#${c.toString(16).padStart(6, '0')}`);
