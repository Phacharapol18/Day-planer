import { type Task, makeTask, newId } from './model';
import { type DateKey, addDays } from './time';

/**
 * A believable sample day around "now" so a new user sees the timeline doing its job:
 * something done, something happening, free time, and an inbox to drag from.
 */
export function exampleDay(today: DateKey, nowMin: number): { tasks: Task[]; highlightId: string } {
  // Late at night, show tomorrow instead of a day that's already over.
  const late = nowMin > 20 * 60;
  const day = late ? addDays(today, 1) : today;
  const anchor = late ? 9 * 60 : Math.max(8 * 60, Math.min(Math.floor(nowMin / 15) * 15, 19 * 60));
  const at = (offset: number) => Math.max(0, Math.min(anchor + offset, 23 * 60));
  const steps = [
    { id: newId(), text: 'Glass of water' },
    { id: newId(), text: 'Stretch for 10 minutes' },
    { id: newId(), text: 'Pick today’s one thing' },
  ];
  const routine = makeTask({ title: 'Morning routine', category: 'health', date: day, start: at(-150), duration: 30, steps, done: !late, stepsDone: late ? {} : { [day]: steps.map((s) => s.id) } });
  const deep = makeTask({ title: 'Deep work — the important thing', category: 'work', date: day, start: at(-30), duration: 90, priority: 3, notes: 'Phone in another room. One tab.' });
  const lunch = makeTask({ title: 'Lunch & a short walk', category: 'personal', date: day, start: at(90), duration: 45 });
  const meeting = makeTask({ title: 'Team check-in', category: 'meeting', date: day, start: at(165), duration: 30 });
  const admin = makeTask({ title: 'Quick wins: email & admin', category: 'errand', date: day, start: at(240), duration: 30 });
  const inbox = [
    makeTask({ title: 'Drag me onto the timeline →', duration: 30, priority: 2 }),
    makeTask({ title: 'Book dentist', duration: 15, category: 'health', due: addDays(today, 2) }),
    makeTask({ title: 'Read 20 pages', duration: 30, category: 'personal' }),
  ];
  return { tasks: [routine, deep, lunch, meeting, admin, ...inbox], highlightId: deep.id };
}
