import { useMemo, useRef, useState } from 'react';
import { usePlanner } from '../state';
import { usePlanActions } from '../actions';
import { parseQuickAdd } from '../lib/parse';
import { CATEGORIES, PRIORITY_LABEL, REPEAT_LABEL, type Priority, type Repeat } from '../lib/model';
import { formatDuration, formatTime, monthDay, relativeDayName, diffDays } from '../lib/time';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { splitBrainDump } from '../lib/brainDump';
import { dictate, voiceAvailable } from '../native/voice';

const EXAMPLES = ['Gym 6pm 45m #health', 'Deep work 9-11:30 !!', 'Dentist fri 3pm', 'Standup 9:30 15m every weekday', 'Call mom tomorrow', 'Taxes by oct 15 2h !!!'];

export function QuickAdd() {
  const { panel, setPanel } = usePlanner();
  return (
    <Dialog open={panel === 'quickadd'} onClose={() => setPanel(null)} label="Quick add" className="quickadd">
      <QuickAddForm />
    </Dialog>
  );
}

function QuickAddForm() {
  const { setPanel, today, data, toast, undo, setSelected } = usePlanner();
  const { addFromText } = usePlanActions();
  const [text, setText] = useState('');
  const [keepOpen, setKeepOpen] = useState(false);
  const p = useMemo(() => parseQuickAdd(text, today), [text, today]);
  const items = useMemo(() => splitBrainDump(text), [text]);
  const multi = items.length > 1;
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { use24h } = data.settings;
  const scheduled = p.start !== null;

  const dayName = (d: string) => (Math.abs(diffDays(d, today)) <= 1 ? relativeDayName(d, today) : `${relativeDayName(d, today)}, ${monthDay(d)}`);
  // "due tomorrow", but "due Friday, Oct 9"
  const dueName = (d: string) => (Math.abs(diffDays(d, today)) <= 1 ? relativeDayName(d, today).toLowerCase() : dayName(d));

  const listen = async () => {
    setListening(true);
    try {
      const heard = await dictate('Say one or more things. “then” starts a new one.');
      if (heard) setText((t) => (t.trim() ? `${t.trim()}\n${heard}` : heard));
    } catch {
      toast('Voice input isn’t available here.', { tone: 'error' });
    } finally {
      setListening(false);
    }
  };

  const submit = (stay: boolean) => {
    if (multi) {
      const added = items.map((it) => addFromText(it)).filter(Boolean);
      if (!added.length) return;
      const timed = added.filter((t) => t!.start !== null).length;
      toast(`Added ${added.length} tasks${timed ? ` · ${timed} on the timeline` : ''}`, { action: { label: 'Undo', run: () => added.forEach(() => undo()) } });
      setText('');
      if (!stay && !keepOpen) setPanel(null);
      else inputRef.current?.focus();
      return;
    }
    const task = addFromText(text);
    if (!task) return;
    const where = task.start !== null ? `${dayName(task.date!)} at ${formatTime(task.start, use24h)}` : 'Inbox';
    toast(`Added “${task.title}” → ${where}`, {
      action: task.date ? { label: 'View', run: () => setSelected(task.date!) } : { label: 'Undo', run: undo },
    });
    setText('');
    if (!stay && !keepOpen) setPanel(null);
    else inputRef.current?.focus(); // keep the keyboard up for the next one
  };

  return (
    <form
      className="qa"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="qa-input-row">
        <Icon name="plus" size={20} className="qa-icon" />
        <textarea
          ref={inputRef}
          data-autofocus
          rows={1}
          className="qa-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            // Enter adds; Shift+Enter starts another task (brain dump); Ctrl/⌘+Enter adds and stays.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e.metaKey || e.ctrlKey);
            }
          }}
          placeholder="What’s next?"
          aria-label="Describe a task in plain words"
          aria-describedby="qa-preview"
          data-testid="quickadd-input"
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
        />
        {voiceAvailable() && (
          <button type="button" className={`icon-btn qa-mic${listening ? ' is-on' : ''}`} onClick={() => void listen()} aria-label="Speak tasks" aria-pressed={listening} disabled={listening}>
            <Icon name="mic" size={18} />
          </button>
        )}
      </div>

      <div id="qa-preview" className="qa-preview" aria-live="polite">
        {multi ? (
          <div className="qa-multi" data-testid="quickadd-multi">
            <p className="qa-multi-title">{items.length} tasks</p>
            <ul>
              {items.map((it, i) => {
                const q = parseQuickAdd(it, today);
                return (
                  <li key={i}>
                    <span className="qa-multi-name">{q.title || <em>Add a title</em>}</span>
                    <span className="qa-multi-meta">
                      {q.start !== null ? `${dayName(q.date!)} · ${formatTime(q.start, use24h)}` : q.date ? `Inbox · due ${dueName(q.date)}` : 'Inbox'}
                      {q.duration ? ` · ${formatDuration(q.duration)}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : text.trim() ? (
          <>
            <span className={`qa-dest${scheduled ? ' is-scheduled' : ''}`}>
              <Icon name={scheduled ? 'clock' : 'inbox'} size={14} />
              {scheduled ? `${dayName(p.date!)} · ${formatTime(p.start!, use24h)}–${formatTime(p.start! + (p.duration ?? 60), use24h)}` : p.date ? `Inbox · due ${dueName(p.date)}` : 'Inbox'}
            </span>
            <span className="qa-title">{p.title || <em>Add a title</em>}</span>
            <span className="qa-chips">
              <span className="chip">{formatDuration(p.duration ?? (scheduled ? 60 : 30))}</span>
              {p.priority > 0 && <span className={`chip prio--${p.priority}`}>{PRIORITY_LABEL[p.priority as Priority]} priority</span>}
              {p.category && (
                <span className="chip chip--cat" data-cat={p.category}>
                  {CATEGORIES.find((c) => c.id === p.category)?.name}
                </span>
              )}
              {p.repeat !== 'none' && scheduled && (
                <span className="chip">
                  <Icon name="repeat" size={12} /> {REPEAT_LABEL[p.repeat as Repeat]}
                </span>
              )}
            </span>
          </>
        ) : (
          <div className="qa-help">
            <p className="qa-help-title">Type naturally — times, dates and tags are picked up as you go.</p>
            <ul className="qa-examples">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button type="button" className="qa-example" onClick={() => setText(ex)}>
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
            <p className="qa-legend">
              Understands: <code>9am</code> <code>2-3:30pm</code> <code>45m</code> <code>tomorrow</code> <code>fri</code> <code>!!</code> <code>#health</code> <code>daily</code>
            </p>
          </div>
        )}
      </div>

      <div className="qa-foot">
        <label className="toggle-inline">
          <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} /> Keep open to add more
        </label>
        <span className="qa-keys">
          <kbd>↵</kbd> add <kbd>⇧↵</kbd> another <kbd>esc</kbd> close
        </span>
        <button
          type="submit"
          className="btn btn--primary btn--sm qa-submit"
          disabled={!text.trim()}
          data-testid="quickadd-submit"
          // Don't take focus from the input: on a phone that would close the keyboard after every add.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {multi ? `Add ${items.length}` : 'Add'}
        </button>
      </div>
    </form>
  );
}
