import { type Settings, type Task, occurrencesOn, inboxTasks } from './model';
import type { ExternalEvent } from './external';
import { type DateKey, addDays } from './time';

/** Mirrors PlannerStore.Snapshot on the Android side. */
export interface NativeSnapshot {
  v: 1;
  use24h: boolean;
  reminders: boolean;
  leadMinutes: number;
  nowCard: boolean;
  inboxCount: number;
  items: {
    id: string;
    date: DateKey;
    title: string;
    start: number;
    end: number;
    done: boolean;
    cat: string;
    ext?: true;
    color?: number;
  }[];
}

/**
 * Yesterday through the day after tomorrow: enough for widgets and alarms to stay correct across
 * midnight and for a couple of days if the app isn't opened.
 */
export function buildSnapshot(tasks: Task[], settings: Settings, today: DateKey, eventsOn: (d: DateKey) => ExternalEvent[]): NativeSnapshot {
  const items: NativeSnapshot['items'] = [];
  for (let i = -1; i <= 2; i++) {
    const d = addDays(today, i);
    for (const o of occurrencesOn(tasks, d)) {
      items.push({ id: o.task.id, date: d, title: o.task.title, start: o.start, end: o.end, done: o.done, cat: o.task.category });
    }
    for (const e of eventsOn(d)) {
      items.push({ id: e.id, date: d, title: e.title, start: e.start, end: e.end, done: false, cat: 'meeting', ext: true, ...(e.color !== null ? { color: e.color } : {}) });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  return {
    v: 1,
    use24h: settings.use24h,
    reminders: settings.notify,
    leadMinutes: settings.leadMinutes,
    nowCard: settings.nowCard,
    inboxCount: inboxTasks(tasks).length,
    items,
  };
}
