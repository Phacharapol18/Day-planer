import { useMemo, useState } from 'react';
import { usePlanner } from '../state';
import { usePro } from '../pro/ProProvider';
import { useCalendar } from '../calendar';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { type Task, type DayEntry, inboxTasks, missedTasks, occurrencesOn, makeTask } from '../lib/model';
import { autoPlan, mergeBusy } from '../lib/layout';
import { streak } from '../lib/journal';
import { addDays, formatDuration, formatTime, minutesNow } from '../lib/time';
import { haptic } from '../native/bridge';

/** Morning "Plan my day" and evening "Shut down" — short, guided, and they build a streak. */
export function Ritual() {
  const { panel, setPanel } = usePlanner();
  const open = panel === 'plan' || panel === 'shutdown';
  return (
    <Dialog open={open} onClose={() => setPanel(null)} label={panel === 'shutdown' ? 'Shut down your day' : 'Plan your day'} className="ritual">
      {panel === 'plan' && <PlanFlow />}
      {panel === 'shutdown' && <ShutdownFlow />}
    </Dialog>
  );
}

function Steps({ n, of }: { n: number; of: number }) {
  return (
    <div className="rt-steps" aria-label={`Step ${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? 'is-on' : ''} />
      ))}
    </div>
  );
}

function greeting(h: number) {
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ───────────── Morning ─────────────

function PlanFlow() {
  const { data, today, now, dispatch, setPanel, toast, setSelected } = usePlanner();
  const { isPro, openPaywall } = usePro();
  const { eventsOn } = useCalendar();
  const { dayStart, dayEnd, use24h } = data.settings;
  const missed = useMemo(() => missedTasks(data.tasks, today), [data.tasks, today]);
  const inbox = useMemo(() => inboxTasks(data.tasks), [data.tasks]);
  const [step, setStep] = useState(missed.length ? 0 : 1);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(inbox.filter((t) => t.due && t.due <= today).map((t) => t.id)));
  const [highlight, setHighlight] = useState<string | undefined>(data.journal[today]?.highlight);

  const nowMin = minutesNow(now);
  const from = Math.max(dayStart, Math.ceil(nowMin / 15) * 15);
  const busy = [...occurrencesOn(data.tasks, today), ...eventsOn(today)];
  const busyLeft = mergeBusy(busy).reduce((s, b) => s + Math.max(0, Math.min(b.end, dayEnd) - Math.max(b.start, from)), 0);
  const available = Math.max(0, dayEnd - from - busyLeft);
  const pickedTasks = inbox.filter((t) => picked.has(t.id));
  const pickedMin = pickedTasks.reduce((s, t) => s + t.duration, 0);
  const over = pickedMin > available;

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const carry = (t: Task, to: 'inbox' | 'done' | 'drop') => {
    if (to === 'inbox') dispatch({ type: 'unschedule', id: t.id });
    else if (to === 'done') dispatch({ type: 'setDone', id: t.id, date: t.date as string, done: true });
    else dispatch({ type: 'delete', id: t.id });
  };

  const commitPicks = () => {
    if (!pickedTasks.length) return;
    if (isPro) {
      const { placed, unplaced } = autoPlan(pickedTasks.map((t) => ({ id: t.id, duration: t.duration })), busy, from, dayEnd);
      if (placed.length) dispatch({ type: 'scheduleMany', items: placed.map((p) => ({ ...p, date: today })) });
      for (const id of unplaced) dispatch({ type: 'update', id, patch: { due: today } });
    } else {
      // Free: mark them for today; they wait at the top of the inbox to be dragged in.
      for (const t of pickedTasks) dispatch({ type: 'update', id: t.id, patch: { due: today } });
    }
  };

  const todaysBlocks = occurrencesOn(data.tasks, today).filter((o) => !o.done);
  const highlightOptions: Task[] = [...todaysBlocks.map((o) => o.task), ...pickedTasks.filter((t) => !todaysBlocks.some((o) => o.task.id === t.id))];

  const finish = () => {
    const patch: Partial<DayEntry> = { planned: Date.now() };
    if (highlight) patch.highlight = highlight;
    dispatch({ type: 'journal', date: today, patch });
    haptic.done();
    const s = streak({ ...data.journal, [today]: { ...data.journal[today], ...patch } }, today);
    toast(s > 1 ? `Day planned · ${s}-day streak` : 'Day planned. Have a good one.');
    setSelected(today);
    setPanel(null);
  };

  return (
    <div className="rt" data-testid="ritual-plan">
      <div className="rt-head">
        <p className="rt-kicker">{greeting(now.getHours())}</p>
        <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <Steps n={step + 1} of={3} />

      {step === 0 && (
        <>
          <h2 className="rt-title">Yesterday’s loose ends</h2>
          <p className="rt-sub">Decide once, then let them go.</p>
          <ul className="rt-list">
            {missed.map((t) => (
              <li key={t.id} className="rt-row" data-cat={t.category}>
                <span className="rt-dot" aria-hidden="true" />
                <span className="rt-row-title">{t.title}</span>
                <span className="rt-actions">
                  <button type="button" className="chip-btn" onClick={() => carry(t, 'inbox')}>Keep</button>
                  <button type="button" className="chip-btn" onClick={() => carry(t, 'done')}>Done</button>
                  <button type="button" className="chip-btn" onClick={() => carry(t, 'drop')} aria-label={`Drop ${t.title}`}>
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </li>
            ))}
            {missed.length === 0 && <li className="rt-empty">All clear. Nothing left over.</li>}
          </ul>
          <div className="rt-foot">
            <span />
            <button type="button" className="btn btn--primary" onClick={() => setStep(1)}>
              Next <Icon name="right" size={16} />
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="rt-title">What matters today?</h2>
          <p className="rt-sub">Pick from your inbox. Be honest about the time you have.</p>
          <div className={`rt-meter${over ? ' is-over' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={available} aria-valuenow={pickedMin} aria-label="Planned against available time">
            <span style={{ transform: `scaleX(${available ? Math.min(1, pickedMin / available) : pickedMin ? 1 : 0})` }} />
          </div>
          <p className="rt-meter-text">
            <strong>{formatDuration(pickedMin)}</strong> picked of <strong>{formatDuration(available)}</strong> free
            {over && <em> · that’s more than you have</em>}
          </p>
          <ul className="rt-list">
            {inbox.map((t) => (
              <li key={t.id}>
                <label className="rt-pick" data-cat={t.category}>
                  <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
                  <span className="rt-dot" aria-hidden="true" />
                  <span className="rt-row-title">{t.title}</span>
                  <span className="rt-row-meta">{formatDuration(t.duration)}</span>
                </label>
              </li>
            ))}
            {inbox.length === 0 && <li className="rt-empty">Your inbox is empty. Add tasks any time with + or share them from other apps.</li>}
          </ul>
          {!isPro && pickedTasks.length > 0 && (
            <p className="rt-hint">
              Picked tasks wait at the top of your inbox, ready to drag in.{' '}
              <button type="button" className="link" onClick={() => openPaywall('autoplan')}>
                Let Auto-plan place them
              </button>{' '}
              <span className="pro-chip">Pro</span>
            </p>
          )}
          <div className="rt-foot">
            <button type="button" className="btn btn--quiet" onClick={() => setStep(missed.length ? 0 : 1)} disabled={!missed.length}>
              Back
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                commitPicks();
                setStep(2);
              }}
            >
              {isPro && pickedTasks.length ? 'Fit them into my day' : 'Next'} <Icon name="right" size={16} />
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="rt-title">Your one thing</h2>
          <p className="rt-sub">If only one thing gets done today, which would make it a win?</p>
          <ul className="rt-list" role="radiogroup" aria-label="Today’s highlight">
            {highlightOptions.map((t) => {
              const occ = todaysBlocks.find((o) => o.task.id === t.id);
              return (
                <li key={t.id}>
                  <button type="button" role="radio" aria-checked={highlight === t.id} className={`rt-pick rt-pick--radio${highlight === t.id ? ' is-on' : ''}`} data-cat={t.category} onClick={() => setHighlight(t.id)}>
                    <Icon name="flag" size={15} />
                    <span className="rt-row-title">{t.title}</span>
                    <span className="rt-row-meta">{occ ? formatTime(occ.start, use24h) : 'inbox'}</span>
                  </button>
                </li>
              );
            })}
            {highlightOptions.length === 0 && <li className="rt-empty">Nothing on today yet — you can set a highlight later from any block.</li>}
          </ul>
          <div className="rt-foot">
            <button type="button" className="btn btn--quiet" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="btn btn--primary" onClick={finish} data-testid="ritual-finish">
              <Icon name="check" size={16} /> Start the day
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────── Evening ─────────────

const MOODS: { v: DayEntry['mood']; label: string }[] = [
  { v: 1, label: 'Rough' },
  { v: 2, label: 'Meh' },
  { v: 3, label: 'Okay' },
  { v: 4, label: 'Good' },
  { v: 5, label: 'Great' },
];

function ShutdownFlow() {
  const { data, today, now, dispatch, setPanel, toast } = usePlanner();
  const { use24h } = data.settings;
  const [step, setStep] = useState(0);
  const entry = data.journal[today] ?? {};
  const [mood, setMood] = useState<DayEntry['mood']>(entry.mood);
  const [note, setNote] = useState(entry.note ?? '');
  const [carryNote, setCarryNote] = useState(false);
  const occ = occurrencesOn(data.tasks, today);
  const done = occ.filter((o) => o.done);
  const nowMin = minutesNow(now);
  const open = occ.filter((o) => !o.done && o.task.repeat === 'none' && o.start < Math.max(nowMin, 0) + 24 * 60);
  const highlight = entry.highlight ? data.tasks.find((t) => t.id === entry.highlight) : undefined;
  const highlightDone = highlight ? occ.some((o) => o.task.id === highlight.id && o.done) || (highlight.repeat === 'none' && highlight.done) : false;
  const tomorrow = addDays(today, 1);

  const finish = () => {
    dispatch({ type: 'journal', date: today, patch: { shutdown: Date.now(), mood, note: note.trim() || undefined } });
    if (carryNote && note.trim()) {
      dispatch({ type: 'add', task: makeTask({ title: note.trim().slice(0, 200), due: tomorrow, priority: 2 }) });
    }
    haptic.done();
    const s = streak({ ...data.journal, [today]: { ...entry, shutdown: Date.now() } }, today);
    toast(s > 1 ? `Day closed · ${s}-day streak. Rest well.` : 'Day closed. Rest well.');
    setPanel(null);
  };

  return (
    <div className="rt" data-testid="ritual-shutdown">
      <div className="rt-head">
        <p className="rt-kicker">Shut down</p>
        <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <Steps n={step + 1} of={2} />

      {step === 0 && (
        <>
          <h2 className="rt-title">{done.length ? `${done.length} done today.` : 'Today’s done.'}</h2>
          {highlight && (
            <p className={`rt-highlight${highlightDone ? ' is-done' : ''}`}>
              <Icon name={highlightDone ? 'check' : 'flag'} size={15} /> Highlight: <strong>{highlight.title}</strong> {highlightDone ? '— nailed it.' : '— not this time.'}
            </p>
          )}
          {open.length > 0 ? (
            <>
              <p className="rt-sub">Still open. Move them so tomorrow starts clean.</p>
              <ul className="rt-list">
                {open.map((o) => (
                  <li key={o.task.id} className="rt-row" data-cat={o.task.category}>
                    <span className="rt-dot" aria-hidden="true" />
                    <span className="rt-row-title">
                      {o.task.title} <small>{formatTime(o.start, use24h)}</small>
                    </span>
                    <span className="rt-actions">
                      <button type="button" className="chip-btn" onClick={() => dispatch({ type: 'schedule', id: o.task.id, date: tomorrow, start: o.start })}>
                        Tomorrow
                      </button>
                      <button type="button" className="chip-btn" onClick={() => dispatch({ type: 'unschedule', id: o.task.id })}>
                        Inbox
                      </button>
                      <button type="button" className="chip-btn" onClick={() => dispatch({ type: 'setDone', id: o.task.id, date: today, done: true })}>
                        Done
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="rt-sub">Nothing left hanging. That’s a clean finish.</p>
          )}
          <div className="rt-foot">
            <span />
            <button type="button" className="btn btn--primary" onClick={() => setStep(1)}>
              Next <Icon name="right" size={16} />
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="rt-title">How was today?</h2>
          <div className="rt-moods" role="radiogroup" aria-label="How was today">
            {MOODS.map((m) => (
              <button type="button" key={m.v} role="radio" aria-checked={mood === m.v} className={`rt-mood${mood === m.v ? ' is-on' : ''}`} data-mood={m.v} onClick={() => setMood(m.v)}>
                <span className="rt-mood-dot" aria-hidden="true" />
                {m.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Tomorrow’s first thing (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write it down so your brain can let go." />
          </label>
          {note.trim() && (
            <label className="toggle-inline">
              <input type="checkbox" checked={carryNote} onChange={(e) => setCarryNote(e.target.checked)} /> Add it to my inbox for tomorrow
            </label>
          )}
          <div className="rt-foot">
            <button type="button" className="btn btn--quiet" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className="btn btn--primary" onClick={finish} data-testid="ritual-finish">
              <Icon name="check" size={16} /> Close the day
            </button>
          </div>
        </>
      )}
    </div>
  );
}
