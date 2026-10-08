// Dates are stored as local calendar keys ("YYYY-MM-DD") and times as minutes from midnight.
// This keeps the model free of timezone drift: a block at 09:00 stays at 09:00 wherever you open it.

export type DateKey = string;

export const MINUTES_PER_DAY = 24 * 60;
export const SNAP = 15;

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(now = new Date()): DateKey {
  return toKey(now);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 86_400_000);
}

export function weekday(key: DateKey): number {
  return fromKey(key).getDay();
}

export function minutesNow(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function snap(min: number, step = SNAP): number {
  return Math.round(min / step) * step;
}

export function formatTime(min: number, use24h: boolean): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  if (use24h) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`;
}

export function formatHourLabel(h: number, use24h: boolean): string {
  if (use24h) return pad(h);
  if (h === 0 || h === 24) return '12 am';
  if (h === 12) return 'noon';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

export function formatDuration(min: number): string {
  const total = Math.round(min);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function timeToInput(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function inputToTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < MINUTES_PER_DAY ? v : null;
}

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = MONTH_LONG.map((m) => m.slice(0, 3));

export function weekdayName(key: DateKey, short = false): string {
  return (short ? WEEKDAY_SHORT : WEEKDAY_LONG)[weekday(key)];
}

export function monthDay(key: DateKey, short = true): string {
  const d = fromKey(key);
  return `${(short ? MONTH_SHORT : MONTH_LONG)[d.getMonth()]} ${d.getDate()}`;
}

/** "Today", "Tomorrow", "Yesterday" or the weekday name. */
export function relativeDayName(key: DateKey, today: DateKey): string {
  const diff = diffDays(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return weekdayName(key);
}

export function shortDueLabel(key: DateKey, today: DateKey): string {
  const diff = diffDays(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tmrw';
  if (diff < 0) return `${monthDay(key)} · late`;
  if (diff < 7) return weekdayName(key, true);
  return monthDay(key);
}

export const DAY_NAMES_SHORT = WEEKDAY_SHORT;
export const MONTH_NAMES_SHORT = MONTH_SHORT;
