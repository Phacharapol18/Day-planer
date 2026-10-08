import { useMemo } from 'react';
import { usePlanner } from '../state';
import { occurrencesOn } from '../lib/model';
import { mergeBusy } from '../lib/layout';
import { addDays, diffDays, fromKey, monthDay, weekday, weekdayName, formatDuration, minutesNow, DAY_NAMES_SHORT, relativeDayName } from '../lib/time';
import { Icon } from './Icon';
import { useCalendar } from '../calendar';
import { usePro } from '../pro/ProProvider';
import { streak } from '../lib/journal';

export function Header() {
  const { data, selected, setSelected, today, now, setPanel } = usePlanner();
  const { dayStart, dayEnd } = data.settings;
  const { eventsOn } = useCalendar();
  const { isPro, openPaywall } = usePro();
  const entry = data.journal[today];
  const hour = now.getHours();
  // Offer the ritual that fits the moment: plan in the morning, close the day in the evening.
  const ritual: 'plan' | 'shutdown' | null = selected !== today ? null : hour >= 16 && !entry?.shutdown ? 'shutdown' : hour < 16 && !entry?.planned ? 'plan' : null;
  const currentStreak = useMemo(() => streak(data.journal, today), [data.journal, today]);
  const highlightTask = data.journal[selected]?.highlight ? data.tasks.find((t) => t.id === data.journal[selected]!.highlight) : undefined;

  // Week starts on Monday.
  const weekStart = addDays(selected, -((weekday(selected) + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const windowLen = dayEnd - dayStart;

  const load = useMemo(
    () =>
      days.map((d) => {
        const occ = occurrencesOn(data.tasks, d);
        const busy = mergeBusy([...occ, ...eventsOn(d)]).reduce((s, b) => s + (Math.min(b.end, dayEnd) - Math.max(b.start, dayStart) > 0 ? Math.min(b.end, dayEnd) - Math.max(b.start, dayStart) : 0), 0);
        return { day: d, count: occ.length, done: occ.filter((o) => o.done).length, ratio: Math.min(1, busy / windowLen) };
      }),
    [data.tasks, weekStart, dayStart, dayEnd, eventsOn],
  );

  const summary = useMemo(() => {
    const occ = occurrencesOn(data.tasks, selected);
    const planned = mergeBusy(occ).reduce((s, b) => s + (b.end - b.start), 0);
    const doneCount = occ.filter((o) => o.done).length;
    const isToday = selected === today;
    const from = isToday ? Math.max(dayStart, minutesNow(now)) : dayStart;
    const events = eventsOn(selected);
    const remainingBusy = mergeBusy([...occ, ...events]).reduce((s, b) => s + Math.max(0, Math.min(b.end, dayEnd) - Math.max(b.start, from)), 0);
    const free = diffDays(selected, today) < 0 ? 0 : Math.max(0, dayEnd - from - remainingBusy);
    return { total: occ.length, doneCount, planned, free, events: events.length, pct: occ.length ? Math.round((doneCount / occ.length) * 100) : 0 };
  }, [data.tasks, selected, today, now, dayStart, dayEnd, eventsOn]);

  const d = fromKey(selected);
  const rel = relativeDayName(selected, today);
  const showRel = Math.abs(diffDays(selected, today)) <= 1;

  return (
    <header className="masthead">
      <div className="masthead-row">
        <div className="date-title">
          <h1>
            <span className="date-day">{showRel ? rel : weekdayName(selected)}</span>
            <span className="date-sub">
              {showRel ? `${weekdayName(selected)}, ` : ''}
              {monthDay(selected, false)}
              {d.getFullYear() !== fromKey(today).getFullYear() ? `, ${d.getFullYear()}` : ''}
            </span>
          </h1>
        </div>
        <div className="masthead-actions">
          {ritual && (
            <button type="button" className="btn btn--quiet ritual-btn" onClick={() => setPanel(ritual)} data-testid="ritual-cta">
              <Icon name={ritual === 'plan' ? 'sun' : 'check'} size={16} /> {ritual === 'plan' ? 'Plan day' : 'Shut down'}
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => setPanel('quickadd')} aria-keyshortcuts="Control+K Meta+K N">
            <Icon name="plus" size={16} /> <span className="hide-sm">Add</span>
            <kbd className="hide-sm">⌘K</kbd>
          </button>
          <button type="button" className="btn btn--quiet hide-sm" onClick={() => setPanel('focus')} aria-keyshortcuts="F">
            <Icon name="target" size={16} /> Focus
          </button>
          {!isPro && (
            <button type="button" className="btn btn--quiet go-pro" onClick={() => openPaywall()} data-testid="go-pro" aria-label="Go Pro">
              <Icon name="sparkle" size={16} /> <span className="hide-sm">Go Pro</span>
            </button>
          )}
          <button type="button" className="icon-btn hide-sm" onClick={() => setPanel('help')} aria-label="Keyboard shortcuts" title="Shortcuts (?)">
            <Icon name="keyboard" />
          </button>
          <button type="button" className="icon-btn" onClick={() => setPanel('settings')} aria-label="Settings" title="Settings">
            <Icon name="settings" />
          </button>
        </div>
      </div>

      <nav className="week" aria-label="Choose day">
        <button type="button" className="icon-btn" onClick={() => setSelected(addDays(selected, -7))} aria-label="Previous week">
          <Icon name="left" />
        </button>
        <ol className="week-days">
          {load.map(({ day, count, done, ratio }) => {
            const isSel = day === selected;
            const isToday = day === today;
            const past = diffDays(day, today) < 0;
            return (
              <li key={day}>
                <button
                  type="button"
                  className={['day-pill', isSel && 'is-selected', isToday && 'is-today', past && 'is-past'].filter(Boolean).join(' ')}
                  onClick={() => setSelected(day)}
                  aria-current={isSel ? 'date' : undefined}
                  aria-label={`${weekdayName(day)} ${monthDay(day, false)}${isToday ? ', today' : ''}. ${count} block${count === 1 ? '' : 's'}${count ? `, ${done} done` : ''}.`}
                >
                  <span className="day-pill-name">{DAY_NAMES_SHORT[weekday(day)]}</span>
                  <span className="day-pill-num">{fromKey(day).getDate()}</span>
                  <span className="day-pill-load" aria-hidden="true">
                    <span style={{ transform: `scaleX(${ratio})` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="icon-btn" onClick={() => setSelected(addDays(selected, 7))} aria-label="Next week">
          <Icon name="right" />
        </button>
        {selected !== today && (
          <button type="button" className="btn btn--quiet btn--sm today-btn" onClick={() => setSelected(today)} aria-keyshortcuts="T">
            Today
          </button>
        )}
      </nav>

      <div className="summary" aria-live="polite">
        <div className="summary-bar" role="progressbar" aria-label="Blocks completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.pct}>
          <span style={{ transform: `scaleX(${summary.pct / 100})` }} />
        </div>
        <p className="summary-text">
          <strong>
            {summary.doneCount}/{summary.total}
          </strong>{' '}
          done
          <span className="dot-sep" aria-hidden="true" />
          <strong>{formatDuration(summary.planned)}</strong> planned
          {summary.events > 0 && (
            <>
              <span className="dot-sep" aria-hidden="true" />
              <strong>{summary.events}</strong> {summary.events === 1 ? 'event' : 'events'}
            </>
          )}
          {summary.free > 0 && (
            <>
              <span className="dot-sep" aria-hidden="true" />
              <strong>{formatDuration(summary.free)}</strong> free{selected === today ? ' left' : ''}
            </>
          )}
        </p>
        {currentStreak > 0 && (
          <button type="button" className="streak-chip" title="Days in a row you planned or closed your day · open Insights" onClick={() => setPanel('insights')} data-testid="streak">
            <Icon name="flag" size={13} /> {currentStreak}-day streak
          </button>
        )}
      </div>
      {highlightTask && (
        <p className="highlight-line" data-testid="highlight">
          <Icon name="flag" size={14} /> <span>Today’s one thing:</span> <strong>{highlightTask.title}</strong>
        </p>
      )}
    </header>
  );
}
