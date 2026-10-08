import { useMemo, useState } from 'react';
import { usePlanner } from '../state';
import { usePlanActions } from '../actions';
import { parseQuickAdd } from '../lib/parse';
import { CATEGORIES, PRIORITY_LABEL, REPEAT_LABEL, type Priority, type Repeat } from '../lib/model';
import { formatDuration, formatTime, monthDay, relativeDayName, diffDays } from '../lib/time';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

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
  const { use24h } = data.settings;
  const scheduled = p.start !== null;

  const dayName = (d: string) => (Math.abs(diffDays(d, today)) <= 1 ? relativeDayName(d, today) : `${relativeDayName(d, today)}, ${monthDay(d)}`);

  const submit = (stay: boolean) => {
    const task = addFromText(text);
    if (!task) return;
    const where = task.start !== null ? `${dayName(task.date!)} at ${formatTime(task.start, use24h)}` : 'Inbox';
    toast(`Added “${task.title}” → ${where}`, {
      action: task.date ? { label: 'View', run: () => setSelected(task.date!) } : { label: 'Undo', run: undo },
    });
    setText('');
    if (!stay && !keepOpen) setPanel(null);
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
        <input
          autoFocus
          className="qa-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit(true);
            }
          }}
          placeholder="What’s next?  Try “Lunch with Mia 12:30 1h”"
          aria-label="Describe a task in plain words"
          aria-describedby="qa-preview"
          data-testid="quickadd-input"
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div id="qa-preview" className="qa-preview" aria-live="polite">
        {text.trim() ? (
          <>
            <span className={`qa-dest${scheduled ? ' is-scheduled' : ''}`}>
              <Icon name={scheduled ? 'clock' : 'inbox'} size={14} />
              {scheduled ? `${dayName(p.date!)} · ${formatTime(p.start!, use24h)}–${formatTime(p.start! + (p.duration ?? 60), use24h)}` : p.date ? `Inbox · due ${dayName(p.date)}` : 'Inbox'}
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
              <code>9am</code> <code>2-3:30pm</code> <code>45m</code> <code>tomorrow</code> <code>fri</code> <code>!!</code> <code>#health</code> <code>daily</code>
            </p>
          </div>
        )}
      </div>

      <div className="qa-foot">
        <label className="toggle-inline">
          <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} /> Keep open to add more
        </label>
        <span className="qa-keys">
          <kbd>↵</kbd> add <kbd>esc</kbd> close
        </span>
      </div>
    </form>
  );
}
