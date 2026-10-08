import { useCallback } from 'react';
import { usePlanner } from './state';
import { type Task, makeTask, occurrencesOn, inboxTasks } from './lib/model';
import { findSlot, autoPlan } from './lib/layout';
import { parseQuickAdd } from './lib/parse';
import { type DateKey, diffDays, formatTime, minutesNow, relativeDayName, monthDay, MINUTES_PER_DAY } from './lib/time';

/** Higher-level planning operations shared by the inbox, quick add and shortcuts. */
export function usePlanActions() {
  const { data, dispatch, selected, today, now, toast, undo } = usePlanner();
  const { dayStart, dayEnd, use24h } = data.settings;

  const earliestOn = useCallback(
    (day: DateKey) => (day === today ? Math.max(dayStart, Math.ceil(minutesNow(now))) : dayStart),
    [today, dayStart, now],
  );

  const dayLabel = useCallback(
    (day: DateKey) => (Math.abs(diffDays(day, today)) <= 1 ? relativeDayName(day, today).toLowerCase() : monthDay(day)),
    [today],
  );

  /** Drop a task into the first open slot on the selected day (or the next day if today is full). */
  const scheduleNext = useCallback(
    (task: Task) => {
      const day = diffDays(selected, today) < 0 ? today : selected;
      const busy = occurrencesOn(data.tasks, day).filter((o) => o.task.id !== task.id);
      let start = findSlot(busy, task.duration, earliestOn(day), dayEnd);
      if (start === null) start = findSlot(busy, task.duration, earliestOn(day), MINUTES_PER_DAY);
      if (start === null) {
        toast(`No free ${task.duration}-minute slot left ${dayLabel(day)}.`, { tone: 'error' });
        return;
      }
      dispatch({ type: 'schedule', id: task.id, date: day, start });
      toast(`Scheduled “${task.title}” ${dayLabel(day)} at ${formatTime(start, use24h)}`, { action: { label: 'Undo', run: undo } });
    },
    [data.tasks, selected, today, earliestOn, dayEnd, dispatch, toast, undo, use24h, dayLabel],
  );

  /** Fill free time on the selected day with inbox tasks, highest priority first. */
  const autoPlanDay = useCallback(() => {
    const day = diffDays(selected, today) < 0 ? today : selected;
    const queue = inboxTasks(data.tasks);
    if (!queue.length) {
      toast('Inbox is empty — nothing to plan.');
      return;
    }
    const busy = occurrencesOn(data.tasks, day);
    const { placed, unplaced } = autoPlan(
      queue.map((t) => ({ id: t.id, duration: t.duration })),
      busy,
      earliestOn(day),
      dayEnd,
    );
    if (!placed.length) {
      toast(`No room left ${dayLabel(day)} before ${formatTime(dayEnd, use24h)}.`, { tone: 'error' });
      return;
    }
    dispatch({ type: 'scheduleMany', items: placed.map((p) => ({ ...p, date: day })) });
    const rest = unplaced.length ? ` · ${unplaced.length} didn’t fit` : '';
    toast(`Planned ${placed.length} task${placed.length === 1 ? '' : 's'} ${dayLabel(day)}${rest}`, { action: { label: 'Undo', run: undo } });
  }, [data.tasks, selected, today, earliestOn, dayEnd, dispatch, toast, undo, use24h, dayLabel]);

  /** Natural-language add. Returns the created task, or null when the title is empty. */
  const addFromText = useCallback(
    (text: string, defaults: Partial<Task> = {}): Task | null => {
      const p = parseQuickAdd(text, today);
      if (!p.title) return null;
      const scheduled = p.start !== null;
      const task = makeTask({
        ...defaults,
        title: p.title,
        priority: p.priority,
        category: p.category ?? defaults.category ?? 'work',
        duration: p.duration ?? defaults.duration ?? (scheduled ? 60 : 30),
        repeat: scheduled ? p.repeat : 'none',
        date: scheduled ? p.date : null,
        start: scheduled ? p.start : null,
        due: scheduled ? null : p.date,
      });
      dispatch({ type: 'add', task });
      return task;
    },
    [today, dispatch],
  );

  return { scheduleNext, autoPlanDay, addFromText, dayLabel };
}
