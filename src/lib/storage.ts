import { type PlannerData, type Task, type DayEntry, DEFAULT_SETTINGS, makeTask, CATEGORIES, type Priority, type Repeat } from './model';
import { type DateKey, inputToTime } from './time';

export const STORAGE_KEY = 'dayplanner:v1';
/** Key used by the original jQuery "Work Day Scheduler" version of this app. */
export const LEGACY_KEY = 'saveArr';

export function emptyData(): PlannerData {
  return { version: 1, tasks: [], settings: { ...DEFAULT_SETTINGS }, journal: {} };
}

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const REPEATS: Repeat[] = ['none', 'daily', 'weekdays', 'weekly'];
const isKey = (v: unknown): v is DateKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Validate and normalise one task; returns null for anything unusable. */
export function sanitizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || typeof r.id !== 'string') return null;
  const start = typeof r.start === 'number' && r.start >= 0 && r.start < 1440 ? Math.round(r.start) : null;
  const date = isKey(r.date) ? r.date : null;
  const duration = typeof r.duration === 'number' && r.duration > 0 ? Math.min(1440, Math.round(r.duration)) : 30;
  return {
    id: r.id,
    title: r.title.slice(0, 500),
    notes: typeof r.notes === 'string' ? r.notes.slice(0, 10_000) : '',
    duration,
    priority: ([0, 1, 2, 3].includes(r.priority as number) ? r.priority : 0) as Priority,
    category: CATEGORY_IDS.has(r.category as never) ? (r.category as Task['category']) : 'work',
    date: date && start !== null ? date : null,
    start: date && start !== null ? start : null,
    due: isKey(r.due) ? r.due : null,
    repeat: REPEATS.includes(r.repeat as Repeat) ? (r.repeat as Repeat) : 'none',
    done: r.done === true,
    doneOn: Array.isArray(r.doneOn) ? r.doneOn.filter(isKey) : [],
    skipOn: Array.isArray(r.skipOn) ? r.skipOn.filter(isKey) : [],
    steps: Array.isArray(r.steps)
      ? r.steps
          .filter((x): x is { id: string; text: string } => !!x && typeof (x as { id?: unknown }).id === 'string' && typeof (x as { text?: unknown }).text === 'string')
          .slice(0, 50)
          .map((x) => ({ id: x.id, text: x.text.slice(0, 200) }))
      : [],
    stepsDone: sanitizeDayMap(r.stepsDone, (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null)),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  };
}

function sanitizeDayMap<T>(raw: unknown, fn: (v: unknown) => T | null): Record<DateKey, T> {
  const out: Record<DateKey, T> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isKey(k)) continue;
    const t = fn(v);
    if (t !== null) out[k] = t;
  }
  return out;
}

function sanitizeEntry(v: unknown): DayEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const e: DayEntry = {};
  if (typeof o.planned === 'number') e.planned = o.planned;
  if (typeof o.shutdown === 'number') e.shutdown = o.shutdown;
  if ([1, 2, 3, 4, 5].includes(o.mood as number)) e.mood = o.mood as DayEntry['mood'];
  if (typeof o.highlight === 'string') e.highlight = o.highlight;
  if (typeof o.note === 'string') e.note = o.note.slice(0, 2000);
  return e;
}

export function sanitizeData(raw: unknown): PlannerData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.tasks)) return null;
  const s = (r.settings ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && v >= min && v <= max ? v : d;
  const dayStart = num(s.dayStart, DEFAULT_SETTINGS.dayStart, 0, 1380);
  const dayEnd = num(s.dayEnd, DEFAULT_SETTINGS.dayEnd, 60, 1440);
  const seen = new Set<string>();
  return {
    version: 1,
    tasks: r.tasks
      .map(sanitizeTask)
      .filter((t): t is Task => !!t && !seen.has(t.id) && !!seen.add(t.id)),
    journal: sanitizeDayMap(r.journal, sanitizeEntry),
    settings: {
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
      use24h: s.use24h === true,
      dayStart: dayStart < dayEnd ? dayStart : DEFAULT_SETTINGS.dayStart,
      dayEnd: dayStart < dayEnd ? dayEnd : DEFAULT_SETTINGS.dayEnd,
      hourHeight: num(s.hourHeight, DEFAULT_SETTINGS.hourHeight, 40, 160),
      notify: s.notify === true,
      leadMinutes: [0, 5, 10, 15, 30].includes(s.leadMinutes as number) ? (s.leadMinutes as number) : DEFAULT_SETTINGS.leadMinutes,
      nowCard: s.nowCard !== false,
      calendarIds: Array.isArray(s.calendarIds) ? s.calendarIds.filter((x): x is string => typeof x === 'string').slice(0, 50) : [],
    },
  };
}

/**
 * Notes saved by the old hour-row scheduler ({ myContent, hour: "09:00" }), newest wins per hour.
 * They had no date, so they become blocks on `today`.
 */
export function migrateLegacy(raw: string | null, today: DateKey): Task[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const byHour = new Map<number, string>();
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const { myContent, hour } = e as { myContent?: unknown; hour?: unknown };
    if (typeof myContent !== 'string' || typeof hour !== 'string') continue;
    const start = inputToTime(hour.trim());
    if (start === null) continue;
    byHour.set(start, myContent.trim());
  }
  return [...byHour.entries()]
    .filter(([, text]) => text.length > 0)
    .sort(([a], [b]) => a - b)
    .map(([start, text]) => {
      const [first, ...rest] = text.split('\n');
      return makeTask({ title: first.slice(0, 200), notes: rest.join('\n').trim(), date: today, start, duration: 60 });
    });
}

export interface LoadResult {
  data: PlannerData;
  imported: number;
  corrupt: boolean;
  /** Nothing saved and nothing imported: a brand-new user. */
  fresh: boolean;
}

export function load(storage: Storage, today: DateKey): LoadResult {
  let corrupt = false;
  let data: PlannerData | null = null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      data = sanitizeData(JSON.parse(raw));
      if (!data) corrupt = true;
    }
  } catch {
    corrupt = true;
  }
  if (corrupt) {
    // Keep the unreadable payload so a bad write never destroys someone's plan for good.
    try {
      storage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, storage.getItem(STORAGE_KEY) ?? '');
    } catch {
      /* storage full or unavailable */
    }
  }
  const hadData = !!data;
  let imported = 0;
  if (!data) {
    data = emptyData();
    try {
      const legacy = migrateLegacy(storage.getItem(LEGACY_KEY), today);
      data.tasks.push(...legacy);
      imported = legacy.length;
    } catch {
      /* storage unavailable */
    }
  }
  return { data, imported, corrupt, fresh: !hadData && !imported && !corrupt };
}

export function save(storage: Storage, data: PlannerData): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
