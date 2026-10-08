import type { Task } from './model';
import { isScheduled } from './model';

const pad = (n: number) => String(n).padStart(2, '0');

function stamp(dateKey: string, minutes: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 0, minutes);
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

/** RFC 5545 text escaping + 75-octet line folding. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
}

const RRULE: Record<string, string> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
};

/** Floating local times, so Calendar apps show blocks at the same wall-clock time as the planner. */
export function toICS(tasks: Task[]): string {
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Day Planner//EN', 'CALSCALE:GREGORIAN'];
  for (const t of tasks.filter(isScheduled)) {
    const date = t.date as string;
    const start = t.start as number;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${t.id}@day-planner`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${stamp(date, start)}`);
    lines.push(`DTEND:${stamp(date, start + t.duration)}`);
    lines.push(fold(`SUMMARY:${esc(t.title)}`));
    if (t.notes) lines.push(fold(`DESCRIPTION:${esc(t.notes)}`));
    if (t.repeat !== 'none') lines.push(`RRULE:${RRULE[t.repeat]}`);
    for (const d of t.skipOn) lines.push(`EXDATE:${stamp(d, start)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
