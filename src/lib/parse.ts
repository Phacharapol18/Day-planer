import { type DateKey, addDays, toKey, fromKey, weekday, diffDays } from './time';
import { type CategoryId, type Priority, type Repeat, categoryFromTag } from './model';

export interface ParsedChip {
  kind: 'date' | 'time' | 'duration' | 'priority' | 'category' | 'repeat';
  label: string;
}

export interface ParsedInput {
  title: string;
  date: DateKey | null;
  start: number | null;
  duration: number | null;
  priority: Priority;
  category: CategoryId | null;
  repeat: Repeat;
  chips: ParsedChip[];
}

const B = '(?<![\\w:!#])'; // token start
const E = '(?![\\w:])'; // token end

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};
const DAY_ALT = Object.keys(DAY_WORDS).sort((a, b) => b.length - a.length).join('|');
const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

function nextWeekday(today: DateKey, target: number, forceNextWeek: boolean): DateKey {
  let delta = (target - weekday(today) + 7) % 7;
  if (forceNextWeek && delta === 0) delta = 7;
  return addDays(today, delta);
}

/** Convert an hour/minute/suffix triple into minutes from midnight; null if invalid. */
function toMinutes(h: number, m: number, suffix: string | undefined, guessPm: boolean): number | null {
  if (m > 59) return null;
  if (suffix) {
    if (h < 1 || h > 12) return null;
    const s = suffix.toLowerCase();
    if (s.startsWith('a')) h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else {
    if (h > 23) return null;
    // Bare 1–6 almost always means afternoon in a day planner ("call mom at 4").
    if (guessPm && h >= 1 && h <= 6) h += 12;
  }
  return h * 60 + m;
}

export function parseQuickAdd(raw: string, today: DateKey): ParsedInput {
  let text = ` ${raw} `;
  const chips: ParsedChip[] = [];
  let date: DateKey | null = null;
  let start: number | null = null;
  let duration: number | null = null;
  let priority: Priority = 0;
  let category: CategoryId | null = null;
  let repeat: Repeat = 'none';

  const take = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void) => {
    const m = re.exec(text);
    if (!m) return;
    if (fn(m) === false) return;
    text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
  };

  // Repeat ("every monday" also pins the weekday).
  take(new RegExp(`${B}every\\s+(${DAY_ALT})${E}`, 'i'), (m) => {
    repeat = 'weekly';
    date = nextWeekday(today, DAY_WORDS[m[1].toLowerCase()], false);
  });
  take(new RegExp(`${B}(every\\s*day|daily)${E}`, 'i'), () => void (repeat = 'daily'));
  take(new RegExp(`${B}(every\\s+weekday|weekdays)${E}`, 'i'), () => void (repeat = 'weekdays'));
  take(new RegExp(`${B}(every\\s+week|weekly)${E}`, 'i'), () => void (repeat = 'weekly'));

  // Priority.
  take(new RegExp(`${B}(!{1,3}|!high|!med(?:ium)?|!low|p[123])${E}`, 'i'), (m) => {
    const t = m[1].toLowerCase();
    priority = (
      t === '!!!' || t === '!high' || t === 'p1' ? 3 : t === '!!' || t.startsWith('!med') || t === 'p2' ? 2 : 1
    ) as Priority;
  });

  // Category tag; unknown tags stay in the title so nothing the user typed silently disappears.
  take(/(?<![\w])#([\p{L}\d_-]+)/u, (m) => {
    const c = categoryFromTag(m[1]);
    if (!c) return false;
    category = c;
  });

  // Time range: "3-4pm", "9:30–11", "14:00 to 15:30".
  take(
    new RegExp(
      `${B}(?:at\\s+|from\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a|p)?\\s*(?:-|–|—|to|until)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a|p)?${E}`,
      'i',
    ),
    (m) => {
      const [, h1, m1, s1, h2, m2, s2] = m;
      if (!s1 && !s2 && !m1 && !m2) return false; // "3-4 apples" is not a time
      let sfx1 = s1;
      if (!s1 && s2) {
        // "11-1pm" → 11am; "3-4pm" → 3pm.
        const asSame = toMinutes(+h1, +(m1 ?? 0), s2, false);
        const end = toMinutes(+h2, +(m2 ?? 0), s2, false);
        sfx1 = asSame !== null && end !== null && asSame < end ? s2 : s2.toLowerCase().startsWith('p') ? 'am' : 'pm';
      }
      const a = toMinutes(+h1, +(m1 ?? 0), sfx1, !sfx1);
      let b = toMinutes(+h2, +(m2 ?? 0), s2, false);
      if (a === null || b === null) return false;
      if (!s2 && b <= a && b + 720 > a) b += 720; // "9:30-1" → 13:00
      if (b <= a) return false;
      start = a;
      duration = b - a;
    },
  );

  // Single time: "at 3", "3pm", "15:30", "noon".
  if (start === null) {
    take(new RegExp(`${B}(?:at\\s+)?(noon|midday|midnight)${E}`, 'i'), (m) => {
      start = m[1].toLowerCase() === 'midnight' ? 0 : 720;
    });
  }
  if (start === null) {
    take(new RegExp(`${B}(at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a|p)?${E}`, 'i'), (m) => {
      const [, at, h, mm, sfx] = m;
      if (!at && !mm && !sfx) return false; // a bare number is just part of the title
      const v = toMinutes(+h, +(mm ?? 0), sfx, !sfx && !/^0/.test(h));
      if (v === null) return false;
      start = v;
    });
  }

  // Duration: "45m", "1h", "1.5h", "1h30", "for 2 hours", "90 min".
  if (duration === null) {
    take(
      new RegExp(`${B}(?:for\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:h|hr|hrs|hour|hours)\\s*(?:(\\d{1,2})\\s*(?:m|min|mins|minutes)?)?${E}`, 'i'),
      (m) => {
        const v = Math.round(parseFloat(m[1]) * 60 + (m[2] ? +m[2] : 0));
        if (v <= 0 || v > 24 * 60) return false;
        duration = v;
      },
    );
  }
  if (duration === null) {
    take(new RegExp(`${B}(?:for\\s+)?(\\d{1,3})\\s*(?:m|min|mins|minute|minutes)${E}`, 'i'), (m) => {
      const v = +m[1];
      if (v <= 0) return false;
      duration = v;
    });
  }

  // Dates.
  if (date === null) {
    take(new RegExp(`${B}(?:on\\s+|by\\s+)?(today|tonight|tomorrow|tmrw|tmr|tom)${E}`, 'i'), (m) => {
      date = /^to(day|night)$/i.test(m[1]) ? today : addDays(today, 1);
    });
  }
  if (date === null) {
    take(new RegExp(`${B}in\\s+(\\d{1,3})\\s+(day|days|week|weeks)${E}`, 'i'), (m) => {
      date = addDays(today, +m[1] * (m[2].toLowerCase().startsWith('w') ? 7 : 1));
    });
  }
  if (date === null) {
    take(new RegExp(`${B}(?:on\\s+|by\\s+)?(next\\s+)?(${DAY_ALT})${E}`, 'i'), (m) => {
      date = nextWeekday(today, DAY_WORDS[m[2].toLowerCase()], !!m[1]);
    });
  }
  if (date === null) {
    take(new RegExp(`${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`), (m) => {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (d.getMonth() !== +m[2] - 1) return false;
      date = toKey(d);
    });
  }
  if (date === null) {
    const monthDayRe = new RegExp(`${B}(?:on\\s+|by\\s+)?(?:(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT}))${E}`, 'i');
    take(monthDayRe, (m) => {
      const month = MONTHS[(m[1] ?? m[4]).toLowerCase()];
      const day = +(m[2] ?? m[3]);
      const y = fromKey(today).getFullYear();
      let d = new Date(y, month, day);
      if (d.getMonth() !== month) return false;
      if (diffDays(toKey(d), today) < 0) d = new Date(y + 1, month, day);
      date = toKey(d);
    });
  }

  const title = text.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();

  if (start !== null && date === null) date = today;

  if (date) chips.push({ kind: 'date', label: date });
  if (start !== null) chips.push({ kind: 'time', label: String(start) });
  if (duration !== null) chips.push({ kind: 'duration', label: String(duration) });
  if (priority) chips.push({ kind: 'priority', label: String(priority) });
  if (category) chips.push({ kind: 'category', label: category });
  if (repeat !== 'none') chips.push({ kind: 'repeat', label: repeat });

  return { title, date, start, duration, priority, category, repeat, chips };
}
