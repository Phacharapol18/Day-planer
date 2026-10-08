import { type PlannerData, type Settings, type Task, newId, isScheduled } from './model';
import { type DateKey, clamp, MINUTES_PER_DAY } from './time';

export type Action =
  | { type: 'add'; task: Task }
  | { type: 'addMany'; tasks: Task[] }
  | { type: 'update'; id: string; patch: Partial<Task> }
  | { type: 'schedule'; id: string; date: DateKey; start: number; duration?: number }
  | { type: 'scheduleMany'; items: { id: string; date: DateKey; start: number }[] }
  | { type: 'unschedule'; id: string }
  | { type: 'toggleDone'; id: string; date: DateKey }
  | { type: 'delete'; id: string }
  | { type: 'skipOccurrence'; id: string; date: DateKey }
  | { type: 'duplicate'; id: string; date: DateKey }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'replace'; data: PlannerData };

const mapTask = (data: PlannerData, id: string, fn: (t: Task) => Task): PlannerData => ({
  ...data,
  tasks: data.tasks.map((t) => (t.id === id ? fn(t) : t)),
});

const fitStart = (start: number, duration: number) => clamp(Math.round(start), 0, MINUTES_PER_DAY - Math.max(5, Math.min(duration, MINUTES_PER_DAY)));

export function reduce(data: PlannerData, action: Action): PlannerData {
  switch (action.type) {
    case 'add':
      return { ...data, tasks: [...data.tasks, action.task] };
    case 'addMany':
      return { ...data, tasks: [...data.tasks, ...action.tasks] };
    case 'update':
      return mapTask(data, action.id, (t) => {
        const next = { ...t, ...action.patch };
        if (next.duration !== undefined) next.duration = clamp(Math.round(next.duration), 5, MINUTES_PER_DAY);
        if (next.start !== null) next.start = fitStart(next.start, next.duration);
        // Keep the invariant: scheduled ⇔ date and start are both set.
        if ((next.date === null) !== (next.start === null)) {
          next.date = null;
          next.start = null;
        }
        return next;
      });
    case 'schedule':
      return mapTask(data, action.id, (t) => {
        const duration = action.duration !== undefined ? clamp(Math.round(action.duration), 5, MINUTES_PER_DAY) : t.duration;
        // Moving a missed/inbox one-off onto the timeline re-opens it for that day.
        return { ...t, date: t.repeat === 'none' || !isScheduled(t) ? action.date : t.date, start: fitStart(action.start, duration), duration };
      });
    case 'scheduleMany': {
      const byId = new Map(action.items.map((i) => [i.id, i]));
      return {
        ...data,
        tasks: data.tasks.map((t) => {
          const it = byId.get(t.id);
          return it ? { ...t, date: it.date, start: fitStart(it.start, t.duration) } : t;
        }),
      };
    }
    case 'unschedule':
      return mapTask(data, action.id, (t) => ({ ...t, date: null, start: null, repeat: 'none', doneOn: [], skipOn: [], done: false }));
    case 'toggleDone':
      return mapTask(data, action.id, (t) => {
        if (t.repeat === 'none') return { ...t, done: !t.done };
        const has = t.doneOn.includes(action.date);
        return { ...t, doneOn: has ? t.doneOn.filter((d) => d !== action.date) : [...t.doneOn, action.date] };
      });
    case 'delete':
      return { ...data, tasks: data.tasks.filter((t) => t.id !== action.id) };
    case 'skipOccurrence':
      return mapTask(data, action.id, (t) => ({ ...t, skipOn: [...new Set([...t.skipOn, action.date])] }));
    case 'duplicate': {
      const src = data.tasks.find((t) => t.id === action.id);
      if (!src) return data;
      const copy: Task = {
        ...src,
        id: newId(),
        createdAt: Date.now(),
        repeat: 'none',
        done: false,
        doneOn: [],
        skipOn: [],
        date: isScheduled(src) ? action.date : null,
        start: isScheduled(src) ? fitStart((src.start as number) + src.duration, src.duration) : null,
      };
      return { ...data, tasks: [...data.tasks, copy] };
    }
    case 'settings':
      return { ...data, settings: { ...data.settings, ...action.patch } };
    case 'replace':
      return action.data;
  }
}

/** Undo/redo history around a reducer. Settings changes are not recorded (they are preferences, not plans). */
export interface History {
  past: PlannerData[];
  present: PlannerData;
  future: PlannerData[];
}

const LIMIT = 100;

export function historyReduce(h: History, action: Action | { type: 'undo' } | { type: 'redo' } | { type: 'sync'; data: PlannerData }): History {
  switch (action.type) {
    case 'undo': {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: { ...prev, settings: h.present.settings }, future: [h.present, ...h.future] };
    }
    case 'redo': {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return { past: [...h.past, h.present], present: { ...next, settings: h.present.settings }, future: rest };
    }
    case 'sync':
      // Another tab wrote newer data; adopt it and drop local history that no longer applies.
      return { past: [], present: action.data, future: [] };
    case 'settings':
      return { ...h, present: reduce(h.present, action) };
    default: {
      const next = reduce(h.present, action);
      if (next === h.present) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
    }
  }
}
