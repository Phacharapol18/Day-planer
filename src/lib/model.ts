import { type DateKey, weekday, diffDays } from './time';

export type Priority = 0 | 1 | 2 | 3;
export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly';
export type CategoryId = 'work' | 'meeting' | 'health' | 'personal' | 'social' | 'errand';

export interface Task {
  id: string;
  title: string;
  notes: string;
  /** Minutes. Always a positive multiple of 5. */
  duration: number;
  priority: Priority;
  category: CategoryId;
  /** Scheduled day. A task is on the timeline when both `date` and `start` are set; otherwise it lives in the inbox. */
  date: DateKey | null;
  /** Minutes from midnight. */
  start: number | null;
  /** Optional target day for inbox tasks. */
  due: DateKey | null;
  repeat: Repeat;
  /** Completion for one-off tasks. */
  done: boolean;
  /** Completion per occurrence for repeating tasks. */
  doneOn: DateKey[];
  /** Occurrences removed from a repeating series. */
  skipOn: DateKey[];
  /** Optional checklist (routines: "brush teeth → coffee → pack bag"). */
  steps: Step[];
  /** Checked step ids per occurrence date. */
  stepsDone: Record<DateKey, string[]>;
  createdAt: number;
}

export interface Step {
  id: string;
  text: string;
}

/** Per-day ritual record: morning plan, highlight, evening shutdown and reflection. */
export interface DayEntry {
  planned?: number;
  shutdown?: number;
  mood?: 1 | 2 | 3 | 4 | 5;
  /** The one thing that would make the day a win (task id). */
  highlight?: string;
  note?: string;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  use24h: boolean;
  /** Working window used for free-time and auto-planning, in minutes. */
  dayStart: number;
  dayEnd: number;
  /** Pixels per hour on the timeline. */
  hourHeight: number;
  /** Reminders when a block starts. */
  notify: boolean;
  /** Extra heads-up this many minutes before a block (0 = only at start). */
  leadMinutes: number;
  /** Android: ongoing "Now" card in the notification shade while a block runs. */
  nowCard: boolean;
  /** Android: device calendars (CalendarContract ids) shown on the timeline. */
  calendarIds: string[];
}

export interface PlannerData {
  version: 1;
  tasks: Task[];
  settings: Settings;
  journal: Record<DateKey, DayEntry>;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  use24h: false,
  dayStart: 8 * 60,
  dayEnd: 22 * 60,
  hourHeight: 72,
  notify: false,
  leadMinutes: 5,
  nowCard: true,
  calendarIds: [],
};

export interface Category {
  id: CategoryId;
  name: string;
  aliases: string[];
}

export const CATEGORIES: Category[] = [
  { id: 'work', name: 'Deep work', aliases: ['work', 'focus', 'deep', 'project'] },
  { id: 'meeting', name: 'Meetings', aliases: ['meeting', 'meet', 'call', 'sync'] },
  { id: 'health', name: 'Health', aliases: ['health', 'gym', 'fitness', 'run', 'workout', 'sleep'] },
  { id: 'personal', name: 'Personal', aliases: ['personal', 'home', 'me', 'family'] },
  { id: 'social', name: 'Social', aliases: ['social', 'friends', 'fun', 'date'] },
  { id: 'errand', name: 'Errands', aliases: ['errand', 'errands', 'chores', 'admin', 'shop', 'shopping'] },
];

export function categoryFromTag(tag: string): CategoryId | null {
  const t = tag.toLowerCase();
  const hit = CATEGORIES.find((c) => c.id === t || c.aliases.includes(t));
  return hit ? hit.id : null;
}

export const PRIORITY_LABEL: Record<Priority, string> = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' };

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
};

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function makeTask(partial: Partial<Task> & { title: string }): Task {
  return {
    id: newId(),
    notes: '',
    duration: 30,
    priority: 0,
    category: 'work',
    date: null,
    start: null,
    due: null,
    repeat: 'none',
    done: false,
    doneOn: [],
    skipOn: [],
    steps: [],
    stepsDone: {},
    createdAt: Date.now(),
    ...partial,
  };
}

export function isScheduled(t: Task): boolean {
  return t.date !== null && t.start !== null;
}

/** Does this task produce a timeline block on `day`? */
export function occursOn(t: Task, day: DateKey): boolean {
  if (!isScheduled(t)) return false;
  const anchor = t.date as DateKey;
  if (t.repeat === 'none') return anchor === day;
  if (diffDays(day, anchor) < 0) return false;
  if (t.skipOn.includes(day)) return false;
  switch (t.repeat) {
    case 'daily':
      return true;
    case 'weekdays': {
      const w = weekday(day);
      return w >= 1 && w <= 5;
    }
    case 'weekly':
      return weekday(day) === weekday(anchor);
  }
}

export function isDoneOn(t: Task, day: DateKey): boolean {
  return t.repeat === 'none' ? t.done : t.doneOn.includes(day);
}

/** A concrete block on a given day. */
export interface Occurrence {
  task: Task;
  date: DateKey;
  start: number;
  end: number;
  done: boolean;
}

export function occurrencesOn(tasks: Task[], day: DateKey): Occurrence[] {
  return tasks
    .filter((t) => occursOn(t, day))
    .map((t) => ({
      task: t,
      date: day,
      start: t.start as number,
      end: Math.min((t.start as number) + t.duration, 24 * 60),
      done: isDoneOn(t, day),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.task.createdAt - b.task.createdAt);
}

export function inboxTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !isScheduled(t) && !t.done)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
        a.createdAt - b.createdAt,
    );
}

/** One-off blocks from earlier days that were never completed. */
export function missedTasks(tasks: Task[], today: DateKey): Task[] {
  return tasks
    .filter((t) => t.repeat === 'none' && isScheduled(t) && !t.done && diffDays(t.date as DateKey, today) < 0)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string) || (a.start as number) - (b.start as number));
}
