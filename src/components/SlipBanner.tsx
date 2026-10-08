import { useMemo, useState } from 'react';
import { usePlanner } from '../state';
import { usePro } from '../pro/ProProvider';
import { useCalendar } from '../calendar';
import { replanSlipped, slippedTasks } from '../lib/replan';
import { addDays, formatTime, minutesNow } from '../lib/time';
import { Icon } from './Icon';

/** "You're running behind" — offers to move slipped blocks into the rest of today. */
export function SlipBanner() {
  const { data, today, selected, now, dispatch, toast, undo } = usePlanner();
  const { isPro, require } = usePro();
  const { eventsOn } = useCalendar();
  const [dismissed, setDismissed] = useState<string>('');
  const nowMin = minutesNow(now);
  const slipped = useMemo(() => (selected === today ? slippedTasks(data.tasks, today, nowMin) : []), [data.tasks, today, selected, nowMin]);
  const key = slipped.map((t) => t.id).join(',');
  if (!slipped.length || dismissed === key) return null;

  const replan = () => {
    if (!require('autoplan')) return;
    const { placed, overflow } = replanSlipped(data.tasks, eventsOn(today), today, nowMin, data.settings.dayEnd);
    if (placed.length) dispatch({ type: 'scheduleMany', items: placed.map((p) => ({ ...p, date: today })) });
    for (const id of overflow) dispatch({ type: 'update', id, patch: { date: null, start: null, due: addDays(today, 1) } });
    const first = placed[0];
    const parts = [
      placed.length ? `${placed.length} moved${first ? ` (next at ${formatTime(first.start, data.settings.use24h)})` : ''}` : '',
      overflow.length ? `${overflow.length} to tomorrow’s inbox` : '',
    ].filter(Boolean);
    toast(`Re-planned · ${parts.join(' · ')}`, { action: { label: 'Undo', run: undo } });
  };

  return (
    <div className="slip" role="status" data-testid="slip-banner">
      <Icon name="clock" size={16} />
      <span className="slip-text">
        <strong>{slipped.length === 1 ? `“${slipped[0].title}” slipped.` : `${slipped.length} blocks slipped.`}</strong> No stress — move {slipped.length === 1 ? 'it' : 'them'} into the rest of today.
      </span>
      <button type="button" className="btn btn--sm slip-btn" onClick={replan} data-testid="slip-replan">
        <Icon name="sparkle" size={14} /> Re-plan {!isPro && <span className="pro-chip">Pro</span>}
      </button>
      <button type="button" className="icon-btn" onClick={() => setDismissed(key)} aria-label="Dismiss">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
