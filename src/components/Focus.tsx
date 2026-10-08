import { useEffect, useMemo, useState } from 'react';
import { usePlanner } from '../state';
import { occurrencesOn } from '../lib/model';
import { formatDuration, formatTime, minutesNow } from '../lib/time';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

/** One thing at a time: the current block, a countdown ring, and what's next. Always about today. */
export function Focus() {
  const { panel, setPanel } = usePlanner();
  return (
    <Dialog open={panel === 'focus'} onClose={() => setPanel(null)} label="Focus mode" className="focus">
      <FocusBody />
    </Dialog>
  );
}

function useSecondTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const R = 92;
const C = 2 * Math.PI * R;

function FocusBody() {
  const { data, today, dispatch, setPanel, toast } = usePlanner();
  const now = useSecondTick();
  const nowMin = minutesNow(now);
  const { use24h } = data.settings;
  const occs = useMemo(() => occurrencesOn(data.tasks, today), [data.tasks, today]);
  const current = occs.find((o) => !o.done && o.start <= nowMin && o.end > nowMin) ?? null;
  const next = occs.find((o) => !o.done && o.start > nowMin && o.task.id !== current?.task.id) ?? null;

  const remainingSec = current ? Math.max(0, Math.round((current.end - nowMin) * 60)) : next ? Math.max(0, Math.round((next.start - nowMin) * 60)) : 0;
  const total = current ? (current.end - current.start) * 60 : 1;
  const frac = current ? 1 - remainingSec / total : 0;
  const mm = Math.floor(remainingSec / 60);
  const ss = remainingSec % 60;
  const hh = Math.floor(mm / 60);
  const clock = hh > 0 ? `${hh}:${String(mm % 60).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;

  useEffect(() => {
    const prev = document.title;
    document.title = current ? `${clock} · ${current.task.title}` : 'Focus · Day Planner';
    return () => {
      document.title = prev;
    };
  }, [clock, current]);

  return (
    <div className="focus-body" data-cat={current?.task.category ?? 'work'}>
      <button type="button" className="icon-btn focus-close" onClick={() => setPanel(null)} aria-label="Exit focus mode">
        <Icon name="x" />
      </button>
      <p className="focus-kicker">{current ? 'Now' : next ? 'Up next' : 'All clear'}</p>
      <h2 className="focus-title">{current ? current.task.title : next ? next.task.title : 'Nothing left on today’s timeline.'}</h2>
      {(current || next) && (
        <div className="focus-ring" role="timer" aria-label={current ? `${clock} remaining` : `Starts in ${clock}`}>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r={R} className="focus-ring-track" />
            {current && <circle cx="100" cy="100" r={R} className="focus-ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />}
          </svg>
          <div className="focus-ring-label">
            <span className="focus-clock">{clock}</span>
            <span className="focus-sub">{current ? `until ${formatTime(current.end, use24h)}` : `starts ${formatTime(next!.start, use24h)}`}</span>
          </div>
        </div>
      )}
      {current && current.task.steps.length > 0 && (
        <ol className="focus-steps" aria-label="Steps">
          {current.task.steps.map((st) => {
            const done = (current.task.stepsDone[today] ?? []).includes(st.id);
            const isNext = !done && current.task.steps.find((x) => !(current.task.stepsDone[today] ?? []).includes(x.id))?.id === st.id;
            return (
              <li key={st.id}>
                <button type="button" className={`focus-step${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`} aria-pressed={done} onClick={() => dispatch({ type: 'toggleStep', id: current.task.id, date: today, stepId: st.id })}>
                  <span className="focus-step-check" aria-hidden="true">
                    <Icon name="check" size={13} />
                  </span>
                  {st.text}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {current?.task.notes && <p className="focus-notes">{current.task.notes}</p>}
      {current && (
        <div className="focus-actions">
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => {
              dispatch({ type: 'toggleDone', id: current.task.id, date: today });
              toast(`Nice — “${current.task.title}” done.`);
            }}
          >
            <Icon name="check" size={18} /> Done
          </button>
          <button
            type="button"
            className="btn btn--quiet btn--lg"
            onClick={() => dispatch({ type: 'schedule', id: current.task.id, date: today, start: current.start, duration: current.task.duration + 15 })}
          >
            +15 min
          </button>
        </div>
      )}
      {current && next && (
        <p className="focus-next">
          Then <strong>{next.task.title}</strong> at {formatTime(next.start, use24h)} · {formatDuration(next.end - next.start)}
        </p>
      )}
    </div>
  );
}
